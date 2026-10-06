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

test("owner's own pay is an owner's draw: never lowers net profit or counts as helper pay", () => {
  const now = new Date('2026-10-08T18:00:00Z');
  const oct = resolvePeriodWindow('this_month', now);
  const payouts = [{ paid_on: '2026-10-05', amount: 500, owner_draw: true }, { paid_on: '2026-10-06', amount: 60 }];
  assert.equal(laborPaid(payouts, oct.inWindow), 60);
  const bank = [{ id: 'bv:1', date: '2026-10-06', amount: -500, desc: 'TRANSFER TO SOFI' }, { id: 'bv:2', date: '2026-10-07', amount: -60, desc: 'VENMO *KASS, NY' }];
  const equity = [{ entry_type: 'draw', amount: 500, entry_date: '2026-10-05' }];
  const { entries } = buildLedger({ bank, payouts, equity });
  const by = Object.fromEntries(entries.map(e => [e.id, e]));
  assert.equal(by['bv:1'].kind, 'owner_out'); assert.equal(by['bv:1'].inLedger, true);
  assert.equal(by['bv:2'].kind, 'helper_pay');
  const s = summarize(entries, '2026-10-01', '2026-10-31', { collected: 1000, salesTax: 0 }, equity, payouts);
  assert.equal(s.helperPay, 60);
  assert.equal(s.net, 940);
  assert.equal(s.ownerPaidBack, 500);
});

test('weeks run Monday–Sunday; weekly hours, earned and paid per person', async () => {
  const { weekStart, weeklySummary } = await import('../shared/pay.js');
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // across the year
  const entries = [
    { person_id: 'me', work_date: '2026-10-06', hours: 6, amount: 180 },
    { person_id: 'me', work_date: '2026-10-11', hours: 2, amount: 60 },
    { person_id: 'me', work_date: '2026-10-04', hours: 5, amount: 150 },
    { person_id: 'other', work_date: '2026-10-06', hours: 9, amount: 900 },
  ];
  const [thisWeek, lastWeek] = weeklySummary('me', entries, [{ person_id: 'me', paid_on: '2026-10-05', amount: 150 }], '2026-10-08', 2);
  assert.deepEqual(thisWeek, { start: '2026-10-05', end: '2026-10-11', hours: 8, earned: 240, paid: 150 });
  assert.deepEqual([lastWeek.start, lastWeek.hours, lastWeek.earned], ['2026-09-28', 5, 150]);
});

test('1099 flag is for contractors only', () => {
  const people = [{ id: 'c', role: 'contractor' }, { id: 'e', role: 'employee' }, { id: 'o', role: 'owner' }];
  const payouts = ['c', 'e', 'o'].map(id => ({ person_id: id, amount: 3000, paid_on: '2026-05-01' }));
  assert.deepEqual(balances(people, [], payouts, '2026').map(b => b.needs1099), [true, false, false]);
});

test("paying the owner writes the Owner's Equity draw and links it; deleting removes both", async () => {
  const calls = [];
  const tables = { pay_people: [{ id: 'o', name: 'Miko', role: 'owner' }], equity_entries: [], pay_payouts: [] };
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET'; const table = url.split('/').pop().split('?')[0];
    calls.push({ table, method, body: init.body ? JSON.parse(init.body) : null });
    if (method === 'POST') return new Response(JSON.stringify([{ id: `${table}-1`, ...JSON.parse(init.body) }]), { status: 201 });
    if (method === 'DELETE') return new Response(JSON.stringify(table === 'pay_payouts' ? [{ id: 'p', equity_entry_id: 'equity_entries-1' }] : []), { status: 200 });
    return new Response(JSON.stringify(tables[table]), { status: 200 });
  };
  const ctx = { base: 'https://db/rest/v1', headers: {}, fetchImpl };
  const row = await handlePayAction('pay-payout-add', { fields: { person_id: 'o', paid_on: '2026-10-09', amount: 480, method: 'Bank transfer', note: 'Week of Oct 5' } }, ctx);
  assert.equal(row.owner_draw, true);
  assert.equal(row.equity_entry_id, 'equity_entries-1');
  const eq = calls.find(c => c.table === 'equity_entries' && c.method === 'POST').body;
  assert.deepEqual([eq.entry_type, eq.amount, eq.entry_date], ['draw', 480, '2026-10-09']);
  await handlePayAction('pay-payout-delete', { id: 'p' }, ctx);
  assert.ok(calls.some(c => c.table === 'equity_entries' && c.method === 'DELETE'));
  // a contractor's payout never touches the equity ledger
  tables.pay_people = [{ id: 'c', name: 'Kass', role: 'contractor' }]; calls.length = 0;
  const c = await handlePayAction('pay-payout-add', { fields: { person_id: 'c', paid_on: '2026-10-09', amount: 60 } }, ctx);
  assert.equal(c.owner_draw, undefined);
  assert.ok(!calls.some(x => x.table === 'equity_entries'));
});
