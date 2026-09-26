GID GARAGE — COMMUNITY JARVIS VOICE + REAL MIC DIAGNOSTICS

WHAT THIS PACKAGE DOES
======================
A) VOICE
- Replaces the OpenAI approximation as the PRIMARY voice.
- Uses the community Piper model from:
  jgkawell/jarvis
- Current medium model:
  en/en_GB/jarvis/medium/jarvis-medium.onnx
- Runs in a small Docker voice service because Cloudflare Pages Functions cannot run Piper/ONNX natively.
- Cloudflare /jarvis-speak securely proxies to that service.
- OpenAI TTS remains an optional fallback if the Piper service is down.

B) MICROPHONE
- Fixes a likely restart-loop bug: microphone lifecycle no longer depends on changing React callback identities.
- Adds a hard getUserMedia timeout.
- Does NOT await AudioContext.resume() during startup.
- Shows the exact stage and live microphone details:
  permission
  getUserMedia state
  actual input device label
  track readyState
  track muted state
  AudioContext state
  MediaRecorder state
  live RMS microphone level
  last browser error

VOICE SERVICE DEPLOYMENT
========================
Deploy the `voice-service` directory to a Docker host such as Railway or Render.

Environment variable:
JARVIS_VOICE_SECRET=<make a long random secret>

The model downloads automatically from Hugging Face on first boot.
The medium ONNX file is ~63.5 MB.

After deploy, verify:
https://YOUR-VOICE-SERVICE/health

Then in CLOUDFLARE production environment add:
JARVIS_VOICE_URL=https://YOUR-VOICE-SERVICE
JARVIS_VOICE_SECRET=<same secret>

Keep:
OPENAI_API_KEY=<your existing key>

Replace your Cloudflare function:
functions/jarvis-speak.js

Now /jarvis-speak first uses Piper JARVIS and only falls back to OpenAI if needed.

MIC FILES
=========
Replace:
src/command-center/hooks/useJarvisListener.ts

Add:
src/command-center/components/MicDiagnostics.tsx

Use:
src/command-center/MIC-INTEGRATION.txt

The diagnostic panel is intentionally explicit. If the UI ever says STARTING again,
open Mic diagnostics and it will tell us which actual browser stage is stuck.

EXPECTED HEALTHY MIC
====================
Permission: granted
getUserMedia: resolved
Input: <your actual microphone>
Track: live
Muted: false
AudioContext: running
Recorder: recording
Mic RMS:
  silence often around 0.0000–0.0100
  speaking should visibly rise above that

IF AUDIOCONTEXT = SUSPENDED
===========================
Click once anywhere in the page. Chromium/Opera may require a user gesture.

IF TRACK = LIVE BUT RMS NEVER MOVES
====================================
That is a Windows/Opera input-device routing issue, not a permission issue.
Select the correct input in Windows and Opera.

IMPORTANT
=========
The Hugging Face repository labels the model MIT and describes it as emulating the
Marvel JARVIS voice. Software/model licensing does not automatically settle every
voice-likeness, trademark, publicity, or other commercial-use question. GID Garage is
a commercial business, so assess those separate rights before using the voice publicly
or in customer-facing material.
