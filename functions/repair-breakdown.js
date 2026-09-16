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



// Repair Tool employee knowledge-browser API. Read-only. The worker corpus is
// evidence storage; this endpoint deliberately turns it into technician-readable
// cards and suppresses research-only rows rather than printing JSON.
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=30' } });
}
function clean(v) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; }
function obj(row) {
  if (row.value_json && typeof row.value_json === 'object' && !Array.isArray(row.value_json)) return row.value_json;
  if (typeof row.value_text === 'string') { const t=row.value_text.trim(); if (t.startsWith('{')&&t.endsWith('}')) try { return JSON.parse(t); } catch {} }
  return {};
}
function label(v) { return String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function sourceUrl(v) { if (!v || typeof v !== 'string' || !/^https?:\/\//i.test(v)) return null; const x=v.toLowerCase().split('?')[0]; return (x.endsWith('.zip')||x.includes('mfr_comms_received_')||x.includes('complaints_received_')) ? null : v; }
function detailPairs(o, skip=[]) { const banned=new Set(['summary','evidence','text','value',...skip]); const out=[]; for(const [k,v] of Object.entries(o||{})){ if(banned.has(k)||v==null||v===''||(Array.isArray(v)&&!v.length)||typeof v==='object'&&!Array.isArray(v))continue; out.push({label:label(k),value:clean(Array.isArray(v)?v.join(', '):String(v))}); } return out.slice(0,12); }
function baseCard(r, title, summary, details=[]) { return { id:r.id, category:r.category, field_name:r.field_name, title, summary:clean(summary), details, units:r.units, source_name:r.source_name, source_url:sourceUrl(r.source_url), source_record_id:r.source_record_id, confidence:r.confidence, verification_status:r.verification_status, evidence_text:clean(r.evidence_text), search_text:clean([title,summary,...details.map(d=>`${d.label} ${d.value}`),r.evidence_text].join(' ')) }; }
function isResearchOnly(r) {
  if (r.field_name === 'engine_models_vpic_wmi') return true;
  if (r.category === 'diagnostics' && r.field_name === 'known_failure_signal' && obj(r).campaign_number) return true;
  return false;
}
function groupRows(raw) {
  const rows=raw.filter(r=>!isResearchOnly(r)); const used=new Set(); const out=[];
  // Merge W2 fragments belonging to one manufacturer communication into one card.
  const bulletins=new Map();
  for(const r of rows){ if(!['tsbs','diagnostics','procedures','torque_specs'].includes(r.category))continue; const o=obj(r); const id=o.document_id||o.nhtsa_id||r.source_record_id; if(!id)continue; const key=`${r.category}|${id}`; if(!bulletins.has(key))bulletins.set(key,[]); bulletins.get(key).push(r); }
  for(const [key,group] of bulletins){ if(group.length<2)continue; const first=group.find(r=>r.field_name==='manufacturer_communication')||group[0]; const all=group.map(obj); const pick=(name)=>all.map(o=>o[name]).find(v=>v!=null&&v!==''); const dtcs=[...new Set(all.flatMap(o=>Array.isArray(o.dtcs)?o.dtcs:(o.dtc?[o.dtc]:[])))]; const symptoms=[...new Set(all.flatMap(o=>Array.isArray(o.symptoms)?o.symptoms:(o.symptom?[o.symptom]:[])))]; const actions=[...new Set(all.flatMap(o=>[o.service_action,o.action,o.remedy].filter(Boolean)))]; const conditions=[...new Set(all.flatMap(o=>[o.operating_condition,o.condition].filter(Boolean)))]; const summary=pick('summary')||actions[0]||first.evidence_text||first.value_text||''; const details=[]; const doc=pick('document_id')||pick('nhtsa_id')||first.source_record_id; if(doc)details.push({label:'Bulletin / Document',value:String(doc)}); if(dtcs.length)details.push({label:'DTCs',value:dtcs.join(', ')}); if(symptoms.length)details.push({label:'Symptoms',value:symptoms.join(', ')}); if(conditions.length)details.push({label:'Conditions',value:conditions.join('; ')}); if(actions.length)details.push({label:'Service Action',value:actions.join('; ')}); const title=first.category==='diagnostics'?'Diagnostic Service Bulletin':first.category==='torque_specs'?'Bulletin Torque Specification':first.category==='procedures'?'Service Procedure Bulletin':'Manufacturer Service Bulletin'; out.push(baseCard(first,title,summary,details)); group.forEach(r=>used.add(r.id)); }
  for(const r of rows){ if(used.has(r.id))continue; const o=obj(r); let title=label(r.field_name); let summary=o.summary||o.remedy||o.service_action||o.action||o.symptom||o.value||r.value_text||r.evidence_text||'';
    if(r.field_name==='manufacturer_communication')title='Manufacturer Service Bulletin';
    else if(r.field_name==='tsb_service_intelligence')title='Service Bulletin';
    else if(r.field_name==='tsb_diagnostic_signal')title='Diagnostic Service Bulletin';
    else if(r.field_name==='recall_service_signal')title='Safety Recall';
    else if(r.field_name==='known_failure_signal')title='Known Failure Signal';
    else if(r.field_name==='dtc_reference')title=o.dtc?`DTC ${o.dtc}`:'Diagnostic Trouble Code';
    else if(r.field_name==='explicit_torque_spec')title='Torque Specification';
    else if(r.field_name==='explicit_numeric_spec')title='Service Specification';
    else if(r.field_name==='service_action')title='Service Action';
    else if(r.field_name==='software_calibration_action')title='Software / Calibration';
    else if(r.field_name==='special_tool_reference')title='Special Tool';
    // If value_text is serialized JSON, never display it. Use useful object fields/evidence only.
    if(typeof r.value_text==='string'&&r.value_text.trim().startsWith('{')) summary=o.summary||o.remedy||o.service_action||o.action||o.symptom||r.evidence_text||'';
    if(!clean(summary) && !Object.keys(o).length) continue;
    out.push(baseCard(r,title,summary,detailPairs(o,['remedy','service_action','action','symptom'])));
  }
  // Exact duplicate collapse after shaping.
  const seen=new Set(); return out.filter(c=>{const k=`${c.category}|${c.title}|${c.summary}|${c.source_record_id||''}`;if(seen.has(k))return false;seen.add(k);return true;});
}
async function sbGet(url, headers, name) { const r=await fetch(url,{headers}); if(!r.ok){const t=await r.text().catch(()=> ''); throw new Error(`${name} failed (${r.status})${t?`: ${t.slice(0,180)}`:''}`);} return r.json(); }
async function repairToolKnowledgeGet(url, env) {
  const supabaseUrl=env.SUPABASE_URL??env.VITE_SUPABASE_URL, serviceKey=env.SUPABASE_SERVICE_KEY;
  if(!supabaseUrl||!serviceKey)return jsonResponse({error:'Repair knowledge database is not configured'},500);
  if(url.searchParams.get('mode')!=='knowledge')return jsonResponse({error:'Unsupported Repair Tool request'},400);
  const year=url.searchParams.get('year'), make=url.searchParams.get('make'), model=url.searchParams.get('model');
  if(!year||!make||!model)return jsonResponse({error:'Year, make, and model are required'},400);
  const base=`${supabaseUrl}/rest/v1`, headers=supabaseHeaders(serviceKey);
  try {
    const select='vehicle_key,year,make,model,engine_model,engine_displacement_l,engine_cylinders,fuel_type,drive_type,transmission_speeds,transmission_style,trim,source';
    const cfg=`${base}/knowledge_vehicle_configurations?year=eq.${encodeURIComponent(year)}&make=eq.${encodeURIComponent(make)}&model=eq.${encodeURIComponent(model)}&select=${select}&limit=1000`;
    const configurations=await sbGet(cfg,headers,'Vehicle configuration query');
    if(!configurations.length)return jsonResponse({error:`No exact catalog match for ${year} ${make} ${model}`},404);
    const keys=[...new Set(configurations.map(c=>c.vehicle_key).filter(Boolean))];
    let raw=[];
    // Query each exact vehicle key independently. This avoids fragile PostgREST in.(...) quoting
    // and remains bounded because a year/make/model normally maps to very few vehicle keys.
    for(const key of keys){
      const q=`${base}/knowledge_research_results?vehicle_key=eq.${encodeURIComponent(key)}&select=id,vehicle_key,category,field_name,value_text,value_json,units,source_name,source_url,source_record_id,evidence_text,confidence,verification_status,created_at&order=category.asc,field_name.asc&limit=5000`;
      raw.push(...await sbGet(q,headers,'Repair knowledge query'));
    }
    const rows=groupRows(raw); const counts={}; for(const r of rows)counts[r.category]=(counts[r.category]||0)+1;
    // Engine/configuration identity comes from the exact configuration table, not vPIC WMI candidate lists.
    const engineFacts=[]; const engineSeen=new Set();
    for(const c of configurations){const bits=[c.engine_model,c.engine_displacement_l?`${c.engine_displacement_l} L`:null,c.engine_cylinders?`${c.engine_cylinders} cylinders`:null,c.fuel_type,c.drive_type,[c.transmission_speeds?`${c.transmission_speeds}-speed`:null,c.transmission_style].filter(Boolean).join(' ')].filter(Boolean); if(!bits.length)continue;const s=bits.join(' · ');if(engineSeen.has(s))continue;engineSeen.add(s);engineFacts.push({category:'engine_identity',field_name:'configuration',title:'Verified Vehicle Configuration',summary:s,details:c.trim?[{label:'Trim',value:String(c.trim)}]:[],source_name:c.source||'Vehicle configuration database',source_url:null,verification_status:'configuration',evidence_text:'',search_text:s});}
    const noResearchEngine=rows.filter(r=>r.category!=='engine_identity'); rows.splice(0,rows.length,...noResearchEngine,...engineFacts); counts.engine_identity=engineFacts.length;
    return jsonResponse({vehicle:{year:Number(year),make,model},configurations,rows,counts,raw_count:raw.length,hidden_count:Math.max(0,raw.length-(rows.length-engineFacts.length))});
  } catch(e) { return jsonResponse({error:e instanceof Error?e.message:'Repair Tool query failed'},502); }
}

export async function onRequestGet({ request, env }) {
  const url=new URL(request.url);
  if(url.searchParams.get('mode'))return repairToolKnowledgeGet(url,env);
  const key=url.searchParams.get('key'); if(!key)return jsonResponse({error:'Missing key param'},400);
  const supabaseUrl=env.SUPABASE_URL??env.VITE_SUPABASE_URL, serviceKey=env.SUPABASE_SERVICE_KEY;
  if(!supabaseUrl||!serviceKey)return jsonResponse({error:'Server not configured'},500);
  const headers=supabaseHeaders(serviceKey), base=`${supabaseUrl}/rest/v1`;
  try { const rows=await sbGet(`${base}/repair_breakdowns?key=eq.${encodeURIComponent(key)}&select=*`,headers,'Repair breakdown query'); if(!rows.length)return jsonResponse({error:'Not found'},404); const row=rows[0]; if(row.status==='done')return jsonResponse({status:'done',key,...row.breakdown}); if(row.status==='error')return jsonResponse({status:'error',error:row.error_message}); return jsonResponse({status:row.status}); } catch(e){return jsonResponse({error:e instanceof Error?e.message:'Lookup failed'},502);}
}
