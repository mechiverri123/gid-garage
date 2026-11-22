// Auto-record card payments (owner decision 2026-11-21). Bluevine's card
// payments (Tap to Pay and pay links) run on Stripe, so a new succeeded charge
// is matched to the one open job whose balance is exactly that amount and
// recorded there with its Stripe id. Never guesses: zero or several matching
// jobs leave the charge for the owner to record by hand. Pure; I/O lives in
// functions/_lib/stripe-sync.js. Tests: tests/stripe-sync.test.js.
import { isAwaitingPayment, jobBalance } from './business-rules.js';
import { parsePayments } from './business-metrics.js';

// Charges before this were recorded by hand (often without a Stripe id), so
// they are never auto-recorded or reported.
export const AUTO_RECORD_SINCE = '2026-11-21T07:00:00Z'; // Nov 21 midnight, Arizona

// Stripe charge -> { id, ids (charge + payment intent), amount ($), at (ISO), inPerson }
export function chargeFromStripe(c) {
  return {
    id: c.id,
    ids: [c.id, typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id].filter(Boolean),
    amount: Math.round(Number(c.amount) - Number(c.amount_refunded || 0)) / 100,
    at: new Date(Number(c.created) * 1000).toISOString(),
    inPerson: c.payment_method_details?.type === 'card_present' || c.payment_method_details?.type === 'interac_present',
    ok: c.status === 'succeeded' && c.paid !== false && !c.refunded,
  };
}

// Every Stripe id already on a job (payment entries and the job's transaction id).
export function recordedStripeIds(jobs) {
  const ids = new Set();
  for (const j of jobs) {
    if (j.stripeTransactionId) ids.add(String(j.stripeTransactionId).trim());
    for (const p of parsePayments(j.payments)) if (p?.stripeId) ids.add(String(p.stripeId).trim());
  }
  return ids;
}

// -> { record: [{ charge, job }], unmatched: [{ charge, reason, jobs? }] }
export function matchCharges(charges, jobs, since = AUTO_RECORD_SINCE) {
  const known = recordedStripeIds(jobs);
  // Same amount already logged within a day and a half: recorded by hand without its id.
  const logged = jobs.flatMap(j => parsePayments(j.payments)).map(p => ({ amount: Number(p?.amount), ms: Date.parse(p?.at) }));
  const byHand = c => logged.some(p => Math.abs(p.amount - c.amount) < 0.005 && Math.abs(p.ms - Date.parse(c.at)) < 36 * 3600e3);
  const open = jobs.filter(j => isAwaitingPayment(j) && j.invoiceAmount != null && jobBalance(j) > 0.01);
  const taken = new Set();
  const record = []; const unmatched = [];
  for (const charge of [...charges].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!charge.ok || charge.at < since || charge.amount <= 0 || charge.ids.some(id => known.has(id)) || byHand(charge)) continue;
    const hits = open.filter(j => !taken.has(j.id) && Math.abs(jobBalance(j) - charge.amount) < 0.005);
    if (hits.length === 1) { taken.add(hits[0].id); record.push({ charge, job: hits[0] }); }
    else unmatched.push({ charge, reason: hits.length ? 'several_jobs' : 'no_job', jobs: hits.map(j => j.id) });
  }
  return { record, unmatched };
}
