/**
 * vehicle-catalog — Cloudflare Pages Function
 *
 * Configuration-first replacement for the generation-only half of
 * taxonomy-browse.js. Implements:
 *
 *   NHTSA/vPIC -> vehicle_catalog -> Year -> Make -> Model
 *     -> vehicle_configurations -> Engine/Powertrain/Drivetrain/Transmission
 *
 * NHTSA/vPIC is used for DISCOVERY (does this year/make/model exist at
 * all), never for repair applicability. Ingestion writes into
 * vehicle_catalog and is CACHE-FIRST: a dropdown open never calls NHTSA
 * directly. A year is only ever fetched from vPIC once — the first time
 * anyone asks for makes in that year and vehicle_catalog has zero rows
 * for it — after which every subsequent request for that year is served
 * straight from Supabase.
 *
 * `generations` is untouched by this file except as optional metadata
 * (vehicle_catalog.generation_id / vehicle_configurations.generation_id).
 * No generation is required, looked up, or created here.
 *
 * GET  /vehicle-catalog?level=makes&year=2026
 *   -> { makes: string[] }  (ingests from vPIC once if the year is empty)
 * GET  /vehicle-catalog?level=models&year=2026&make=Toyota
 *   -> { models: string[] }
 * GET  /vehicle-catalog?level=vehicle&year=2026&make=Toyota&model=Camry
 *   -> { vehicle: vehicle_catalog row | null }
 * GET  /vehicle-catalog?level=configurations&vehicle_catalog_id=123
 *   -> { configurations: vehicle_configurations[] }
 *
 * POST /vehicle-catalog  { entity: 'vehicle', year, make, model }
 *   -> manually add a vehicle_catalog row (for anything vPIC doesn't have
 *      yet, or a deliberate correction) -> { vehicle }
 * POST /vehicle-catalog  { entity: 'configuration', vehicle_catalog_id,
 *                          engine_label, engine_code?, displacement?,
 *                          powertrain_type?, drivetrain?, transmission?,
 *                          fuel_type?, trim_constraint?, emissions_market? }
 *   -> add/confirm a configuration (no-op if the same mechanical identity
 *      already exists) -> { configuration }
 * POST /vehicle-catalog  { entity: 'ingest', year, makes?: string[] }
 *   -> force a (re)ingest for a year, e.g. from a cron job or an admin
 *      button. Ignores the cache-if-empty check; always hits vPIC.
 *
 * Setup required (same env vars as taxonomy-browse.js):
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function clean(v) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''; }
function sbHeaders(serviceKey) { return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }; }

async function sb(env, path, opt = {}) {
  const base = `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;
  const res = await fetch(`${base}${path}`, { ...opt, headers: { ...sbHeaders(env.SUPABASE_SERVICE_KEY), 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  return res;
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// Same Tier-A make list and canonicalization intent as taxonomy-gap-check.js
// (kept intentionally in sync — this is discovery, that is a review report).
const TIER_A_MAKES = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Kia', 'Hyundai',
  'Subaru', 'Ram', 'GMC', 'Volkswagen', 'Mazda', 'Buick', 'Dodge', 'Chrysler',
  'Lexus', 'Audi', 'BMW', 'Mercedes-Benz', 'Porsche',
];

const EXCLUDED_VEHICLE_TYPES = new Set([
  'MOTORCYCLE', 'TRAILER', 'LOW SPEED VEHICLE (LSV)', 'INCOMPLETE VEHICLE',
  'BUS', 'MOTOR HOME', 'OFF ROAD VEHICLE', 'MOPED', 'ATV', 'ALL TERRAIN VEHICLE',
]);

// Explicit alias collapses only — never generic suffix stripping. Preserves
// genuinely distinct marketed models (BMW 230i / M240i / M2 / 330i / M340i / M3
// all stay separate). Keep this in sync with taxonomy-gap-check.js's ALIAS_MAP
// if that file's mappings change.
const ALIAS_MAP = {
  toyota: { 'prius prime': 'Prius', 'prius prime (phev)': 'Prius', 'rav4 prime': 'RAV4', 'rav4 prime (phev)': 'RAV4', 'supra': 'GR Supra' },
  honda: { 'civic si': 'Civic', 'civic type r': 'Civic' },
  hyundai: { 'elantra n': 'Elantra', 'ioniq 5 n': 'Ioniq 5', 'ioniq 6 n': 'Ioniq 6' },
  ford: { 'expedition max': 'Expedition', 'f-250': 'Super Duty', 'f250': 'Super Duty', 'f-350': 'Super Duty', 'f350': 'Super Duty', 'f-450': 'Super Duty', 'f450': 'Super Duty', 'f-550': 'Super Duty', 'f550': 'Super Duty', 'f-600': 'Super Duty', 'f600': 'Super Duty' },
  ram: { 'promaster 1500': 'ProMaster', 'promaster 2500': 'ProMaster', 'promaster 3500': 'ProMaster' },
  volkswagen: { 'jetta gli': 'Jetta' },
  nissan: { 'ariya mpv': 'Ariya', 'kicks mpv': 'Kicks', 'nissan z': 'Z' },
  gmc: { 'yukon xl': 'Yukon' },
};

function normalizeKey(name) { return String(name ?? '').toLowerCase().trim().replace(/\s+/g, ' '); }

function canonicalizeModel(make, rawName) {
  const makeKey = normalizeKey(make);
  const rawKey = normalizeKey(rawName);
  return ALIAS_MAP[makeKey]?.[rawKey] ?? rawName.trim();
}

async function vpic(path) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${VPIC_BASE}${path}${separator}format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`vPIC request failed (${res.status}): ${path}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.Results)) throw new Error(`Unexpected vPIC response: ${path}`);
  return data.Results;
}

async function getAllowedVehicleTypesForMake(make) {
  const types = await vpic(`/GetVehicleTypesForMake/${encodeURIComponent(make)}`);
  const allowed = types.map((row) => row.VehicleTypeName).filter(Boolean)
    .filter((name) => !EXCLUDED_VEHICLE_TYPES.has(name.toUpperCase()));
  return [...new Set(allowed)];
}

async function getModelsForMakeYear(make, year, vehicleType) {
  const path = `/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/${encodeURIComponent(vehicleType)}`;
  const results = await vpic(path);
  return results.map((row) => row.Model_Name).filter(Boolean);
}

async function getVpicModels(make, year) {
  const allowedTypes = await getAllowedVehicleTypesForMake(make);
  const perType = await Promise.all(allowedTypes.map((vt) => getModelsForMakeYear(make, year, vt)));
  return [...new Set(perType.flat())];
}

// Ingest one year across every Tier-A make: fetch vPIC, canonicalize, upsert
// into vehicle_catalog. Duplicate (year, make, model) is a harmless no-op
// via ON CONFLICT DO NOTHING at the DB level (unique index), so calling
// this twice for the same year is always safe.
async function ingestYear(env, year, makes = TIER_A_MAKES) {
  const rows = [];
  const errors = [];
  for (const make of makes) {
    try {
      const rawModels = await getVpicModels(make, year);
      const seen = new Set();
      for (const raw of rawModels) {
        const canonical = canonicalizeModel(make, raw);
        const key = canonical.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ year, make, model: canonical, source: 'nhtsa_vpic', source_model_name: raw, status: 'active' });
      }
    } catch (err) {
      errors.push({ make, error: err.message });
    }
  }
  if (rows.length === 0) return { inserted: 0, errors };

  const res = await sb(env, '/vehicle_catalog', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    errors.push({ make: '[bulk insert]', error: await res.text() });
    return { inserted: 0, errors };
  }
  const inserted = await res.json();
  return { inserted: inserted.length, errors };
}

async function yearHasCatalogRows(env, year) {
  const res = await sb(env, `/vehicle_catalog?year=eq.${year}&select=id&limit=1`);
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
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

    // Cache-first: only ever hits vPIC the first time this year has zero
    // rows. Every dropdown open after that is a plain Supabase read.
    if (!(await yearHasCatalogRows(env, year))) {
      await ingestYear(env, year);
    }

    const res = await sb(env, `/vehicle_catalog?year=eq.${year}&status=eq.active&select=make`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    const makes = [...new Set(rows.map((r) => r.make))].sort();
    return json({ makes });
  }

  if (level === 'models') {
    const year = Number(url.searchParams.get('year'));
    const make = clean(url.searchParams.get('make'));
    if (!Number.isInteger(year) || !make) return json({ error: 'year and make are required' }, 400);
    const res = await sb(env, `/vehicle_catalog?year=eq.${year}&make=eq.${encodeURIComponent(make)}&status=eq.active&select=model`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    const models = [...new Set(rows.map((r) => r.model))].sort();
    return json({ models });
  }

  if (level === 'vehicle') {
    const year = Number(url.searchParams.get('year'));
    const make = clean(url.searchParams.get('make'));
    const model = clean(url.searchParams.get('model'));
    if (!Number.isInteger(year) || !make || !model) return json({ error: 'year, make and model are required' }, 400);
    const res = await sb(env, `/vehicle_catalog?year=eq.${year}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=*`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const rows = await res.json();
    return json({ vehicle: rows[0] || null });
  }

  if (level === 'configurations') {
    const vehicleCatalogId = url.searchParams.get('vehicle_catalog_id');
    if (!vehicleCatalogId) return json({ error: 'vehicle_catalog_id is required' }, 400);
    const res = await sb(env, `/vehicle_configurations?vehicle_catalog_id=eq.${encodeURIComponent(vehicleCatalogId)}&status=eq.active&select=*&order=engine_label.asc`);
    if (!res.ok) return json({ error: 'Lookup failed' }, 502);
    const configurations = await res.json();
    return json({ configurations });
  }

  return json({ error: 'Unknown or missing level. Use one of: makes, models, vehicle, configurations' }, 400);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const entity = body?.entity;

  if (entity === 'ingest') {
    const year = Number(body?.year);
    if (!Number.isInteger(year)) return json({ error: 'year is required' }, 400);
    const makes = Array.isArray(body?.makes) && body.makes.length ? body.makes : TIER_A_MAKES;
    const result = await ingestYear(env, year, makes);
    return json({ year, ...result });
  }

  if (entity === 'vehicle') {
    const year = Number(body?.year);
    const make = clean(body?.make);
    const model = clean(body?.model);
    if (!Number.isInteger(year) || !make || !model) return json({ error: 'year, make and model are required' }, 400);
    const res = await sb(env, '/vehicle_catalog', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ year, make, model, source: 'manual', status: 'active' }),
    });
    if (!res.ok) return json({ error: 'Could not add vehicle', detail: await res.text() }, 502);
    const rows = await res.json();
    if (rows[0]) return json({ vehicle: rows[0] });
    const existingRes = await sb(env, `/vehicle_catalog?year=eq.${year}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=*`);
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    return json({ vehicle: existingRows[0] || null });
  }

  if (entity === 'configuration') {
    const vehicleCatalogId = body?.vehicle_catalog_id;
    const engineLabel = clean(body?.engine_label);
    if (!vehicleCatalogId || !engineLabel) return json({ error: 'vehicle_catalog_id and engine_label are required' }, 400);

    const payload = {
      vehicle_catalog_id: vehicleCatalogId,
      engine_label: engineLabel,
      engine_code: clean(body?.engine_code) || null,
      displacement: clean(body?.displacement) || null,
      powertrain_type: clean(body?.powertrain_type) || null,
      drivetrain: clean(body?.drivetrain) || null,
      transmission: clean(body?.transmission) || null,
      fuel_type: clean(body?.fuel_type) || null,
      trim_constraint: clean(body?.trim_constraint) || null,
      emissions_market: clean(body?.emissions_market) || null,
      source: 'manual',
      status: 'active',
    };

    const res = await sb(env, '/vehicle_configurations', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json({ error: 'Could not add configuration', detail: await res.text() }, 502);
    const rows = await res.json();
    if (rows[0]) return json({ configuration: rows[0] });

    // ignore-duplicates with a conflict returns no row -- fetch the existing one.
    const filters = [
      `vehicle_catalog_id=eq.${vehicleCatalogId}`,
      `engine_label=eq.${encodeURIComponent(engineLabel)}`,
      payload.drivetrain ? `drivetrain=eq.${encodeURIComponent(payload.drivetrain)}` : 'drivetrain=is.null',
      payload.transmission ? `transmission=eq.${encodeURIComponent(payload.transmission)}` : 'transmission=is.null',
      payload.trim_constraint ? `trim_constraint=eq.${encodeURIComponent(payload.trim_constraint)}` : 'trim_constraint=is.null',
      payload.emissions_market ? `emissions_market=eq.${encodeURIComponent(payload.emissions_market)}` : 'emissions_market=is.null',
    ].join('&');
    const existingRes = await sb(env, `/vehicle_configurations?${filters}&select=*`);
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    return json({ configuration: existingRows[0] || null });
  }

  return json({ error: "Unknown entity. Use one of: 'vehicle', 'configuration', 'ingest'" }, 400);
}
