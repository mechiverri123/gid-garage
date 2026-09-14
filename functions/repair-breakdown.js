/**
 * repair-breakdown — Cloudflare Pages Function
 * v4: does NO research itself anymore. Just reads/writes the Supabase
 * queue/cache. All actual research happens in repair_worker.py running
 * on your laptop overnight. This function can never time out because it
 * never does anything slow — it's just a database read or a single insert.
 *
 * POST /repair-breakdown   { "repair": "..." }
 *   -> cached and done: returns the full breakdown immediately
 *   -> not yet researched: queues it (status 'pending') for repair_worker.py
 *      to pick up, returns { status: 'pending' }
 *
 * GET /repair-breakdown?key=...
 *   -> poll this to check if a queued repair is done yet
 *
 * Setup required (Pages > Settings > Environment variables):
 *   - SUPABASE_URL (or reuses VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_KEY
 * (No ANTHROPIC_API_KEY needed here anymore — that lives on your laptop now.)
 *
 * Run supabase_migration.sql once before using this.
 */

function normalizeKey(repair) {
  return repair.trim().toLowerCase().replace(/\s+/g, ' ');
}

function supabaseHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

export async function onRequestPost({ request, env, waitUntil }) {
  const { repair } = await request.json();
  if (!repair || typeof repair !== 'string') {
    return new Response(JSON.stringify({ error: "Missing 'repair' field" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const key = normalizeKey(repair);
  const base = `${supabaseUrl}/rest/v1`;
  const headers = supabaseHeaders(serviceKey);

  const existingRes = await fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(key)}&select=*`, { headers });
  const existing = existingRes.ok ? await existingRes.json() : [];

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === 'done') {
      waitUntil(fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH', headers, body: JSON.stringify({ use_count: (row.use_count || 1) + 1, last_used_at: new Date().toISOString() }),
      }));
      return new Response(JSON.stringify({ status: 'done', key, ...row.breakdown }), { headers: { 'Content-Type': 'application/json' } });
    }
    // pending / processing / error — client polls GET
    return new Response(JSON.stringify({ status: row.status, key }), { headers: { 'Content-Type': 'application/json' } });
  }

  // New — queue it, the laptop worker will pick it up whenever it's running
  await fetch(`${base}/repair_breakdowns`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ key, status: 'pending' }),
  });

  return new Response(JSON.stringify({ status: 'pending', key, queued: true }), { headers: { 'Content-Type': 'application/json' } });
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
  return new Response(JSON.stringify({ status: row.status }), { headers: { 'Content-Type': 'application/json' } }); // 'pending' or 'processing'
}
