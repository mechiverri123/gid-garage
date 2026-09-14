/**
 * repair-breakdown — Cloudflare Pages Function
 * v5: normalizes each repair into a CANONICAL key before checking the
 * cache, so "2007 RAV4" and "2006 RAV4 2.4L" doing engine work share one
 * cached entry (keyed by shared engine code), and suspension/brake/body
 * work shares one entry per chassis platform generation instead. This
 * still does no research itself — just a small, fast classification call
 * — the actual research still happens in repair_worker.py on your laptop.
 *
 * POST /repair-breakdown   { "repair": "..." }
 * GET  /repair-breakdown?key=...
 *
 * Setup required (Pages > Settings > Environment variables):
 *   - ANTHROPIC_API_KEY   (small/cheap classification calls only — a few
 *     hundred tokens each, effectively fractions of a cent; the actual
 *     research stays on your subscription via the laptop worker)
 *   - SUPABASE_URL (or reuses VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_KEY
 *
 * Run the (updated) supabase_migration.sql once before using this —
 * it adds the repair_aliases table this version needs.
 */

function normalizeRawKey(repair) {
  return repair.trim().toLowerCase().replace(/\s+/g, ' ');
}

function supabaseHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

const NORMALIZE_SYSTEM_PROMPT = `You convert a repair description into a canonical cache key so \
similar jobs across model years/trims that share the same underlying hardware map to the same key.

Rules:
- For engine, drivetrain, fuel system, or electrical work: key by the ENGINE CODE \
  shared across years/trims (e.g. "Toyota 2AZ-FE 2.4L", "VW EA888 2.0T"), not the model year. \
  If you don't know the exact engine code with confidence, fall back to "MAKE MODEL YEAR-RANGE".
- For suspension, brakes, body, or interior work: key by the CHASSIS PLATFORM generation \
  shared across years (e.g. "Toyota RAV4 XA30 2006-2012"), not a single model year, \
  UNLESS the repair description gives a specific year that narrows to a mid-cycle change \
  you're aware of — in that case keep the specific year.
- Always end the key with " - " followed by the repair type in a few words.
- If you're not confident about grouping (unfamiliar vehicle, ambiguous description), \
  just normalize the original description minimally instead of guessing a platform/engine code.

Respond with ONLY the canonical key string. No explanation, no quotes, no punctuation besides what's in the key itself.`;

async function normalizeToCanonicalKey(repair, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: NORMALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: repair }],
    }),
  });
  if (!res.ok) return normalizeRawKey(repair); // fall back to raw normalization if classification fails
  const data = await res.json();
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text || normalizeRawKey(repair);
}

export async function onRequestPost({ request, env, waitUntil }) {
  const { repair } = await request.json();
  if (!repair || typeof repair !== 'string') {
    return new Response(JSON.stringify({ error: "Missing 'repair' field" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey || !env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured — check ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = supabaseHeaders(serviceKey);
  const rawKey = normalizeRawKey(repair);

  // Fast path: have we seen this exact phrasing before? Skip classification entirely.
  const aliasRes = await fetch(`${base}/repair_aliases?raw_key=eq.${encodeURIComponent(rawKey)}&select=canonical_key`, { headers });
  const aliasRows = aliasRes.ok ? await aliasRes.json() : [];
  let canonicalKey = aliasRows[0]?.canonical_key;
  let wasMerged = false;

  if (!canonicalKey) {
    canonicalKey = await normalizeToCanonicalKey(repair, env.ANTHROPIC_API_KEY);
    wasMerged = canonicalKey !== rawKey;
    // Record this alias (fire-and-forget, doesn't block the response)
    waitUntil(fetch(`${base}/repair_aliases`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ raw_key: rawKey, canonical_key: canonicalKey }),
    }));
  }

  const existingRes = await fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(canonicalKey)}&select=*`, { headers });
  const existing = existingRes.ok ? await existingRes.json() : [];

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === 'done') {
      waitUntil(fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(canonicalKey)}`, {
        method: 'PATCH', headers, body: JSON.stringify({ use_count: (row.use_count || 1) + 1, last_used_at: new Date().toISOString() }),
      }));
      return new Response(JSON.stringify({ status: 'done', key: canonicalKey, merged: wasMerged, ...row.breakdown }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ status: row.status, key: canonicalKey, merged: wasMerged }), { headers: { 'Content-Type': 'application/json' } });
  }

  await fetch(`${base}/repair_breakdowns`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ key: canonicalKey, status: 'pending' }),
  });

  return new Response(JSON.stringify({ status: 'pending', key: canonicalKey, merged: wasMerged, queued: true }), { headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response(JSON.stringify({ error: 'Missing key param' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const headers = supabaseHeaders(env.SUPABASE_SERVICE_KEY);
  const base = `${supabaseUrl}/rest/v1`;

  const res = await fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(key)}&select=*`, { headers });
  const rows = res.ok ? await res.json() : [];
  if (rows.length === 0) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const row = rows[0];
  if (row.status === 'done') return new Response(JSON.stringify({ status: 'done', key, ...row.breakdown }), { headers: { 'Content-Type': 'application/json' } });
  if (row.status === 'error') return new Response(JSON.stringify({ status: 'error', error: row.error_message }), { headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ status: row.status }), { headers: { 'Content-Type': 'application/json' } });
}
