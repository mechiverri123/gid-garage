/**
 * repair-breakdown — Cloudflare Pages Function
 * v5: normalizes each repair into a CANONICAL key before checking the
 * cache, so "2007 RAV4" and "2006 RAV4 2.4L" doing engine work share one
 * cached entry (keyed by shared engine code), and suspension/brake/body
 * work shares one entry per chassis platform generation instead. This
 * still does no research itself — just a small, fast classification call
 * — the actual research still happens in repair_worker.py on your laptop.
 *
 * POST /repair-breakdown   { "repair": "..." }
 * GET  /repair-breakdown?key=...
 *
 * Setup required (Pages > Settings > Environment variables):
 *   - ANTHROPIC_API_KEY   (small/cheap classification calls only — a few
 *     hundred tokens each, effectively fractions of a cent; the actual
 *     research stays on your subscription via the laptop worker)
 *   - SUPABASE_URL (or reuses VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_KEY
 *
 * Run the (updated) supabase_migration.sql once before using this —
 * it adds the repair_aliases table this version needs.
 */

function normalizeRawKey(repair) {
  return repair.trim().toLowerCase().replace(/\s+/g, ' ');
}

function supabaseHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

const NORMALIZE_SYSTEM_PROMPT = `You convert a repair description into a canonical cache key so \
similar jobs across model years/trims that share the same underlying hardware map to the same key.

You will be given a list of EXISTING canonical keys already in the database. Check that list \
FIRST: if this repair genuinely matches one of them (same engine/platform and same repair type), \
respond with that EXACT existing key, copied exactly as shown — same wording, same capitalization, \
same punctuation. Do not paraphrase an existing key even slightly.

Only if nothing in the list matches, create a NEW key following these rules:
- For engine, drivetrain, fuel system, or electrical work: key by the ENGINE CODE \
  shared across years/trims (e.g. "Toyota 2AZ-FE 2.4L", "VW EA888 2.0T"), not the model year. \
  If you don't know the exact engine code with confidence, fall back to "MAKE MODEL YEAR-RANGE".
- For suspension, brakes, body, or interior work: key by the CHASSIS PLATFORM generation \
  shared across years (e.g. "Toyota RAV4 XA30 2006-2012"), not a single model year, \
  UNLESS the repair description gives a specific year that narrows to a mid-cycle change \
  you're aware of — in that case keep the specific year.
- Always end the key with " - " followed by the repair type in a few words.
- If you're not confident about grouping (unfamiliar vehicle, ambiguous description), \
  just normalize the original description minimally instead of guessing a platform/engine code.

Respond with ONLY the canonical key string. No explanation, no quotes, no punctuation besides what's in the key itself.`;

function extractSearchTerm(repair) {
  // Crude but effective: strip a leading year (or year range), keep the next
  // two words — typically make + model — to narrow candidate keys instead of
  // loading every canonical key ever created.
  const noYear = repair.trim().replace(/^\d{4}(-\d{4})?\s+/, '');
  return noYear.split(/\s+/).slice(0, 2).join(' ');
}

async function fetchCandidateKeys(base, headers, repair) {
  const term = extractSearchTerm(repair);
  if (!term) return [];
  const res = await fetch(
    `${base}/repair_breakdowns?key=ilike.*${encodeURIComponent(term)}*&select=key&limit=100`,
    { headers }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => r.key);
}

async function normalizeToCanonicalKey(repair, apiKey, existingKeys) {
  const keysList = existingKeys.length
    ? `Existing canonical keys already in the database:\n${existingKeys.map((k) => `- ${k}`).join('\n')}\n\n`
    : 'No existing keys yet — this will be the first one.\n\n';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: NORMALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${keysList}Repair to classify: ${repair}` }],
    }),
  });
  if (!res.ok) return normalizeRawKey(repair);
  const data = await res.json();
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text || normalizeRawKey(repair);
}

export async function onRequestPost({ request, env, waitUntil }) {
  const { repair, force, canonical_key_hint } = await request.json();
  if (!repair || typeof repair !== 'string') {
    return new Response(JSON.stringify({ error: "Missing 'repair' field" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey || !env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server not configured — check ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = supabaseHeaders(serviceKey);
  const rawKey = normalizeRawKey(repair);

  let canonicalKey;
  let wasMerged = false;

  if (canonical_key_hint && typeof canonical_key_hint === 'string' && canonical_key_hint.trim()) {
    // Trusted caller (queue_batch.py, using your curated target_vehicles
    // platform_key) already knows the correct chassis/engine grouping —
    // skip AI classification entirely so batch-seeded jobs never depend on
    // the model guessing consistently. Still record the alias so an organic
    // /repair-tool query with similar phrasing later reuses this same key.
    canonicalKey = canonical_key_hint.trim();
    waitUntil(fetch(`${base}/repair_aliases`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ raw_key: rawKey, canonical_key: canonicalKey }),
    }));
  } else {
    // Fast path: have we seen this exact phrasing before? Skip classification entirely.
    const aliasRes = await fetch(`${base}/repair_aliases?raw_key=eq.${encodeURIComponent(rawKey)}&select=canonical_key`, { headers });
    const aliasRows = aliasRes.ok ? await aliasRes.json() : [];
    canonicalKey = aliasRows[0]?.canonical_key;

    if (!canonicalKey) {
      const existingKeys = await fetchCandidateKeys(base, headers, repair);
      canonicalKey = await normalizeToCanonicalKey(repair, env.ANTHROPIC_API_KEY, existingKeys);
      wasMerged = canonicalKey !== rawKey;
      // Record this alias (fire-and-forget, doesn't block the response)
      waitUntil(fetch(`${base}/repair_aliases`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ raw_key: rawKey, canonical_key: canonicalKey }),
      }));
    }
  }

  const existingRes = await fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(canonicalKey)}&select=*`, { headers });
  const existing = existingRes.ok ? await existingRes.json() : [];

  if (existing.length > 0 && !force) {
    const row = existing[0];
    if (row.status === 'done') {
      waitUntil(fetch(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(canonicalKey)}`, {
        method: 'PATCH', headers, body: JSON.stringify({ use_count: (row.use_count || 1) + 1, last_used_at: new Date().toISOString() }),
      }));
      return new Response(JSON.stringify({ status: 'done', key: canonicalKey, merged: wasMerged, ...row.breakdown }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ status: row.status, key: canonicalKey, merged: wasMerged }), { headers: { 'Content-Type': 'application/json' } });
  }

  // New key, or a forced refresh of an existing one — (re)queue it for research.
  // NOTE: intentionally not setting breakdown: null here — omitting the
  // column from this upsert leaves the existing (still-good) breakdown in
  // place until the worker's mark_done() overwrites it with a fresh result.
  // If the re-research run errors, mark_error() only sets status/error, so
  // the last known-good breakdown stays visible instead of being wiped.
  await fetch(`${base}/repair_breakdowns`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: canonicalKey, status: 'pending', error_message: null }),
  });

  return new Response(JSON.stringify({ status: 'pending', key: canonicalKey, merged: wasMerged, queued: true }), { headers: { 'Content-Type': 'application/json' } });
}



// Repair Tool employee knowledge-browser API. Read-only and isolated from
// admin/customer APIs. Raw research rows stay intact; this endpoint shapes
// them for an employee-facing repair tool and never exposes archive ZIPs as
// "open source" links.
function jsonResponse(body, status = 200, cache = 'private, max-age=30') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } });
}

async function fetchAllCatalogValues(base, headers, level, filters) {
  const pageSize = 1000;
  const query = `${base}/knowledge_vehicle_configurations?select=${level}${filters}&order=${level}.asc`;
  const first = await fetch(query, { headers: { ...headers, Range: `0-${pageSize - 1}`, Prefer: 'count=exact' } });
  if (!first.ok) throw new Error('Vehicle catalog query failed');
  let rows = await first.json();
  const cr = first.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  const total = m ? Number(m[1]) : rows.length;
  if (total > pageSize) {
    const requests = [];
    for (let from = pageSize; from < total; from += pageSize) {
      requests.push(fetch(query, { headers: { ...headers, Range: `${from}-${Math.min(from + pageSize - 1, total - 1)}` } }));
    }
    const responses = await Promise.all(requests);
    for (const r of responses) {
      if (!r.ok) throw new Error('Vehicle catalog query failed');
      rows = rows.concat(await r.json());
    }
  }
  return [...new Set(rows.map(x => x[level]).filter(v => v !== null && v !== undefined && String(v).trim()))];
}

function safeObject(row) {
  if (row.value_json && typeof row.value_json === 'object' && !Array.isArray(row.value_json)) return row.value_json;
  if (typeof row.value_text === 'string') {
    const t = row.value_text.trim();
    if (t.startsWith('{') && t.endsWith('}')) { try { return JSON.parse(t); } catch {} }
  }
  return null;
}
function humanLabel(s) { return String(s || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function cleanText(s) { return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s; }
function usableSourceUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.zip') || lower.includes('mfr_comms_received_') || lower.includes('complaints_received_')) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
function displayRow(row) {
  const obj = safeObject(row);
  const details = [];
  if (obj) {
    const skip = new Set(['summary','evidence','value','text','remedy']);
    for (const [k,v] of Object.entries(obj)) {
      if (skip.has(k) || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      let value = Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? null : String(v));
      if (value) details.push({ label: humanLabel(k), value: cleanText(value) });
    }
  }
  let title = humanLabel(row.field_name);
  let summary = obj?.summary || obj?.remedy || obj?.service_action || obj?.symptom || obj?.value || row.value_text || row.evidence_text || '';
  if (row.field_name === 'manufacturer_communication') title = 'Manufacturer Service Bulletin';
  if (row.field_name === 'tsb_service_intelligence') title = 'Service Bulletin Intelligence';
  if (row.field_name === 'tsb_diagnostic_signal') title = 'Diagnostic Bulletin';
  if (row.field_name === 'known_failure_signal') title = 'Known Failure / Complaint Signal';
  if (row.field_name === 'recall_service_signal') title = 'Safety Recall';
  if (row.field_name === 'dtc_reference') title = obj?.dtc ? `DTC ${obj.dtc}` : 'Diagnostic Trouble Code';
  if (row.field_name === 'explicit_torque_spec') title = 'Torque Specification';
  if (row.field_name === 'explicit_numeric_spec') title = 'Service Specification';
  if (row.field_name === 'service_action') title = 'Recommended Service Action';
  if (row.field_name === 'software_calibration_action') title = 'Software / Calibration Action';
  if (row.field_name === 'special_tool_reference') title = 'Special Tool';
  if (obj && typeof row.value_text === 'string' && row.value_text.trim().startsWith('{')) summary = obj.summary || obj.remedy || obj.service_action || obj.symptom || row.evidence_text || '';
  return { ...row, title, summary: cleanText(summary), details: details.slice(0, 10), source_url: usableSourceUrl(row.source_url) };
}
function employeeReady(rows) {
  // These vPIC WMI candidate lists are provenance/research evidence, not an
  // exact engine assignment. Never show them to a technician as vehicle data.
  const filtered = rows.filter(r => r.field_name !== 'engine_models_vpic_wmi');
  // W1 can derive the same recall into safety + diagnostic evidence. Keep the
  // recall in Safety; don't pretend a recall campaign is a diagnostic procedure.
  const noRecallDiagnostics = filtered.filter(r => !(r.category === 'diagnostics' && r.field_name === 'known_failure_signal' && safeObject(r)?.campaign_number));
  const seen = new Set();
  const out = [];
  for (const r of noRecallDiagnostics) {
    const o = safeObject(r);
    const bulletin = o?.document_id || o?.nhtsa_id || o?.campaign_number || '';
    const key = `${r.category}|${bulletin}|${cleanText(o?.summary || o?.remedy || r.evidence_text || r.value_text || '').slice(0,180)}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(displayRow(r));
  }
  return out;
}

async function repairToolKnowledgeGet(url, env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Repair knowledge database is not configured' }, 500);
  const base = `${supabaseUrl}/rest/v1`;
  const headers = supabaseHeaders(serviceKey);
  const mode = url.searchParams.get('mode');

  if (mode === 'options') {
    const level = url.searchParams.get('level'); const year = url.searchParams.get('year'); const make = url.searchParams.get('make');
    if (!['year','make','model'].includes(level)) return jsonResponse({ error: 'Invalid option level' }, 400);
    let filters = '';
    if (level !== 'year' && year) filters += `&year=eq.${encodeURIComponent(year)}`;
    if (level === 'model' && make) filters += `&make=eq.${encodeURIComponent(make)}`;
    try {
      const vals = await fetchAllCatalogValues(base, headers, level, filters);
      if (level === 'year') vals.sort((a,b) => Number(b)-Number(a)); else vals.sort((a,b) => String(a).localeCompare(String(b)));
      return jsonResponse({ options: vals.map(v => ({ value: String(v), label: String(v) })) }, 200, 'public, max-age=3600');
    } catch { return jsonResponse({ error: 'Vehicle catalog query failed' }, 502); }
  }

  if (mode === 'knowledge') {
    const year = url.searchParams.get('year'); const make = url.searchParams.get('make'); const model = url.searchParams.get('model');
    if (!year || !make || !model) return jsonResponse({ error: 'Year, make, and model are required' }, 400);
    const cfgUrl = `${base}/knowledge_vehicle_configurations?year=eq.${encodeURIComponent(year)}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=vehicle_key,year,make,model,engine_model,engine_displacement_l,engine_cylinders,fuel_type,drive_type,transmission_speeds,transmission_style,trim,source&limit=1000`;
    const cfgRes = await fetch(cfgUrl, { headers }); const configs = cfgRes.ok ? await cfgRes.json() : [];
    if (!configs.length) return jsonResponse({ error: 'Vehicle is not in the repair catalog' }, 404);
    const keys = [...new Set(configs.map(c => c.vehicle_key).filter(Boolean))];
    const encodedKeys = keys.map(k => `"${String(k).replaceAll('"','\\"')}"`).join(',');
    const resultUrl = `${base}/knowledge_research_results?vehicle_key=in.(${encodeURIComponent(encodedKeys)})&select=id,vehicle_key,category,field_name,value_text,value_json,units,source_name,source_url,source_record_id,evidence_text,confidence,verification_status,created_at&order=category.asc,field_name.asc&limit=5000`;
    const rr = await fetch(resultUrl, { headers });
    if (!rr.ok) return jsonResponse({ error: 'Repair knowledge query failed' }, 502);
    const rawRows = await rr.json(); const rows = employeeReady(rawRows); const counts = {};
    for (const row of rows) counts[row.category] = (counts[row.category] || 0) + 1;
    const v = configs[0];
    return jsonResponse({ vehicle: { year: v.year, make: v.make, model: v.model, vehicle_key: keys[0] }, configurations: configs, vehicle_keys: keys, rows, counts, raw_count: rawRows.length });
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('mode')) { const response = await repairToolKnowledgeGet(url, env); if (response) return response; }
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
  return new Response(JSON.stringify({ status: row.status }), { headers: { 'Content-Type': 'application/json' } });
}
