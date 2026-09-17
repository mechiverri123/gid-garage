/**
 * taxonomy-gap-check — Cloudflare Pages Function
 *
 * Finds MY make/model combinations reported through NHTSA vPIC that are not
 * currently covered by the GID Repair `generations` table.
 *
 * IMPORTANT:
 * vPIC establishes candidate make/model existence. It does NOT establish
 * generation boundaries. year_start/year_end must still be researched
 * separately using the project's source hierarchy.
 *
 * Raw vPIC model names are also not automatically canonical GID models.
 * Known variants are normalized through explicit aliases below.
 *
 * GET /taxonomy-gap-check?year=2026
 *   -> checks all configured makes using internal batching.
 *
 * GET /taxonomy-gap-check?year=2026&makes=Toyota,Honda
 *   -> checks only specified makes.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

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

/**
 * Explicit raw-vPIC-name -> canonical GID model mappings.
 *
 * DO NOT replace this with generic suffix stripping.
 * Some apparently variant-looking names are genuinely separate marketed
 * vehicles. Example: Toyota bZ Woodland should remain separate from bZ.
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
    'ariya mpv': 'Ariya',
    'kicks mpv': 'Kicks',
    'nissan z': 'Z',
  },

  gmc: {
    'yukon xl': 'Yukon',
  },
};

/**
 * Conservative suspicion rules.
 *
 * These DO NOT delete anything.
 * They send questionable vPIC results into needsReview.
 */
const REVIEW_PATTERNS = [
  {
    re: /'\d{2}\b/,
    reason:
      'looks like a historical/replica year designation (e.g. "\'34")',
  },

  {
    re: /\b(sedan|coupe|convertible|wagon|roadster|hatchback|cab)$/i,
    reason:
      'ends in a generic body-style word, not a normal nameplate pattern for this make',
  },

  {
    re: /\bmk\s?(i{1,3}|iv|v|\d+)\b/i,
    reason:
      'looks like a motorsport/homologation-special suffix (e.g. "MKII")',
  },
];

/**
 * Known non-consumer / junk vPIC entries.
 *
 * We still expose these through needsReview rather than silently dropping them.
 */
const EXCLUDE_NAMEPLATES = {
  hyundai: new Set([
    'xcient',
  ]),

  kia: new Set([
    'miami',
  ]),
};

async function vpic(path) {
  const separator = path.includes('?') ? '&' : '?';

  const res = await fetch(
    `${VPIC_BASE}${path}${separator}format=json`
  );

  if (!res.ok) {
    throw new Error(
      `vPIC request failed (${res.status}): ${path}`
    );
  }

  const data = await res.json();

  return data.Results || [];
}

function sbHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

async function sb(env, path) {
  const base =
    `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;

  const res = await fetch(
    `${base}${path}`,
    {
      headers: sbHeaders(env.SUPABASE_SERVICE_KEY),
    }
  );

  if (!res.ok) {
    throw new Error(
      `Supabase request failed (${res.status}): ${path}`
    );
  }

  return res.json();
}

/**
 * Loose comparison ONLY for punctuation/spacing drift.
 *
 * Examples:
 * F-150 vs F150
 * ID.4 vs ID4
 *
 * This must NOT be used for general model-family collapsing.
 */
function normalizeLoose(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getAllowedVehicleTypesForMake(make) {
  const types = await vpic(
    `/GetVehicleTypesForMake/${encodeURIComponent(make)}`
  );

  return types
    .map((t) => t.VehicleTypeName)
    .filter(
      (name) =>
        name &&
        !EXCLUDED_VEHICLE_TYPES.has(
          name.toUpperCase()
        )
    );
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
    `/vehicletype/${encodeURIComponent(vehicleType)}`;

  const results = await vpic(path);

  return results
    .map((r) => r.Model_Name)
    .filter(Boolean);
}

/**
 * Classifies one raw vPIC model.
 */
function classifyRaw(
  make,
  rawName,
  existingModels,
  existingNormalizedMap
) {
  const makeKey = make.toLowerCase();
  const rawKey = rawName.toLowerCase().trim();

  /*
   * 1. Exact current-generation DB match.
   */
  const exact = existingModels.find(
    (m) =>
      m.toLowerCase() === rawName.toLowerCase()
  );

  if (exact) {
    return {
      bucket: 'alreadyCovered',
      value: rawName,
    };
  }

  /*
   * 2. Explicit variant alias.
   */
  const aliasTarget =
    ALIAS_MAP[makeKey]?.[rawKey];

  if (aliasTarget) {
    const canonicalCovered =
      existingModels.find(
        (m) =>
          m.toLowerCase() ===
          aliasTarget.toLowerCase()
      );

    if (canonicalCovered) {
      return {
        bucket: 'normalizedMatches',

        value: {
          raw: rawName,
          canonical: aliasTarget,
          status:
            'already covered under canonical name',
        },
      };
    }

    return {
      bucket: 'gaps',

      value: {
        raw: rawName,
        canonical: aliasTarget,
      },
    };
  }

  /*
   * 3. Possible formatting mismatch.
   *
   * Don't automatically equate it.
   */
  const looseMatch =
    existingNormalizedMap.get(
      normalizeLoose(rawName)
    );

  if (looseMatch) {
    return {
      bucket: 'needsReview',

      value: {
        raw: rawName,
        reason:
          `possible name-formatting mismatch with ` +
          `existing DB model "${looseMatch}"`,
      },
    };
  }

  /*
   * 4. Previously observed junk / non-consumer entry.
   */
  if (
    EXCLUDE_NAMEPLATES[makeKey]?.has(rawKey)
  ) {
    return {
      bucket: 'needsReview',

      value: {
        raw: rawName,
        reason:
          'confirmed non-consumer/junk nameplate from a prior run — verify before ever treating as real',
      },
    };
  }

  /*
   * 5. Conservative pattern review.
   */
  for (const { re, reason } of REVIEW_PATTERNS) {
    if (re.test(rawName)) {
      return {
        bucket: 'needsReview',

        value: {
          raw: rawName,
          reason,
        },
      };
    }
  }

  /*
   * 6. Nothing suspicious.
   *
   * Treat as a candidate canonical gap.
   * Generation years are NOT inferred here.
   */
  return {
    bucket: 'gaps',

    value: {
      raw: rawName,
      canonical: rawName,
    },
  };
}

/**
 * IMPORTANT:
 *
 * Multiple raw vPIC strings can map to ONE GID model.
 *
 * Example:
 *
 * F-250
 * F-350
 * F-450
 * F-550
 * F-600
 *
 * all map to:
 *
 * Super Duty
 *
 * We therefore deduplicate AFTER canonicalization.
 *
 * Raw source names remain attached so we can audit exactly
 * what vPIC returned.
 */
function dedupeCanonicalGaps(gaps) {
  const byCanonical = new Map();

  for (const gap of gaps) {
    const key =
      normalizeLoose(gap.canonical);

    const existing =
      byCanonical.get(key);

    if (!existing) {
      byCanonical.set(
        key,
        {
          canonical: gap.canonical,
          rawModels: [gap.raw],
        }
      );

      continue;
    }

    if (
      !existing.rawModels.includes(gap.raw)
    ) {
      existing.rawModels.push(gap.raw);
    }
  }

  return [...byCanonical.values()]
    .sort(
      (a, b) =>
        a.canonical.localeCompare(
          b.canonical
        )
    );
}

async function checkMakeGaps(
  env,
  make,
  year
) {
  let vpicModels = [];

  try {
    const allowedTypes =
      await getAllowedVehicleTypesForMake(
        make
      );

    const perType =
      await Promise.all(
        allowedTypes.map(
          (type) =>
            getModelsForMakeYear(
              make,
              year,
              type
            )
        )
      );

    vpicModels = [
      ...new Set(perType.flat()),
    ].sort();
  } catch (err) {
    return {
      make,
      error:
        `vPIC lookup failed: ${err.message}`,
    };
  }

  let existingRows = [];

  try {
    existingRows = await sb(
      env,
      `/generations` +
        `?make=eq.${encodeURIComponent(make)}` +
        `&year_start=lte.${year}` +
        `&year_end=gte.${year}` +
        `&select=model`
    );
  } catch (err) {
    return {
      make,
      error:
        `Supabase lookup failed: ${err.message}`,
    };
  }

  const existingModels =
    existingRows.map(
      (r) => r.model
    );

  const existingNormalizedMap =
    new Map(
      existingModels.map(
        (model) => [
          normalizeLoose(model),
          model,
        ]
      )
    );

  const alreadyCovered = [];
  const normalizedMatches = [];
  const rawGaps = [];
  const needsReview = [];

  for (const rawName of vpicModels) {
    const { bucket, value } =
      classifyRaw(
        make,
        rawName,
        existingModels,
        existingNormalizedMap
      );

    if (
      bucket === 'alreadyCovered'
    ) {
      alreadyCovered.push(value);
    } else if (
      bucket === 'normalizedMatches'
    ) {
      normalizedMatches.push(value);
    } else if (
      bucket === 'gaps'
    ) {
      rawGaps.push(value);
    } else {
      needsReview.push(value);
    }
  }

  /*
   * Canonical deduplication happens here.
   */
  const gaps =
    dedupeCanonicalGaps(rawGaps);

  return {
    make,
    vpicModelCount:
      vpicModels.length,

    alreadyCovered,
    normalizedMatches,
    gaps,
    needsReview,
  };
}

export async function onRequestGet({
  request,
  env,
}) {
  const url =
    new URL(request.url);

  const year =
    Number(
      url.searchParams.get('year')
    );

  if (!Number.isInteger(year)) {
    return json(
      {
        error:
          'year is required, e.g. ?year=2026',
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
    url.searchParams.get('makes');

  const isBatchWorker =
    url.searchParams.get('_batch') ===
    '1';

  /*
   * Explicit make selection.
   */
  if (makesParam) {
    const requestedMakes =
      makesParam
        .split(',')
        .map(
          (m) => m.trim()
        )
        .filter(Boolean);

    const results = [];

    for (
      const requestedMake
      of requestedMakes
    ) {
      /*
       * Resolve configured make case-insensitively when possible.
       */
      const configuredMake =
        TIER_A_MAKES.find(
          (m) =>
            m.toLowerCase() ===
            requestedMake.toLowerCase()
        );

      const make =
        configuredMake ??
        requestedMake;

      results.push(
        await checkMakeGaps(
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
   * Internal batch worker.
   *
   * Each self-request is a new Worker invocation with its
   * own subrequest budget.
   */
  if (isBatchWorker) {
    const offset =
      Number(
        url.searchParams.get('offset')
      ) || 0;

    const requestedLimit =
      Number(
        url.searchParams.get('limit')
      );

    const limit =
      Number.isInteger(requestedLimit) &&
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
        await checkMakeGaps(
          env,
          make,
          year
        )
      );
    }

    return json({
      makes: results,
    });
  }

  /*
   * Default:
   *
   * Caller makes ONE request.
   *
   * This invocation calls itself in safe 5-make batches.
   */
  const allResults = [];

  for (
    let offset = 0;
    offset <
    TIER_A_MAKES.length;
    offset += DEFAULT_BATCH_SIZE
  ) {
    const batchUrl =
      new URL(request.url);

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
      String(DEFAULT_BATCH_SIZE)
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
          `Batch sub-request failed: ${err.message}`,
      });

      continue;
    }

    if (!res.ok) {
      allResults.push({
        make:
          `[batch offset ${offset}]`,
        error:
          `Batch sub-request failed (${res.status})`,
      });

      continue;
    }

    const data =
      await res.json();

    allResults.push(
      ...(data.makes || [])
    );
  }

  return json(
    summarize(
      year,
      allResults
    )
  );
}

function summarize(
  year,
  results
) {
  const totalGaps =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result.gaps?.length ||
          0
        ),
      0
    );

  const totalReview =
    results.reduce(
      (sum, result) =>
        sum +
        (
          result.needsReview
            ?.length ||
          0
        ),
      0
    );

  const makesWithErrors =
    results.filter(
      (result) =>
        Boolean(result.error)
    ).length;

  return {
    year,

    totalMakesConfigured:
      TIER_A_MAKES.length,

    summary: {
      makesChecked:
        results.length,

      makesWithErrors,

      totalGaps,

      totalNeedsReview:
        totalReview,
    },

    makes: results,
  };
}