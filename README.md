# SignBridge — Two-Way Real-Time Sign Language & Voice Bridge

> Real-time two-way sign language translation and remote voice communication studio powered by MediaPipe 21-point hand tracking, custom sign training, WebSockets, and Firebase.

**GitHub topics:** `sign-language` · `accessibility` · `mediapipe` · `websockets` · `firebase` · `react` · `typescript` · `computer-vision` · `real-time`

---

## Overview

**SignBridge** enables two-way communication between a deaf or non-speaking **signer** and a hearing **listener** — either side-by-side or remotely across devices.

- **For the Signer:** Tracks 21-point hand landmarks in the browser with MediaPipe, recognizes 26 built-in gestures plus user-trained custom signs, and shows live captions with optional speech output.
- **For the Listener:** Sees translations, speaks them aloud via Web Speech Synthesis, and sends voice-to-text or quick replies back to the signer.

---

## Key Features

### 1. Two-Way Remote Rooms

- Shareable room codes (`SB-XXXX`) and invite URLs (`?room=SB-XXXX`)
- Express + WebSocket server with live presence, messaging, and room state
- Copy-invite button for quick multi-device testing

### 2. Mobile-Friendly UI

- Bottom navigation: **Live · Train · Guide · Stats**
- Front / rear camera flip
- Large touch targets and responsive layout

### 3. On-Device Hand Tracking & Custom Training

- MediaPipe HandLandmarker (WASM) — video stays on device
- **26 built-in gestures** (greetings, yes/no, help, numbers, medical cues, etc.)
- **Train tab:** record ~30-frame samples per custom sign and match them in real time

### 4. Speech & Quick Replies

- Text-to-speech for recognized signs
- Speech-to-text (Chrome / Edge) for the listener
- Quick-reply buttons (Hello, Thank you, Yes, No, Wait, Help…)

### 5. Auth & Storage

- Google Sign-In via Firebase (optional)
- **Demo mode** for local testing without Google
- Custom signs stored in `localStorage` (and designed for Firestore when rules are deployed)

---

## Tech Stack

| Layer | Stack |
|-------|--------|
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Computer Vision | `@mediapipe/tasks-vision` (HandLandmarker) |
| Real-time | Native WebSockets (`ws`) |
| Backend | Node.js + Express + Vite middleware (`server.ts`) |
| Auth / DB | Firebase Authentication & Cloud Firestore |

---

## Project Structure

```text
├── server.ts                 # Express + Vite + WebSocket rooms
├── firebase-applet-config.json
├── firestore.rules
├── firebase-blueprint.json
├── security_spec.md
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── lib/
    │   ├── firebase.ts       # Auth + profile helpers
    │   ├── signEngine.ts     # Gesture classifier + custom sign matching
    │   └── useHandTracker.ts # MediaPipe lifecycle hook
    └── components/
        ├── AuthGate.tsx      # Google / Demo login + role select
        ├── BrandLogo.tsx
        └── LiveStudio.tsx    # Camera, recognition, rooms, train, guide
