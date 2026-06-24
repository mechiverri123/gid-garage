// Cloudflare Pages Function — runs server-side
// POST /charge-card  { customerId, amountCents, description, bookingId }
// → Charges the Stripe customer's saved card, updates Supabase

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Only the authenticated admin can charge cards. Access injects this header
  // on every request that passes through the Access application.
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const { customerId, amountCents, subtotal, description, bookingId } = await request.json();
    console.log('admin-charge received:', { bookingId, amountCents, subtotal });

    if (!customerId || !amountCents || !bookingId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (amountCents < 50) {
      return new Response(JSON.stringify({ error: 'Amount must be at least $0.50' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
    const stripeKey = env.STRIPE_SECRET_KEY;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    // Check if already paid
    const checkRes = await fetch(`${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}&select=job_status,stripe_transaction_id`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const rows = await checkRes.json();
    if (rows?.[0]?.job_status === 'PAID') {
      return new Response(JSON.stringify({
        error: 'already_paid',
        chargeId: rows[0].stripe_transaction_id,
        message: 'This booking has already been paid.',
      }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Idempotency key — same booking + amount can never double charge
    const idempotencyKey = `${bookingId}-${amountCents}`; // stable — prevents double-charging

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

    // Update Supabase
    await fetch(`${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        stripe_transaction_id: charge.id,
        invoice_amount: subtotal != null ? subtotal : amountCents / 100,
        // Computed independently from subtotal — NOT derived from amountCents,
        // since amountCents may only be a remaining balance after a prior
        // partial payment, not the full charge.
        tax_amount: subtotal != null ? Math.round(subtotal * 0.09386 * 100) / 100 : 0,
        paid_at: new Date().toISOString(),
        job_status: 'PAID',
        status: 'completed',
      }),
    });

    return new Response(JSON.stringify({
      chargeId: charge.id,
      amount: amountCents / 100,
      last4: charge.payment_method_details?.card?.last4 ?? '****',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    console.error('charge-card error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Charge failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
