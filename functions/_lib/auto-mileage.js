// Logs each finished day's job route to mileage_logs (rules: shared/mileage.js).
// Runs from the admin Jobs screen (`auto-mileage`). Google Routes per leg, the
// same lookup as the job's Auto-calc button. A failed lookup skips that day so
// a later run retries it; nothing is ever guessed.
import { jobFromRow } from '../../shared/business-metrics.js';
import { phoenixToday } from '../../shared/business-rules.js';
import { routesToLog, mileageRows, partsRunPlan, partsRunLogged, ratesForDate, AUTO_MILEAGE_SINCE } from '../../shared/mileage.js';
import { drivingMeters } from './google-maps.js';

const MAX_DAYS_PER_RUN = 5;
// GID serves ~30 miles around Flagstaff. A longer leg means Google matched an
// address to the wrong place (2026-11-22: "13280 I-40 Bellemont, AZ" came back
// ~1,700 mi away), so that day is left for a hand entry instead of logged.
export const MAX_LEG_MILES = 75;
const legMiles = async (apiKey, a, b, fetchImpl) => {
  const mi = (await drivingMeters(apiKey, a, b, { fetchImpl })) / 1609.344;
  if (!(mi <= MAX_LEG_MILES)) throw new Error(`implausible leg ${Math.round(mi)} mi`);
  return mi;
};

export async function autoMileage(env, { base, headers }, { fetchImpl = (...a) => fetch(...a), now = new Date() } = {}) {
  const apiKey = env.GOOGLE_DISTANCE_API_KEY || env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, reason: 'GOOGLE_DISTANCE_API_KEY not configured', logged: [] };
  const hr = await fetchImpl(`${base}/business_settings?id=eq.default&select=home_address`, { headers });
  const home = hr.ok ? String((await hr.json())?.[0]?.home_address || '').trim() : '';
  if (!home) return { ok: false, reason: 'Set your home address in the Mileage tab.', logged: [] };

  const cols = 'id,date,time,date_tbd,job_status,status,service_address,fname,lname';
  const br = await fetchImpl(`${base}/bookings?select=${cols}&date=gte.${AUTO_MILEAGE_SINCE}&limit=1000`, { headers });
  const mr = await fetchImpl(`${base}/mileage_logs?select=job_id&job_id=not.is.null&date=gte.${AUTO_MILEAGE_SINCE}&limit=5000`, { headers });
  if (!br.ok || !mr.ok) return { ok: false, reason: 'Could not read jobs or mileage', logged: [] };
  const jobs = (await br.json()).map(r => ({ ...jobFromRow(r), serviceAddress: r.service_address || '' }));
  const logged = new Set((await mr.json()).map(r => r.job_id));

  const out = []; const skipped = [];
  for (const day of routesToLog(jobs, logged, phoenixToday(now)).slice(0, MAX_DAYS_PER_RUN)) {
    const points = [home, ...day.stops.map(s => s.serviceAddress), home];
    let legs;
    try {
      legs = [];
      for (let i = 0; i < points.length - 1; i++) {
        legs.push(points[i] === points[i + 1] ? 0 : await legMiles(apiKey, points[i], points[i + 1], fetchImpl));
      }
    } catch { skipped.push(day.date); continue; } // unroutable or implausible: leave the day for a hand entry
    const rows = mileageRows(day, legs);
    const ir = await fetchImpl(`${base}/mileage_logs`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(rows.map(r => ({ created_at: now.toISOString(), ...r }))),
    });
    if (ir.ok) out.push({ date: day.date, jobs: rows.length, miles: Math.round(rows.reduce((s, r) => s + r.miles, 0) * 10) / 10 });
  }
  return { ok: true, logged: out, skipped };
}

// One parts run for a receipt that was just read (`log-parts-run`): reads the
// job and its receipt from the database, so only what's stored is trusted.
export async function logPartsRun(env, { base, headers }, { jobId, key }, { fetchImpl = (...a) => fetch(...a), now = new Date() } = {}) {
  const apiKey = env.GOOGLE_DISTANCE_API_KEY || env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !jobId || !key) return { ok: false, reason: 'missing' };
  const [jr, hr] = await Promise.all([
    fetchImpl(`${base}/bookings?id=eq.${encodeURIComponent(jobId)}&select=id,date,service_address,parts_receipts`, { headers }),
    fetchImpl(`${base}/business_settings?id=eq.default&select=home_address`, { headers }),
  ]);
  const row = jr.ok ? (await jr.json())?.[0] : null;
  const home = hr.ok ? (await hr.json())?.[0]?.home_address : '';
  if (!row) return { ok: false, reason: 'job not found' };
  let receipts = row.parts_receipts;
  if (typeof receipts === 'string') { try { receipts = JSON.parse(receipts); } catch { receipts = []; } }
  const receipt = (Array.isArray(receipts) ? receipts : []).find(r => r?.key === key);
  const plan = partsRunPlan({ receipt, job: { date: row.date, serviceAddress: row.service_address }, home, today: phoenixToday(now) });
  if (!plan) return { ok: true, skipped: 'no store address or date' };
  const er = await fetchImpl(`${base}/mileage_logs?select=date,notes&date=eq.${plan.date}&job_id=is.null`, { headers });
  if (!er.ok) return { ok: false, reason: 'could not read mileage' };
  if (partsRunLogged(await er.json(), plan)) return { ok: true, skipped: 'already logged' };
  let miles;
  try {
    miles = Math.round((await legMiles(apiKey, plan.origin, plan.address, fetchImpl)) * 2 * 10) / 10;
  } catch { return { ok: true, skipped: "Google couldn't route to that store" }; }
  const ir = await fetchImpl(`${base}/mileage_logs`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      created_at: now.toISOString(), date: plan.date, miles, rate_cents_per_mile: ratesForDate(plan.date),
      purpose: `Parts run — ${plan.store}`,
      notes: `Auto-logged from a receipt: ${plan.from} → ${plan.address} → back. receipt:${plan.key}`.slice(0, 500),
    }),
  });
  return ir.ok ? { ok: true, miles, date: plan.date } : { ok: false, reason: 'could not save' };
}
