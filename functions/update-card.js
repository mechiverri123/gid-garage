// Cloudflare Pages Function — runs server-side
// POST /update-card  { token, customerId }
// → Attaches new card source to existing Stripe Customer, sets as default
// → Returns { last4, sourceId } — client then patches Supabase stripe_last4

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { token, customerId } = await request.json();

    if (!token || !customerId) {
      return new Response(JSON.stringify({ error: 'Missing token or customerId' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 1. Attach new card source to existing customer
    const sourceRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}/sources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ source: token }).toString(),
    });
    const source = await sourceRes.json();
    if (source.error) throw new Error(source.error.message);

    const last4 = source.last4 ?? '????';

    // 2. Set new card as the default source on the customer
    const defaultRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ default_source: source.id }).toString(),
    });
    const defaultData = await defaultRes.json();
    if (defaultData.error) {
      // Non-fatal — card is attached, just not set as default
      console.warn('Failed to set default source:', defaultData.error.message);
    }

    // 3. Patch stripe_last4 on all this customer's bookings using the SERVICE key
    //    (the public anon key can no longer UPDATE the bookings table).
    const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && serviceKey) {
      try {
        await fetch(
          `${supabaseUrl}/rest/v1/bookings?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ stripe_last4: last4 }),
          }
        );
      } catch (e) {
        console.warn('Failed to patch stripe_last4 in Supabase:', e.message);
      }
    }

    return new Response(JSON.stringify({ last4, sourceId: source.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    console.error('update-card error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Unknown error' }), {
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
