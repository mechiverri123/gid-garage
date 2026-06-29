/**
 * gallery-list — Cloudflare Pages Function
 * Lists every object under the "frontend/" prefix in the PUBLIC site bucket
 * (the same bucket VITE_R2_PUBLIC_URL points to) so PhotoGallery can render
 * whatever's been uploaded without a code change or redeploy.
 *
 * GET /gallery-list
 *
 * Setup required (Pages > Settings > Functions > R2 bucket bindings):
 *   - Bind the PUBLIC gallery bucket as GID_SITE
 *     (this is a different bucket than GID_PHOTOS, which holds private job photos)
 *
 * Upload workflow: drop files into the bucket under a "frontend/" prefix
 * (i.e. key = frontend/yourfile.jpg) — anything else in the bucket is ignored.
 */

export async function onRequestGet({ env }) {
  const bucket = env.GID_SITE;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'R2 bucket GID_SITE not bound. See setup instructions in this file.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const keys = [];
  let cursor;
  do {
    const listed = await bucket.list({ prefix: 'frontend/', cursor });
    for (const obj of listed.objects) {
      // Skip zero-byte "folder" placeholder objects some tools create
      if (obj.size === 0) continue;
      keys.push(obj.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  // Newest upload first (R2 keys sort lexically; good enough without a timestamp scheme)
  keys.sort().reverse();

  return new Response(JSON.stringify({ keys }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // 5 min — avoids hammering R2 list on every page load
    },
  });
}
