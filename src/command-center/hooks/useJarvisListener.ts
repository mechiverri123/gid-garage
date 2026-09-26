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

export type MicDiagnostics = {
  secureContext: boolean;
  permission: string;
  getUserMedia: 'idle' | 'requesting' | 'resolved' | 'failed' | 'timeout';
  deviceLabel: string;
  trackState: string;
  trackMuted: boolean;
  audioContextState: string;
  recorderState: string;
  rms: number;
  lastError: string;
};

type Options = {
  onCommand: (command: string) => void;
  suspended?: boolean;
};

const STORAGE_KEY = 'gid.jarvis.alwaysListening';
const WAKE_RE = /\b(?:hey\s+)?(?:jarvis|jervis|jarviss)\b/i;
const RMS_START = 0.018;
const RMS_CONTINUE = 0.012;
const SILENCE_MS = 900;
const MIN_SPEECH_MS = 250;
const ARMED_MS = 9000;
const START_TIMEOUT_MS = 10000;

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find(t =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
  ) || '';
}

const initialDiag = (): MicDiagnostics => ({
  secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
  permission: 'unknown',
  getUserMedia: 'idle',
  deviceLabel: '',
  trackState: '',
  trackMuted: false,
  audioContextState: '',
  recorderState: '',
  rms: 0,
  lastError: '',
});

export function useJarvisListener({ onCommand, suspended = false }: Options) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  });
  const [state, setState] = useState<HearingState>('off');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [diagnostics, setDiagnostics] = useState<MicDiagnostics>(initialDiag);

  // Keep changing React callbacks OUT of the microphone lifecycle.
  // The previous listener could restart every render if `ask`/voice callbacks changed identity,
  // which looks exactly like a mic permanently stuck on "Starting".
  const onCommandRef = useRef(onCommand);
  const suspendedRef = useRef(suspended);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { suspendedRef.current = suspended; }, [suspended]);

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
  const armedUntilRef = useRef(0);
  const mountedRef = useRef(true);
  const diagTickRef = useRef(0);

  const patchDiag = useCallback((patch: Partial<MicDiagnostics>) => {
    if (!mountedRef.current) return;
    setDiagnostics(prev => ({ ...prev, ...patch }));
  }, []);

  const stopHardware = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      try { recorder.stop(); } catch {}
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    const ctx = contextRef.current;
    contextRef.current = null;
    analyserRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});

    chunksRef.current = [];
    preRollRef.current = [];
    inSpeechRef.current = false;
    sendingRef.current = false;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    if (sendingRef.current || blob.size < 700) return;
    sendingRef.current = true;
    setState('transcribing');

    try {
      const ext = blob.type.includes('ogg') ? 'ogg'
        : blob.type.includes('mp4') ? 'm4a'
        : 'webm';

      const file = new File([blob], `jarvis-${Date.now()}.${ext}`, {
        type: blob.type || 'audio/webm',
      });

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
      setLastTranscript(transcript);

      if (!transcript) {
        setState('listening');
        return;
      }

      const wake = transcript.match(WAKE_RE);
      const armed = Date.now() < armedUntilRef.current;

      if (wake) {
        const afterWake = transcript
          .slice((wake.index || 0) + wake[0].length)
          .replace(/^[\s,.:;!?-]+/, '')
          .trim();

        if (afterWake.length >= 2) {
          armedUntilRef.current = 0;
          setState('listening');
          onCommandRef.current(afterWake);
        } else {
          armedUntilRef.current = Date.now() + ARMED_MS;
          setState('armed');
        }
      } else if (armed) {
        armedUntilRef.current = 0;
        setState('listening');
        onCommandRef.current(transcript);
      } else {
        setState('listening');
      }
    } catch (err: any) {
      const message = err?.message || 'Could not transcribe microphone audio.';
      setError(message);
      patchDiag({ lastError: message });
      setState('error');
    } finally {
      sendingRef.current = false;
    }
  }, [patchDiag]);

  const start = useCallback(async () => {
    if (streamRef.current) return;

    setError(null);
    setState('starting');
    setDiagnostics(initialDiag());

    if (!window.isSecureContext) {
      setError('Microphone requires HTTPS.');
      patchDiag({ lastError: 'Not a secure context.' });
      setState('blocked');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Browser microphone APIs are unavailable.');
      patchDiag({ lastError: 'getUserMedia or MediaRecorder unavailable.' });
      setState('error');
      return;
    }

    // Surface the browser's real permission state when supported.
    try {
      const p = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
      if (p) {
        patchDiag({ permission: p.state });
        p.onchange = () => patchDiag({ permission: p.state });
      }
    } catch {
      patchDiag({ permission: 'not exposed by browser' });
    }

    patchDiag({ getUserMedia: 'requesting' });

    let timeoutId: number | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(Object.assign(new Error(
            'getUserMedia did not resolve within 10 seconds. Check the active input device in Opera/Windows.'
          ), { name: 'MicStartupTimeout' }));
        }, START_TIMEOUT_MS);
      });

      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        }),
        timeoutPromise,
      ]);

      if (timeoutId) window.clearTimeout(timeoutId);

      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No audio track was returned.');

      const settings = track.getSettings?.() || {};
      patchDiag({
        getUserMedia: 'resolved',
        deviceLabel: track.label || String((settings as any).deviceId || 'audio input'),
        trackState: track.readyState,
        trackMuted: track.muted,
      });

      if (track.readyState !== 'live') {
        throw new Error(`Microphone track is ${track.readyState}, not live.`);
      }

      track.onended = () => {
        patchDiag({ trackState: 'ended', lastError: 'Microphone track ended.' });
        setError('Microphone track ended.');
        setState('error');
      };
      track.onmute = () => patchDiag({ trackMuted: true });
      track.onunmute = () => patchDiag({ trackMuted: false });

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextCtor();
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      analyserRef.current = analyser;

      patchDiag({ audioContextState: ctx.state });

      // Never await this: Opera may require a gesture and awaiting it caused "Starting mic".
      const resume = async () => {
        try {
          if (ctx.state === 'suspended') await ctx.resume();
          patchDiag({ audioContextState: ctx.state });
        } catch (err: any) {
          patchDiag({ audioContextState: ctx.state, lastError: err?.message || 'AudioContext resume failed.' });
        }
      };
      void resume();

      const unlock = () => {
        void resume();
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
        if (!event.data?.size) return;
        preRollRef.current.push(event.data);
        if (preRollRef.current.length > 5) preRollRef.current.shift();
        if (inSpeechRef.current) chunksRef.current.push(event.data);
      };

      recorder.onerror = (event: any) => {
        const message = event?.error?.message || 'MediaRecorder failed.';
        patchDiag({ recorderState: recorder.state, lastError: message });
        setError(message);
        setState('error');
      };

      recorder.start(200);
      patchDiag({ recorderState: recorder.state });

      // IMPORTANT: at this point mic hardware is live. Leave STARTING immediately.
      setState('listening');

      const samples = new Float32Array(analyser.fftSize);

      const monitor = () => {
        if (!mountedRef.current) return;

        const a = analyserRef.current;
        const activeCtx = contextRef.current;
        const activeTrack = streamRef.current?.getAudioTracks?.()[0];
        const activeRecorder = recorderRef.current;
        if (!a || !activeCtx || !activeTrack || !activeRecorder) return;

        if (activeCtx.state === 'suspended') {
          if (++diagTickRef.current % 30 === 0) {
            patchDiag({
              audioContextState: activeCtx.state,
              trackState: activeTrack.readyState,
              trackMuted: activeTrack.muted,
              recorderState: activeRecorder.state,
              rms: 0,
            });
          }
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }

        if (suspendedRef.current) {
          inSpeechRef.current = false;
          chunksRef.current = [];
          preRollRef.current = [];
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }

        a.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();

        if (++diagTickRef.current % 12 === 0) {
          patchDiag({
            rms: Number(rms.toFixed(4)),
            audioContextState: activeCtx.state,
            trackState: activeTrack.readyState,
            trackMuted: activeTrack.muted,
            recorderState: activeRecorder.state,
          });
        }

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
              const blob = new Blob(parts, {
                type: activeRecorder.mimeType || 'audio/webm',
              });
              void transcribe(blob);
            } else {
              setState(Date.now() < armedUntilRef.current ? 'armed' : 'listening');
            }
          }
        } else if (Date.now() < armedUntilRef.current) {
          setState('armed');
        } else if (!sendingRef.current) {
          setState('listening');
        }

        rafRef.current = requestAnimationFrame(monitor);
      };

      rafRef.current = requestAnimationFrame(monitor);
    } catch (err: any) {
      if (timeoutId) window.clearTimeout(timeoutId);
      const name = err?.name || '';
      const message = err?.message || 'Could not start microphone.';
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      const timedOut = name === 'MicStartupTimeout';

      patchDiag({
        getUserMedia: timedOut ? 'timeout' : 'failed',
        lastError: `${name ? `${name}: ` : ''}${message}`,
      });

      stopHardware();
      setError(
        denied
          ? 'Microphone permission was denied by the browser or OS.'
          : timedOut
            ? 'Microphone startup timed out. Open diagnostics below.'
            : message
      );
      setState(denied ? 'blocked' : 'error');
    }
  }, [patchDiag, stopHardware, transcribe]);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch {}
      if (!next) {
        stopHardware();
        setState('off');
      }
      return next;
    });
  }, [stopHardware]);

  const retry = useCallback(() => {
    stopHardware();
    setState('off');
    window.setTimeout(() => { void start(); }, 100);
  }, [start, stopHardware]);

  // Hardware lifecycle depends ONLY on enabled. Not on `ask`, voice callbacks, or renders.
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void start();
    else setState('off');

    return () => {
      mountedRef.current = false;
      stopHardware();
    };
  }, [enabled]); // intentionally not depending on start/stopHardware

  return {
    enabled,
    state,
    error,
    lastTranscript,
    diagnostics,
    toggle,
    retry,
  };
}
