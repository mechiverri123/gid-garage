const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_BYTES = 12 * 1024 * 1024;

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
    expected_audio: 'audio/wav',
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
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
  if (!audio.size) {
    return json({ error: 'Microphone recording was empty.' }, 400);
  }
  if (audio.size > MAX_BYTES) {
    return json({ error: 'Audio segment too large.' }, 413);
  }

  const form = new FormData();
  // Explicit WAV filename/content type. Browser-generated PCM WAV is accepted
  // reliably and avoids WebM/Opus container corruption issues.
  form.append(
    'file',
    new File([await audio.arrayBuffer()], 'jarvis.wav', { type: 'audio/wav' })
  );
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'en');
  form.append(
    'prompt',
    'Michael owns GID Garage, a mobile mechanic business in Flagstaff, Arizona. ' +
    'Likely terms include Jarvis, GID Garage, jobs, leads, customers, brakes, ' +
    'diagnostics, oil changes, estimates, invoices, revenue, and Flagstaff.'
  );

  let res;
  try {
    res = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: form,
    });
  } catch (err) {
    return json({
      error: 'Could not reach OpenAI transcription.',
      detail: String(err?.message || err),
    }, 502);
  }

  if (!res.ok) {
    const raw = await res.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.error || raw;
    } catch {}

    return json({
      error: `Transcription failed (${res.status}).`,
      detail: String(detail).slice(0, 1200),
      uploaded_type: audio.type || 'unknown',
      uploaded_bytes: audio.size,
    }, res.status);
  }

  const result = await res.json();
  return json({
    ok: true,
    text: String(result?.text || '').trim(),
  });
}
