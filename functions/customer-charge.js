// Cloudflare Pages Function — PUBLIC, no Cloudflare Access required
// POST /customer-charge  { customerId, amountCents, subtotal, description, bookingId }
// → Charges the Stripe customer's saved card and finalizes the booking —
//   DB write, payment event (for the admin notification poll), and receipt
//   email — all in this one call.
//
// Why this exists separately from admin-charge.js: that endpoint requires a
// Cloudflare Access JWT, which only your own logged-in browser ever has. A
// customer clicking "Pay Now" from their email has no Access session, so the
// admin-charge.js call (and any follow-up adminPost() calls) would 401 before
// ever reaching Stripe. This mirrors the same Stripe logic but is reachable
// by customers, and does the entire DB write here instead of depending on
// further Access-gated calls afterward.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { customerId, amountCents, subtotal, taxAmount, description, bookingId } = payload;
  if (!customerId || !amountCents || !bookingId) {
    return json({ error: 'Missing required fields' }, 400);
  }
  if (amountCents < 50) {
    return json({ error: 'Amount must be at least $0.50' }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const stripeKey = env.STRIPE_SECRET_KEY;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const brevoKey = env.BREVO_API_KEY;
  if (!supabaseUrl || !stripeKey || !supabaseKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  async function brevoSend(emailPayload) {
    if (!brevoKey) { console.warn('BREVO_API_KEY not set'); return; }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (!r.ok) console.error('Brevo send failed:', r.status, await r.text());
  }

  try {
    // Pull current state — needed to detect prior partial payments and to
    // build the receipt email.
    const checkRes = await fetch(
      `${base}/bookings?id=eq.${encodeURIComponent(bookingId)}&select=job_status,stripe_transaction_id,amount_paid,payments,fname,lname,email,vehicle,service`,
      { headers }
    );
    if (!checkRes.ok) return json({ error: await checkRes.text() }, 502);
    const rows = await checkRes.json();
    const existing = rows?.[0];
    if (!existing) return json({ error: 'Booking not found' }, 404);

    if (existing.job_status === 'PAID') {
      return json({
        error: 'already_paid',
        chargeId: existing.stripe_transaction_id,
        amount: subtotal,
        message: 'This booking has already been paid.',
      }, 409);
    }

    const amountPaidSoFar = Number(existing.amount_paid) || 0;
    const existingPayments = existing.payments
      ? (typeof existing.payments === 'string' ? JSON.parse(existing.payments) : existing.payments)
      : [];

    // Idempotency key — same booking + amount can never double charge
    const idempotencyKey = `${bookingId}-${amountCents}`;

    const chargeRes = await fetch('https://api.stripe.com/v1/charges', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: new URLSearchParams({
        amount: String(amountCents),
        currency: 'usd',
        customer: customerId,
        description: description ?? `GID Garage — ${bookingId}`,
      }).toString(),
    });
    const charge = await chargeRes.json();
    if (charge.error) throw new Error(charge.error.message);

    const chargedAmount = amountCents / 100;
    // Prefer the tax amount the client actually computed (which correctly
    // excludes tax-exempt line items, e.g. the Mobile Service Fee) over a flat
    // rate on the whole subtotal — that flat-rate fallback is what caused the
    // invoice to show one total ("Total Due") while the Pay button asked for
    // a different, higher one. Only fall back to the flat rate if the client
    // didn't send a tax figure at all.
    const finalTaxAmount = taxAmount != null
      ? Math.round(Number(taxAmount) * 100) / 100
      : (subtotal != null ? Math.round(Number(subtotal) * 0.09386 * 100) / 100 : 0);
    const newAmountPaid = Math.round((amountPaidSoFar + chargedAmount) * 100) / 100;

    // If there was a prior partial payment, log this charge as its own entry
    // so revenue-by-month tracking (which sums individual payment dates) sees
    // it, instead of just collapsing into a single opaque total.
    const updatedPayments = amountPaidSoFar > 0
      ? [...existingPayments, {
          id: Math.random().toString(36).slice(2),
          amount: chargedAmount,
          method: 'Card (Self-Pay)',
          note: 'Remaining balance',
          at: new Date().toISOString(),
          stripeId: charge.id,
        }]
      : existingPayments;

    const paidAt = new Date().toISOString();
    await fetch(`${base}/bookings?id=eq.${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        stripe_transaction_id: charge.id,
        invoice_amount: subtotal != null ? Number(subtotal) : chargedAmount,
        tax_amount: finalTaxAmount,
        amount_paid: newAmountPaid,
        payments: JSON.stringify(updatedPayments),
        paid_at: paidAt,
        job_status: 'PAID',
        status: 'completed',
      }),
    });

    // Payment event — feeds the existing admin notification poll
    try {
      await fetch(`${base}/payment_events`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ booking_id: bookingId, event_type: 'paid', amount: chargedAmount, error_message: null }),
      });
    } catch (e) { console.error('Payment event write failed:', e.message); }

    // Receipt email
    try {
      const customerName = `${existing.fname || ''} ${existing.lname || ''}`.trim();
      await brevoSend({
        sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
        to: [{ email: existing.email, name: customerName }],
        subject: `Payment Received — ${existing.vehicle || 'Your Vehicle'} — GID Garage`,
        htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px;">✅ Payment Received</h2><p style="color:#9ca3af;margin:0 0 16px;">Hi ${existing.fname || ''}, thanks — we've received your payment of $${newAmountPaid.toFixed(2)} for ${existing.vehicle || 'your vehicle'}.</p><p style="color:#4b5563;font-size:11px;margin-top:24px;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div>`,
      });
    } catch (e) { console.error('Receipt email failed:', e.message); }

    return json({
      chargeId: charge.id,
      amount: chargedAmount,
      amountPaid: newAmountPaid,
      payments: updatedPayments,
      last4: charge.payment_method_details?.card?.last4 ?? '****',
    });

  } catch (err) {
    console.error('customer-charge error:', err);
    // Best-effort decline event so it surfaces in the admin notification poll
    try {
      await fetch(`${base}/payment_events`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ booking_id: bookingId, event_type: 'declined', amount: amountCents / 100, error_message: err.message ?? 'Charge failed' }),
      });
    } catch { /* non-critical */ }
    return json({ error: err.message ?? 'Charge failed' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { ...corsHeaders(), 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
}
