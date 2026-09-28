import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePeriodWindow, collectedRevenue, netProfit, cardRevenue,
  ownerPaySettings, ownerTakeHome, jobFromRow, phoenixDateParts,
} from '../shared/business-metrics.js';

// Noon Sept 27 2026 in Arizona (UTC-7, no DST).
const NOW = new Date('2026-09-27T19:00:00Z');

const JOBS = [
  // A: single full Stripe charge, never logged to payments[]
  { id: 'A', jobStatus: 'PAID', paidAt: '2026-09-10T18:00:00Z', invoiceAmount: 300, taxAmount: 25, amountPaid: 325, partsCost: 100, payments: [] },
  // B: two partial payments across the month boundary, not yet PAID
  { id: 'B', jobStatus: 'INVOICED', paidAt: null, invoiceAmount: 400, taxAmount: 0, amountPaid: 250, partsCost: null,
    payments: [{ amount: 100, at: '2026-08-25T17:00:00Z', method: 'Cash' }, { amount: 150, at: '2026-09-05T17:00:00Z', method: 'Zelle' }] },
  // C: PAID with a complete card payment log
  { id: 'C', jobStatus: 'PAID', paidAt: '2026-09-12T20:00:00Z', invoiceAmount: 180, taxAmount: 20, amountPaid: 200, partsCost: 0,
    payments: [{ amount: 200, at: '2026-09-12T20:00:00Z', method: 'Card (Stripe)' }] },
  // D: PAID but payment log incomplete (idempotent retry gap), amountPaid missing
  { id: 'D', jobStatus: 'PAID', paidAt: '2026-09-20T21:00:00Z', invoiceAmount: 500, taxAmount: 40, amountPaid: null, partsCost: 60,
    payments: [{ amount: 50, at: '2026-09-01T17:00:00Z', method: 'Cash' }] },
  // E: cancelled job that kept a deposit
  { id: 'E', status: 'cancelled', jobStatus: 'CANCELLED', paidAt: null, invoiceAmount: 0, taxAmount: 0, amountPaid: 75, partsCost: 0,
    payments: [{ amount: 75, at: '2026-09-03T17:00:00Z', method: 'Cash' }] },
  // F: paid 11:30 PM Aug 31 Arizona, which is Sept 1 in UTC
  { id: 'F', jobStatus: 'PAID', paidAt: '2026-09-01T06:30:00Z', invoiceAmount: 100, taxAmount: 0, amountPaid: 100, partsCost: 0, payments: [] },
];

const w = p => resolvePeriodWindow(p, NOW);
const cents = n => Math.round(n * 100) / 100;

test('revenue this month: payments + invoice fallback + cancelled deposit, Arizona month boundary', () => {
  const r = collectedRevenue(JOBS, w('this_month').inWindow);
  assert.equal(cents(r.total), 1290); // A325 + B150 + C200 + D540 + E75; F is August in Arizona
  assert.equal(r.jobCount, 5);
});

test('incomplete payment log falls back to invoice + tax, not added on top', () => {
  const r = collectedRevenue([JOBS[3]], w('this_month').inWindow);
  assert.equal(r.total, 540);
});

test('partial payments only count the entries inside the window', () => {
  assert.equal(collectedRevenue([JOBS[1]], w('this_month').inWindow).total, 150);
  assert.equal(collectedRevenue([JOBS[1]], w('last_month').inWindow).total, 100);
});

test('this month and last 30 days are different periods', () => {
  assert.equal(cents(collectedRevenue(JOBS, w('last_30_days').inWindow).total), 1390); // + F
  assert.equal(cents(collectedRevenue(JOBS, w('last_month').inWindow).total), 200);   // F + B's Aug payment
});

test('net profit: paid − tax − parts, PAID jobs closed in window only', () => {
  assert.equal(cents(netProfit(JOBS, w('this_month').inWindow)), 820);   // A200 + C180 + D440
  assert.equal(cents(netProfit(JOBS, w('last_30_days').inWindow)), 920); // + F100
  assert.equal(netProfit([JOBS[1], JOBS[4]], w('this_month').inWindow), 0); // unpaid + cancelled
});

test('card revenue only counts Card (Stripe) entries', () => {
  assert.equal(cardRevenue(JOBS, w('last_30_days').inWindow), 200);
});

test('owner take-home matches the Owner Pay panel formula and is not revenue', () => {
  const settings = ownerPaySettings({ owner_tax_reserve_pct: 0.3, owner_stripe_fee_pct: 0.03, owner_overhead_items: [{ amount: 200 }, { amount: 100 }] });
  const t = ownerTakeHome(JOBS, w('last_30_days'), settings);
  assert.equal(cents(t.jobMargin), 920);
  assert.equal(cents(t.stripeFees), 6);
  assert.equal(cents(t.overhead), 300);
  assert.equal(cents(t.businessNet), 614);
  assert.equal(cents(t.taxReserve), 184.2);
  assert.equal(cents(t.takeHome), 429.8);
  assert.notEqual(cents(t.takeHome), 1390);
});

test('owner take-home prorates overhead to the window and floors at zero in a deficit', () => {
  const settings = ownerPaySettings({ owner_overhead_items: [{ amount: 3000 }] });
  assert.equal(cents(ownerTakeHome(JOBS, w('last_7_days'), settings).overhead), 700);
  const t = ownerTakeHome(JOBS, w('last_30_days'), ownerPaySettings({ owner_overhead_items: [{ amount: 5000 }] }));
  assert.equal(t.inDeficit, true);
  assert.equal(t.taxReserve, 0);
  assert.equal(t.takeHome, 0);
});

test('owner pay settings defaults match the dashboard', () => {
  assert.deepEqual(ownerPaySettings({}), { taxReservePct: 0.3, stripeFeePct: 0.02928, monthlyOverhead: 0 });
});

test('period windows', () => {
  assert.equal(w('this_month').label, 'this month');
  assert.equal(w('this_month').days, 27);
  assert.equal(w('this_week').days, 7);
  assert.equal(w('last_90_days').days, 90);
  assert.equal(w('fortnight').key, 'last_30_days');
  assert.equal(w('fortnight').label, 'the last 30 days');
  const jan = resolvePeriodWindow('last_month', new Date('2027-01-15T19:00:00Z'));
  assert.equal(jan.days, 31);
  assert.equal(jan.inWindow('2026-12-31T20:00:00Z'), true);
  assert.equal(jan.inWindow('2027-01-01T08:00:00Z'), false);
  // 11 PM Arizona is still "today" even though UTC has rolled over
  assert.equal(w('today').inWindow('2026-09-28T06:00:00Z'), true);
  assert.deepEqual(phoenixDateParts(new Date('2026-09-01T06:30:00Z')), { year: 2026, month: 8, day: 31 });
});

test('jobFromRow maps Supabase rows, including string-encoded payments', () => {
  const j = jobFromRow({ job_status: 'PAID', paid_at: '2026-09-10T18:00:00Z', invoice_amount: 300, tax_amount: 25, amount_paid: null, parts_cost: 10, payments: '[{"amount":5,"at":"2026-09-10T18:00:00Z"}]' });
  assert.equal(j.amountPaid, null);
  assert.equal(j.payments.length, 1);
  assert.equal(jobFromRow({ payments: 'not json' }).payments.length, 0);
});

// Parity: the dashboard's formulas as they were before extraction (JobOps.tsx
// revenueFor / netProfitFor), fed the same Arizona window.
test('parity with the pre-extraction dashboard formulas', () => {
  const oldRevenueFor = (jobs, inWindow) => jobs.reduce((sum, j) => {
    const loggedInWindow = (j.payments || []).filter(p => inWindow(p.at)).reduce((s, p) => s + p.amount, 0);
    const loggedTotal = (j.payments || []).reduce((s, p) => s + p.amount, 0);
    const invoiceTotal = (j.invoiceAmount || 0) + (j.taxAmount || 0);
    if (j.jobStatus === 'PAID' && j.paidAt && inWindow(j.paidAt) && loggedTotal < invoiceTotal - 0.01) return sum + invoiceTotal;
    return sum + loggedInWindow;
  }, 0);
  const oldNetProfitFor = (jobs, inWindow) => jobs.reduce((sum, j) => {
    if (j.jobStatus !== 'PAID' || !j.paidAt || !inWindow(j.paidAt)) return sum;
    const paid = j.amountPaid ?? ((j.invoiceAmount || 0) + (j.taxAmount || 0));
    return sum + (paid - (j.taxAmount || 0) - (j.partsCost || 0));
  }, 0);
  for (const p of ['today', 'this_month', 'last_month', 'this_year', 'last_7_days', 'last_30_days']) {
    const { inWindow } = w(p);
    assert.equal(collectedRevenue(JOBS, inWindow).total, oldRevenueFor(JOBS, inWindow), `revenue ${p}`);
    assert.equal(netProfit(JOBS, inWindow), oldNetProfitFor(JOBS, inWindow), `net profit ${p}`);
  }
});

// ---- Bug 1: contribution-level evidence and exact period comparison ----

import { revenueContributions, compareRevenuePeriods } from '../shared/business-metrics.js';

test('1: contributions add up to the totals, and the period comparison is exact', () => {
  const month = w('this_month');
  const last30 = w('last_30_days');
  const contribs = revenueContributions(JOBS, month.inWindow);
  assert.equal(cents(contribs.reduce((s, x) => s + x.c.collected, 0)), cents(collectedRevenue(JOBS, month.inWindow).total));
  assert.equal(cents(contribs.reduce((s, x) => s + x.c.netProfit, 0)), cents(netProfit(JOBS, month.inWindow)));
  assert.equal(contribs.find(x => x.job.id === 'D').c.basis, 'paid_invoice_fallback');

  const cmp = compareRevenuePeriods(JOBS, month, last30);
  assert.equal(cmp.collectedDifference, 100); // 1390 − 1290
  assert.equal(cmp.netProfitDifference, 100); // 920 − 820
  assert.deepEqual(cmp.differences.map(d => [d.job.id, d.where, d.collectedDifference]), [['F', 'only_in_b', 100]]);
  assert.equal(cents(cmp.differences.reduce((s, d) => s + d.collectedDifference, 0)), cmp.collectedDifference);
});
