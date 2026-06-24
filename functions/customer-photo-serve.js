/**
 * customer-photo-serve — Cloudflare Pages Function
 * PUBLIC endpoint — serves R2 files with NO Access JWT required, since these
 * need to render on the public estimate/invoice page for customers.
 *
 * Security: only ever serves keys under the "customer/" or "scans/" prefixes.
 * Admin-only photos live under "bookings/" (served by admin-photo-serve.js,
 * which DOES require an Access JWT) — this endpoint can never read those.
 *
 * GET /customer-photo-serve?key=customer/{bookingId}/{filename}
 * GET /customer-photo-serve?key=scans/{bookingId}/{pre|post}-{filename}
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings
 */

export async function onRequestGet({ request, env }) {
  const bucket = env.GID_PHOTOS;
  if (!bucket) {
    return new Response('R2 bucket not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  // Prevent path traversal and restrict to the public-safe prefixes.
  if (key.includes('..') || !(key.startsWith('customer/') || key.startsWith('scans/'))) {
    return new Response('Invalid key', { status: 400 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
