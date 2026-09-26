GID Garage — verify which voice is actually playing

Why:
Your Cloudflare function previously had an automatic OpenAI fallback.
So if Railway/Piper failed for ANY reason, you could still hear a voice and think
it was the JARVIS model when it was actually OpenAI.

THIS PATCH REMOVES THAT AMBIGUITY.

Replace:
functions/jarvis-speak.js
src/command-center/hooks/useJarvisSpeech.ts
src/command-center/components/VoiceControl.tsx

One tiny page change:
Where your <VoiceControl ... /> is rendered, add:

provider={voice.provider}

Example:
<VoiceControl
  ...
  provider={voice.provider}
/>

Behavior after deploy:
- If Railway/Piper works, the UI shows:
  Voice: Piper JARVIS
- If Railway/Piper fails, you get an error.
- It will NOT silently switch to OpenAI anymore.

Also test directly:
GET https://www.gidgarage.com/jarvis-speak

Expected:
{
  "provider": "piper-jarvis-strict",
  "jarvis_voice_configured": true,
  "strict_voice_mode": true
}

Then play the startup greeting.
If the UI says "Voice: Piper JARVIS", you are definitely hearing the Railway model.
