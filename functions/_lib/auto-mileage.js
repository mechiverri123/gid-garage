// Logs each finished day's job route to mileage_logs (rules: shared/mileage.js).
// Runs from the admin Jobs screen (`auto-mileage`). Google Routes per leg, the
// same lookup as the job's Auto-calc button. A failed lookup skips that day so
// a later run retries it; nothing is ever guessed.
import { jobFromRow } from '../../shared/business-metrics.js';
import { phoenixToday } from '../../shared/business-rules.js';
import { routesToLog, mileageRows, AUTO_MILEAGE_SINCE } from '../../shared/mileage.js';
import { drivingMeters } from './google-maps.js';

const MAX_DAYS_PER_RUN = 5;

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

  const out = [];
  for (const day of routesToLog(jobs, logged, phoenixToday(now)).slice(0, MAX_DAYS_PER_RUN)) {
    const points = [home, ...day.stops.map(s => s.serviceAddress), home];
    let legs;
    try {
      legs = [];
      for (let i = 0; i < points.length - 1; i++) {
        legs.push(points[i] === points[i + 1] ? 0 : (await drivingMeters(apiKey, points[i], points[i + 1], { fetchImpl })) / 1609.344);
      }
    } catch { continue; } // address Google can't route: leave the day for a hand entry
    const rows = mileageRows(day, legs);
    const ir = await fetchImpl(`${base}/mileage_logs`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(rows.map(r => ({ created_at: now.toISOString(), ...r }))),
    });
    if (ir.ok) out.push({ date: day.date, jobs: rows.length, miles: Math.round(rows.reduce((s, r) => s + r.miles, 0) * 10) / 10 });
  }
  return { ok: true, logged: out };
}
