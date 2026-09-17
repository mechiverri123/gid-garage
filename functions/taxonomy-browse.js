/**
 * taxonomy-browse — Cloudflare Pages Function
 *
 * Read-only endpoints powering the "browse, don't type" navigation UI:
 * Year -> Make -> Model -> Engine -> Category -> Repair Type -> guide.
 * Every level here only ever returns values that actually exist in the
 * database (real generations, human-confirmed engines, real taxonomy
 * entries) -- nothing here invents or guesses anything. That's the whole
 * point of this endpoint versus the free-text /repair-breakdown flow.
 *
 * GET /taxonomy-browse?level=makes&year=2009
 *   -> string[] of distinct makes with a generation covering that year
 * GET /taxonomy-browse?level=models&year=2009&make=Ram
 *   -> string[] of distinct models for that year+make
 * GET /taxonomy-browse?level=generation&year=2009&make=Ram&model=1500
 *   -> the single matching generations row, or { generation: null }
 * GET /taxonomy-browse?level=engines&generation_id=25
 *   -> generation_engines rows for that generation (human-confirmed only)
 * GET /taxonomy-browse?level=categories
 *   -> repair_categories, all of them
 * GET /taxonomy-browse?level=repairs&category_id=2
 *   -> repair_taxonomy rows for that category
 *
 * Setup required (same env vars as repair-breakdown.js):
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 *
 * ==========================================================================
 * NOTE FOR ANY AI SESSION EDITING THIS FILE
 * ==========================================================================
 * Make and Model are NOT independent entities and there is no `makes` or
 * `models` table -- both are plain text columns bundled with a year range
 * on one `generations` row. onRequestPost's default (non-`entity`) branch
 * therefore requires make + model + year_start + year_end together; there
 * is nowhere to store a bare make or model on its own. Making Make/Model
 * independently addable would require an actual schema migration (real
 * `makes`/`models` tables, `generations` moved underneath `models`), which
 * the person maintaining this explicitly wants confirmed with them first,
 * not assumed. See the matching note at the top of src/RepairBrowser.tsx.
 * ==========================================================================
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function clean(v) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''; }
function sbHeaders(serviceKey) { return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }; }

async function sb(env, path) {
  const base = `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;
  const res = await fetch(`${base}${path}`, { headers: sbHeaders(env.SUPABASE_SERVICE_KEY) });
  return res;
}

function slugify(s) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }
  const headers = { ...sbHeaders(env.SUPABASE_SERVICE_KEY), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const entity = body?.entity;

  if (entity === 'category') {
    const name = clean(body?.name);
    if (!name) return json({ error: 'name is required' }, 400);
    const res = await fetch(`${supabaseUrl}/rest/v1/repair_categories`, { method: 'POST', headers, body: JSON.stringify({ name }) });
    if (!res.ok) return json({ error: 'Could not create category', detail: await res.text() }, 502);
    const rows = await res.json();
    return json({ category: rows[0] || null });
  }

  if (entity === 'repair_type') {
    const name = clean(body?.name);
    const categoryId = body?.category_id;
    if (!name || !categoryId) return json({ error: 'name and category_id are required' }, 400);
    const slug = slugify(name);
    const res = await fetch(`${supabaseUrl}/rest/v1/repair_taxonomy`, {
      method: 'POST', headers,
      body: JSON.stringify({ slug, name, category_id: categoryId }),
    });
    if (!res.ok) return json({ error: 'Could not create repair type', detail: await res.text() }, 502);
    const rows = await res.json();
    return json({ repair: rows[0] || null });
  }

  // Default / existing behavior: create a generation.
  const make = clean(body?.make);
  const model = clean(body?.model);
  const yearStart = Number(body?.year_start);
  const yearEnd = Number(body?.year_end);
  const name = clean(body?.name) || `${make} ${model} (${yearStart}-${yearEnd})`;

  if (!make || !model || !Number.isInteger(yearStart) || !Number.isInteger(yearEnd) || yearEnd < yearStart) {
    return json({ error: 'make, model, year_start and year_end (year_end >= year_start) are required' }, 400);
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/generations`, { method: 'POST', headers, body: JSON.stringify({ make, model, name, year_start: yearStart, year_end: yearEnd }) });
  if (!res.ok) return json({ error: 'Could not create generation', detail: await res.text() }, 502);
  const rows = await res.json();
  return json({ generation: rows[0] || null });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const level = url.searchParams.get('level');

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  if (level === 'makes') {
    const year = Number(url.searchParams.get('year'));
    if (!Number.isInteger(year)) return json({ error: 'year is required' }, 400);
    const res = await sb(env, `/generations?year_start=lte.${year}&year_end=gte.${year}&select=make`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    const makes = [...new Set(rows.map((r) => r.make))].sort();
    return json({ makes });
  }

  if (level === 'models') {
    const year = Number(url.searchParams.get('year'));
    const make = clean(url.searchParams.get('make'));
    if (!Number.isInteger(year) || !make) return json({ error: 'year and make are required' }, 400);
    const res = await sb(env, `/generations?year_start=lte.${year}&year_end=gte.${year}&make=eq.${encodeURIComponent(make)}&select=model`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    const models = [...new Set(rows.map((r) => r.model))].sort();
    return json({ models });
  }

  if (level === 'generation') {
    const year = Number(url.searchParams.get('year'));
    const make = clean(url.searchParams.get('make'));
    const model = clean(url.searchParams.get('model'));
    if (!Number.isInteger(year) || !make || !model) return json({ error: 'year, make and model are required' }, 400);
    const res = await sb(env, `/generations?year_start=lte.${year}&year_end=gte.${year}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=*`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    return json({ generation: rows[0] || null });
  }

  if (level === 'engines') {
    const generationId = url.searchParams.get('generation_id');
    if (!generationId) return json({ error: 'generation_id is required' }, 400);
    const res = await sb(env, `/generation_engines?generation_id=eq.${encodeURIComponent(generationId)}&select=*&order=engine_label.asc`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const engines = await res.json();
    return json({ engines });
  }

  if (level === 'categories') {
    const res = await sb(env, `/repair_categories?select=*&order=name.asc`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const categories = await res.json();
    return json({ categories });
  }

  if (level === 'repairs') {
    const categoryId = url.searchParams.get('category_id');
    if (!categoryId) return json({ error: 'category_id is required' }, 400);
    const res = await sb(env, `/repair_taxonomy?category_id=eq.${encodeURIComponent(categoryId)}&select=*&order=name.asc`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const repairs = await res.json();
    return json({ repairs });
  }

  return json({ error: 'Unknown or missing level. Use one of: makes, models, generation, engines, categories, repairs' }, 400);
}
