import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

const MP_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.14',
];

const MODEL_SOURCES = [
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
];

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms)),
  ]);
}

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useHandTracker() {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const lastVideoTime = useRef(-1);

  const init = useCallback(async () => {
    if (landmarkerRef.current) {
      setStatus('ready');
      return;
    }
    setStatus('loading');
    setError(null);
    let lastErr: unknown;
    for (const base of MP_SOURCES) {
      try {
        const vision = await withTimeout(FilesetResolver.forVisionTasks(`${base}/wasm`), 30000, 'MediaPipe WASM');
        for (const modelPath of MODEL_SOURCES) {
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              const lm = await withTimeout(
                HandLandmarker.createFromOptions(vision, {
                  baseOptions: { modelAssetPath: modelPath, delegate },
                  runningMode: 'VIDEO',
                  numHands: 2,
                }),
                45000,
                'Hand model'
              );
              landmarkerRef.current = lm;
              setStatus('ready');
              return;
            } catch (e) {
              lastErr = e;
              console.warn('Model attempt failed', modelPath, delegate, e);
            }
          }
        }
      } catch (e) {
        lastErr = e;
        console.warn('MediaPipe source failed', base, e);
      }
    }
    setStatus('error');
    setError(lastErr instanceof Error ? lastErr.message : 'Failed to load hand model');
  }, []);

  const detect = useCallback((video: HTMLVideoElement): HandLandmarkerResult | null => {
    const lm = landmarkerRef.current;
    if (!lm || video.readyState < 2) return null;
    if (video.currentTime === lastVideoTime.current) return null;
    lastVideoTime.current = video.currentTime;
    try {
      return lm.detectForVideo(video, performance.now());
    } catch (e) {
      console.error('detect error', e);
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        landmarkerRef.current?.close();
      } catch {}
      landmarkerRef.current = null;
    };
  }, []);

  return { status, error, init, detect };
}
