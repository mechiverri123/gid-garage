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
    provider: env.JARVIS_VOICE_URL ? 'piper-jarvis' : (env.OPENAI_API_KEY ? 'openai-fallback' : 'none'),
    jarvis_voice_configured: !!env.JARVIS_VOICE_URL,
    openai_fallback_configured: !!env.OPENAI_API_KEY,
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

  // 2) Optional OpenAI fallback so voice still works if the container is down.
  if (env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'onyx',
        input: text,
        instructions:
          'Speak as a polished cinematic British male AI assistant. ' +
          'Use a low, controlled, precise delivery with restrained emotion. ' +
          'Do not imitate any specific actor or copyrighted character performance.',
        response_format: 'wav',
        speed: 0.92,
      }),
    });

    if (res.ok) {
      const audio = await res.arrayBuffer();
      return new Response(audio, {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': 'no-store',
          'X-GID-Voice': 'openai-fallback',
        },
      });
    }

    const detail = await res.text();
    return json({
      error: `Both JARVIS voice and OpenAI fallback failed (${res.status}).`,
      detail: detail.slice(0, 1200),
    }, 502);
  }

  return json({
    error: 'JARVIS voice service is not configured.',
    detail: 'Set JARVIS_VOICE_URL (and JARVIS_VOICE_SECRET if used) in Cloudflare.',
  }, 503);
}
