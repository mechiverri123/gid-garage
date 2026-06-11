/**
 * admin-upload-photo — Cloudflare Pages Function
 * Receives multipart/form-data with a file + bookingId,
 * stores the file in R2 under bookings/{bookingId}/{timestamp}-{filename},
 * and returns { key, url }.
 *
 * Requires:
 *   - R2 bucket bound as GID_PHOTOS in Pages settings
 *   - (Optional) PHOTO_BASE_URL env var — public R2 custom domain
 *     e.g. https://photos.gidgarage.com
 *     If not set, returns a signed URL via R2 presigned URL isn't available
 *     in Pages Functions yet — you'll need a custom domain on the R2 bucket.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // Auth check — same Cloudflare Access JWT that protects /admin
  // (Cloudflare Access automatically validates the JWT before reaching here
  //  when the /admin-upload-photo path is protected by an Access policy)

  const bucket = env.GID_PHOTOS;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'R2 bucket GID_PHOTOS not bound. See setup instructions.' }), {
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

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `bookings/${bookingId}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  await bucket.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { bookingId: String(bookingId), originalName: file.name },
  });

  // Build URL — use PHOTO_BASE_URL if set (custom domain on bucket), otherwise
  // return the R2 public URL if public access is enabled on the bucket
  const baseUrl = env.PHOTO_BASE_URL?.replace(/\/$/, '') ?? '';
  const url = baseUrl ? `${baseUrl}/${key}` : `https://your-r2-public-domain.example.com/${key}`;

  return new Response(JSON.stringify({ key, url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
