// Cloudflare Pages Function — /jarvis-speak
// Primary voice: self-hosted Piper community JARVIS voice service.
// Optional fallback: existing OpenAI TTS when OPENAI_API_KEY is set.

const MAX_TEXT = 1800;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    provider: env.JARVIS_VOICE_URL ? 'piper-jarvis-strict' : 'none',
    jarvis_voice_configured: !!env.JARVIS_VOICE_URL,
    openai_fallback_configured: false,
    strict_voice_mode: true,
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const text = String(body?.text || '').trim().slice(0, MAX_TEXT);
  if (!text) return json({ error: 'No text supplied.' }, 400);

  // 1) Community Piper JARVIS voice
  if (env.JARVIS_VOICE_URL) {
    const endpoint = `${String(env.JARVIS_VOICE_URL).replace(/\/$/, '')}/speak`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.JARVIS_VOICE_SECRET
            ? { 'X-Jarvis-Secret': env.JARVIS_VOICE_SECRET }
            : {}),
        },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const audio = await res.arrayBuffer();
        return new Response(audio, {
          status: 200,
          headers: {
            'Content-Type': res.headers.get('Content-Type') || 'audio/wav',
            'Cache-Control': 'no-store',
            'X-GID-Voice': 'community-piper-jarvis',
          },
        });
      }

      const detail = await res.text();
      console.error('Piper JARVIS voice failed', res.status, detail.slice(0, 1000));
    } catch (err) {
      console.error('Piper JARVIS voice request failed', err);
    }
  }

  // STRICT MODE:
  // Do not silently fall back to OpenAI. If Piper fails, surface the real
  // failure so Michael always knows which voice he is hearing.
  return json({
    error: 'Piper JARVIS voice failed.',
    detail:
      'The Railway JARVIS voice service did not return audio. OpenAI fallback is intentionally disabled so the app cannot secretly switch voices.',
  }, 502);
}
