// Cloudflare Pages Function — /lead-capture
//
// Supports TWO ingestion paths without creating a second lead database:
// 1) Direct Meta Lead Ads webhook (Facebook + Instagram instant forms)
// 2) Existing generic JSON webhook protected by ?key=LEAD_WEBHOOK_SECRET
//
// Required for direct Meta:
//   META_VERIFY_TOKEN       - random string you choose and enter in Meta webhook setup
//   META_APP_SECRET         - Meta app secret, used to verify X-Hub-Signature-256
//   META_PAGE_ACCESS_TOKEN  - page access token that can read Lead Ads data
//   META_GRAPH_VERSION      - app Graph API version, e.g. vXX.X (set this explicitly)
//
// Meta webhook callback URL:
//   https://gidgarage.com/lead-capture
//
// Existing generic webhook still works at:
//   https://gidgarage.com/lead-capture?key=YOUR_SECRET

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalize(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizedKey(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function looksLikeVehicle(value) {
  const s = normalize(value);
  if (!s) return false;
  if (/\b(?:19|20)\d{2}\b/.test(s)) return true;
  const low = s.toLowerCase();
  return ['toyota','honda','ford','chevy','chevrolet','gmc','nissan','subaru','jeep','dodge','ram','kia','hyundai','mazda','lexus','acura','bmw','mercedes','audi','volkswagen','vw','tesla','buick','cadillac','chrysler','lincoln','mitsubishi'].some(make => low.includes(make));
}

function classifyService(...values) {
  const text = values.map(normalize).join(' ').toLowerCase();
  const groups = [
    ['brakes', ['brake change','brake job','brakes','brake','pads','rotors']],
    ['oil', ['oil change','oil service']],
    ['diag', ['diagnostics','diagnostic','check engine','check-engine','diagnose']],
    ['suspension', ['suspension','struts','strut','shocks','shock','control arm']],
    ['audio', ['car audio','stereo','speakers','speaker','radio']],
    ['full', ['full service','maintenance','tune up','tune-up']],
  ];
  for (const [canonical, phrases] of groups) if (phrases.some(p => text.includes(p))) return canonical;
  return null;
}

function splitName(name) {
  const parts = normalize(name).split(/\s+/).filter(Boolean);
  return { fname: parts[0] || '', lname: parts.slice(1).join(' ') || '' };
}

function pickField(map, aliases) {
  for (const [key, value] of Object.entries(map)) {
    const nk = normalizedKey(key);
    if (aliases.some(a => nk.includes(a))) return normalize(value);
  }
  return '';
}

function metaFieldMap(fieldData) {
  const map = {};
  for (const field of Array.isArray(fieldData) ? fieldData : []) {
    const value = Array.isArray(field.values) ? field.values[0] : field.values;
    map[field.name || ''] = value ?? '';
  }
  return map;
}

async function sha256HmacHex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyMetaSignature(request, rawBody, appSecret) {
  const header = request.headers.get('X-Hub-Signature-256') || '';
  if (!appSecret || !header.startsWith('sha256=')) return false;
  const expected = await sha256HmacHex(appSecret, rawBody);
  const supplied = header.slice(7).toLowerCase();
  if (expected.length !== supplied.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0;
}

function supabaseConfig(env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return {
    base: `${supabaseUrl}/rest/v1`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  };
}

async function insertLead(env, row) {
  const cfg = supabaseConfig(env);
  if (!cfg) throw new Error('Server not configured');
  const url = new URL(`${cfg.base}/leads`);
  if (row.external_lead_id) url.searchParams.set('on_conflict', 'external_lead_id');
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...cfg.headers,
      Prefer: row.external_lead_id ? 'resolution=ignore-duplicates,return=representation' : 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json().catch(() => []);
  return rows[0] || null;
}

async function fetchMetaLead(env, leadgenId) {
  const token = env.META_PAGE_ACCESS_TOKEN;
  const version = env.META_GRAPH_VERSION;
  if (!token) throw new Error('META_PAGE_ACCESS_TOKEN missing');
  if (!version) throw new Error('META_GRAPH_VERSION missing');
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set('fields', 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data');
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta lead fetch failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export function normalizeMetaLead(metaLead, webhookValue) {
  const fields = metaFieldMap(metaLead.field_data);
  const fullName = pickField(fields, ['fullname','name']);
  const { fname, lname } = splitName(fullName);
  const email = pickField(fields, ['email']);
  const phone = pickField(fields, ['phonenumber','phone']);
  const issue = pickField(fields, ['whatissuesareyouexperiencingwithyourvehicle','issues','vehicleissue','problem','symptoms']);
  const vehicleAnswer = pickField(fields, ['yearmakemodelenginesize','yearmakemodelengine','vehicle']);
  const schedule = pickField(fields, ['whatdatetimeworksbestforyou','datetimeworksbest','preferredtime','appointmenttime','availability']);
  const explicitService = pickField(fields, ['requestedservice','service','repairneeded','workneeded']);
  const inferredService = classifyService(explicitService, vehicleAnswer, issue, ...Object.values(fields));
  const validVehicle = looksLikeVehicle(vehicleAnswer);

  const notesParts = [];
  if (issue) notesParts.push(`Issue answer: ${issue}`);
  if (schedule) notesParts.push(`Schedule preference: ${schedule}`);
  if (vehicleAnswer && !validVehicle) notesParts.push(`Vehicle-form answer (not recognized as vehicle): ${vehicleAnswer}`);

  return {
    external_lead_id: String(metaLead.id || webhookValue.leadgen_id),
    fname,
    lname,
    phone,
    email,
    source: 'meta_ads',
    campaign: metaLead.campaign_name || webhookValue.campaign_id || null,
    vehicle: validVehicle ? vehicleAnswer : null,
    requested_service: inferredService || explicitService || null,
    notes: notesParts.join('\n') || null,
    status: 'new',
    raw_payload: {
      provider: 'meta',
      meta_leadgen_id: String(metaLead.id || webhookValue.leadgen_id),
      webhook: webhookValue,
      lead: metaLead,
      interpreted: {
        full_name: fullName || null,
        issue: issue || null,
        vehicle_answer: vehicleAnswer || null,
        schedule: schedule || null,
        inferred_service: inferredService || null,
        vehicle_answer_recognized: validVehicle,
      },
    },
  };
}

// Meta webhook verification handshake.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !challenge || token !== env.META_VERIFY_TOKEN) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  // Direct Meta Lead Ads webhook.
  if (payload?.object === 'page' && Array.isArray(payload.entry)) {
    const validSig = await verifyMetaSignature(request, rawBody, env.META_APP_SECRET);
    if (!validSig) return json({ error: 'Invalid Meta signature' }, 401);

    const leadEvents = [];
    for (const entry of payload.entry) {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        if (change.field === 'leadgen' && change.value?.leadgen_id) leadEvents.push(change.value);
      }
    }

    // Meta expects webhook acknowledgement quickly. Fetch/insert all lead events
    // in this request; typical payloads contain one event.
    const results = [];
    for (const event of leadEvents) {
      try {
        const metaLead = await fetchMetaLead(env, event.leadgen_id);
        const row = normalizeMetaLead(metaLead, event);
        const inserted = await insertLead(env, row);
        results.push({ leadgen_id: event.leadgen_id, ok: true, inserted: Boolean(inserted) });
      } catch (e) {
        results.push({ leadgen_id: event.leadgen_id, ok: false, error: e.message ?? String(e) });
      }
    }
    return json({ ok: results.every(r => r.ok), received: leadEvents.length, results }, results.some(r => !r.ok) ? 207 : 200);
  }

  // Existing generic webhook path remains available.
  const providedKey = url.searchParams.get('key');
  const expectedKey = env.LEAD_WEBHOOK_SECRET;
  if (!expectedKey) return json({ error: 'Server not configured (LEAD_WEBHOOK_SECRET missing)' }, 500);
  if (providedKey !== expectedKey) return json({ error: 'Unauthorized' }, 401);

  let { fname, lname, name, phone, email, source, campaign, vehicle, requested_service, notes } = payload;
  if (!fname && !lname && name) ({ fname, lname } = splitName(name));
  if (!phone && !email) return json({ error: 'Need at least a phone or email' }, 400);

  const row = {
    fname: fname || '',
    lname: lname || '',
    phone: phone || '',
    email: email || '',
    source: source || 'other',
    campaign: campaign || null,
    vehicle: vehicle || null,
    requested_service: requested_service || null,
    notes: notes || null,
    status: 'new',
    raw_payload: payload,
  };

  try {
    await insertLead(env, row);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message ?? 'Unknown error' }, 502);
  }
}
