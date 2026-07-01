// Cloudflare Pages Function — POST or GET /cron-review-followups?key=YOUR_SECRET
//
// Same reasoning as cron-backup-database.js — Pages Functions have no native
// cron, so this is a secret-protected HTTP endpoint you point a free external
// scheduler at (e.g. cron-job.org, once daily).
//
// Finds jobs that: are PAID, closed 24h-14d ago, and haven't had a review
// request sent yet — then emails a review-request and marks them so it only
// ever sends once per job.
//
// Requires a new column on `bookings` (run once in Supabase SQL editor):
//   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;
import { reportError } from './_lib/sentry.js';

const GBP_REVIEW_URL = 'https://g.page/r/CdERSypGqVdlEBM/review';

async function handle({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const brevoKey = env.BREVO_API_KEY;
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };

  try {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(now - 14 * dayMs).toISOString(); // don't reach back further than 2 weeks
    const windowEnd = new Date(now - dayMs).toISOString();        // must have closed at least 24h ago

    const res = await fetch(
      `${supabaseUrl}/rest/v1/bookings?job_status=eq.PAID&paid_at=gte.${windowStart}&paid_at=lte.${windowEnd}&review_requested_at=is.null&review_left_at=is.null&select=id,fname,email,vehicle`,
      { headers }
    );
    if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
    let rows = await res.json();

    // Skip anyone who's already reviewed on a *different* job — a repeat
    // customer who left a review last visit doesn't need asking again.
    if (rows.length) {
      const emails = [...new Set(rows.map(r => r.email).filter(Boolean))];
      if (emails.length) {
        const orFilter = emails.map(e => `email.eq.${encodeURIComponent(e)}`).join(',');
        const reviewedRes = await fetch(
          `${supabaseUrl}/rest/v1/bookings?review_left_at=not.is.null&or=(${orFilter})&select=email`,
          { headers }
        );
        if (reviewedRes.ok) {
          const reviewedEmails = new Set((await reviewedRes.json()).map(r => r.email));
          rows = rows.filter(r => !reviewedEmails.has(r.email));
        }
      }
    }

    let sent = 0, skipped = 0, failed = 0;
    for (const b of rows) {
      if (!b.email) { skipped++; continue; }
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
            to: [{ email: b.email, name: b.fname || '' }],
            subject: `Got a minute, ${b.fname || 'there'}?`,
            htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/>
              <h2 style="color:#4ade80;font-size:22px;font-weight:900;margin:0 0 10px;">How'd we do?</h2>
              <p style="color:#9ca3af;font-size:14px;line-height:1.5;margin:0 0 24px;">Hi ${b.fname || ''}, thanks again for trusting GID Garage with ${b.vehicle || 'your vehicle'}. If you have a minute, a quick Google review helps a small mobile shop like this a ton.</p>
              <p style="text-align:center;margin:0 0 8px;">
                <a href="${GBP_REVIEW_URL}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:14px 32px;letter-spacing:0.05em;text-transform:uppercase;">⭐ Leave a Review</a>
              </p>
              <p style="color:#4b5563;font-size:11px;text-align:center;margin-top:24px;">Questions or something not quite right? Just reply to this email — 480-757-0476.</p>
            </div>`,
          }),
        });
        await fetch(`${supabaseUrl}/rest/v1/bookings?id=eq.${b.id}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ review_requested_at: new Date().toISOString() }),
        });
        sent++;
      } catch (e) {
        failed++;
        await reportError(env, e, { source: 'cron-review-followups', bookingId: b.id });
      }
    }
    return new Response(JSON.stringify({ checked: rows.length, sent, skipped, failed }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await reportError(env, err, { source: 'cron-review-followups' });
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context) { return handle(context); }
export async function onRequestGet(context) { return handle(context); }
