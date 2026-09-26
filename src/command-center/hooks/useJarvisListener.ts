import { useCallback, useEffect, useRef, useState } from 'react';

export type HearingState =
  | 'off'
  | 'starting'
  | 'listening'
  | 'hearing'
  | 'transcribing'
  | 'armed'
  | 'blocked'
  | 'error';

type Options = {
  onCommand: (command: string) => void;
  suspended?: boolean;
};

const STORAGE_KEY = 'gid.jarvis.alwaysListening';
const WAKE_RE = /\b(?:hey\s+)?(?:jarvis|jervis|jarviss)\b/i;
const RMS_START = 0.035;
const RMS_CONTINUE = 0.022;
const SILENCE_MS = 850;
const MIN_SPEECH_MS = 260;
const ARMED_MS = 9000;

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
}

export function useJarvisListener({ onCommand, suspended = false }: Options) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  });
  const [state, setState] = useState<HearingState>('off');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [armedUntil, setArmedUntil] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const preRollRef = useRef<Blob[]>([]);
  const speechStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const inSpeechRef = useRef(false);
  const sendingRef = useRef(false);
  const suspendedRef = useRef(suspended);
  const armedUntilRef = useRef(0);

  useEffect(() => { suspendedRef.current = suspended; }, [suspended]);
  useEffect(() => { armedUntilRef.current = armedUntil; }, [armedUntil]);

  const setPersistedEnabled = useCallback((next: boolean) => {
    setEnabled(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch {}
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch {}
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (contextRef.current && contextRef.current.state !== 'closed') {
      void contextRef.current.close().catch(() => {});
    }
    contextRef.current = null;
    analyserRef.current = null;

    chunksRef.current = [];
    preRollRef.current = [];
    inSpeechRef.current = false;
    sendingRef.current = false;
    setState('off');
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    if (sendingRef.current || blob.size < 900) return;
    sendingRef.current = true;
    setState('transcribing');

    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `jarvis-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
      const form = new FormData();
      form.append('audio', file);

      const res = await fetch('/jarvis-transcribe', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Transcription failed (${res.status})`);

      const transcript = String(body?.text || '').trim();
      if (!transcript) {
        setState('listening');
        return;
      }
      setLastTranscript(transcript);

      const wake = transcript.match(WAKE_RE);
      const currentlyArmed = Date.now() < armedUntilRef.current;

      if (wake) {
        const afterWake = transcript.slice((wake.index || 0) + wake[0].length)
          .replace(/^[\s,.:;!?-]+/, '')
          .trim();

        if (afterWake.length >= 2) {
          setArmedUntil(0);
          armedUntilRef.current = 0;
          setState('listening');
          onCommand(afterWake);
        } else {
          const until = Date.now() + ARMED_MS;
          setArmedUntil(until);
          armedUntilRef.current = until;
          setState('armed');
        }
      } else if (currentlyArmed) {
        setArmedUntil(0);
        armedUntilRef.current = 0;
        setState('listening');
        onCommand(transcript);
      } else {
        setState('listening');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not transcribe microphone audio.');
      setState('error');
    } finally {
      sendingRef.current = false;
    }
  }, [onCommand]);

  const start = useCallback(async () => {
    if (!enabled || streamRef.current) return;

    if (!window.isSecureContext) {
      setError('Always-listening microphone requires HTTPS.');
      setState('blocked');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support the microphone recorder Jarvis needs.');
      setState('error');
      return;
    }

    setError(null);
    setState('starting');

    // Do not let Opera/Chromium sit on "Starting mic" forever.
    const timeout = window.setTimeout(() => {
      if (!streamRef.current) {
        setError('Microphone startup timed out. Check the selected input device, then retry.');
        setState('error');
      }
    }, 8000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      window.clearTimeout(timeout);
      streamRef.current = stream;

      const liveTrack = stream.getAudioTracks()[0];
      if (!liveTrack || liveTrack.readyState !== 'live') {
        throw new Error('Browser granted microphone permission but did not return a live audio track.');
      }

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextCtor();
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.45;
      source.connect(analyser);
      analyserRef.current = analyser;

      // IMPORTANT:
      // Opera/Chromium may create AudioContext in "suspended" state until a user gesture.
      // The old build awaited ctx.resume(), which can leave the UI stuck at STARTING MIC.
      // Start the recorder immediately, show a usable state, and resume audio analysis
      // opportunistically. A one-time click anywhere on the page will unlock it if needed.
      const tryResume = async () => {
        if (ctx.state === 'suspended') {
          try { await ctx.resume(); } catch {}
        }
      };
      void tryResume();

      const unlock = () => {
        void tryResume();
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        window.removeEventListener('touchstart', unlock, true);
      };
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
      window.addEventListener('touchstart', unlock, true);

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (!event.data || event.data.size === 0) return;

        preRollRef.current.push(event.data);
        if (preRollRef.current.length > 5) preRollRef.current.shift();

        if (inSpeechRef.current) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('Microphone recorder failed.');
        setState('error');
      };

      recorder.start(200);

      // We now have an actual live mic stream. Never leave the UI at "starting".
      setState('listening');

      const data = new Float32Array(analyser.fftSize);

      const monitor = () => {
        const a = analyserRef.current;
        const activeCtx = contextRef.current;
        if (!a || !activeCtx) return;

        // If browser audio analysis is still gesture-blocked, remain visibly armed
        // instead of pretending startup failed.
        if (activeCtx.state === 'suspended') {
          setState(prev =>
            prev === 'off' || prev === 'blocked' || prev === 'error' || prev === 'transcribing'
              ? prev
              : 'listening'
          );
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }

        if (suspendedRef.current) {
          inSpeechRef.current = false;
          chunksRef.current = [];
          preRollRef.current = [];
          setState(prev => prev === 'off' || prev === 'blocked' || prev === 'error' ? prev : 'listening');
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }

        a.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();

        if (!inSpeechRef.current && rms >= RMS_START) {
          inSpeechRef.current = true;
          speechStartedAtRef.current = now;
          lastVoiceAtRef.current = now;
          chunksRef.current = [...preRollRef.current];
          setState('hearing');
        } else if (inSpeechRef.current) {
          if (rms >= RMS_CONTINUE) lastVoiceAtRef.current = now;

          if (now - lastVoiceAtRef.current >= SILENCE_MS) {
            const duration = now - speechStartedAtRef.current;
            const parts = chunksRef.current;
            inSpeechRef.current = false;
            chunksRef.current = [];

            if (duration >= MIN_SPEECH_MS && parts.length) {
              const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
              void transcribe(blob);
            } else {
              setState(Date.now() < armedUntilRef.current ? 'armed' : 'listening');
            }
          }
        } else if (Date.now() < armedUntilRef.current) {
          setState('armed');
        } else {
          setState(prev => prev === 'transcribing' ? prev : 'listening');
        }

        rafRef.current = requestAnimationFrame(monitor);
      };

      rafRef.current = requestAnimationFrame(monitor);
    } catch (err: any) {
      window.clearTimeout(timeout);
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setError(denied
        ? 'Microphone permission is blocked. Allow microphone access for gidgarage.com, then enable hearing again.'
        : (err?.message || 'Could not start microphone.'));
      stopAll();
      setState(denied ? 'blocked' : 'error');
    }
  }, [enabled, stopAll, transcribe]);

  const toggle = useCallback(() => {
    if (enabled) {
      setPersistedEnabled(false);
      stopAll();
    } else {
      setPersistedEnabled(true);
    }
  }, [enabled, setPersistedEnabled, stopAll]);

  useEffect(() => {
    if (!enabled) {
      stopAll();
      return;
    }
    void start();
    return () => stopAll();
  }, [enabled, start, stopAll]);

  useEffect(() => {
    if (!armedUntil) return;
    const delay = Math.max(0, armedUntil - Date.now());
    const timer = window.setTimeout(() => {
      armedUntilRef.current = 0;
      setArmedUntil(0);
      setState(prev => prev === 'armed' ? 'listening' : prev);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [armedUntil]);

  return {
    enabled,
    state,
    error,
    lastTranscript,
    toggle,
    retry: start,
  };
}
