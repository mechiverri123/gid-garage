GID GARAGE — POST-PUSH LIVEKIT FIX

I audited the pushed gid-garage(5).zip.

FIXED IN THIS PATCH
===================
1. LiveKit TTS model
   WRONG: cartesia/sonic-3.6
   RIGHT: cartesia/sonic-3

   LiveKit's current Cartesia Inference model ID is cartesia/sonic-3.
   The old value would make the hosted agent fail when it tried to create TTS.

2. Browser audio autoplay
   START JARVIS now attempts to unlock Room audio immediately from the user's
   click. It also shows an ENABLE AUDIO button if Opera/Chromium still blocks
   remote agent audio.

3. Setup docs / agent env example updated to cartesia/sonic-3.

STILL REQUIRED ON YOUR MACHINE
==============================
Your package.json has the three LiveKit JS packages, but your current
package-lock.json DOES NOT.

Run in the main gid-garage folder:

    npm install
    npm run build

Then commit package-lock.json too:

    git add package-lock.json package.json functions/jarvis-livekit-token.js jarvis-agent src/command-center LIVEKIT_JARVIS_SETUP.md
    git commit -m "fix livekit jarvis realtime voice"
    git push

DO NOT paste API keys into chat.

IMPORTANT ACCESS CHECK
======================
/jarvis-livekit-token intentionally checks for Cloudflare Access's
Cf-Access-Jwt-Assertion header.

Your Cloudflare Access application must protect that endpoint as well as
/jarvis. If GET /jarvis-livekit-token returns 401 while /jarvis itself works,
extend the same Access policy to /jarvis-livekit-token*.

BEHAVIOR NOTE
=============
This first realtime version is push-to-start, then continuously conversational.
It does NOT currently enforce the spoken wake word "Jarvis" on every command.
That can be added after the realtime path is proven fast and stable.

FILES IN THIS PATCH
===================
jarvis-agent/agent.py
jarvis-agent/.env.example
src/command-center/hooks/useLiveKitJarvis.ts
src/command-center/components/RealtimeVoiceControl.tsx
src/command-center/CommandCenterPage.tsx
LIVEKIT_JARVIS_SETUP.md
