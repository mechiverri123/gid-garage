// Redesigned Command Center data: every number comes from real rows, and money
// per day uses the canonical dashboard formula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectedByDay, collectedRevenue, jobFromRow } from '../shared/business-metrics.js';
import { trendSeries, activityFeed, todayRoute, weatherToday, monthStats, collectedTotals } from '../functions/_lib/command-center-extras.js';
import { resolvePeriodWindow } from '../shared/business-metrics.js';

const NOW = new Date('2026-09-28T19:00:00Z'); // 12:00 in Phoenix
const phx = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const dayWindow = day => iso => phx(iso) === day;

const JOBS = [
  { id: 'A', job_status: 'PAID', paid_at: '2026-09-27T18:00:00Z', invoice_amount: 300, tax_amount: 20, amount_paid: 320, payments: JSON.stringify([{ amount: 100, at: '2026-09-26T18:00:00Z' }, { amount: 220, at: '2026-09-27T18:00:00Z' }]) },
  { id: 'B', job_status: 'PAID', paid_at: '2026-09-28T01:00:00Z', invoice_amount: 200, tax_amount: 10, amount_paid: 210, payments: '[]' }, // Stripe retry: no log -> fallback, Phoenix day 09-27
  { id: 'C', job_status: 'INVOICED', invoice_amount: 500, tax_amount: 0, amount_paid: 150, payments: [{ amount: 150, at: '2026-09-28T16:00:00Z' }] },
  { id: 'D', job_status: 'PAID', paid_at: '2026-09-28T17:00:00Z', invoice_amount: 400, tax_amount: 0, amount_paid: 400, payments: [{ amount: 100, at: '2026-09-25T17:00:00Z' }] }, // partial log + fallback
];

test('collectedByDay: each day equals the canonical collectedRevenue for that single day', () => {
  const jobs = JOBS.map(jobFromRow);
  const byDay = collectedByDay(jobs, phx);
  for (const day of ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']) {
    assert.equal(byDay.get(day) || 0, collectedRevenue(jobs, dayWindow(day)).total, day);
  }
  assert.deepEqual(Object.fromEntries(byDay), { '2026-09-25': 100, '2026-09-26': 100, '2026-09-27': 430, '2026-09-28': 550 });
});

test('trend series: 90 Phoenix days, oldest first, leads/booked by lead day and collected money', () => {
  const t = trendSeries({ jobs: JOBS, leads: [
    { created_at: '2026-09-28T15:00:00Z', status: 'booked' }, { created_at: '2026-09-28T16:00:00Z', status: 'new' },
    { created_at: '2026-09-28T06:30:00Z', status: 'new' }, // 23:30 on 09-27 in Phoenix
  ] }, NOW, 90);
  assert.equal(t.length, 90);
  assert.equal(t.at(-1).date, '2026-09-28');
  assert.deepEqual(t.at(-1), { date: '2026-09-28', leads: 2, booked: 1, collected: 550 });
  assert.deepEqual(t.at(-2), { date: '2026-09-27', leads: 1, booked: 0, collected: 430 });
});

test('activity feed: only real timestamped events, newest first, nothing invented', () => {
  const feed = activityFeed({
    leads: [{ id: 'L1', created_at: '2026-09-28T17:00:00Z', fname: 'Dana', lname: 'Cruz', requested_service: 'brakes', source: 'website' }, { id: 'L0', created_at: '2026-08-01T00:00:00Z', fname: 'Old' }],
    jobs: [{ id: 'J1', created_at: '2026-09-27T12:00:00Z', fname: 'Ray', service: 'Oil change', date: '2026-09-29', payments: [{ amount: 89.99, at: '2026-09-28T18:00:00Z' }] }, { id: 'J2', created_at: '2026-09-27T13:00:00Z', job_status: 'CANCELLED', fname: 'Gone' }],
    calls: [{ id: 'C1', created_at: '2026-09-28T16:00:00Z', outcome: 'missed', phone: '928-555-0100' }, { id: 'C2', created_at: '2026-09-28T16:30:00Z', outcome: 'answered' }],
    customers: [{ id: 'U1', created_at: '2026-09-26T10:00:00Z', fname: 'Ray', lname: 'Ortiz' }],
  }, NOW);
  assert.deepEqual(feed.map(e => e.type), ['payment', 'lead', 'missed_call', 'booking', 'customer']);
  assert.equal(feed[0].title, 'Payment received: $89.99');
  assert.ok(!feed.some(e => /Old|Gone/.test(e.title)));
});

test("today's route: time order, approximate community location labeled, unknown when no place", () => {
  const r = todayRoute([
    { id: 'J2', date: '2026-09-28', time: '14:00', fname: 'Ray', service_address: '12 Main St, Munds Park, AZ', job_status: 'BOOKED' },
    { id: 'J1', date: '2026-09-28', time: '09:00', fname: 'Dana', service_address: '400 Elm, Flagstaff AZ 86001' },
    { id: 'J3', date: '2026-09-28', time: '11:00', fname: 'Ann', service_address: '' },
    { id: 'J4', date: '2026-09-28', time: '10:00', fname: 'X', job_status: 'CANCELLED', service_address: 'Flagstaff' },
    { id: 'J5', date: '2026-09-29', time: '08:00', fname: 'Tomorrow', service_address: 'Flagstaff' },
  ], NOW);
  assert.deepEqual(r.stops.map(s => [s.id, s.place, s.precision]), [['J1', 'Flagstaff', 'community'], ['J3', null, 'unknown'], ['J2', 'Munds Park', 'community']]);
  assert.equal(r.start.name, 'Flagstaff, AZ (start)');
});

test('weather: today + next days from the NWS forecast rows; none -> null', () => {
  const w = weatherToday([{ date: '2026-09-29', tmin_f: 40, tmax_f: 66, short_forecast: 'Sunny' }, { date: '2026-09-28', tmin_f: 42, tmax_f: 70, short_forecast: 'Thunderstorms' }], NOW);
  assert.deepEqual(w.today, { date: '2026-09-28', highF: 70, lowF: 42, summary: 'Thunderstorms' });
  assert.equal(w.next[0].date, '2026-09-29');
  assert.equal(weatherToday([], NOW), null);
});

test('this month: money equals the canonical dashboard figure (collectedRevenue over this_month), compared with the same days last month', () => {
  const jobs = [...JOBS, { id: 'E', job_status: 'PAID', paid_at: '2026-08-20T18:00:00Z', invoice_amount: 90, tax_amount: 0, amount_paid: 90, payments: [{ amount: 90, at: '2026-08-20T18:00:00Z' }] },
    { id: 'F', job_status: 'PAID', paid_at: '2026-08-30T18:00:00Z', invoice_amount: 70, tax_amount: 0, amount_paid: 70, payments: [{ amount: 70, at: '2026-08-30T18:00:00Z' }] }];
  const leads = [{ created_at: '2026-09-02T18:00:00Z', status: 'booked' }, { created_at: '2026-09-10T18:00:00Z', status: 'new' }, { created_at: '2026-08-15T18:00:00Z', status: 'booked' }];
  const m = monthStats({ leads, jobs }, NOW);
  const canonical = collectedRevenue(jobs.map(jobFromRow), resolvePeriodWindow('this_month', NOW).inWindow).total;
  assert.equal(m.current.collected, Math.round(canonical * 100) / 100);
  assert.deepEqual({ from: m.current.from, to: m.current.to, leads: m.current.leads, booked: m.current.booked, conversionPct: m.current.conversionPct }, { from: '2026-09-01', to: '2026-09-28', leads: 2, booked: 1, conversionPct: 50 });
  assert.deepEqual([m.previous.from, m.previous.to, m.previous.leads, m.previous.collected], ['2026-08-01', '2026-08-28', 1, 90]); // Aug 30 is past the same-day cutoff
});

test('revenue-trend totals use the same canonical rolling windows Jarvis uses', () => {
  const t = collectedTotals(JOBS, NOW);
  const jobs = JOBS.map(jobFromRow);
  for (const [k, key] of [['d7', 'last_7_days'], ['d30', 'last_30_days'], ['d90', 'last_90_days']]) {
    assert.equal(t[k], Math.round(collectedRevenue(jobs, resolvePeriodWindow(key, NOW).inWindow).total * 100) / 100, k);
  }
  // Canonical, not the sum of daily bars (1180): job D's $100 logged payment is
  // replaced by its $400 paid-in-full fallback within one window.
  assert.equal(t.d7, 1080);
});
