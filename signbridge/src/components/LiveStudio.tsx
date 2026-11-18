import { useEffect, useRef, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { useHandTracker } from '../lib/useHandTracker';
import {
  handShape,
  matchBuiltIn,
  extractFeatures,
  matchSaved,
  type CustomSign,
  BUILT_INS,
} from '../lib/signEngine';
import BrandLogo from './BrandLogo';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const WINDOW_SIZE = 30;
const HOLD_FRAMES = 14;
const COOLDOWN_MS = 2200;
const STORE_KEY = 'signbridge-custom-v1';

type Props = {
  user: User;
  role: 'signer' | 'speaker';
  onLogout: () => void;
};

type Tab = 'live' | 'train' | 'guide' | 'stats';

function loadCustom(): CustomSign[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data)
      ? data.map((s: any) => ({
          ...s,
          samples: (s.samples || []).map((sample: number[][]) =>
            sample.map((frame: number[]) => Float32Array.from(frame))
          ),
        }))
      : [];
  } catch {
    return [];
  }
}

function saveCustom(signs: CustomSign[]) {
  try {
    const serializable = signs.map((s) => ({
      ...s,
      samples: s.samples.map((sample) => sample.map((f) => Array.from(f))),
    }));
    localStorage.setItem(STORE_KEY, JSON.stringify(serializable));
  } catch {}
}

export default function LiveStudio({ user, role, onLogout }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const { status: trackerStatus, error: trackerError, init, detect } = useHandTracker();

  const [tab, setTab] = useState<Tab>('live');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveWord, setLiveWord] = useState('—');
  const [liveSub, setLiveSub] = useState('Start camera');
  const [phrase, setPhrase] = useState<string[]>([]);
  const [handCount, setHandCount] = useState(0);
  const [holdPct, setHoldPct] = useState(0);
  const [customSigns, setCustomSigns] = useState<CustomSign[]>(() => loadCustom());
  const [roomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase() || `SB-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  });
  const [wsStatus, setWsStatus] = useState<'off' | 'connecting' | 'live'>('off');
  const [messages, setMessages] = useState<{ id: string; text: string; kind: string; senderName: string }[]>([]);
  const [micListening, setMicListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [trainWord, setTrainWord] = useState('');
  const [trainCategory, setTrainCategory] = useState('general');
  const [recording, setRecording] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);

  const currentSignRef = useRef<CustomSign | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const historyRef = useRef<{ x: number; y: number; shape: string }[]>([]);
  const candidateRef = useRef<{ id: string; count: number } | null>(null);
  const lastAcceptRef = useRef({ word: '', time: 0 });
  const tempSamplesRef = useRef<Float32Array[]>([]);
  const loopOnRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(`c-${Math.random().toString(36).slice(2, 10)}`);
  const recognitionRef = useRef<any>(null);
  const customSignsRef = useRef(customSigns);
  customSignsRef.current = customSigns;

  const appendPhrase = useCallback((word: string) => {
    setPhrase((p) => [...p, word].slice(-8));
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  }, []);

  const accept = useCallback(
    (word: string, confidence: number, source: string) => {
      const now = Date.now();
      setLiveWord(word);
      setLiveSub(`${source} · ${Math.round(confidence * 100)}%`);
      if (word !== lastAcceptRef.current.word || now - lastAcceptRef.current.time > COOLDOWN_MS) {
        lastAcceptRef.current = { word, time: now };
        appendPhrase(word);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'message:send',
              id: `m-${now}-${Math.random().toString(36).slice(2, 6)}`,
              kind: 'sign',
              text: word,
              confidence,
              source: source.includes('Saved') ? 'trained' : 'builtin',
            })
          );
        }
      }
    },
    [appendPhrase]
  );

  const drawHands = useCallback((result: any) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const hands = result?.landmarks || [];
    setHandCount(hands.length);
    for (const hand of hands) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(34, 229, 255, 0.9)';
      ctx.beginPath();
      for (const [s, e] of CONNECTIONS) {
        if (!hand[s] || !hand[e]) continue;
        ctx.moveTo(hand[s].x * w, hand[s].y * h);
        ctx.lineTo(hand[e].x * w, hand[e].y * h);
      }
      ctx.stroke();
      for (let i = 0; i < hand.length; i++) {
        const p = hand[i];
        ctx.fillStyle = i === 0 ? '#f59e0b' : 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, i === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, []);

  const loop = useCallback(() => {
    if (!loopOnRef.current) return;
    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      const result = detect(video);
      if (result) {
        drawHands(result);
        const hand = result.landmarks?.[0];
        const features = hand ? extractFeatures(hand) : null;
        if (features) {
          bufferRef.current.push(features);
          if (bufferRef.current.length > WINDOW_SIZE * 2) bufferRef.current.shift();
        }

        if (recording && features) {
          tempSamplesRef.current.push(features);
          if (tempSamplesRef.current.length >= WINDOW_SIZE) {
            setRecording(false);
            const sign = currentSignRef.current;
            if (sign) {
              sign.samples.push([...tempSamplesRef.current]);
              if (sign.samples.length > 12) sign.samples.shift();
              setCustomSigns((prev) => {
                const exists = prev.find((s) => s.id === sign.id);
                const next = exists
                  ? prev.map((s) => (s.id === sign.id ? { ...sign } : s))
                  : [...prev, { ...sign }];
                saveCustom(next);
                return next;
              });
              setSampleCount(sign.samples.length);
            }
            tempSamplesRef.current = [];
            bufferRef.current = [];
          }
        }

        if (!recording && hand) {
          const shape = handShape(hand);
          historyRef.current.push({ x: hand[0].x, y: hand[0].y, shape });
          if (historyRef.current.length > 24) historyRef.current.shift();

          if (features && bufferRef.current.length >= WINDOW_SIZE && customSignsRef.current.length) {
            const saved = matchSaved(bufferRef.current.slice(-WINDOW_SIZE), customSignsRef.current);
            if (saved) {
              accept(saved.word, saved.confidence, 'Saved sign');
              candidateRef.current = null;
              setHoldPct(0);
              requestAnimationFrame(loop);
              return;
            }
          }

          const gesture = matchBuiltIn(shape, historyRef.current);
          if (!gesture) {
            candidateRef.current = null;
            setHoldPct(0);
            setLiveWord('—');
            setLiveSub(shape === 'other' ? 'Show a clear hand shape' : 'Hold the gesture');
          } else {
            if (candidateRef.current?.id === gesture.id) candidateRef.current.count += 1;
            else candidateRef.current = { id: gesture.id, count: 1 };
            const progress = Math.min(1, candidateRef.current.count / HOLD_FRAMES);
            setHoldPct(progress * 100);
            setLiveWord(gesture.urdu);
            setLiveSub(`${gesture.english} · hold ${Math.round(progress * 100)}%`);
            if (candidateRef.current.count >= HOLD_FRAMES) {
              accept(gesture.urdu, 1, 'Built-in');
              candidateRef.current = null;
              setHoldPct(0);
            }
          }
        } else if (!hand) {
          setLiveWord('—');
          setLiveSub('Show a gesture');
          setHoldPct(0);
        }
      }
    }
    requestAnimationFrame(loop);
  }, [detect, drawHands, recording, accept]);

  async function startCamera() {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Open via http://localhost or https (not file://)');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      await init();
      loopOnRef.current = true;
      requestAnimationFrame(loop);
    } catch (e: any) {
      console.error(e);
      setCameraError(e?.message || 'Camera error');
      setCameraOn(false);
    }
  }

  function stopCamera() {
    loopOnRef.current = false;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  function flipCamera() {
    stopCamera();
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
    setTimeout(() => startCamera(), 350);
  }

  function connectRoom() {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
    }
    setWsStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'room:join',
          roomCode,
          clientId: clientIdRef.current,
          uid: user.uid,
          displayName: user.displayName || 'User',
          role,
        })
      );
      setWsStatus('live');
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'room:state') setMessages(data.messages || []);
        else if (data.type === 'message:added') setMessages((m) => [...m.slice(-60), data.message]);
        else if (data.type === 'speech:interim') setHeard(data.text || '');
      } catch {}
    };
    ws.onclose = () => setWsStatus('off');
    ws.onerror = () => setWsStatus('off');
  }

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setHeard('Speech recognition needs Chrome / Edge');
      return;
    }
    if (micListening) {
      recognitionRef.current?.stop();
      setMicListening(false);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let text = '';
      for (const r of e.results) text += r[0].transcript;
      setHeard(text);
      if (e.results[0].isFinal && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'message:send',
            id: `s-${Date.now()}`,
            kind: 'speech',
            text,
            source: 'speech',
          })
        );
        setPhrase((p) => [...p, text].slice(-8));
      }
    };
    rec.onend = () => setMicListening(false);
    rec.onerror = () => setMicListening(false);
    setMicListening(true);
    rec.start();
  }

  function startTrain() {
    const word = trainWord.trim();
    if (!word) return;
    let sign = customSigns.find((s) => s.urdu === word);
    if (!sign) {
      sign = {
        id: crypto.randomUUID?.() || String(Date.now()),
        urdu: word,
        english: word,
        category: trainCategory,
        samples: [],
      };
    }
    currentSignRef.current = sign;
    setSampleCount(sign.samples.length);
    tempSamplesRef.current = [];
    bufferRef.current = [];
    setRecording(true);
  }

  function copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    navigator.clipboard?.writeText(url).then(() => alert('Invite link copied:\n' + url));
  }

  useEffect(() => {
    connectRoom();
    return () => {
      loopOnRef.current = false;
      try { wsRef.current?.close(); } catch {}
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phraseText = phrase.join(' ') || 'Translation appears here';

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200/80 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BrandLogo size={40} />
          <div>
            <div className="font-extrabold text-lg leading-tight">SignBridge</div>
            <div className="text-xs text-slate-500">{user.displayName || 'User'} · {role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`status-pill ${cameraOn && trackerStatus === 'ready' ? 'live' : ''}`}>
            <span className="pulse" />
            {cameraOn
              ? trackerStatus === 'ready'
                ? 'Listening'
                : trackerStatus === 'loading'
                  ? 'Loading model…'
                  : trackerError || 'Camera on'
              : 'Camera off'}
          </span>
          <span className={`status-pill ${wsStatus === 'live' ? 'live' : ''}`}>
            <span className="pulse" />
            {roomCode} · {wsStatus}
          </span>
          <button className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-2" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid lg:grid-cols-2 gap-5">
        <section className="glass-card p-4 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-extrabold text-xl">Signer camera</h2>
              <p className="text-sm text-slate-500">On-device MediaPipe hand tracking</p>
            </div>
            <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded-full">
              {handCount} hand{handCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="camera-stage">
            <video ref={videoRef} id="video" playsInline muted />
            <canvas ref={overlayRef} id="overlay" />
            {!cameraOn && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900/90 text-white p-6 text-center">
                <div className="text-4xl">👋</div>
                <h3 className="font-bold text-lg">Enable camera to start</h3>
                {cameraError && <p className="text-sm text-red-300">{cameraError}</p>}
                <button className="cta" onClick={startCamera}>Start camera</button>
              </div>
            )}
            <div className="absolute left-3 bottom-3 z-10 min-w-[180px] rounded-2xl bg-white/95 border border-slate-200 p-3 shadow-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600">Live</div>
              <div className="text-2xl font-extrabold leading-tight">{liveWord}</div>
              <div className="text-xs text-slate-500">{liveSub}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
                  style={{ width: `${holdPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!cameraOn ? (
              <button className="cta" onClick={startCamera}>Start camera</button>
            ) : (
              <>
                <button className="cta" onClick={stopCamera}>Stop</button>
                <button className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-sm bg-white" onClick={flipCamera}>
                  Flip camera
                </button>
              </>
            )}
            <button className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-sm bg-white" onClick={copyInvite}>
              Copy invite
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Translation</span>
              <button className="text-sky-600" onClick={() => setPhrase([])}>Clear</button>
            </div>
            <div className="min-h-[88px] rounded-2xl bg-gradient-to-br from-cyan-50 to-violet-50 border border-cyan-100 p-4 text-2xl font-bold">
              {phraseText}
            </div>
            <button
              className="cta w-full"
              disabled={!phrase.length}
              onClick={() => {
                if ('speechSynthesis' in window && phrase.length) {
                  const u = new SpeechSynthesisUtterance(phrase.join(' '));
                  u.lang = 'en-US';
                  speechSynthesis.speak(u);
                }
              }}
            >
              Speak phrase
            </button>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Listener mic / quick replies</div>
            <div className="min-h-[56px] rounded-xl bg-amber-50 border border-amber-100 p-3 text-lg font-semibold text-amber-900">
              {heard || 'Speak or send a quick reply…'}
            </div>
            <button
              className={`px-4 py-2 rounded-full font-bold text-sm border ${
                micListening ? 'bg-amber-400 border-amber-500' : 'bg-white border-slate-200'
              }`}
              onClick={toggleMic}
            >
              {micListening ? 'Stop mic' : '🎤 Speak'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {['Hello', 'Thank you', 'Yes', 'No', 'Wait', 'Help', 'OK', 'Please'].map((t) => (
                <button
                  key={t}
                  className="text-left px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold hover:border-sky-400"
                  onClick={() => {
                    setHeard(t);
                    appendPhrase(t);
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(
                        JSON.stringify({
                          type: 'message:send',
                          id: `q-${Date.now()}`,
                          kind: 'quick_reply',
                          text: t,
                          source: 'speech',
                        })
                      );
                    }
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Room feed</div>
            <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
              {messages.length === 0 && <p className="text-slate-400">No messages yet — share invite link</p>}
              {messages.slice(-12).map((m) => (
                <div key={m.id} className="flex gap-2">
                  <span className="font-bold text-sky-700 shrink-0">{m.senderName}:</span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {tab === 'train' && (
        <div className="fixed inset-x-0 bottom-20 z-20 max-w-lg mx-auto p-4">
          <div className="glass-card p-5 space-y-3 shadow-2xl">
            <h3 className="font-extrabold text-lg">Train custom sign</h3>
            <input
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
              placeholder="Meaning (e.g. Chai)"
              value={trainWord}
              onChange={(e) => setTrainWord(e.target.value)}
            />
            <select
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
              value={trainCategory}
              onChange={(e) => setTrainCategory(e.target.value)}
            >
              <option value="general">General</option>
              <option value="medical">Medical</option>
              <option value="food">Food</option>
              <option value="family">Family</option>
            </select>
            <p className="text-sm text-slate-500">
              Samples: {sampleCount} / 12 · Hold sign steady ~1s while recording
            </p>
            <button
              className="cta w-full"
              disabled={!trainWord.trim() || recording || !cameraOn}
              onClick={startTrain}
            >
              {recording ? 'Recording…' : 'Record sample'}
            </button>
          </div>
        </div>
      )}

      {tab === 'guide' && (
        <div className="fixed inset-x-0 bottom-20 z-20 max-w-2xl mx-auto p-4 max-h-[55vh] overflow-y-auto">
          <div className="glass-card p-5">
            <h3 className="font-extrabold text-lg mb-3">Built-in gestures ({BUILT_INS.length})</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {BUILT_INS.map((g) => (
                <div key={g.id} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="font-extrabold">{g.urdu}</div>
                  <div className="text-xs font-bold text-sky-600">{g.english}</div>
                  <div className="text-xs text-slate-500 mt-1">{g.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <div className="fixed inset-x-0 bottom-20 z-20 max-w-lg mx-auto p-4">
          <div className="glass-card p-5 space-y-2">
            <h3 className="font-extrabold text-lg">Session</h3>
            <p className="text-sm">Custom signs trained: <b>{customSigns.length}</b></p>
            <p className="text-sm">Phrase words: <b>{phrase.length}</b></p>
            <p className="text-sm">Room: <b>{roomCode}</b></p>
            <p className="text-sm text-slate-500">Share the invite link to open a second browser as Listener.</p>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {([
            ['live', 'Live'],
            ['train', 'Train'],
            ['guide', 'Guide'],
            ['stats', 'Stats'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`py-3.5 text-sm font-bold ${tab === id ? 'text-sky-600' : 'text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
