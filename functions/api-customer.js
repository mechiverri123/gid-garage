// fixed
// Cloudflare Pages Function — POST /api/customer
// PUBLIC customer operations that legitimately need DB access, now that the
// anon key can no longer read the bookings table. Each action validates itself
// server-side; the Supabase SERVICE key never leaves the worker.
//
// Body: { action: string, ...args }
//   booked-slots        { date }                 -> string[]  (times only, no PII)
//   blackout-dates      {}                       -> string[]  (dates the shop is fully closed)
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
  const brevoKey = env.BREVO_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  async function brevoSend(payload) {
    if (!brevoKey) { console.warn('BREVO_API_KEY not set'); return; }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error('Brevo send failed:', r.status, await r.text());
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

      // ---- Blackout dates (read-only here — admin manages them) -----------
      case 'blackout-dates': {
        // Phoenix is UTC-7 year-round — using raw UTC here would drop "today"
        // from the list 7 hours before Phoenix midnight actually arrives.
        const phoenixToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
        const res = await fetch(
          `${base}/blackout_dates?select=date&date=gte.${phoenixToday}`,
          { headers }
        );
        if (!res.ok) return json([]); // fail open — never block booking entirely over this
        const rows = await res.json();
        return json(rows.map((r) => r.date));
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
            headers: { ...headers, Prefer: 'return=representation' },
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
        const rows = await res.json().catch(() => []);
        const booking = rows[0];

        // Notify the shop owner — email always fires; the event row feeds the
        // same local-notification system already used for payment alerts (shows
        // up as a push-style notification whenever the admin panel/PWA is open).
        if (booking) {
          const customerName = `${booking.fname} ${booking.lname}`;
          const total = (Number(booking.estimate_amount) || 0) + (Number(booking.tax_amount) || 0);
          try {
            await brevoSend({
              sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
              to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
              subject: `✅ Estimate Signed — ${customerName} — $${total.toFixed(2)}`,
              htmlContent: `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;"><h2 style="color:#22c55e;">Estimate Signed</h2><p><strong>${customerName}</strong><br>${booking.phone || ''}<br>${booking.email || ''}</p><p><strong>${booking.vehicle || ''}</strong><br>${booking.service || ''}</p><p style="font-size:20px;font-weight:bold;color:#22c55e;">$${total.toFixed(2)}</p>${damage ? `<p>Pre-existing damage noted: ${String(damage).slice(0, 300)}</p>` : ''}</div>`,
            });
          } catch (e) { console.error('Signed-estimate owner email failed:', e.message); }

          try {
            await fetch(`${base}/payment_events`, {
              method: 'POST',
              headers: { ...headers, Prefer: 'return=minimal' },
              body: JSON.stringify({ booking_id: id, event_type: 'signed', amount: total, error_message: null }),
            });
          } catch (e) { console.error('Signed-estimate event write failed:', e.message); }
        }

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

      // ---- Booking confirmation email (customer + owner) ----------------
      case 'send-confirmation': {
        const { booking, cancelUrl, serviceName, dateStr } = payload;
        if (!booking) return json({ error: 'Missing booking' }, 400);
        const customerName = `${booking.fname} ${booking.lname}`;
        // Customer via Brevo template
        try {
          await brevoSend({
            sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
            to: [{ email: booking.email, name: customerName }],
            templateId: 1,
            params: {
              to_name: booking.fname,
              service_name: serviceName,
              appointment_date: dateStr,
              appointment_time: booking.time,
              vehicle: booking.vehicle,
              notes: booking.notes || 'None',
              booking_id: booking.id,
              cancel_url: cancelUrl || '',
            },
          });
        } catch (e) { console.error('Customer confirmation email failed:', e.message); }
        // Owner notification
        try {
          await brevoSend({
            sender: { name: 'GID Garage Bookings', email: 'bookings@gidgarage.com' },
            to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
            subject: `New Booking: ${customerName} — ${serviceName} on ${dateStr}`,
            htmlContent: `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;"><h2 style="color:#ef4444;">New Booking</h2><p><strong>${customerName}</strong><br>${booking.phone}<br>${booking.email}</p><p><strong>${serviceName}</strong><br>${dateStr} at ${booking.time}<br>${booking.vehicle}</p>${booking.notes ? `<p>Notes: ${booking.notes}</p>` : ''}</div>`,
          });
        } catch (e) { console.error('Owner notification email failed:', e.message); }
        return json({ ok: true });
      }

      // ---- Cancellation notification (customer + owner) ------------------
      case 'send-cancellation': {
        const { booking } = payload;
        if (!booking) return json({ error: 'Missing booking' }, 400);
        const customerName = `${booking.fname} ${booking.lname}`;

        // Pretty service name map — mirrors SERVICES in BookingWidget.tsx
        const SERVICE_NAMES = {
          oil: 'Oil Change',
          brakes: 'Brake Service',
          diag: 'Diagnostics',
          suspension: 'Suspension Service',
          audio: 'Car Audio Install',
          full: 'Full Service Inspection',
          other: 'Custom Service',
        };
        const svcName = SERVICE_NAMES[booking.service] || booking.service || 'Appointment';

        // Format date in Flagstaff local time (America/Phoenix — no DST)
        const dateStr = booking.date
          ? new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              timeZone: 'America/Phoenix',
            })
          : booking.date || '';

        const timeStr = booking.time || '';
        const apptLine = timeStr ? `${dateStr} at ${timeStr} (MST)` : dateStr;

        // Owner
        try {
          await brevoSend({
            sender: { name: 'GID Garage Bookings', email: 'bookings@gidgarage.com' },
            to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
            subject: `❌ Cancellation: ${customerName} — ${svcName} on ${dateStr}`,
            htmlContent: `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;"><h2 style="color:#ef4444;">❌ Booking Cancelled</h2><p><strong>${customerName}</strong><br>${booking.phone}<br>${booking.email}</p><p>${svcName}<br>${apptLine}<br>${booking.vehicle}</p></div>`,
          });
        } catch (e) { console.error('Owner cancellation email failed:', e.message); }

        // Customer
        try {
          await brevoSend({
            sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
            to: [{ email: booking.email, name: customerName }],
            subject: `Your ${svcName} appointment has been cancelled — GID Garage`,
            htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;">
  <img src="https://gidgarage.com/website_logo.png" alt="GID Garage" style="height:48px;margin-bottom:28px;"/>
  <h2 style="color:#ef4444;font-size:22px;font-weight:900;margin:0 0 8px;">Appointment Cancelled</h2>
  <p style="color:#6b7280;font-size:13px;margin:0 0 28px;">We've received your cancellation request.</p>
  <table style="width:100%;border-collapse:collapse;background:#111827;border:1px solid #1f2937;margin-bottom:24px;">
    <tr><td style="padding:14px 16px;border-bottom:1px solid #1f2937;">
      <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 3px;">Service</p>
      <p style="color:#fff;font-size:15px;font-weight:700;margin:0;">${svcName}</p>
    </td></tr>
    <tr><td style="padding:14px 16px;border-bottom:1px solid #1f2937;">
      <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 3px;">Scheduled For</p>
      <p style="color:#fff;font-size:15px;font-weight:700;margin:0;">${apptLine}</p>
    </td></tr>
    <tr><td style="padding:14px 16px;">
      <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 3px;">Vehicle</p>
      <p style="color:#fff;font-size:15px;font-weight:700;margin:0;">${booking.vehicle || '—'}</p>
    </td></tr>
  </table>
  <div style="background:#1c1917;border-left:3px solid #f59e0b;padding:14px 16px;margin-bottom:28px;">
    <p style="color:#fcd34d;font-size:13px;font-weight:700;margin:0 0 4px;">Was this a mistake?</p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">No worries — rebooking takes less than a minute. Just pick a new time and we'll get you back on the schedule.</p>
  </div>
  <a href="https://gidgarage.com/bookings" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:900;font-size:13px;padding:14px 32px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:28px;">BOOK A NEW APPOINTMENT →</a>
  <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p>
</div>`,
          });
        } catch (e) { console.error('Customer cancellation email failed:', e.message); }
        return json({ ok: true });
      }

      // ---- Confirm booking for returning customers (bypass save-card) ----
      case 'confirm-booking': {
        const { id, stripeCustomerId, stripeLast4 } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'confirmed',
              ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
              ...(stripeLast4 ? { stripe_last4: stripeLast4 } : {}),
            }),
          }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Inquiry / quote-request notification (owner only) -----------
      case 'send-inquiry': {
        const { fname, lname, phone, email, vehicle, notes, bookingId } = payload;
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        try {
          await brevoSend({
            sender: { name: 'GID Garage Bookings', email: 'bookings@gidgarage.com' },
            to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
            subject: `💬 New Inquiry: ${esc(fname)} ${esc(lname)}`,
            htmlContent: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;border-top:4px solid #dc2626;"><h2 style="margin:0 0 20px;font-size:22px;font-weight:900;">New Customer Inquiry</h2><table style="width:100%;border-collapse:collapse;font-size:13px;"><tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;width:35%;">Name</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;font-weight:600;">${esc(fname)} ${esc(lname)}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;">Phone</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;">${esc(phone)}</td></tr>${email ? `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;">Email</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;">${esc(email)}</td></tr>` : ''}${vehicle ? `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;">Vehicle</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;">${esc(vehicle)}</td></tr>` : ''}</table><div style="margin-top:20px;background:#1a1a1a;border-left:3px solid #dc2626;padding:14px 16px;"><p style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Problem Description</p><p style="margin:0;font-size:14px;line-height:1.6;color:#e5e7eb;">${esc(notes)}</p></div><p style="margin-top:20px;font-size:12px;color:#6b7280;">Job ID: ${esc(bookingId)} · Submitted ${new Date().toLocaleString()}</p></div>`,
          });
        } catch (e) { console.error('Inquiry email failed:', e.message); }
        return json({ ok: true });
      }

      // ---- Insert a new booking (customer booking + inquiry forms) --------
      case 'insert-booking': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        // Authoritative server-side check — the calendar UI already hides
        // blacked-out dates, but a stale page or a direct API call shouldn't
        // be able to slip a booking onto a day the shop marked closed.
        if (row.date) {
          const blackoutRes = await fetch(
            `${base}/blackout_dates?select=date&date=eq.${encodeURIComponent(row.date)}`,
            { headers }
          );
          if (blackoutRes.ok) {
            const hits = await blackoutRes.json();
            if (hits.length) return json({ error: 'That date is unavailable. Please pick another date.' }, 409);
          }
        }
        const res = await fetch(`${base}/bookings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify(row),
        });
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
