// Helper pay rules (/admin/pay, pay_migration.sql). Pure functions; the server
// (functions/_lib/pay.js) and the page use the same ones. Tests: tests/pay.test.js
//
//   earned  = pay_entries  (hours × rate, or a flat amount for a job / bonus)
//   paid    = pay_payouts  (the money you actually sent — the business cost)
//   owed    = earned − paid
// Net profit subtracts PAYOUTS on the day paid (shared/business-metrics.js laborPaid),
// except the owner's own pay: GID is a single-owner LLC (owner decision
// 2026-10-06), so paying yourself is an owner's draw (equity_entries), never an expense.

import { addDaysYmd } from './business-metrics.js';

export const PAY_KINDS = { hours: 'Hours', job: 'Flat for a job', bonus: 'Bonus / other' };
export const PAYOUT_METHODS = ['Venmo', 'Cash', 'Zelle', 'Check', 'Bank transfer', 'Other'];
export const ROLES = { owner: 'Owner (you)', contractor: 'Contractor (1099)', employee: 'Employee (W-2)' };
// A payout that is the owner's draw (not a business expense).
export const isOwnerDraw = p => p?.owner_draw === true;
// Form 1099-NEC is required once one person is paid this much in a calendar
// year (raised from $600 for payments from 2026; inflation-adjusted from 2027).
export const NEC_THRESHOLD = 2000;

export const cents = n => Math.round(Number(n || 0) * 100) / 100;
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// What one entry is worth. Hours are paid at the entry's rate.
export function entryAmount({ kind, hours, rate, amount } = {}) {
  if (kind === 'hours') return cents(Number(hours || 0) * Number(rate || 0));
  return cents(amount);
}

// Validate + normalize a new entry. Throws Error with a plain message.
export function cleanEntry(f = {}) {
  if (!PAY_KINDS[f.kind]) throw new Error('Pick hours, flat for a job, or bonus.');
  if (!f.person_id) throw new Error('Pick who helped.');
  if (!isYmd(f.work_date)) throw new Error('Pick the work date.');
  const out = { person_id: String(f.person_id), work_date: f.work_date, kind: f.kind, booking_id: f.booking_id ? String(f.booking_id).slice(0, 100) : null, note: f.note ? String(f.note).trim().slice(0, 500) || null : null };
  if (f.kind === 'hours') {
    const hours = Number(f.hours); const rate = Number(f.rate);
    if (!(hours > 0 && hours <= 24)) throw new Error('Hours must be more than 0 and at most 24.');
    if (!(rate >= 0 && rate <= 1000)) throw new Error('Hourly rate must be between $0 and $1,000.');
    Object.assign(out, { hours: cents(hours), rate: cents(rate), amount: entryAmount({ kind: 'hours', hours, rate }) });
  } else {
    const amount = Number(f.amount);
    if (!(amount > 0 && amount <= 10000)) throw new Error('Amount must be more than $0 and at most $10,000.');
    Object.assign(out, { hours: null, rate: null, amount: cents(amount) });
  }
  return out;
}

export function cleanPayout(f = {}) {
  if (!f.person_id) throw new Error('Pick who you paid.');
  if (!isYmd(f.paid_on)) throw new Error('Pick the day you paid.');
  const amount = Number(f.amount);
  if (!(amount > 0 && amount <= 20000)) throw new Error('Amount must be more than $0 and at most $20,000.');
  const s = (v, n) => (v ? String(v).trim().slice(0, n) || null : null);
  return { person_id: String(f.person_id), paid_on: f.paid_on, amount: cents(amount), method: s(f.method, 40), reference: s(f.reference, 120), note: s(f.note, 500) };
}

// Per person: earned, paid, owed, and paid in `year` (for the 1099 check).
export function balances(people = [], entries = [], payouts = [], year = null) {
  const by = new Map(people.map(p => [p.id, { person: p, earned: 0, paid: 0, paidYear: 0, entries: 0 }]));
  for (const e of entries) { const b = by.get(e.person_id); if (b) { b.earned += Number(e.amount || 0); b.entries += 1; } }
  for (const p of payouts) {
    const b = by.get(p.person_id); if (!b) continue;
    b.paid += Number(p.amount || 0);
    if (year && String(p.paid_on).slice(0, 4) === String(year)) b.paidYear += Number(p.amount || 0);
  }
  // Only contractors get a 1099-NEC (employees get a W-2; the owner gets neither).
  return [...by.values()].map(b => ({ ...b, earned: cents(b.earned), paid: cents(b.paid), owed: cents(b.earned - b.paid), paidYear: cents(b.paidYear), needs1099: (b.person.role || 'contractor') === 'contractor' && b.paidYear >= NEC_THRESHOLD }));
}

// Weeks run Monday–Sunday on the Arizona calendar (date-only values, shifted
// with the shared date-only helper).
export function weekStart(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  return addDaysYmd(ymd, -dow);
}

// One person's last `count` weeks (newest first): hours worked, earned, paid.
export function weeklySummary(personId, entries = [], payouts = [], today, count = 6) {
  const first = weekStart(today);
  const weeks = Array.from({ length: count }, (_, i) => {
    const start = addDaysYmd(first, -7 * i);
    return { start, end: addDaysYmd(start, 6), hours: 0, earned: 0, paid: 0 };
  });
  const find = ymd => weeks.find(w => ymd >= w.start && ymd <= w.end);
  for (const e of entries) { if (e.person_id !== personId) continue; const w = find(String(e.work_date)); if (w) { w.hours += Number(e.hours || 0); w.earned += Number(e.amount || 0); } }
  for (const p of payouts) { if (p.person_id !== personId) continue; const w = find(String(p.paid_on)); if (w) w.paid += Number(p.amount || 0); }
  return weeks.map(w => ({ ...w, hours: cents(w.hours), earned: cents(w.earned), paid: cents(w.paid) }));
}
