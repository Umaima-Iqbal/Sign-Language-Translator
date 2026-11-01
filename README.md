# Bol PSL: Sign Language to English Translator

Browser app. Camera reads hand signs, shows English text and speaks it. Staff speech is shown as English text.

## Run on computer
    python -m http.server 8000
Open http://localhost:8000 in Chrome or Edge.

## Put on phone (needs HTTPS)
1. Upload this folder to Netlify Drop, Vercel or GitHub Pages (free). You get an https link.
2. Open the link in Chrome on Android, menu, Install app.
3. APK: go to pwabuilder.com, paste your https link, choose Android, download the package.
   Use this route (it runs real Chrome inside the app). Capacitor or Cordova WebView will break speech to text.

## Built in gestures (11)
Hello (wave open palm), Yes (thumb up), No (thumb down), Wait (fist), Thank you (index and middle up),
Help (index up), Price (thumb and index touching), Stop (open palm still), I love you, Call me, Water (three fingers).

## Teach your own signs
Teach tab, type the English meaning, Record sample 5 to 10 times, go back to Translate.
Saved signs are checked before built in gestures. Data stays in the phone (localStorage).

## Limits
Not full PSL. Only built in gestures and the signs you teach it.
