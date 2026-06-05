// Cloudflare Pages Function — runs server-side
// POST /charge-card  { customerId, amountCents, description, bookingId }
// → Charges the Stripe customer's saved card, updates Supabase with transaction ID

interface Env {
  STRIPE_SECRET_KEY: string;
  SUPABASE_URL: string;
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { customerId, amountCents, description, bookingId } = await request.json() as any;

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

    // Idempotency key = bookingId + amount — same combo can never produce two charges
    const idempotencyKey = `${bookingId}-${amountCents}`;

    // Check if already paid in Supabase before even hitting Stripe
    const checkRes = await fetch(`${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=job_status,stripe_transaction_id`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    const rows = await checkRes.json() as any[];
    if (rows?.[0]?.job_status === 'PAID') {
      return new Response(JSON.stringify({
        error: 'already_paid',
        chargeId: rows[0].stripe_transaction_id,
        message: 'This booking has already been paid.',
      }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Charge the customer's saved card
    const chargeRes = await fetch('https://api.stripe.com/v1/charges', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey, // Stripe deduplicates on this — same key = same charge returned, no duplicate
      },
      body: new URLSearchParams({
        amount: String(amountCents),
        currency: 'usd',
        customer: customerId,
        description: description ?? `GID Garage — ${bookingId}`,
      }).toString(),
    });

    const charge = await chargeRes.json() as any;
    if (charge.error) throw new Error(charge.error.message);

    // Update Supabase — mark paid, save transaction ID
    await fetch(`${env.SUPABASE_URL ?? env.VITE_SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        stripe_transaction_id: charge.id,
        invoice_amount: amountCents / 100,
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

  } catch (err: any) {
    console.error('charge-card error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Charge failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
