import { useCallback, useEffect, useRef, useState } from 'react';

export function useJarvisSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    audioRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    cleanupAudio();
  }, [cleanupAudio]);

  const speak = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!enabled || !clean) return;

    const requestId = ++requestIdRef.current;
    cleanupAudio();
    setError(null);

    try {
      const res = await fetch('/jarvis-speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      });

      if (!res.ok) {
        let message = `Voice request failed (${res.status})`;
        try {
          const body = await res.json();
          message = body?.error || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await res.blob();
      if (requestId !== requestIdRef.current) return;

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.preload = 'auto';

      audio.onplay = () => setSpeaking(true);
      audio.onended = () => cleanupAudio();
      audio.onerror = () => {
        setError('Audio playback failed.');
        cleanupAudio();
      };

      // This is initiated after a user command, so browsers normally permit
      // playback. If a browser blocks autoplay, the UI exposes a manual retry.
      await audio.play();
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setSpeaking(false);
      setError(err?.message || 'Voice playback failed.');
    }
  }, [cleanupAudio, enabled]);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (!next) stop();
      return next;
    });
  }, [stop]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  return { enabled, speaking, error, speak, stop, toggleEnabled };
}
