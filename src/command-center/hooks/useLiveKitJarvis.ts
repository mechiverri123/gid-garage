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

    if (room) {
      try { await room.localParticipant.setMicrophoneEnabled(false); } catch {}
      room.disconnect();
    }

    removeAudioNodes();
    setRoomName(null);
    setError(null);
    setState('off');
  }, [removeAudioNodes]);

  const connect = useCallback(async () => {
    if (roomRef.current || state === 'connecting') return;

    setError(null);
    setState('connecting');

    let permissionStream: MediaStream | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not expose microphone access.');
      }

      // IMPORTANT: ask for microphone permission immediately from the actual
      // START JARVIS click. This is much more reliable in Opera/Chromium than
      // waiting until after token fetch + WebRTC connection.
      permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const livePermissionTrack = permissionStream.getAudioTracks()[0];
      if (!livePermissionTrack || livePermissionTrack.readyState !== 'live') {
        throw new Error('Microphone permission was granted, but no live microphone track was available.');
      }

      const tokenRes = await fetch('/jarvis-livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });

      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        throw new Error(tokenBody?.error || `Voice token failed (${tokenRes.status})`);
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      roomRef.current = room;
      setRoomName(tokenBody.room_name || null);

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;

          const element = track.attach();
          element.autoplay = true;
          element.playsInline = true;
          element.style.display = 'none';
          document.body.appendChild(element);
          audioNodesRef.current.push(element);

          void element.play().catch(() => {
            setError('JARVIS is connected, but browser audio playback is blocked. Click START JARVIS again.');
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
        const remoteSpeaking = speakers.some(
          p => p.identity !== room.localParticipant.identity,
        );
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

      // Unlock remote audio while this connection was initiated by a user click.
      try {
        await room.startAudio();
      } catch {
        // Non-fatal. Remote track playback above gets another chance.
      }

      // Publish the EXACT microphone track that Opera/Windows just granted.
      // This avoids a second getUserMedia call, which can silently reopen the
      // wrong/default device in Opera even though permission succeeded.
      const micTrack = permissionStream.getAudioTracks()[0];
      const micPub = await room.localParticipant.publishTrack(micTrack, {
        source: Track.Source.Microphone,
        name: 'jarvis-microphone',
      });
      permissionStream = null;

      // Do not show LISTENING unless LiveKit really published an enabled mic.
      if (
        !micPub ||
        !micPub.track ||
        micPub.isMuted ||
        micTrack.readyState !== 'live'
      ) {
        throw new Error(
          'Connected to JARVIS, but your microphone was not published. Check Opera site microphone permission and retry.',
        );
      }

      setState('listening');
    } catch (err: any) {
      if (permissionStream) {
        for (const track of permissionStream.getTracks()) track.stop();
      }

      const room = roomRef.current;
      roomRef.current = null;
      if (room) room.disconnect();

      removeAudioNodes();

      const raw = err?.message || 'Could not start realtime JARVIS.';
      const message =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission is blocked for this site. Allow microphone access in Opera, then retry.'
          : err?.name === 'NotFoundError'
            ? 'No microphone was found. Check the selected Windows input device.'
            : raw;

      setError(message);
      setState('error');
    }
  }, [removeAudioNodes, state]);

  const toggle = useCallback(() => {
    if (roomRef.current || state === 'connecting') void disconnect();
    else void connect();
  }, [connect, disconnect, state]);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

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
