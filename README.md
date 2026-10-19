# Sign-Language-Translator

Bol PSL — Bilingual 3D Sign Counter
Bol PSL is a browser-based Pakistan Sign Language counter assistant. It recognizes built-in quick hand gestures immediately, converts them into Urdu text and speech, and lets staff reply through Urdu speech-to-text or quick replies.

Run
bash
cd bol-psl
python -m http.server 8000
Open: http://localhost:8000

Use Chrome or Edge and allow camera access.

Works without setup
The app includes eight built-in quick gestures. Hold each one steady for about one second:

Gesture	Urdu output	English
Gesture	Urdu output	English
Open palm, wave left-right	ہیلو	Hello
Thumb up	جی ہاں	Yes
Thumb down	نہیں	No
Closed fist	انتظار	Wait
Index + middle finger up	شکریہ	Thank you
Index finger pointing up	مدد	Help
Thumb and index fingertip touching	قیمت	Price
Open palm held still	رکیں	Stop
These are simple, reliable hand-shape gestures for the working prototype. They are not presented as complete PSL.

Teach real PSL signs
Use Teach to add verified PSL signs:

Enter the Urdu word and English meaning.

Click Record PSL sample.

Perform the sign once.

Record 5–10 samples with small changes in angle and distance.

Return to Translate.

Saved PSL signs are checked before built-in quick gestures.

Privacy
The webcam stream remains in the browser. Only normalized MediaPipe hand landmarks are processed and stored locally in localStorage; no video frames are saved.
