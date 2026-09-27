import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return json({
    ok: true,
    configured: !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    agent_name: env.LIVEKIT_AGENT_NAME || 'gid-jarvis',
  });
}

export async function onRequestPost({ request, env }) {
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const serverUrl = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const agentName = env.LIVEKIT_AGENT_NAME || 'gid-jarvis';

  if (!serverUrl || !apiKey || !apiSecret) {
    return json({ error: 'LiveKit is not configured on Cloudflare.' }, 500);
  }

  // Room configuration is only applied when a room is first created, so each
  // browser voice session gets a unique room. That guarantees the named GID
  // agent is dispatched instead of relying on a stale room configuration.
  const roomName = `gid-jarvis-${crypto.randomUUID()}`;
  const identity = `michael-${crypto.randomUUID().slice(0, 8)}`;

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

  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata: JSON.stringify({
          app: 'gid-garage',
          surface: 'jarvis',
          owner: 'Michael',
        }),
      }),
    ],
  });

  return json({
    server_url: serverUrl,
    participant_token: await token.toJwt(),
    room_name: roomName,
    agent_name: agentName,
  });
}
