GID Garage — Opera microphone STARTING fix

WHY IT WAS STUCK
----------------
The listener successfully requests the microphone, then creates an AudioContext for local voice-activity detection.
Opera/Chromium can create that AudioContext in SUSPENDED state until there has been a user gesture.

The previous build did:
    await audioContext.resume()

That can leave the page sitting at STARTING MIC even though microphone permission is already granted.

THIS FIX
--------
- Never waits on audioContext.resume() during startup.
- As soon as getUserMedia returns a LIVE audio track, UI changes to LISTENING.
- MediaRecorder starts immediately.
- AudioContext resume happens in the background.
- First click/tap/key press automatically unlocks AudioContext if Opera requires it.
- 8-second getUserMedia timeout now reports a real error instead of hanging forever.
- Existing wake-word flow remains:
    "Jarvis, catch me up."
    or "Jarvis." -> then command.

REPLACE
-------
src/command-center/hooks/useJarvisListener.ts
src/command-center/components/CommandInput.tsx

TEST
----
1. Replace these 2 files.
2. npm run build
3. deploy full dist
4. purge Cloudflare cache if the old hashed chunk is still served
5. load /jarvis
6. status should move STARTING MIC -> SAY "JARVIS..."
7. click once anywhere on the page
8. say: Jarvis, catch me up.

If it still cannot hear you after reaching LISTENING, the next step is device-level diagnostics
(selected input device / live track / measured RMS), not another permission change.
