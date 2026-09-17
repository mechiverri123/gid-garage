/**
 * repair-guide-direct — Cloudflare Pages Function
 *
 * The leaf-level companion to /taxonomy-browse and /repair-breakdown.
 * Once a person has picked their way down Year -> Make -> Model -> Engine
 * -> Category -> Repair Type, all three ids (generation_id, engine label,
 * repair_id) are already exact and known -- there is nothing left to
 * fuzzy-match or classify. This endpoint deliberately skips
 * findGeneration/resolveGenerationMakeModel/classifyRepairPhrase entirely
 * (all of that machinery exists only to turn free text into ids), so a
 * request made through the browse UI cannot suffer the make/model-naming
 * or repair-phrase-classification bugs that free-text entry is prone to.
 *
 * GET /repair-guide-direct?generation_id=25&engine=5.7L%20HEMI&repair_id=27
 *   -> the matching repair_guides row's status/content, or { status: 'none' }
 *      if nothing has ever been researched for this exact combination yet
 *
 * POST /repair-guide-direct
 *   { generation_id: 25, engine: "5.7L HEMI", repair_id: 27, priority?: boolean }
 *   -> queues a new guide (status: 'pending') for the worker to research,
 *      scoped to this exact generation+engine+repair from the moment it's
 *      created (never a generic null-engine row)
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

// The browse UI's whole premise is engine-specific accuracy -- unlike the
// free-text /repair-breakdown flow, this endpoint does NOT fall back to a
// generic (engine = null) row. Serving a generic guide as if it answered an
// engine-specific question is exactly the silent-blending problem this UI
// exists to prevent. No exact match means no data yet for this engine, full
// stop -- the caller should offer to Source it properly scoped instead.
async function findDirectGuide(env, generationId, engine, repairId) {
  const res = await sb(env, `/repair_guides?generation_id=eq.${generationId}&repair_id=eq.${repairId}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.find((r) => r.engine && r.engine.toLowerCase() === engine.toLowerCase()) || null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const generationId = url.searchParams.get('generation_id');
  const engine = clean(url.searchParams.get('engine'));
  const repairId = url.searchParams.get('repair_id');
  if (!generationId || !engine || !repairId) return json({ error: 'generation_id, engine and repair_id are required' }, 400);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const row = await findDirectGuide(env, generationId, engine, repairId);
  if (!row) return json({ status: 'none' });
  if (row.status === 'done') return json({ status: 'done', key: String(row.id), caveats: row.caveats || null, ...row.content });
  if (row.status === 'error') return json({ status: 'error', error: row.error_message, key: String(row.id) });
  return json({ status: row.status, key: String(row.id) });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { generation_id: generationId, repair_id: repairId, priority } = body || {};
  const engine = clean(body?.engine);
  if (!generationId || !engine || !repairId) return json({ error: 'generation_id, engine and repair_id are required' }, 400);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const existing = await findDirectGuide(env, generationId, engine, repairId);
  if (existing) {
    if (existing.status === 'done') {
      await sb(env, `/repair_guides?id=eq.${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ use_count: (existing.use_count || 1) + 1, last_used_at: new Date().toISOString() }),
      });
      return json({ status: 'done', key: String(existing.id), caveats: existing.caveats || null, ...existing.content });
    }
    return json({ status: existing.status, key: String(existing.id) });
  }

  const res = await sb(env, '/repair_guides', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ generation_id: generationId, repair_id: repairId, engine, status: 'pending', error_message: null, priority: !!priority }),
  });
  if (!res.ok) return json({ error: 'Could not queue repair guide', detail: await res.text() }, 502);
  const rows = await res.json();
  return json({ status: 'pending', key: String(rows[0].id), queued: true });
}
