/**
 * repair-guide-direct — Cloudflare Pages Function
 *
 * v2 (configuration-first): the primary path is now configuration_id +
 * repair_id — engine/powertrain/drivetrain/transmission/trim/market are
 * already baked into the configuration, so there's no separate engine
 * string to match. The legacy generation_id + engine (string) + repair_id
 * path from v1 still works unmodified for any old links/bookmarks.
 *
 * Lookup order for the configuration path:
 *   1. An exact repair_guides row already anchored to this configuration_id.
 *   2. A repair_guide_applicability row linking this configuration to some
 *      OTHER repair_guides row for the same repair_id (reuse — e.g. one
 *      researched guide intentionally marked applicable to a sibling
 *      configuration, so it isn't re-researched from scratch).
 *   3. Nothing -> { status: 'none' }.
 *
 * GET /repair-guide-direct?configuration_id=456&repair_id=27
 *   -> the matching guide's status/content, or { status: 'none' }
 * GET /repair-guide-direct?generation_id=25&engine=5.7L%20HEMI&repair_id=27
 *   -> LEGACY path, unchanged behavior
 *
 * POST /repair-guide-direct
 *   { configuration_id: 456, repair_id: 27, priority?: boolean }
 *   -> queues a new guide (status: 'pending'), anchored to this exact
 *      configuration, for the worker to research
 *   { generation_id: 25, engine: "5.7L HEMI", repair_id: 27, priority?: boolean }
 *   -> LEGACY path, unchanged behavior
 *
 * Setup required: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
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

// ---- Legacy generation_id + engine-string path (unchanged from v1) --------
async function findDirectGuideByGeneration(env, generationId, engine, repairId) {
  const res = await sb(env, `/repair_guides?generation_id=eq.${generationId}&repair_id=eq.${repairId}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.find((r) => r.engine && r.engine.toLowerCase() === engine.toLowerCase()) || null;
}

// ---- New configuration_id path ---------------------------------------------
async function findDirectGuideByConfiguration(env, configurationId, repairId) {
  const directRes = await sb(env, `/repair_guides?configuration_id=eq.${configurationId}&repair_id=eq.${repairId}&select=*`);
  if (directRes.ok) {
    const rows = await directRes.json();
    if (rows[0]) return rows[0];
  }

  // No guide anchored directly to this configuration -- check whether some
  // OTHER guide has been explicitly marked applicable to it.
  const applicRes = await sb(
    env,
    `/repair_guide_applicability?vehicle_configuration_id=eq.${configurationId}&select=repair_guide_id,repair_guides(*)`
  );
  if (!applicRes.ok) return null;
  const applicRows = await applicRes.json();
  const match = applicRows.find((row) => row.repair_guides && row.repair_guides.repair_id === Number(repairId));
  return match ? match.repair_guides : null;
}

function guideResponse(row) {
  if (row.status === 'done') return { status: 'done', key: String(row.id), caveats: row.caveats || null, ...row.content };
  if (row.status === 'error') return { status: 'error', error: row.error_message, key: String(row.id) };
  return { status: row.status, key: String(row.id) };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const configurationId = url.searchParams.get('configuration_id');
  const generationId = url.searchParams.get('generation_id');
  const engine = clean(url.searchParams.get('engine'));
  const repairId = url.searchParams.get('repair_id');

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  if (configurationId) {
    if (!repairId) return json({ error: 'repair_id is required' }, 400);
    const row = await findDirectGuideByConfiguration(env, configurationId, repairId);
    return json(row ? guideResponse(row) : { status: 'none' });
  }

  if (generationId) {
    if (!engine || !repairId) return json({ error: 'generation_id, engine and repair_id are required' }, 400);
    const row = await findDirectGuideByGeneration(env, generationId, engine, repairId);
    return json(row ? guideResponse(row) : { status: 'none' });
  }

  return json({ error: 'configuration_id + repair_id, or generation_id + engine + repair_id, are required' }, 400);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const { configuration_id: configurationId, generation_id: generationId, repair_id: repairId, priority } = body || {};
  const engine = clean(body?.engine);

  if (configurationId) {
    if (!repairId) return json({ error: 'repair_id is required' }, 400);

    const existing = await findDirectGuideByConfiguration(env, configurationId, repairId);
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
      body: JSON.stringify({ configuration_id: configurationId, repair_id: repairId, status: 'pending', error_message: null, priority: !!priority }),
    });
    if (!res.ok) return json({ error: 'Could not queue repair guide', detail: await res.text() }, 502);
    const rows = await res.json();
    return json({ status: 'pending', key: String(rows[0].id), queued: true });
  }

  if (generationId) {
    if (!engine || !repairId) return json({ error: 'generation_id, engine and repair_id are required' }, 400);

    const existing = await findDirectGuideByGeneration(env, generationId, engine, repairId);
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

  return json({ error: 'configuration_id + repair_id, or generation_id + engine + repair_id, are required' }, 400);
}
