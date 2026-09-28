// End-to-end tests of the deterministic operations Jarvis calls, against an
// in-memory stand-in for Supabase. The fake applies simple column filters
// (eq/neq/in/not.in/gte/lte) and ignores or=() name searches, so the
// resolver/attribution code is what has to pick the right rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOps } from '../functions/_lib/business-data.js';
import { JILL_JOBS } from './fixtures.js';

const NOW = new Date('2026-09-27T19:00:00Z');

function fakeSupabase(seed) {
  const tables = structuredClone(seed);
  const match = (row, key, cond) => {
    const col = key.replace(/\.\d+$/, '');
    const v = row[col];
    const [op, ...rest] = cond.split('.');
    const arg = rest.join('.');
    const list = () => arg.replace(/^in\./, '').replace(/^\(|\)$/g, '').split(',');
    if (op === 'eq') return String(v) === arg;
    if (op === 'neq') return String(v) !== arg;
    if (op === 'in') return list().includes(String(v));
    if (op === 'not' && arg.startsWith('in.')) return !list().includes(String(v));
    if (op === 'gte') return String(v) >= arg;
    if (op === 'lte') return String(v) <= arg;
    if (op === 'is' && arg === 'null') return v == null;
    return true;
  };
  return {
    tables,
    sbGet: async (table, params) => {
      let rows = tables[table] || [];
      for (const [k, c] of Object.entries(params)) {
        if (['select', 'order', 'limit', 'or', 'and'].includes(k)) continue;
        rows = rows.filter(r => match(r, k, c));
      }
      return structuredClone(rows);
    },
    sbPatch: async (table, filter, fields) => {
      const id = decodeURIComponent(filter.replace(/^id=eq\./, ''));
      Object.assign(tables[table].find(r => r.id === id), fields);
    },
  };
}

const SEED = {
  bookings: [
    ...JILL_JOBS,
    { id: 'M1', customer_id: 'c-jm', fname: 'Jill', lname: 'Moreno', phone: '928-555-0177', date: '2026-09-15', service: 'oil', job_status: 'INVOICED', vehicle: '2018 Toyota Camry', invoice_amount: 80, tax_amount: 5, amount_paid: 0, payments: '[]', estimate_notes: 'Oil and filter change' },
  ],
  customers: [
    { id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '(928) 555-0100', vehicle: '2015 Honda CR-V', notes: 'Prefers texts' },
    { id: 'c-jm', fname: 'Jill', lname: 'Moreno', phone: '928-555-0177' },
  ],
  leads: [
    { id: 'L1', created_at: '2026-06-01T00:00:00Z', fname: 'Jill', lname: 'Castle', phone: '9285550100', status: 'booked', booking_id: 'J2', requested_service: 'battery light' },
    { id: 'L2', created_at: '2026-09-26T00:00:00Z', fname: 'Lisa', lname: 'Ray', phone: '9285550123', status: 'new' },
  ],
  calls: [{ id: 'C1', created_at: '2026-06-12T17:00:00Z', phone: '928.555.0100', direction: 'outbound', outcome: 'other', notes: 'Quoted alternator $480' }],
  jarvis_business_notes: [
    { id: 'N1', created_at: '2026-06-11T00:00:00Z', status: 'open', contact_name: 'Jill Castle', summary: 'Jill deciding on alternator', action_needed: 'Follow up on alternator quote', raw_text: 'Jill Castle deciding on alternator' },
    { id: 'N2', created_at: '2026-09-20T00:00:00Z', status: 'open', contact_name: 'Lisa', summary: 'Lisa might want an oil change', raw_text: 'Lisa might want an oil change next week', preferred_timing: 'next week' },
  ],
  jarvis_reminders: [],
  business_settings: [{ id: 'default', owner_tax_reserve_pct: 0.3, owner_stripe_fee_pct: 0.03, owner_overhead_items: [{ amount: 300 }] }],
  marketing_spend: [],
};

const setup = () => {
  const db = fakeSupabase(SEED);
  return { db, ops: createBusinessOps({ sbGet: db.sbGet, sbPatch: db.sbPatch, now: () => NOW }) };
};

test('"What were Jill Castle\'s jobs about?" returns her real job evidence, not other customers', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: "Jill Castle's" });
  assert.equal(ctx.status, 'resolved');
  assert.deepEqual(ctx.jobsChronological.map(j => j.id), ['J0', 'J1', 'J2', 'J3']);
  const [, j1, j2] = ctx.jobsChronological;
  assert.match(j1.scopeOfWork, /front pads and rotors/);
  assert.match(j2.technicianNotes, /alternator/);
  assert.equal(ctx.lastVisitJobId, 'J2');
  assert.equal(ctx.customerRecordNotes, 'Prefers texts');
  assert.deepEqual(ctx.leads.map(l => l.id), ['L1']);
  assert.deepEqual(ctx.calls.map(c => c.notes), ['Quoted alternator $480']);
  assert.deepEqual(ctx.ownerNotes.map(n => [n.id, n.match]), [['N1', 'full_name']]);
  assert.ok(ctx.openItems.some(o => o.type === 'balance_owed' && o.jobId === 'J2'));
});

test('ambiguous first name asks instead of guessing', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: 'Jill' });
  assert.equal(ctx.status, 'ambiguous');
  assert.deepEqual(ctx.candidates.map(c => c.name).sort(), ['Jill Castle', 'Jill Moreno']);
});

test('job detail returns the full evidence for one job', async () => {
  const { ops } = setup();
  const d = await ops.jobDetail({ job_id: 'J2' });
  assert.equal(d.customer, 'Jill Castle');
  assert.deepEqual(d.inspection.dtcCodes.map(c => c.code), ['P0562']);
  await assert.rejects(ops.jobDetail({ job_id: 'nope' }), /No job found/);
});

test('recording a payment: preview first, then one write, then duplicates refused', async () => {
  const { db, ops } = setup();
  const preview = await ops.recordPayment({ job_id: 'M1', amount: 85, method: 'Cash' });
  assert.equal(preview.needs_confirmation, true);
  assert.match(preview.summary, /marked PAID/);
  assert.equal(db.tables.bookings.find(r => r.id === 'M1').job_status, 'INVOICED'); // nothing written yet

  const before = await ops.revenueSummary({ period: 'this_month' });
  const done = await ops.recordPayment({ job_id: 'M1', amount: 85, method: 'Cash', confirmed: true });
  assert.equal(done.status, 'PAID');
  const row = db.tables.bookings.find(r => r.id === 'M1');
  assert.equal(row.amount_paid, 85);
  assert.equal(JSON.parse(row.payments).length, 1);

  const after = await ops.revenueSummary({ period: 'this_month' });
  assert.equal(Number(after.grossCollected.slice(1)) - Number(before.grossCollected.slice(1)), 85);
  await assert.rejects(ops.recordPayment({ job_id: 'M1', amount: 85, method: 'Cash', confirmed: true }), /already marked PAID/);
});

test('unpaid, action center and data health read the same canonical rules', async () => {
  const { ops } = setup();
  const unpaid = await ops.unpaidSummary();
  assert.deepEqual(unpaid.jobs.map(j => [j.id, j.balance]), [['J2', '$120.00'], ['M1', '$85.00']]);
  assert.equal(unpaid.totalOwed, '$205.00');

  const q = await ops.actionCenter();
  assert.deepEqual(q.urgent.filter(a => a.type === 'unpaid').map(a => a.id).sort(), ['J2', 'M1']);
  // Lisa's lead is 43h old and never contacted -> flagged by the 24h rule; Jill's booked lead is not.
  assert.deepEqual(q.urgent.filter(a => a.type === 'lead_followup').map(a => a.id), ['L2']);
  assert.ok(q.waiting_on.some(w => w.type === 'owner_note' && w.id === 'N1'));

  const health = await ops.dataHealth();
  assert.equal(health.note.startsWith('Read-only'), true);
});

test('take-home uses stored owner-pay settings including overhead items', async () => {
  const { ops } = setup();
  const t = await ops.ownerPaySummary({ period: 'last_30_days' });
  assert.equal(t.overhead, '$300.00');
  assert.equal(t.settingsUsed.monthlyOverhead, '$300.00');
});
