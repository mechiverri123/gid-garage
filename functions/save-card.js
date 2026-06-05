// Cloudflare Pages Function — runs server-side
// POST /save-card  { token, bookingId, name, email }
// → Creates Stripe Customer + saves to Supabase

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { token, bookingId, name, email } = await request.json();

    if (!token || !bookingId) {
      return new Response(JSON.stringify({ error: 'Missing token or bookingId' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
    const stripeKey = env.STRIPE_SECRET_KEY;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    // 1. Create Stripe Customer
    const customerParams = new URLSearchParams();
    if (name) customerParams.append('name', name);
    if (email) customerParams.append('email', email);
    customerParams.append('metadata[booking_id]', bookingId);

    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: customerParams.toString(),
    });
    const customer = await customerRes.json();
    if (customer.error) throw new Error(customer.error.message);

    // 2. Attach token to customer
    const sourceRes = await fetch(`https://api.stripe.com/v1/customers/${customer.id}/sources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ source: token }).toString(),
    });
    const source = await sourceRes.json();
    if (source.error) throw new Error(source.error.message);

    const last4 = source.last4 ?? '****';

    // 3. Save to Supabase
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/bookings?id=eq.${bookingId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        stripe_customer_id: customer.id,
        stripe_last4: last4,
      }),
    });

    if (!sbRes.ok) {
      const err = await sbRes.text();
      console.error('Supabase patch failed:', err);
    }

    return new Response(JSON.stringify({ customerId: customer.id, last4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    const detail = {
      error: err.message ?? 'Unknown error',
      supabaseUrl: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? 'MISSING',
      hasStripeKey: !!env.STRIPE_SECRET_KEY,
      hasServiceKey: !!env.SUPABASE_SERVICE_KEY,
    };
    console.error('save-card error:', detail);
    return new Response(JSON.stringify(detail), {
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
