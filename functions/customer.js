// Cloudflare Pages Function — POST /api/customer
// PUBLIC customer operations that legitimately need DB access, now that the
// anon key can no longer read the bookings table. Each action validates itself
// server-side; the Supabase SERVICE key never leaves the worker.
//
// Body: { action: string, ...args }
//   booked-slots        { date }                 -> string[]  (times only, no PII)
//   cancel-token        { id }                    -> { token } (HMAC, used when building cancel links)
//   cancel-verify       { id, token }             -> { valid, booking? }
//   cancel              { id, token }             -> { ok, booking? }
//   get-job             { id }                    -> Booking | null  (for estimate/invoice pages)
//   sign                { id, signature }         -> { ok }   (customer e-signs estimate)
//   estimate-decline    { id }                    -> { ok }   (customer declines estimate)
//   returning-customer  { fname,lname,email,phone}-> { stripeCustomerId, last4 } | null

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// HMAC-SHA256(secret, bookingId) -> 32-char hex. Replaces the old hardcoded-secret
// SHA-256 that lived in the browser bundle. Secret now comes from env only.
async function makeToken(bookingId, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bookingId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// Constant-time-ish compare
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  const cancelSecret = env.CANCEL_TOKEN_SECRET;
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

  const { action } = payload;

  try {
    switch (action) {
      // ---- Availability (no PII leaves the worker) -------------------------
      case 'booked-slots': {
        const { date } = payload;
        if (!date) return json({ error: 'Missing date' }, 400);
        const res = await fetch(
          `${base}/bookings?select=time&date=eq.${encodeURIComponent(date)}&status=not.in.(cancelled,pending)`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows.map((r) => r.time));
      }

      // ---- Cancel-link token (built when sending confirmation email) -------
      case 'cancel-token': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        if (!cancelSecret) return json({ error: 'Cancel secret not configured' }, 500);
        return json({ token: await makeToken(id, cancelSecret) });
      }

      // ---- Verify a cancel link before showing the confirm UI --------------
      case 'cancel-verify': {
        const { id, token } = payload;
        if (!id || !token) return json({ valid: false });
        if (!cancelSecret) return json({ valid: false });
        const expected = await makeToken(id, cancelSecret);
        if (!safeEqual(expected, token)) return json({ valid: false });
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}&select=*`,
          { headers }
        );
        if (!res.ok) return json({ valid: false });
        const rows = await res.json();
        return json({ valid: true, booking: rows[0] ?? null });
      }

      // ---- Perform the cancellation ---------------------------------------
      case 'cancel': {
        const { id, token } = payload;
        if (!id || !token) return json({ error: 'Missing id or token' }, 400);
        if (!cancelSecret) return json({ error: 'Cancel secret not configured' }, 500);
        const expected = await makeToken(id, cancelSecret);
        if (!safeEqual(expected, token)) return json({ error: 'Invalid token' }, 403);

        // Read the row first so the client can send the cancellation email.
        const readRes = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}&select=*`,
          { headers }
        );
        const rows = readRes.ok ? await readRes.json() : [];
        const booking = rows[0] ?? null;

        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'cancelled', job_status: 'CANCELLED' }),
          }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true, booking });
      }

      // ---- Estimate / invoice page: read one job by id ---------------------
      case 'get-job': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}&select=*`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      // ---- Customer e-signs the estimate -----------------------------------
      case 'sign': {
        const { id, signature, damage } = payload;
        if (!id || !signature) return json({ error: 'Missing id or signature' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              customer_agreed: true,
              customer_signature: String(signature).slice(0, 200),
              signed_at: new Date().toISOString(),
              job_status: 'SIGNED',
              ...(damage !== undefined ? { pre_existing_damage: String(damage).slice(0, 2000) } : {}),
            }),
          }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Customer declines the estimate ----------------------------------
      case 'estimate-decline': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              customer_agreed: false,
              customer_signature: '',
              signed_at: null,
              job_status: 'BOOKED',
            }),
          }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Returning-customer card-on-file lookup --------------------------
      // Requires an exact name + email + phone match; returns only the Stripe
      // customer id + last4 (never the full row).
      case 'returning-customer': {
        const { fname, lname, email, phone } = payload;
        if (!fname || !lname || !email || !phone) return json(null);
        const digits = String(phone).replace(/\D/g, '');
        const dash = digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
        const url =
          `${base}/bookings?select=stripe_customer_id,stripe_last4` +
          `&fname=ilike.${encodeURIComponent(fname)}` +
          `&lname=ilike.${encodeURIComponent(lname)}` +
          `&email=ilike.${encodeURIComponent(email)}` +
          `&or=(phone.eq.${digits},phone.eq.${dash})` +
          `&stripe_customer_id=not.is.null&order=created_at.desc&limit=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) return json(null);
        const rows = await res.json();
        if (rows.length && rows[0].stripe_customer_id) {
          return json({ stripeCustomerId: rows[0].stripe_customer_id, last4: rows[0].stripe_last4 ?? null });
        }
        return json(null);
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: err.message ?? 'Unknown error' }, 500);
  }
}
