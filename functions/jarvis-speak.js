// Cloudflare Pages Function — POST /jarvis-speak
// Turns the final GID assistant response into spoken audio.
// Requires OPENAI_API_KEY in Cloudflare Pages/Workers environment variables.

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_TEXT = 4096;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessJwt) return json({ error: 'Unauthorized' }, 401);

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured.' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const text = String(body?.text || '').trim().slice(0, MAX_TEXT);
  if (!text) return json({ error: 'No text supplied.' }, 400);

  // This is intentionally a "cinematic British-inspired AI" profile rather
  // than an imitation of a particular actor/character. Built-in voice keeps
  // setup instant; approved custom voices can be swapped in later by ID.
  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: 'cedar',
    input: text,
    instructions: [
      'Speak as a refined cinematic British-inspired male AI assistant.',
      'Calm, articulate, precise, intelligent, composed, and slightly formal.',
      'Use a controlled lower register, crisp consonants, restrained emotion, and subtle warmth.',
      'Keep the delivery efficient and natural, with brief pauses around important business numbers.',
      'Do not imitate any specific actor, celebrity, or copyrighted character performance.',
    ].join(' '),
    response_format: 'wav',
    speed: 1.03,
  };

  const upstream = await fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Voice generation failed.', detail: detail.slice(0, 800) }, upstream.status);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'audio/wav');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-GID-Voice', 'AI-generated');

  return new Response(upstream.body, { status: 200, headers });
}
