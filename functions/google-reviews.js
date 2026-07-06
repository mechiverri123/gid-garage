/**
 * google-reviews — Cloudflare Pages Function (public, GET)
 * Serves GID Garage's live Google rating + reviews to the homepage widget.
 *
 * Caches the result in the GID_PHOTOS R2 bucket (same one backups/photos use)
 * under cache/google-reviews.json, refreshing at most once every 6 hours —
 * this keeps it fast, avoids hammering the Places API, and stays well within
 * free-tier quota even with real site traffic.
 *
 * Setup required (Cloudflare Pages → Settings → Environment variables):
 *   - GOOGLE_PLACES_API_KEY  — from Google Cloud Console: create a project,
 *     enable "Places API" (the classic one, not just "Places API (New)"),
 *     create an API key, and restrict it to the Places API for safety.
 *   - GOOGLE_PLACE_ID        — GID Garage's Place ID. Look it up for free at
 *     https://developers.google.com/maps/documentation/places/web-service/place-id
 *     (search "GID Garage" + your address, copy the Place ID it shows you).
 *
 * Google's API only ever returns up to 5 reviews (their ToS caps it, not a
 * limitation of this code), sorted by "most relevant."
 */

const CACHE_KEY = 'cache/google-reviews.json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchFromGoogle(env) {
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID;
  if (!apiKey || !placeId) return null;

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Places API status: ${data.status} ${data.error_message ?? ''}`);

  const result = data.result || {};
  return {
    fetchedAt: new Date().toISOString(),
    rating: result.rating ?? null,
    totalReviews: result.user_ratings_total ?? null,
    reviews: (result.reviews || []).slice(0, 5).map(r => ({
      author: r.author_name,
      authorPhoto: r.profile_photo_url ?? null,
      rating: r.rating,
      relativeTime: r.relative_time_description,
      text: r.text,
    })),
  };
}

export async function onRequestGet({ env }) {
  const bucket = env.GID_PHOTOS;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' };

  let cached = null;
  if (bucket) {
    try {
      const obj = await bucket.get(CACHE_KEY);
      if (obj) cached = JSON.parse(await obj.text());
    } catch { /* treat as no cache */ }
  }

  let fetchError = null;
  const isStale = !cached || (Date.now() - new Date(cached.fetchedAt).getTime() > CACHE_TTL_MS);
  if (isStale) {
    try {
      const fresh = await fetchFromGoogle(env);
      if (fresh) {
        cached = fresh;
        if (bucket) await bucket.put(CACHE_KEY, JSON.stringify(fresh), { httpMetadata: { contentType: 'application/json' } });
      } else {
        fetchError = `Missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID env var. Env keys present: ${Object.keys(env).join(', ') || '(none)'}`;
      }
    } catch (err) {
      console.error('google-reviews fetch failed:', err.message);
      fetchError = err.message;
      // Fall through and serve the stale cache (if any) rather than nothing
    }
  }

  if (!cached) {
    return new Response(JSON.stringify({ configured: false, error: fetchError }), { status: 200, headers });
  }
  return new Response(JSON.stringify({ configured: true, ...cached }), { status: 200, headers });
}
