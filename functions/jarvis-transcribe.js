// Cloudflare Pages Function — POST /jarvis-transcribe
// Robust microphone transcription for the always-listening GID Jarvis.
// Requires OPENAI_API_KEY in the deployed Cloudflare environment.

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_BYTES = 8 * 1024 * 1024;

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
    configured: !!env.OPENAI_API_KEY,
    model: 'gpt-4o-mini-transcribe',
  });
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: 'OPENAI_API_KEY is missing in Cloudflare.' }, 500);
  }

  let incoming;
  try {
    incoming = await request.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data audio upload.' }, 400);
  }

  const audio = incoming.get('audio');
  if (!(audio instanceof File)) {
    return json({ error: 'No audio file supplied.' }, 400);
  }
  if (audio.size <= 0) {
    return json({ error: 'The microphone recording was empty.' }, 400);
  }
  if (audio.size > MAX_BYTES) {
    return json({ error: 'Audio segment was too large.' }, 413);
  }

  const form = new FormData();
  form.append('file', audio, audio.name || 'speech.webm');
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'en');
  form.append(
    'prompt',
    'Michael is the owner of GID Garage, a mobile mechanic business in Flagstaff, Arizona. Common terms include Jarvis, GID Garage, jobs, leads, customers, brakes, diagnostics, oil changes, estimates, invoices, revenue, Flagstaff.'
  );

  let upstream;
  try {
    upstream = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    return json({
      error: 'Could not reach OpenAI transcription.',
      detail: String(err?.message || err),
    }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({
      error: `Transcription failed (${upstream.status}).`,
      detail: detail.slice(0, 1000),
    }, upstream.status);
  }

  const result = await upstream.json();
  return json({
    ok: true,
    text: String(result?.text || '').trim(),
  });
}
