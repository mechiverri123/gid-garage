// Cloudflare Pages Function — POST /admin-api/data
// All ADMIN reads/writes go through here using the Supabase SERVICE key.
// The public anon key can no longer read the bookings table at all.
//
// SECURITY: This route MUST be covered by your Cloudflare Access application
// (the same one protecting /admin). Access blocks unauthenticated requests
// before they reach this function. As defense-in-depth we also require the
// Cf-Access-Jwt-Assertion header to be present (Access injects it on every
// authenticated request).
//
// Body: { action: string, ...args }
//   list-bookings                          -> Booking[]   (full rows)
//   get-booking         { id }             -> Booking | null
//   patch-booking       { id, fields }     -> { ok }
//   patch-by-customer   { customerId, fields } -> { ok }   (e.g. update stripe_last4 on all rows)
//   list-payment-events { limit? }         -> PaymentEvent[]
//   write-payment-event { booking_id, event_type, amount, error_message } -> { ok }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  // Defense-in-depth: require the Access JWT. Access normally blocks this route
  // entirely, but if the route is ever mis-scoped this prevents open access.
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessJwt) {
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

  const { action } = payload;

  try {
    switch (action) {
      case 'list-bookings': {
        const res = await fetch(
          `${base}/bookings?select=*&order=date.desc,time.desc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'get-booking': {
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

      case 'patch-booking': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'patch-by-customer': {
        const { customerId, fields } = payload;
        if (!customerId || !fields) return json({ error: 'Missing customerId or fields' }, 400);
        const res = await fetch(
          `${base}/bookings?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'list-payment-events': {
        const limit = Number(payload.limit) || 20;
        const res = await fetch(
          `${base}/payment_events?select=*&order=created_at.desc&limit=${limit}`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'write-payment-event': {
        const { booking_id, event_type, amount, error_message } = payload;
        if (!booking_id || !event_type) return json({ error: 'Missing fields' }, 400);
        const res = await fetch(`${base}/payment_events`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            booking_id,
            event_type,
            amount: amount ?? null,
            error_message: error_message ?? null,
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Admin manual booking insert (returns the inserted row) ----------
      case 'insert-booking': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        const res = await fetch(`${base}/bookings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      // ---- Paid bookings (tax/revenue summary) -----------------------------
      case 'paid-bookings': {
        const res = await fetch(
          `${base}/bookings?job_status=eq.PAID&select=paid_at,invoice_amount,tax_amount&order=paid_at.desc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      // ---- Business Hub notes (admin-only) ---------------------------------
      case 'list-notes': {
        const { categoryId } = payload;
        if (!categoryId) return json({ error: 'Missing categoryId' }, 400);
        const res = await fetch(
          `${base}/hub_notes?category_id=eq.${encodeURIComponent(categoryId)}&order=created_at.asc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'add-note': {
        const { id, categoryId, content } = payload;
        if (!id || !categoryId) return json({ error: 'Missing fields' }, 400);
        const res = await fetch(`${base}/hub_notes`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ id, category_id: categoryId, content: content ?? '' }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'update-note': {
        const { id, content } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/hub_notes?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ content: content ?? '' }) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'delete-note': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/hub_notes?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'clear-notes': {
        const res = await fetch(
          `${base}/hub_notes?id=neq.placeholder`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: err.message ?? 'Unknown error' }, 500);
  }
}
