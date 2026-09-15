/**
 * GID Garage — backend-only knowledge research queue.
 *
 * This is deliberately NOT an AI worker. It only creates deterministic,
 * structured research jobs. The expensive research/extraction worker can be
 * added later without changing the website or admin UI.
 *
 * POST /knowledge-queue
 * {
 *   year: 2018,
 *   make: "Ford",
 *   model: "F-150",
 *   engine: "5.0L V8",
 *   transmission: "10-speed automatic",
 *   drivetrain: "4WD",
 *   system: "Cooling",
 *   component: "Water Pump",
 *   procedure: "Replacement",
 *   priority: 100
 * }
 */

function headers(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function makeVehicleKey({ year, make, model, engine, transmission, drivetrain }) {
  return [year, make, model, engine, transmission, drivetrain]
    .map(clean)
    .filter(Boolean)
    .join('|')
    .toLowerCase();
}

function makeJobKey({ vehicleKey, system, component, procedure }) {
  return [vehicleKey, system, component, procedure]
    .map(clean)
    .join('|')
    .toLowerCase();
}

async function supabase(env, path, options = {}) {
  const base = `${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1`;
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...headers(env.SUPABASE_SERVICE_KEY),
      ...(options.headers || {}),
    },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const year = Number(body.year);
  const make = clean(body.make);
  const model = clean(body.model);
  const engine = clean(body.engine);
  const transmission = clean(body.transmission);
  const drivetrain = clean(body.drivetrain);
  const generation = clean(body.generation);
  const trim = clean(body.trim);
  const system = clean(body.system);
  const component = clean(body.component);
  const procedure = clean(body.procedure);
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100;

  if (!Number.isInteger(year) || year < 1886 || year > 2100 || !make || !model || !system || !component || !procedure) {
    return new Response(JSON.stringify({
      error: 'Required: year, make, model, system, component, procedure',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!env.SUPABASE_SERVICE_KEY || !(env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)) {
    return new Response(JSON.stringify({ error: 'Supabase backend is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const vehicleKey = makeVehicleKey({ year, make, model, engine, transmission, drivetrain });
  const jobKey = makeJobKey({ vehicleKey, system, component, procedure });

  const vehicleRes = await supabase(env, '/knowledge_vehicle_targets', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      vehicle_key: vehicleKey,
      year_start: year,
      year_end: year,
      make,
      model,
      generation: generation || null,
      engine: engine || null,
      transmission: transmission || null,
      drivetrain: drivetrain || null,
      trim: trim || null,
    }),
  });

  if (!vehicleRes.ok) {
    return new Response(JSON.stringify({ error: 'Could not create vehicle target' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const vehicleRows = await vehicleRes.json();
  const targetId = vehicleRows[0]?.id;
  if (!targetId) {
    return new Response(JSON.stringify({ error: 'Vehicle target was not returned' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobRes = await supabase(env, '/knowledge_jobs', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      job_key: jobKey,
      target_id: targetId,
      system,
      component,
      procedure,
      priority,
      status: 'pending',
    }),
  });

  if (!jobRes.ok) {
    return new Response(JSON.stringify({ error: 'Could not queue knowledge job' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = await jobRes.json();
  return new Response(JSON.stringify({
    queued: true,
    dedupe_key: jobKey,
    vehicle_key: vehicleKey,
    job: rows[0] ?? null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
