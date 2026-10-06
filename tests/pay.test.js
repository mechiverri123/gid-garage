// Helper pay: entries/payouts rules, net profit minus helper pay on the day
// paid (Arizona boundaries), Money tab matching a Venmo to a logged payout,
// and the pay-* server actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEntry, cleanPayout, balances, entryAmount, NEC_THRESHOLD } from '../shared/pay.js';
import { netProfit, laborPaid, resolvePeriodWindow, compareRevenuePeriods, ownerTakeHome, jobFromRow } from '../shared/business-metrics.js';
import { buildLedger, summarize } from '../shared/money.js';
import { handlePayAction, loadPayouts, NEEDS_MIGRATION, PayError } from '../functions/_lib/pay.js';

test('entries: hours × rate, flat amounts, validation', () => {
  assert.equal(entryAmount({ kind: 'hours', hours: 2.5, rate: 20 }), 50);
  const h = cleanEntry({ person_id: 'p1', work_date: '2026-10-06', kind: 'hours', hours: '3.25', rate: '18', booking_id: 'b1', note: ' held light ' });
  assert.deepEqual([h.amount, h.hours, h.rate, h.note, h.booking_id], [58.5, 3.25, 18, 'held light', 'b1']);
  const j = cleanEntry({ person_id: 'p1', work_date: '2026-10-06', kind: 'job', amount: '40', hours: 9, rate: 9 });
  assert.deepEqual([j.amount, j.hours, j.rate], [40, null, null]);
  assert.throws(() => cleanEntry({ person_id: 'p1', work_date: '2026-10-06', kind: 'hours', hours: 0, rate: 20 }), /Hours/);
  assert.throws(() => cleanEntry({ person_id: 'p1', work_date: '10/06/2026', kind: 'job', amount: 5 }), /date/);
  assert.throws(() => cleanEntry({ person_id: 'p1', work_date: '2026-10-06', kind: 'salary', amount: 5 }), /Pick/);
  assert.throws(() => cleanPayout({ person_id: 'p1', paid_on: '2026-10-06', amount: 0 }), /Amount/);
  assert.equal(cleanPayout({ person_id: 'p1', paid_on: '2026-10-06', amount: '75.004', method: 'Venmo' }).amount, 75);
});

test('balances: owed = earned − paid; year total drives the 1099 flag', () => {
  const people = [{ id: 'a', name: 'Kass' }, { id: 'b', name: 'Sam' }];
  const entries = [{ person_id: 'a', amount: 60 }, { person_id: 'a', amount: 40 }, { person_id: 'b', amount: 2500 }];
  const payouts = [{ person_id: 'a', amount: 75, paid_on: '2026-10-06' }, { person_id: 'b', amount: 2100, paid_on: '2026-03-01' }, { person_id: 'b', amount: 400, paid_on: '2025-12-30' }];
  const [a, b] = balances(people, entries, payouts, '2026');
  assert.deepEqual([a.earned, a.paid, a.owed, a.needs1099], [100, 75, 25, false]);
  assert.deepEqual([b.owed, b.paidYear, b.needs1099], [0, 2100, true]);
  assert.equal(NEC_THRESHOLD, 2000);
});

const paidJob = jobFromRow({ id: 'j1', job_status: 'PAID', paid_at: '2026-09-15T18:00:00Z', invoice_amount: 300, tax_amount: 0, parts_cost: 100, amount_paid: 300, payments: [{ amount: 300, date: '2026-09-15T18:00:00Z', method: 'Cash' }] });

test('net profit subtracts helper pay on the Arizona day it was paid', () => {
  const now = new Date('2026-10-01T06:00:00Z'); // Sep 30, 11 PM in Arizona
  const sep = resolvePeriodWindow('this_month', now);
  const payouts = [{ paid_on: '2026-09-30', amount: 50 }, { paid_on: '2026-10-01', amount: 999 }, { paid_on: '2026-08-31', amount: 7 }];
  assert.equal(laborPaid(payouts, sep.inWindow), 50, 'Sep 30 payout stays in September; Oct 1 and Aug 31 do not');
  assert.equal(netProfit([paidJob], sep.inWindow), 200);
  assert.equal(netProfit([paidJob], sep.inWindow, payouts), 150);
  assert.equal(laborPaid(null, sep.inWindow), 0);
  assert.equal(laborPaid([{ paid_on: 'garbage', amount: 5 }], sep.inWindow), 0);
});

test('period compare and take-home use the same helper-pay rule', () => {
  const now = new Date('2026-09-20T18:00:00Z');
  const payouts = [{ paid_on: '2026-09-16', amount: 40 }];
  const cmp = compareRevenuePeriods([paidJob], resolvePeriodWindow('last_month', now), resolvePeriodWindow('this_month', now), payouts);
  assert.equal(cmp.b.netProfit, 160);
  assert.equal(cmp.b.helperPay, 40);
  assert.equal(cmp.helperPayDifference, 40);
  assert.equal(cmp.netProfitDifference, 160);
  const t = ownerTakeHome([paidJob], resolvePeriodWindow('this_month', now), { taxReservePct: 0, stripeFeePct: 0, monthlyOverhead: 0 }, payouts);
  assert.equal(t.jobMargin, 160);
});

test('Money: a Venmo matching a logged payout is helper pay, counted once; unmatched Venmo stays owner equity', () => {
  const bank = [
    { id: 'bv:1', date: '2026-10-07', amount: -75, desc: 'VENMO *KASSIDY, NY' },
    { id: 'bv:2', date: '2026-10-08', amount: -550, desc: 'VENMO *SOMEONE, NY' },
    { id: 'bv:3', date: '2026-10-09', amount: -30, desc: 'VENMO *HELPER2, NY' },
  ];
  const payouts = [{ paid_on: '2026-10-06', amount: 75 }, { paid_on: '2026-10-02', amount: 20 }];
  const { entries } = buildLedger({ bank, payouts, overrides: { 'bv:3': { kind: 'helper_pay' } } });
  const by = Object.fromEntries(entries.map(e => [e.id, e]));
  assert.equal(by['bv:1'].kind, 'helper_pay'); assert.equal(by['bv:1'].inPayLedger, true);
  assert.equal(by['bv:2'].kind, 'owner_out');
  assert.equal(by['bv:3'].kind, 'helper_pay'); assert.equal(by['bv:3'].notInPayLedger, true);
  const s = summarize(entries, '2026-10-01', '2026-10-31', { collected: 1000, salesTax: 0 }, [], payouts);
  // logged payouts 75 + 20, plus the marked Venmo never logged (30): each once.
  assert.equal(s.helperPay, 125);
  assert.equal(s.helperPayNotInLedger, 30);
  assert.equal(s.net, 875);
  assert.equal(s.expenses, 0);
});

test("Money: the owner's explicit 'paid me back' wins over a same-amount payout", () => {
  const bank = [{ id: 'bv:1', date: '2026-10-07', amount: -75, desc: 'VENMO *KASSIDY, NY' }];
  const { entries } = buildLedger({ bank, payouts: [{ paid_on: '2026-10-07', amount: 75 }], overrides: { 'bv:1': { kind: 'owner_out' } } });
  assert.equal(entries[0].kind, 'owner_out');
});

function fakeDb(tables) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const table = url.split('/').pop().split('?')[0];
    if (!(table in tables)) return new Response(JSON.stringify({ code: '42P01', message: `relation "${table}" does not exist` }), { status: 404 });
    if ((init.method || 'GET') === 'POST') return new Response(JSON.stringify([{ id: 'new', ...JSON.parse(init.body) }]), { status: 201 });
    if (init.method === 'DELETE') return new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
    return new Response(JSON.stringify(tables[table]), { status: 200 });
  };
  return { fetchImpl, calls };
}

test('pay actions: data, validated writes, migration message, payouts never throw', async () => {
  const db = fakeDb({ pay_people: [{ id: 'a', name: 'Kass' }], pay_entries: [], pay_payouts: [{ paid_on: '2026-10-06', amount: 75 }] });
  const ctx = { base: 'https://db/rest/v1', headers: {}, fetchImpl: db.fetchImpl };
  const d = await handlePayAction('pay-data', {}, ctx);
  assert.equal(d.people[0].name, 'Kass');
  const e = await handlePayAction('pay-entry-add', { fields: { person_id: 'a', work_date: '2026-10-06', kind: 'hours', hours: 2, rate: 20 } }, ctx);
  assert.equal(e.amount, 40);
  await assert.rejects(handlePayAction('pay-payout-add', { fields: { person_id: 'a', paid_on: '2026-10-06', amount: -5 } }, ctx), PayError);
  await assert.rejects(handlePayAction('pay-person-save', { fields: { name: '  ' } }, ctx), /Name is required/);

  const empty = fakeDb({});
  await assert.rejects(handlePayAction('pay-data', {}, { ...ctx, fetchImpl: empty.fetchImpl }), new RegExp(NEEDS_MIGRATION.slice(0, 20)));
  assert.deepEqual(await loadPayouts({ ...ctx, fetchImpl: empty.fetchImpl }), []);
  assert.deepEqual(await loadPayouts({ ...ctx, fetchImpl: async () => { throw new Error('down'); } }), []);
});
