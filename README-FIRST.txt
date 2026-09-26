GID GARAGE — REAL AI VOICE FIX

Replace these 3 files in your current project:

1. functions/jarvis-speak.js
2. src/command-center/hooks/useJarvisSpeech.ts
3. src/command-center/components/VoiceControl.tsx

WHAT CHANGED
- Removed the manual Cf-Access-Jwt-Assertion rejection that was blocking /jarvis-speak.
- Cloudflare Access should protect the route at the edge instead.
- Disabled the robotic browser speechSynthesis fallback.
- If OpenAI voice fails, the UI now shows the real error and a Retry button.
- Tuned the OpenAI cedar voice toward a calm, refined, cinematic British AI-assistant style.
- Startup greetings still queue behind the browser's autoplay restriction if necessary.

AFTER DEPLOYING
1. Purge Cloudflare cache if you get stale chunks.
2. Visit /jarvis-speak while logged in.
   It should return JSON with configured:true.
3. Reload /jarvis.
4. If the browser blocks autoplay, click once anywhere or press the Play button.
5. If it still says Voice unavailable, hover the error or press Retry; the exact API error should now be visible.

Cloudflare environment variable required:
OPENAI_API_KEY
