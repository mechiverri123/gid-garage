// End-to-end tests of the deterministic operations Jarvis calls, against the
// in-memory Supabase fake. Numbered comments map to the Telegram bug report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOps, patchVerified } from '../functions/_lib/business-data.js';
import { fakeSupabase } from './fake-supabase.js';
import { seed, NOW, JILL_VIN } from './fixtures.js';

const setup = () => {
  const db = fakeSupabase(seed());
  return { db, ops: createBusinessOps({ sbGet: db.sbGet, sbPatch: db.sbPatch, sbInsert: db.sbInsert, now: () => NOW }) };
};

// ---- Bug 1: which jobs make the difference between two periods -------------

test('1: this month vs last 30 days names the exact job behind the gap', async () => {
  const { ops } = setup();
  const month = await ops.revenueSummary({ period: 'this_month', include_contributions: true });
  const last30 = await ops.revenueSummary({ period: 'last_30_days' });
  assert.equal(month.grossCollected, '$250.00');
  assert.equal(last30.grossCollected, '$905.00');
  assert.deepEqual(month.contributions.map(c => [c.bookingId, c.collected]), [['S1', '$250.00']]);

  const cmp = await ops.comparePeriods({ period_a: 'this_month', period_b: 'last_30_days' });
  assert.equal(cmp.collectedDifference, '$655.00');
  assert.equal(cmp.netProfitDifference, '$450.00'); // 655 − 55 tax − 150 parts
  assert.deepEqual(cmp.differences.map(d => [d.bookingId, d.customer, d.where, d.collectedDifference, d.paymentDatesInB]),
    [['A1', 'Tom Reyes', 'only_in_b', '$655.00', ['2026-08-30T18:00:00Z']]]);
  assert.equal(cmp.sharedJobsWithSameAmounts, 1); // Sergei's job is in both
});

// ---- Bugs 2 & 3: Jill's vehicle / VIN come from her bookings -----------------

test('2/3: Jill context carries the real vehicle and the booking VIN even though the customer VIN is blank', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: "jill castle's" });
  assert.equal(ctx.status, 'resolved');
  assert.deepEqual(ctx.vehicleRecords.map(v => [v.vehicle, v.vin, v.vinStatus]), [['2017 Acura RDX', JILL_VIN, 'consistent']]);
  assert.deepEqual(ctx.vehicleRecords[0].vins[0].sources.sort(), ['J1', 'J2', 'J3']);
  assert.equal(ctx.lastVisitJobId, 'J2');
  const lastVisit = ctx.jobsChronological.find(j => j.id === 'J2');
  assert.equal(lastVisit.mileage, '84,950');
  assert.ok(!JSON.stringify(ctx).includes('Civic'));
  assert.ok(!JSON.stringify(ctx).includes('Camry')); // Jill Moreno's car never leaks in
});

test('2: job detail for the anchored booking returns only that booking\'s vehicle', async () => {
  const { ops } = setup();
  const d = await ops.jobDetail({ job_id: 'J2' });
  assert.equal(d.id, 'J2');
  assert.equal(d.vehicle, '2017 Acura RDX');
  assert.equal(d.vin, JILL_VIN);
  assert.deepEqual(d.inspection.dtcCodes.map(c => c.code), ['P0562']);
});

// ---- Bug 4: Lisa exists only in notes ---------------------------------------

test('4: a person who only exists in notes resolves from the notes, not as "not a customer"', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: 'Lisa' });
  assert.equal(ctx.status, 'resolved');
  assert.deepEqual(ctx.customer.foundIn, ['note']);
  assert.equal(ctx.jobCount, 0);
  assert.match(ctx.note, /only appears in owner notes/);
  assert.equal(ctx.latestOwnerNote.id, 'N2'); // "what did I last say about Lisa"
  assert.deepEqual(ctx.openItems.map(o => [o.type, o.noteId, o.tentative_timing]), [['owner_note_action', 'N2', 'sometime next week']]);
});

// ---- Bug 6: Red only exists as a booking ------------------------------------

test('6: "Red" resolves from the booking with no customers row', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: 'Red' });
  assert.equal(ctx.status, 'resolved');
  assert.deepEqual(ctx.customer.foundIn, ['booking']);
  const job = ctx.jobsChronological[0];
  assert.equal(job.vehicle, '2021 Chevrolet Blazer 3.6L V6 RS');
  assert.match(job.bookingRequest.text, /steering felt tight, performing SAS Reset/);
  assert.equal(ctx.vehicleRecords[0].vin, '3GNKBKRS1MS564507');
  const people = await ops.findPeople({ query: 'Red' });
  assert.deepEqual(people.people.map(p => p.name), ['Red']);
});

// ---- Bugs 5 & 7: Ranger search and Sergei's rich evidence --------------------

test('5: "the last Ranger job" searches real Ranger bookings and reports several owners', async () => {
  const { ops } = setup();
  const r = await ops.vehicleJobs({ vehicle: 'Ranger' });
  assert.deepEqual(r.jobs.map(j => j.id).sort(), ['R1', 'SW1']);
  assert.deepEqual(r.distinctCustomers.sort(), ['Richard Lee', 'Sean Webb']);
  assert.match(r.note, /Several customers/);
});

test('7/14: Sergei\'s "General Inquiry" job is described from photo notes and the pre-scan', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: 'Sergei' });
  const job = ctx.jobsChronological[0];
  assert.equal(job.serviceCategory.generic, true);
  assert.ok(job.photoNotes.some(n => n.includes('P2509')));
  assert.ok(job.photoNotes.some(n => n.includes('AC condensation')));
  assert.deepEqual(job.scanDocuments, ['Pre-scan report on file: Ram 3500 pre-scan.pdf']);
  assert.ok(job.hints.some(h => h.includes('never as "General Inquiry"')));
  assert.ok(!JSON.stringify(ctx).includes('Ranger'));
});

// ---- Bug 8: estimate total includes tax --------------------------------------

test('8: Richard\'s estimate is the customer-facing $409.11, subtotal $392.40 kept separate', async () => {
  const { ops } = setup();
  const d = await ops.jobDetail({ job_id: 'R1' });
  assert.equal(d.money.estimateTotal, 409.11);
  assert.equal(d.money.estimateSubtotal, 392.4);
  assert.equal(d.money.estimateTax, 16.71);
  assert.equal(d.money.estimate, undefined); // no ambiguous field left
});

// ---- Bugs 9, 10: cancellation = the admin transition, verified -----------------

test('9: cancel_job previews, then writes exactly the admin fields and reads them back', async () => {
  const { db, ops } = setup();
  const preview = await ops.cancelJob({ job_id: 'R1', reason: 'customer cancelled' });
  assert.equal(preview.needs_confirmation, true);
  assert.equal(db.writes.length, 0);

  const done = await ops.cancelJob({ job_id: 'R1', reason: 'customer cancelled', confirmed: true });
  assert.equal(done.ok, true);
  assert.equal(done.verified, true);
  assert.deepEqual(done.changed, { job_status: { before: 'ESTIMATE_SENT', after: 'CANCELLED' }, status: { before: 'confirmed', after: 'cancelled' } });
  const row = db.tables.bookings.find(r => r.id === 'R1');
  assert.equal(row.job_status, 'CANCELLED');
  assert.equal(row.status, 'cancelled');
  assert.equal(done.reasonNote.saved, true);
  assert.match(db.tables.jarvis_business_notes.at(-1).raw_text, /R1 cancelled via Jarvis\. Reason: customer cancelled/);

  const after = await ops.jobDetail({ job_id: 'R1' });
  assert.equal(after.status, 'CANCELLED');
  // Issue 2 (4th pass): cancelling again is idempotent — no prompt, no write, reports the prior reason.
  const writesBefore = db.writes.length;
  for (const confirmed of [false, true]) {
    const again = await ops.cancelJob({ job_id: 'R1', reason: 'customer cancelled', confirmed });
    assert.deepEqual([again.ok, again.changed, again.already_cancelled, again.needs_confirmation], [true, false, true, undefined]);
    assert.equal(again.existing_reason, 'customer cancelled');
  }
  assert.equal(db.writes.length, writesBefore);
  const reopened = await ops.reopenJob({ job_id: 'R1', confirmed: true });
  assert.deepEqual(reopened.changed.job_status, { before: 'CANCELLED', after: 'BOOKED' });
});

test('10: a write that matches nothing or fails is an error, never a success', async () => {
  const { db, ops } = setup();
  await assert.rejects(ops.cancelJob({ job_id: 'NOPE', confirmed: true }), /No job found/);
  await assert.rejects(patchVerified(db.sbPatch, 'bookings', 'NOPE', { job_status: 'CANCELLED' }), /Write not applied: expected 1 bookings row/);
  const lying = async () => [{ id: 'R1', job_status: 'ESTIMATE_SENT' }]; // DB ignored the change
  await assert.rejects(patchVerified(lying, 'bookings', 'R1', { job_status: 'CANCELLED' }), /Write not confirmed/);
  db.failPatch = true;
  await assert.rejects(ops.cancelJob({ job_id: 'R1', confirmed: true }), /simulated database error/);
  assert.equal(db.tables.bookings.find(r => r.id === 'R1').job_status, 'ESTIMATE_SENT');
});

// ---- Bug 11: payments ---------------------------------------------------------

test('11: payment preview, partial write with history, duplicate and overpayment refused, PAID only at zero', async () => {
  const { db, ops } = setup();
  const preview = await ops.recordPayment({ job_id: 'M1', amount: 10, method: 'Cash' });
  assert.equal(preview.needs_confirmation, true);
  assert.match(preview.summary, /\$10\.00 Cash payment .* of \$85\.00; after this \$10\.00, leaving \$75\.00 owed/);
  assert.equal(db.writes.length, 0);

  const partial = await ops.recordPayment({ job_id: 'M1', amount: 10, method: 'Cash', confirmed: true });
  assert.equal(partial.verified, true);
  assert.equal(partial.status, 'INVOICED');
  assert.equal(partial.invoiceTotalInclTax, '$85.00');
  let row = db.tables.bookings.find(r => r.id === 'M1');
  assert.equal(row.amount_paid, 10);
  assert.equal(JSON.parse(row.payments).length, 1);

  await assert.rejects(ops.recordPayment({ job_id: 'M1', amount: 10, method: 'Cash', confirmed: true }), /duplicate/);
  await assert.rejects(ops.recordPayment({ job_id: 'M1', amount: 80, method: 'Cash', confirmed: true }), /more than the \$75\.00 balance/);

  const final = await ops.recordPayment({ job_id: 'M1', amount: 75, method: 'Zelle', confirmed: true });
  assert.equal(final.status, 'PAID');
  row = db.tables.bookings.find(r => r.id === 'M1');
  assert.equal(row.amount_paid, 85);
  assert.equal(JSON.parse(row.payments).length, 2);
});

// ---- existing coverage ----------------------------------------------------------

test('ambiguous first name asks instead of guessing', async () => {
  const { ops } = setup();
  const ctx = await ops.customerContext({ query: 'Jill' });
  assert.equal(ctx.status, 'ambiguous');
  assert.deepEqual(ctx.candidates.map(c => c.name).sort(), ['Jill Castle', 'Jill Moreno']);
});

test('"each one" re-reads the previous lead list with each follow-up reason', async () => {
  const { ops } = setup();
  const r = await ops.resultSetDetails({ type: 'leads', ids: ['L3', 'L4'] });
  assert.deepEqual(r.items.map(l => [l.name, l.followUpReason]).sort(), [['Dana Ortiz', 'uncontacted_over_24h'], ['Mo Khan', 'follow_up_due']]);
});

test('unpaid and action center use the canonical rules', async () => {
  const { ops } = setup();
  const unpaid = await ops.unpaidSummary();
  assert.deepEqual(unpaid.jobs.map(j => [j.id, j.balance]).sort(), [['J2', '$120.00'], ['M1', '$85.00'], ['RD1', '$90.00']]);
  const q = await ops.actionCenter();
  assert.deepEqual(q.urgent.filter(a => a.type === 'lead_followup').map(a => a.id).sort(), ['L3', 'L4']);
  assert.ok(q.waiting_on.some(w => w.type === 'estimate_approval' && w.id === 'R1'));
});

test('take-home uses stored owner-pay settings including overhead items', async () => {
  const { ops } = setup();
  const t = await ops.ownerPaySummary({ period: 'last_30_days' });
  assert.equal(t.overhead, '$300.00');
});

test('13: data health labels a shared phone as possible, with a manual check', async () => {
  const db = fakeSupabase({ ...seed(), customers: [{ id: 'p1', fname: 'Priya', lname: 'Osprey12', phone: '9285550000' }, { id: 'p2', fname: 'Priya', lname: 'Falcon99', phone: '(928) 555-0000' }] });
  const ops = createBusinessOps({ sbGet: db.sbGet, sbPatch: db.sbPatch, now: () => NOW });
  const h = await ops.dataHealth();
  const phone = h.issues.find(i => i.type === 'shared_phone_number');
  assert.equal(phone.confidence, 'possible');
  assert.match(phone.detail, /may be one person split across records, or legitimately shared/);
});
