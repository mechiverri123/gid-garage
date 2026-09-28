// Customer / job context for Jarvis. Turns raw bookings (+ leads, calls,
// owner notes, reminders) into labeled EVIDENCE the model summarizes. Each
// piece keeps the field it came from, so the model can say "based on the scope
// of work" and never has to guess. Pure functions; I/O lives in
// functions/_lib/business-data.js. Tests: tests/job-context.test.js.
//
// What the booking fields actually mean (from the admin UI, src/JobOps.tsx):
//   service          category id: oil|brakes|diag|suspension|audio|full|other
//   notes            booking-form text: "Address: … | Plate/VIN: … | Brake service: … | <customer's own words>";
//                    on admin-created jobs, free-form notes typed by the owner
//   estimate_notes   "Scope of Work" (printed on the estimate/invoice)
//   garage_notes     "Technician Notes" (internal)
//   line_items       billed items [{label, type: labor|parts|mobile|fixed|other|discount, amount}]
//   inspection_data  { tirePressure, tireTread: {fl,fr,rl,rr}, dtcCodes: [{code, plan}] }
//   pre_existing_damage, adjustment_reason/amount, parts_receipts, job_photos/admin_photos notes

import { jobFromRow, parsePayments } from './business-metrics.js';
import { isCancelled, jobBalance, jobTotalDue, phoenixToday, isAwaitingPayment } from './business-rules.js';

export const SERVICE_LABELS = {
  oil: 'Oil Change', brakes: 'Brakes', diag: 'Diagnostics', suspension: 'Suspension',
  audio: 'Car Audio', full: 'Full Service', other: 'Other / Custom',
};

const CATEGORY_WORDS = {
  brakes: /\b(brake|pads?|rotors?|caliper)/i,
  oil: /\boil\b/i,
  diag: /\b(diag|check engine|codes?|scan|dtc|p0\d{3})/i,
  suspension: /\b(strut|shock|control arm|suspension|ball joint|tie rod|sway|bushing)/i,
  audio: /\b(audio|stereo|speaker|amp|subwoofer|radio)/i,
  full: /\b(service|maintenance|inspection|tune)/i,
};

const BOOKING_NOTE_PREFIXES = [
  ['address', /^Address:\s*/i],
  ['plateOrVin', /^Plate\/VIN:\s*/i],
  ['selection', /^(Brake service|Suspension|Audio package):\s*/i],
];

const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n)}… [truncated]` : t;
};
const parseJson = v => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
};
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const fullName = r => `${r?.fname || ''} ${r?.lname || ''}`.trim();

// Split the booking-form notes string into its structured parts. Anything that
// isn't a known booking-form prefix is the free text (the customer's words on
// website bookings, or the owner's notes on admin-created jobs).
export function parseBookingNotes(notes) {
  const out = { address: null, plateOrVin: null, selections: [], text: '' };
  const rest = [];
  for (const part of String(notes || '').split(' | ').map(s => s.trim()).filter(Boolean)) {
    const hit = BOOKING_NOTE_PREFIXES.find(([, re]) => re.test(part));
    if (!hit) { rest.push(part); continue; }
    if (hit[0] === 'address') out.address = part.replace(hit[1], '');
    else if (hit[0] === 'plateOrVin') out.plateOrVin = part.replace(hit[1], '');
    else out.selections.push(part);
  }
  out.text = rest.join(' | ');
  return out;
}

function inspectionSummary(raw) {
  const data = parseJson(raw);
  if (!data || typeof data !== 'object') return null;
  const wheels = r => (r && typeof r === 'object' && Object.values(r).some(v => String(v || '').trim()))
    ? Object.fromEntries(Object.entries(r).filter(([, v]) => String(v || '').trim())) : null;
  const dtcCodes = (Array.isArray(data.dtcCodes) ? data.dtcCodes : [])
    .filter(d => d && (d.code || d.plan))
    .map(d => ({ code: d.code || null, plan: d.plan ? clip(d.plan, 400) : null }));
  const out = { tirePressure: wheels(data.tirePressure), tireTread: wheels(data.tireTread), dtcCodes };
  return out.tirePressure || out.tireTread || dtcCodes.length ? out : null;
}

// One job as labeled evidence. `detail` adds photo notes, receipts, payment
// history and longer text limits (single-job lookups only).
export function jobEvidence(row, { detail = false } = {}) {
  const job = jobFromRow(row);
  const limit = detail ? 4000 : 1200;
  const booking = parseBookingNotes(row.notes);
  const lineItems = (parseJson(row.line_items) || [])
    .filter(li => li && (li.label || li.amount))
    .map(li => ({ label: clip(li.label, 200), type: li.type || 'other', amount: Number(li.amount || 0) }));
  const inspection = inspectionSummary(row.inspection_data);
  const scopeOfWork = clip(row.estimate_notes, limit);
  const technicianNotes = clip(row.garage_notes, limit);
  const serviceId = String(row.service || '').toLowerCase();

  const ev = {
    id: row.id,
    date: row.date || null,
    time: row.time || null,
    dateTbd: !!row.date_tbd,
    status: row.job_status || null,
    cancelled: isCancelled(job),
    serviceCategory: { id: serviceId || null, label: SERVICE_LABELS[serviceId] || row.service || null, generic: !serviceId || serviceId === 'other' },
    vehicle: row.vehicle || null,
    vin: row.vin || booking.plateOrVin || null,
    mileage: row.mileage || null,
    // FACT sources, labeled by where they live.
    bookingRequest: { selections: booking.selections, text: clip(booking.text, limit) || null, source: 'bookings.notes' },
    scopeOfWork: scopeOfWork || null,          // bookings.estimate_notes
    technicianNotes: technicianNotes || null,  // bookings.garage_notes
    lineItems,                                 // bookings.line_items
    inspection,                                // bookings.inspection_data
    preExistingDamage: clip(row.pre_existing_damage, 600) || null,
    priceAdjustment: row.adjustment_amount != null || row.adjustment_reason
      ? { amount: row.adjustment_amount ?? null, reason: clip(row.adjustment_reason, 400) || null } : null,
    money: {
      estimate: row.estimate_amount ?? null,
      invoice: row.invoice_amount ?? null,
      tax: row.tax_amount ?? null,
      totalDue: jobTotalDue(job),
      paid: row.amount_paid ?? null,
      balance: isAwaitingPayment(job) ? jobBalance(job) : null,
      paidAt: row.paid_at || null,
    },
    signedAt: row.signed_at || null,
  };

  if (detail) {
    const photoNotes = [...(parseJson(row.job_photos) || []), ...(parseJson(row.admin_photos) || [])]
      .map(p => clip(p?.note, 300)).filter(Boolean);
    ev.photoNotes = photoNotes;
    ev.partsReceipts = (parseJson(row.parts_receipts) || []).map(r => r?.name).filter(Boolean);
    ev.partsCost = row.parts_cost ?? null;
    ev.payments = parsePayments(row.payments).map(p => ({ amount: p.amount, method: p.method, at: p.at, note: p.note || null }));
    ev.invoiceSent = { count: row.invoice_sent_count ?? 0, lastSentAt: row.invoice_last_sent_at || null };
  }

  const descriptive = {
    scopeOfWork: ev.scopeOfWork, technicianNotes: ev.technicianNotes,
    bookingText: ev.bookingRequest.text, bookingSelections: ev.bookingRequest.selections.join(' '),
    lineItems: lineItems.map(li => li.label).join('; '),
    inspection: inspection ? JSON.stringify(inspection) : '',
  };
  ev.evidenceFields = Object.entries(descriptive).filter(([, v]) => String(v || '').trim()).map(([k]) => k);

  ev.gaps = [];
  if (!ev.scopeOfWork) ev.gaps.push('no scope of work');
  if (!ev.technicianNotes) ev.gaps.push('no technician notes');
  if (!lineItems.length) ev.gaps.push('no line items');
  if (!ev.bookingRequest.text && !ev.bookingRequest.selections.length) ev.gaps.push('no booking description');
  if (!ev.vehicle) ev.gaps.push('vehicle missing');
  if (!ev.evidenceFields.length) ev.gaps.push('nothing describes the work beyond the service category');

  // A specific category that none of the descriptive text supports is worth
  // flagging, not silently trusting either side.
  ev.hints = [];
  const allText = Object.values(descriptive).join(' ');
  if (!ev.serviceCategory.generic && CATEGORY_WORDS[serviceId] && allText.trim() && !CATEGORY_WORDS[serviceId].test(allText)) {
    ev.hints.push(`Service category is "${ev.serviceCategory.label}" but none of the job's notes or line items mention it — the category and the notes may disagree.`);
  }
  if (ev.serviceCategory.generic && ev.evidenceFields.length) {
    ev.hints.push(`Service category is generic ("${ev.serviceCategory.label || 'none'}"); describe the job from ${ev.evidenceFields.join(', ')}.`);
  }
  return ev;
}

// ---- entity resolution ------------------------------------------------------

// Group customer records + booking rows into people and pick the one the
// query means. Never guesses between two plausible people.
export function resolvePerson(query, customers = [], bookingRows = []) {
  const q = norm(query).replace(/['’]s\b/g, '');
  const qDigits = digits(query);
  const words = q.split(' ').filter(Boolean);
  const people = new Map();

  for (const c of customers) {
    people.set(`c:${c.id}`, { key: `c:${c.id}`, customerId: c.id, name: fullName(c), phone: c.phone || null, email: c.email || null, vehicles: new Set(c.vehicle ? [c.vehicle] : []), jobIds: [], lastDate: null });
  }
  const byDigits = new Map([...people.values()].filter(p => digits(p.phone).length === 10).map(p => [digits(p.phone), p]));
  const byName = new Map([...people.values()].map(p => [norm(p.name), p]));

  for (const b of bookingRows) {
    let person = (b.customer_id && people.get(`c:${b.customer_id}`))
      || (digits(b.phone).length === 10 && byDigits.get(digits(b.phone)))
      || (!b.customer_id && byName.get(norm(fullName(b))));
    if (!person) {
      const key = digits(b.phone).length === 10 ? `p:${digits(b.phone)}` : `n:${norm(fullName(b))}`;
      person = people.get(key) || { key, customerId: b.customer_id || null, name: fullName(b), phone: b.phone || null, email: b.email || null, vehicles: new Set(), jobIds: [], lastDate: null };
      people.set(key, person);
      if (digits(b.phone).length === 10) byDigits.set(digits(b.phone), person);
      byName.set(norm(person.name), person);
    }
    if (b.vehicle) person.vehicles.add(b.vehicle);
    person.jobIds.push(b.id);
    if (b.date && (!person.lastDate || b.date > person.lastDate)) person.lastDate = b.date;
  }

  const score = p => {
    if (qDigits.length >= 7 && digits(p.phone).endsWith(qDigits)) return 3;
    const n = norm(p.name);
    if (n && n === q) return 3;
    if (words.length && words.every(w => n.split(' ').some(part => part.startsWith(w)))) return 2;
    return 0;
  };
  const scored = [...people.values()].map(p => ({ p, s: score(p) })).filter(x => x.s > 0);
  const best = Math.max(0, ...scored.map(x => x.s));
  const top = scored.filter(x => x.s === best).map(x => x.p);
  const shape = p => ({ key: p.key, customerId: p.customerId, name: p.name, phone: p.phone, email: p.email, vehicles: [...p.vehicles], jobCount: p.jobIds.length, lastJobDate: p.lastDate });

  if (!top.length) return { status: 'not_found', query };
  if (top.length > 1) return { status: 'ambiguous', query, candidates: top.map(shape) };
  return { status: 'resolved', person: shape(top[0]) };
}

// Does a row (job/lead/call) belong to the resolved person?
export function belongsToPerson(row, person) {
  if (person.customerId && row.customer_id) return row.customer_id === person.customerId;
  const pd = digits(person.phone);
  if (pd.length === 10 && digits(row.phone) === pd) return true;
  return norm(fullName(row)) !== '' && norm(fullName(row)) === norm(person.name);
}

// How an owner note relates to the person — the model is told the match quality.
export function noteMatch(note, person) {
  const pd = digits(person.phone);
  if (pd.length === 10 && digits(note.phone) === pd) return 'phone';
  const name = norm(person.name);
  const contact = norm(note.contact_name);
  if (contact && contact === name) return 'full_name';
  if (name && norm(note.raw_text).includes(name)) return 'mentions_full_name';
  const first = name.split(' ')[0];
  if (contact && first && contact === first) return 'first_name_only';
  return null;
}

// ---- customer history ------------------------------------------------------

const byDateAsc = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || ''));

export function buildCustomerHistory({ person, jobRows = [], leads = [], calls = [], notes = [], reminders = [] }, now = new Date()) {
  const today = phoenixToday(now);
  const rows = [...jobRows].sort(byDateAsc);
  // Full evidence for the newest 15 jobs; older ones keep the essentials.
  const cutoff = Math.max(0, rows.length - 15);
  const jobs = rows.map((r, i) => {
    const ev = jobEvidence(r);
    return i >= cutoff ? ev : {
      id: ev.id, date: ev.date, status: ev.status, cancelled: ev.cancelled, serviceCategory: ev.serviceCategory,
      vehicle: ev.vehicle, lineItems: ev.lineItems.map(li => li.label), scopeOfWork: ev.scopeOfWork ? clip(ev.scopeOfWork, 200) : null, olderJobCondensed: true,
    };
  });
  const active = jobs.filter(j => !j.cancelled);
  const past = active.filter(j => j.date && j.date <= today && !j.dateTbd);
  const future = active.filter(j => (j.date && j.date > today) || j.dateTbd);
  const lastVisit = past.length ? past[past.length - 1] : null;
  const nextVisit = future.length ? future[0] : null;

  const vehicles = [...new Set([...(person.vehicles || []), ...rows.map(r => r.vehicle)].map(v => String(v || '').trim()).filter(Boolean))];

  const openItems = [];
  for (const r of rows) {
    const j = jobFromRow(r);
    if (isAwaitingPayment(j) && jobBalance(j) > 0.01) openItems.push({ type: 'balance_owed', jobId: r.id, date: r.date, detail: `Owes $${jobBalance(j).toFixed(2)} (${r.job_status}).` });
    if (!isCancelled(j) && r.job_status === 'ESTIMATE_SENT') openItems.push({ type: 'estimate_awaiting_approval', jobId: r.id, date: r.date, detail: 'Estimate sent, not approved yet.' });
  }
  for (const n of notes) if (n.status === 'open' && (n.action_needed || n.due_at)) openItems.push({ type: 'owner_note_action', noteId: n.id, detail: n.action_needed || n.summary, due_at: n.due_at || null, match: n.match });
  for (const r of reminders) if (r.status === 'open') openItems.push({ type: 'reminder', reminderId: r.id, detail: r.title, due_at: r.due_at });

  const interactions = [
    ...calls.map(c => ({ at: c.created_at, kind: 'call', detail: `${c.direction || 'call'} — ${c.outcome || ''}${c.notes ? `: ${clip(c.notes, 200)}` : ''}` })),
    ...leads.filter(l => l.last_contacted_at).map(l => ({ at: l.last_contacted_at, kind: 'lead contact logged', detail: l.status })),
    ...notes.map(n => ({ at: n.created_at, kind: 'owner note', detail: n.summary })),
    ...past.map(j => ({ at: `${j.date}T12:00:00-07:00`, kind: 'visit', detail: j.serviceCategory?.label })),
  ].filter(x => x.at && Number.isFinite(new Date(x.at).getTime()));
  interactions.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    customer: { name: person.name, phone: person.phone, email: person.email, customerId: person.customerId },
    vehicles,
    jobCount: rows.length,
    cancelledJobCount: jobs.filter(j => j.cancelled).length,
    jobsChronological: jobs,
    lastVisitJobId: lastVisit?.id || null,
    nextVisitJobId: nextVisit?.id || null,
    openItems,
    lastInteraction: interactions[0] || null,
    leads: leads.map(l => ({ id: l.id, created_at: l.created_at, status: l.status, requested_service: l.requested_service, vehicle: l.vehicle, quote_amount: l.quote_amount ?? null, follow_up_at: l.follow_up_at, last_contacted_at: l.last_contacted_at, notes: clip(l.notes, 800) || null })),
    calls: calls.slice(0, 10).map(c => ({ at: c.created_at, direction: c.direction, outcome: c.outcome, notes: clip(c.notes, 400) || null })),
    ownerNotes: notes.map(n => ({ id: n.id, created_at: n.created_at, status: n.status, match: n.match, summary: n.summary, vehicle: n.vehicle, service: n.service, quoted_amount: n.quoted_amount ?? null, preferred_timing: n.preferred_timing, action_needed: n.action_needed, raw_text: clip(n.raw_text, 600) })),
  };
}
