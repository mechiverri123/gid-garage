// Extra Command Center data (additive fields on get-command-center-summary):
// daily trend series, a mixed activity feed, today's route stops and the
// weather. Pure functions over rows already fetched; money uses the
// canonical collectedByDay (shared/business-metrics.js), never a new formula.
// Tests: tests/command-center-extras.test.js

import { jobFromRow, collectedByDay, collectedRevenue, phoenixDateParts, resolvePeriodWindow } from '../../shared/business-metrics.js';
import { phoenixToday, addDays } from '../../shared/business-rules.js';
import { findPlaces, SERVICE_AREA, distanceMiles } from '../../shared/seo/service-area.js';

const dayOf = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = phoenixDateParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
const fullName = r => `${r?.fname || ''} ${r?.lname || ''}`.trim();
const isCancelledRow = b => b.job_status === 'CANCELLED' || String(b.status || '').toLowerCase() === 'cancelled';

// Last `days` Phoenix days (oldest first): leads created, leads booked (by
// the day the lead came in), and money collected that day.
export function trendSeries({ leads = [], jobs = [] }, now = new Date(), days = 90) {
  const today = phoenixToday(now);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const leadsBy = new Map(); const bookedBy = new Map();
  for (const l of leads) {
    const d = dayOf(l.created_at);
    if (!d) continue;
    leadsBy.set(d, (leadsBy.get(d) || 0) + 1);
    if (l.status === 'booked') bookedBy.set(d, (bookedBy.get(d) || 0) + 1);
  }
  const collected = collectedByDay(jobs.map(jobFromRow), dayOf);
  return dates.map(date => ({ date, leads: leadsBy.get(date) || 0, booked: bookedBy.get(date) || 0, collected: Math.round((collected.get(date) || 0) * 100) / 100 }));
}

// Recent real events only — every item has a real timestamp from its row.
export function activityFeed({ leads = [], jobs = [], calls = [], customers = [] }, now = new Date(), { days = 14, limit = 20 } = {}) {
  const since = now.getTime() - days * 86400000;
  const recent = iso => iso && new Date(iso).getTime() >= since && new Date(iso).getTime() <= now.getTime() + 60000;
  const out = [];
  for (const l of leads) if (recent(l.created_at)) out.push({ type: 'lead', at: l.created_at, title: `New lead: ${fullName(l) || l.phone || 'unknown'}`, detail: [l.requested_service, l.source].filter(Boolean).join(' · ') || null, leadId: l.id });
  for (const b of jobs) {
    if (recent(b.created_at) && !isCancelledRow(b)) out.push({ type: 'booking', at: b.created_at, title: `Job booked: ${fullName(b) || 'customer'}`, detail: [b.service, b.date].filter(Boolean).join(' · ') || null, jobId: b.id });
    let payments = b.payments;
    if (typeof payments === 'string') { try { payments = JSON.parse(payments); } catch { payments = []; } }
    for (const p of Array.isArray(payments) ? payments : []) {
      if (recent(p?.at)) out.push({ type: 'payment', at: p.at, title: `Payment received: $${Number(p.amount || 0).toFixed(2)}`, detail: fullName(b) || null, jobId: b.id, amount: Math.round(Number(p.amount || 0) * 100) / 100 });
    }
  }
  for (const c of calls) if (recent(c.created_at) && (c.outcome === 'missed' || c.outcome === 'no_answer')) out.push({ type: 'missed_call', at: c.created_at, title: 'Missed call', detail: c.phone || null, callId: c.id });
  for (const c of customers) if (recent(c.created_at)) out.push({ type: 'customer', at: c.created_at, title: `New customer: ${fullName(c) || 'unnamed'}`, detail: null });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Today's stops in time order. Locations are APPROXIMATE (the community the
// address names — there is no street-level geocoder), labeled as such.
export function todayRoute(jobs = [], now = new Date()) {
  const today = phoenixToday(now);
  const addressOf = b => b.service_address || (String(b.notes || '').match(/Address:\s*([^|]+)/)?.[1] ?? '').trim();
  const stops = jobs
    .filter(b => b.date === today && !isCancelledRow(b))
    .sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')))
    .map(b => {
      const address = addressOf(b);
      const places = findPlaces(address).places;
      const place = places.map(p => ({ p, d: distanceMiles(SERVICE_AREA.center, p) })).sort((x, y) => x.d - y.d)[0]?.p || null;
      return {
        id: b.id, time: b.time || null, customer: fullName(b) || null, vehicle: b.vehicle || null, service: b.service || null,
        status: b.job_status || null, address: address || null,
        lat: place?.lat ?? null, lng: place?.lng ?? null, place: place?.name ?? null, precision: place ? 'community' : 'unknown',
      };
    });
  return { start: { name: `${SERVICE_AREA.name} (start)`, lat: SERVICE_AREA.center.lat, lng: SERVICE_AREA.center.lng }, stops };
}

export function weatherToday(forecastRows = [], now = new Date()) {
  const today = phoenixToday(now);
  const rows = [...forecastRows].filter(r => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const fmt = r => ({ date: r.date, highF: r.tmax_f ?? null, lowF: r.tmin_f ?? null, summary: r.short_forecast ?? null });
  return rows.length ? { today: rows[0].date === today ? fmt(rows[0]) : null, next: rows.slice(rows[0].date === today ? 1 : 0, 4).map(fmt) } : null;
}

// "This month" panels: month-to-date vs the same days of last month. Money is
// the canonical collectedRevenue over the window (matches the Schedule
// dashboard); the daily trend only draws the sparklines.
export function monthStats({ leads = [], jobs = [] }, now = new Date()) {
  const today = phoenixToday(now);
  const [y, m, d] = today.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const curStart = `${y}-${pad(m)}-01`;
  const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
  const lastDayPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const prevStart = `${py}-${pad(pm)}-01`; const prevEnd = `${py}-${pad(pm)}-${pad(Math.min(d, lastDayPrev))}`;
  const inRange = (from, to) => iso => { const day = dayOf(iso); return !!day && day >= from && day <= to; };
  const metricJobs = jobs.map(jobFromRow);
  const period = (from, to) => {
    const w = inRange(from, to);
    const ls = leads.filter(l => w(l.created_at));
    const booked = ls.filter(l => l.status === 'booked').length;
    return { from, to, leads: ls.length, booked, conversionPct: ls.length ? Math.round((booked / ls.length) * 1000) / 10 : null, collected: Math.round(collectedRevenue(metricJobs, w).total * 100) / 100 };
  };
  return { current: period(curStart, today), previous: period(prevStart, prevEnd) };
}

// Revenue-trend headline totals: canonical collectedRevenue over the same
// rolling windows Jarvis uses for "last 7/30/90 days", so they always agree.
export function collectedTotals(jobs = [], now = new Date()) {
  const metricJobs = jobs.map(jobFromRow);
  const total = key => Math.round(collectedRevenue(metricJobs, resolvePeriodWindow(key, now).inWindow).total * 100) / 100;
  return { d7: total('last_7_days'), d30: total('last_30_days'), d90: total('last_90_days') };
}
