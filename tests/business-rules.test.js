import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planPayment, leadStatusUpdate, leadFollowUpReason, unpaidJobs, dataHealthIssues, buildActionQueue,
  isValidYmd, isValidApptTime, jobBalance, isAwaitingPayment,
} from '../shared/business-rules.js';
import { collectedRevenue, resolvePeriodWindow } from '../shared/business-metrics.js';

const NOW = new Date('2026-09-27T19:00:00Z'); // noon Sept 27, Arizona
const HOUR = 3600000;

const invoiced = over => ({
  id: 'J1', fname: 'Jill', lname: 'Castle', jobStatus: 'INVOICED', invoiceAmount: 500, taxAmount: 40,
  amountPaid: 250, payments: [{ amount: 250, at: '2026-09-05T17:00:00Z', method: 'Cash' }], ...over,
});

// ---- payment writes ---------------------------------------------------------

test('partial payment appends to history and keeps INVOICED', () => {
  const { fields, preview } = planPayment(invoiced(), { amount: 100, method: 'Zelle', now: NOW });
  assert.equal(fields.amount_paid, 350);
  assert.equal(JSON.parse(fields.payments).length, 2);
  assert.equal(fields.job_status, undefined); // already INVOICED
  assert.equal(fields.paid_at, undefined);
  assert.equal(preview.balanceAfter, 190);
  assert.equal(preview.fullyPaid, false);
});

test('final payment marks PAID with paid_at, completed status and a manual transaction id', () => {
  const { fields, preview } = planPayment(invoiced(), { amount: 290, method: 'Cash', now: NOW });
  assert.equal(fields.amount_paid, 540);
  assert.equal(fields.job_status, 'PAID');
  assert.equal(fields.status, 'completed');
  assert.equal(fields.paid_at, NOW.toISOString());
  assert.equal(fields.stripe_transaction_id, 'Manual — Cash');
  assert.equal(preview.balanceAfter, 0);
});

test('payment on a not-yet-invoiced job moves it to INVOICED when not fully paid', () => {
  const { fields } = planPayment(invoiced({ jobStatus: 'IN_PROGRESS', amountPaid: 0, payments: [] }), { amount: 100, method: 'Cash', now: NOW });
  assert.equal(fields.job_status, 'INVOICED');
});

test('recorded payments are never double counted in revenue', () => {
  const job = invoiced();
  const { fields } = planPayment(job, { amount: 290, method: 'Cash', now: NOW });
  const after = { ...job, jobStatus: fields.job_status, paidAt: fields.paid_at, amountPaid: fields.amount_paid, payments: JSON.parse(fields.payments) };
  const month = resolvePeriodWindow('this_month', NOW).inWindow;
  assert.equal(collectedRevenue([after], month).total, 540); // 250 + 290, no fallback on top
});

test('payment guards refuse unsafe writes', () => {
  const bad = (job, args, re) => assert.throws(() => planPayment(job, { method: 'Cash', now: NOW, ...args }), re);
  bad(invoiced(), { amount: 0 }, /positive/);
  bad(invoiced(), { amount: 50, method: 'Bitcoin' }, /method/);
  bad(invoiced(), { amount: 300 }, /more than the \$290\.00 balance/);
  bad(invoiced({ invoiceAmount: null }), { amount: 50 }, /no invoice amount/);
  bad(invoiced({ jobStatus: 'PAID' }), { amount: 50 }, /already marked PAID/);
  bad(invoiced({ status: 'cancelled' }), { amount: 50 }, /cancelled/);
  bad(invoiced({ amountPaid: 300 }), { amount: 50 }, /disagree/);
  bad(invoiced({ amountPaid: 540, payments: [{ amount: 540, at: '2026-09-01T00:00:00Z' }] }), { amount: 1 }, /no balance/);
  const recent = invoiced({ amountPaid: 350, payments: [{ amount: 250, at: '2026-09-05T17:00:00Z' }, { amount: 100, at: new Date(NOW.getTime() - 60000).toISOString() }] });
  bad(recent, { amount: 100 }, /duplicate/);
});

// ---- leads --------------------------------------------------------------------

test('lead status updates only stamp contact time when contact happened', () => {
  assert.equal(leadStatusUpdate('lost', NOW).last_contacted_at, undefined);
  assert.equal(leadStatusUpdate('booked', NOW).last_contacted_at, undefined);
  assert.equal(leadStatusUpdate('Contacted', NOW).last_contacted_at, NOW.toISOString());
  assert.equal(leadStatusUpdate('quoted', NOW).status, 'quoted');
  assert.throws(() => leadStatusUpdate('maybe', NOW), /must be one of/);
});

test('lead follow-up rule', () => {
  const at = h => new Date(NOW.getTime() - h * HOUR).toISOString();
  assert.equal(leadFollowUpReason({ status: 'booked', created_at: at(100) }, NOW), null);
  assert.equal(leadFollowUpReason({ status: 'lost', follow_up_at: at(1), created_at: at(100) }, NOW), null);
  assert.equal(leadFollowUpReason({ status: 'contacted', follow_up_at: at(1), created_at: at(100), last_contacted_at: at(50) }, NOW), 'follow_up_due');
  assert.equal(leadFollowUpReason({ status: 'new', created_at: at(25) }, NOW), 'uncontacted_over_24h');
  assert.equal(leadFollowUpReason({ status: 'new', created_at: at(2) }, NOW), null);
  assert.equal(leadFollowUpReason({ status: 'contacted', created_at: at(200), last_contacted_at: at(100) }, NOW), null);
  assert.equal(leadFollowUpReason({ status: 'new', created_at: at(100), follow_up_at: new Date(NOW.getTime() + HOUR).toISOString() }, NOW), 'uncontacted_over_24h');
});

// ---- unpaid ---------------------------------------------------------------------

test('unpaid: completed-not-invoiced uses estimate, balance includes tax, cancelled and zero balances excluded', () => {
  const jobs = [
    { id: 'A', jobStatus: 'COMPLETED', invoiceAmount: null, estimateAmount: 200, taxAmount: 10, amountPaid: null },
    { id: 'B', jobStatus: 'INVOICED', invoiceAmount: 500, taxAmount: 40, amountPaid: 500 }, // owes the tax
    { id: 'C', jobStatus: 'INVOICED', status: 'cancelled', invoiceAmount: 100, taxAmount: 0, amountPaid: 0 },
    { id: 'D', jobStatus: 'INVOICED', invoiceAmount: 100, taxAmount: 0, amountPaid: 100 },
    { id: 'E', jobStatus: 'PAID', invoiceAmount: 100, taxAmount: 0, amountPaid: 0 },
  ];
  const u = unpaidJobs(jobs);
  assert.deepEqual(u.map(x => [x.job.id, x.balance, x.invoiced]), [['A', 210, false], ['B', 40, true]]);
  assert.equal(isAwaitingPayment(jobs[3]), true); // dashboard still counts it as Unpaid / Due
  assert.equal(jobBalance(jobs[3]), 0);
});

// ---- data health ---------------------------------------------------------------

test('data health flags each inconsistency class and nothing on clean rows', () => {
  const jobs = [
    { id: 'p1', jobStatus: 'PAID', paidAt: null, invoiceAmount: 100, taxAmount: 0, amountPaid: 100, payments: [] },
    { id: 'p2', jobStatus: 'PAID', paidAt: '2026-09-01T00:00:00Z', invoiceAmount: null, taxAmount: null, amountPaid: null, payments: [] },
    { id: 'm1', jobStatus: 'INVOICED', invoiceAmount: 300, taxAmount: 0, amountPaid: 200, payments: [{ amount: 100, at: '2026-09-01T00:00:00Z' }] },
    { id: 'o1', jobStatus: 'INVOICED', invoiceAmount: 100, taxAmount: 0, amountPaid: 150, payments: [] },
    { id: 'f1', jobStatus: 'INVOICED', invoiceAmount: 100, taxAmount: 10, amountPaid: 110, payments: [] },
    { id: 'b1', jobStatus: 'PAID', paidAt: '2026-09-01T00:00:00Z', invoiceAmount: 100, taxAmount: 10, amountPaid: 90, payments: [] },
    { id: 's1', jobStatus: 'BOOKED', date: '2026-09-20', dateTbd: false },
    { id: 'ok', jobStatus: 'PAID', paidAt: '2026-09-01T00:00:00Z', invoiceAmount: 100, taxAmount: 0, amountPaid: 100, payments: [{ amount: 100, at: '2026-09-01T00:00:00Z' }] },
    { id: 'tbd', jobStatus: 'BOOKED', date: '2026-09-20', dateTbd: true },
    { id: 'x', status: 'cancelled', jobStatus: 'PAID', paidAt: null },
  ].map(j => ({ partsCost: 0, ...j })); // parts recorded ($0) — the parts checklist has its own test
  const leads = [{ id: 'l1', status: 'booked', booking_id: null }, { id: 'l2', status: 'booked', booking_id: 'GID-1' }];
  const reminders = [
    { id: 'r1', status: 'open', notified_at: null, due_at: new Date(NOW.getTime() - HOUR).toISOString(), title: 'call parts' },
    { id: 'r2', status: 'open', notified_at: null, due_at: new Date(NOW.getTime() - 60000).toISOString(), title: 'just due' },
  ];
  const customers = [{ id: 'c1', phone: '(928) 555-0100' }, { id: 'c2', phone: '928-555-0100' }, { id: 'c3', phone: '9285550199' }];
  const types = dataHealthIssues({ jobs, leads, reminders, customers }, NOW).map(i => `${i.type}:${i.id}`).sort();
  assert.deepEqual(types, [
    'booked_lead_without_booking:l1',
    'fully_paid_not_marked_paid:f1',
    'fully_paid_not_marked_paid:o1', // overpaid AND not marked PAID — both are true
    'overpaid:o1',
    'paid_with_balance:b1',
    'paid_without_amount:p2',
    'paid_without_paid_at:p1',
    'past_appointment_pre_service:s1',
    'payment_history_mismatch:m1',
    'reminder_not_delivered:r1',
    'shared_phone_number:c1,c2',
  ]);
  // Bug 13: a shared phone is only a possible duplicate, never stated as fact.
  const phone = dataHealthIssues({ customers }, NOW)[0];
  assert.equal(phone.confidence, 'possible');
  assert.match(phone.detail, /Possible duplicate or shared contact/);
  assert.match(phone.suggested_manual_check, /legitimately shared/);
  assert.ok(dataHealthIssues({ jobs, leads, reminders, customers }, NOW).every(i => i.severity && i.confidence && i.evidence && i.suggested_manual_check));
});

// ---- action queue -----------------------------------------------------------------

test('action queue: ranked items, waiting_on and tomorrow blockers come only from real rows', () => {
  const q = buildActionQueue({
    jobs: [
      { id: 't1', fname: 'Richard', lname: 'Lee', jobStatus: 'ESTIMATE_SENT', date: '2026-09-28', time: 'TBD', vehicle: '2011 Ford Ranger', phone: '9285550100', serviceAddress: '' },
      { id: 'u1', fname: 'Jill', lname: 'Castle', jobStatus: 'INVOICED', invoiceAmount: 100, taxAmount: 8, amountPaid: 0, date: '2026-09-20' },
      { id: 's1', fname: 'Old', lname: 'Job', jobStatus: 'BOOKED', date: '2026-09-10' },
    ],
    leads: [
      { id: 'l1', fname: 'Lisa', status: 'quoted', quote_amount: 90, created_at: '2026-09-26T00:00:00Z', last_contacted_at: '2026-09-26T00:00:00Z' },
      { id: 'l2', fname: 'New', status: 'new', created_at: '2026-09-20T00:00:00Z' },
    ],
    reminders: [{ id: 'r1', status: 'open', title: 'Order parts', due_at: '2026-09-27T18:00:00Z' }],
    notes: [{ id: 'n1', status: 'open', contact_name: 'Richard', summary: "Richard's Ranger estimate sent, waiting on him to confirm Tuesday", preferred_timing: 'Tuesday (tentative)' }],
  }, NOW);

  assert.deepEqual(q.urgent.map(a => a.type).sort(), ['lead_followup', 'reminder', 'unpaid']);
  assert.ok(q.soon.some(a => a.type === 'stale_job_status' && a.id === 's1'));
  assert.deepEqual(q.waiting_on.map(w => `${w.type}:${w.id}`).sort(), ['estimate_approval:t1', 'owner_note:n1', 'payment:u1', 'quote_decision:l1']);
  assert.equal(q.waiting_on.find(w => w.id === 'n1').tentative_timing, 'Tuesday (tentative)');
  assert.deepEqual(q.tomorrow_blockers, [{
    id: 't1', customer: 'Richard Lee', time: 'TBD', vehicle: '2011 Ford Ranger',
    blockers: ['missing appointment time', 'missing service address', 'estimate sent but not approved yet'],
  }]);
  assert.ok(q.urgent.find(a => a.type === 'unpaid').detail.includes('$108.00'));
});

test('date and time validation for reschedules', () => {
  assert.equal(isValidYmd('2026-02-29'), false);
  assert.equal(isValidYmd('2028-02-29'), true);
  assert.equal(isValidYmd('09/28/2026'), false);
  for (const t of ['11:00 AM', '9:30 pm', '13:00', 'TBD']) assert.equal(isValidApptTime(t), true, t);
  for (const t of ['25:00', 'noonish', '13:00 PM', '']) assert.equal(isValidApptTime(t), false, t);
});

// ---- Bug 8: explicit estimate/invoice totals; Bug 9: admin cancel transition ----

import { jobMoney, cancelJobPlan, reopenJobPlan } from '../shared/business-rules.js';

test('8: estimate total is customer-facing (subtotal + tax); subtotal only by name', () => {
  const m = jobMoney({ jobStatus: 'ESTIMATE_SENT', estimateAmount: 392.40, taxAmount: 16.71, invoiceAmount: null });
  assert.equal(m.estimateTotal, 409.11);
  assert.equal(m.estimateSubtotal, 392.4);
  assert.equal(m.estimateTax, 16.71);
  assert.equal(m.invoiceTotal, null);
  assert.equal(m.balanceDue, 409.11);
  const inv = jobMoney({ jobStatus: 'INVOICED', estimateAmount: 392.40, invoiceAmount: 380, taxAmount: 16.71, amountPaid: 100 });
  assert.equal(inv.invoiceTotal, 396.71);
  assert.equal(inv.balanceDue, 296.71);
  assert.equal(jobMoney({ jobStatus: 'PAID', invoiceAmount: 100, taxAmount: 5, amountPaid: 105 }).balanceDue, 0);
});

test('9: cancel/reopen write exactly what the admin buttons write', () => {
  assert.deepEqual(cancelJobPlan({ jobStatus: 'ESTIMATE_SENT', status: 'confirmed' }).fields, { job_status: 'CANCELLED', status: 'cancelled' });
  assert.throws(() => cancelJobPlan({ jobStatus: 'PAID' }), /PAID/);
  assert.throws(() => cancelJobPlan({ jobStatus: 'CANCELLED' }), /already cancelled/);
  assert.deepEqual(reopenJobPlan({ jobStatus: 'CANCELLED', status: 'cancelled' }).fields, { job_status: 'BOOKED', status: 'confirmed' });
});

test('parts checklist: done jobs with a blank parts cost; $0 means no parts; cancelled/open jobs ignored', async () => {
  const { needsPartsCost, dataHealthIssues } = await import('../shared/business-rules.js');
  assert.equal(needsPartsCost({ jobStatus: 'PAID', partsCost: null }), true);
  assert.equal(needsPartsCost({ jobStatus: 'INVOICED' }), true);
  assert.equal(needsPartsCost({ jobStatus: 'PAID', partsCost: 0 }), false);
  assert.equal(needsPartsCost({ jobStatus: 'PAID', partsCost: 42.5 }), false);
  assert.equal(needsPartsCost({ jobStatus: 'BOOKED', partsCost: null }), false);
  assert.equal(needsPartsCost({ jobStatus: 'PAID', partsCost: null, status: 'cancelled' }), false);
  const issues = dataHealthIssues({ jobs: [{ id: 'a', fname: 'Jill', jobStatus: 'PAID', paidAt: '2026-09-01T00:00:00Z', amountPaid: 100, invoiceAmount: 100, partsCost: null }] }, new Date('2026-09-30T12:00:00Z'));
  assert.ok(issues.some(i => i.type === 'parts_cost_missing' && i.id === 'a'));
});

test('repeating reminders: "Repeats every N days/weeks" in notes; next due skips missed cycles', async () => {
  const { reminderRepeatDays, nextRepeatDue } = await import('../shared/business-rules.js');
  assert.equal(reminderRepeatDays('Upload the files. Repeats every 14 days.'), 14);
  assert.equal(reminderRepeatDays('repeats every 2 weeks'), 14);
  assert.equal(reminderRepeatDays('call Jill'), null);
  assert.equal(nextRepeatDue('2026-10-02T16:00:00.000Z', 14, new Date('2026-10-02T16:01:00Z')), '2026-10-16T16:00:00.000Z');
  // Worker was down for a month: the next one is the first future cycle, not a backlog.
  assert.equal(nextRepeatDue('2026-10-02T16:00:00.000Z', 14, new Date('2026-11-01T00:00:00Z')), '2026-11-13T16:00:00.000Z');
});
