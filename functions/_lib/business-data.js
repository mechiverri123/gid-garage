// Deterministic business operations over Supabase. Every numeric or stateful
// answer Jarvis gives comes from here (and the pure rules in /shared), never
// from the model doing math on raw rows:
//   intent -> operation here -> authoritative result -> model explains it.
// Used by admin-ai-chat.js (web + Telegram) and jarvis-business.js (voice).

import {
  resolvePeriodWindow, collectedRevenue, netProfit, jobFromRow, ownerPaySettings, ownerTakeHome,
  revenueContributions, compareRevenuePeriods,
} from '../../shared/business-metrics.js';
import {
  planPayment, dataHealthIssues, buildActionQueue, unpaidJobs, leadFollowUpReason,
  bookedValue, jobsOnDate, phoenixToday, addDays, cancelJobPlan, reopenJobPlan, isCancelled,
} from '../../shared/business-rules.js';
import {
  jobEvidence, resolvePerson, belongsToPerson, noteMatch, buildCustomerHistory, vehicleMatches,
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
  'payments', 'parts_cost', 'inspection_data', 'pre_scan', 'post_scan',
].join(',');
// Photo captions live inside the photo arrays; fetched separately and only for
// the jobs being described (legacy rows can embed base64 images).
const PHOTO_COLUMNS = 'id,job_photos,admin_photos';
const LEAD_COLUMNS = 'id,created_at,fname,lname,phone,email,vehicle,requested_service,quote_amount,status,follow_up_at,last_contacted_at,notes,customer_id,booking_id';
const QUEUE_COLUMNS = 'id,customer_id,fname,lname,phone,vehicle,service,service_address,date,time,date_tbd,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at,stripe_transaction_id';

// Safe for PostgREST or=() filters: letters, digits, space, apostrophe, hyphen, period.
export function cleanSearchText(s) {
  return String(s || '').replace(/'s\b/gi, '').replace(/[^\p{L}\p{N} '.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Verified single-row write. sbPatch must return the updated rows
// (Prefer: return=representation). A PATCH that matches nothing returns [] with
// HTTP 200 — that used to read as success. Now zero rows, several rows, or a
// stored value that differs from what was written is an error.
export async function patchVerified(sbPatch, table, id, fields) {
  const rows = await sbPatch(table, `id=eq.${encodeURIComponent(id)}`, fields);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Write not applied: expected 1 ${table} row with id ${id}, database updated ${Array.isArray(rows) ? rows.length : 'an unknown number of'} rows.`);
  }
  const row = rows[0];
  // Postgres echoes timestamps in its own format ("…59.4+00:00" for "…59.400Z"):
  // same instant, different text. Compare those by instant, not by string.
  const isTimestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
  const same = (a, b) => (typeof a === 'object' || typeof b === 'object') ? JSON.stringify(a) === JSON.stringify(b)
    : String(a) === String(b) || Number(a) === Number(b) || (isTimestamp(a) && isTimestamp(b) && Date.parse(a) === Date.parse(b));
  const mismatched = Object.keys(fields).filter(k => k !== 'updated_at' && !same(row[k], fields[k]));
  if (mismatched.length) throw new Error(`Write not confirmed: ${table} ${id} read back different values for ${mismatched.join(', ')}.`);
  return row;
}

// Structured result every write returns: what changed, before -> after.
export function writeResult(entity, id, before, after, extra = {}) {
  const changed = {};
  for (const k of Object.keys(after)) if (k !== 'updated_at') changed[k] = { before: before?.[k] ?? null, after: after[k] };
  return { ok: true, verified: true, entity, id, changed, ...extra };
}

export function createBusinessOps({ sbGet, sbPatch, sbInsert = null, now = () => new Date() }) {
  const patch = (table, id, fields) => patchVerified(sbPatch, table, id, fields);

  // The ONE place job rows get their photo captions. Every path that describes
  // a job (history, vehicle search, "each one", detail) goes through here, so a
  // history summary can never be shallower than a single-job answer.
  async function attachPhotos(rows, max = 15) {
    const ids = rows.filter(r => !('admin_photos' in r)).slice(-max).map(r => r.id);
    if (!ids.length) return rows;
    const photos = await sbGet('bookings', { select: PHOTO_COLUMNS, id: `in.(${ids.join(',')})` });
    const byId = new Map(photos.map(p => [p.id, p]));
    for (const r of rows) if (byId.has(r.id)) Object.assign(r, { job_photos: byId.get(r.id).job_photos, admin_photos: byId.get(r.id).admin_photos });
    return rows;
  }
  // Same rows the Schedule dashboard loads (list-bookings: all statuses,
  // newest 2000). Errors propagate — a failed load must not read as $0.
  const loadMetricJobs = () => sbGet('bookings', {
    select: 'id,fname,lname,vehicle,date,job_status,status,paid_at,amount_paid,invoice_amount,tax_amount,parts_cost,payments',
    order: 'date.desc,time.desc',
    limit: '2000',
  });
  // Every job that isn't closed out — the set unpaid/stale/queue rules need.
  const loadOpenJobs = () => sbGet('bookings', { select: QUEUE_COLUMNS, job_status: 'not.in.(PAID,CANCELLED)', order: 'date.asc', limit: '1000' });

  const contributionRow = (job, c) => ({
    bookingId: job.id, customer: fullName(job) || null, vehicle: job.vehicle || null,
    paymentDates: c.paymentDates, collected: money(c.collected), basis: c.basis,
    netProfitContribution: money(c.netProfit), taxAmount: money(c.taxAmount), partsCost: money(c.partsCost),
  });

  async function revenueSummary({ period, include_contributions = false } = {}) {
    const win = resolvePeriodWindow(period || 'this_month', now());
    const jobs = (await loadMetricJobs()).map(jobFromRow);
    const revenue = collectedRevenue(jobs, win.inWindow);
    const out = {
      period: win.label,
      periodKey: win.key,
      jobsContributing: revenue.jobCount,
      grossCollected: money(revenue.total),
      netProfit: money(netProfit(jobs, win.inWindow)),
      definition: 'Same numbers as the Schedule dashboard. Revenue = customer money collected in the period. Net profit = amount paid minus sales tax minus parts cost, for jobs closed out in the period.',
    };
    if (include_contributions) {
      out.contributions = revenueContributions(jobs, win.inWindow)
        .sort((a, b) => b.c.collected - a.c.collected).slice(0, 60).map(({ job, c }) => contributionRow(job, c));
    }
    return out;
  }

  // Exact job-by-job reason two periods differ (e.g. last_30_days vs this_month).
  async function comparePeriods({ period_a = 'this_month', period_b = 'last_30_days' } = {}) {
    const n = now();
    const jobs = (await loadMetricJobs()).map(jobFromRow);
    const cmp = compareRevenuePeriods(jobs, resolvePeriodWindow(period_a, n), resolvePeriodWindow(period_b, n));
    return {
      periodA: { ...cmp.a, collected: money(cmp.a.collected), netProfit: money(cmp.a.netProfit) },
      periodB: { ...cmp.b, collected: money(cmp.b.collected), netProfit: money(cmp.b.netProfit) },
      collectedDifference: money(cmp.collectedDifference),
      netProfitDifference: money(cmp.netProfitDifference),
      sharedJobsWithSameAmounts: cmp.sharedJobCount,
      differences: cmp.differences.map(d => ({
        bookingId: d.job.id, customer: fullName(d.job) || null, vehicle: d.job.vehicle || null, where: d.where,
        collectedInA: money(d.a.collected), collectedInB: money(d.b.collected), collectedDifference: money(d.collectedDifference),
        netProfitDifference: money(d.netProfitDifference),
        paymentDatesInA: d.a.paymentDates, paymentDatesInB: d.b.paymentDates,
      })),
      explanation: 'differences lists every job whose contribution differs between the two periods; its collectedDifference values add up exactly to collectedDifference (B minus A).',
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

  // Load every domain a person can live in, for resolution by name/phone.
  async function peopleSources(q) {
    const words = q.split(' ');
    const qDigits = q.replace(/\D/g, '');
    const ors = words.flatMap(w => [`fname.ilike."*${w}*"`, `lname.ilike."*${w}*"`]);
    if (qDigits.length >= 7) ors.push(`phone.ilike.*${qDigits.slice(-4)}*`);
    const [customers, bookings, leads, notes] = await Promise.all([
      sbGet('customers', { select: 'id,fname,lname,phone,email,vehicle,vin,notes', or: `(${ors.join(',')})`, limit: '25' }),
      sbGet('bookings', { select: 'id,customer_id,fname,lname,phone,email,vehicle,date', or: `(${ors.join(',')})`, limit: '300' }),
      sbGet('leads', { select: LEAD_COLUMNS, or: `(${ors.join(',')})`, limit: '100' }),
      sbGet('jarvis_business_notes', { select: 'id,contact_name,phone,email,vehicle', or: `(${words.map(w => `contact_name.ilike."*${w}*"`).join(',')})`, limit: '100' }),
    ]);
    return { customers, bookings, leads, notes };
  }

  // Everyone matching a name/phone across customers, bookings, leads and notes.
  async function findPeople({ query } = {}) {
    const q = cleanSearchText(query);
    if (!q) throw new Error('query is required.');
    const src = await peopleSources(q);
    const r = resolvePerson(q, src.customers, src.bookings, { leads: src.leads, notes: src.notes });
    if (r.status === 'not_found') return { status: 'not_found', query: q, people: [] };
    return { status: r.status, people: r.status === 'resolved' ? [r.person] : r.candidates, possibleRelated: r.possibleRelated || [] };
  }

  async function customerContext({ query, customer_id } = {}) {
    let customers;
    let seedRows = [];
    let seedLeads = [];
    let seedNotes = [];
    let q = cleanSearchText(query);
    if (customer_id) {
      customers = await sbGet('customers', { select: 'id,fname,lname,phone,email,vehicle,vin,notes', id: `eq.${customer_id}`, limit: '1' });
      if (!customers.length) return { status: 'not_found', query: customer_id };
      q = fullName(customers[0]);
      seedRows = await sbGet('bookings', { select: 'id,customer_id,fname,lname,phone,email,vehicle,date', customer_id: `eq.${customer_id}`, limit: '200' });
    } else {
      if (!q) throw new Error('Need a customer name, phone, or customer_id.');
      const src = await peopleSources(q);
      ({ customers } = src);
      seedRows = src.bookings; seedLeads = src.leads; seedNotes = src.notes;
    }

    const resolved = resolvePerson(q, customers, seedRows, { leads: seedLeads, notes: seedNotes });
    if (resolved.status !== 'resolved') return resolved;
    const person = resolved.person;
    const customerRecord = customers.find(c => c.id === person.customerId) || null;

    // Bookings only when the person has booking/customer identity (a note-only
    // subject like "Lisa" has none — answer from notes, never invent a record).
    const [first, ...restName] = cleanSearchText(person.name).split(' ');
    const nameFilter = restName.length ? `and(fname.ilike."${first}",lname.ilike."${restName.join(' ')}")` : `fname.ilike."${first}"`;
    const jobOr = [nameFilter, ...(person.customerId ? [`customer_id.eq.${person.customerId}`] : []), ...(person.jobIds.length ? [`id.in.(${person.jobIds.join(',')})`] : [])];
    const hasRecordIdentity = person.sources.some(s => s !== 'note');
    const [jobRows, leads, calls, notes, reminders] = await Promise.all([
      hasRecordIdentity ? sbGet('bookings', { select: CONTEXT_COLUMNS, or: `(${jobOr.join(',')})`, order: 'date.asc', limit: '100' }) : Promise.resolve([]),
      sbGet('leads', { select: LEAD_COLUMNS, order: 'created_at.desc', limit: '500' }),
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

    const myJobs = jobRows.filter(r => person.jobIds.includes(r.id) || belongsToPerson(r, person));
    await attachPhotos(myJobs);

    return {
      status: 'resolved',
      ...buildCustomerHistory({ person, jobRows: myJobs, leads: myLeads, calls: myCalls, notes: myNotes, reminders: myReminders }, now()),
      customerRecordNotes: customerRecord?.notes || null,
      possibleRelated: resolved.possibleRelated,
      ...(person.sources.every(s => s === 'note') ? { note: `${person.name} only appears in owner notes — there is no customer, booking or lead record. Answer from the notes.` } : {}),
    };
  }

  // Jobs on a vehicle ("the Ranger", "2021 Blazer"), newest first, with evidence.
  async function vehicleJobs({ vehicle, customer } = {}) {
    const words = cleanSearchText(vehicle).split(' ').filter(Boolean);
    if (!words.length) throw new Error('vehicle is required.');
    const rows = await sbGet('bookings', { select: CONTEXT_COLUMNS, and: `(${words.map(w => `vehicle.ilike."*${w}*"`).join(',')})`, order: 'date.desc', limit: '40' });
    const today = phoenixToday(now());
    let matches = rows.filter(r => vehicleMatches(r.vehicle, words.join(' ')));
    if (customer) matches = matches.filter(r => fullName(r).toLowerCase().includes(cleanSearchText(customer).toLowerCase()));
    const jobs = (await attachPhotos(matches.slice(0, 15))).map(r => jobEvidence(r));
    const latestPast = jobs.find(j => !j.cancelled && j.date && j.date <= today) || null;
    return {
      vehicleQuery: words.join(' '),
      count: matches.length,
      latestJobId: latestPast?.id || jobs[0]?.id || null,
      distinctCustomers: [...new Set(jobs.map(j => j.customer).filter(Boolean))],
      jobs,
      note: jobs.length > 1 && new Set(jobs.map(j => j.customer)).size > 1 ? 'Several customers have this vehicle model; name whose job you mean.' : undefined,
    };
  }

  // Current records for the result set the previous answer showed ("each one").
  async function resultSetDetails({ type, ids = [] } = {}) {
    const list = ids.filter(Boolean).slice(0, 25);
    if (!list.length) return { type, items: [] };
    const inIds = `in.(${list.join(',')})`;
    if (type === 'leads') {
      const rows = await sbGet('leads', { select: LEAD_COLUMNS, id: inIds });
      const n = now();
      return { type, items: rows.map(l => ({ id: l.id, name: fullName(l) || l.phone, status: l.status, created_at: l.created_at, last_contacted_at: l.last_contacted_at, follow_up_at: l.follow_up_at, followUpReason: leadFollowUpReason(l, n), requested_service: l.requested_service, notes: l.notes })) };
    }
    if (type === 'jobs') {
      const rows = await attachPhotos(await sbGet('bookings', { select: CONTEXT_COLUMNS, id: inIds }));
      return { type, items: rows.map(r => jobEvidence(r)) };
    }
    if (type === 'notes') return { type, items: await sbGet('jarvis_business_notes', { select: '*', id: inIds }) };
    return { type, items: [], note: `No detail lookup for ${type}.` };
  }

  async function jobDetail({ job_id } = {}) {
    if (!job_id) throw new Error('job_id is required.');
    const rows = await sbGet('bookings', { select: '*', id: `eq.${job_id}`, limit: '1' });
    if (!rows[0]) throw new Error('No job found with that id.');
    return { customerId: rows[0].customer_id || null, phone: rows[0].phone || null, ...jobEvidence(rows[0], { detail: true }) };
  }

  // Same state transition as the admin "Mark as Cancelled" button
  // (job_status CANCELLED + status cancelled). Nothing is deleted. The reason
  // has no column on bookings, so it is kept as a Jarvis note on the job.
  async function cancelJob({ job_id, reason = '', confirmed = false } = {}) {
    if (!job_id) throw new Error('job_id is required.');
    const rows = await sbGet('bookings', { select: 'id,fname,lname,vehicle,date,time,job_status,status', id: `eq.${job_id}`, limit: '1' });
    const row = rows[0];
    if (!row) throw new Error('No job found with that id.');
    const who = fullName(row) || 'this customer';
    // Idempotent: an already-cancelled job is reported as-is — no confirmation
    // prompt, no second write, no new reason note.
    if (isCancelled(jobFromRow(row))) {
      const notes = await sbGet('jarvis_business_notes', { select: 'id,raw_text,created_at', raw_text: `ilike.*Job ${job_id} cancelled*`, order: 'created_at.desc', limit: '5' }).catch(() => []);
      const prior = notes.find(n => String(n.raw_text || '').startsWith(`Job ${job_id} cancelled`));
      return {
        ok: true, changed: false, already_cancelled: true, entity: 'booking', id: job_id, customer: who,
        job_status: row.job_status, status: row.status,
        existing_reason: prior ? String(prior.raw_text).replace(/^.*Reason:\s*/, '') : null,
        note: 'Already cancelled — nothing was changed.',
      };
    }
    const plan = cancelJobPlan(jobFromRow(row));
    const summary = `Cancel ${who}'s job (${row.vehicle || 'vehicle on file'}, ${row.date || 'no date'}${row.time ? ` ${row.time}` : ''}, currently ${row.job_status}). It is marked Cancelled like the admin button — nothing is deleted.${reason ? ` Reason noted: "${reason}".` : ''}`;
    if (!confirmed) return { needs_confirmation: true, summary };
    const after = await patch('bookings', job_id, plan.fields);
    let reasonNote = null;
    if (reason && sbInsert) {
      reasonNote = await sbInsert('jarvis_business_notes', {
        raw_text: `Job ${job_id} cancelled via Jarvis. Reason: ${reason}`.slice(0, 12000),
        summary: `Cancelled ${who}'s ${row.vehicle || ''} job — ${reason}`.slice(0, 500),
        contact_name: who, vehicle: row.vehicle || null, status: 'resolved', source: 'jarvis',
      }).then(n => ({ saved: true, id: n?.id || null })).catch(e => ({ saved: false, error: e.message }));
    }
    return writeResult('booking', job_id, plan.before, { job_status: after.job_status, status: after.status }, { customer: who, reasonNote });
  }

  async function reopenJob({ job_id, confirmed = false } = {}) {
    if (!job_id) throw new Error('job_id is required.');
    const rows = await sbGet('bookings', { select: 'id,fname,lname,vehicle,date,job_status,status', id: `eq.${job_id}`, limit: '1' });
    const row = rows[0];
    if (!row) throw new Error('No job found with that id.');
    const plan = reopenJobPlan(jobFromRow(row));
    if (!confirmed) return { needs_confirmation: true, summary: `Reopen ${fullName(row) || 'this'}'s cancelled job (${row.vehicle || 'vehicle on file'}) and move it back to Booked, like the admin Reopen button.` };
    const after = await patch('bookings', job_id, plan.fields);
    return writeResult('booking', job_id, plan.before, { job_status: after.job_status, status: after.status });
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
    const after = await patch('bookings', job_id, fields);
    return writeResult('booking', job_id, { amount_paid: row.amount_paid, job_status: row.job_status }, { amount_paid: after.amount_paid, job_status: after.job_status },
      { recorded: money(preview.amount), paidTotal: money(preview.paidAfter), invoiceTotalInclTax: money(preview.totalDue), balance: money(preview.balanceAfter), status: after.job_status });
  }

  return {
    loadMetricJobs, patch, revenueSummary, comparePeriods, ownerPaySummary, findPeople, customerContext, vehicleJobs,
    resultSetDetails, jobDetail, cancelJob, reopenJob, actionCenter, unpaidSummary, dataHealth, businessSummary,
    ownerBriefing, recordPayment,
  };
}
