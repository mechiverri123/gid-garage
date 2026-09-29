// Direct realtime voice for Jarvis (replaces the LiveKit Inference path):
//
//   mic -> AudioWorklet (16 kHz PCM) -> local VAD -> Deepgram streaming STT
//   -> final utterance -> the SAME Jarvis command path as typing
//   -> Claude reply streamed per sentence -> Cartesia streaming TTS -> speakers
//
// Browser <-> providers use short-lived tokens from /jarvis/voice; master keys
// never reach the page. Cost controls: only speech (plus a short pre-roll and
// tail) is sent to Deepgram, silence is replaced by free KeepAlives, interim
// text is display-only, speech that gets interrupted is cancelled, and the
// session stops itself when idle or backgrounded. Provider failures degrade to
// "voice unavailable" (typed Jarvis keeps working) — quota/billing errors are
// never retried in a loop.
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakable } from '../../../shared/voice-text.js';
import type { RealtimeVoiceState, VoiceDiagnostics } from '../hooks/useLiveKitJarvis';

export interface VoiceTimings { speechEndToFinal: number | null; finalToFirstText: number | null; firstTextToAudio: number | null; speechEndToAudio: number | null; at: number }
// Last measured timings, for Settings -> Usage (debug), not the main UI.
export const voiceTimings: { last: VoiceTimings | null } = { last: null };

const IDLE_STOP_MS = 4 * 60_000;
const HIDDEN_STOP_MS = 60_000;
const PAUSE_KEY = 'gid.voicePausedUntil';
const FRAME_MS = 20;
const PREROLL_FRAMES = 15;      // 300 ms kept before speech starts
const END_SILENCE_FRAMES = 35;  // 700 ms of quiet ends an utterance
const BARGE_IN_FRAMES = 6;      // 120 ms of clear speech interrupts Jarvis
const MAX_RECONNECTS = 3;

const readPause = (): { until: number; reason: string } | null => {
  try { const v = JSON.parse(localStorage.getItem(PAUSE_KEY) || 'null'); return v && v.until > Date.now() ? v : null; } catch { return null; }
};
const writePause = (ms: number, reason: string) => { try { localStorage.setItem(PAUSE_KEY, JSON.stringify({ until: Date.now() + ms, reason })); } catch { /* private mode */ } };
const clockOf = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// 16 kHz mono Int16 frames (20 ms) + their loudness, from any input rate.
const WORKLET = `
class PcmFrames extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.n = 0; this.frame = new Int16Array(320); this.i = 0; this.sq = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.acc += ch[k]; this.n += 1;
      if (this.n >= this.ratio) {
        const v = Math.max(-1, Math.min(1, this.acc / this.n));
        this.acc = 0; this.n -= this.ratio; if (this.n < 0) this.n = 0;
        this.frame[this.i++] = v * 32767; this.sq += v * v;
        if (this.i === 320) {
          const rms = Math.sqrt(this.sq / 320);
          this.port.postMessage({ pcm: this.frame.buffer, rms }, [this.frame.buffer]);
          this.frame = new Int16Array(320); this.i = 0; this.sq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-frames', PcmFrames);`;

type Session = { deepgram: { token: string }; cartesia: { token: string; voiceId: string; model: string; version: string }; budget?: { state?: string; pct?: number } };

export function useDirectVoice({ onUtterance, onBargeIn }: { onUtterance: (text: string) => void; onBargeIn?: () => void }) {
  const [state, setStateRaw] = useState<RealtimeVoiceState>('off');
  const stateRef = useRef<RealtimeVoiceState>('off');
  const setState = (s: RealtimeVoiceState) => { stateRef.current = s; setStateRaw(s); };
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState('');
  const [budgetNote, setBudgetNote] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>({ room: false, agent: false, mic: false, micLevel: 0, remoteAudio: false, audioUnlocked: false, roomName: null, dispatchId: null });
  const patch = (p: Partial<VoiceDiagnostics>) => setDiagnostics(d => ({ ...d, ...p }));

  const cb = useRef({ onUtterance, onBargeIn });
  cb.current = { onUtterance, onBargeIn };

  const r = useRef({
    active: false, session: null as Session | null,
    ctx: null as AudioContext | null, stream: null as MediaStream | null, node: null as AudioWorkletNode | null,
    dg: null as WebSocket | null, tts: null as WebSocket | null, ttsReady: null as Promise<WebSocket> | null,
    // VAD
    floor: 0.004, speaking: false, loud: 0, quiet: 0, preroll: [] as ArrayBuffer[], sentSeconds: 0,
    // utterance
    finals: [] as string[], awaitingFinal: false, committed: false,
    // playback
    sources: new Set<AudioBufferSourceNode>(), nextTime: 0, ttsContext: null as string | null, ttsChars: 0, speakingOut: false,
    // timings
    tSpeechEnd: 0, tFinal: 0, tFirstText: 0, tFirstAudio: 0,
    lastActivity: Date.now(), reconnects: 0, keepAlive: 0 as number | 0, usageTimer: 0 as number | 0,
  }).current;

  const reportUsage = useCallback(async () => {
    const sttSeconds = Math.round(r.sentSeconds * 10) / 10; const ttsChars = r.ttsChars;
    if (sttSeconds <= 0 && ttsChars <= 0) return;
    r.sentSeconds = 0; r.ttsChars = 0;
    try { await fetch('/jarvis/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'usage', sttSeconds, ttsChars }) }); } catch { /* estimate only */ }
  }, [r]);

  // ---- playback ---------------------------------------------------------------------
  const stopPlayback = useCallback(() => {
    for (const s of r.sources) { try { s.stop(); } catch { /* already ended */ } }
    r.sources.clear();
    r.nextTime = 0;
    if (r.ttsContext && r.tts?.readyState === WebSocket.OPEN) {
      // Stop Cartesia generating audio nobody will hear.
      try { r.tts.send(JSON.stringify({ context_id: r.ttsContext, cancel: true })); } catch { /* socket closing */ }
    }
    r.ttsContext = null; r.speakingOut = false;
    patch({ remoteAudio: false });
  }, [r]);

  const playChunk = useCallback((b64: string) => {
    const ctx = r.ctx; if (!ctx) return;
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const samples = new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
    if (!samples.length) return;
    const buf = ctx.createBuffer(1, samples.length, 24000);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.03, r.nextTime);
    src.start(at); r.nextTime = at + buf.duration;
    r.sources.add(src);
    if (!r.tFirstAudio) {
      r.tFirstAudio = performance.now();
      if (r.tSpeechEnd) {
        const t: VoiceTimings = {
          speechEndToFinal: r.tFinal ? Math.round(r.tFinal - r.tSpeechEnd) : null,
          finalToFirstText: r.tFirstText && r.tFinal ? Math.round(r.tFirstText - r.tFinal) : null,
          firstTextToAudio: r.tFirstText ? Math.round(r.tFirstAudio - r.tFirstText) : null,
          speechEndToAudio: Math.round(r.tFirstAudio - r.tSpeechEnd),
          at: Date.now(),
        };
        voiceTimings.last = t;
        if (import.meta.env.DEV) console.debug('[jarvis voice timings]', t);
      }
    }
    r.speakingOut = true; r.lastActivity = Date.now();
    if (stateRef.current !== 'speaking') setState('speaking');
    patch({ remoteAudio: true });
    src.onended = () => {
      r.sources.delete(src);
      if (!r.sources.size && r.ctx && r.ctx.currentTime >= r.nextTime - 0.02) {
        r.speakingOut = false; patch({ remoteAudio: false });
        if (stateRef.current === 'speaking') setState('listening');
      }
    };
  }, [r]);

  const openTts = useCallback((): Promise<WebSocket> => {
    if (r.tts && r.tts.readyState === WebSocket.OPEN) return Promise.resolve(r.tts);
    if (r.ttsReady) return r.ttsReady;
    const s = r.session; if (!s) return Promise.reject(new Error('no voice session'));
    r.ttsReady = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`wss://api.cartesia.ai/tts/websocket?access_token=${encodeURIComponent(s.cartesia.token)}&cartesia_version=${encodeURIComponent(s.cartesia.version)}`);
      ws.onopen = () => { r.tts = ws; patch({ agent: true }); resolve(ws); };
      ws.onerror = () => reject(new Error('text-to-speech connection failed'));
      ws.onclose = () => { r.tts = null; r.ttsReady = null; patch({ agent: false }); };
      ws.onmessage = ev => {
        let m: { type?: string; data?: string; context_id?: string; error?: string; status_code?: number };
        try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.context_id && m.context_id !== r.ttsContext) return; // cancelled context
        if (m.type === 'chunk' && m.data) playChunk(m.data);
        else if (m.type === 'error') {
          const quota = m.status_code === 402 || m.status_code === 429 || /quota|credit|limit/i.test(String(m.error));
          console.warn(`GID_VOICE_ERROR provider=cartesia status=${m.status_code ?? '-'} quota=${quota}`);
          r.ttsContext = null;
          // TTS down: Jarvis still answers in text on screen.
          setError(quota ? 'Voice output is unavailable (Cartesia limit reached). Replies show as text.' : 'Voice output hiccup — the reply is on screen.');
        }
      };
    });
    r.ttsReady.catch(() => { r.ttsReady = null; });
    return r.ttsReady;
  }, [r, playChunk]);

  // Streamed speech: begin -> chunk(s) -> end. Each chunk is one sentence.
  const speakChunk = useCallback(async (text: string, { last = false }: { last?: boolean } = {}) => {
    const clean = speakable(text);
    if (!r.active || (!clean && !last)) return;
    if (!r.tFirstText) r.tFirstText = performance.now();
    try {
      const ws = await openTts();
      if (!r.ttsContext) { r.ttsContext = `jv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; r.tFirstAudio = 0; }
      const s = r.session!;
      ws.send(JSON.stringify({
        model_id: s.cartesia.model, transcript: clean ? `${clean} ` : '', voice: { mode: 'id', id: s.cartesia.voiceId }, language: 'en',
        context_id: r.ttsContext, continue: !last, output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: 24000 },
      }));
      r.ttsChars += clean.length;
    } catch {
      setError('Voice output is unavailable right now — replies show as text.');
    }
  }, [r, openTts]);
  const endSpeech = useCallback(() => { if (r.ttsContext) void speakChunk('', { last: true }); }, [r, speakChunk]);
  const speak = useCallback(async (text: string) => {
    const clean = speakable(text);
    if (!clean || !r.active) return false;
    stopPlayback();
    await speakChunk(clean, { last: true });
    return true;
  }, [r, speakChunk, stopPlayback]);

  // ---- speech-to-text -----------------------------------------------------------------
  const commit = useCallback(() => {
    const text = r.finals.join(' ').replace(/\s+/g, ' ').trim();
    r.finals = []; r.awaitingFinal = false; setPartial('');
    if (!text || r.committed) return;
    r.committed = true;
    r.tFinal = performance.now(); r.tFirstText = 0; r.tFirstAudio = 0;
    if (import.meta.env.DEV) console.debug('[jarvis voice] final', text);
    setState('thinking');
    cb.current.onUtterance(text);
  }, [r]);

  const stopAll = useRef<(msg?: string | null, unavailable?: boolean) => Promise<void>>(async () => {});

  const openStt = useCallback(async (): Promise<void> => {
    const s = r.session; if (!s) return;
    const q = new URLSearchParams({ model: 'nova-3', encoding: 'linear16', sample_rate: '16000', channels: '1', interim_results: 'true', smart_format: 'true', punctuate: 'true', endpointing: '300' });
    for (const k of ['Jarvis', 'GID Garage']) q.append('keyterm', k);
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, ['bearer', s.deepgram.token]);
    ws.binaryType = 'arraybuffer';
    await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error('speech-to-text connection failed')); });
    r.dg = ws; r.reconnects = 0; patch({ room: true });
    ws.onmessage = ev => {
      let m: { type?: string; is_final?: boolean; speech_final?: boolean; from_finalize?: boolean; channel?: { alternatives?: { transcript?: string }[] } };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type !== 'Results') return;
      const t = m.channel?.alternatives?.[0]?.transcript?.trim() || '';
      if (m.is_final) {
        if (t) r.finals.push(t);
        setPartial(r.finals.join(' '));
        if ((m.speech_final || m.from_finalize) && !r.speaking) commit();
      } else if (t) {
        setPartial(`${r.finals.join(' ')} ${t}`.trim()); // display only, never sent to Jarvis
      }
    };
    ws.onclose = async ev => {
      patch({ room: false });
      if (r.dg === ws) r.dg = null;
      if (!r.active) return;
      // 1008/4xx-style closes on a fresh token mean auth/billing: don't loop.
      const fatal = ev.code === 1008 || ev.code === 4001 || ev.code === 4008 || /quota|payment|credit|unauthor/i.test(ev.reason || '');
      if (fatal || r.reconnects >= MAX_RECONNECTS) {
        console.warn(`GID_VOICE_ERROR provider=deepgram close=${ev.code} fatal=${fatal}`);
        if (fatal) writePause(30 * 60_000, 'speech recognition refused (Deepgram)');
        await stopAll.current(fatal ? 'Voice unavailable: speech recognition was refused (Deepgram limit or key). Typed Jarvis still works.' : 'Voice connection dropped. Typed Jarvis still works — press Start to try again.', true);
        return;
      }
      r.reconnects += 1;
      await new Promise(res => window.setTimeout(res, 500 * 2 ** r.reconnects));
      if (!r.active) return;
      try { r.session = await fetchSession(); await openStt(); } catch (e) { await stopAll.current(e instanceof Error ? e.message : 'Voice unavailable.', true); }
    };
  }, [r, commit]);

  const onFrame = useCallback((pcm: ArrayBuffer, rms: number) => {
    patch({ micLevel: Math.min(100, Math.round(rms * 400)) });
    const playing = r.speakingOut || r.sources.size > 0;
    const threshold = playing ? Math.max(r.floor * 5, 0.045) : Math.max(r.floor * 3, 0.012);
    const loud = rms > threshold;
    if (!r.speaking) {
      if (!loud) r.floor = r.floor * 0.97 + Math.max(rms, 0.001) * 0.03;
      r.preroll.push(pcm); if (r.preroll.length > PREROLL_FRAMES) r.preroll.shift();
      r.loud = loud ? r.loud + 1 : 0;
      if (r.loud >= (playing ? BARGE_IN_FRAMES : 2)) {
        // Speech started (or the owner talked over Jarvis).
        if (playing) { stopPlayback(); setState('interrupted'); cb.current.onBargeIn?.(); }
        r.speaking = true; r.quiet = 0; r.committed = false; r.finals = []; r.lastActivity = Date.now();
        if (stateRef.current !== 'interrupted') setState('listening');
        for (const f of r.preroll) if (r.dg?.readyState === WebSocket.OPEN) { r.dg.send(f); r.sentSeconds += FRAME_MS / 1000; }
        r.preroll = [];
      }
      return;
    }
    if (r.dg?.readyState === WebSocket.OPEN) { r.dg.send(pcm); r.sentSeconds += FRAME_MS / 1000; }
    r.quiet = loud ? 0 : r.quiet + 1;
    if (loud) r.lastActivity = Date.now();
    if (r.quiet >= END_SILENCE_FRAMES) {
      // End of utterance: flush Deepgram now instead of streaming (paid) silence.
      r.speaking = false; r.loud = 0; r.tSpeechEnd = performance.now();
      if (stateRef.current === 'interrupted') setState('listening');
      if (r.dg?.readyState === WebSocket.OPEN) { r.dg.send(JSON.stringify({ type: 'Finalize' })); r.awaitingFinal = true; }
      window.setTimeout(() => { if (r.awaitingFinal) commit(); }, 1500); // safety if no final arrives
      void reportUsage();
    }
  }, [r, commit, reportUsage, stopPlayback]);

  async function fetchSession(): Promise<Session> {
    const res = await fetch('/jarvis/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'session' }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const quota = res.status === 402 || body.quota;
      if (quota) writePause(body.reason === 'budget' ? 60 * 60_000 : 30 * 60_000, body.reason === 'budget' ? 'monthly Jarvis AI budget reached' : `${body.provider || 'provider'} limit reached`);
      const e = new Error(body.reason === 'budget' ? 'Monthly Jarvis AI budget reached. Typed Jarvis still works.' : body.reason === 'not_configured' ? "Voice isn't set up yet (add the provider keys). Typed Jarvis works." : `Voice unavailable (${body.provider || 'provider'} ${body.status || res.status}). Typed Jarvis still works.`);
      throw e;
    }
    return body as Session;
  }

  const disconnectInner = useCallback(async (message: string | null = null, unavailable = false) => {
    r.active = false;
    stopPlayback();
    if (r.keepAlive) window.clearInterval(r.keepAlive);
    if (r.usageTimer) window.clearInterval(r.usageTimer);
    r.keepAlive = 0; r.usageTimer = 0;
    try { r.dg?.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* closing */ }
    try { r.dg?.close(); } catch { /* closed */ }
    try { r.tts?.close(); } catch { /* closed */ }
    r.dg = null; r.tts = null; r.ttsReady = null;
    try { r.node?.disconnect(); } catch { /* gone */ }
    r.stream?.getTracks().forEach(t => t.stop());
    try { await r.ctx?.close(); } catch { /* closed */ }
    r.node = null; r.stream = null; r.ctx = null; r.session = null;
    r.speaking = false; r.finals = []; r.preroll = [];
    setPartial('');
    await reportUsage();
    setDiagnostics(d => ({ ...d, room: false, agent: false, mic: false, micLevel: 0, remoteAudio: false }));
    setError(message);
    setState(message ? (unavailable ? 'unavailable' : 'error') : 'off');
  }, [r, stopPlayback, reportUsage]);
  stopAll.current = disconnectInner;

  const connect = useCallback(async () => {
    if (r.active || stateRef.current === 'connecting') return;
    const paused = readPause();
    if (paused) { setError(`Voice is paused until ${clockOf(paused.until)} (${paused.reason}). Typed Jarvis still works.`); setState('unavailable'); return; }
    setError(null); setState('connecting');
    try {
      r.session = await fetchSession();
      const b = r.session.budget;
      setBudgetNote(b?.state === 'warn' || b?.state === 'conscious' ? `${Math.round(b.pct || 0)}% of monthly Jarvis AI budget used` : null);
      r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      r.ctx = new AudioContext();
      await r.ctx.resume();
      patch({ mic: true, audioUnlocked: r.ctx.state === 'running' });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await r.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      r.active = true;
      await openStt();
      void openTts().catch(() => { /* reported when speaking */ });
      const src = r.ctx.createMediaStreamSource(r.stream);
      r.node = new AudioWorkletNode(r.ctx, 'pcm-frames');
      r.node.port.onmessage = e => onFrame(e.data.pcm, e.data.rms);
      src.connect(r.node);
      // Deepgram closes after ~10 s without data; KeepAlive is free, silence is not.
      r.keepAlive = window.setInterval(() => { if (!r.speaking && r.dg?.readyState === WebSocket.OPEN) r.dg.send(JSON.stringify({ type: 'KeepAlive' })); }, 7000);
      r.usageTimer = window.setInterval(() => { void reportUsage(); }, 60_000);
      r.lastActivity = Date.now();
      setState('listening');
    } catch (e) {
      const name = (e as { name?: string })?.name;
      const msg = name === 'NotAllowedError' ? 'Microphone permission is blocked for gidgarage.com. Allow it and retry.'
        : name === 'NotFoundError' ? 'No microphone was found.'
        : e instanceof Error ? e.message : 'Could not start voice.';
      await disconnectInner(msg, name !== 'NotAllowedError' && name !== 'NotFoundError');
    }
  }, [r, openStt, openTts, onFrame, reportUsage, disconnectInner]);

  const disconnect = useCallback(() => disconnectInner(null), [disconnectInner]);
  const toggle = useCallback(() => { if (r.active || stateRef.current === 'connecting') void disconnect(); else void connect(); }, [r, connect, disconnect]);

  // The page marks when Jarvis has finished thinking without speaking.
  const setThinking = useCallback((on: boolean) => {
    if (!r.active) return;
    if (on) setState('thinking');
    else if (stateRef.current === 'thinking' && !r.speakingOut) setState('listening');
  }, [r]);

  // Save credits: idle / backgrounded sessions stop themselves.
  useEffect(() => {
    if (state === 'off' || state === 'error' || state === 'unavailable' || state === 'connecting') return;
    let hidden = 0;
    const idle = window.setInterval(() => {
      if (Date.now() - r.lastActivity > IDLE_STOP_MS) void disconnectInner('Voice stopped after 4 minutes of silence to save credits. Press Start to talk again.');
    }, 15_000);
    const onVis = () => {
      if (document.hidden) hidden = window.setTimeout(() => { void disconnectInner('Voice stopped while this tab was in the background. Press Start to talk again.'); }, HIDDEN_STOP_MS);
      else if (hidden) { window.clearTimeout(hidden); hidden = 0; }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(idle); if (hidden) window.clearTimeout(hidden); document.removeEventListener('visibilitychange', onVis); };
  }, [state, r, disconnectInner]);

  useEffect(() => () => { void disconnectInner(null); }, [disconnectInner]);

  return {
    mode: 'direct' as const,
    state, error, partial, budgetNote, diagnostics,
    connected: state === 'listening' || state === 'speaking' || state === 'thinking' || state === 'interrupted',
    connect, disconnect, toggle,
    speak, speakChunk, endSpeech, stopSpeaking: stopPlayback, setThinking,
    // Compatibility with the LiveKit hook's shape.
    speakText: speak,
    markHandled: () => {},
    testVoice: async () => { await speak('Voice check. GID Garage audio is online.'); },
  };
}
