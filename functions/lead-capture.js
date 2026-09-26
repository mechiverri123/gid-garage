// Cloudflare Pages Function — POST /lead-capture
// Public webhook target for external lead sources (Facebook Lead Ads via
// Zapier, Google Forms via Zapier, a landing page form, etc.) — anything
// that can send a JSON POST. Protected by a shared-secret query param
// (?key=...) since this has no Cloudflare Access in front of it, unlike
// the /admin-api-data routes.
//
// Setup: set LEAD_WEBHOOK_SECRET in Cloudflare Pages env vars, then point
// your webhook source at:
//   https://gidgarage.com/lead-capture?key=YOUR_SECRET
//
// Body (all fields optional except at least one of phone/email):
//   { fname?, lname?, name?, phone?, email?, source?, campaign?, vehicle?,
//     requested_service?, notes? }
//   `name` is split into fname/lname if fname/lname aren't given separately
//   (Facebook Lead Ads typically sends a single "full_name" field — map
//   that to `name` in your Zapier step).
//   `source` defaults to 'other' if not given — set it explicitly per
//   webhook (e.g. 'facebook_organic', 'google_ads') so the funnel in the
//   Command Center attributes correctly.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const providedKey = url.searchParams.get('key');
  const expectedKey = env.LEAD_WEBHOOK_SECRET;
  if (!expectedKey) {
    return json({ error: 'Server not configured (LEAD_WEBHOOK_SECRET missing)' }, 500);
  }
  if (providedKey !== expectedKey) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }
  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  let { fname, lname, name, phone, email, source, campaign, vehicle, requested_service, notes } = payload;

  if (!fname && !lname && name) {
    const parts = String(name).trim().split(/\s+/);
    fname = parts[0] || '';
    lname = parts.slice(1).join(' ') || '';
  }

  if (!phone && !email) {
    return json({ error: 'Need at least a phone or email' }, 400);
  }

  const row = {
    fname: fname || '',
    lname: lname || '',
    phone: phone || '',
    email: email || '',
    source: source || 'other',
    campaign: campaign || null,
    vehicle: vehicle || null,
    requested_service: requested_service || null,
    status: 'new',
    raw_payload: payload,
  };

  try {
    const res = await fetch(`${base}/leads`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: detail }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message ?? 'Unknown error' }, 500);
  }
}
