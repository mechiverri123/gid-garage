import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';

export type RealtimeVoiceState = 'off' | 'connecting' | 'listening' | 'speaking' | 'error';

export function useLiveKitJarvis() {
  const [state, setState] = useState<RealtimeVoiceState>('off');
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioNodesRef = useRef<HTMLMediaElement[]>([]);

  const removeAudioNodes = useCallback(() => {
    for (const el of audioNodesRef.current) {
      try { el.pause(); } catch {}
      try { el.remove(); } catch {}
    }
    audioNodesRef.current = [];
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    removeAudioNodes();
    if (room) {
      try { await room.localParticipant.setMicrophoneEnabled(false); } catch {}
      room.disconnect();
    }
    setRoomName(null);
    setState('off');
  }, [removeAudioNodes]);

  const connect = useCallback(async () => {
    if (roomRef.current || state === 'connecting') return;

    setError(null);
    setState('connecting');

    try {
      const tokenRes = await fetch('/jarvis-livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });

      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) throw new Error(tokenBody?.error || `Voice token failed (${tokenRes.status})`);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
      });
      roomRef.current = room;
      setRoomName(tokenBody.room_name || null);

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach();
          element.autoplay = true;
          element.style.display = 'none';
          document.body.appendChild(element);
          audioNodesRef.current.push(element);
          void element.play().catch(() => {
            // Chromium may still require one user gesture. START JARVIS itself
            // normally satisfies that requirement.
          });
        },
      );

      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(el => {
          const idx = audioNodesRef.current.indexOf(el);
          if (idx !== -1) audioNodesRef.current.splice(idx, 1);
          el.remove();
        });
      });

      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        // The local participant is Michael. A remote active speaker is the
        // LiveKit agent, so reflect that immediately on the AI core.
        const remoteSpeaking = speakers.some(p => p.identity !== room.localParticipant.identity);
        setState(remoteSpeaking ? 'speaking' : 'listening');
      });

      room.on(RoomEvent.ConnectionStateChanged, connectionState => {
        if (connectionState === ConnectionState.Disconnected) {
          roomRef.current = null;
          removeAudioNodes();
          setState('off');
        } else if (connectionState === ConnectionState.Reconnecting) {
          setState('connecting');
        } else if (connectionState === ConnectionState.Connected) {
          setState('listening');
        }
      });

      room.on(RoomEvent.Disconnected, reason => {
        roomRef.current = null;
        removeAudioNodes();
        if (reason) setError(String(reason));
        setState('off');
      });

      await room.connect(tokenBody.server_url, tokenBody.participant_token);
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      setState('listening');
    } catch (err: any) {
      const message = err?.message || 'Could not start realtime JARVIS.';
      const room = roomRef.current;
      roomRef.current = null;
      if (room) room.disconnect();
      removeAudioNodes();
      setError(message);
      setState('error');
    }
  }, [removeAudioNodes, state]);

  const toggle = useCallback(() => {
    if (roomRef.current || state === 'connecting') void disconnect();
    else void connect();
  }, [connect, disconnect, state]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return {
    state,
    error,
    roomName,
    connected: state === 'listening' || state === 'speaking',
    connect,
    disconnect,
    toggle,
  };
}
