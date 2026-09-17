/**
 * repair-breakdown — Cloudflare Pages Function
 * v6: rebuilt against the structured taxonomy schema (generations /
 * repair_taxonomy / repair_guides) instead of the old free-text
 * AI-classified cache key. Generation lookup is now deterministic
 * (year/make/model -> a real generations row); only the REPAIR PHRASE
 * still goes through a small classification call, because repair
 * wording varies a lot more than vehicle identity does.
 *
 * This still does no research itself -- a new/uncached combination is
 * queued (status: 'pending') and the actual research worker (wherever
 * it runs -- Claude, a laptop script, etc.) is responsible for filling
 * in `content` and flipping status to 'done'.
 *
 * POST /repair-breakdown
 *   {
 *     vehicle: { year, make, model, trim?, engine?, drivetrain?, transmission? },
 *     repair: "front wheel bearing",   // free text, any phrasing
 *     force?: boolean,                 // re-queue even if a done guide exists
 *     priority?: boolean               // jump the research queue
 *   }
 *   -> { status: 'done'|'pending'|'error', key: <repair_guides.id>, ...content }
 *
 * GET /repair-breakdown?key=<repair_guides.id>
 *   -> { status, ...content }
 *
 * Setup required (Pages > Settings > Environment variables):
 *   - ANTHROPIC_API_KEY   (small classification calls only, a few hundred
 *     tokens each -- the actual repair research is a separate process)
 *   - SUPABASE_URL (or reuses VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_KEY
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

// ---------------------------------------------------------------------------
// Generation resolution -- deterministic, no AI. year/make/model -> the real
// generations row, applying generation_make_model_aliases first so brand
// splits (Dodge -> Ram) and similar naming drift resolve to the same lookup.
// ---------------------------------------------------------------------------
// Well-documented factory brand/name splits that should just work without
// anyone having to remember to seed generation_make_model_aliases by hand.
// This is a safety net, not a replacement for the alias table -- the alias
// table (checked first) always wins if it has a specific override on file.
// Each entry: [makeMatch, modelMatch] (case-insensitive, exact) -> [canonicalMake, canonicalModel]
const BUILTIN_MAKE_MODEL_SPLITS = [
  [['dodge', 'ram'], ['ram', '1500']], // Ram spun off from Dodge as its own brand in 2010; NHTSA VIN decode
                                        // reports pre-split trucks as make=Dodge, model=Ram (no "1500" in model).
];

function normKey(v) { return clean(v).toLowerCase(); }

async function resolveGenerationMakeModel(env, make, model) {
  const aliasRes = await sb(env, `/generation_make_model_aliases?alias_make=ilike.${encodeURIComponent(make)}&alias_model=ilike.${encodeURIComponent(model)}&select=canonical_make,canonical_model&limit=1`);
  if (aliasRes.ok) {
    const rows = await aliasRes.json();
    if (rows[0]) return { make: rows[0].canonical_make, model: rows[0].canonical_model };
  }

  const nMake = normKey(make), nModel = normKey(model);
  for (const [[m, mo], [canonMake, canonModel]] of BUILTIN_MAKE_MODEL_SPLITS) {
    if (nMake === m && nModel === mo) return { make: canonMake, model: canonModel };
  }

  return { make, model };
}

async function findGeneration(env, year, make, model) {
  const { make: canonMake, model: canonModel } = await resolveGenerationMakeModel(env, make, model);
  const q = `/generations?make=ilike.${encodeURIComponent(canonMake)}&model=ilike.${encodeURIComponent(canonModel)}&year_start=lte.${year}&year_end=gte.${year}&select=*&limit=5`;
  const res = await sb(env, q);
  if (!res.ok) return { generation: null, canonMake, canonModel };
  const rows = await res.json();
  // Multiple matches shouldn't normally happen (generation year ranges for the
  // same make/model shouldn't overlap) -- if it does, prefer the narrowest range.
  rows.sort((a, b) => (a.year_end - a.year_start) - (b.year_end - b.year_start));
  return { generation: rows[0] || null, canonMake, canonModel };
}

async function createProvisionalGeneration(env, year, make, model) {
  // No known generation covers this vehicle yet. Rather than dead-ending,
  // create a single-year provisional row so research/lookup can proceed --
  // clearly marked so it gets reconciled into a real generation range later
  // instead of silently being treated as an established one.
  const res = await sb(env, '/generations', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      make, model, name: 'auto (unverified) — needs generation research',
      year_start: year, year_end: year,
      notes: 'Created automatically by repair-breakdown lookup for a vehicle not yet in the generations table. Verify and widen/merge into the correct real generation range.',
    }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Repair phrase resolution -- alias table first (fast path, no AI), then a
// small classification call against the EXISTING taxonomy list so near-
// duplicate phrasing collapses onto the same canonical repair instead of
// silently forking a new one.
// ---------------------------------------------------------------------------
const CLASSIFY_SYSTEM_PROMPT = `You map a repair description onto an existing canonical repair taxonomy for an \
automotive repair shop database.

You will be given the full list of existing canonical repairs (slug and name). Check it FIRST: if the \
requested repair genuinely matches one of them -- same job scope, same components, same side/axle -- respond \
with ONLY that existing slug, copied exactly.

Only if nothing matches, respond with a new line in this exact format (no other text):
NEW|<slug-in-kebab-case>|<Human Readable Name>|<best matching category name from this list: Routine Maintenance, Brakes, Suspension/Steering, Cooling System, Electrical, Engine Accessory, Drivetrain/Transmission, Fuel System, Exhaust, Wheel Bearings/Hubs, HVAC, Other/Uncategorized>

Scope words change the job and must never be merged onto a broader or narrower entry, even when the closest \
existing entry differs by only one word:
- Component count/bundle: "pads" alone is NOT the same job as "pads and rotors" / "pads and calipers" -- a \
  bundled job requires parts and labor the narrower job doesn't, and vice versa the narrower job is cheaper \
  and faster than what the bundle implies. Never fold one into the other.
- Side: "front" and "rear" are always different jobs, never interchangeable.
- Axle count on multi-axle vehicles: "both front" vs "single front" (dually/HD trucks) are different jobs.
If the requested phrase and the closest existing taxonomy entry differ on any of these axes, that is grounds \
for a NEW entry, not a match -- do not rationalize it into the existing one because everything else lines up.

Respond with ONLY the slug or the NEW| line -- no explanation.`;

async function classifyRepairPhrase(env, repairPhrase, existingTaxonomy) {
  const list = existingTaxonomy.map((t) => `${t.slug} :: ${t.name}`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Existing canonical repairs:\n${list}\n\nRepair to classify: ${repairPhrase}` }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

async function resolveRepair(env, repairPhraseRaw) {
  const rawKey = clean(repairPhraseRaw).toLowerCase();

  const aliasRes = await sb(env, `/repair_taxonomy_aliases?raw_phrase=eq.${encodeURIComponent(rawKey)}&select=repair_id`);
  if (aliasRes.ok) {
    const rows = await aliasRes.json();
    if (rows[0]) return { repairId: rows[0].repair_id, wasNew: false };
  }

  const taxRes = await sb(env, '/repair_taxonomy?select=slug,name');
  const taxonomy = taxRes.ok ? await taxRes.json() : [];

  const classification = await classifyRepairPhrase(env, repairPhraseRaw, taxonomy);
  if (!classification) return { repairId: null, wasNew: false, error: 'Repair classification failed' };

  let repairId = null;
  let wasNew = false;

  if (classification.startsWith('NEW|')) {
    const [, slug, name, categoryName] = classification.split('|').map((s) => s.trim());
    if (!slug || !name) return { repairId: null, wasNew: false, error: 'Classification returned an invalid NEW entry' };

    let categoryId = null;
    if (categoryName) {
      const catRes = await sb(env, `/repair_categories?name=eq.${encodeURIComponent(categoryName)}&select=id`);
      if (catRes.ok) { const rows = await catRes.json(); categoryId = rows[0]?.id ?? null; }
    }

    const insertRes = await sb(env, '/repair_taxonomy', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ slug, name, category_id: categoryId }),
    });
    if (!insertRes.ok) return { repairId: null, wasNew: false, error: 'Could not create new taxonomy entry' };
    const rows = await insertRes.json();
    repairId = rows[0]?.id ?? null;
    wasNew = true;
  } else {
    const slug = classification;
    const matchRes = await sb(env, `/repair_taxonomy?slug=eq.${encodeURIComponent(slug)}&select=id`);
    if (matchRes.ok) { const rows = await matchRes.json(); repairId = rows[0]?.id ?? null; }
  }

  if (!repairId) return { repairId: null, wasNew: false, error: 'Could not resolve repair to a taxonomy entry' };

  // Record the alias so this exact phrasing skips classification next time.
  await sb(env, '/repair_taxonomy_aliases', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ raw_phrase: rawKey, repair_id: repairId }),
  });

  return { repairId, wasNew };
}

// ---------------------------------------------------------------------------
// Guide lookup -- within a generation+repair, prefer the most specific
// matching row (most non-null narrowing columns satisfied) over a broader one.
// ---------------------------------------------------------------------------
function specificity(row) {
  return ['engine', 'powertrain_type', 'drivetrain', 'transmission', 'trim_constraint', 'emissions_market']
    .filter((k) => row[k] != null).length + (row.year_start != null || row.year_end != null ? 1 : 0);
}

async function resolveEngineLabel(env, generationId, engineRaw) {
  const raw = clean(engineRaw).toLowerCase();
  if (!raw) return null;
  const res = await sb(env, `/engine_aliases?generation_id=eq.${generationId}&raw_label=eq.${encodeURIComponent(raw)}&select=canonical_label`);
  if (res.ok) { const rows = await res.json(); if (rows[0]) return rows[0].canonical_label; }
  return clean(engineRaw); // no known alias yet -- use as given
}

async function findMatchingGuide(env, generationId, repairId, vehicle, year) {
  const res = await sb(env, `/repair_guides?generation_id=eq.${generationId}&repair_id=eq.${repairId}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();

  const engineCanonical = vehicle.engine ? await resolveEngineLabel(env, generationId, vehicle.engine) : null;
  const drivetrain = clean(vehicle.drivetrain).toLowerCase();
  const transmission = clean(vehicle.transmission).toLowerCase();

  const candidates = rows.filter((r) => {
    if (r.engine && engineCanonical && r.engine.toLowerCase() !== engineCanonical.toLowerCase()) return false;
    if (r.drivetrain && drivetrain && r.drivetrain.toLowerCase() !== drivetrain) return false;
    if (r.transmission && transmission && r.transmission.toLowerCase() !== transmission) return false;
    if (r.year_start != null && year < r.year_start) return false;
    if (r.year_end != null && year > r.year_end) return false;
    return true;
  });

  candidates.sort((a, b) => specificity(b) - specificity(a));
  return candidates[0] || null;
}

// ---------------------------------------------------------------------------

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { vehicle, repair, force, priority } = body || {};
  if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !repair?.trim()) {
    return json({ error: 'vehicle.year, vehicle.make, vehicle.model and repair are required' }, 400);
  }
  const year = Number(vehicle.year);
  if (!Number.isInteger(year) || year < 1886 || year > 2100) return json({ error: 'vehicle.year must be a valid year' }, 400);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY || !env.ANTHROPIC_API_KEY) {
    return json({ error: 'Server not configured — check ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const make = clean(vehicle.make), model = clean(vehicle.model);

  let { generation } = await findGeneration(env, year, make, model);
  let generationWasNew = false;
  if (!generation) {
    generation = await createProvisionalGeneration(env, year, make, model);
    if (!generation) return json({ error: 'Could not resolve or create a vehicle generation' }, 502);
    generationWasNew = true;
  }

  const { repairId, error: repairError, wasNew: repairWasNew } = await resolveRepair(env, repair);
  if (!repairId) return json({ error: repairError || 'Could not classify repair' }, 502);

  const existing = await findMatchingGuide(env, generation.id, repairId, vehicle, year);

  if (existing && !force) {
    if (existing.status === 'done') {
      await sb(env, `/repair_guides?id=eq.${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ use_count: (existing.use_count || 1) + 1, last_used_at: new Date().toISOString() }),
      });
      return json({ status: 'done', key: String(existing.id), generation: generation.name, caveats: existing.caveats || null, ...existing.content });
    }
    return json({ status: existing.status, key: String(existing.id), generation_is_provisional: generationWasNew, repair_is_new: repairWasNew });
  }

  // New guide, or a forced refresh -- (re)queue for research. Intentionally
  // NOT clearing `content` on a forced refresh of an existing row: leave the
  // last known-good content in place until the research worker overwrites it.
  const engineCanonical = vehicle.engine ? await resolveEngineLabel(env, generation.id, vehicle.engine) : null;
  const upsertBody = {
    generation_id: generation.id,
    repair_id: repairId,
    status: 'pending',
    error_message: null,
    priority: !!priority,
  };
  // Only set narrowing columns on a brand-new row -- don't narrow an existing
  // guide's applicability just because this particular request happened to
  // supply an engine/drivetrain value; that's the research worker's call.
  // EXCEPTION: on a forced refresh, fill in any of these columns that are
  // still null on the existing row. This never overwrites an already-set
  // value (so a random later request can't corrupt an established narrow
  // guide) -- it only lets a guide created too generically (e.g. no engine
  // given the first time, even though this repair genuinely varies by
  // engine) get corrected by supplying the missing detail and hitting
  // Refresh, instead of requiring manual SQL.
  if (!existing) {
    upsertBody.engine = engineCanonical || null;
    upsertBody.drivetrain = clean(vehicle.drivetrain) || null;
    upsertBody.transmission = clean(vehicle.transmission) || null;
  } else if (force) {
    if (existing.engine == null && engineCanonical) upsertBody.engine = engineCanonical;
    if (existing.drivetrain == null && clean(vehicle.drivetrain)) upsertBody.drivetrain = clean(vehicle.drivetrain);
    if (existing.transmission == null && clean(vehicle.transmission)) upsertBody.transmission = clean(vehicle.transmission);
  }

  const path = existing ? `/repair_guides?id=eq.${existing.id}` : '/repair_guides';
  const method = existing ? 'PATCH' : 'POST';
  const res = await sb(env, path, { method, headers: { Prefer: 'return=representation' }, body: JSON.stringify(upsertBody) });
  if (!res.ok) return json({ error: 'Could not queue repair guide', detail: await res.text() }, 502);
  const rows = await res.json();
  const row = existing || rows[0];

  return json({
    status: 'pending', key: String(row.id), queued: true, generation: generation.name,
    // Visible in the raw response/network tab so a mismatch (e.g. a make/model
    // spinning up yet another "auto (unverified)" generation instead of hitting
    // an existing one) is obvious immediately, not something that needs a SQL
    // query to discover after the fact.
    generation_is_provisional: generationWasNew,
    repair_is_new: repairWasNew,
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'Missing key param' }, 400);

  const res = await sb(env, `/repair_guides?id=eq.${encodeURIComponent(key)}&select=*`);
  const rows = res.ok ? await res.json() : [];
  if (rows.length === 0) return json({ error: 'Not found' }, 404);

  const row = rows[0];
  if (row.status === 'done') return json({ status: 'done', key, caveats: row.caveats || null, ...row.content });
  if (row.status === 'error') return json({ status: 'error', error: row.error_message });
  if (row.status === 'superseded') {
    // This row was replaced by another (e.g. a duplicate cleaned up by hand,
    // or a future automated dedup pass) -- rather than leaving the frontend
    // polling a dead key forever, redirect to the current live guide for the
    // same generation+repair pair if one exists yet.
    const liveRes = await sb(env, `/repair_guides?generation_id=eq.${row.generation_id}&repair_id=eq.${row.repair_id}&status=eq.done&select=*&order=last_used_at.desc.nullslast&limit=1`);
    const liveRows = liveRes.ok ? await liveRes.json() : [];
    if (liveRows[0]) return json({ status: 'done', key: String(liveRows[0].id), caveats: liveRows[0].caveats || null, ...liveRows[0].content });
    return json({ status: 'pending' }); // superseded but no done replacement yet -- keep polling rather than dead-ending
  }
  return json({ status: row.status });
}
