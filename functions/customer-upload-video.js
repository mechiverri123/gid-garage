/**
 * customer-upload-video — Cloudflare Pages Function
 * PUBLIC endpoint (no Cloudflare Access JWT) — receives multipart/form-data
 * with a file + bookingId, stores it in R2 under customer/{bookingId}/{timestamp}-{filename},
 * and returns { key, url }.
 *
 * Deliberately reuses the same R2 key prefix ("customer/") and bucket as
 * customer-upload-photo.js, so the existing customer-photo-serve.js endpoint
 * (already content-type agnostic) serves these videos with no changes needed.
 * Kept as a separate upload endpoint only so video gets its own (larger) size
 * cap and mime-type check without loosening the photo upload path.
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings (same bucket as photos)
 */

const MAX_BYTES = 80 * 1024 * 1024; // 80MB cap — short clips only, keep R2/egress costs sane

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

  if (file.type && !file.type.startsWith('video/')) {
    return new Response(JSON.stringify({ error: 'Only video files are allowed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Video too large — 80MB max' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  // Sanitize bookingId and filename — these end up in the R2 key.
  const safeBookingId = String(bookingId).replace(/[^a-zA-Z0-9-]/g, '_');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `customer/${safeBookingId}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  await bucket.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'video/mp4' },
    customMetadata: { bookingId: safeBookingId, originalName: file.name },
  });

  const url = `/customer-photo-serve?key=${encodeURIComponent(key)}`;

  return new Response(JSON.stringify({ key, url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
