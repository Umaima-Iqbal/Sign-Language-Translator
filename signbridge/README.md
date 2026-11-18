# SignBridge — Two-Way Real-Time Sign Language & Voice Bridge

## GitHub Repository Description & Topics

> Real-time two-way sign language translation and remote voice communication studio powered by MediaPipe 21-point hand tracking, DTW custom sign training, WebRTC/WebSockets, and Firebase analytics.

**Suggested GitHub Topics:**
`sign-language` · `accessibility` · `mediapipe` · `webrtc` · `websockets` · `firebase` · `react` · `typescript` · `computer-vision` · `real-time-analytics`

---

## Overview

**SignBridge** enables seamless two-way communication between a deaf or non-speaking signer and a hearing listener/speaker—either side-by-side or miles apart across different devices:

- **For the Signer:** Tracks 21-point 3D hand landmarks directly in the browser using MediaPipe (`@mediapipe/tasks-vision`), recognizes 26 built-in gestures plus user-trained custom signs, and renders live captions alongside an articulated 21-joint SVG sign visualizer for every spoken reply.
- **For the Remote Listener & Speaker (Zero Sign Language Knowledge Required):** Receives the signer's live video (WebRTC) and real-time hand skeleton stream (WebSocket fallback), displays large English/Urdu translations, speaks translations aloud via Web Speech Synthesis, and streams continuous voice-to-text captions or quick replies back to the signer.

---

## Key Capabilities

1. **Two-Way Remote Rooms (`Two-Way`, `Signer`, `Listener`)**
   - Shareable room codes (`SB-XXXX`) and invite URLs (`?room=SB-XXXX`) with mobile native share support.
   - Express + WebSocket authoritative room state (`server.ts`) with idempotent messaging, live presence, interim speech streaming, WebRTC signaling, and 15fps landmark telemetry relay.

2. **Mobile-First & Multi-Device Experience**
   - Thumb-zone bottom navigation bar on mobile (`Live`, `Train`, `Guide`, `Stats`) with `44px+` touch targets.
   - Instant front/rear camera flip (`user` / `environment`) for signing toward yourself or pointing at another signer across a counter.
   - Expandable Tap-to-Sign pad across all 26 built-in gestures plus live audio playback in the Sign Guide.

3. **On-Device Hand Tracking & DTW Custom Sign Training**
   - Local WASM & `hand_landmarker.task` execution for low-latency, privacy-preserving hand tracking (video frames never leave the device unless WebRTC is active).
   - **26 Built-in Gestures** covering greetings, responses, basic needs, medical/help cues, numbers, orientation signs, and two-hand expressions.
   - **Custom Sign Training Studio**: Record 30-frame spatio-temporal sequences (5–12 samples per sign), stored per user in Firestore, and matched in real time via Sakoe-Chiba banded **Dynamic Time Warping (DTW)** before built-in gestures.

4. **Real-Time Analytics & CSV Exports**
   - Live session telemetry tracking total translations, mean recognition confidence, frame inference latency (`ms`), sign frequency distribution, and session history.
   - Real-time Firestore `onSnapshot` subscriptions with separate **Export Events CSV** and **Export Sessions CSV** buttons to track translation frequency over time.

5. **Authentication & Hardened Security**
   - Google Sign-In via Firebase Authentication (`email_verified` enforced).
   - PII-isolated Firestore schema (`users/{uid}/private/info`) and hardened security rules (`firestore.rules`) validated against adversarial payloads (`security_spec.md`).

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Computer Vision:** `@mediapipe/tasks-vision` (HandLandmarker WASM + float16 model)
- **Real-Time Transport:** Native WebSockets (`ws`) + WebRTC (`RTCPeerConnection`)
- **Backend:** Node.js + Express + Vite middleware (`server.ts`)
- **Auth & Database:** Firebase Authentication & Cloud Firestore

---

## Project Structure

```text
├── server.ts                        # Express + Vite + WebSocket room & WebRTC signaling server
├── firebase-blueprint.json          # Firestore entity & collection schema blueprint
├── firestore.rules                  # Hardened Zero-Trust Firestore security rules
├── security_spec.md                 # Security invariants & adversarial test payloads
├── public/
│   ├── models/hand_landmarker.task  # Local MediaPipe float16 hand landmark model
│   └── mediapipe/wasm/              # Local MediaPipe WASM runtime files
└── src/
    ├── App.tsx                      # Root auth-gated navigation & Firestore subscriptions
    ├── lib/
    │   ├── firebase.ts              # Firebase Auth, PII-isolated profile sync, & Firestore CRUD
    │   ├── signEngine.ts            # 26-gesture classifier, DTW matcher, & speech-to-sign parser
    │   └── useHandTracker.ts        # MediaPipe HandLandmarker lifecycle hook
    └── components/
        ├── AuthGate.tsx             # Google Sign-In & role selection gate
        ├── BrandLogo.tsx            # SignBridge emblem with resilient SVG fallback
        ├── LiveStudio.tsx           # Two-way communication bridge (Two-Way / Signer / Listener)
        ├── SignVisualizer.tsx       # Multi-joint articulated hand animator & remote skeleton view
        ├── TrainingStudio.tsx       # 30-frame custom sign recorder & live DTW evaluator
        ├── SignGuide.tsx            # Searchable built-in & trained sign reference guide
        └── AnalyticsDashboard.tsx   # Real-time KPIs, SVG trend chart, & Events/Sessions CSV export
```

---

## Local Setup & Development

### Prerequisites
- Node.js `v20+` (tested on `v22.23`)
- A Firebase project with **Firestore** and **Google Authentication** enabled

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment & Firebase:**
   - Copy `.env.example` to `.env` if needed for deployment URLs.
   - Ensure `firebase-applet-config.json` contains your Firebase web configuration (`projectId`, `apiKey`, `authDomain`, `appId`, `firestoreDatabaseId`).
   - Deploy `firestore.rules` to your Firebase project.

3. **Run in development (port 3000):**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in Chrome or Edge (camera and Web Speech API require `localhost` or `https://`).

### Running in VS Code

1. Open the project folder in VS Code (`code .`).
2. Run `npm install` in the VS Code terminal (if `node_modules/` is not present).
3. Press **`F5`** (or open **Run and Debug** → **SignBridge: Start Dev Server (Port 3000)**) to start the server and open `http://localhost:3000` automatically.

### Production Build & Start

```bash
npm run build
NODE_ENV=production npm start
```

---

## Testing Two-Way Communication

1. Open `http://localhost:3000` in Browser Window A, sign in as **Signer**, and copy/share the room invite link (`?room=SB-XXXX`).
2. Open the invite link in Browser Window B (or on a separate phone/laptop), sign in, and switch to **Listener**.
3. Sign in front of the camera (or tap a Quick Sign) in Window A — Window B immediately displays the translation, renders the live hand skeleton, and speaks it aloud.
4. Speak into the microphone or send a Quick Reply in Window B — Window A receives live captions and animates the corresponding hand signs in real time.

---

## Limitations

- Built-in gestures cover 26 core conversational and medical cues; expand vocabulary for specific regional dialects (such as full Pakistan Sign Language) using the built-in **Train Signs** studio.
- Browser Web Speech Recognition (`SpeechRecognition`) works best in Chromium-based browsers (Chrome / Edge); text input and quick replies work across all browsers.
