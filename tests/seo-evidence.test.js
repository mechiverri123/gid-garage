// "LOCAL CONVERSION > RANKING": SEO priority uses what each service actually
// produced (leads, booked jobs, dashboard net profit) and schedule capacity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceEvidence, capacityFactor } from '../shared/seo/evidence.js';
import { localOpportunityScore } from '../shared/seo/scoring.js';
import { demandGaps } from '../shared/seo/demand.js';
import { detectStrikingDistance } from '../shared/seo/detectors.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const paidBrakeJob = (id, date, paid, parts) => ({ id, date, service: 'Front brake pads and rotors', job_status: 'PAID', status: 'confirmed', paid_at: `${date}T20:00:00Z`, amount_paid: paid, tax_amount: 0, parts_cost: parts, payments: [] });

test('evidence per service: leads, booked jobs and dashboard net profit over 12 months', () => {
  const ev = serviceEvidence({
    leads: [
      { created_at: '2026-08-01T10:00:00Z', requested_service: 'brake pads squeaking' },
      { created_at: '2026-09-01T10:00:00Z', requested_service: 'Brake job' },
      { created_at: '2024-01-01T10:00:00Z', requested_service: 'brakes' }, // older than 12 months
      { created_at: '2026-09-02T10:00:00Z', requested_service: 'battery dead' },
    ],
    bookings: [
      paidBrakeJob('B1', '2026-08-05', 400, 150),
      paidBrakeJob('B2', '2026-09-05', 300, 100),
      { ...paidBrakeJob('B3', '2026-09-06', 999, 0), job_status: 'CANCELLED', status: 'cancelled' },
    ],
  }, NOW);
  assert.deepEqual({ leads: ev.brakes.leads, bookings: ev.brakes.bookings, profit: ev.brakes.profit }, { leads: 2, bookings: 2, profit: 450 }); // (400-150)+(300-100); cancelled excluded
  assert.deepEqual({ leads: ev.battery.leads, bookings: ev.battery.bookings, profit: ev.battery.profit }, { leads: 1, bookings: 0, profit: 0 });
  assert.equal(ev.brakes.conversion.bookings, 2 / 12);
});

test('same search position and volume: the service that books profitable jobs ranks higher', () => {
  const base = { intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: true, position: 12, impressions: 40 };
  const converting = localOpportunityScore({ ...base, conversion: { leads: 2, bookings: 1.5, profit: 400 } }).score;
  const nothing = localOpportunityScore({ ...base, conversion: { leads: 0, bookings: 0, profit: 0 } }).score;
  const unknown = localOpportunityScore(base).score;
  assert.ok(converting > nothing, `${converting} > ${nothing}`);
  assert.equal(nothing, unknown); // no evidence = no bonus, never a penalty
});

test('a converting local query at #14 outranks a non-converting one with 10x the impressions', () => {
  const rows = [
    { query: 'mobile brake repair flagstaff', page: '/brakes', impressions: 40, clicks: 1, position: 14, intentClass: 'high_local_commercial', locality: 'likely_local', service: 'brakes' },
    { query: 'mobile oil change flagstaff', page: '/oil', impressions: 400, clicks: 5, position: 14, intentClass: 'high_local_commercial', locality: 'likely_local', service: 'oil' },
  ];
  const services = [{ id: 'brakes', offered: true }, { id: 'oil', offered: true }];
  const evidence = { brakes: { leads: 30, bookings: 24, profit: 7200, conversion: { leads: 2.5, bookings: 2, profit: 600 } } };
  const recs = detectStrikingDistance(rows, { services, evidence });
  const by = Object.fromEntries(recs.map(r => [r.service, r]));
  assert.ok(by.brakes.score > by.oil.score, `brakes ${by.brakes.score} vs oil ${by.oil.score}`);
  assert.deepEqual(by.brakes.evidence.last12Months, { leads: 30, bookedJobs: 24, netProfit: 7200 });
  assert.equal(by.oil.evidence.last12Months, undefined); // no invented evidence
});

test('demand gaps carry the 12-month evidence and rank by it', () => {
  const clusters = [
    { service: 'brakes', label: 'Brakes', localImpressions: 30, gbpImpressions: 0, avgLocalPosition: null, pages: [], offered: true },
    { service: 'battery', label: 'Battery', localImpressions: 30, gbpImpressions: 0, avgLocalPosition: null, pages: [], offered: true },
  ];
  const services = [{ id: 'brakes', offered: true }, { id: 'battery', offered: true }];
  const evidence = { brakes: { leads: 12, bookings: 10, profit: 3000, conversion: { leads: 1, bookings: 10 / 12, profit: 250 } } };
  const gaps = demandGaps(clusters, { services, evidence });
  assert.equal(gaps[0].service, 'brakes');
  assert.deepEqual(gaps[0].last12Months, { leads: 12, bookedJobs: 10, netProfit: 3000 });
});

test('capacity: a booked-out week lowers urgency but never zeroes it; thin history is neutral', () => {
  const weeksAgo = n => new Date(NOW.getTime() - n * 7 * 86400000 - 86400000).toISOString().slice(0, 10);
  const history = Array.from({ length: 12 }, (_, w) => Array.from({ length: 4 }, (_, i) => ({ id: `h${w}-${i}`, date: weeksAgo(w), job_status: 'COMPLETED', status: 'confirmed' }))).flat();
  const nextWeek = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, date: '2026-10-01', job_status: 'BOOKED', status: 'confirmed' }));
  assert.equal(capacityFactor([...history, ...nextWeek], NOW), 0); // as busy as a normal busy week
  assert.equal(capacityFactor(history, NOW), 1); // nothing booked yet
  assert.equal(capacityFactor(history.slice(0, 8), NOW), null); // 2 weeks of history: don't guess
  const base = { intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: true, position: 12, impressions: 40 };
  const full = localOpportunityScore({ ...base, capacity: 0 }).score;
  const open = localOpportunityScore({ ...base, capacity: 1 }).score;
  assert.ok(full > 0 && full < open);
});

// ---- map layers -----------------------------------------------------------------
import { createSeoOps } from '../functions/_lib/seo/ops.js';
import { fakeSeoStore } from './seo-fake-store.js';

test('map: leads by area (via their job address or notes), competitors inside the radius only, no addresses', async () => {
  const addr = i => `${100 + i} Pine St, Flagstaff, AZ 86001`;
  const store = fakeSeoStore({
    bookings: Array.from({ length: 4 }, (_, i) => ({ id: `B${i}`, date: '2026-09-01', service_address: addr(i), job_status: 'PAID', status: 'confirmed' })),
    leads: [
      { booking_id: 'B0', notes: '', created_at: '2026-08-30T10:00:00Z' },
      { booking_id: 'B1', notes: '', created_at: '2026-08-30T10:00:00Z' },
      { booking_id: null, notes: 'Lives in Flagstaff near the university', created_at: '2026-09-10T10:00:00Z' },
      { booking_id: null, notes: 'no location given', created_at: '2026-09-11T10:00:00Z' },
    ],
    seo_competitors: [
      { name: 'Rival Mobile', lat: 35.2, lng: -111.64, tier: 'primary', inside_service_area: true, status: 'active', kind: 'business' },
      { name: 'Phoenix Shop', lat: 33.45, lng: -112.07, tier: 'secondary', inside_service_area: false, status: 'active', kind: 'business' },
      { name: 'Hidden Address Mobile', lat: null, lng: null, tier: 'primary', inside_service_area: true, status: 'active', kind: 'business' },
    ],
  });
  const g = await createSeoOps({ store, env: {}, now: NOW }).customerGeography();
  assert.deepEqual(g.leads.areas.map(a => [a.slug, a.count]), [['flagstaff', 3]]);
  assert.equal(g.leads.unknownLocation, 1);
  assert.deepEqual(g.competitors.map(c => c.name), ['Rival Mobile']);
  assert.ok(!JSON.stringify(g).includes('Pine St')); // aggregated, never an address
});
