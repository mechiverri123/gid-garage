// Customer / job context for Jarvis. Turns raw bookings (+ leads, calls,
// owner notes, reminders) into labeled EVIDENCE the model summarizes. Each
// piece keeps the field it came from, so the model can say "based on the scope
// of work" and never has to guess. Pure functions; I/O lives in
// functions/_lib/business-data.js. Tests: tests/job-context.test.js.
//
// What the booking fields actually mean (from the admin UI, src/JobOps.tsx):
//   service          category: oil|brakes|diag|suspension|audio|full, or other /
//                    "General Inquiry" etc. — metadata, NOT a description of the work
//   notes            "Customer Notes": booking-form text "Address: … | Plate/VIN: … |
//                    Brake service: … | <customer's own words>", or owner-typed notes
//   estimate_notes   "Scope of Work" (printed on the estimate/invoice)
//   garage_notes     "Technician Notes" (internal)
//   line_items       billed items [{label, type: labor|parts|mobile|fixed|other|discount, amount}]
//   inspection_data  { tirePressure, tireTread: {fl,fr,rl,rr}, dtcCodes: [{code, plan}] }
//   job_photos / admin_photos   [{note, …}] — captions are often the real findings
//   pre_scan / post_scan        scan report documents {name, url}
//   vin, mileage, service_address   per-booking vehicle/visit facts
//   pre_existing_damage, adjustment_reason/amount, parts_receipts

import { jobFromRow, parsePayments } from './business-metrics.js';
import { isCancelled, jobBalance, phoenixToday, isAwaitingPayment, jobMoney } from './business-rules.js';

export const SERVICE_LABELS = {
  oil: 'Oil Change', brakes: 'Brakes', diag: 'Diagnostics', suspension: 'Suspension',
  audio: 'Car Audio', full: 'Full Service', other: 'Other / Custom',
};
// Only these say something specific about the work. Anything else ("other",
// "General Inquiry", blank) is a generic label and must not be used as the
// description when the job has real evidence.
const SPECIFIC_CATEGORIES = new Set(['oil', 'brakes', 'diag', 'suspension', 'audio', 'full']);

const CATEGORY_WORDS = {
  brakes: /\b(brake|pads?|rotors?|caliper)/i,
  oil: /\boil\b/i,
  diag: /\b(diag|check engine|codes?|scan|dtc|p[0-3]\d{3})/i,
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
const looksLikeVin = s => /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(s || '').replace(/\s/g, ''));
const cleanVin = s => String(s || '').replace(/\s/g, '').toUpperCase();

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

// Booking VIN: the vin column, else a VIN-shaped Plate/VIN booking-form entry.
export function bookingVin(row) {
  if (row.vin && String(row.vin).trim()) return cleanVin(row.vin);
  const plate = parseBookingNotes(row.notes).plateOrVin;
  return looksLikeVin(plate) ? cleanVin(plate) : null;
}

// One job as labeled evidence. Photo captions and scan documents are included
// whenever the row carries them (image data never is). `detail` adds receipts,
// payment history and longer text limits.
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
  const serviceId = String(row.service || '').trim();
  const serviceKey = serviceId.toLowerCase();
  const photoNotes = [...(parseJson(row.job_photos) || []), ...(parseJson(row.admin_photos) || [])]
    .map(p => clip(p?.note, 300)).filter(Boolean).slice(0, 30);
  const scanDocuments = [['Pre-scan', parseJson(row.pre_scan)], ['Post-scan', parseJson(row.post_scan)]]
    .filter(([, d]) => d && (d.name || d.url)).map(([k, d]) => `${k} report on file${d.name ? `: ${d.name}` : ''}`);

  const ev = {
    id: row.id,
    customer: fullName(row) || null,
    date: row.date || null,
    time: row.time || null,
    dateTbd: !!row.date_tbd,
    status: row.job_status || null,
    cancelled: isCancelled(job),
    serviceCategory: { value: serviceId || null, label: SERVICE_LABELS[serviceKey] || serviceId || null, generic: !SPECIFIC_CATEGORIES.has(serviceKey) },
    vehicle: row.vehicle || null,
    vin: bookingVin(row),
    mileage: row.mileage || null,
    serviceAddress: row.service_address || booking.address || null,
    // FACT sources, labeled by where they live.
    bookingRequest: { selections: booking.selections, text: clip(booking.text, limit) || null, source: 'bookings.notes (Customer Notes)' },
    scopeOfWork: scopeOfWork || null,          // bookings.estimate_notes
    technicianNotes: technicianNotes || null,  // bookings.garage_notes
    lineItems,                                 // bookings.line_items
    inspection,                                // bookings.inspection_data
    photoNotes,                                // job_photos/admin_photos captions
    scanDocuments,                             // pre_scan/post_scan
    preExistingDamage: clip(row.pre_existing_damage, 600) || null,
    priceAdjustment: row.adjustment_amount != null || row.adjustment_reason
      ? { amount: row.adjustment_amount ?? null, reason: clip(row.adjustment_reason, 400) || null } : null,
    // Money with explicit names. *_total = customer-facing (includes tax);
    // *_subtotal = pre-tax. Quote totals unless asked for the subtotal.
    money: { ...jobMoney(job), paidAt: row.paid_at || null },
    signedAt: row.signed_at || null,
  };

  if (detail) {
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
    photoNotes: photoNotes.join(' '),
    scanDocuments: scanDocuments.join(' '),
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
  if (!ev.serviceCategory.generic && CATEGORY_WORDS[serviceKey] && allText.trim() && !CATEGORY_WORDS[serviceKey].test(allText)) {
    ev.hints.push(`Service category is "${ev.serviceCategory.label}" but none of the job's notes or line items mention it — the category and the notes may disagree.`);
  }
  if (ev.serviceCategory.generic && ev.evidenceFields.length) {
    ev.hints.push(`Service category "${ev.serviceCategory.label || 'none'}" is only a generic label. Describe the job from ${ev.evidenceFields.join(', ')} — never as "${ev.serviceCategory.label || 'other'}".`);
  }
  return ev;
}

// ---- vehicles -------------------------------------------------------------------

const vehicleKey = v => norm(v).replace(/[^a-z0-9 ]/g, '');

export function vehicleMatches(vehicle, query) {
  const hay = vehicleKey(vehicle);
  const words = vehicleKey(query).split(' ').filter(Boolean);
  return !!hay && words.length > 0 && words.every(w => hay.split(' ').some(t => t === w || t.startsWith(w)));
}

// Reconcile per-vehicle facts across all of a person's bookings (+ the
// customer record). The VIN usually lives on the bookings, not the customer.
export function vehicleRecords(rows, customer = null) {
  const groups = new Map();
  for (const r of [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))) {
    if (!String(r.vehicle || '').trim()) continue;
    const key = vehicleKey(r.vehicle);
    const g = groups.get(key) || { vehicle: r.vehicle, bookingIds: [], vinSources: new Map(), mileage: [], serviceAddresses: new Set() };
    g.vehicle = r.vehicle; // most recent spelling
    g.bookingIds.push(r.id);
    const vin = bookingVin(r);
    if (vin) g.vinSources.set(vin, [...(g.vinSources.get(vin) || []), r.id]);
    if (String(r.mileage || '').trim()) g.mileage.push({ date: r.date || null, mileage: String(r.mileage).trim(), bookingId: r.id });
    const addr = r.service_address || parseBookingNotes(r.notes).address;
    if (addr) g.serviceAddresses.add(addr);
    groups.set(key, g);
  }
  const custVin = customer?.vin && String(customer.vin).trim() ? cleanVin(customer.vin) : null;
  if (custVin && customer?.vehicle) {
    const g = groups.get(vehicleKey(customer.vehicle));
    if (g) g.vinSources.set(custVin, [...(g.vinSources.get(custVin) || []), 'customer record']);
  }
  return [...groups.values()].map(g => {
    const vins = [...g.vinSources.entries()].map(([vin, sources]) => ({ vin, sources }));
    return {
      vehicle: g.vehicle,
      bookingIds: g.bookingIds,
      vin: vins.length === 1 ? vins[0].vin : null,
      vinStatus: vins.length === 0 ? 'none_on_file' : vins.length === 1 ? 'consistent' : 'conflicting',
      vins,
      mileageReadings: g.mileage,
      latestMileage: g.mileage.length ? g.mileage[g.mileage.length - 1] : null,
      serviceAddresses: [...g.serviceAddresses],
    };
  });
}

// ---- entity resolution ------------------------------------------------------

// People can exist in any business domain — a customers row is NOT required.
// Candidates come from customers, bookings and leads (merged by customer_id,
// phone, exact name). Owner-note subjects are a fallback: used only when no
// customer/booking/lead matches, so "Lisa" who only lives in notes resolves,
// but a first-name note never hides a real customer. Never guesses between
// two plausible people.
export function resolvePerson(query, customers = [], bookingRows = [], { leads = [], notes = [] } = {}) {
  const q = norm(query).replace(/['’]s\b/g, '');
  const qDigits = digits(query);
  const words = q.split(' ').filter(Boolean);
  const people = new Map();
  const byDigits = new Map();
  const byName = new Map();
  const index = p => {
    if (digits(p.phone).length === 10 && !byDigits.has(digits(p.phone))) byDigits.set(digits(p.phone), p);
    if (norm(p.name) && !byName.has(norm(p.name))) byName.set(norm(p.name), p);
  };
  const newPerson = (key, row, source) => {
    const p = { key, customerId: row.customer_id || null, name: fullName(row) || row.contact_name || '', phone: row.phone || null, email: row.email || null, vin: null, customerVehicle: null, vehicles: new Set(), jobIds: [], lastDate: null, sources: new Set([source]) };
    people.set(key, p);
    index(p);
    return p;
  };

  for (const c of customers) {
    const p = newPerson(`c:${c.id}`, { ...c, customer_id: c.id }, 'customer');
    p.vin = c.vin || null;
    p.customerVehicle = c.vehicle || null;
    if (c.vehicle) p.vehicles.add(c.vehicle);
  }
  const attach = (row, source) => {
    let person = (row.customer_id && people.get(`c:${row.customer_id}`))
      || (digits(row.phone).length === 10 && byDigits.get(digits(row.phone)))
      || (!row.customer_id && byName.get(norm(fullName(row))));
    if (!person) {
      const key = digits(row.phone).length === 10 ? `p:${digits(row.phone)}` : `n:${norm(fullName(row))}`;
      person = people.get(key) || newPerson(key, row, source);
    }
    person.sources.add(source);
    return person;
  };
  for (const b of bookingRows) {
    const person = attach(b, 'booking');
    if (b.vehicle) person.vehicles.add(b.vehicle);
    person.jobIds.push(b.id);
    if (b.date && (!person.lastDate || b.date > person.lastDate)) person.lastDate = b.date;
  }
  for (const l of leads) {
    if (!fullName(l) && digits(l.phone).length !== 10) continue;
    const person = attach(l, 'lead');
    if (l.vehicle) person.vehicles.add(l.vehicle);
  }

  const score = p => {
    if (qDigits.length >= 7 && digits(p.phone).endsWith(qDigits)) return 3;
    const n = norm(p.name);
    if (n && n === q) return 3;
    if (words.length && words.every(w => n.split(' ').some(part => part.startsWith(w)))) return 2;
    return 0;
  };
  const shape = p => ({
    key: p.key, customerId: p.customerId, name: p.name, phone: p.phone, email: p.email, vin: p.vin, customerVehicle: p.customerVehicle,
    vehicles: [...p.vehicles], jobCount: p.jobIds.length, lastJobDate: p.lastDate, sources: [...p.sources],
  });
  const pick = candidates => {
    const scored = candidates.map(p => ({ p, s: score(p) })).filter(x => x.s > 0);
    const best = Math.max(0, ...scored.map(x => x.s));
    return scored.filter(x => x.s === best).map(x => x.p);
  };

  let top = pick([...people.values()]);
  if (!top.length) {
    // Fallback domain: subjects of owner notes that aren't in any record.
    const subjects = new Map();
    for (const n of notes) {
      const name = String(n.contact_name || '').trim();
      if (!name && digits(n.phone).length !== 10) continue;
      const key = digits(n.phone).length === 10 ? `note-p:${digits(n.phone)}` : `note:${norm(name)}`;
      if (!subjects.has(key)) subjects.set(key, { key, customerId: null, name, phone: n.phone || null, email: n.email || null, vin: null, customerVehicle: null, vehicles: new Set(n.vehicle ? [n.vehicle] : []), jobIds: [], lastDate: null, sources: new Set(['note']) });
    }
    top = pick([...subjects.values()]);
  }
  if (!top.length) return { status: 'not_found', query };
  if (top.length > 1) return { status: 'ambiguous', query, candidates: top.map(shape) };

  const person = shape(top[0]);
  // Others sharing the first name are surfaced, never merged: "Lisa" in a note
  // may or may not be "Lisa Ray" the lead.
  const first = norm(person.name).split(' ')[0];
  const possibleRelated = first
    ? [...people.values()].filter(p => p !== top[0] && norm(p.name).split(' ')[0] === first).map(p => ({ name: p.name, sources: [...p.sources] }))
    : [];
  return { status: 'resolved', person, possibleRelated };
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
  if (name && name.includes(' ') && norm(note.raw_text).includes(name)) return 'mentions_full_name';
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
      vehicle: ev.vehicle, vin: ev.vin, mileage: ev.mileage, lineItems: ev.lineItems.map(li => li.label),
      scopeOfWork: ev.scopeOfWork ? clip(ev.scopeOfWork, 200) : null, olderJobCondensed: true,
    };
  });
  const active = jobs.filter(j => !j.cancelled);
  const past = active.filter(j => j.date && j.date <= today && !j.dateTbd);
  const future = active.filter(j => (j.date && j.date > today) || j.dateTbd);
  const lastVisit = past.length ? past[past.length - 1] : null;
  const nextVisit = future.length ? future[0] : null;

  const openItems = [];
  for (const r of rows) {
    const j = jobFromRow(r);
    if (isAwaitingPayment(j) && jobBalance(j) > 0.01) openItems.push({ type: 'balance_owed', jobId: r.id, date: r.date, detail: `Owes $${jobBalance(j).toFixed(2)} incl. tax (${r.job_status}).` });
    if (!isCancelled(j) && r.job_status === 'ESTIMATE_SENT') openItems.push({ type: 'estimate_awaiting_approval', jobId: r.id, date: r.date, detail: `Estimate sent (total $${(jobMoney(j).estimateTotal ?? 0).toFixed(2)} incl. tax), not approved yet.` });
  }
  const sortedNotes = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const n of sortedNotes) if (n.status === 'open' && (n.action_needed || n.due_at || n.preferred_timing)) openItems.push({ type: 'owner_note_action', noteId: n.id, detail: n.action_needed || n.summary, tentative_timing: n.preferred_timing || null, due_at: n.due_at || null, match: n.match });
  for (const r of reminders) if (r.status === 'open') openItems.push({ type: 'reminder', reminderId: r.id, detail: r.title, due_at: r.due_at });
  for (const l of leads) if (!['booked', 'lost'].includes(String(l.status || '').toLowerCase())) openItems.push({ type: 'open_lead', leadId: l.id, detail: `Lead is ${l.status}${l.follow_up_at ? `, follow-up ${l.follow_up_at}` : ''}.` });

  const interactions = [
    ...calls.map(c => ({ at: c.created_at, kind: 'call', detail: `${c.direction || 'call'} — ${c.outcome || ''}${c.notes ? `: ${clip(c.notes, 200)}` : ''}` })),
    ...leads.filter(l => l.last_contacted_at).map(l => ({ at: l.last_contacted_at, kind: 'lead contact logged', detail: l.status })),
    ...notes.map(n => ({ at: n.created_at, kind: 'owner note', detail: n.summary })),
    ...past.map(j => ({ at: `${j.date}T12:00:00-07:00`, kind: 'visit', detail: j.vehicle })),
  ].filter(x => x.at && Number.isFinite(new Date(x.at).getTime()));
  interactions.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    customer: { name: person.name, phone: person.phone, email: person.email, customerId: person.customerId, foundIn: person.sources || null },
    vehicleRecords: vehicleRecords(rows, person.vin ? { vin: person.vin, vehicle: person.customerVehicle } : null),
    jobCount: rows.length,
    cancelledJobCount: jobs.filter(j => j.cancelled).length,
    jobsChronological: jobs,
    lastVisitJobId: lastVisit?.id || null,
    nextVisitJobId: nextVisit?.id || null,
    openItems,
    lastInteraction: interactions[0] || null,
    latestOwnerNote: sortedNotes[0] ? { id: sortedNotes[0].id, created_at: sortedNotes[0].created_at, summary: sortedNotes[0].summary, raw_text: clip(sortedNotes[0].raw_text, 600), match: sortedNotes[0].match } : null,
    leads: leads.map(l => ({ id: l.id, created_at: l.created_at, status: l.status, requested_service: l.requested_service, vehicle: l.vehicle, quoteAmountAsEntered: l.quote_amount ?? null, follow_up_at: l.follow_up_at, last_contacted_at: l.last_contacted_at, notes: clip(l.notes, 800) || null })),
    calls: calls.slice(0, 10).map(c => ({ at: c.created_at, direction: c.direction, outcome: c.outcome, notes: clip(c.notes, 400) || null })),
    ownerNotes: sortedNotes.map(n => ({ id: n.id, created_at: n.created_at, status: n.status, match: n.match, summary: n.summary, vehicle: n.vehicle, service: n.service, quoted_amount: n.quoted_amount ?? null, preferred_timing: n.preferred_timing, action_needed: n.action_needed, raw_text: clip(n.raw_text, 600) })),
  };
}
