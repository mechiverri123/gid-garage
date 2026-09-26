GID Garage — Always-listening Jarvis wake-word patch

This removes the unreliable Web Speech API dictation approach.

NEW BEHAVIOR
------------
- The browser keeps a real microphone stream open.
- Voice activity detection runs locally in the browser.
- Silence is NOT uploaded.
- Short spoken segments are transcribed with gpt-4o-mini-transcribe.
- Jarvis only acts when it hears "Jarvis" / "Hey Jarvis".
- Saying only "Jarvis" arms it for 9 seconds for your next sentence.
- While GID is speaking or already working, the listener ignores audio to prevent feedback.
- After GID finishes, always-listening resumes automatically.

EXAMPLES
--------
"Jarvis, catch me up."
"Jarvis, what jobs do I have tomorrow?"
"Jarvis."
(wait for COMMAND READY)
"Move John's brake job to Friday."

FIRST VISIT
-----------
Opera/Chrome still controls microphone permission.
On the first visit, allow microphone access for gidgarage.com.
Once permission is remembered, Jarvis starts listening automatically on future visits.

FILES
-----
ADD:
functions/jarvis-transcribe.js
src/command-center/hooks/useJarvisListener.ts

REPLACE:
src/command-center/hooks/useJarvisSpeech.ts
src/command-center/components/CommandInput.tsx
src/command-center/components/VoiceControl.tsx
src/command-center/CommandCenterPage.tsx

OPENAI
------
Uses the same OPENAI_API_KEY already configured for jarvis-speak.js.

TEST
----
1. Deploy the COMPLETE fresh Vite build.
2. Purge Cloudflare cache if old hashed JS is served.
3. Open /jarvis.
4. Allow microphone access.
5. UI should show ALWAYS LISTENING / SAY "JARVIS..."
6. Say: "Jarvis, catch me up."
7. Watch HEARING -> UNDERSTANDING.
8. Existing Ask GID receives "catch me up".
9. Existing AI voice speaks the answer.
10. Listener resumes automatically.

COST
----
This is NOT a continuous OpenAI realtime session.
Microphone volume detection is local, and only short speech clips are sent for transcription.
