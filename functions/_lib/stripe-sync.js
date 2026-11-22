// I/O for shared/stripe-sync.js: read recent Stripe charges, record the ones
// that match exactly one open job (planPayment, the same rules as every other
// payment), report the rest. Read-only toward Stripe.
import { jobFromRow } from '../../shared/business-metrics.js';
import { planPayment } from '../../shared/business-rules.js';
import { AUTO_RECORD_SINCE, chargeFromStripe, matchCharges } from '../../shared/stripe-sync.js';

export async function syncStripePayments(env, { base, headers }, fetchImpl = fetch) {
  if (!env.STRIPE_SECRET_KEY) return { ok: false, reason: 'STRIPE_SECRET_KEY not set', recorded: [], unmatched: [] };
  const since = Math.floor(Date.parse(AUTO_RECORD_SINCE) / 1000);
  const weekAgo = Math.floor(Date.now() / 1000) - 14 * 86400;
  const sr = await fetchImpl(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${Math.max(since, weekAgo)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!sr.ok) return { ok: false, reason: `Stripe ${sr.status}`, recorded: [], unmatched: [] };
  const charges = ((await sr.json()).data || []).map(chargeFromStripe);
  if (!charges.length) return { ok: true, recorded: [], unmatched: [] };

  const cols = 'id,fname,lname,job_status,status,invoice_amount,estimate_amount,tax_amount,amount_paid,payments,stripe_transaction_id,paid_at';
  const br = await fetchImpl(`${base}/bookings?select=${cols}&limit=5000`, { headers });
  if (!br.ok) return { ok: false, reason: `bookings ${br.status}`, recorded: [], unmatched: [] };
  const jobs = (await br.json()).map(jobFromRow);
  const { record, unmatched } = matchCharges(charges, jobs);

  const recorded = [];
  for (const { charge, job } of record) {
    let plan;
    try {
      plan = planPayment(job, {
        amount: charge.amount, method: charge.inPerson ? 'Card (Tap to Pay)' : 'Card (Stripe)',
        stripeId: charge.id, note: 'Recorded automatically from Stripe', now: new Date(charge.at),
      });
    } catch (e) { unmatched.push({ charge, reason: e.message }); continue; }
    // Only if nobody changed the job since we read it (another open tab syncing too).
    const guard = job.amountPaid == null ? 'amount_paid=is.null' : `amount_paid=eq.${job.amountPaid}`;
    const pr = await fetchImpl(`${base}/bookings?id=eq.${encodeURIComponent(job.id)}&${guard}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(plan.fields),
    });
    const rows = pr.ok ? await pr.json() : [];
    if (rows.length) recorded.push({ jobId: job.id, who: `${job.fname} ${job.lname}`.trim(), amount: charge.amount, at: charge.at, stripeId: charge.id, fullyPaid: plan.preview.fullyPaid });
  }
  return {
    ok: true, recorded,
    unmatched: unmatched.map(u => ({ stripeId: u.charge.id, amount: u.charge.amount, at: u.charge.at, reason: u.reason })),
  };
}
