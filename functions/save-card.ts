// Cloudflare Pages Function — runs server-side
// POST /save-card  { token, bookingId, name, email }
// → Creates Stripe Customer + PaymentMethod, saves pm_xxx to Supabase

interface Env {
  STRIPE_SECRET_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string; // service role key — NOT anon key
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { token, bookingId, name, email } = await request.json() as any;

    if (!token || !bookingId) {
      return new Response(JSON.stringify({ error: 'Missing token or bookingId' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 1. Create Stripe Customer
    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        'metadata[booking_id]': bookingId,
      }).toString(),
    });
    const customer = await customerRes.json() as any;
    if (customer.error) throw new Error(customer.error.message);

    // 2. Attach token → PaymentMethod on that customer
    const pmRes = await fetch(`https://api.stripe.com/v1/customers/${customer.id}/sources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ source: token }).toString(),
    });
    const source = await pmRes.json() as any;
    if (source.error) throw new Error(source.error.message);

    const last4 = source.last4 ?? '****';
    const customerId = customer.id;

    // 3. Save to Supabase against the booking
    const sbRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          stripe_customer_id: customerId,
          stripe_last4: last4,
        }),
      }
    );

    if (!sbRes.ok) {
      const err = await sbRes.text();
      console.warn('Supabase patch failed:', err);
      // Non-fatal — card is saved in Stripe, just not linked in DB yet
    }

    return new Response(JSON.stringify({ customerId, last4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err: any) {
    console.error('save-card error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// Handle preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
