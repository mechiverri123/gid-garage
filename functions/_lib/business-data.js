// Deterministic business operations over Supabase. Every numeric or stateful
// answer Jarvis gives comes from here (and the pure rules in /shared), never
// from the model doing math on raw rows:
//   intent -> operation here -> authoritative result -> model explains it.
// Used by admin-ai-chat.js (web + Telegram) and jarvis-business.js (voice).

import {
  resolvePeriodWindow, collectedRevenue, netProfit, jobFromRow, ownerPaySettings, ownerTakeHome,
} from '../../shared/business-metrics.js';
import {
  planPayment, dataHealthIssues, buildActionQueue, unpaidJobs, leadFollowUpReason,
  bookedValue, jobsOnDate, phoenixToday, addDays,
} from '../../shared/business-rules.js';
import {
  jobEvidence, resolvePerson, belongsToPerson, noteMatch, buildCustomerHistory,
} from '../../shared/job-context.js';

const money = n => (n == null ? 'unknown' : `$${Number(n).toFixed(2)}`);
const fullName = r => `${r?.fname || ''} ${r?.lname || ''}`.trim();
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);

// Columns that describe a job (everything the admin job view shows except
// photo/video blobs, which can hold legacy base64 images).
const CONTEXT_COLUMNS = [
  'id', 'customer_id', 'service', 'date', 'time', 'date_tbd', 'fname', 'lname', 'phone', 'email',
  'vehicle', 'vin', 'mileage', 'service_address', 'notes', 'garage_notes', 'status', 'job_status',
  'created_at', 'estimate_amount', 'estimate_notes', 'line_items', 'tax_amount', 'pre_existing_damage',
  'signed_at', 'invoice_amount', 'paid_at', 'adjustment_amount', 'adjustment_reason', 'amount_paid',
  'payments', 'parts_cost', 'inspection_data',
].join(',');
const QUEUE_COLUMNS = 'id,customer_id,fname,lname,phone,vehicle,service,service_address,date,time,date_tbd,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at,stripe_transaction_id';

// Safe for PostgREST or=() filters: letters, digits, space, apostrophe, hyphen, period.
export function cleanSearchText(s) {
  return String(s || '').replace(/'s\b/gi, '').replace(/[^\p{L}\p{N} '.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function createBusinessOps({ sbGet, sbPatch, now = () => new Date() }) {
  // Same rows the Schedule dashboard loads (list-bookings: all statuses,
  // newest 2000). Errors propagate — a failed load must not read as $0.
  const loadMetricJobs = () => sbGet('bookings', {
    select: 'id,job_status,status,paid_at,amount_paid,invoice_amount,tax_amount,parts_cost,payments',
    order: 'date.desc,time.desc',
    limit: '2000',
  });
  // Every job that isn't closed out — the set unpaid/stale/queue rules need.
  const loadOpenJobs = () => sbGet('bookings', { select: QUEUE_COLUMNS, job_status: 'not.in.(PAID,CANCELLED)', order: 'date.asc', limit: '1000' });

  async function revenueSummary({ period } = {}) {
    const win = resolvePeriodWindow(period || 'this_month', now());
    const jobs = (await loadMetricJobs()).map(jobFromRow);
    const revenue = collectedRevenue(jobs, win.inWindow);
    return {
      period: win.label,
      periodKey: win.key,
      jobsContributing: revenue.jobCount,
      grossCollected: money(revenue.total),
      netProfit: money(netProfit(jobs, win.inWindow)),
      definition: 'Same numbers as the Schedule dashboard. Revenue = customer money collected in the period. Net profit = amount paid minus sales tax minus parts cost, for jobs closed out in the period.',
    };
  }

  async function ownerPaySummary({ period, periodDays } = {}) {
    const key = period || (periodDays ? `last_${Math.round(Number(periodDays))}_days` : 'last_30_days');
    const win = resolvePeriodWindow(key, now());
    const [rows, settingsRows] = await Promise.all([
      loadMetricJobs(),
      sbGet('business_settings', { select: 'owner_tax_reserve_pct,owner_stripe_fee_pct,owner_overhead_items', id: 'eq.default', limit: '1' }),
    ]);
    const settings = ownerPaySettings(settingsRows[0] || {});
    const t = ownerTakeHome(rows.map(jobFromRow), win, settings);
    return {
      period: win.label,
      periodKey: win.key,
      jobMargin: money(t.jobMargin),
      estStripeFees: money(t.stripeFees),
      overhead: money(t.overhead),
      businessNetAfterOverhead: money(t.businessNet),
      inDeficit: t.inDeficit,
      estTaxReserve: money(t.taxReserve),
      estimatedTakeHome: money(t.takeHome),
      settingsUsed: { taxReservePct: settings.taxReservePct, stripeFeePct: settings.stripeFeePct, monthlyOverhead: money(settings.monthlyOverhead) },
      definition: 'Owner take-home, same as the Hub Owner Pay panel: net profit minus card fees minus overhead (prorated to the period), minus the tax reserve. Not revenue, not dashboard net profit.',
    };
  }

  async function customerContext({ query, customer_id } = {}) {
    let customers;
    let seedRows = [];
    let q = cleanSearchText(query);
    if (customer_id) {
      customers = await sbGet('customers', { select: 'id,fname,lname,phone,email,vehicle,vin,notes', id: `eq.${customer_id}`, limit: '1' });
      if (!customers.length) return { status: 'not_found', query: customer_id };
      q = fullName(customers[0]);
      seedRows = await sbGet('bookings', { select: 'id,customer_id,fname,lname,phone,email,vehicle,date', customer_id: `eq.${customer_id}`, limit: '200' });
    } else {
      if (!q) throw new Error('Need a customer name, phone, or customer_id.');
      const words = q.split(' ');
      const qDigits = q.replace(/\D/g, '');
      const ors = words.flatMap(w => [`fname.ilike."*${w}*"`, `lname.ilike."*${w}*"`]);
      if (qDigits.length >= 7) ors.push(`phone.ilike.*${qDigits.slice(-4)}*`);
      [customers, seedRows] = await Promise.all([
        sbGet('customers', { select: 'id,fname,lname,phone,email,vehicle,vin,notes', or: `(${ors.join(',')})`, limit: '25' }),
        sbGet('bookings', { select: 'id,customer_id,fname,lname,phone,email,vehicle,date', or: `(${ors.join(',')})`, limit: '300' }),
      ]);
    }

    const resolved = resolvePerson(q, customers, seedRows);
    if (resolved.status !== 'resolved') return resolved;
    const person = resolved.person;
    const customerRecord = customers.find(c => c.id === person.customerId) || null;

    const [first, ...restName] = cleanSearchText(person.name).split(' ');
    const nameFilter = restName.length ? `and(fname.ilike."${first}",lname.ilike."${restName.join(' ')}")` : `fname.ilike."${first}"`;
    const jobOr = [nameFilter, ...(person.customerId ? [`customer_id.eq.${person.customerId}`] : [])];
    const [jobRows, leads, calls, notes, reminders] = await Promise.all([
      sbGet('bookings', { select: CONTEXT_COLUMNS, or: `(${jobOr.join(',')})`, order: 'date.asc', limit: '100' }),
      sbGet('leads', { select: 'id,created_at,fname,lname,phone,email,vehicle,requested_service,quote_amount,status,follow_up_at,last_contacted_at,notes,customer_id,booking_id', order: 'created_at.desc', limit: '500' }),
      sbGet('calls', { select: 'id,created_at,phone,direction,outcome,lead_id,customer_id,notes', order: 'created_at.desc', limit: '300' }),
      sbGet('jarvis_business_notes', { select: '*', order: 'created_at.desc', limit: '300' }),
      sbGet('jarvis_reminders', { select: 'id,title,notes,due_at,status,related_lead_id', status: 'eq.open', order: 'due_at.asc', limit: '200' }),
    ]);

    const myLeads = leads.filter(l => belongsToPerson(l, person));
    const leadIds = new Set(myLeads.map(l => l.id));
    const pd = digits(person.phone);
    const myCalls = calls.filter(c => (person.customerId && c.customer_id === person.customerId) || leadIds.has(c.lead_id) || (pd.length === 10 && digits(c.phone) === pd));
    const myNotes = notes.map(n => ({ ...n, match: noteMatch(n, person) })).filter(n => n.match);
    const nameLower = person.name.toLowerCase();
    const myReminders = reminders.filter(r => leadIds.has(r.related_lead_id) || (nameLower && `${r.title} ${r.notes || ''}`.toLowerCase().includes(nameLower)));

    return {
      status: 'resolved',
      ...buildCustomerHistory({
        person, jobRows: jobRows.filter(r => belongsToPerson(r, person)),
        leads: myLeads, calls: myCalls, notes: myNotes, reminders: myReminders,
      }, now()),
      customerRecordNotes: customerRecord?.notes || null,
    };
  }

  async function jobDetail({ job_id } = {}) {
    if (!job_id) throw new Error('job_id is required.');
    const rows = await sbGet('bookings', { select: '*', id: `eq.${job_id}`, limit: '1' });
    if (!rows[0]) throw new Error('No job found with that id.');
    return { customer: fullName(rows[0]) || null, phone: rows[0].phone || null, ...jobEvidence(rows[0], { detail: true }) };
  }

  async function actionCenter() {
    const [jobs, leads, reminders, notes] = await Promise.all([
      loadOpenJobs(),
      sbGet('leads', { select: 'id,created_at,fname,lname,phone,vehicle,requested_service,quote_amount,status,follow_up_at,last_contacted_at', status: 'not.in.(booked,lost)', order: 'created_at.desc', limit: '500' }),
      sbGet('jarvis_reminders', { select: 'id,title,notes,due_at,status,notified_at,related_lead_id', status: 'eq.open', order: 'due_at.asc', limit: '200' }),
      sbGet('jarvis_business_notes', { select: 'id,created_at,summary,raw_text,contact_name,vehicle,service,quoted_amount,preferred_timing,action_needed,due_at,status', status: 'eq.open', order: 'created_at.asc', limit: '200' }),
    ]);
    return buildActionQueue({ jobs: jobs.map(r => ({ ...jobFromRow(r), time: r.time })), leads, reminders, notes }, now());
  }

  async function unpaidSummary() {
    const rows = await sbGet('bookings', { select: QUEUE_COLUMNS, job_status: 'in.(COMPLETED,INVOICED)', order: 'date.asc', limit: '500' });
    const list = unpaidJobs(rows.map(jobFromRow)).map(({ job, balance, invoiced }) => ({
      id: job.id, customer: fullName(job) || null, vehicle: job.vehicle || null, date: job.date, status: job.jobStatus,
      balance: money(balance), invoiced,
    }));
    const total = unpaidJobs(rows.map(jobFromRow)).reduce((s, u) => s + u.balance, 0);
    return {
      count: list.length,
      totalOwed: money(total),
      jobs: list,
      definition: 'Unpaid = COMPLETED or INVOICED (not PAID, not cancelled) with a balance. Balance = invoice (or estimate if not invoiced yet) + tax − amount paid. Same set as the dashboard\'s Unpaid / Due count.',
    };
  }

  async function dataHealth() {
    const [jobs, leads, reminders, customers] = await Promise.all([
      sbGet('bookings', { select: 'id,fname,lname,date,date_tbd,job_status,status,paid_at,amount_paid,invoice_amount,tax_amount,payments', order: 'date.desc', limit: '2000' }),
      sbGet('leads', { select: 'id,fname,lname,phone,status,booking_id', status: 'eq.booked', limit: '500' }),
      sbGet('jarvis_reminders', { select: 'id,title,due_at,status,notified_at', status: 'eq.open', limit: '500' }),
      sbGet('customers', { select: 'id,fname,lname,phone', limit: '2000' }),
    ]);
    const issues = dataHealthIssues({ jobs: jobs.map(jobFromRow), leads, reminders, customers }, now());
    const counts = issues.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] || 0) + 1 }), {});
    return { issueCount: issues.length, counts, issues: issues.slice(0, 40), note: 'Read-only. Nothing was changed. Fix records in the dashboard.' };
  }

  // Business summary: today's jobs (booked value, not revenue), follow-ups,
  // unpaid, 30-day lead conversion.
  async function businessSummary() {
    const n = now();
    const today = phoenixToday(n);
    const windowStart = addDays(today, -30);
    const [todayRows, openJobs, leads, spend, metricRows] = await Promise.all([
      sbGet('bookings', { select: QUEUE_COLUMNS, date: `eq.${today}` }),
      loadOpenJobs(),
      sbGet('leads', { select: 'id,created_at,fname,lname,phone,status,follow_up_at,last_contacted_at', created_at: `gte.${windowStart}` }),
      sbGet('marketing_spend', { select: 'amount', date: `gte.${windowStart}` }),
      loadMetricJobs(),
    ]);
    const todays = jobsOnDate(todayRows.map(jobFromRow), today);
    const booked = leads.filter(l => l.status === 'booked').length;
    return {
      today: {
        date: today,
        jobCount: todays.length,
        bookedValue: todays.reduce((s, j) => s + bookedValue(j), 0),
        collected: collectedRevenue(metricRows.map(jobFromRow), resolvePeriodWindow('today', n).inWindow).total,
      },
      needsAttention: {
        overdueLeadFollowUps: leads.filter(l => leadFollowUpReason(l, n)).map(l => fullName(l) || l.phone),
        unpaidInvoices: unpaidJobs(openJobs.map(jobFromRow)).map(u => ({ customer: fullName(u.job), owed: u.balance })),
      },
      leadsLast30Days: { total: leads.length, booked, conversionRatePct: leads.length ? Math.round((booked / leads.length) * 1000) / 10 : 0 },
      marketingLast30Days: { totalSpend: spend.reduce((s, r) => s + Number(r.amount || 0), 0), leadCount: leads.length },
      definitions: 'today.bookedValue = value of jobs scheduled today (paid amount, else invoice/estimate + tax); it is NOT revenue. today.collected = money actually collected today (dashboard revenue rule).',
    };
  }

  // Owner briefing: today/tomorrow schedule + the ranked queue's counts.
  async function ownerBriefing() {
    const n = now();
    const today = phoenixToday(n);
    const tomorrow = addDays(today, 1);
    const [dayRows, queue, metricRows] = await Promise.all([
      sbGet('bookings', { select: QUEUE_COLUMNS, date: `in.(${today},${tomorrow})`, order: 'time.asc' }),
      actionCenter(),
      loadMetricJobs().catch(() => null),
    ]);
    const jobs = dayRows.map(r => ({ ...jobFromRow(r), time: r.time }));
    const slim = j => ({ id: j.id, customer: fullName(j), vehicle: j.vehicle, service: j.service, date: j.date, time: j.time, status: j.jobStatus });
    const collected7d = metricRows ? collectedRevenue(metricRows.map(jobFromRow), resolvePeriodWindow('last_7_days', n).inWindow).total : null;
    const reminders = queue.top_actions.filter(a => a.type === 'reminder');
    return {
      date: today,
      todayJobs: jobsOnDate(jobs, today).map(slim),
      tomorrowJobs: jobsOnDate(jobs, tomorrow).map(slim),
      remindersNeedingAttention: reminders,
      leadsNeedingAttention: queue.urgent.filter(a => a.type === 'lead_followup').slice(0, 10),
      unpaid: queue.urgent.filter(a => a.type === 'unpaid').slice(0, 10),
      tomorrowBlockers: queue.tomorrow_blockers,
      collectedLast7Days: money(collected7d),
    };
  }

  async function recordPayment({ job_id, amount, method = 'Other', stripe_transaction_id = '', note = '', confirmed = false } = {}) {
    const rows = await sbGet('bookings', { select: 'id,fname,lname,vehicle,job_status,status,invoice_amount,estimate_amount,tax_amount,amount_paid,paid_at,payments,stripe_transaction_id', id: `eq.${job_id}`, limit: '1' });
    const row = rows[0];
    if (!row) throw new Error('No job found with that id.');
    const { fields, preview } = planPayment(jobFromRow(row), { amount, method, stripeId: stripe_transaction_id, note, now: now() });
    const who = fullName(row) || 'this customer';
    const summary = `Record a ${money(preview.amount)} ${preview.method} payment on ${who}'s job (${row.vehicle || 'vehicle on file'}). ` +
      `Paid so far ${money(preview.paidBefore)} of ${money(preview.totalDue)}; after this ${money(preview.paidAfter)}` +
      (preview.fullyPaid ? ', so the job will be marked PAID.' : `, leaving ${money(preview.balanceAfter)} owed (status ${preview.resultingStatus}).`) +
      ' No receipt email is sent.';
    if (!confirmed) return { needs_confirmation: true, summary };
    await sbPatch('bookings', `id=eq.${encodeURIComponent(job_id)}`, fields);
    return { ok: true, recorded: money(preview.amount), paidTotal: money(preview.paidAfter), balance: money(preview.balanceAfter), status: preview.resultingStatus };
  }

  return {
    loadMetricJobs, revenueSummary, ownerPaySummary, customerContext, jobDetail, actionCenter,
    unpaidSummary, dataHealth, businessSummary, ownerBriefing, recordPayment,
  };
}
