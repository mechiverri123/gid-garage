import { useCallback, useEffect, useRef, useState } from 'react';

type SpeakOptions = { startup?: boolean };
type VoiceMode = 'openai' | 'idle';

export function useJarvisSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [lastText, setLastText] = useState('');
  const [provider, setProvider] = useState<string>('unknown');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const pendingStartupRef = useRef<(() => Promise<void>) | null>(null);

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Detach handlers before clearing the media source.
      // Some Chromium browsers emit an `error` event when src is reset to '',
      // which previously caused a false "Generated AI voice could not be played"
      // message AFTER the audio had already finished successfully.
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch {}
    }
    audioRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setSpeaking(false);
    setMode('idle');
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    pendingStartupRef.current = null;
    setNeedsInteraction(false);
    cleanupAudio();
  }, [cleanupAudio]);

  const playOpenAIAudio = useCallback(async (blob: Blob, startup: boolean) => {
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.preload = 'auto';
    audio.volume = 1;

    audio.onplay = () => {
      setSpeaking(true);
      setMode('openai');
      setNeedsInteraction(false);
      setError(null);
      setErrorDetail(null);
    };

    audio.onended = () => cleanupAudio();

    audio.onerror = () => {
      setError('Generated AI voice could not be played.');
      setErrorDetail('The OpenAI request succeeded, but the browser failed to decode or play the WAV audio.');
      cleanupAudio();
    };

    const doPlay = async () => {
      await audio.play();
    };

    try {
      await doPlay();
    } catch (err: any) {
      const autoplayBlocked = err?.name === 'NotAllowedError' || /autoplay|interact|gesture/i.test(err?.message || '');

      if (startup && autoplayBlocked) {
        pendingStartupRef.current = doPlay;
        setNeedsInteraction(true);
        setError(null);
        setErrorDetail(null);
        return;
      }

      throw err;
    }
  }, [cleanupAudio]);

  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => {
    const clean = text.trim();
    if (!enabled || !clean) return;

    setLastText(clean);
    const requestId = ++requestIdRef.current;

    cleanupAudio();
    pendingStartupRef.current = null;
    setNeedsInteraction(false);
    setError(null);
    setErrorDetail(null);

    try {
      const res = await fetch('/jarvis-speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
        credentials: 'same-origin',
      });

      if (!res.ok) {
        let message = `Voice request failed (${res.status})`;
        let detail = '';

        try {
          const body = await res.json();
          message = body?.error || message;
          detail = body?.detail || '';
        } catch {}

        if (requestId !== requestIdRef.current) return;

        setSpeaking(false);
        setMode('idle');
        setError(message);
        setErrorDetail(detail || 'OpenAI voice did not run. Browser fallback is intentionally disabled so you only hear the real AI voice.');
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      const voiceProvider = res.headers.get('x-gid-voice') || 'unknown';
      setProvider(voiceProvider);

      if (!contentType.includes('audio/')) {
        const unexpected = await res.text();
        if (requestId !== requestIdRef.current) return;
        setError('Voice endpoint returned a non-audio response.');
        setErrorDetail(unexpected.slice(0, 600));
        return;
      }

      const blob = await res.blob();
      if (requestId !== requestIdRef.current) return;

      await playOpenAIAudio(blob, !!options.startup);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;

      setSpeaking(false);
      setMode('idle');
      setError(err?.message || 'OpenAI voice failed.');
      setErrorDetail('The browser voice fallback is disabled. Fix the AI voice connection, then press Retry.');
    }
  }, [cleanupAudio, enabled, playOpenAIAudio]);

  const speakStartup = useCallback((text: string) => {
    return speak(text, { startup: true });
  }, [speak]);

  const unlock = useCallback(async () => {
    const action = pendingStartupRef.current;
    if (!action) {
      setNeedsInteraction(false);
      return;
    }

    try {
      await action();
      pendingStartupRef.current = null;
      setNeedsInteraction(false);
    } catch (err: any) {
      setError(err?.message || 'Could not start GID voice.');
      setErrorDetail('Your browser blocked audio playback. Click the voice button and try again.');
    }
  }, []);

  const retry = useCallback(() => {
    if (lastText) void speak(lastText);
  }, [lastText, speak]);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (!next) stop();
      return next;
    });
  }, [stop]);

  useEffect(() => {
    if (!needsInteraction) return;

    const handler = () => {
      void unlock();
    };

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
    errorDetail,
    needsInteraction,
    mode,
    provider,
    speak,
    speakStartup,
    unlock,
    retry,
    stop,
    toggleEnabled,
  };
}
