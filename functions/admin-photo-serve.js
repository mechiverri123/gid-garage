/**
 * admin-photo-serve — Cloudflare Pages Function
 * Serves R2 photos through the Worker, requiring Cloudflare Access JWT.
 * Replaces direct public R2 URLs so the bucket can have public access disabled.
 *
 * GET /admin-photo-serve?key=bookings/{bookingId}/{filename}
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings
 *   - Route covered by Cloudflare Access (same policy as /admin)
 */

export async function onRequestGet({ request, env }) {
  // Defense-in-depth: require Access JWT
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessJwt) {
    return new Response('Unauthorized', { status: 401 });
  }

  const bucket = env.GID_PHOTOS;
  if (!bucket) {
    return new Response('R2 bucket not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  // Prevent path traversal
  if (key.includes('..') || key.startsWith('/')) {
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
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
