import { AccessToken, LiveKitAPI } from 'livekit-server-sdk';
import { requireAccess } from './_lib/access-auth.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function apiHost(url) {
  return String(url || '')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

async function handleGet({ env }) {
  return json({
    ok: true,
    configured: !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    agent_name: env.LIVEKIT_AGENT_NAME || 'gid-jarvis',
    dispatch_mode: 'explicit-only',
  });
}

async function handlePost({ env }) {
  const serverUrl = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const agentName = env.LIVEKIT_AGENT_NAME || 'gid-jarvis';

  if (!serverUrl || !apiKey || !apiSecret) {
    return json({ error: 'LiveKit is not configured on Cloudflare.' }, 500);
  }

  const roomName = `gid-jarvis-${crypto.randomUUID()}`;
  const identity = `michael-${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Explicit dispatch ONLY. No RoomConfiguration / RoomAgentDispatch is
    // embedded in the participant token, so the room cannot get a second
    // automatic/unnamed dispatch from this endpoint.
    const api = new LiveKitAPI({
      host: apiHost(serverUrl),
      apiKey,
      secret: apiSecret,
    });

    const dispatch = await api.agentDispatch.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({
        app: 'gid-garage',
        surface: 'jarvis',
        owner: 'Michael',
      }),
    });

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: 'Michael',
      ttl: '20m',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return json({
      server_url: serverUrl,
      participant_token: await token.toJwt(),
      room_name: roomName,
      agent_name: agentName,
      dispatch_id: dispatch?.id || null,
      dispatch_mode: 'explicit-only',
    });
  } catch (error) {
    return json({
      error: 'LiveKit agent dispatch failed.',
      detail: error instanceof Error ? error.message : String(error),
    }, 502);
  }
}

// Only a verified Cloudflare Access user (CLAUDE.md §0).
export const onRequestGet = requireAccess(handleGet);
export const onRequestPost = requireAccess(handlePost);
