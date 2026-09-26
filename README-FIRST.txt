GID Garage — definitive transcription 400 fix

The previous recorder approach still depended on MediaRecorder/WebM.
Opera/Chromium was producing audio that OpenAI reported as corrupted or unsupported.

THIS VERSION REMOVES WEBM COMPLETELY.

New microphone path:
microphone
-> Web Audio API
-> raw mono PCM samples
-> browser creates a standard 16-bit RIFF/WAV file
-> Cloudflare receives jarvis.wav
-> OpenAI transcription

There is no MediaRecorder container to corrupt anymore.

REPLACE:
src/command-center/hooks/useJarvisListener.ts
functions/jarvis-transcribe.js

Then:
1. npm run build
2. deploy the complete site
3. purge Cloudflare cache only if the old frontend chunk is still being served
4. reload /jarvis
5. click once anywhere if Opera leaves AudioContext suspended
6. say: "Jarvis, catch me up."

Healthy Mic Diagnostics:
Permission: granted
getUserMedia: resolved
Track: live
Muted: false
AudioContext: running
Recorder: pcm-wav
Mic RMS: should rise while you speak

This patch also keeps the prior protection against React re-render microphone restart loops.
