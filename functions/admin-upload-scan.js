/**
 * admin-upload-scan — Cloudflare Pages Function
 * Receives multipart/form-data with a file + bookingId + stage ('pre' | 'post'),
 * stores it in R2 under scans/{bookingId}/{stage}-{timestamp}-{filename}, and
 * returns { key, url }.
 *
 * Upload itself should be gated behind the same Cloudflare Access policy that
 * protects /admin (this is an admin-only action). The resulting file is served
 * by customer-photo-serve.js WITHOUT requiring Access, since pre/post health
 * scan links are meant to show up on the public customer invoice page.
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings (same bucket as photos)
 */

const MAX_BYTES = 20 * 1024 * 1024; // 20MB — scan reports/PDFs can run larger than photos

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
  const stageRaw = String(formData.get('stage') || 'pre');
  const stage = stageRaw === 'post' ? 'post' : 'pre';

  if (!file || typeof file === 'string') {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'File too large (20MB max)' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  const safeBookingId = String(bookingId).replace(/[^a-zA-Z0-9-]/g, '_');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `scans/${safeBookingId}/${stage}-${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  await bucket.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { bookingId: safeBookingId, stage, originalName: file.name },
  });

  const url = `/customer-photo-serve?key=${encodeURIComponent(key)}`;

  return new Response(JSON.stringify({ key, url, name: file.name }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
