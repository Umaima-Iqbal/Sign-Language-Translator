import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

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

const WINDOW_SIZE = 45;
const MATCH_THRESHOLD = 0.68;
const STORE_KEY = "bol-psl-v1";

let landmarker = null;
let cameraRunning = false;
let lastVideoTime = -1;
let landmarkBuffer = [];
let recording = false;
let currentTeachWord = null;
let tempSamples = [];
let phrase = [];
let lastMatch = { word: null, time: 0 };
let recognitionOn = true;

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],
  [11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]
];

function loadStore(){
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { signs: [] }; }
  catch { return { signs: [] }; }
}
function saveStore(data){
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}
let store = loadStore();

function setTurn(mode, text){
  turnIndicator.className = "turn-indicator" + (mode ? " " + mode : "");
  turnText.textContent = text;
}

function setUrdu(text){
  urduOutput.textContent = text || "یہاں اردو ظاہر ہوگی";
}

function appendPhrase(word){
  phrase.push(word);
  if (phrase.length > 6) phrase.shift();
  setUrdu(phrase.join(" "));
  speakButton.disabled = false;
  speakUrdu(word);
}

async function speakUrdu(text){
  if (!text) return;
  setTurn("psl", "PSL speaking");
  try {
    const res = await fetch("/tts", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ text })
    });
    if (res.ok){
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setTurn(null, "Ready");
      await audio.play();
      return;
    }
  } catch {}
  browserSpeak(text);
}

function browserSpeak(text){
  if (!("speechSynthesis" in window)){
    setTurn(null, "Voice unavailable");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ur-PK";
  utterance.rate = 0.95;
  utterance.onend = () => setTurn(null, "Ready");
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function extractFeatures(landmarks){
  if (!landmarks || landmarks.length === 0) return null;
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const scale = Math.hypot(middleMcp.x-wrist.x, middleMcp.y-wrist.y, (middleMcp.z||0)-(wrist.z||0)) || 1e-6;
  const pts = [];
  for (const p of landmarks){
    pts.push((p.x-wrist.x)/scale, (p.y-wrist.y)/scale, ((p.z||0)-wrist.z)/scale);
  }
  return pts;
}

function sequenceDistance(a,b){
  const n = Math.min(a.length,b.length);
  let total = 0;
  for (let i=0;i<n;i++){
    const x=a[i], y=b[i];
    let s=0;
    for (let j=0;j<x.length;j++) s += (x[j]-y[j])**2;
    total += Math.sqrt(s);
  }
  return total/n;
}

function classifyBuffer(){
  if (landmarkBuffer.length < WINDOW_SIZE || store.signs.length === 0) return null;

  const sequence = landmarkBuffer.slice(-WINDOW_SIZE);
  const scores = new Map();

  for (const sign of store.signs){
    let best = Infinity;
    for (const sample of sign.samples){
      const d = sequenceDistance(sequence, sample);
      if (d < best) best = d;
    }
    if (!scores.has(sign.urdu) || best < scores.get(sign.urdu)) scores.set(sign.urdu, best);
  }

  const ranked = [...scores.entries()].sort((a,b)=>a[1]-b[1]);
  if (!ranked.length) return null;

  const [bestWord,bestDistance] = ranked[0];
  const second = ranked[1]?.[1] ?? Infinity;
  const margin = (second-bestDistance)/(bestDistance+1e-6);
  const confidence = Math.max(0, Math.min(1, 1 - bestDistance/2.2)) * Math.min(1, 0.55 + margin);

  if (bestDistance > 1.55 || confidence < MATCH_THRESHOLD) return null;
  return { word: bestWord, confidence };
}

function drawHands(results){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const landmarks = results?.landmarks || [];
  for (const hand of landmarks){
    ctx.strokeStyle = "#7fd6c8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a,b] of HAND_CONNECTIONS){
      ctx.moveTo(hand[a].x*overlay.width, hand[a].y*overlay.height);
      ctx.lineTo(hand[b].x*overlay.width, hand[b].y*overlay.height);
    }
    ctx.stroke();

    ctx.fillStyle = "#f6c46a";
    for (const p of hand){
      ctx.beginPath();
      ctx.arc(p.x*overlay.width, p.y*overlay.height, 3.4, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

function updateBufferUI(){
  const count = landmarkBuffer.length;
  bufferFill.style.width = Math.min(100, count/WINDOW_SIZE*100) + "%";
  bufferCount.textContent = `${count} / ${WINDOW_SIZE}`;
}

async function predictLoop(){
  if (!cameraRunning) return;

  if (video.currentTime !== lastVideoTime){
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, performance.now());
    drawHands(result);

    const hand = result?.landmarks?.[0];
    const features = hand ? extractFeatures(hand) : null;

    if (features){
      landmarkBuffer.push(features);
      if (landmarkBuffer.length > WINDOW_SIZE*2) landmarkBuffer.shift();
    }
    updateBufferUI();

    if (recording && features){
      tempSamples.push([...features]);
      if (tempSamples.length >= WINDOW_SIZE){
        recording = false;
        recordSample.textContent = "Record sample";
        recordSample.disabled = !currentTeachWord;
        saveTempSample();
      }
    }

    if (recognitionOn && !recording){
      const match = classifyBuffer();
      const now = Date.now();
      if (match){
        liveWord.textContent = match.word;
        liveConfidence.textContent = Math.round(match.confidence*100) + "% confident";
        recognitionRing.classList.add("match");

        if (match.word !== lastMatch.word || now-lastMatch.time > 2200){
          lastMatch = { word: match.word, time: now };
          appendPhrase(match.word);
        }
      } else {
        liveWord.textContent = "—";
        liveConfidence.textContent = "listening";
        recognitionRing.classList.remove("match");
      }
    }
  }

  requestAnimationFrame(predictLoop);
}

async function initCamera(){
  startCamera.disabled = true;
  startCamera.textContent = "Loading…";

  const files = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  landmarker = await HandLandmarker.createFromOptions(files, {
    baseOptions:{
      modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate:"GPU"
    },
    runningMode:"VIDEO",
    numHands:2
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video:{ width:{ideal:960}, height:{ideal:720}, facingMode:"user" },
    audio:false
  });

  video.srcObject = stream;
  await video.play();

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  cameraHint.style.display = "none";
  cameraRunning = true;
  recordSample.disabled = !currentTeachWord;
  micButton.disabled = false;

  setTurn(null, "Camera ready");
  predictLoop();
}

function saveTempSample(){
  if (!currentTeachWord || tempSamples.length < WINDOW_SIZE) return;
  currentTeachWord.samples.push(tempSamples);
  tempSamples = [];
  saveStore(store);
  sampleStatus.textContent = `${currentTeachWord.samples.length} samples recorded`;
  teachStatus.textContent = `Teaching: ${currentTeachWord.urdu} (${currentTeachWord.english})`;
}

function renderVocabulary(){
  vocabList.innerHTML = "";
  if (!store.signs.length){
    vocabList.innerHTML = `<p class="vocab-empty">No signs yet. Use <strong>Teach a sign</strong> to add your first verified PSL word.</p>`;
    return;
  }
  for (const sign of store.signs){
    const card = document.createElement("article");
    card.className = "vocab-card";
    card.innerHTML = `
      <strong>${sign.urdu}</strong>
      <span>${sign.english}</span>
      <small>${sign.category} · ${sign.samples.length} samples</small>
    `;
    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "Remove";
    remove.style.marginTop = "10px";
    remove.onclick = () => {
      store.signs = store.signs.filter(s => s !== sign);
      saveStore(store);
      if (currentTeachWord === sign){
        currentTeachWord = null;
        teachStatus.textContent = "No sign selected.";
        sampleStatus.textContent = "0 samples recorded";
        recordSample.disabled = true;
      }
      renderVocabulary();
    };
    card.appendChild(remove);
    vocabList.appendChild(card);
  }
}

function setupSpeech(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){
    micButton.disabled = true;
    heardOutput.textContent = "اس براؤزر میں speech recognition دستیاب نہیں";
    return;
  }

  const recognition = new SR();
  recognition.lang = "ur-PK";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let text = "";
    for (const result of event.results) text += result[0].transcript;
    heardOutput.textContent = text;
  };

  recognition.onend = () => {
    micButton.classList.remove("listening");
    micButton.innerHTML = `<span class="mic-icon">🎙</span> Speak`;
    setTurn(null, "Ready");
  };

  micButton.onclick = () => {
    if (micButton.classList.contains("listening")){
      recognition.stop();
      return;
    }
    heardOutput.textContent = "سن رہا ہوں…";
    setTurn("staff", "Staff speaking");
    micButton.classList.add("listening");
    micButton.innerHTML = `<span class="mic-icon">⏹</span> Stop`;
    recognition.start();
  };
}

document.querySelectorAll(".mode-btn").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    const mode = button.dataset.mode;
    teachDrawer.classList.toggle("open", mode === "teach");
    vocabDrawer.classList.toggle("open", mode === "vocabulary");
    recognitionOn = mode === "translate";
    if (mode === "vocabulary") renderVocabulary();
  };
});

teachForm.onsubmit = (event) => {
  event.preventDefault();
  const urdu = urduWord.value.trim();
  const english = englishWord.value.trim();
  if (!urdu || !english) return;

  let sign = store.signs.find(s => s.urdu === urdu);
  if (!sign){
    sign = { urdu, english, category:wordCategory.value, samples:[] };
    store.signs.push(sign);
    saveStore(store);
  }

  currentTeachWord = sign;
  tempSamples = [];
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
};

clearBuffer.onclick = () => {
  landmarkBuffer = [];
  tempSamples = [];
  updateBufferUI();
};

speakButton.onclick = () => speakUrdu(phrase.join(" "));
clearPhrase.onclick = () => {
  phrase = [];
  setUrdu("");
  speakButton.disabled = true;
};

quickReplies.onclick = (event) => {
  const text = event.target.dataset.urdu;
  if (text){
    setUrdu(text);
    speakUrdu(text);
  }
};

closeVocab.onclick = () => {
  vocabDrawer.classList.remove("open");
  document.querySelector('[data-mode="translate"]').click();
};

startCamera.onclick = initCamera;
setupSpeech();
renderVocabulary();
