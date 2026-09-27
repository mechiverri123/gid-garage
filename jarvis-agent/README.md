# GID JARVIS realtime agent

This is the hosted realtime voice worker for `gidgarage.com/jarvis`.

It replaces the old browser MediaRecorder -> transcription endpoint -> Claude -> Piper chain with one LiveKit WebRTC session:

browser microphone -> LiveKit STT -> Claude Haiku + GID tools -> streaming Cartesia TTS -> browser audio

Nothing here needs to run on Michael's computer.

Deploy this folder as a LiveKit Cloud Agent. Keep all secrets in LiveKit Cloud, never in source control.
