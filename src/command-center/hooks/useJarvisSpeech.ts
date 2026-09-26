import { useCallback, useEffect, useRef, useState } from 'react';

type SpeakOptions = { startup?: boolean };
type VoiceMode = 'openai' | 'browser' | 'idle';

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const preferred = [
    /Microsoft George.*English \(United Kingdom\)/i,
    /Microsoft Ryan.*English \(United Kingdom\)/i,
    /Google UK English Male/i,
    /Daniel/i,
    /British/i,
    /en-GB/i,
  ];
  for (const pattern of preferred) {
    const found = voices.find(v => pattern.test(`${v.name} ${v.lang}`));
    if (found) return found;
  }
  return voices.find(v => /^en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
}

export function useJarvisSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [lastText, setLastText] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const pendingStartupRef = useRef<(() => Promise<void>) | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    pendingStartupRef.current = null;
    setNeedsInteraction(false);
    cleanupAudio();
  }, [cleanupAudio]);

  const browserSpeak = useCallback(async (text: string, startup = false) => {
    if (!('speechSynthesis' in window)) throw new Error('Browser speech fallback is unavailable.');

    const play = async () => {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const voice = pickBrowserVoice();
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || 'en-GB';
      utter.rate = 0.96;
      utter.pitch = 0.86;
      utter.volume = 1;
      utteranceRef.current = utter;
      utter.onstart = () => {
        setSpeaking(true);
        setMode('browser');
        setNeedsInteraction(false);
      };
      utter.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };
      utter.onerror = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };
      window.speechSynthesis.speak(utter);
    };

    if (startup) {
      // Some browsers will suppress startup audio. Queue the same action for
      // the first click/key if speech does not actually enter speaking state.
      await play();
      window.setTimeout(() => {
        if (!window.speechSynthesis.speaking && !speaking) {
          pendingStartupRef.current = play;
          setNeedsInteraction(true);
        }
      }, 250);
    } else {
      await play();
    }
  }, [speaking]);

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
      setError('Generated audio could not be played.');
      setErrorDetail('The TTS request succeeded, but the browser failed to decode/play the audio file.');
      cleanupAudio();
    };

    const doPlay = async () => {
      await audio.play();
    };

    try {
      await doPlay();
    } catch (err: any) {
      if (startup && (err?.name === 'NotAllowedError' || /autoplay|interact|gesture/i.test(err?.message || ''))) {
        pendingStartupRef.current = doPlay;
        setNeedsInteraction(true);
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
        setError(message);
        setErrorDetail(detail || null);

        // Always fall back to the browser's local TTS so Michael still hears
        // a greeting/response even if API billing, key config, or OpenAI is down.
        await browserSpeak(clean, !!options.startup);
        return;
      }

      const blob = await res.blob();
      if (requestId !== requestIdRef.current) return;
      await playOpenAIAudio(blob, !!options.startup);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err?.message || 'OpenAI voice failed.');
      setErrorDetail('Using browser fallback voice so GID can still speak.');
      try {
        await browserSpeak(clean, !!options.startup);
      } catch (fallbackErr: any) {
        setSpeaking(false);
        setMode('idle');
        setErrorDetail(fallbackErr?.message || 'Browser fallback voice also failed.');
      }
    }
  }, [browserSpeak, cleanupAudio, enabled, playOpenAIAudio]);

  const speakStartup = useCallback((text: string) => speak(text, { startup: true }), [speak]);

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
    errorDetail,
    needsInteraction,
    mode,
    speak,
    speakStartup,
    unlock,
    retry,
    stop,
    toggleEnabled,
  };
}
