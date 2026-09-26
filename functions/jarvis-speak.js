// Cloudflare Pages Function — POST /jarvis-speak
// Generates GID's spoken response with OpenAI TTS.
// Requires OPENAI_API_KEY in the deployed Cloudflare Pages environment.

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_TEXT = 4096;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function friendlyUpstreamError(status, detail) {
  const lower = String(detail || '').toLowerCase();
  if (status === 401) return 'OpenAI rejected the API key. Check OPENAI_API_KEY in Cloudflare.';
  if (status === 429 && (lower.includes('quota') || lower.includes('billing') || lower.includes('insufficient'))) {
    return 'OpenAI API billing/credits are not active for this key.';
  }
  if (status === 429) return 'OpenAI voice rate limit reached. Try again in a moment.';
  if (status === 400) return 'OpenAI rejected the voice request. Check the deployed voice settings.';
  if (status === 403) return 'This OpenAI project is not allowed to use the voice endpoint.';
  return `OpenAI voice request failed (${status}).`;
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    configured: !!env.OPENAI_API_KEY,
    model: 'gpt-4o-mini-tts',
    voice: 'cedar',
  });
}

export async function onRequestPost({ request, env }) {
  // Cloudflare Access normally injects this header at the edge. Do not block
  // localhost/dev previews where the header will not exist.
  const host = new URL(request.url).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!isLocal && !accessJwt) return json({ error: 'Jarvis voice endpoint is behind Cloudflare Access but no Access JWT reached the function.' }, 401);

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'OPENAI_API_KEY is missing in the deployed Cloudflare environment.' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const text = String(body?.text || '').trim().slice(0, MAX_TEXT);
  if (!text) return json({ error: 'No text supplied.' }, 400);

  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: 'cedar',
    input: text,
    instructions: [
      'Speak as a refined cinematic British-inspired male AI business assistant.',
      'Calm, articulate, intelligent, composed, precise, and slightly formal.',
      'Use a controlled lower register, crisp consonants, restrained emotion, and subtle warmth.',
      'Keep delivery concise and natural. Pause briefly around names, dates, and business numbers.',
      'Do not imitate a specific actor, celebrity, or copyrighted character performance.',
    ].join(' '),
    response_format: 'wav',
    speed: 1.02,
  };

  let upstream;
  try {
    upstream = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json({ error: 'Could not reach OpenAI voice service.', detail: String(err?.message || err) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({
      error: friendlyUpstreamError(upstream.status, detail),
      status: upstream.status,
      detail: detail.slice(0, 1200),
    }, upstream.status);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'audio/wav');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-GID-Voice', 'AI-generated');

  return new Response(upstream.body, { status: 200, headers });
}
