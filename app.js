let FilesetResolver, HandLandmarker;

try {
  ({ FilesetResolver, HandLandmarker } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
  ));
} catch (error) {
  console.error("MediaPipe import failed:", error);
  document.getElementById("statusText").textContent =
    "MediaPipe could not load. Check internet connection.";
}

/* ---------- DOM ---------- */
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const cameraVeil = document.getElementById("cameraVeil");
const startCamera = document.getElementById("startCamera");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const liveWord = document.getElementById("liveWord");
const liveConfidence = document.getElementById("liveConfidence");
const holdFill = document.getElementById("holdFill");
const handCount = document.getElementById("handCount");
const recordSample = document.getElementById("recordSample");
const clearBuffer = document.getElementById("clearBuffer");
const bufferFill = document.getElementById("bufferFill");
const bufferCount = document.getElementById("bufferCount");
const urduOutput = document.getElementById("urduOutput");
const speakButton = document.getElementById("speakButton");
const clearPhrase = document.getElementById("clearPhrase");
const heardOutput = document.getElementById("heardOutput");
const micButton = document.getElementById("micButton");
const micLabel = document.getElementById("micLabel");
const quickReplies = document.getElementById("quickReplies");
const teachDrawer = document.getElementById("teachDrawer");
const guideDrawer = document.getElementById("guideDrawer");
const teachForm = document.getElementById("teachForm");
const urduWord = document.getElementById("urduWord");
const englishWord = document.getElementById("englishWord");
const wordCategory = document.getElementById("wordCategory");
const teachStatus = document.getElementById("teachStatus");
const sampleStatus = document.getElementById("sampleStatus");
const gestureGuide = document.getElementById("gestureGuide");

/* ---------- Settings ---------- */
const WINDOW_SIZE = 30;
const HOLD_FRAMES = 16;
const RECOGNIZE_EVERY = 3;
const COOLDOWN_MS = 2400;
const STORE_KEY = "bol-psl-v3";

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [9,13],[13,17],[17,18],[18,19],[19,20],[0,17]
];

const BUILT_INS = [
  { id:"hello", urdu:"ہیلو", english:"Hello", shape:"open_palm", motion:"wave", hint:"Open palm and wave left-right" },
  { id:"yes", urdu:"جی ہاں", english:"Yes", shape:"thumbs_up", motion:"hold", hint:"Thumb up, other fingers closed" },
  { id:"no", urdu:"نہیں", english:"No", shape:"thumbs_down", motion:"hold", hint:"Thumb down, other fingers closed" },
  { id:"wait", urdu:"انتظار", english:"Wait", shape:"fist", motion:"hold", hint:"Closed fist" },
  { id:"thank_you", urdu:"شکریہ", english:"Thank you", shape:"peace", motion:"hold", hint:"Index and middle finger up" },
  { id:"help", urdu:"مدد", english:"Help", shape:"point_up", motion:"hold", hint:"Point upward with index finger" },
  { id:"price", urdu:"قیمت", english:"Price", shape:"pinch", motion:"hold", hint:"Touch thumb and index fingertips" },
  { id:"stop", urdu:"رکیں", english:"Stop", shape:"open_palm", motion:"still", hint:"Hold open palm still" }
];

/* ---------- State ---------- */
let landmarker = null;
let cameraOn = false;
let loopOn = false;
let lastTime = -1;
let frameNo = 0;

let buffer = [];
let tempSamples = [];
let recording = false;
let currentSign = null;

let phrase = [];
let lastOutput = { word:null, time:0 };
let gestureHistory = [];
let candidate = null;
let candidateCount = 0;
let recognitionOn = true;

let store = loadStore();

/* ---------- Storage ---------- */
function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    return data && Array.isArray(data.signs) ? data : { signs: [] };
  } catch {
    return { signs: [] };
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    setStatus("", "Storage blocked");
  }
}

/* ---------- UI helpers ---------- */
function setStatus(mode, text) {
  statusPill.className = "status-pill" + (mode ? " " + mode : "");
  statusText.textContent = text;
}

function setUrdu(text) {
  urduOutput.textContent = text || "یہاں اردو ظاہر ہوگی";
}

function setLive(word, subtitle) {
  liveWord.textContent = word;
  liveConfidence.textContent = subtitle;
}

/* ---------- Urdu speech ---------- */
function speakUrdu(text) {
  if (!text) return;

  setStatus("busy", "Speaking Urdu");

  if (!("speechSynthesis" in window)) {
    setStatus("live", "Voice unavailable");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ur-PK";
  utterance.rate = 0.95;
  utterance.onend = () => setStatus("live", "Listening");
  utterance.onerror = () => setStatus("live", "Voice unavailable");

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function appendPhrase(word) {
  phrase.push(word);

  if (phrase.length > 6) phrase.shift();

  setUrdu(phrase.join(" "));
  speakButton.disabled = false;
  speakUrdu(word);
}

/* ---------- Hand geometry ---------- */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function fingerStates(lm) {
  const wrist = lm[0];
  const pairs = [[5,6,8],[9,10,12],[13,14,16],[17,18,20]];
  const states = [];

  for (const [mcp, pip, tip] of pairs) {
    states.push(distance(lm[tip], wrist) > distance(lm[pip], wrist) * 1.08);
  }

  const thumb = distance(lm[4], lm[17]) > distance(lm[3], lm[17]) * 1.15;

  return {
    index: states[0],
    middle: states[1],
    ring: states[2],
    pinky: states[3],
    thumb
  };
}

function handShape(lm) {
  const f = fingerStates(lm);
  const count = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
  const pinch = distance(lm[4], lm[8]) < distance(lm[0], lm[9]) * 0.38;

  if (pinch && f.middle && f.ring && f.pinky) return "pinch";
  if (count === 4 && f.thumb) return "open_palm";

  if (count === 0 && f.thumb) {
    return lm[4].y < lm[0].y ? "thumbs_up" : "thumbs_down";
  }

  if (count === 0) return "fist";
  if (f.index && f.middle && !f.ring && !f.pinky) return "peace";
  if (f.index && !f.middle && !f.ring && !f.pinky) return "point_up";

  return "other";
}

function isWave(history) {
  if (history.length < 12) return false;

  const xs = history.slice(-14).map(item => item.x);
  const range = Math.max(...xs) - Math.min(...xs);
  let directionChanges = 0;

  for (let i = 2; i < xs.length; i++) {
    const first = xs[i - 2] - xs[i - 1];
    const second = xs[i - 1] - xs[i];

    if (first * second < 0 && Math.abs(xs[i] - xs[i - 2]) > 0.035) {
      directionChanges++;
    }
  }

  return directionChanges >= 2 && range > 0.09;
}

function isStill(history) {
  if (history.length < 10) return true;

  const xs = history.slice(-10).map(item => item.x);
  const ys = history.slice(-10).map(item => item.y);
  const range = values => Math.max(...values) - Math.min(...values);

  return range(xs) < 0.035 && range(ys) < 0.035;
}

function matchBuiltIn(shape, history) {
  for (const gesture of BUILT_INS) {
    if (gesture.shape !== shape) continue;

    if (gesture.motion === "wave" && !isWave(history)) continue;
    if (gesture.motion === "still" && !isStill(history)) continue;

    return gesture;
  }

  return null;
}

/* ---------- Saved PSL matching ---------- */
function extractFeatures(lm) {
  if (!lm || lm.length < 21) return null;

  const wrist = lm[0];
  const middle = lm[9];
  const scale = distance(wrist, middle) || 0.000001;
  const output = new Float32Array(63);

  for (let i = 0; i < 21; i++) {
    output[i * 3] = (lm[i].x - wrist.x) / scale;
    output[i * 3 + 1] = (lm[i].y - wrist.y) / scale;
    output[i * 3 + 2] = ((lm[i].z || 0) - wrist.z) / scale;
  }

  return output;
}

function sequenceDistance(a, b) {
  const length = Math.min(a.length, b.length);
  let total = 0;

  for (let i = 0; i < length; i++) {
    let frameSum = 0;

    for (let j = 0; j < a[i].length; j++) {
      const difference = a[i][j] - b[i][j];
      frameSum += difference * difference;
    }

    total += Math.sqrt(frameSum);
  }

  return total / Math.max(1, length);
}

function matchSaved(sequence) {
  let best = null;

  for (const sign of store.signs) {
    for (const sample of sign.samples) {
      if (!sample || sample.length < WINDOW_SIZE) continue;

      const distance = sequenceDistance(sequence, sample);

      if (!best || distance < best.distance) {
        best = { sign, distance };
      }
    }
  }

  if (!best || best.distance > 1.75) return null;

  const confidence = Math.max(0, Math.min(1, 1 - best.distance / 2.3));

  if (confidence < 0.6) return null;

  return { word: best.sign.urdu, confidence };
}

/* ---------- Drawing ---------- */
function resizeOverlay() {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;

  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
}

function drawHands(result) {
  resizeOverlay();
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const hands = result?.landmarks || [];
  handCount.textContent = hands.length + (hands.length === 1 ? " hand" : " hands");

  for (const hand of hands) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(63,224,196,.9)";
    ctx.beginPath();

    for (const [start, end] of CONNECTIONS) {
      if (!hand[start] || !hand[end]) continue;

      ctx.moveTo(hand[start].x * overlay.width, hand[start].y * overlay.height);
      ctx.lineTo(hand[end].x * overlay.width, hand[end].y * overlay.height);
    }

    ctx.stroke();

    for (let i = 0; i < hand.length; i++) {
      const point = hand[i];

      ctx.fillStyle = i === 0 ? "#f0b23f" : "rgba(244,238,224,.92)";
      ctx.beginPath();
      ctx.arc(point.x * overlay.width, point.y * overlay.height, i === 0 ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ---------- Main loop ---------- */
function loop() {
  if (!cameraOn || !loopOn) return;

  try {
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      frameNo++;

      const result = landmarker.detectForVideo(video, performance.now());
      drawHands(result);

      const hand = result?.landmarks?.[0];
      const features = hand ? extractFeatures(hand) : null;

      if (features) {
        buffer.push(features);

        if (buffer.length > WINDOW_SIZE * 2) buffer.shift();
      }

      bufferFill.style.width = Math.min(100, (buffer.length / WINDOW_SIZE) * 100) + "%";
      bufferCount.textContent = `${buffer.length}/${WINDOW_SIZE}`;

      if (recording && features) {
        tempSamples.push(features);

        if (tempSamples.length >= WINDOW_SIZE) finishRecording();
      }

      if (recognitionOn && !recording && frameNo % RECOGNIZE_EVERY === 0) {
        recognize(hand, features);
      }
    }
  } catch (error) {
    console.error("Frame error:", error);
    setStatus("", "Paused: " + error.message);
    loopOn = false;
    return;
  }

  requestAnimationFrame(loop);
}

function recognize(hand, features) {
  if (!hand) {
    candidate = null;
    candidateCount = 0;
    holdFill.style.width = "0%";
    setLive("—", store.signs.length ? "Show a gesture" : "Use a built-in gesture");
    return;
  }

  const shape = handShape(hand);

  gestureHistory.push({ x: hand[0].x, y: hand[0].y, shape });

  if (gestureHistory.length > 24) gestureHistory.shift();

  if (features && buffer.length >= WINDOW_SIZE && store.signs.length) {
    const saved = matchSaved(buffer.slice(-WINDOW_SIZE));

    if (saved) {
      accept(saved.word, saved.confidence, "Saved PSL sign");
      return;
    }
  }

  const gesture = matchBuiltIn(shape, gestureHistory);

  if (!gesture) {
    candidate = null;
    candidateCount = 0;
    holdFill.style.width = "0%";
    setLive("—", shape === "other" ? "Show a clear hand shape" : "Hold the gesture");
    return;
  }

  if (candidate && candidate.id === gesture.id) {
    candidateCount++;
  } else {
    candidate = gesture;
    candidateCount = 1;
  }

  const progress = Math.min(1, candidateCount / HOLD_FRAMES);
  holdFill.style.width = progress * 100 + "%";

  setLive(
    gesture.urdu,
    gesture.english + " • hold " + Math.round(progress * 100) + "%"
  );

  if (candidateCount >= HOLD_FRAMES) {
    accept(gesture.urdu, 1, "Quick gesture: " + gesture.english);
    candidate = null;
    candidateCount = 0;
    holdFill.style.width = "0%";
  }
}

function accept(word, confidence, source) {
  const now = Date.now();

  setLive(word, source + " • " + Math.round(confidence * 100) + "%");

  if (word !== lastOutput.word || now - lastOutput.time > COOLDOWN_MS) {
    lastOutput = { word, time: now };
    appendPhrase(word);
  }
}

/* ---------- Camera ---------- */
async function initCamera() {
  if (!FilesetResolver || !HandLandmarker) {
    setStatus("", "MediaPipe is not loaded");
    return;
  }

  startCamera.disabled = true;
  startCamera.textContent = "Loading…";

  try {
    const files = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    const model = {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    };

    try {
      landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { ...model, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2
      });
    } catch {
      landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { ...model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2
      });
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:960}, height:{ideal:720}, facingMode:"user" },
      audio: false
    });

    video.srcObject = stream;

    await new Promise(resolve => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = resolve;
    });

    await video.play();

    resizeOverlay();
    cameraVeil.style.display = "none";
    cameraOn = true;
    loopOn = true;

    recordSample.disabled = !currentSign;
    micButton.disabled = false;

    setStatus("live", "Listening");
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    startCamera.disabled = false;
    startCamera.textContent = "Try again";
    setStatus("", "Camera error: " + error.message);
  }
}

/* ---------- Teaching ---------- */
function finishRecording() {
  recording = false;
  recordSample.textContent = "Record PSL sample";
  recordSample.disabled = !currentSign;

  if (!currentSign || tempSamples.length < WINDOW_SIZE) {
    tempSamples = [];
    setStatus("live", "Sample too short");
    return;
  }

  if (currentSign.samples.length >= 12) {
    tempSamples = [];
    setStatus("live", "Maximum samples saved");
    return;
  }

  currentSign.samples.push(tempSamples);
  tempSamples = [];
  buffer = [];
  saveStore();

  sampleStatus.textContent = currentSign.samples.length + " samples recorded";
  teachStatus.textContent = "Teaching: " + currentSign.urdu;
  setStatus("live", "Sample saved");
}

function renderGuide() {
  gestureGuide.innerHTML = "";

  for (const gesture of BUILT_INS) {
    const item = document.createElement("article");
    item.className = "gesture-item";

    const urdu = document.createElement("b");
    urdu.textContent = gesture.urdu;

    const english = document.createElement("span");
    english.textContent = gesture.english;

    const hint = document.createElement("small");
    hint.textContent = gesture.hint;

    item.append(urdu, english, hint);
    gestureGuide.appendChild(item);
  }
}

/* ---------- Events ---------- */
document.querySelectorAll(".tab").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    button.classList.add("active");

    const mode = button.dataset.mode;

    teachDrawer.classList.toggle("open", mode === "teach");
    guideDrawer.classList.toggle("open", mode === "guide");
    recognitionOn = mode === "translate";
  };
});

teachForm.onsubmit = event => {
  event.preventDefault();

  const urdu = urduWord.value.trim();
  const english = englishWord.value.trim();

  if (!urdu || !english) return;

  let sign = store.signs.find(item => item.urdu === urdu);

  if (!sign) {
    sign = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      urdu,
      english,
      category: wordCategory.value,
      samples: []
    };

    store.signs.push(sign);
    saveStore();
  }

  currentSign = sign;
  tempSamples = [];
  buffer = [];

  teachStatus.textContent = "Teaching: " + urdu;
  sampleStatus.textContent = sign.samples.length + " samples recorded";
  recordSample.disabled = false;
};

recordSample.onclick = () => {
  if (!currentSign) return;

  buffer = [];
  tempSamples = [];
  recording = true;

  recordSample.disabled = true;
  recordSample.textContent = "Recording…";
  setStatus("busy", "Recording sign");
};

clearBuffer.onclick = () => {
  buffer = [];
  tempSamples = [];
  setStatus("live", "Buffer cleared");
};

speakButton.onclick = () => speakUrdu(phrase.join(" "));

clearPhrase.onclick = () => {
  phrase = [];
  setUrdu("");
  speakButton.disabled = true;
};

quickReplies.onclick = event => {
  const button = event.target.closest("button");
  const text = button?.dataset.urdu;

  if (text) {
    setUrdu(text);
    speakUrdu(text);
  }
};

/* ---------- Speech to text ---------- */
function setupMicrophone() {
  const SpeechRecognitionClass =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    micButton.disabled = true;
    heardOutput.textContent = "اس براؤزر میں speech recognition دستیاب نہیں";
    return;
  }

  const recognition = new SpeechRecognitionClass();
  recognition.lang = "ur-PK";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = event => {
    let text = "";

    for (const result of event.results) {
      text += result[0].transcript;
    }

    heardOutput.textContent = text;
  };

  recognition.onerror = event => {
    heardOutput.textContent = "مائیکروفون کی خرابی: " + event.error;
    setStatus("live", "Mic error");
  };

  recognition.onend = () => {
    micButton.classList.remove("listening");
    micLabel.textContent = "Speak";
    setStatus("live", "Listening");
  };

  micButton.onclick = () => {
    if (micButton.classList.contains("listening")) {
      recognition.stop();
      return;
    }

    heardOutput.textContent = "سن رہا ہوں…";
    setStatus("busy", "Staff speaking");
    micButton.classList.add("listening");
    micLabel.textContent = "Stop";

    try {
      recognition.start();
    } catch (error) {
      console.error(error);
    }
  };
}

startCamera.onclick = initCamera;
setupMicrophone();
renderGuide();
