// Canonical GID Garage business rules (non-money-period ones): statuses,
// unpaid, lead follow-up, payment writes, data health, and the owner action
// queue. Pure functions over the camelCase Job shape from jobFromRow(); leads,
// reminders and notes are raw Supabase rows. Tests: tests/business-rules.test.js.
//
// Jarvis (web/Telegram), the proactive worker, the voice backend endpoint and
// the dashboard all use these so "unpaid" or "needs follow-up" means the same
// thing everywhere.

import { phoenixDateParts, parsePayments } from './business-metrics.js';

export const JOB_STATUSES = ['BOOKED', 'ESTIMATE_SENT', 'SIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'];
// Statuses update_job_status may set. PAID goes through recordPayment;
// CANCELLED stays a dashboard action.
export const SETTABLE_JOB_STATUSES = ['BOOKED', 'ESTIMATE_SENT', 'SIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED'];
export const PRE_SERVICE_STATUSES = ['BOOKED', 'ESTIMATE_SENT', 'SIGNED'];
export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost', 'no_response'];
export const CLOSED_LEAD_STATUSES = ['booked', 'lost'];
// Setting one of these statuses asserts the owner actually reached the lead.
export const CONTACT_LEAD_STATUSES = ['contacted', 'quoted'];
export const PAYMENT_METHODS = ['Cash', 'Check', 'Zelle', 'Card (Stripe)', 'Other'];
export const STALE_LEAD_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_PAYMENT_MS = 10 * 60 * 1000;
const REMINDER_DELIVERY_GRACE_MS = 10 * 60 * 1000;

const num = v => Number(v || 0);
const round2 = n => Math.round(n * 100) / 100;
const fullName = r => `${r?.fname || ''} ${r?.lname || ''}`.trim();

// ---- time ----------------------------------------------------------------

export function phoenixToday(now = new Date()) {
  const p = phoenixDateParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function isValidYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Stored appointment times look like "11:00 AM", "13:00" or "TBD".
export function isValidApptTime(s) {
  const t = String(s || '').trim();
  return /^TBD$/i.test(t) || /^(0?[1-9]|1[0-2]):[0-5]\d\s?[AP]M$/i.test(t) || /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
}

// ---- jobs ----------------------------------------------------------------

export function isCancelled(job) {
  return String(job?.status || '').toLowerCase() === 'cancelled' || job?.jobStatus === 'CANCELLED';
}

// What the customer owes in total: invoice (or estimate before invoicing) + tax.
export function jobTotalDue(job) {
  return round2(num(job.invoiceAmount ?? job.estimateAmount) + num(job.taxAmount));
}

export function jobBalance(job) {
  return Math.max(0, round2(jobTotalDue(job) - num(job.amountPaid)));
}

// Every money figure on a job, named so nobody has to guess which column is
// customer-facing. estimate/invoice_amount are PRE-TAX subtotals; tax_amount is
// the job's tax (from taxable line items). Customer-facing totals include tax —
// the estimate page and invoice both show subtotal + tax.
export function jobMoney(job) {
  const tax = job.taxAmount == null ? null : round2(num(job.taxAmount));
  const withTax = sub => (sub == null ? null : round2(num(sub) + num(tax)));
  const out = {
    estimateSubtotal: job.estimateAmount == null ? null : round2(num(job.estimateAmount)),
    estimateTax: job.estimateAmount == null ? null : tax,
    estimateTotal: withTax(job.estimateAmount),
    invoiceSubtotal: job.invoiceAmount == null ? null : round2(num(job.invoiceAmount)),
    invoiceTax: job.invoiceAmount == null ? null : tax,
    invoiceTotal: withTax(job.invoiceAmount),
    amountPaid: job.amountPaid == null ? null : round2(num(job.amountPaid)),
    balanceDue: null,
  };
  if (!isCancelled(job) && job.jobStatus !== 'PAID' && (job.invoiceAmount != null || job.estimateAmount != null)) out.balanceDue = jobBalance(job);
  if (job.jobStatus === 'PAID') out.balanceDue = 0;
  return out;
}

// Exactly what the admin "Mark as Cancelled" / "Reopen Job" buttons write
// (JobOps.tsx setJobStatus): both columns, so the calendar and pipeline agree.
export function cancelJobPlan(job) {
  if (isCancelled(job)) throw new Error('This job is already cancelled.');
  if (job.jobStatus === 'PAID') throw new Error('This job is PAID; cancelling it would pull a paid job out of the books. Do that in the dashboard if it is really intended.');
  return { fields: { job_status: 'CANCELLED', status: 'cancelled' }, before: { job_status: job.jobStatus ?? null, status: job.status ?? null } };
}

export function reopenJobPlan(job) {
  if (!isCancelled(job)) throw new Error('This job is not cancelled.');
  return { fields: { job_status: 'BOOKED', status: 'confirmed' }, before: { job_status: job.jobStatus ?? null, status: job.status ?? null } };
}

// Work is done but the job isn't PAID. Same set as the dashboard's "Unpaid / Due".
export function isAwaitingPayment(job) {
  return !isCancelled(job) && (job.jobStatus === 'COMPLETED' || job.jobStatus === 'INVOICED');
}

export function unpaidJobs(jobs) {
  return jobs
    .filter(isAwaitingPayment)
    .map(job => ({ job, balance: jobBalance(job), invoiced: job.invoiceAmount != null }))
    .filter(u => u.balance > 0.01);
}

// Value of a scheduled job for "booked today"-style numbers: what was paid once
// paid, otherwise invoice/estimate + tax. NOT collected revenue.
export function bookedValue(job) {
  if (job.paidAt && job.amountPaid != null) return num(job.amountPaid);
  return jobTotalDue(job);
}

export function jobsOnDate(jobs, ymd) {
  return jobs.filter(j => j.date === ymd && !isCancelled(j));
}

// ---- leads ---------------------------------------------------------------

// Why a lead needs the owner, or null. One rule for every surface.
export function leadFollowUpReason(lead, now = new Date()) {
  if (CLOSED_LEAD_STATUSES.includes(String(lead.status || '').toLowerCase())) return null;
  const nowMs = now.getTime();
  const followMs = lead.follow_up_at ? new Date(lead.follow_up_at).getTime() : null;
  if (followMs != null && Number.isFinite(followMs) && followMs <= nowMs) return 'follow_up_due';
  const createdMs = new Date(lead.created_at).getTime();
  if (!lead.last_contacted_at && Number.isFinite(createdMs) && nowMs - createdMs > STALE_LEAD_MS) return 'uncontacted_over_24h';
  return null;
}

// Fields update_lead_status may write. Contact time is only stamped when the
// new status itself says contact happened.
export function leadStatusUpdate(status, now = new Date()) {
  const s = String(status || '').toLowerCase().trim();
  if (!LEAD_STATUSES.includes(s)) throw new Error(`Lead status must be one of: ${LEAD_STATUSES.join(', ')}.`);
  const fields = { status: s, updated_at: now.toISOString() };
  if (CONTACT_LEAD_STATUSES.includes(s)) fields.last_contacted_at = now.toISOString();
  return fields;
}

// ---- payment writes --------------------------------------------------------

// Plan a payment exactly the way the dashboard's "Record a Payment" does:
// append to payments[], add to amount_paid, and mark PAID only once the
// invoice + tax is covered. Refuses anything that would double-count or
// compound an existing inconsistency. Returns { fields, preview } or throws.
export function planPayment(job, { amount, method = 'Other', stripeId = '', note = '', now = new Date() }) {
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Payment amount must be a positive number.');
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`);
  if (isCancelled(job)) throw new Error('This job is cancelled; record payments on it in the dashboard if that is really intended.');
  if (job.invoiceAmount == null) throw new Error('This job has no invoice amount yet. Set the invoice in the dashboard first so tax and the total are right.');

  const payments = parsePayments(job.payments);
  const loggedTotal = round2(payments.reduce((s, p) => s + num(p?.amount), 0));
  const paidSoFar = round2(num(job.amountPaid));
  if (payments.length && Math.abs(loggedTotal - paidSoFar) > 0.01) {
    throw new Error(`Payment history ($${loggedTotal.toFixed(2)}) and amount paid ($${paidSoFar.toFixed(2)}) disagree on this job. Fix it in the dashboard before recording more.`);
  }
  const totalDue = round2(num(job.invoiceAmount) + num(job.taxAmount));
  const balanceBefore = round2(totalDue - paidSoFar);
  if (job.jobStatus === 'PAID') throw new Error('This job is already marked PAID.');
  if (balanceBefore <= 0.01) throw new Error('This job has no balance left; nothing to record.');
  if (amt > balanceBefore + 0.01) throw new Error(`$${amt.toFixed(2)} is more than the $${balanceBefore.toFixed(2)} balance.`);
  const dup = payments.find(p => Math.abs(num(p?.amount) - amt) < 0.005 && Math.abs(now.getTime() - new Date(p?.at).getTime()) < DUPLICATE_PAYMENT_MS);
  if (dup) throw new Error(`A $${amt.toFixed(2)} payment was already recorded on this job at ${dup.at}. Not recording a duplicate.`);

  const payment = {
    id: Math.random().toString(36).slice(2),
    amount: amt,
    method,
    note: String(note || 'Recorded by Jarvis').slice(0, 500),
    at: now.toISOString(),
    ...(stripeId ? { stripeId: String(stripeId).trim() } : {}),
  };
  const newAmountPaid = round2(paidSoFar + amt);
  const fullyPaid = newAmountPaid >= totalDue - 0.01;
  // Stored as a JSON string, like the dashboard writes it.
  const fields = { payments: JSON.stringify([...payments, payment]), amount_paid: newAmountPaid };
  let resultingStatus = job.jobStatus;
  if (fullyPaid) {
    fields.job_status = resultingStatus = 'PAID';
    fields.status = 'completed';
    fields.paid_at = now.toISOString();
    if (!job.stripeTransactionId) fields.stripe_transaction_id = payment.stripeId || `Manual — ${method}`;
  } else if (job.jobStatus !== 'INVOICED' && job.jobStatus !== 'COMPLETED') {
    fields.job_status = resultingStatus = 'INVOICED';
  }
  return {
    fields,
    preview: {
      amount: amt, method, totalDue, paidBefore: paidSoFar, paidAfter: newAmountPaid,
      balanceAfter: Math.max(0, round2(totalDue - newAmountPaid)), fullyPaid, resultingStatus,
    },
  };
}

// ---- data health (read-only) ---------------------------------------------

// Read-only consistency findings. Each carries how sure we are and what to
// check by hand — a finding is a lead for the owner to review, not a verdict.
//   severity:   high (money/records wrong) | medium | low
//   confidence: certain (the stored values contradict each other)
//             | possible (could be legitimate — e.g. a shared family phone)
const HEALTH = {
  paid_without_paid_at: ['high', 'certain', 'Marked PAID but has no paid date, so it is missing from every revenue period.', 'Open the job and set the paid date, or re-record the payment.'],
  paid_without_amount: ['high', 'certain', 'Marked PAID with no amount paid, no payment history and no invoice total.', 'Check what was actually collected and record it.'],
  payment_history_mismatch: ['high', 'certain', null, 'Compare the payment history with amount paid on the job and correct whichever is wrong.'],
  overpaid: ['medium', 'certain', null, 'Check for a duplicate payment entry or a tip/extra charge that should be on the invoice.'],
  fully_paid_not_marked_paid: ['medium', 'certain', null, 'If the customer is paid up, mark the job PAID in the dashboard.'],
  paid_with_balance: ['medium', 'certain', null, 'Check whether a discount or write-off was intended, or a payment is missing.'],
  past_appointment_pre_service: ['low', 'certain', null, 'Update the job status (done, cancelled, or rescheduled).'],
  booked_lead_without_booking: ['low', 'certain', 'Lead is marked booked but is not linked to a booking.', 'Link the lead to its booking, or fix the lead status.'],
  reminder_not_delivered: ['medium', 'certain', null, 'Check the proactive cron / Telegram delivery.'],
  shared_phone_number: ['low', 'possible', null, 'Review manually: these may be one person split across records, or a legitimately shared phone (family, spouse, business line).'],
};

export function dataHealthIssues({ jobs = [], leads = [], reminders = [], customers = [] }, now = new Date()) {
  const issues = [];
  const add = (type, area, id, who, detail, evidence = {}) => {
    const [severity, confidence, defaultDetail, suggested_manual_check] = HEALTH[type];
    issues.push({ type, area, severity, confidence, id, who, detail: detail || defaultDetail, evidence, suggested_manual_check });
  };
  const today = phoenixToday(now);

  for (const j of jobs) {
    if (isCancelled(j)) continue;
    const who = fullName(j) || j.id;
    const payments = parsePayments(j.payments);
    const logged = round2(payments.reduce((s, p) => s + num(p?.amount), 0));
    const totalDue = round2(num(j.invoiceAmount) + num(j.taxAmount));
    const paid = j.amountPaid == null ? null : round2(num(j.amountPaid));
    const ev = { job_status: j.jobStatus, paid_at: j.paidAt || null, amount_paid: paid, invoice_total_incl_tax: j.invoiceAmount == null ? null : totalDue, payment_history_total: payments.length ? logged : null };

    if (j.jobStatus === 'PAID' && !j.paidAt) add('paid_without_paid_at', 'money', j.id, who, null, ev);
    if (j.jobStatus === 'PAID' && paid == null && !payments.length && totalDue <= 0) add('paid_without_amount', 'money', j.id, who, null, ev);
    if (payments.length && Math.abs(logged - num(paid)) > 0.01) add('payment_history_mismatch', 'money', j.id, who, `Payment history sums to $${logged.toFixed(2)} but amount paid is $${num(paid).toFixed(2)}.`, ev);
    if (j.invoiceAmount != null && paid != null && paid > totalDue + 0.01) add('overpaid', 'money', j.id, who, `Amount paid $${paid.toFixed(2)} is more than invoice + tax $${totalDue.toFixed(2)}.`, ev);
    if (j.jobStatus !== 'PAID' && j.invoiceAmount != null && totalDue > 0 && paid != null && paid >= totalDue - 0.01) add('fully_paid_not_marked_paid', 'money', j.id, who, `Paid $${paid.toFixed(2)} of $${totalDue.toFixed(2)} but status is ${j.jobStatus}.`, ev);
    if (j.jobStatus === 'PAID' && j.invoiceAmount != null && paid != null && paid < totalDue - 0.01) add('paid_with_balance', 'money', j.id, who, `Marked PAID but only $${paid.toFixed(2)} of $${totalDue.toFixed(2)} is recorded.`, ev);
    if (j.date && j.date < today && !j.dateTbd && PRE_SERVICE_STATUSES.includes(j.jobStatus)) add('past_appointment_pre_service', 'schedule', j.id, who, `Appointment was ${j.date} but the job is still ${j.jobStatus}.`, { date: j.date, job_status: j.jobStatus });
  }

  for (const l of leads) {
    if (String(l.status || '').toLowerCase() === 'booked' && !l.booking_id) add('booked_lead_without_booking', 'crm', l.id, fullName(l) || l.phone, null, { status: l.status, booking_id: null });
  }

  for (const r of reminders) {
    const due = new Date(r.due_at).getTime();
    if (r.status === 'open' && !r.notified_at && Number.isFinite(due) && due < now.getTime() - REMINDER_DELIVERY_GRACE_MS) {
      add('reminder_not_delivered', 'reminders', r.id, r.title, `Due ${r.due_at} but never sent to Telegram.`, { due_at: r.due_at, notified_at: null });
    }
  }

  const byPhone = new Map();
  for (const c of customers) {
    const digits = String(c.phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length < 10) continue;
    byPhone.set(digits, [...(byPhone.get(digits) || []), c]);
  }
  for (const [digits, group] of byPhone) {
    if (group.length > 1) {
      add('shared_phone_number', 'crm', group.map(c => c.id).join(','), group.map(fullName).join(' / '),
        `Possible duplicate or shared contact: ${group.map(fullName).join(' and ')} have the same phone number. This may be one person split across records, or legitimately shared contact info.`,
        { phone_last4: digits.slice(-4), customer_ids: group.map(c => c.id) });
    }
  }

  return issues;
}

// ---- owner action queue ----------------------------------------------------

const TEST_REMINDER = /\b(test proactive reminders?|test automatic(?: delivery| reminders?)?|test jarvis(?: again)?|test reminders?|confirm automatic reminders? work|confirm automatic reminders?)\b/i;
const WAITING_LANGUAGE = /\b(wait\w*|confirm(?!ed\b)\w*|get(?:s|ting)? back|let (?:me|us) know|check(?:s|ing)? with|decid\w*|think\w* (?:about|it over)|maybe|might|tentative\w*)\b/i;

// Same person = same contact name, ignoring case and spacing.
// ponytail: exact-name match only ("Richard" vs "Richard Smith" stay separate);
// link notes by customer_id (JARVIS_DATA_COVERAGE_AUDIT.md) when that matters.
export const noteContactKey = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Open notes grouped per contact: the newest note plus the older open ones.
// Notes without a contact name stand alone.
export function latestNotePerContact(notes) {
  const groups = new Map();
  const open = notes.filter(n => !n.status || n.status === 'open')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const n of open) {
    const key = noteContactKey(n.contact_name) || `id:${n.id}`;
    if (groups.has(key)) groups.get(key).earlier.push(n);
    else groups.set(key, { note: n, earlier: [] });
  }
  return [...groups.values()];
}

// Deterministic, rule-ranked queue. Priority 1 = overdue/owed now, 2 = due
// within 24h or needs a fix soon, 3 = open owner notes with an action.
// `waiting_on` = things blocked on someone else; `tomorrow_blockers` = gaps in
// tomorrow's jobs. Nothing here is invented: every item cites its source row.
export function buildActionQueue({ jobs = [], leads = [], reminders = [], notes = [] }, now = new Date()) {
  const today = phoenixToday(now);
  const tomorrow = addDays(today, 1);
  const nowMs = now.getTime();
  const next24hMs = nowMs + 24 * 60 * 60 * 1000;
  const actions = [];
  const push = (priority, type, id, title, detail, due_at = null) => actions.push({ priority, type, id, title, detail, due_at });

  for (const r of reminders) {
    if (r.status !== 'open') continue;
    if (r.notified_at && TEST_REMINDER.test(String(r.title || ''))) continue;
    const due = new Date(r.due_at).getTime();
    if (!Number.isFinite(due) || due > next24hMs) continue;
    push(due <= nowMs ? 1 : 2, 'reminder', r.id, r.title, due <= nowMs ? 'Owner reminder is due/overdue.' : 'Owner reminder is due within 24 hours.', r.due_at);
  }

  for (const l of leads) {
    const reason = leadFollowUpReason(l, now);
    if (!reason) continue;
    push(1, 'lead_followup', l.id, fullName(l) || l.phone || 'Lead',
      reason === 'follow_up_due' ? 'Lead follow-up is due/overdue.' : 'Lead has been uncontacted for more than 24 hours.', l.follow_up_at || null);
  }

  for (const { job, balance, invoiced } of unpaidJobs(jobs)) {
    push(1, 'unpaid', job.id, fullName(job) || 'Customer',
      invoiced ? `Unpaid balance $${balance.toFixed(2)}.` : `Work completed, not invoiced yet (about $${balance.toFixed(2)} from the estimate).`, null);
  }

  for (const n of notes) {
    if (n.status && n.status !== 'open') continue;
    const due = n.due_at ? new Date(n.due_at).getTime() : null;
    if (!String(n.action_needed || '').trim() && due == null) continue;
    let priority = 3;
    if (due != null && due <= nowMs) priority = 1;
    else if (due != null && due <= next24hMs) priority = 2;
    push(priority, 'business_note', n.id, `${n.action_needed || n.summary}${n.contact_name ? ` — ${n.contact_name}` : ''}`, n.summary, n.due_at || null);
  }

  for (const j of jobsOnDate(jobs, today)) {
    if (['PAID', 'COMPLETED', 'INVOICED'].includes(j.jobStatus)) continue;
    push(2, 'today_job', j.id, `${j.time || ''} ${fullName(j) || 'Customer'}`.trim(), `${j.vehicle || 'Vehicle'} — ${j.service || 'service'} (${j.jobStatus || 'scheduled'})`, j.date ? `${j.date}T${j.time || '00:00'}` : null);
  }

  for (const j of jobs) {
    if (!isCancelled(j) && j.date && j.date < today && !j.dateTbd && PRE_SERVICE_STATUSES.includes(j.jobStatus)) {
      push(2, 'stale_job_status', j.id, fullName(j) || 'Customer', `Appointment was ${j.date} but the job is still ${j.jobStatus} — update its status.`, null);
    }
  }

  const tomorrow_blockers = [];
  for (const j of jobsOnDate(jobs, tomorrow)) {
    const missing = [];
    if (!j.time || /^TBD$/i.test(j.time)) missing.push('appointment time');
    if (!String(j.vehicle || '').trim()) missing.push('vehicle');
    if (!String(j.phone || '').trim()) missing.push('customer phone');
    if (!String(j.serviceAddress || '').trim()) missing.push('service address');
    const blockers = missing.map(m => `missing ${m}`);
    if (j.jobStatus === 'ESTIMATE_SENT') blockers.push('estimate sent but not approved yet');
    if (blockers.length) tomorrow_blockers.push({ id: j.id, customer: fullName(j) || 'Customer', time: j.time || null, vehicle: j.vehicle || null, blockers });
  }

  const waiting_on = [];
  for (const j of jobs) {
    if (!isCancelled(j) && j.jobStatus === 'ESTIMATE_SENT') {
      waiting_on.push({ type: 'estimate_approval', id: j.id, who: fullName(j) || 'Customer', detail: `Estimate sent for ${j.vehicle || 'their vehicle'}; waiting on approval.`, date: j.date || null });
    }
  }
  for (const { job, balance } of unpaidJobs(jobs)) {
    waiting_on.push({ type: 'payment', id: job.id, who: fullName(job) || 'Customer', detail: `Owes $${balance.toFixed(2)}.`, date: job.date || null });
  }
  for (const l of leads) {
    if (String(l.status || '').toLowerCase() === 'quoted') {
      waiting_on.push({ type: 'quote_decision', id: l.id, who: fullName(l) || l.phone || 'Lead', detail: `Quoted${l.quote_amount != null ? ` $${num(l.quote_amount).toFixed(2)}` : ''}; waiting on their decision.`, date: l.follow_up_at || null });
    }
  }
  // A person's latest open note is the current state of their thread
  // ("confirmed Tuesday" supersedes "waiting on Tuesday"), so only it counts.
  for (const { note: n, earlier } of latestNotePerContact(notes)) {
    if (!n.preferred_timing && !WAITING_LANGUAGE.test(`${n.summary || ''} ${n.raw_text || ''}`)) continue;
    waiting_on.push({ type: 'owner_note', id: n.id, who: n.contact_name || null, detail: n.summary, tentative_timing: n.preferred_timing || null, date: n.due_at || null, ...(earlier.length ? { earlier_open_notes: earlier.length } : {}) });
  }

  actions.sort((a, b) => (a.priority - b.priority) || String(a.due_at || '').localeCompare(String(b.due_at || '')) || String(a.title).localeCompare(String(b.title)));
  return {
    generated_at: now.toISOString(),
    today,
    tomorrow,
    total: actions.length,
    urgent: actions.filter(a => a.priority === 1),
    soon: actions.filter(a => a.priority === 2),
    later: actions.filter(a => a.priority === 3),
    top_actions: actions.slice(0, 12),
    waiting_on,
    tomorrow_blockers,
  };
}
