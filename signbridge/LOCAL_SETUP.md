# SignBridge — Local VS Code Setup

## Quick start (Windows / Mac / Linux)

1. Open this folder in VS Code.
2. Open terminal in VS Code (`Ctrl+`` or Terminal → New Terminal).
3. Install dependencies:

```bash
npm install --legacy-peer-deps
```

4. Start the app:

```bash
npm run dev
```

5. Browser mein kholo:

```
http://localhost:3000
```

**Important:** Chrome ya Edge use karo (camera + speech recognition ke liye).  
File:// se mat kholo — hamesha `http://localhost:3000`.

---

## First screen

- **Continue with Google** — real Firebase login (agar aapke Firebase project mein Google Auth enabled hai).
- **Continue as Demo** — bina Google ke turant andar (local testing ke liye best).

Role choose karo: **Signer** ya **Listener**.

---

## Features jo ab kaam karte hain

| Feature | Status |
|---------|--------|
| Camera + MediaPipe 21-point hand tracking | ✅ |
| 26 built-in gestures | ✅ |
| Hold-to-confirm recognition | ✅ |
| Custom sign training (Train tab) | ✅ |
| Speech synthesis (Speak) | ✅ |
| Microphone speech-to-text (Chrome) | ✅ |
| Quick replies | ✅ |
| Room codes + WebSocket two-way | ✅ |
| Invite link copy | ✅ |
| Flip camera | ✅ |
| Demo mode (no Google required) | ✅ |

---

## Two-way test

1. Window A: Signer → Start camera → gestures dikhao.
2. **Copy invite** button dabao.
3. Window B (ya phone): invite link kholo → Listener role.
4. Window A signs → Window B ko translation + room feed dikhega.
5. Window B mic / quick reply → Window A ko message milega.

---

## Common errors

| Error | Fix |
|-------|-----|
| `tsx: not found` | `npm install --legacy-peer-deps` phir `npx tsx server.ts` |
| Camera error / file:// | Sirf `http://localhost:3000` se kholo |
| Firebase popup blocked | Browser mein popups allow karo, ya **Demo** mode use karo |
| Hand model slow first time | Internet chahiye (CDN se model download hota hai), 20–40 sec lag sakta hai |
| Port 3000 busy | `PORT=3001 npm run dev` |

---

## Project structure (reconstructed)

```
src/
  main.tsx
  App.tsx
  index.css
  components/
    AuthGate.tsx
    BrandLogo.tsx
    LiveStudio.tsx
  lib/
    firebase.ts
    signEngine.ts
    useHandTracker.ts
server.ts          # Express + Vite + WebSocket rooms
firebase-applet-config.json
```

Ye version original AI Studio export ke missing `src/` ke replacement ke taur pe banaya gaya hai taake VS Code mein turant chale.
