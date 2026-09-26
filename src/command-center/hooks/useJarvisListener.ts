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
const RMS_CONTINUE = 0.010;
const SILENCE_MS = 900;
const MIN_SPEECH_MS = 250;
const ARMED_MS = 9000;
const START_TIMEOUT_MS = 10000;
const PRE_ROLL_MS = 350;

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

function encodeMonoWav(chunks: Float32Array[], sampleRate: number) {
  let totalSamples = 0;
  for (const chunk of chunks) totalSamples += chunk.length;

  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);      // PCM chunk size
  view.setUint16(20, 1, true);       // PCM
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function useJarvisListener({ onCommand, suspended = false }: Options) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  });
  const [state, setState] = useState<HearingState>('off');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [diagnostics, setDiagnostics] = useState<MicDiagnostics>(initialDiag);

  const onCommandRef = useRef(onCommand);
  const suspendedRef = useRef(suspended);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { suspendedRef.current = suspended; }, [suspended]);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const preRollRef = useRef<Float32Array[]>([]);
  const speechChunksRef = useRef<Float32Array[]>([]);
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

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try { processorRef.current.disconnect(); } catch {}
    }
    processorRef.current = null;

    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
    }
    gainRef.current = null;

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    const ctx = contextRef.current;
    contextRef.current = null;
    analyserRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});

    preRollRef.current = [];
    speechChunksRef.current = [];
    inSpeechRef.current = false;
    sendingRef.current = false;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    if (sendingRef.current || blob.size < 1000) return;
    sendingRef.current = true;
    setState('transcribing');

    try {
      const file = new File([blob], `jarvis-${Date.now()}.wav`, { type: 'audio/wav' });
      const form = new FormData();
      form.append('audio', file);

      const res = await fetch('/jarvis-transcribe', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.detail ? ` ${String(body.detail).slice(0, 500)}` : '';
        throw new Error(`${body?.error || `Transcription failed (${res.status}).`}${detail}`);
      }

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

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser microphone APIs are unavailable.');
      patchDiag({ lastError: 'getUserMedia unavailable.' });
      setState('error');
      return;
    }

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
          reject(Object.assign(
            new Error('getUserMedia did not resolve within 10 seconds.'),
            { name: 'MicStartupTimeout' }
          ));
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
      if (track.readyState !== 'live') {
        throw new Error(`Microphone track is ${track.readyState}, not live.`);
      }

      patchDiag({
        getUserMedia: 'resolved',
        deviceLabel: track.label || 'audio input',
        trackState: track.readyState,
        trackMuted: track.muted,
      });

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextCtor();
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Capture raw PCM directly instead of MediaRecorder/WebM.
      // This eliminates container/header corruption completely.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      gainRef.current = silentGain;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      const preRollMaxChunks = Math.max(
        1,
        Math.ceil((PRE_ROLL_MS / 1000) * ctx.sampleRate / 4096)
      );

      processor.onaudioprocess = event => {
        if (suspendedRef.current) return;

        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);

        preRollRef.current.push(copy);
        while (preRollRef.current.length > preRollMaxChunks) {
          preRollRef.current.shift();
        }

        if (inSpeechRef.current) {
          speechChunksRef.current.push(copy);
        }
      };

      patchDiag({
        audioContextState: ctx.state,
        recorderState: 'pcm-wav',
      });

      const resume = async () => {
        try {
          if (ctx.state === 'suspended') await ctx.resume();
          patchDiag({ audioContextState: ctx.state });
        } catch (err: any) {
          patchDiag({
            audioContextState: ctx.state,
            lastError: err?.message || 'AudioContext resume failed.',
          });
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

      setState('listening');

      const samples = new Float32Array(analyser.fftSize);

      const monitor = () => {
        if (!mountedRef.current) return;

        const a = analyserRef.current;
        const activeCtx = contextRef.current;
        const activeTrack = streamRef.current?.getAudioTracks?.()[0];
        if (!a || !activeCtx || !activeTrack) return;

        if (activeCtx.state === 'suspended') {
          if (++diagTickRef.current % 30 === 0) {
            patchDiag({
              audioContextState: activeCtx.state,
              trackState: activeTrack.readyState,
              trackMuted: activeTrack.muted,
              recorderState: 'pcm-wav',
              rms: 0,
            });
          }
          rafRef.current = requestAnimationFrame(monitor);
          return;
        }

        if (suspendedRef.current) {
          inSpeechRef.current = false;
          speechChunksRef.current = [];
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
            recorderState: 'pcm-wav',
          });
        }

        if (!inSpeechRef.current && rms >= RMS_START) {
          inSpeechRef.current = true;
          speechStartedAtRef.current = now;
          lastVoiceAtRef.current = now;
          speechChunksRef.current = [...preRollRef.current];
          setState('hearing');
        } else if (inSpeechRef.current) {
          if (rms >= RMS_CONTINUE) lastVoiceAtRef.current = now;

          if (now - lastVoiceAtRef.current >= SILENCE_MS) {
            const duration = now - speechStartedAtRef.current;
            inSpeechRef.current = false;

            const chunks = speechChunksRef.current;
            speechChunksRef.current = [];

            if (duration >= MIN_SPEECH_MS && chunks.length) {
              const wav = encodeMonoWav(chunks, activeCtx.sampleRate);
              void transcribe(wav);
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
            ? 'Microphone startup timed out.'
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

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void start();
    else setState('off');

    return () => {
      mountedRef.current = false;
      stopHardware();
    };
    // Deliberately only tied to enabled. Prevents React callback changes from
    // repeatedly tearing down and restarting the microphone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

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
