/**
 * taxonomy-gap-check — Cloudflare Pages Function
 *
 * PURPOSE
 * -------
 * Discover the MY make/model taxonomy reported through the official
 * NHTSA vPIC API and compare it against GID Repair's existing
 * `generations` table.
 *
 * IMPORTANT:
 *
 * vPIC is the primary authority here for MODEL-YEAR EXISTENCE.
 *
 * A normal model returned by vPIC is NOT automatically a "gap" that
 * requires research just because it does not exist in Supabase yet.
 *
 * Instead:
 *
 *   vPIC model
 *      ↓
 *   filter irrelevant vehicle types
 *      ↓
 *   explicit canonical normalization
 *      ↓
 *   deduplicate canonical models
 *      ↓
 *   compare against Supabase
 *      ↓
 *   acceptedModels / alreadyCovered / needsResearch
 *
 * Only genuinely suspicious or ambiguous vPIC records go into
 * `needsResearch`.
 *
 * THIS FUNCTION NEVER WRITES TO SUPABASE.
 *
 * It also DOES NOT attempt to determine generation boundaries.
 * Generation research belongs to a separate stage.
 *
 * GET /taxonomy-gap-check?year=2026
 *
 * GET /taxonomy-gap-check?year=2026&makes=Toyota,Honda
 */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}

const VPIC_BASE =
  'https://vpic.nhtsa.dot.gov/api/vehicles';

const TIER_A_MAKES = [
  'Toyota',
  'Honda',
  'Ford',
  'Chevrolet',
  'Nissan',
  'Jeep',
  'Kia',
  'Hyundai',
  'Subaru',
  'Ram',
  'GMC',
  'Volkswagen',
  'Mazda',
  'Buick',
  'Dodge',
  'Chrysler',
  'Lexus',
  'Audi',
  'BMW',
  'Mercedes-Benz',
  'Porsche',
];

const DEFAULT_BATCH_SIZE = 5;

/*
 * Vehicle types that are definitely outside GID Repair's
 * passenger/light-duty repair taxonomy.
 */
const EXCLUDED_VEHICLE_TYPES = new Set([
  'MOTORCYCLE',
  'TRAILER',
  'LOW SPEED VEHICLE (LSV)',
  'INCOMPLETE VEHICLE',
  'BUS',
  'MOTOR HOME',
  'OFF ROAD VEHICLE',
  'MOPED',
  'ATV',
  'ALL TERRAIN VEHICLE',
]);

/*
 * Explicit vPIC → GID canonical model mappings.
 *
 * These are intentionally explicit.
 *
 * DO NOT replace this with generic suffix stripping.
 *
 * We do not want something like:
 *
 *   remove "N"
 *   remove "RS"
 *   remove "M"
 *   remove "S"
 *
 * because those rules would eventually collapse genuinely
 * distinct models.
 */
const ALIAS_MAP = {
  toyota: {
    'prius prime': 'Prius',
    'prius prime (phev)': 'Prius',

    'rav4 prime': 'RAV4',
    'rav4 prime (phev)': 'RAV4',

    'supra': 'GR Supra',
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

    'f-250': 'Super Duty',
    'f250': 'Super Duty',

    'f-350': 'Super Duty',
    'f350': 'Super Duty',

    'f-450': 'Super Duty',
    'f450': 'Super Duty',

    'f-550': 'Super Duty',
    'f550': 'Super Duty',

    'f-600': 'Super Duty',
    'f600': 'Super Duty',
  },

  ram: {
    'promaster 1500': 'ProMaster',
    'promaster 2500': 'ProMaster',
    'promaster 3500': 'ProMaster',
  },

  volkswagen: {
    'jetta gli': 'Jetta',
  },

  nissan: {
    /*
     * These normalize vPIC naming only.
     *
     * They do NOT independently claim generation boundaries.
     */
    'ariya mpv': 'Ariya',
    'kicks mpv': 'Kicks',
    'nissan z': 'Z',
  },

  gmc: {
    'yukon xl': 'Yukon',
  },
};

/*
 * Known vPIC records that should NOT automatically become
 * normal GID models.
 *
 * They are sent to needsResearch rather than silently removed.
 */
const KNOWN_REVIEW_NAMEPLATES = {
  hyundai: {
    xcient:
      'commercial/heavy vehicle entry; outside normal GID passenger/light-duty taxonomy',
  },

  kia: {
    miami:
      'unexpected vPIC nameplate; verify before adding to GID taxonomy',
  },

  ford: {
    "'34":
      'historical/replica-style vPIC entry; not a normal current Ford retail nameplate',

    'classic sedan':
      'unexpected generic/historical vPIC model entry',

    'cordova sedan':
      'unexpected historical/generic vPIC model entry',

    'gt mkii':
      'specialty/motorsport-style vPIC entry; verify before treating as a normal retail model',

    'malibu sedan':
      'unexpected historical/generic vPIC model entry',
  },
};

/*
 * Generic suspicion patterns.
 *
 * IMPORTANT:
 * These are deliberately conservative.
 *
 * A match means:
 *
 *     needsResearch
 *
 * NOT:
 *
 *     delete
 */
const REVIEW_PATTERNS = [
  {
    re: /'\d{2}\b/,
    reason:
      'looks like a historical/replica year designation',
  },

  {
    re: /\bmk\s?(i{1,3}|iv|v|\d+)\b/i,
    reason:
      'looks like a specialty/motorsport MK designation',
  },
];

/*
 * Some legitimate manufacturers use body-style wording as
 * part of vPIC's model string.
 *
 * We DO NOT globally reject Sedan/SUV/Coupe/etc anymore.
 *
 * That old rule incorrectly kicked legitimate records such as
 * Mercedes EQE-Class Sedan into review.
 */

function normalizeLoose(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function vpic(path) {
  const separator =
    path.includes('?') ? '&' : '?';

  const url =
    `${VPIC_BASE}${path}` +
    `${separator}format=json`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `vPIC request failed (${res.status}): ${path}`
    );
  }

  const data = await res.json();

  if (!data || !Array.isArray(data.Results)) {
    throw new Error(
      `Unexpected vPIC response: ${path}`
    );
  }

  return data.Results;
}

/*
 * Supabase access in this file is READ ONLY.
 */
function sbHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization:
      `Bearer ${serviceKey}`,
  };
}

async function sb(env, path) {
  const base =
    `${
      env.SUPABASE_URL ??
      env.VITE_SUPABASE_URL
    }/rest/v1`;

  const res = await fetch(
    `${base}${path}`,
    {
      method: 'GET',
      headers:
        sbHeaders(
          env.SUPABASE_SERVICE_KEY
        ),
    }
  );

  if (!res.ok) {
    throw new Error(
      `Supabase read failed (${res.status}): ${path}`
    );
  }

  return res.json();
}

async function getAllowedVehicleTypesForMake(
  make
) {
  const types = await vpic(
    `/GetVehicleTypesForMake/` +
    `${encodeURIComponent(make)}`
  );

  const allowed =
    types
      .map(
        (row) =>
          row.VehicleTypeName
      )
      .filter(Boolean)
      .filter(
        (name) =>
          !EXCLUDED_VEHICLE_TYPES.has(
            name.toUpperCase()
          )
      );

  return [
    ...new Set(allowed),
  ];
}

async function getModelsForMakeYear(
  make,
  year,
  vehicleType
) {
  const path =
    `/GetModelsForMakeYear` +
    `/make/${encodeURIComponent(make)}` +
    `/modelyear/${year}` +
    `/vehicletype/${encodeURIComponent(
      vehicleType
    )}`;

  const results =
    await vpic(path);

  return results
    .map(
      (row) =>
        row.Model_Name
    )
    .filter(Boolean);
}

/*
 * Fetch all vPIC models for the requested make/year
 * across allowed vehicle types.
 */
async function getVpicModels(
  make,
  year
) {
  const allowedTypes =
    await getAllowedVehicleTypesForMake(
      make
    );

  const perType =
    await Promise.all(
      allowedTypes.map(
        (vehicleType) =>
          getModelsForMakeYear(
            make,
            year,
            vehicleType
          )
      )
    );

  return [
    ...new Set(
      perType.flat()
    ),
  ].sort(
    (a, b) =>
      a.localeCompare(b)
  );
}

/*
 * Determine whether a raw vPIC record needs manual research.
 */
function getReviewReason(
  make,
  rawName
) {
  const makeKey =
    normalizeKey(make);

  const rawKey =
    normalizeKey(rawName);

  const known =
    KNOWN_REVIEW_NAMEPLATES[
      makeKey
    ]?.[rawKey];

  if (known) {
    return known;
  }

  for (
    const rule
    of REVIEW_PATTERNS
  ) {
    if (rule.re.test(rawName)) {
      return rule.reason;
    }
  }

  return null;
}

/*
 * Convert a raw vPIC name into our canonical model.
 *
 * If no explicit alias exists, vPIC's model name itself
 * becomes the canonical model.
 *
 * That is intentional.
 *
 * We trust normal vPIC model output rather than turning
 * every unknown string into a research task.
 */
function canonicalizeModel(
  make,
  rawName
) {
  const makeKey =
    normalizeKey(make);

  const rawKey =
    normalizeKey(rawName);

  return (
    ALIAS_MAP[
      makeKey
    ]?.[rawKey] ??
    rawName.trim()
  );
}

/*
 * Collapse all raw vPIC model strings onto canonical models.
 *
 * Example:
 *
 * F-250
 * F-350
 * F-450
 * F-550
 * F-600
 *
 * becomes:
 *
 * {
 *   canonical: "Super Duty",
 *   rawModels: [...]
 * }
 */
function buildCanonicalModels(
  make,
  rawModels
) {
  const canonicalMap =
    new Map();

  const needsResearch = [];

  for (
    const raw
    of rawModels
  ) {
    const reviewReason =
      getReviewReason(
        make,
        raw
      );

    if (reviewReason) {
      needsResearch.push({
        raw,
        reason:
          reviewReason,
      });

      continue;
    }

    const canonical =
      canonicalizeModel(
        make,
        raw
      );

    const key =
      normalizeLoose(
        canonical
      );

    let entry =
      canonicalMap.get(key);

    if (!entry) {
      entry = {
        canonical,
        rawModels: [],
      };

      canonicalMap.set(
        key,
        entry
      );
    }

    if (
      !entry.rawModels.includes(
        raw
      )
    ) {
      entry.rawModels.push(
        raw
      );
    }
  }

  const models =
    [...canonicalMap.values()]
      .sort(
        (a, b) =>
          a.canonical.localeCompare(
            b.canonical
          )
      );

  needsResearch.sort(
    (a, b) =>
      a.raw.localeCompare(
        b.raw
      )
  );

  return {
    models,
    needsResearch,
  };
}

/*
 * Find an existing Supabase generation row corresponding
 * to a canonical vPIC model.
 *
 * Exact case-insensitive match is preferred.
 *
 * Punctuation-only differences are also accepted:
 *
 *     ID4  == ID.4
 *     F150 == F-150
 *
 * This is safe because it does NOT perform generic
 * model-family stripping.
 */
function findExistingModel(
  canonical,
  existingModels
) {
  const lower =
    canonical.toLowerCase();

  const exact =
    existingModels.find(
      (model) =>
        model.toLowerCase() ===
        lower
    );

  if (exact) {
    return {
      model: exact,
      matchType: 'exact',
    };
  }

  const loose =
    normalizeLoose(
      canonical
    );

  const looseMatch =
    existingModels.find(
      (model) =>
        normalizeLoose(model) ===
        loose
    );

  if (looseMatch) {
    return {
      model: looseMatch,
      matchType:
        'punctuation/spacing',
    };
  }

  return null;
}

async function checkMake(
  env,
  make,
  year
) {
  let rawModels;

  try {
    rawModels =
      await getVpicModels(
        make,
        year
      );
  } catch (err) {
    return {
      make,
      error:
        `vPIC lookup failed: ${err.message}`,
    };
  }

  /*
   * READ ONLY Supabase query.
   *
   * We only care about rows whose range includes
   * the requested model year.
   */
  let existingRows;

  try {
    existingRows =
      await sb(
        env,
        `/generations` +
        `?make=eq.${encodeURIComponent(
          make
        )}` +
        `&year_start=lte.${year}` +
        `&year_end=gte.${year}` +
        `&select=model,year_start,year_end`
      );
  } catch (err) {
    return {
      make,
      error:
        `Supabase lookup failed: ${err.message}`,
    };
  }

  const existingModels =
    [
      ...new Set(
        existingRows
          .map(
            (row) =>
              row.model
          )
          .filter(Boolean)
      ),
    ];

  const {
    models:
      canonicalModels,
    needsResearch,
  } =
    buildCanonicalModels(
      make,
      rawModels
    );

  const alreadyCovered = [];

  const acceptedModels = [];

  for (
    const candidate
    of canonicalModels
  ) {
    const existing =
      findExistingModel(
        candidate.canonical,
        existingModels
      );

    if (existing) {
      const generationRows =
        existingRows.filter(
          (row) =>
            normalizeLoose(
              row.model
            ) ===
            normalizeLoose(
              existing.model
            )
        );

      alreadyCovered.push({
        canonical:
          candidate.canonical,

        rawModels:
          candidate.rawModels,

        existingModel:
          existing.model,

        matchType:
          existing.matchType,

        generations:
          generationRows.map(
            (row) => ({
              yearStart:
                row.year_start,
              yearEnd:
                row.year_end,
            })
          ),
      });

      continue;
    }

    /*
     * THIS IS THE IMPORTANT CHANGE.
     *
     * A normal vPIC model that is not already in Supabase
     * is accepted as a valid MY model.
     *
     * It is NOT sent to needsResearch merely because
     * Supabase doesn't contain it yet.
     */
    acceptedModels.push({
      canonical:
        candidate.canonical,

      rawModels:
        candidate.rawModels,

      modelYear:
        year,

      source:
        'NHTSA vPIC',

      status:
        'accepted-vpic-model',
    });
  }

  return {
    make,

    vpicRawModelCount:
      rawModels.length,

    canonicalModelCount:
      canonicalModels.length,

    alreadyCovered,

    acceptedModels,

    needsResearch,
  };
}

function summarize(
  year,
  results
) {
  const makesWithErrors =
    results.filter(
      (result) =>
        Boolean(result.error)
    ).length;

  const totalVpicRawModels =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result
            .vpicRawModelCount ??
          0
        ),
      0
    );

  const totalCanonicalModels =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result
            .canonicalModelCount ??
          0
        ),
      0
    );

  const totalAlreadyCovered =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result
            .alreadyCovered
            ?.length ??
          0
        ),
      0
    );

  const totalAcceptedModels =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result
            .acceptedModels
            ?.length ??
          0
        ),
      0
    );

  const totalNeedsResearch =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result
            .needsResearch
            ?.length ??
          0
        ),
      0
    );

  return {
    year,

    source: {
      name:
        'NHTSA vPIC',

      purpose:
        'model-year make/model discovery',

      generationBoundaries:
        false,

      supabaseWrites:
        false,
    },

    totalMakesConfigured:
      TIER_A_MAKES.length,

    summary: {
      makesChecked:
        results.length,

      makesWithErrors,

      totalVpicRawModels,

      totalCanonicalModels,

      totalAlreadyCovered,

      totalAcceptedModels,

      totalNeedsResearch,
    },

    makes:
      results,
  };
}

export async function onRequestGet({
  request,
  env,
}) {
  const url =
    new URL(
      request.url
    );

  const year =
    Number(
      url.searchParams.get(
        'year'
      )
    );

  if (
    !Number.isInteger(year) ||
    year < 1996
  ) {
    return json(
      {
        error:
          'year is required and must be >= 1996, e.g. ?year=2026',
      },
      400
    );
  }

  const supabaseUrl =
    env.SUPABASE_URL ??
    env.VITE_SUPABASE_URL;

  if (
    !supabaseUrl ||
    !env.SUPABASE_SERVICE_KEY
  ) {
    return json(
      {
        error:
          'Server not configured — check SUPABASE_URL / SUPABASE_SERVICE_KEY env vars',
      },
      500
    );
  }

  const makesParam =
    url.searchParams.get(
      'makes'
    );

  const isBatchWorker =
    url.searchParams.get(
      '_batch'
    ) === '1';

  /*
   * Explicit make request:
   *
   * ?year=2026&makes=Toyota,Honda
   */
  if (makesParam) {
    const requestedMakes =
      makesParam
        .split(',')
        .map(
          (make) =>
            make.trim()
        )
        .filter(Boolean);

    const results = [];

    for (
      const requestedMake
      of requestedMakes
    ) {
      const configured =
        TIER_A_MAKES.find(
          (make) =>
            make.toLowerCase() ===
            requestedMake.toLowerCase()
        );

      const make =
        configured ??
        requestedMake;

      results.push(
        await checkMake(
          env,
          make,
          year
        )
      );
    }

    return json(
      summarize(
        year,
        results
      )
    );
  }

  /*
   * Internal batch invocation.
   *
   * We intentionally keep batches small because each make
   * can require several NHTSA requests depending on its
   * supported vehicle types.
   */
  if (isBatchWorker) {
    const offset =
      Number(
        url.searchParams.get(
          'offset'
        )
      ) || 0;

    const requestedLimit =
      Number(
        url.searchParams.get(
          'limit'
        )
      );

    const limit =
      Number.isInteger(
        requestedLimit
      ) &&
      requestedLimit > 0
        ? Math.min(
            requestedLimit,
            DEFAULT_BATCH_SIZE
          )
        : DEFAULT_BATCH_SIZE;

    const batchMakes =
      TIER_A_MAKES.slice(
        offset,
        offset + limit
      );

    const results = [];

    for (
      const make
      of batchMakes
    ) {
      results.push(
        await checkMake(
          env,
          make,
          year
        )
      );
    }

    return json({
      makes:
        results,
    });
  }

  /*
   * MAIN REQUEST
   *
   * Browser makes ONE request.
   *
   * This function splits the work across multiple internal
   * Cloudflare invocations so we do not burn through the
   * per-invocation external subrequest budget.
   */
  const allResults = [];

  for (
    let offset = 0;
    offset <
    TIER_A_MAKES.length;
    offset +=
      DEFAULT_BATCH_SIZE
  ) {
    const batchUrl =
      new URL(
        request.url
      );

    batchUrl.searchParams.set(
      '_batch',
      '1'
    );

    batchUrl.searchParams.set(
      'offset',
      String(offset)
    );

    batchUrl.searchParams.set(
      'limit',
      String(
        DEFAULT_BATCH_SIZE
      )
    );

    let res;

    try {
      res =
        await fetch(
          batchUrl.toString()
        );
    } catch (err) {
      allResults.push({
        make:
          `[batch offset ${offset}]`,

        error:
          `Batch request failed: ${err.message}`,
      });

      continue;
    }

    if (!res.ok) {
      let body = '';

      try {
        body =
          await res.text();
      } catch {
        // ignore body failure
      }

      allResults.push({
        make:
          `[batch offset ${offset}]`,

        error:
          `Batch request failed (${res.status})` +
          (
            body
              ? `: ${body.slice(
                  0,
                  300
                )}`
              : ''
          ),
      });

      continue;
    }

    let data;

    try {
      data =
        await res.json();
    } catch (err) {
      allResults.push({
        make:
          `[batch offset ${offset}]`,

        error:
          `Invalid batch JSON: ${err.message}`,
      });

      continue;
    }

    allResults.push(
      ...(data.makes ?? [])
    );
  }

  return json(
    summarize(
      year,
      allResults
    )
  );
}