import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';

export type RealtimeVoiceState = 'off' | 'connecting' | 'listening' | 'speaking' | 'error';

export type VoiceDiagnostics = {
  room: boolean;
  agent: boolean;
  mic: boolean;
  micLevel: number;
  remoteAudio: boolean;
  audioUnlocked: boolean;
  roomName: string | null;
  dispatchId: string | null;
};

// Voice runs on LiveKit Inference (STT + LLM + TTS on one account). Every
// minute the mic streams costs STT credits, so the session stops itself when
// nobody is talking, and a quota error pauses voice instead of retrying.
const IDLE_STOP_MS = 4 * 60_000;      // no speech from either side
const HIDDEN_STOP_MS = 60_000;        // tab in the background
const QUOTA_PAUSE_MS = 30 * 60_000;   // LiveKit quota exhausted
const RATE_PAUSE_MS = 2 * 60_000;     // plain 429 (burst rate limit)
const PAUSE_KEY = 'gid.voicePausedUntil';
const readPause = (): { until: number; reason: string } | null => {
  try { const v = JSON.parse(localStorage.getItem(PAUSE_KEY) || 'null'); return v && v.until > Date.now() ? v : null; } catch { return null; }
};
const writePause = (ms: number, reason: string) => { try { localStorage.setItem(PAUSE_KEY, JSON.stringify({ until: Date.now() + ms, reason })); } catch { /* private mode */ } };
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const EMPTY_DIAGNOSTICS: VoiceDiagnostics = {
  room: false,
  agent: false,
  mic: false,
  micLevel: 0,
  remoteAudio: false,
  audioUnlocked: false,
  roomName: null,
  dispatchId: null,
};

// onUserTranscript: each finished sentence the owner speaks (the agent's
// lk.transcription text stream), so on-screen commands like "close jobs" or
// "show payment" work by voice too.
// onScreen: views the voice agent opens ("pull up Jill's jobs"), sent on the
// gid.ui topic as { actions: [...] } (jarvis-agent/agent.py show_on_screen).
export function useLiveKitJarvis(onUserTranscript?: (text: string) => void, onScreen?: (action: unknown) => void) {
  const transcriptRef = useRef(onUserTranscript);
  transcriptRef.current = onUserTranscript;
  const screenRef = useRef(onScreen);
  screenRef.current = onScreen;
  const [state, setState] = useState<RealtimeVoiceState>('off');
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(EMPTY_DIAGNOSTICS);

  const roomRef = useRef<Room | null>(null);
  const micTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioNodesRef = useRef<HTMLMediaElement[]>([]);
  const analyserCleanupRef = useRef<(() => void) | null>(null);

  const patchDiagnostics = useCallback((patch: Partial<VoiceDiagnostics>) => {
    setDiagnostics(prev => ({ ...prev, ...patch }));
  }, []);

  const removeAudioNodes = useCallback(() => {
    for (const el of audioNodesRef.current) {
      try { el.pause(); } catch {}
      try { el.remove(); } catch {}
    }
    audioNodesRef.current = [];
  }, []);

  const stopMicMeter = useCallback(() => {
    analyserCleanupRef.current?.();
    analyserCleanupRef.current = null;
  }, []);

  const startMicMeter = useCallback((track: LocalAudioTrack) => {
    stopMicMeter();
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const stream = new MediaStream([track.mediaStreamTrack]);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let timer = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.max(0, Math.min(100, Math.round(rms * 500)));
      patchDiagnostics({ micLevel: level });
      timer = window.setTimeout(tick, 150);
    };
    tick();

    analyserCleanupRef.current = () => {
      window.clearTimeout(timer);
      try { source.disconnect(); } catch {}
      try { analyser.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      patchDiagnostics({ micLevel: 0 });
    };
  }, [patchDiagnostics, stopMicMeter]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;

    stopMicMeter();

    if (micTrackRef.current) {
      try { micTrackRef.current.stop(); } catch {}
      micTrackRef.current = null;
    }

    if (room) {
      try { await room.localParticipant.setMicrophoneEnabled(false); } catch {}
      room.disconnect();
    }

    removeAudioNodes();
    setRoomName(null);
    setError(null);
    setDiagnostics(EMPTY_DIAGNOSTICS);
    setState('off');
  }, [removeAudioNodes, stopMicMeter]);

  // Stop voice but keep the reason on screen (typed Jarvis is unaffected).
  const stopWith = useCallback(async (message: string) => {
    await disconnect();
    setError(message);
    setState('error');
  }, [disconnect]);
  const lastActivity = useRef(Date.now());

  const connect = useCallback(async () => {
    if (roomRef.current || state === 'connecting') return;
    const paused = readPause();
    if (paused) {
      // No token request = no agent dispatch = no credits spent on a known-dead quota.
      setError(`Voice is paused until ${clock(paused.until)} (${paused.reason}). Typed Jarvis still works.`);
      setState('error');
      return;
    }
    lastActivity.current = Date.now();
    agentLeftExpected.current = false;

    setError(null);
    setDiagnostics(EMPTY_DIAGNOSTICS);
    setState('connecting');

    let room: Room | null = null;
    let micTrack: LocalAudioTrack | null = null;

    try {
      micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      micTrackRef.current = micTrack;
      patchDiagnostics({ mic: micTrack.mediaStreamTrack.readyState === 'live' });
      startMicMeter(micTrack);

      const tokenRes = await fetch('/jarvis-livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({}),
      });

      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        throw new Error(
          tokenBody?.detail
            ? `${tokenBody?.error || 'Voice token failed'} ${tokenBody.detail}`
            : tokenBody?.error || `Voice token failed (${tokenRes.status})`,
        );
      }

      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
      });

      roomRef.current = room;
      const liveRoom = room;
      liveRoom.registerTextStreamHandler('lk.transcription', async (reader, participant) => {
        if (participant.identity !== liveRoom.localParticipant.identity) return; // the agent's own words
        const text = (await reader.readAll()).trim();
        if (reader.info.attributes?.['lk.transcription_final'] === 'false' || !text) return;
        transcriptRef.current?.(text);
      });
      const applyScreen = (raw: string, fromIdentity?: string) => {
        if (fromIdentity === liveRoom.localParticipant.identity) return;
        try {
          const msg = JSON.parse(raw) as { actions?: unknown[] };
          for (const a of msg.actions ?? []) screenRef.current?.(a);
        } catch { /* not a screen message */ }
      };
      liveRoom.registerTextStreamHandler('gid.ui', async (reader, participant) => applyScreen(await reader.readAll(), participant.identity));
      // The agent reports LiveKit Inference quota/rate limits here, then leaves.
      liveRoom.registerTextStreamHandler('gid.status', async reader => {
        try {
          const msg = JSON.parse(await reader.readAll()) as { voice?: string; component?: string; status?: number | null; quota?: boolean };
          if (msg.voice !== 'unavailable') return;
          const part = msg.component === 'stt' ? 'speech recognition' : msg.component === 'tts' ? 'voice output' : msg.component === 'llm' ? 'the voice model' : 'voice';
          const reason = msg.quota ? `LiveKit usage limit reached for ${part}` : `LiveKit ${part} unavailable`;
          writePause(msg.quota ? QUOTA_PAUSE_MS : RATE_PAUSE_MS, reason);
          agentLeftExpected.current = true;
          await stopWith(`Voice unavailable: ${reason}. Typed Jarvis still works.`);
        } catch { /* ignore malformed status */ }
      });
      liveRoom.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic === 'gid.ui') applyScreen(new TextDecoder().decode(payload), participant?.identity);
      });
      setRoomName(tokenBody.room_name || null);
      patchDiagnostics({
        roomName: tokenBody.room_name || null,
        dispatchId: tokenBody.dispatch_id || null,
      });

      const syncAgentPresence = () => {
        const agentPresent = room ? room.remoteParticipants.size > 0 : false;
        patchDiagnostics({ agent: agentPresent });
        if (agentPresent && room?.state === ConnectionState.Connected) {
          setState(current => current === 'speaking' ? current : 'listening');
        }
      };

      room.on(RoomEvent.ParticipantConnected, syncAgentPresence);
      room.on(RoomEvent.ParticipantDisconnected, syncAgentPresence);

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;

          patchDiagnostics({ remoteAudio: true });

          const element = track.attach();
          element.autoplay = true;
          (element as HTMLVideoElement).playsInline = true; // attach() is typed HTMLMediaElement
          element.style.display = 'none';
          document.body.appendChild(element);
          audioNodesRef.current.push(element);

          void element.play().then(
            () => patchDiagnostics({ audioUnlocked: true }),
            () => {
              patchDiagnostics({ audioUnlocked: false });
              setError('JARVIS audio reached the browser, but Opera blocked playback. Click START JARVIS again.');
            },
          );
        },
      );

      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(el => {
          const idx = audioNodesRef.current.indexOf(el);
          if (idx !== -1) audioNodesRef.current.splice(idx, 1);
          el.remove();
        });
        patchDiagnostics({ remoteAudio: false });
      });

      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        if (speakers.length) lastActivity.current = Date.now();
        const remoteSpeaking = speakers.some(
          p => p.identity !== room?.localParticipant.identity,
        );
        if (room?.remoteParticipants.size) {
          setState(remoteSpeaking ? 'speaking' : 'listening');
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, connectionState => {
        patchDiagnostics({ room: connectionState === ConnectionState.Connected });
        if (connectionState === ConnectionState.Disconnected) {
          roomRef.current = null;
          setState('off');
        } else if (connectionState === ConnectionState.Reconnecting) {
          setState('connecting');
        }
      });

      await room.connect(tokenBody.server_url, tokenBody.participant_token);
      patchDiagnostics({ room: true });

      try {
        await room.startAudio();
        patchDiagnostics({ audioUnlocked: true });
      } catch {
        patchDiagnostics({ audioUnlocked: false });
      }

      const micPub = await room.localParticipant.publishTrack(micTrack, {
        source: Track.Source.Microphone,
        name: 'jarvis-microphone',
      });

      if (!micPub || micPub.isMuted || micTrack.mediaStreamTrack.readyState !== 'live') {
        throw new Error('The microphone track did not publish correctly.');
      }
      patchDiagnostics({ mic: true });

      syncAgentPresence();

      // Keep failed room alive for 60 seconds so it can be inspected with:
      //   lk dispatch list ROOM_NAME
      const deadline = Date.now() + 60000;
      while (room.remoteParticipants.size === 0 && Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      syncAgentPresence();

      if (room.remoteParticipants.size === 0) {
        setError(
          `Browser + mic connected, but gid-jarvis did not join within 60 seconds. Room stays open until you stop JARVIS so you can inspect dispatches: ${tokenBody.room_name}`,
        );
        setState('error');
        return; // IMPORTANT: keep room + mic alive for diagnosis
      }

      setState('listening');
    } catch (err: any) {
      if (micTrack && micTrackRef.current === micTrack) {
        try { micTrack.stop(); } catch {}
        micTrackRef.current = null;
      }

      if (room) room.disconnect();
      roomRef.current = null;
      removeAudioNodes();
      stopMicMeter();

      const raw = err?.message || 'Could not start realtime JARVIS.';
      const message =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission is blocked for gidgarage.com. Allow it in Opera and retry.'
          : err?.name === 'NotFoundError'
            ? 'No microphone was found. Check the selected Windows input device.'
            : raw;

      setError(message);
      setState('error');
    }
  }, [patchDiagnostics, removeAudioNodes, startMicMeter, state, stopMicMeter]);

  // Agent left mid-session (crash, deploy, quota): stop cleanly, no reconnect loop.
  const agentLeftExpected = useRef(false);
  useEffect(() => {
    const room = roomRef.current;
    if (!room || (state !== 'listening' && state !== 'speaking')) return;
    const onLeave = () => {
      if (room.remoteParticipants.size === 0 && !agentLeftExpected.current) {
        void stopWith('Jarvis voice stopped (the voice agent left). Typed Jarvis still works. Press Start to try again.');
      }
    };
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => { room.off(RoomEvent.ParticipantDisconnected, onLeave); };
  }, [state, stopWith]);

  // Save credits: stop after a stretch of silence or while the tab is hidden.
  useEffect(() => {
    if (state !== 'listening' && state !== 'speaking') return;
    let hiddenTimer: number | null = null;
    const idle = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_STOP_MS) void stopWith('Voice stopped after 4 minutes of silence to save LiveKit credits. Press Start to talk again.');
    }, 15_000);
    const onVisibility = () => {
      if (document.hidden) hiddenTimer = window.setTimeout(() => { void stopWith('Voice stopped while this tab was in the background. Press Start to talk again.'); }, HIDDEN_STOP_MS);
      else if (hiddenTimer) { window.clearTimeout(hiddenTimer); hiddenTimer = null; }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(idle); if (hiddenTimer) window.clearTimeout(hiddenTimer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [state, stopWith]);

  const speakText = useCallback(async (text: string) => {
    lastActivity.current = Date.now();
    const room = roomRef.current;
    const value = text.trim();

    if (!value) return false;
    if (!room || room.state !== ConnectionState.Connected) {
      setError('JARVIS voice is not connected. Click START JARVIS first.');
      return false;
    }
    if (room.remoteParticipants.size === 0) {
      setError('The browser is connected, but the JARVIS agent is not in the room.');
      return false;
    }

    try {
      await room.localParticipant.sendText(value, { topic: 'gid.speak' });
      return true;
    } catch (err: any) {
      setError(err?.message || 'Could not send speech to JARVIS.');
      return false;
    }
  }, []);

  // Tell the agent the page already handled this spoken sentence, so it skips
  // its own LLM + TTS turn (saves LiveKit Inference credits).
  const markHandled = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected || !text.trim()) return;
    void room.localParticipant.sendText(text, { topic: 'gid.handled' }).catch(() => {});
  }, []);

  const testVoice = useCallback(async () => {
    await speakText('Voice output test. GID Garage audio is online.');
  }, [speakText]);

  const toggle = useCallback(() => {
    if (roomRef.current || state === 'connecting' || state === 'error') void disconnect();
    else void connect();
  }, [connect, disconnect, state]);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return {
    state,
    error,
    roomName,
    diagnostics,
    connected: state === 'listening' || state === 'speaking',
    connect,
    disconnect,
    toggle,
    speakText,
    markHandled,
    testVoice,
  };
}
