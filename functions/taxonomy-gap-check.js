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
 *   still has to happen afterward.
 *
 * IMPORTANT — raw vPIC model names are NOT automatically GID models:
 *   vPIC returns manufacturer-reported model strings verbatim, which
 *   includes trim/variant suffixes ("Prius Prime", "Civic Si", "F-250"),
 *   AND genuine junk (kit cars, replica manufacturers, international
 *   commercial trucks registered under a US make's WMI, one-off track
 *   specials) that a repair-shop taxonomy has no use for. This file
 *   normalizes KNOWN variant suffixes via an explicit alias table (never
 *   a generic word-stripping rule -- see the note by ALIAS_MAP on why),
 *   and routes anything it can't confidently classify to `needsReview`
 *   instead of silently discarding it OR silently trusting it as a gap.
 *   A human (or a research pass) has to look at `needsReview` --
 *   the sourced-research step downstream will naturally fail to find a
 *   manufacturer announcement for something like a fake/junk entry, so
 *   even an imperfect classification here doesn't corrupt the database --
 *   it just costs a wasted research lookup, which is a far cheaper mistake
 *   than silently inserting a nonexistent vehicle.
 *
 * GET /taxonomy-gap-check?year=2026
 *   -> processes a BATCH of makes (see pagination below), one Worker
 *      invocation at a time, and returns:
 *      { year, offset, nextOffset, makes: [ { make, alreadyCovered,
 *        normalizedMatches, gaps, needsReview } ] }
 * GET /taxonomy-gap-check?year=2026&makes=Toyota,Honda
 *   -> same, restricted to the given makes (comma-separated, case-insensitive)
 *      instead of paginating over the default TIER_A_MAKES list
 *
 * PAGINATION (required — do not remove):
 *   Cloudflare Workers cap the number of subrequests (outbound fetches) a
 *   single invocation may make. Each make costs 1 vPIC vehicle-type lookup
 *   + 1 vPIC model lookup per allowed vehicle type + 1 Supabase lookup --
 *   roughly 4-6 subrequests per make. Processing the full TIER_A_MAKES
 *   list (21 makes) in one invocation WILL exceed the limit on standard
 *   Workers plans (confirmed: an earlier run stopped partway through after
 *   ~10 makes). The fix is smaller batches per invocation, NOT more
 *   concurrency -- vPIC itself rate-limits, and higher concurrency risks
 *   tripping that instead of Cloudflare's limit. Call this endpoint
 *   repeatedly with an increasing `offset`, using the `nextOffset` from
 *   each response, until `nextOffset` is null. Default batch size (5
 *   makes/invocation) is deliberately conservative -- safe headroom under
 *   a 50-subrequest budget even for a make with several vehicle types.
 *
 * Setup required (same env vars as taxonomy-browse.js):
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 *
 * ==========================================================================
 * NOTE FOR ANY AI SESSION EDITING THIS FILE
 * ==========================================================================
 * The default TIER_A_MAKES list is the same mainstream-market priority
 * list used elsewhere in this project's research process. Don't silently
 * expand it -- add a make only when the project's maintainer says to.
 *
 * ALIAS_MAP is an EXPLICIT, hand-maintained table of raw-vPIC-name ->
 * canonical-nameplate mappings. It is intentionally NOT a generic rule
 * (e.g. "strip the last word if it looks like a trim"), because that
 * would silently destroy genuinely separate marketed nameplates -- e.g.
 * Toyota's MY2026 lineup lists "bZ Woodland" as an official model
 * distinct from "bZ" (a larger sibling, not a trim of it). A generic
 * word-stripping rule would incorrectly collapse that into "bZ". Add
 * new entries here only when a suffix is CONFIRMED to be a trim/variant
 * of an existing nameplate, not a separate model, per the project's
 * "trim differences don't create separate model rows, but the
 * manufacturer treating something as a distinct nameplate does" rule.
 *
 * REVIEW_PATTERNS and EXCLUDE_NAMEPLATES exist because vPIC includes
 * junk irrelevant to a repair-shop taxonomy: kit-car/replica
 * manufacturers registered under a mainstream make's WMI ("Ford '34",
 * "Ford Classic Sedan"), one-off track specials ("Ford GT MKII"), and
 * international commercial vehicles never sold as US consumer vehicles
 * ("Hyundai Xcient", a heavy truck). These are HEURISTICS, not a complete
 * list -- confirmed observed junk should be added to EXCLUDE_NAMEPLATES
 * over time as new runs surface it (e.g. "Kia Miami" was added after the
 * first real MY2026 run surfaced it with no obvious pattern to catch it
 * generically). Never make these more aggressive to the point they could
 * catch a real nameplate -- when in doubt, let it fall to `needsReview`
 * rather than tightening a pattern.
 * ==========================================================================
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

const TIER_A_MAKES = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Kia', 'Hyundai',
  'Subaru', 'Ram', 'GMC', 'Volkswagen', 'Mazda', 'Buick', 'Dodge', 'Chrysler',
  'Lexus', 'Audi', 'BMW', 'Mercedes-Benz', 'Porsche',
];

const DEFAULT_BATCH_SIZE = 5;

const EXCLUDED_VEHICLE_TYPES = new Set([
  'MOTORCYCLE', 'TRAILER', 'LOW SPEED VEHICLE (LSV)', 'INCOMPLETE VEHICLE',
  'BUS', 'MOTOR HOME', 'OFF ROAD VEHICLE', 'MOPED', 'ATV', 'ALL TERRAIN VEHICLE',
]);

// Explicit trim/variant -> canonical nameplate mapping. Lowercase keys.
// See the big header note above before adding to this — it must only ever
// contain CONFIRMED trim/variant suffixes, never a guessed pattern.
const ALIAS_MAP = {
  toyota: {
    'prius prime': 'Prius',
    'rav4 prime': 'RAV4',
  },
  honda: {
    'civic si': 'Civic',
    'civic type r': 'Civic',
  },
  hyundai: {
    'elantra n': 'Elantra',
    'ioniq 5 n': 'Ioniq 5',
    'ioniq 6 n': 'Ioniq 6',
  },
  ford: {
    'expedition max': 'Expedition',
    'f-250': 'Super Duty', 'f250': 'Super Duty',
    'f-350': 'Super Duty', 'f350': 'Super Duty',
    'f-450': 'Super Duty', 'f450': 'Super Duty',
    'f-550': 'Super Duty', 'f550': 'Super Duty',
    'f-600': 'Super Duty', 'f600': 'Super Duty',
  },
  ram: {
    'promaster 1500': 'ProMaster',
    'promaster 2500': 'ProMaster',
    'promaster 3500': 'ProMaster',
  },
};

// Heuristic signals that a raw name is probably NOT a normal consumer
// nameplate. Deliberately narrow and conservative — see header note.
const REVIEW_PATTERNS = [
  { re: /'\d{2}\b/, reason: "looks like a historical/replica year designation (e.g. \"'34\")" },
  { re: /\b(sedan|coupe|convertible|wagon|roadster|hatchback|cab)$/i, reason: 'ends in a generic body-style word, not a normal nameplate pattern for this make' },
  { re: /\bmk\s?(i{1,3}|iv|v|\d+)\b/i, reason: 'looks like a motorsport/homologation-special suffix (e.g. "MKII")' },
];

// Curated, growing list of confirmed-junk nameplates observed in real
// runs that no generic pattern caught. Lowercase keys, per make.
const EXCLUDE_NAMEPLATES = {
  hyundai: new Set(['xcient']), // international heavy truck, not a US consumer vehicle
  kia: new Set(['miami']),      // confirmed junk from first MY2026 run, no obvious pattern
};

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
// letters/digits. Catches "F-150" vs "F150", spacing/punctuation drift —
// WITHOUT merging genuinely different models.
function normalizeLoose(name) {
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

function classifyRaw(make, rawName, existingModels, existingNormalizedMap) {
  const makeKey = make.toLowerCase();

  // 1. Exact match against what's already in the DB for this make/year.
  const exact = existingModels.find((m) => m.toLowerCase() === rawName.toLowerCase());
  if (exact) return { bucket: 'alreadyCovered', value: rawName };

  // 2. Known trim/variant alias -> canonical nameplate.
  const aliasTarget = ALIAS_MAP[makeKey]?.[rawName.toLowerCase().trim()];
  if (aliasTarget) {
    const canonicalCovered = existingModels.find((m) => m.toLowerCase() === aliasTarget.toLowerCase());
    return {
      bucket: canonicalCovered ? 'normalizedMatches' : 'gaps',
      value: canonicalCovered
        ? { raw: rawName, canonical: aliasTarget, status: 'already covered under canonical name' }
        : { raw: rawName, canonical: aliasTarget },
    };
  }

  // 3. Loose match (punctuation/spacing only) against existing DB models —
  //    worth a human glance, not an automatic new gap or an automatic match.
  const looseMatch = existingNormalizedMap.get(normalizeLoose(rawName));
  if (looseMatch) {
    return { bucket: 'needsReview', value: { raw: rawName, reason: `possible name-formatting mismatch with existing DB model "${looseMatch}"` } };
  }

  // 4. Curated known-junk nameplate for this make.
  if (EXCLUDE_NAMEPLATES[makeKey]?.has(rawName.toLowerCase().trim())) {
    return { bucket: 'needsReview', value: { raw: rawName, reason: 'confirmed non-consumer/junk nameplate from a prior run — verify before ever treating as real' } };
  }

  // 5. Pattern-based suspicion signals.
  for (const { re, reason } of REVIEW_PATTERNS) {
    if (re.test(rawName)) {
      return { bucket: 'needsReview', value: { raw: rawName, reason } };
    }
  }

  // 6. Nothing flagged it as suspicious and nothing matched — treat as a
  //    genuine new/current nameplate needing generation-boundary research.
  return { bucket: 'gaps', value: { raw: rawName, canonical: rawName } };
}

async function checkMakeGaps(env, make, year) {
  let vpicModels = [];
  try {
    const allowedTypes = await getAllowedVehicleTypesForMake(make);
    const perType = await Promise.all(allowedTypes.map((t) => getModelsForMakeYear(make, year, t)));
    vpicModels = [...new Set(perType.flat())].sort();
  } catch (err) {
    return { make, error: `vPIC lookup failed: ${err.message}` };
  }

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
  const existingNormalizedMap = new Map(existingModels.map((m) => [normalizeLoose(m), m]));

  const alreadyCovered = [];
  const normalizedMatches = [];
  const gaps = [];
  const needsReview = [];

  for (const rawName of vpicModels) {
    const { bucket, value } = classifyRaw(make, rawName, existingModels, existingNormalizedMap);
    if (bucket === 'alreadyCovered') alreadyCovered.push(value);
    else if (bucket === 'normalizedMatches') normalizedMatches.push(value);
    else if (bucket === 'gaps') gaps.push(value);
    else needsReview.push(value);
  }

  return { make, vpicModelCount: vpicModels.length, alreadyCovered, normalizedMatches, gaps, needsReview };
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
  let makesToProcess;
  let offset = 0;
  let nextOffset = null;

  if (makesParam) {
    // Explicit make list — no pagination, caller controls batch size directly.
    makesToProcess = makesParam.split(',').map((m) => m.trim()).filter(Boolean);
  } else {
    offset = Number(url.searchParams.get('offset')) || 0;
    const limit = Number(url.searchParams.get('limit')) || DEFAULT_BATCH_SIZE;
    makesToProcess = TIER_A_MAKES.slice(offset, offset + limit);
    nextOffset = offset + limit < TIER_A_MAKES.length ? offset + limit : null;
  }

  // Sequential, not Promise.all across makes: vPIC rate-limits, and this
  // also keeps per-invocation subrequest count predictable for batching.
  const results = [];
  for (const make of makesToProcess) {
    results.push(await checkMakeGaps(env, make, year));
  }

  const totalGaps = results.reduce((sum, r) => sum + (r.gaps?.length || 0), 0);
  const totalReview = results.reduce((sum, r) => sum + (r.needsReview?.length || 0), 0);

  return json({
    year,
    offset,
    nextOffset,
    totalMakesConfigured: TIER_A_MAKES.length,
    summary: { makesChecked: results.length, totalGaps, totalNeedsReview: totalReview },
    makes: results,
  });
}
