import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type UserRole = 'signer' | 'speaker';

interface Participant {
  clientId: string;
  uid: string;
  displayName: string;
  role: UserRole;
  joinedAt: number;
}

interface RoomMessage {
  id: string;
  senderClientId: string;
  senderName: string;
  senderRole: UserRole;
  kind: 'sign' | 'speech' | 'quick_reply';
  text: string;
  urduLabel?: string;
  confidence?: number;
  source?: 'builtin' | 'trained' | 'speech';
  latencyMs?: number;
  signTokens?: string[];
  timestamp: number;
}

interface RoomAnalytics {
  totalMessages: number;
  signCount: number;
  speechCount: number;
  avgConfidence: number;
  avgLatencyMs: number;
  signFrequency: Record<string, number>;
}

interface RoomState {
  roomCode: string;
  clients: Map<string, { ws: WebSocket; participant: Participant }>;
  messages: RoomMessage[];
  analytics: RoomAnalytics;
  confidenceSum: number;
  confidenceCount: number;
  latencySum: number;
  latencyCount: number;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomCode: string): RoomState {
  const normalized = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  let room = rooms.get(normalized);
  if (!room) {
    room = {
      roomCode: normalized,
      clients: new Map(),
      messages: [],
      analytics: {
        totalMessages: 0,
        signCount: 0,
        speechCount: 0,
        avgConfidence: 0,
        avgLatencyMs: 0,
        signFrequency: {},
      },
      confidenceSum: 0,
      confidenceCount: 0,
      latencySum: 0,
      latencyCount: 0,
    };
    rooms.set(normalized, room);
  }
  return room;
}

function listParticipants(room: RoomState): Participant[] {
  return Array.from(room.clients.values()).map((c) => c.participant);
}

function broadcastToRoom(room: RoomState, payload: unknown, excludeClientId?: string) {
  const encoded = JSON.stringify(payload);
  for (const [cid, entry] of room.clients.entries()) {
    if (excludeClientId && cid === excludeClientId) continue;
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(encoded);
    }
  }
}

function sendToClient(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Serve MediaPipe WASM files locally so hand tracking starts reliably offline/in iframes
  app.use(
    '/mediapipe/wasm',
    express.static(path.join(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm'))
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      activeRooms: rooms.size,
      timestamp: Date.now(),
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let activeRoomCode: string | null = null;
    let activeClientId: string | null = null;

    ws.on('message', (raw) => {
      let data: Record<string, any>;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(data.type || '');

      if (type === 'room:join') {
        const roomCode = String(data.roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        const clientId = String(data.clientId || '').trim().slice(0, 64);
        const uid = String(data.uid || '').trim().slice(0, 128);
        const displayName = String(data.displayName || 'Participant').trim().slice(0, 80);
        const role: UserRole = data.role === 'speaker' ? 'speaker' : 'signer';

        if (!roomCode || !clientId || !uid) return;

        // Leave previous room if switching
        if (activeRoomCode && activeClientId) {
          const prevRoom = rooms.get(activeRoomCode);
          if (prevRoom) {
            prevRoom.clients.delete(activeClientId);
            broadcastToRoom(prevRoom, {
              type: 'room:presence',
              participants: listParticipants(prevRoom),
            });
          }
        }

        const room = getOrCreateRoom(roomCode);
        activeRoomCode = room.roomCode;
        activeClientId = clientId;

        const participant: Participant = {
          clientId,
          uid,
          displayName,
          role,
          joinedAt: Date.now(),
        };

        room.clients.set(clientId, { ws, participant });

        // Send full authoritative initial state to joining client
        sendToClient(ws, {
          type: 'room:state',
          roomCode: room.roomCode,
          participants: listParticipants(room),
          messages: room.messages.slice(-80),
          analytics: room.analytics,
        });

        // Notify everyone else of presence update
        broadcastToRoom(
          room,
          {
            type: 'room:presence',
            participants: listParticipants(room),
          },
          clientId
        );
        return;
      }

      if (!activeRoomCode || !activeClientId) return;
      const room = rooms.get(activeRoomCode);
      if (!room) return;
      const entry = room.clients.get(activeClientId);
      if (!entry) return;

      if (type === 'role:switch') {
        const nextRole: UserRole = data.role === 'speaker' ? 'speaker' : 'signer';
        entry.participant.role = nextRole;
        broadcastToRoom(room, {
          type: 'room:presence',
          participants: listParticipants(room),
        });
        return;
      }

      if (type === 'message:send') {
        const msgId = String(data.id || '').slice(0, 80);
        const text = String(data.text || '').trim().slice(0, 300);
        if (!msgId || !text) return;

        // Idempotency guard against duplicate deliveries
        if (room.messages.some((m) => m.id === msgId)) return;

        const kind: RoomMessage['kind'] =
          data.kind === 'speech' || data.kind === 'quick_reply' ? data.kind : 'sign';

        const confidence =
          typeof data.confidence === 'number'
            ? Math.max(0, Math.min(1, data.confidence))
            : undefined;
        const latencyMs =
          typeof data.latencyMs === 'number'
            ? Math.max(0, Math.min(60000, data.latencyMs))
            : undefined;

        const message: RoomMessage = {
          id: msgId,
          senderClientId: activeClientId,
          senderName: entry.participant.displayName,
          senderRole: entry.participant.role,
          kind,
          text,
          urduLabel: typeof data.urduLabel === 'string' ? data.urduLabel.slice(0, 120) : undefined,
          confidence,
          source:
            data.source === 'trained' || data.source === 'speech' ? data.source : 'builtin',
          latencyMs,
          signTokens: Array.isArray(data.signTokens)
            ? data.signTokens.slice(0, 16).map((t: unknown) => String(t).slice(0, 40))
            : undefined,
          timestamp: Date.now(),
        };

        room.messages.push(message);
        if (room.messages.length > 200) {
          room.messages.shift();
        }

        // Update authoritative server-side analytics
        room.analytics.totalMessages += 1;
        if (kind === 'sign') {
          room.analytics.signCount += 1;
          room.analytics.signFrequency[text] = (room.analytics.signFrequency[text] || 0) + 1;
        } else {
          room.analytics.speechCount += 1;
        }

        if (typeof confidence === 'number') {
          room.confidenceSum += confidence;
          room.confidenceCount += 1;
          room.analytics.avgConfidence = Number(
            (room.confidenceSum / room.confidenceCount).toFixed(4)
          );
        }

        if (typeof latencyMs === 'number') {
          room.latencySum += latencyMs;
          room.latencyCount += 1;
          room.analytics.avgLatencyMs = Math.round(room.latencySum / room.latencyCount);
        }

        broadcastToRoom(room, {
          type: 'message:added',
          message,
          analytics: room.analytics,
        });
        return;
      }

      if (type === 'speech:interim') {
        const text = String(data.text || '').slice(0, 300);
        broadcastToRoom(
          room,
          {
            type: 'speech:interim',
            senderClientId: activeClientId,
            senderName: entry.participant.displayName,
            text,
            timestamp: Date.now(),
          },
          activeClientId
        );
        return;
      }

      if (type === 'landmarks:frame') {
        if (!Array.isArray(data.hands)) return;
        broadcastToRoom(
          room,
          {
            type: 'landmarks:frame',
            senderClientId: activeClientId,
            senderRole: entry.participant.role,
            hands: data.hands.slice(0, 2),
            detectedWord: typeof data.detectedWord === 'string' ? data.detectedWord.slice(0, 80) : '',
            timestamp: Date.now(),
          },
          activeClientId
        );
        return;
      }

      if (type === 'webrtc:signal') {
        const targetClientId = String(data.targetClientId || '');
        const target = room.clients.get(targetClientId);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          sendToClient(target.ws, {
            type: 'webrtc:signal',
            fromClientId: activeClientId,
            signal: data.signal,
          });
        }
        return;
      }
    });

    ws.on('close', () => {
      if (!activeRoomCode || !activeClientId) return;
      const room = rooms.get(activeRoomCode);
      if (!room) return;
      room.clients.delete(activeClientId);
      if (room.clients.size === 0) {
        // Keep room messages/analytics cached briefly for reconnects, or clean up if empty > 30m
        setTimeout(() => {
          const current = rooms.get(activeRoomCode!);
          if (current && current.clients.size === 0) {
            rooms.delete(activeRoomCode!);
          }
        }, 30 * 60 * 1000);
      } else {
        broadcastToRoom(room, {
          type: 'room:presence',
          participants: listParticipants(room),
        });
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SignBridge server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
