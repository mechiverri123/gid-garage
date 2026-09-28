// First-party business evidence for SEO priority ("LOCAL CONVERSION > RANKING"):
// which services actually turn into leads, booked jobs and profit, and how
// much room the schedule has. Feeds localOpportunityScore; the money comes from
// the canonical dashboard formulas (shared/business-metrics.js), never a copy.
// Tests: tests/seo-evidence.test.js

import { detectService } from './local-intent.js';
import { jobFromRow, netProfit, resolvePeriodWindow } from '../business-metrics.js';
import { isCancelled } from '../business-rules.js';

const DAY = 86400000;
const cents = n => Math.round(n * 100) / 100;

// Per service id, over the last 365 days: leads asking for it, booked jobs
// (not cancelled), and dashboard net profit. `conversion` is the monthly
// average, the scale conversionFactor expects.
export function serviceEvidence({ leads = [], bookings = [] }, now = new Date()) {
  const win = resolvePeriodWindow('last_365_days', now);
  const out = {};
  const bucket = id => (out[id] ||= { leads: 0, bookings: 0, profit: 0 });
  for (const l of leads) {
    if (!win.inWindow(l.created_at)) continue;
    const s = detectService(l.requested_service || '');
    if (s) bucket(s.id).leads += 1;
  }
  for (const r of bookings) {
    const job = jobFromRow(r);
    if (isCancelled(job)) continue;
    const s = detectService(r.service || '');
    if (!s) continue;
    const b = bucket(s.id);
    if (r.date && win.inWindow(`${r.date}T12:00:00Z`)) b.bookings += 1;
    b.profit += netProfit([job], win.inWindow);
  }
  for (const b of Object.values(out)) {
    b.profit = cents(b.profit);
    b.conversion = { leads: b.leads / 12, bookings: b.bookings / 12, profit: b.profit / 12 };
  }
  return out;
}

// Room left in the next 7 days, 0 (booked out) … 1 (empty), against a normal
// busy week = 90th percentile of the last 26 weeks. null = too little history
// to judge, which the score treats as neutral.
export function capacityFactor(bookings = [], now = new Date()) {
  const t = now.getTime();
  const weeks = new Array(26).fill(0);
  let upcoming = 0;
  for (const r of bookings) {
    const job = jobFromRow(r);
    if (isCancelled(job) || !r.date || job.dateTbd) continue;
    const ms = new Date(`${r.date}T12:00:00Z`).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > t && ms <= t + 7 * DAY) upcoming += 1;
    else if (ms <= t && t - ms < 26 * 7 * DAY) weeks[Math.floor((t - ms) / (7 * DAY))] += 1;
  }
  if (weeks.filter(n => n > 0).length < 8) return null;
  const sorted = [...weeks].sort((a, b) => a - b);
  const busyWeek = sorted[Math.floor(0.9 * (sorted.length - 1))];
  if (!busyWeek) return null;
  return Math.max(0, Math.min(1, 1 - upcoming / busyWeek));
}

// The scoring inputs for one service.
export const evidenceFor = (evidence, service) => evidence?.[service]?.conversion;
