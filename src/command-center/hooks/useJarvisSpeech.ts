import { useCallback, useEffect, useRef, useState } from 'react';

type SpeakOptions = {
  startup?: boolean;
};

export function useJarvisSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const pendingStartupRef = useRef<HTMLAudioElement | null>(null);

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
    pendingStartupRef.current = null;
    setNeedsInteraction(false);
    cleanupAudio();
  }, [cleanupAudio]);

  const attachAudioHandlers = useCallback((audio: HTMLAudioElement) => {
    audio.onplay = () => {
      setSpeaking(true);
      setNeedsInteraction(false);
      setError(null);
    };
    audio.onended = () => {
      pendingStartupRef.current = null;
      cleanupAudio();
    };
    audio.onerror = () => {
      pendingStartupRef.current = null;
      setError('Audio playback failed.');
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const tryPlay = useCallback(async (audio: HTMLAudioElement, startup = false) => {
    try {
      await audio.play();
      return true;
    } catch (err: any) {
      // Browsers intentionally block audible autoplay until the user interacts
      // with the page. For startup speech, keep the already-generated audio
      // queued and release it on the first click/tap/key press anywhere.
      if (startup && (err?.name === 'NotAllowedError' || /play\(\).*interact|autoplay|user gesture/i.test(err?.message || ''))) {
        pendingStartupRef.current = audio;
        setNeedsInteraction(true);
        setError(null);
        return false;
      }
      throw err;
    }
  }, []);

  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => {
    const clean = text.trim();
    if (!enabled || !clean) return;

    const requestId = ++requestIdRef.current;
    cleanupAudio();
    pendingStartupRef.current = null;
    setNeedsInteraction(false);
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
      audio.volume = 1;
      attachAudioHandlers(audio);

      await tryPlay(audio, !!options.startup);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setSpeaking(false);
      setError(err?.message || 'Voice playback failed.');
    }
  }, [attachAudioHandlers, cleanupAudio, enabled, tryPlay]);

  const speakStartup = useCallback((text: string) => speak(text, { startup: true }), [speak]);

  const unlock = useCallback(async () => {
    const audio = pendingStartupRef.current;
    if (!audio) {
      setNeedsInteraction(false);
      return;
    }
    try {
      await audio.play();
      pendingStartupRef.current = null;
      setNeedsInteraction(false);
    } catch (err: any) {
      setError(err?.message || 'Could not start Jarvis voice.');
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (!next) stop();
      return next;
    });
  }, [stop]);

  // Once startup audio has been blocked by autoplay policy, any real user
  // interaction anywhere in the app unlocks and immediately plays it.
  useEffect(() => {
    if (!needsInteraction) return;
    const handler = () => { void unlock(); };
    window.addEventListener('pointerdown', handler, { once: true, capture: true });
    window.addEventListener('keydown', handler, { once: true, capture: true });
    window.addEventListener('touchstart', handler, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };
  }, [needsInteraction, unlock]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  return {
    enabled,
    speaking,
    error,
    needsInteraction,
    speak,
    speakStartup,
    unlock,
    stop,
    toggleEnabled,
  };
}
