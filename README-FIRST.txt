GID VOICE + OVERLAP FIX

Replace these files:
- functions/jarvis-speak.js
- src/command-center/hooks/useJarvisSpeech.ts
- src/command-center/components/VoiceControl.tsx
- src/command-center/CommandCenterPage.tsx

WHAT THIS FIXES
1. Removes the duplicated bottom telemetry row that was overlapping the Jarvis core.
2. Shows the actual voice error instead of only "Voice error".
3. Adds a retry button.
4. If OpenAI TTS fails (missing billing, bad key, rate limit, etc.), GID immediately falls back to the browser's local speech voice so Michael still hears the greeting.
5. The OpenAI endpoint now returns clearer diagnostics.

IMPORTANT
- OPENAI_API_KEY must exist in the *production* Cloudflare Pages environment, not only Preview.
- gpt-4o-mini-tts is not available on the OpenAI API free tier. Billing/credits must be active.
- Browsers may block autoplay. If so, the UI says "Tap to start" and the first interaction releases the queued greeting.

QUICK TEST
Open this URL while logged into Cloudflare Access:
  https://www.gidgarage.com/jarvis-speak
It should return JSON like:
  {"ok":true,"configured":true,"model":"gpt-4o-mini-tts","voice":"cedar"}

If configured is false, the Cloudflare production environment variable is missing.
