import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/* ---------------- DOM ---------------- */

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const cameraHint = document.getElementById("cameraHint");
const startCamera = document.getElementById("startCamera");

const liveWord = document.getElementById("liveWord");
const liveConfidence = document.getElementById("liveConfidence");
const recognitionRing = document.getElementById("recognitionRing");

const recordSample = document.getElementById("recordSample");
const clearBuffer = document.getElementById("clearBuffer");
const bufferFill = document.getElementById("bufferFill");
const bufferCount = document.getElementById("bufferCount");

const urduOutput = document.getElementById("urduOutput");
const speakButton = document.getElementById("speakButton");
const clearPhrase = document.getElementById("clearPhrase");
const heardOutput = document.getElementById("heardOutput");
const micButton = document.getElementById("micButton");
const quickReplies = document.getElementById("quickReplies");

const teachDrawer = document.getElementById("teachDrawer");
const vocabDrawer = document.getElementById("vocabDrawer");
const teachForm = document.getElementById("teachForm");
const urduWord = document.getElementById("urduWord");
const englishWord = document.getElementById("englishWord");
const wordCategory = document.getElementById("wordCategory");
const teachStatus = document.getElementById("teachStatus");
const sampleStatus = document.getElementById("sampleStatus");
const vocabList = document.getElementById("vocabList");
const closeVocab = document.getElementById("closeVocab");

const turnIndicator = document.getElementById("turnIndicator");
const turnText = document.getElementById("turnText");

/* ---------------- Settings ---------------- */

const WINDOW_SIZE = 30;
const RECOGNIZE_EVERY = 4;
const MATCH_THRESHOLD = 0.62;
const MAX_SAMPLES_PER_SIGN = 12;
const STORE_KEY = "bol-psl-v2";

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

/* ---------------- State ---------------- */

let landmarker = null;
let cameraRunning = false;
let loopRunning = false;
let lastVideoTime = -1;
let frameCounter = 0;

let landmarkBuffer = [];
let recording = false;
let currentTeachWord = null;
let tempSamples = [];

let phrase = [];
let lastAccepted = { word: null, time: 0 };
let recognitionOn = true;

/* ---------------- Storage ---------------- */

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return parsed && Array.isArray(parsed.signs) ? parsed : { signs: [] };
  } catch (err) {
    console.warn("Could not read saved vocabulary:", err);
    return { signs: [] };
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (err) {
    showStatus("Could not save locally. Check browser storage permissions.");
    console.error(err);
  }
}

let store = loadStore();

/* ---------------- UI helpers ---------------- */

function setTurn(mode, text) {
  turnIndicator.className = "turn-indicator" + (mode ? " " + mode : "");
  turnText.textContent = text;
}

function setUrdu(text) {
  urduOutput.textContent = text || "یہاں اردو ظاہر ہوگی";
}

function showStatus(message) {
  console.warn(message);
  liveConfidence.textContent = message;
}

function updateBufferUI() {
  const count = landmarkBuffer.length;
  bufferFill.style.width = Math.min(100, (count / WINDOW_SIZE) * 100) + "%";
  bufferCount.textContent = `${count} / ${WINDOW_SIZE}`;
}

function renderVocabulary() {
  vocabList.innerHTML = "";

  if (!store.signs.length) {
    vocabList.innerHTML =
      '<p class="vocab-empty">No signs yet. Use <strong>Teach a sign</strong> to add your first verified PSL word.</p>';
    return;
  }

  for (const sign of store.signs) {
    const card = document.createElement("article");
    card.className = "vocab-card";

    const title = document.createElement("strong");
    title.textContent = sign.urdu;

    const meaning = document.createElement("span");
    meaning.textContent = sign.english;

    const meta = document.createElement("small");
    meta.textContent = `${sign.category} • ${sign.samples.length} samples`;

    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "Remove";
    remove.style.marginTop = "10px";
    remove.onclick = () => {
      store.signs = store.signs.filter((s) => s.id !== sign.id);
      saveStore();

      if (currentTeachWord && currentTeachWord.id === sign.id) {
        currentTeachWord = null;
        teachStatus.textContent = "No sign selected.";
        sampleStatus.textContent = "0 samples recorded";
        recordSample.disabled = true;
      }

      renderVocabulary();
    };

    card.append(title, meaning, meta, remove);
    vocabList.appendChild(card);
  }
}

/* ---------------- Urdu speech ---------------- */

async function speakUrdu(text) {
  if (!text) return;

  setTurn("psl", "PSL speaking");

  // Browser speech is used first because it never blocks the camera loop.
  browserSpeak(text);
}

function browserSpeak(text) {
  if (!("speechSynthesis" in window)) {
    setTurn(null, "Voice unavailable");
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ur-PK";
    utterance.rate = 0.95;

    utterance.onend = () => setTurn(null, "Ready");
    utterance.onerror = () => setTurn(null, "Voice error");

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  } catch (err) {
    console.error(err);
    setTurn(null, "Voice error");
  }
}

function appendPhrase(word) {
  phrase.push(word);

  if (phrase.length > 6) {
    phrase.shift();
  }

  setUrdu(phrase.join(" "));
  speakButton.disabled = false;
  speakUrdu(word);
}

/* ---------------- Landmark features ---------------- */

function extractFeatures(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middle = landmarks[9];

  const scale =
    Math.hypot(
      middle.x - wrist.x,
      middle.y - wrist.y,
      (middle.z || 0) - (wrist.z || 0)
    ) || 0.000001;

  const features = new Float32Array(63);

  for (let i = 0; i < 21; i++) {
    const point = landmarks[i];
    const base = i * 3;

    features[base] = (point.x - wrist.x) / scale;
    features[base + 1] = (point.y - wrist.y) / scale;
    features[base + 2] = ((point.z || 0) - (wrist.z || 0)) / scale;
  }

  return features;
}

function sequenceDistance(sequenceA, sequenceB) {
  const length = Math.min(sequenceA.length, sequenceB.length);
  let total = 0;

  for (let i = 0; i < length; i++) {
    const a = sequenceA[i];
    const b = sequenceB[i];

    let frameDistance = 0;

    for (let j = 0; j < a.length; j++) {
      const diff = a[j] - b[j];
      frameDistance += diff * diff;
    }

    total += Math.sqrt(frameDistance);
  }

  return total / Math.max(1, length);
}

function classifyBuffer() {
  if (landmarkBuffer.length < WINDOW_SIZE) return null;
  if (!store.signs.length) return null;

  const sequence = landmarkBuffer.slice(-WINDOW_SIZE);
  const scores = [];

  for (const sign of store.signs) {
    if (!sign.samples || !sign.samples.length) continue;

    let bestDistance = Infinity;

    for (const sample of sign.samples) {
      if (!sample || sample.length < WINDOW_SIZE) continue;

      const distance = sequenceDistance(sequence, sample);

      if (distance < bestDistance) {
        bestDistance = distance;
      }
    }

    if (bestDistance !== Infinity) {
      scores.push({ word: sign.urdu, distance: bestDistance });
    }
  }

  if (!scores.length) return null;

  scores.sort((a, b) => a.distance - b.distance);

  const best = scores[0];
  const second = scores[1];

  if (best.distance > 1.8) return null;

  const margin = second ? (second.distance - best.distance) / (best.distance + 0.0001) : 0.35;
  const confidence = Math.max(
    0,
    Math.min(1, (1 - best.distance / 2.4) * (0.65 + Math.min(0.35, margin)))
  );

  if (confidence < MATCH_THRESHOLD) return null;

  return {
    word: best.word,
    confidence
  };
}

/* ---------------- Drawing ---------------- */

function resizeOverlay() {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;

  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
}

function drawHands(results) {
  resizeOverlay();
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const hands = results?.landmarks || [];

  for (const hand of hands) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7fd6c8";
    ctx.beginPath();

    for (const [start, end] of HAND_CONNECTIONS) {
      const a = hand[start];
      const b = hand[end];

      if (!a || !b) continue;

      ctx.moveTo(a.x * overlay.width, a.y * overlay.height);
      ctx.lineTo(b.x * overlay.width, b.y * overlay.height);
    }

    ctx.stroke();

    ctx.fillStyle = "#f6c46a";

    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(
        point.x * overlay.width,
        point.y * overlay.height,
        3.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

/* ---------------- Main loop ---------------- */

function processFrame() {
  if (!cameraRunning || !loopRunning) return;

  try {
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      frameCounter++;

      const result = landmarker.detectForVideo(video, performance.now());
      drawHands(result);

      const hand = result?.landmarks?.[0];
      const features = hand ? extractFeatures(hand) : null;

      if (features) {
        landmarkBuffer.push(features);

        if (landmarkBuffer.length > WINDOW_SIZE * 2) {
          landmarkBuffer.shift();
        }
      }

      updateBufferUI();

      if (recording && features) {
        tempSamples.push(features);

        if (tempSamples.length >= WINDOW_SIZE) {
          finishRecording();
        }
      }

      if (recognitionOn && !recording && frameCounter % RECOGNIZE_EVERY === 0) {
        const match = classifyBuffer();
        const now = Date.now();

        if (match) {
          liveWord.textContent = match.word;
          liveConfidence.textContent =
            Math.round(match.confidence * 100) + "% confident";
          recognitionRing.classList.add("match");

          const isNewWord = match.word !== lastAccepted.word;
          const enoughTime = now - lastAccepted.time > 2500;

          if (isNewWord || enoughTime) {
            lastAccepted = { word: match.word, time: now };
            appendPhrase(match.word);
          }
        } else {
          liveWord.textContent = "—";
          liveConfidence.textContent = store.signs.length
            ? "listening"
            : "teach a sign first";
          recognitionRing.classList.remove("match");
        }
      }
    }
  } catch (err) {
    console.error("Frame processing error:", err);
    showStatus("Recognition paused: " + err.message);
    loopRunning = false;
    return;
  }

  requestAnimationFrame(processFrame);
}

/* ---------------- Camera ---------------- */

async function initCamera() {
  startCamera.disabled = true;
  startCamera.textContent = "Loading…";

  try {
    const files = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    let landmarkerOptions = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    };

    try {
      landmarker = await HandLandmarker.createFromOptions(files, landmarkerOptions);
    } catch (gpuError) {
      console.warn("GPU delegate failed, using CPU:", gpuError);

      landmarkerOptions.baseOptions.delegate = "CPU";
      landmarker = await HandLandmarker.createFromOptions(files, landmarkerOptions);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });

    video.srcObject = stream;

    await new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve();
      } else {
        video.onloadeddata = resolve;
      }
    });

    await video.play();

    resizeOverlay();
    cameraHint.style.display = "none";
    cameraRunning = true;
    loopRunning = true;

    recordSample.disabled = !currentTeachWord;
    micButton.disabled = false;

    setTurn(null, "Camera ready");
    showStatus("Camera ready");

    requestAnimationFrame(processFrame);
  } catch (err) {
    console.error(err);
    startCamera.disabled = false;
    startCamera.textContent = "Try again";
    showStatus("Camera error: " + err.message);
  }
}

/* ---------------- Teaching ---------------- */

function finishRecording() {
  recording = false;
  recordSample.textContent = "Record sample";
  recordSample.disabled = !currentTeachWord;

  if (!currentTeachWord) return;

  if (tempSamples.length < WINDOW_SIZE) {
    showStatus("Sample too short. Hold the sign steady and try again.");
    tempSamples = [];
    return;
  }

  if (currentTeachWord.samples.length >= MAX_SAMPLES_PER_SIGN) {
    showStatus(`Maximum ${MAX_SAMPLES_PER_SIGN} samples reached.`);
    tempSamples = [];
    return;
  }

  currentTeachWord.samples.push(tempSamples);
  tempSamples = [];
  landmarkBuffer = [];

  saveStore();

  sampleStatus.textContent = `${currentTeachWord.samples.length} samples recorded`;
  teachStatus.textContent = `Teaching: ${currentTeachWord.urdu} (${currentTeachWord.english})`;
  showStatus("Sample saved");
}

/* ---------------- Speech to text ---------------- */

function setupSpeech() {
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

  recognition.onresult = (event) => {
    let text = "";

    for (const result of event.results) {
      text += result[0].transcript;
    }

    heardOutput.textContent = text;
  };

  recognition.onerror = (event) => {
    heardOutput.textContent = "مائیکروفون کی خرابی: " + event.error;
    setTurn(null, "Mic error");
  };

  recognition.onend = () => {
    micButton.classList.remove("listening");
    micButton.innerHTML = '<span class="mic-icon">🎙</span> Speak';
    setTurn(null, "Ready");
  };

  micButton.onclick = () => {
    if (micButton.classList.contains("listening")) {
      recognition.stop();
      return;
    }

    heardOutput.textContent = "سن رہا ہوں…";
    setTurn("staff", "Staff speaking");
    micButton.classList.add("listening");
    micButton.innerHTML = '<span class="mic-icon">⏹</span> Stop';

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      showStatus("Microphone could not start.");
    }
  };
}

/* ---------------- Events ---------------- */

document.querySelectorAll(".mode-btn").forEach((button) => {
  button.onclick = () => {
    document
      .querySelectorAll(".mode-btn")
      .forEach((item) => item.classList.remove("active"));

    button.classList.add("active");

    const mode = button.dataset.mode;

    teachDrawer.classList.toggle("open", mode === "teach");
    vocabDrawer.classList.toggle("open", mode === "vocabulary");

    recognitionOn = mode === "translate";

    if (mode === "vocabulary") {
      renderVocabulary();
    }
  };
});

teachForm.onsubmit = (event) => {
  event.preventDefault();

  const urdu = urduWord.value.trim();
  const english = englishWord.value.trim();

  if (!urdu || !english) return;

  let sign = store.signs.find((item) => item.urdu === urdu);

  if (!sign) {
    sign = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      urdu,
      english,
      category: wordCategory.value,
      samples: []
    };

    store.signs.push(sign);
    saveStore();
  }

  currentTeachWord = sign;
  tempSamples = [];
  landmarkBuffer = [];

  teachStatus.textContent = `Teaching: ${urdu} (${english})`;
  sampleStatus.textContent = `${sign.samples.length} samples recorded`;
  recordSample.disabled = false;

  renderVocabulary();
};

recordSample.onclick = () => {
  if (!currentTeachWord) return;

  landmarkBuffer = [];
  tempSamples = [];
  recording = true;

  recordSample.disabled = true;
  recordSample.textContent = "Recording…";
  setTurn("psl", "Recording sign");
  showStatus("Perform the sign now");
};

clearBuffer.onclick = () => {
  landmarkBuffer = [];
  tempSamples = [];
  updateBufferUI();
  showStatus("Buffer cleared");
};

speakButton.onclick = () => speakUrdu(phrase.join(" "));

clearPhrase.onclick = () => {
  phrase = [];
  setUrdu("");
  speakButton.disabled = true;
};

quickReplies.onclick = (event) => {
  const text = event.target.dataset.urdu;

  if (text) {
    setUrdu(text);
    speakUrdu(text);
  }
};

closeVocab.onclick = () => {
  vocabDrawer.classList.remove("open");
  document.querySelector('[data-mode="translate"]').click();
};

startCamera.onclick = initCamera;

/* ---------------- Start ---------------- */

setupSpeech();
renderVocabulary();
updateBufferUI();