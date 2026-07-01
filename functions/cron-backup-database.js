// Cloudflare Pages Function — POST or GET /cron-backup-database?key=YOUR_SECRET
//
// Cloudflare Pages Functions don't support native Cron Triggers (that's
// Workers-only as of this writing). So this is a plain HTTP endpoint,
// protected by a shared secret instead of Cloudflare Access (an external
// scheduler has no Access session), and you point a free external scheduler
// at it — e.g. cron-job.org (free, no signup fee) once a day.
//
// Setup:
//   1. Cloudflare Pages → Settings → Environment variables → add CRON_SECRET
//      (pick any long random string).
//   2. At cron-job.org (or similar), create a job hitting:
//        https://gidgarage.com/cron-backup-database?key=YOUR_SECRET
//      once daily.
//   3. Check Admin → Hub → Recovery to confirm it's actually running.
import { runBackup } from './_lib/backup.js';
import { reportError } from './_lib/sentry.js';

async function handle({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const status = await runBackup(env);
    return new Response(JSON.stringify(status), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    await reportError(env, err, { source: 'cron-backup-database' });
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context) { return handle(context); }
export async function onRequestGet(context) { return handle(context); } // most free cron services only support GET
