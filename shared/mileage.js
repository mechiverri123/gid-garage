// Business mileage (owner decision 2026-11-21: log job miles automatically).
// One route per day: home -> each finished job in appointment order -> home,
// split into one mileage_logs row per job (the leg to it; the last job also
// carries the drive home), so the day's rows add up to the real route rather
// than a round trip per job. Pure; I/O in functions/_lib/auto-mileage.js.
// Tests: tests/mileage.test.js

// IRS standard business mileage rate, cents/mile, effective from the given date.
// 2026 had a mid-year bump (Notice 2026-10 -> Rev. Proc. 2026-25, eff. Jul 1).
// Add new brackets here when the IRS announces future changes.
export const MILEAGE_RATE_BRACKETS = [
  { from: '2025-01-01', cents: 70 },
  { from: '2026-01-01', cents: 72.5 },
  { from: '2026-07-01', cents: 76 },
];
export function ratesForDate(dateStr) {
  let cents = MILEAGE_RATE_BRACKETS[0].cents;
  for (const b of MILEAGE_RATE_BRACKETS) {
    if (dateStr >= b.from) cents = b.cents; else break;
  }
  return cents;
}

// Days before this were logged by hand.
export const AUTO_MILEAGE_SINCE = '2026-11-21';
const DONE = ['COMPLETED', 'INVOICED', 'PAID'];

// '9:30 AM' / '14:00' -> minutes after midnight; unknown sorts last.
export function timeMinutes(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!m) return 24 * 60;
  const ap = m[3]?.toLowerCase();
  const h = ap ? (Number(m[1]) % 12) + (ap === 'pm' ? 12 : 0) : Number(m[1]);
  return h * 60 + Number(m[2]);
}

// jobs: camelCase jobs; logged: Set of job ids that already have a mileage row.
// -> [{ date, stops: [job, ...] }] for days ready to log: finished jobs with an
// address, on a day that is over or whose jobs are all finished, and with no
// job already logged that day (a hand entry wins; never double count).
export function routesToLog(jobs, logged, today, since = AUTO_MILEAGE_SINCE) {
  const byDay = new Map();
  for (const j of jobs) {
    if (!j.date || j.dateTbd || j.jobStatus === 'CANCELLED' || j.date < since || j.date > today) continue;
    if (!byDay.has(j.date)) byDay.set(j.date, []);
    byDay.get(j.date).push(j);
  }
  const out = [];
  for (const [date, day] of byDay) {
    if (day.some(j => logged.has(j.id))) continue;
    const done = day.filter(j => DONE.includes(j.jobStatus) && String(j.serviceAddress || '').trim());
    if (!done.length || (date === today && done.length < day.length)) continue;
    out.push({ date, stops: done.sort((a, b) => timeMinutes(a.time) - timeMinutes(b.time)) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// legsMiles: [home->1, 1->2, ..., last->home] -> one row per stop.
export function mileageRows({ date, stops }, legsMiles) {
  const r1 = n => Math.round(n * 10) / 10;
  const route = ['Home', ...stops.map(s => String(s.serviceAddress).split(',')[0]), 'Home'].join(' → ');
  return stops.map((s, i) => ({
    job_id: s.id,
    date,
    miles: r1(legsMiles[i] + (i === stops.length - 1 ? legsMiles[i + 1] : 0)),
    purpose: `Job — ${s.serviceAddress}`,
    notes: `Auto-logged. Day's route: ${route}`.slice(0, 500),
    rate_cents_per_mile: ratesForDate(date),
  }));
}

// Parts run from a read receipt (owner decision 2026-11-21): a round trip to
// the store printed on it, from the job site when it was bought on the job's
// day, otherwise from home. Needs the store's address; never guessed.
export function partsRunPlan({ receipt, job, home, today }) {
  const address = String(receipt?.readAddress || '').trim();
  if (!address || !receipt?.readTotal) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(receipt.readDate || '')) ? receipt.readDate : today;
  if (date < AUTO_MILEAGE_SINCE || date > today) return null;
  const fromJob = date === job?.date && String(job?.serviceAddress || '').trim();
  const origin = fromJob ? job.serviceAddress : String(home || '').trim();
  if (!origin) return null;
  return { date, origin, from: fromJob ? 'the job' : 'home', address, store: String(receipt.readStore || 'parts store').slice(0, 60), key: receipt.key };
}

// Same store, same day, or the same receipt: one trip, never two.
export function partsRunLogged(rows, plan) {
  const addr = plan.address.toLowerCase();
  return (rows || []).some(r => String(r.notes || '').includes(`receipt:${plan.key}`)
    || (r.date === plan.date && String(r.notes || '').toLowerCase().includes(addr)));
}
