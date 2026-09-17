/**
 * taxonomy-gap-check — Cloudflare Pages Function
 *
 * Answers one question reliably, instead of by AI memory: "for model year
 * Y, which real-world make/model combinations exist that our `generations`
 * table does NOT yet cover?" It does this against NHTSA's vPIC API, the
 * federal database manufacturers themselves report vehicle data into --
 * not by asking an AI to recall every model, which is exactly the failure
 * mode that produced an incomplete taxonomy earlier in this project.
 *
 * IMPORTANT — division of responsibility, do not blur this:
 *   vPIC tells you a make/model EXISTS for a given year. It does NOT tell
 *   you the generation boundaries (when that model's current design cycle
 *   started). This endpoint only ever outputs a gap list of (make, model)
 *   pairs needing generation-boundary research -- it never invents or
 *   guesses a year_start/year_end. That research step (sourced,
 *   manufacturer-announcement-backed, per the project's existing rules)
 *   still has to happen afterward, by a human or an AI doing real research,
 *   using the format in vehicle-coverage-runbook.md.
 *
 * GET /taxonomy-gap-check?year=2026
 *   -> { year, makes: [ { make, alreadyCovered: [...], possibleNameMismatch: [...], gaps: [...] } ] }
 * GET /taxonomy-gap-check?year=2026&makes=Toyota,Honda
 *   -> same, restricted to the given makes (comma-separated, case-insensitive)
 *
 * Setup required (same env vars as taxonomy-browse.js):
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 *
 * ==========================================================================
 * NOTE FOR ANY AI SESSION EDITING THIS FILE
 * ==========================================================================
 * The default TIER_A_MAKES list below is the same mainstream-market
 * priority list used elsewhere in this project's research process. Don't
 * silently expand it to cover every make vPIC knows about (it includes
 * everything from lawn equipment importers to motorcycle-only brands) --
 * that defeats the point of prioritizing by real market relevance. Add a
 * make here only when the project's maintainer says to.
 *
 * vPIC's "vehicle type" categories are NHTSA's own regulatory
 * classifications, not intuitive ones -- confirmed by testing, a Honda
 * Odyssey (a minivan) is classified as "Truck", not "Multipurpose
 * Passenger Vehicle (MPV)". Because of this, EXCLUDED_VEHICLE_TYPES below
 * is an exclude-list (motorcycles, trailers, etc.), not an allow-list --
 * safer for completeness, since a category name you didn't anticipate
 * stays included by default instead of silently dropping real vehicles.
 * ==========================================================================
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// Mainstream US-market makes, same priority tier used in the project's
// research runbook. Not exhaustive of every make vPIC knows about --
// deliberately scoped to what this repair shop's taxonomy actually needs.
const TIER_A_MAKES = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Kia', 'Hyundai',
  'Subaru', 'Ram', 'GMC', 'Volkswagen', 'Mazda', 'Buick', 'Dodge', 'Chrysler',
  'Lexus', 'Audi', 'BMW', 'Mercedes-Benz', 'Porsche',
];

// vPIC vehicle-type categories that are never relevant to a passenger-
// vehicle repair-shop taxonomy. Everything NOT in this list is kept, on
// purpose -- see the header note above on why this is exclude, not allow.
const EXCLUDED_VEHICLE_TYPES = new Set([
  'MOTORCYCLE', 'TRAILER', 'LOW SPEED VEHICLE (LSV)', 'INCOMPLETE VEHICLE',
  'BUS', 'MOTOR HOME', 'OFF ROAD VEHICLE', 'MOPED', 'ATV', 'ALL TERRAIN VEHICLE',
]);

async function vpic(path) {
  const res = await fetch(`${VPIC_BASE}${path}${path.includes('?') ? '&' : '?'}format=json`);
  if (!res.ok) throw new Error(`vPIC request failed (${res.status}): ${path}`);
  const data = await res.json();
  return data.Results || [];
}

function sbHeaders(serviceKey) { return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }; }
async function sb(env, path) {
  const base = `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;
  const res = await fetch(`${base}${path}`, { headers: sbHeaders(env.SUPABASE_SERVICE_KEY) });
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${path}`);
  return res.json();
}

// Loose normalization for name matching: lowercase, strip everything but
// letters/digits. Catches "F-150" vs "F150", "CX-5" vs "CX5", trailing
// whitespace, etc. WITHOUT silently merging genuinely different models.
function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getAllowedVehicleTypesForMake(make) {
  const types = await vpic(`/GetVehicleTypesForMake/${encodeURIComponent(make)}`);
  return types
    .map((t) => t.VehicleTypeName)
    .filter((name) => name && !EXCLUDED_VEHICLE_TYPES.has(name.toUpperCase()));
}

async function getModelsForMakeYear(make, year, vehicleType) {
  const path = `/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/${encodeURIComponent(vehicleType)}`;
  const results = await vpic(path);
  return results.map((r) => r.Model_Name).filter(Boolean);
}

async function checkMakeGaps(env, make, year) {
  // 1. Establish the real universe of models for this make+year, filtered
  //    to relevant vehicle types only. Multiple vPIC vehicle-type calls
  //    per make because the unfiltered GetModelsForMakeYear response does
  //    NOT include a vehicle-type field to filter on client-side -- you
  //    have to ask per type and union the results (confirmed by testing).
  let vpicModels = [];
  try {
    const allowedTypes = await getAllowedVehicleTypesForMake(make);
    const perType = await Promise.all(allowedTypes.map((t) => getModelsForMakeYear(make, year, t)));
    vpicModels = [...new Set(perType.flat())].sort();
  } catch (err) {
    return { make, error: `vPIC lookup failed: ${err.message}` };
  }

  // 2. Pull what this make already has on file that covers this year.
  let existingRows = [];
  try {
    existingRows = await sb(
      env,
      `/generations?make=eq.${encodeURIComponent(make)}&year_start=lte.${year}&year_end=gte.${year}&select=model`
    );
  } catch (err) {
    return { make, error: `Supabase lookup failed: ${err.message}` };
  }
  const existingModels = existingRows.map((r) => r.model);
  const existingNormalized = new Map(existingModels.map((m) => [normalize(m), m]));

  // 3. Categorize every vPIC model into: already covered, a likely name-
  //    formatting mismatch worth a human glance, or a true gap needing
  //    generation-boundary research.
  const alreadyCovered = [];
  const possibleNameMismatch = [];
  const gaps = [];

  for (const model of vpicModels) {
    const exact = existingModels.find((m) => m.toLowerCase() === model.toLowerCase());
    if (exact) { alreadyCovered.push(model); continue; }

    const loose = existingNormalized.get(normalize(model));
    if (loose) { possibleNameMismatch.push({ nhtsa: model, existingDbName: loose }); continue; }

    gaps.push(model);
  }

  return { make, vpicModelCount: vpicModels.length, alreadyCovered, possibleNameMismatch, gaps };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year'));
  if (!Number.isInteger(year)) return json({ error: 'year is required, e.g. ?year=2026' }, 400);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }, 500);
  }

  const makesParam = url.searchParams.get('makes');
  const makes = makesParam
    ? makesParam.split(',').map((m) => m.trim()).filter(Boolean)
    : TIER_A_MAKES;

  // Sequential, not Promise.all across makes: vPIC explicitly rate-limits
  // ("automated traffic rate control mechanism") -- a burst of ~20 makes'
  // worth of parallel requests, each fanning out into several vehicle-type
  // calls, risks tripping that limiter. Slower but reliable.
  const results = [];
  for (const make of makes) {
    results.push(await checkMakeGaps(env, make, year));
  }

  const totalGaps = results.reduce((sum, r) => sum + (r.gaps?.length || 0), 0);
  const totalMismatches = results.reduce((sum, r) => sum + (r.possibleNameMismatch?.length || 0), 0);

  return json({
    year,
    summary: { makesChecked: results.length, totalGaps, totalPossibleNameMismatches: totalMismatches },
    makes: results,
  });
}
