/**
 * taxonomy-browse — Cloudflare Pages Function
 *
 * v2 (configuration-first): Year -> Make -> Model -> Configuration lookups
 * moved to vehicle-catalog.js. This file now only serves the parts of the
 * tree that never depended on generations in the first place: repair
 * categories and repair types. It also keeps a LEGACY endpoint for
 * creating/editing a `generations` row directly, because generations
 * still exists as optional platform/grouping metadata (see the
 * configuration-first migration) — it's just no longer on the critical
 * path for a vehicle to be browsable.
 *
 * GET /taxonomy-browse?level=categories
 *   -> repair_categories, all of them
 * GET /taxonomy-browse?level=repairs&category_id=2
 *   -> repair_taxonomy rows for that category
 *
 * POST /taxonomy-browse { entity: 'category', name }
 * POST /taxonomy-browse { entity: 'repair_type', name, category_id }
 * POST /taxonomy-browse { entity: 'generation', make, model, year_start,
 *                          year_end, name? }
 *   -> LEGACY / optional: creates a `generations` row for platform
 *      grouping. Not required for a vehicle to appear in the browser —
 *      see vehicle-catalog.js for that.
 *
 * Setup required: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
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

  if (entity === 'generation') {
    // LEGACY / optional platform-grouping metadata. See vehicle-catalog.js
    // for the primary (required) Year -> Make -> Model path.
    const make = clean(body?.make);
    const model = clean(body?.model);
    const yearStart = Number(body?.year_start);
    const yearEnd = Number(body?.year_end);
    const name = clean(body?.name) || `${make} ${model} (${yearStart}-${yearEnd})`;

    if (!make || !model || !Number.isInteger(yearStart) || !Number.isInteger(yearEnd) || yearEnd < yearStart) {
      return json({ error: 'make, model, year_start and year_end (year_end >= year_start) are required' }, 400);
    }

    const overlapRes = await sb(
      env,
      `/generations?make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&year_start=lte.${yearEnd}&year_end=gte.${yearStart}&select=*`
    );
    if (overlapRes.ok) {
      const overlapping = await overlapRes.json();
      if (overlapping.length > 0) {
        return json({
          error: `${make} ${model} ${yearStart}-${yearEnd} overlaps an existing generation. Use the existing one, or fix its year range instead of adding a new one.`,
          existing: overlapping,
        }, 409);
      }
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/generations`, { method: 'POST', headers, body: JSON.stringify({ make, model, name, year_start: yearStart, year_end: yearEnd }) });
    if (!res.ok) {
      const detail = await res.text();
      if (/exclu|overlap/i.test(detail)) {
        const retryRes = await sb(
          env,
          `/generations?make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&year_start=lte.${yearEnd}&year_end=gte.${yearStart}&select=*`
        );
        const existing = retryRes.ok ? await retryRes.json() : [];
        return json({
          error: `${make} ${model} ${yearStart}-${yearEnd} overlaps an existing generation. Use the existing one, or fix its year range instead of adding a new one.`,
          existing,
        }, 409);
      }
      return json({ error: 'Could not create generation', detail }, 502);
    }
    const rows = await res.json();
    return json({ generation: rows[0] || null });
  }

  return json({ error: "Unknown entity. Use one of: 'category', 'repair_type', 'generation'" }, 400);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const level = url.searchParams.get('level');

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
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

  return json({ error: 'Unknown or missing level. Use one of: categories, repairs. (makes/models/generation/engines moved to vehicle-catalog.js)' }, 400);
}
