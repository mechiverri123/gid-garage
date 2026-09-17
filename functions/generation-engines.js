/**
 * generation-engines — Cloudflare Pages Function
 *
 * The one write path for the "learn as we go" engine list. There is
 * deliberately no automatic/AI-generated engine list anywhere in this
 * system -- an engine only ever becomes a pickable option after a person
 * using the tool explicitly adds it here, once, for a given generation.
 * Every person after that just picks it from the list.
 *
 * POST /generation-engines
 *   { generation_id: 25, engine_label: "5.7L HEMI" }
 *   -> the generation_engines row (existing one returned as-is if this
 *      exact label was already added -- adding the same engine twice is a
 *      no-op, not a duplicate)
 *
 * Setup required (same env vars as repair-breakdown.js):
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function clean(v) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''; }
function sbHeaders(serviceKey) { return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }; }

async function sb(env, path, opt = {}) {
  const base = `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;
  const res = await fetch(`${base}${path}`, { ...opt, headers: { ...sbHeaders(env.SUPABASE_SERVICE_KEY), ...(opt.headers || {}) } });
  return res;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const generationId = body?.generation_id;
  const engineLabel = clean(body?.engine_label);
  if (!generationId || !engineLabel) return json({ error: 'generation_id and engine_label are required' }, 400);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  // ignore-duplicates on the (generation_id, engine_label) unique constraint
  // means adding the same engine twice is harmless, not an error.
  const res = await sb(env, '/generation_engines', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ generation_id: generationId, engine_label: engineLabel }),
  });
  if (!res.ok) return json({ error: 'Could not add engine', detail: await res.text() }, 502);
  const rows = await res.json();
  if (rows[0]) return json({ engine: rows[0] });

  // ignore-duplicates with a conflict returns no row -- fetch the existing one instead.
  const existingRes = await sb(env, `/generation_engines?generation_id=eq.${generationId}&engine_label=eq.${encodeURIComponent(engineLabel)}&select=*`);
  const existingRows = existingRes.ok ? await existingRes.json() : [];
  return json({ engine: existingRows[0] || null });
}
