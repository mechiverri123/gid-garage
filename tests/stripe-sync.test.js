import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeFromStripe, matchCharges } from '../shared/stripe-sync.js';
import { syncStripePayments } from '../functions/_lib/stripe-sync.js';

const at = iso => Math.floor(Date.parse(iso) / 1000);
const ch = (id, cents, iso, extra = {}) => chargeFromStripe({ id, amount: cents, created: at(iso), status: 'succeeded', paid: true, payment_intent: `pi_${id}`, payment_method_details: { type: 'card_present' }, ...extra });
const job = (id, invoice, tax, status = 'INVOICED', extra = {}) => ({ id, fname: id, lname: '', jobStatus: status, invoiceAmount: invoice, taxAmount: tax, amountPaid: null, payments: [], ...extra });

test('a charge equal to exactly one open balance is recorded there', () => {
  const r = matchCharges([ch('a', 48217, '2026-11-22T18:00:00Z')], [job('teun', 440.83, 41.34), job('other', 100, 9.39)]);
  assert.deepEqual(r.record.map(x => x.job.id), ['teun']);
  assert.equal(r.record[0].charge.inPerson, true);
  assert.deepEqual(r.unmatched, []);
});

test('never guesses: no match or two matches are left for the owner', () => {
  const two = matchCharges([ch('a', 10939, '2026-11-22T18:00:00Z')], [job('x', 100, 9.39), job('y', 100, 9.39)]);
  assert.equal(two.record.length, 0); assert.equal(two.unmatched[0].reason, 'several_jobs');
  const none = matchCharges([ch('b', 5000, '2026-11-22T18:00:00Z')], [job('x', 100, 9.39)]);
  assert.equal(none.unmatched[0].reason, 'no_job');
});

test('skips charges already on a job, refunded, before the start date, or logged by hand', () => {
  const paid = job('p', 100, 9.39, 'PAID', { payments: [{ amount: 109.39, at: '2026-11-22T18:05:00Z' }], amountPaid: 109.39 });
  const open = job('o', 100, 9.39);
  const r = matchCharges([
    ch('known', 10939, '2026-11-22T18:00:00Z'),
    ch('refunded', 10939, '2026-11-22T18:00:00Z', { refunded: true }),
    ch('old', 10939, '2026-11-01T18:00:00Z'),
  ], [job('k', 1, 0, 'PAID', { stripeTransactionId: 'pi_known' }), open]);
  assert.deepEqual(r, { record: [], unmatched: [] });
  assert.deepEqual(matchCharges([ch('hand', 10939, '2026-11-22T18:00:00Z')], [paid, open]), { record: [], unmatched: [] });
});

test('two charges cannot land on the same job', () => {
  const r = matchCharges([ch('a', 10939, '2026-11-22T18:00:00Z'), ch('b', 10939, '2026-11-22T19:00:00Z')], [job('x', 100, 9.39)]);
  assert.equal(r.record.length, 1); assert.equal(r.unmatched.length, 1);
});

test('sync records the payment on the charge time with its Stripe id, guarded on amount_paid', async () => {
  const calls = [];
  const fake = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.startsWith('https://api.stripe.com')) return { ok: true, json: async () => ({ data: [{ id: 'ch_1', amount: 48217, created: at('2026-11-22T18:00:00Z'), status: 'succeeded', paid: true, payment_method_details: { type: 'card_present' } }] }) };
    if (opts.method === 'PATCH') return { ok: true, json: async () => [{ id: 'teun' }] };
    return { ok: true, json: async () => [{ id: 'teun', fname: 'Teun', lname: '', job_status: 'INVOICED', invoice_amount: 440.83, tax_amount: 41.34, amount_paid: null, payments: '[]' }] };
  };
  const out = await syncStripePayments({ STRIPE_SECRET_KEY: 'k' }, { base: 'https://db/rest/v1', headers: {} }, fake);
  assert.equal(out.recorded.length, 1);
  const patch = calls.find(c => c.opts.method === 'PATCH');
  assert.match(patch.url, /amount_paid=is\.null/);
  const body = JSON.parse(patch.opts.body);
  assert.equal(body.job_status, 'PAID');
  assert.equal(body.paid_at, '2026-11-22T18:00:00.000Z');
  assert.equal(body.stripe_transaction_id, 'ch_1');
  const [p] = JSON.parse(body.payments);
  assert.deepEqual([p.amount, p.method, p.stripeId, p.at], [482.17, 'Card (Tap to Pay)', 'ch_1', '2026-11-22T18:00:00.000Z']);
});
