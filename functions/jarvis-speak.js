// Cloudflare Pages Function — POST /jarvis-speak
// Generates GID's spoken response with OpenAI TTS.
// Requires OPENAI_API_KEY in the deployed Cloudflare Pages environment.
// IMPORTANT: Cloudflare Access should protect this route at the edge.
// This function intentionally does NOT require Cf-Access-Jwt-Assertion itself.

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_TEXT = 4096;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function friendlyUpstreamError(status, detail) {
  const lower = String(detail || '').toLowerCase();

  if (status === 401) {
    return 'OpenAI rejected the API key. Check OPENAI_API_KEY in Cloudflare.';
  }

  if (status === 429 && (
    lower.includes('quota') ||
    lower.includes('billing') ||
    lower.includes('insufficient') ||
    lower.includes('credit')
  )) {
    return 'OpenAI API billing or credits are not active for this key.';
  }

  if (status === 429) {
    return 'OpenAI voice rate limit reached. Try again in a moment.';
  }

  if (status === 400) {
    return 'OpenAI rejected the voice request. Check the deployed voice settings.';
  }

  if (status === 403) {
    return 'This OpenAI project is not allowed to use the voice endpoint.';
  }

  return `OpenAI voice request failed (${status}).`;
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    configured: !!env.OPENAI_API_KEY,
    model: 'gpt-4o-mini-tts',
    voice: 'cedar',
    accessValidation: 'handled-by-cloudflare-edge',
  });
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return json({
      error: 'OPENAI_API_KEY is missing in the deployed Cloudflare environment.',
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const text = String(body?.text || '').trim().slice(0, MAX_TEXT);
  if (!text) {
    return json({ error: 'No text supplied.' }, 400);
  }

  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: 'cedar',
    input: text,
    instructions: [
      'Speak as a sophisticated cinematic British male AI assistant for Michael, owner of GID Garage.',
      'Use a refined modern British accent, a calm lower register, crisp diction, and measured deliberate pacing.',
      'Sound intelligent, composed, understated, and confident.',
      'Use restrained emotion with subtle warmth. Never sound cheerful, cartoonish, robotic, breathy, theatrical, or like an announcer.',
      'Pause briefly around names, dates, money, warnings, and action items.',
      'Speak slightly slower than normal conversation and keep phrasing concise.',
      'Address Michael naturally when appropriate, but not in every sentence.',
      'Do not imitate any specific actor, celebrity, or copyrighted character performance.',
    ].join(' '),
    response_format: 'wav',
    speed: 0.94,
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
    return json({
      error: 'Could not reach OpenAI voice service.',
      detail: String(err?.message || err),
    }, 502);
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
  headers.set('X-GID-Voice', 'openai-cedar');

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
