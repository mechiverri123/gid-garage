// fixed
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
  const brevoKey = env.BREVO_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  // Shared Brevo sender helper
  async function brevoSend(payload) {
    if (!brevoKey) { console.warn('BREVO_API_KEY not set — skipping email'); return; }
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
      case 'list-bookings': {
        const limit = Number(payload.limit) || 200;
        // Exclude heavy columns (base64 photos, signature, inspection data) from the
        // list view — they're only needed once a specific job is opened via get-booking.
        // has_photos/has_signature/has_inspection are generated columns (see migration)
        // that let the client skip the get-booking round trip when there's nothing to fetch.
        const LIST_COLUMNS = [
          'id', 'service', 'service_icon', 'date', 'time', 'fname', 'lname', 'phone', 'email',
          'vehicle', 'notes', 'garage_notes', 'status', 'job_status', 'created_at',
          'estimate_amount', 'estimate_notes', 'line_items', 'tax_amount',
          'pre_existing_damage', 'customer_agreed', 'signed_at',
          'invoice_amount', 'stripe_transaction_id', 'stripe_customer_id', 'stripe_last4', 'paid_at',
          'adjustment_reason', 'adjustment_amount', 'admin_photos',
          'has_photos', 'has_signature', 'has_inspection',
        ].join(',');
        const res = await fetch(
          `${base}/bookings?select=${LIST_COLUMNS}&order=date.desc,time.desc&limit=${limit}`,
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

      // ---- Send estimate email (admin-triggered) -------------------------
      case 'send-estimate': {
        const { job, shopAvg } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const savings = shopAvg > 0 ? shopAvg - (job.estimateAmount || 0) : 0;
        // Shop comparison block — moved to bottom, shows "They'd charge ~$X / You save $Y"
        const savingsHtml = savings > 10 ? `
          <table style="width:100%;background:#052e16;border:1px solid #166534;border-collapse:collapse;margin-bottom:0;"><tr><td style="padding:16px 20px;">
            <p style="color:#86efac;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">vs. Flagstaff Shops</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="color:#6b7280;font-size:12px;padding:3px 0;">They'd charge ~</td>
                <td style="color:#9ca3af;font-size:13px;font-weight:700;text-align:right;padding:3px 0;">$${Number(shopAvg).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;font-size:12px;padding:3px 0;">GID Garage</td>
                <td style="color:#fff;font-size:13px;font-weight:700;text-align:right;padding:3px 0;">$${(Number(job.estimateAmount||0)+Number(job.taxAmount||0)).toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="2" style="color:#86efac;font-size:11px;font-weight:700;padding:6px 0 2px;">and we come to you!</td>
              </tr>
              <tr style="border-top:1px solid #166534;">
                <td style="color:#4ade80;font-size:13px;font-weight:900;padding-top:8px;">You Save!</td>
                <td style="color:#4ade80;font-size:22px;font-weight:900;text-align:right;padding-top:8px;">$${savings.toFixed(2)}</td>
              </tr>
            </table>
          </td></tr></table>` : '';
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${job.service}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">$${Number(job.estimateAmount || 0).toFixed(2)}</td></tr>`;
        const estimateUrl = `https://gidgarage.com/estimate?id=${job.id}`;
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Your GID Garage Estimate — ${job.vehicle}`,
          htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:0;overflow:hidden;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/><div style="padding:28px 32px 32px;"><h2 style="color:#fff;font-size:22px;margin:0 0 8px;">Your Estimate is Ready</h2><p style="color:#9ca3af;margin:0 0 20px;">Hi ${job.fname}, here's your quote for the upcoming appointment.</p><table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${lineItemsHtml}</table><table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="border-top:2px solid #374151;"><td style="padding:12px 0 4px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:12px 0 4px;color:#fff;font-size:13px;text-align:right;">$${Number(job.estimateAmount||0).toFixed(2)}</td></tr>
              <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (9.386%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;">$${Number(job.taxAmount||0).toFixed(2)}</td></tr>
              <tr style="background:#111827;"><td style="padding:10px 0 10px 0;color:#fff;font-size:14px;font-weight:700;border-top:1px solid #374151;">Total</td><td style="padding:10px 0;color:#fff;font-size:15px;font-weight:900;text-align:right;border-top:1px solid #374151;">$${(Number(job.estimateAmount||0)+Number(job.taxAmount||0)).toFixed(2)}</td></tr>
            </table><p style="margin:20px 0;"><a href="${estimateUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;">REVIEW &amp; APPROVE ESTIMATE →</a></p>${savingsHtml}<p style="color:#4b5563;font-size:11px;margin-top:24px;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div></div>`,
        });
        return json({ ok: true });
      }

      // ---- Send invoice email (admin-triggered) ---------------------------
      case 'send-invoice': {
        const { job } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const invoiceUrl = `https://gidgarage.com/invoice?id=${job.id}`;
        const subtotalInv = job.lineItems?.reduce((s, i) => s + Number(i.amount || 0), 0) || Number(job.estimateAmount || 0);
        const taxInv = job.taxAmount ? Number(job.taxAmount) : Math.round(subtotalInv * 0.09386 * 100) / 100;
        const totalInv = subtotalInv + taxInv;
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;font-family:monospace;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : '';
        const serviceDateInv = job.date ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Invoice — ${job.vehicle || 'Your Vehicle'} — GID Garage`,
          htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0f0f0f;color:#fff;">
            <div style="background:#111827;border-bottom:3px solid #dc2626;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Invoice Ready for Review</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">Hi ${job.fname} — your service has been completed. Please review and pay your invoice below.</p>

              <div style="background:#1f2937;border:1px solid #374151;border-left:4px solid #dc2626;padding:16px 20px;margin-bottom:28px;">
                <table style="width:100%;border-collapse:collapse;">
                  ${job.vehicle ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Vehicle</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.vehicle}</td></tr>` : ''}
                  ${serviceDateInv ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service Date</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${serviceDateInv}</td></tr>` : ''}
                  ${job.service ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceIcon || ''} ${job.service.charAt(0).toUpperCase() + job.service.slice(1)}</td></tr>` : ''}
                  ${job.serviceAddress ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Location</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceAddress}</td></tr>` : ''}
                </table>
              </div>

              <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                <tr><td colspan="2" style="padding:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #374151;">Services &amp; Parts</td></tr>
                ${lineItemsHtml}
                <tr><td style="padding:10px 0 6px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:10px 0 6px;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${subtotalInv.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (9.386%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${taxInv.toFixed(2)}</td></tr>
                <tr style="border-top:2px solid #374151;"><td style="padding:14px 0 0;color:#fff;font-size:16px;font-weight:900;">Total Due</td><td style="padding:14px 0 0;color:#dc2626;font-size:22px;font-weight:900;text-align:right;font-family:monospace;">$${totalInv.toFixed(2)}</td></tr>
              </table>

              <p style="margin:28px 0 8px;text-align:center;">
                <a href="${invoiceUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:16px 36px;letter-spacing:0.08em;text-transform:uppercase;">PAY INVOICE →</a>
              </p>
              <p style="color:#4b5563;font-size:11px;text-align:center;margin:12px 0 0;">Secure payment powered by Stripe</p>
            </div>
            <div style="background:#111827;padding:20px 32px;border-top:1px solid #1f2937;">
              <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> or reply to this email.</p>
              <p style="color:#374151;font-size:11px;margin:4px 0 0;">GID Garage · Mobile Auto Repair &amp; Car Audio · Flagstaff, AZ</p>
            </div>
          </div>`,
        });
        return json({ ok: true });
      }

      // ---- Send receipt email (after payment) -----------------------------
      case 'send-receipt': {
        const { job, adjustmentReason, adjustmentAmount } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const invoiceUrl = `https://gidgarage.com/invoice?id=${job.id}`;
        const subtotal = Number(job.invoiceAmount || 0);
        const tax = Number(job.taxAmount || 0);
        const total = subtotal + tax;
        const hasAdjustment = adjustmentReason && adjustmentAmount !== undefined && Math.abs(adjustmentAmount) > 0.001;
        const adjustmentHtml = hasAdjustment
          ? `<tr style="background:#1a1a2e;"><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#818cf8;font-size:13px;font-style:italic;">Price Adjustment — ${adjustmentReason}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#818cf8;font-size:13px;text-align:right;font-weight:700;font-family:monospace;">${Number(adjustmentAmount) < 0 ? '-' : '+'}$${Math.abs(Number(adjustmentAmount)).toFixed(2)}</td></tr>`
          : '';
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;font-family:monospace;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : '';
        const serviceDateRcpt = job.date ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Payment Receipt — ${job.vehicle || 'GID Garage'}`,
          htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0f0f0f;color:#fff;">
            <div style="background:#111827;border-bottom:3px solid #16a34a;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#4ade80;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">✅ Payment Confirmed</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">Hi ${job.fname} — thanks for your business. Here's your receipt.</p>

              <div style="background:#1f2937;border:1px solid #374151;border-left:4px solid #16a34a;padding:16px 20px;margin-bottom:28px;">
                <table style="width:100%;border-collapse:collapse;">
                  ${job.vehicle ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Vehicle</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.vehicle}</td></tr>` : ''}
                  ${serviceDateRcpt ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service Date</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${serviceDateRcpt}</td></tr>` : ''}
                  ${job.service ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceIcon || ''} ${job.service.charAt(0).toUpperCase() + job.service.slice(1)}</td></tr>` : ''}
                  ${job.serviceAddress ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Location</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceAddress}</td></tr>` : ''}
                </table>
              </div>

              <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                <tr><td colspan="2" style="padding:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #374151;">Services &amp; Parts</td></tr>
                ${lineItemsHtml}${adjustmentHtml}
                <tr><td style="padding:10px 0 6px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:10px 0 6px;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${subtotal.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (9.386%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${tax.toFixed(2)}</td></tr>
                <tr style="border-top:2px solid #374151;"><td style="padding:14px 0 0;color:#fff;font-size:16px;font-weight:900;">Total Paid</td><td style="padding:14px 0 0;color:#4ade80;font-size:22px;font-weight:900;text-align:right;font-family:monospace;">$${total.toFixed(2)}</td></tr>
              </table>

              <p style="margin:28px 0 8px;text-align:center;">
                <a href="${invoiceUrl}" style="display:inline-block;background:#1f2937;color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:14px 32px;letter-spacing:0.08em;text-transform:uppercase;border:1px solid #374151;">🧾 VIEW / SAVE RECEIPT →</a>
              </p>
              ${job.stripeTransactionId ? `<p style="color:#4b5563;font-size:11px;text-align:center;margin:8px 0 0;">Transaction ID: ${job.stripeTransactionId}</p>` : ''}
            </div>
            <div style="background:#111827;padding:20px 32px;border-top:1px solid #1f2937;">
              <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> or reply to this email.</p>
              <p style="color:#374151;font-size:11px;margin:4px 0 0;">GID Garage · Mobile Auto Repair &amp; Car Audio · Flagstaff, AZ</p>
            </div>
          </div>`,
        });
        return json({ ok: true });
      }

      // ---- Send payment-declined email ------------------------------------
      case 'send-decline': {
        const { job, reason } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: 'Payment Declined — GID Garage',
          htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/><h2 style="color:#ef4444;font-size:22px;margin:0 0 8px;">⚠️ Payment Declined</h2><p style="color:#9ca3af;margin:0 0 16px;">Hi ${job.fname}, your payment for ${job.vehicle} was declined${reason ? ': ' + reason : '.'}. Please contact us to update your payment method.</p><p style="color:#4b5563;font-size:11px;margin-top:24px;">Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div>`,
        });
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: err.message ?? 'Unknown error' }, 500);
  }
}
