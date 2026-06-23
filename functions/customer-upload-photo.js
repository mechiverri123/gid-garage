/**
 * customer-upload-photo — Cloudflare Pages Function
 * PUBLIC endpoint (no Cloudflare Access JWT) — receives multipart/form-data
 * with a file + bookingId, stores it in R2 under customer/{bookingId}/{timestamp}-{filename},
 * and returns { key, url }.
 *
 * This is intentionally separate from admin-upload-photo.js / admin-photo-serve.js:
 * those are gated behind Cloudflare Access (admin-only). Customer job photos need
 * to be viewable on the public estimate/invoice page, so they're stored under a
 * distinct "customer/" key prefix and served by customer-photo-serve.js, which
 * does NOT require an Access JWT but only ever serves keys under that prefix —
 * it can never be used to read admin-only photos under "bookings/".
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings (same bucket as admin photos)
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety cap post-compression

export async function onRequestPost(context) {
  const { request, env } = context;

  const bucket = env.GID_PHOTOS;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'R2 bucket GID_PHOTOS not bound.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const file = formData.get('file');
  const bookingId = formData.get('bookingId') || 'unknown';

  if (!file || typeof file === 'string') {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'File too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  // Sanitize bookingId and filename — these end up in the R2 key.
  const safeBookingId = String(bookingId).replace(/[^a-zA-Z0-9-]/g, '_');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `customer/${safeBookingId}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  await bucket.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { bookingId: safeBookingId, originalName: file.name },
  });

  const url = `/customer-photo-serve?key=${encodeURIComponent(key)}`;

  return new Response(JSON.stringify({ key, url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
