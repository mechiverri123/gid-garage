// Cloudflare Pages Function — POST /seo-sync   (CRON ONLY)
// Pulls SEO/growth data from every configured provider, then re-runs the
// deterministic detectors. Providers without credentials are recorded as
// not_configured / needs_authorization / pending_approval and skipped.
//
// Auth: X-GID-SEO-Secret must exactly equal SEO_SYNC_SECRET (constant-time
// compare). There is no admin/header bypass on this route — it must stay
// outside Cloudflare Access so Supabase pg_cron can reach it. The admin
// "Sync now" button goes through /jarvis/seo-data (Access-verified) instead, and the
// secret never reaches the browser.
//   missing header -> 401, wrong secret -> 403, secret not configured -> 503
// Body (optional): { mode: 'incremental' | 'backfill' | 'force', only: ['search_console', ...] }

import { createSeoStore } from './_lib/seo/store.js';
import { runSeoSync } from './_lib/seo/sync.js';
import { safeEqual } from './_lib/access-auth.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  if (!env.SEO_SYNC_SECRET) return json({ ok: false, error: 'SEO sync is not configured' }, 503);
  const supplied = request.headers.get('X-GID-SEO-Secret');
  if (!supplied) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!safeEqual(supplied, env.SEO_SYNC_SECRET)) return json({ ok: false, error: 'Forbidden' }, 403);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) return json({ ok: false, error: 'Server not configured' }, 500);
  const body = await request.json().catch(() => ({}));
  const mode = ['incremental', 'backfill', 'force'].includes(body?.mode) ? body.mode : 'incremental';
  const only = Array.isArray(body?.only) ? body.only.map(String).slice(0, 20) : null;
  try {
    const result = await runSeoSync({ env, store: createSeoStore({ supabaseUrl, serviceKey: env.SUPABASE_SERVICE_KEY }), mode, only });
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}
