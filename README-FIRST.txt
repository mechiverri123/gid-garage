GID Garage — Voice false-error fix

What was happening:
- The OpenAI voice was actually working and the greeting played successfully.
- When playback ended, cleanupAudio() set audio.src = ''.
- Chromium/Opera could emit an audio error event as a side effect of clearing the source.
- That stale onerror handler then changed the UI to:
  Voice unavailable / Generated AI voice could not be played.

Fix:
- Detach onplay/onended/onerror before clearing the audio source.
- Remove the src attribute safely, then load/cleanup.
- Real playback errors are still reported normally.

Replace:
src/command-center/hooks/useJarvisSpeech.ts

Then rebuild/deploy the full site and purge Cloudflare cache if the old hashed JS is still served.
