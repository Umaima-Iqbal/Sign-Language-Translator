export type Landmark = { x: number; y: number; z?: number };

export const BUILT_INS = [
  { id: 'love', urdu: 'I love you', english: 'I love you', shape: 'love', motion: 'hold', hint: 'Thumb, index and pinky out; middle and ring down' },
  { id: 'call', urdu: 'Call me', english: 'Call me', shape: 'call', motion: 'hold', hint: 'Thumb and pinky out like a phone' },
  { id: 'water', urdu: 'Water', english: 'Water', shape: 'three', motion: 'hold', hint: 'Index, middle and ring up; pinky and thumb down' },
  { id: 'hello', urdu: 'Hello', english: 'Hello', shape: 'open_palm', motion: 'wave', hint: 'Open palm and wave left-right' },
  { id: 'yes', urdu: 'Yes', english: 'Yes', shape: 'thumbs_up', motion: 'hold', hint: 'Thumb up, other fingers closed' },
  { id: 'no', urdu: 'No', english: 'No', shape: 'thumbs_down', motion: 'hold', hint: 'Thumb down, other fingers closed' },
  { id: 'wait', urdu: 'Wait', english: 'Wait', shape: 'fist', motion: 'hold', hint: 'Closed fist' },
  { id: 'thank_you', urdu: 'Thank you', english: 'Thank you', shape: 'peace', motion: 'hold', hint: 'Index and middle finger up' },
  { id: 'help', urdu: 'Help', english: 'Help', shape: 'point_up', motion: 'hold', hint: 'Point upward with index finger' },
  { id: 'price', urdu: 'Price', english: 'Price', shape: 'pinch', motion: 'hold', hint: 'Touch thumb and index fingertips' },
  { id: 'stop', urdu: 'Stop', english: 'Stop', shape: 'open_palm', motion: 'still', hint: 'Hold open palm still' },
  { id: 'ok', urdu: 'OK', english: 'OK', shape: 'ok', motion: 'hold', hint: 'Thumb and index form a circle' },
  { id: 'please', urdu: 'Please', english: 'Please', shape: 'open_palm', motion: 'hold', hint: 'Open palm facing out' },
  { id: 'sorry', urdu: 'Sorry', english: 'Sorry', shape: 'fist', motion: 'hold', hint: 'Closed fist (chest area)' },
  { id: 'more', urdu: 'More', english: 'More', shape: 'pinch', motion: 'hold', hint: 'Fingertips together' },
  { id: 'eat', urdu: 'Eat', english: 'Eat', shape: 'pinch', motion: 'hold', hint: 'Pinch near mouth' },
  { id: 'drink', urdu: 'Drink', english: 'Drink', shape: 'call', motion: 'hold', hint: 'Thumb + pinky cup shape' },
  { id: 'bathroom', urdu: 'Bathroom', english: 'Bathroom', shape: 'point_up', motion: 'hold', hint: 'Index finger up' },
  { id: 'pain', urdu: 'Pain', english: 'Pain', shape: 'fist', motion: 'hold', hint: 'Clenched fist' },
  { id: 'doctor', urdu: 'Doctor', english: 'Doctor', shape: 'point_up', motion: 'hold', hint: 'Point upward' },
  { id: 'one', urdu: 'One', english: 'One', shape: 'point_up', motion: 'hold', hint: 'Index only' },
  { id: 'two', urdu: 'Two', english: 'Two', shape: 'peace', motion: 'hold', hint: 'Index + middle' },
  { id: 'three', urdu: 'Three', english: 'Three', shape: 'three', motion: 'hold', hint: 'Index + middle + ring' },
  { id: 'four', urdu: 'Four', english: 'Four', shape: 'open_palm', motion: 'hold', hint: 'Four fingers' },
  { id: 'five', urdu: 'Five', english: 'Five', shape: 'open_palm', motion: 'hold', hint: 'All five fingers' },
  { id: 'goodbye', urdu: 'Goodbye', english: 'Goodbye', shape: 'open_palm', motion: 'wave', hint: 'Wave open palm' },
] as const;

export type BuiltIn = (typeof BUILT_INS)[number];

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

export function fingerStates(lm: Landmark[]) {
  const wrist = lm[0];
  const pairs: [number, number, number][] = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
  const states = pairs.map(([mcp, pip, tip]) => distance(lm[tip], wrist) > distance(lm[pip], wrist) * 1.08);
  const thumb = distance(lm[4], lm[17]) > distance(lm[3], lm[17]) * 1.15;
  return { index: states[0], middle: states[1], ring: states[2], pinky: states[3], thumb };
}

export function handShape(lm: Landmark[]): string {
  const f = fingerStates(lm);
  const count = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
  const pinch = distance(lm[4], lm[8]) < distance(lm[0], lm[9]) * 0.38;
  const ok = distance(lm[4], lm[8]) < distance(lm[0], lm[9]) * 0.32 && f.middle && f.ring && f.pinky;

  if (ok) return 'ok';
  if (pinch && f.middle && f.ring && f.pinky) return 'pinch';
  if (count === 4 && f.thumb) return 'open_palm';
  if (f.thumb && f.index && f.pinky && !f.middle && !f.ring) return 'love';
  if (f.thumb && f.pinky && !f.index && !f.middle && !f.ring) return 'call';
  if (f.index && f.middle && f.ring && !f.pinky && !f.thumb) return 'three';
  if (count === 0 && f.thumb) return lm[4].y < lm[0].y ? 'thumbs_up' : 'thumbs_down';
  if (count === 0) return 'fist';
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (f.index && !f.middle && !f.ring && !f.pinky) return 'point_up';
  return 'other';
}

export function isWave(history: { x: number; y: number; shape: string }[]) {
  if (history.length < 12) return false;
  const xs = history.slice(-14).map((i) => i.x);
  const range = Math.max(...xs) - Math.min(...xs);
  let changes = 0;
  for (let i = 2; i < xs.length; i++) {
    const a = xs[i - 2] - xs[i - 1];
    const b = xs[i - 1] - xs[i];
    if (a * b < 0 && Math.abs(xs[i] - xs[i - 2]) > 0.035) changes++;
  }
  return changes >= 2 && range > 0.09;
}

export function isStill(history: { x: number; y: number }[]) {
  if (history.length < 10) return true;
  const xs = history.slice(-10).map((i) => i.x);
  const ys = history.slice(-10).map((i) => i.y);
  const r = (v: number[]) => Math.max(...v) - Math.min(...v);
  return r(xs) < 0.035 && r(ys) < 0.035;
}

export function matchBuiltIn(shape: string, history: { x: number; y: number; shape: string }[]): BuiltIn | null {
  for (const g of BUILT_INS) {
    if (g.shape !== shape) continue;
    if (g.motion === 'wave' && !isWave(history)) continue;
    if (g.motion === 'still' && !isStill(history)) continue;
    return g;
  }
  return null;
}

export function extractFeatures(lm: Landmark[]): Float32Array | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const middle = lm[9];
  const scale = distance(wrist, middle) || 0.000001;
  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    out[i * 3] = (lm[i].x - wrist.x) / scale;
    out[i * 3 + 1] = (lm[i].y - wrist.y) / scale;
    out[i * 3 + 2] = ((lm[i].z || 0) - (wrist.z || 0)) / scale;
  }
  return out;
}

export function sequenceDistance(a: Float32Array[], b: Float32Array[]) {
  const len = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let j = 0; j < a[i].length; j++) {
      const d = a[i][j] - b[i][j];
      s += d * d;
    }
    total += Math.sqrt(s);
  }
  return total / Math.max(1, len);
}

export type CustomSign = {
  id: string;
  urdu: string;
  english: string;
  category: string;
  samples: Float32Array[][];
};

export function matchSaved(sequence: Float32Array[], signs: CustomSign[]) {
  let best: { sign: CustomSign; distance: number } | null = null;
  for (const sign of signs) {
    for (const sample of sign.samples) {
      if (!sample || sample.length < 20) continue;
      const dist = sequenceDistance(sequence, sample);
      if (!best || dist < best.distance) best = { sign, distance: dist };
    }
  }
  if (!best || best.distance > 1.75) return null;
  const confidence = Math.max(0, Math.min(1, 1 - best.distance / 2.3));
  if (confidence < 0.55) return null;
  return { word: best.sign.urdu, english: best.sign.english, confidence };
}
