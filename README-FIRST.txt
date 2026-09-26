GID Garage — OpenAI transcription HTTP 400 fix

WHAT WAS WRONG
==============
The mic itself is now getting far enough to upload audio.

The 400 was caused by how the previous listener recorded audio:
- one MediaRecorder stayed open continuously
- Chromium emitted WebM/Opus chunks every 200ms
- the code kept only chunks around the detected speech
- later WebM chunks are not guaranteed to contain the file/container header
- those partial chunks were joined and uploaded as if they were a complete .webm
- OpenAI then received an invalid/undecodable audio file and returned HTTP 400

FIX
===
The listener now:
1. keeps the microphone stream + audio analyser open
2. waits locally for actual speech
3. creates a BRAND NEW MediaRecorder at the start of each utterance
4. stops/finalizes that recorder after ~900ms of silence
5. uploads the browser-finalized complete WebM/Opus file
6. resumes wake-word listening

This also makes the UI show the exact upstream OpenAI error message if another
transcription problem occurs.

REPLACE THESE 2 FILES
=====================
src/command-center/hooks/useJarvisListener.ts
functions/jarvis-transcribe.js

THEN
====
npm run build
deploy the full site
purge Cloudflare cache only if an old hashed frontend bundle remains

TEST
====
Say:
Jarvis, catch me up.

Expected:
LISTENING -> HEARING -> UNDERSTANDING -> existing GID AI request -> spoken response

If OpenAI still rejects the file, the UI will now show the actual upstream error
instead of only "Transcription failed (400)".
