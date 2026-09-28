// Blocker 1: only services GID explicitly offers may produce SEO work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceEligibility, resolveServices, SERVICE_CATALOG } from '../shared/seo/services.js';
import { annotateGsc } from '../shared/seo/kpis.js';
import { runDetectors, detectCtrOpportunities, detectStrikingDistance, detectSeasonalPrep, detectColdSnap, serviceGate } from '../shared/seo/detectors.js';
import { serviceClusters, demandGaps, unconfirmedServiceDemand } from '../shared/seo/demand.js';

const NOW = new Date('2026-07-20T19:00:00Z');
const row = (query, position, impressions = 200) => ({ query, page: 'https://gidgarage.com/', clicks: 0, impressions, position, country: 'usa' });

test('eligibility: offered services pass; referred-out, unconfirmed and unknown fail', () => {
  for (const id of ['brakes', 'oil', 'diagnostics', 'suspension', 'audio', 'maintenance', 'general']) assert.equal(serviceEligibility(id).eligible, true, id);
  for (const id of ['ac', 'alignment', 'transmission', 'welding']) assert.equal(serviceEligibility(id).reason, 'referred_out', id);
  for (const id of ['tires', 'battery', 'inspection', 'body', 'towing', 'repairs_other']) assert.equal(serviceEligibility(id).reason, 'unconfirmed', id);
  assert.equal(serviceEligibility('hovercraft').reason, 'unknown_service');
  assert.equal(serviceEligibility(null).reason, 'no_service');
});

test('battery / no-start is NOT inferred from "general repair" — only an explicit owner setting enables it', () => {
  assert.equal(SERVICE_CATALOG.find(s => s.id === 'battery').offered, 'unknown');
  const confirmed = resolveServices([{ id: 'battery', offered: true }]);
  assert.equal(serviceEligibility('battery', confirmed).eligible, true);
  assert.match(confirmed.find(s => s.id === 'battery').source, /^owner setting/);
  assert.equal(serviceEligibility('ac', resolveServices([{ id: 'ac', offered: 'maybe' }])).eligible, false); // invalid values ignored
});

test('CTR and striking-distance never target A/C, tires or unconfirmed services', () => {
  const a = annotateGsc([row('ac repair flagstaff', 5), row('tire change flagstaff', 5), row('battery replacement flagstaff', 6), row('brake repair flagstaff', 5),
    row('ac recharge flagstaff', 12), row('tire rotation flagstaff', 14), row('mobile mechanic flagstaff', 12)]);
  assert.deepEqual(detectCtrOpportunities(a).map(r => r.evidence.query), ['brake repair flagstaff']);
  assert.deepEqual(detectStrikingDistance(a).map(r => r.evidence.query), ['mobile mechanic flagstaff']);
  // once the owner confirms tires, tire queries become eligible
  const withTires = resolveServices([{ id: 'tires', offered: true }]);
  assert.deepEqual(detectCtrOpportunities(a, { services: withTires }).map(r => r.evidence.query).sort(), ['brake repair flagstaff', 'tire change flagstaff']);
});

test('seasonal prep and cold-snap notes skip services that are not offered', () => {
  const uplift = s => ({ event: 'nau_fall_move_in', label: 'NAU move-in', verdict: 'uplift', series: s, window: { start: '2025-08-15', end: '2025-08-28' }, statement: 'x', approximateDates: true });
  const recs = detectSeasonalPrep([uplift('local searches:ac'), uplift('leads:tires'), uplift('leads:brakes'), uplift('leads')], [], { now: NOW });
  assert.deepEqual(recs.map(r => r.evidence.series).sort(), ['leads', 'leads:brakes']);
  const snap = { start: '2026-10-20', end: '2026-10-22', lowestF: 12 };
  assert.deepEqual(detectColdSnap(snap, []), []); // battery unconfirmed
  assert.equal(detectColdSnap(snap, [], { services: resolveServices([{ id: 'battery', offered: true }]) }).length, 1);
});

test('demand gaps and the final gate: unconfirmed demand is reported, never recommended', () => {
  const rows = [row('battery replacement flagstaff', 25, 300), row('tire shop flagstaff', 30, 200), row('ac repair flagstaff', 30, 500), row('brake repair flagstaff', 22, 60)];
  const clusters = serviceClusters(rows);
  assert.deepEqual(demandGaps(clusters).map(g => g.service), ['brakes']);
  assert.deepEqual(unconfirmedServiceDemand(clusters).map(u => u.service).sort(), ['battery', 'tires']);
  const all = runDetectors({ annotatedGsc: annotateGsc(rows), clusters, gaps: demandGaps(clusters), upcomingColdSnap: { start: '2026-10-20', lowestF: 12 } }, { now: NOW });
  assert.ok(all.every(r => !r.service || serviceEligibility(r.service).eligible), JSON.stringify(all.map(r => [r.type, r.service])));
  assert.ok(!all.some(r => ['ac', 'tires', 'battery'].includes(r.service)));
  // the gate itself, for any detector added later
  assert.deepEqual(serviceGate([{ id: '1', service: 'ac' }, { id: '2', service: 'tires' }, { id: '3', service: 'brakes' }, { id: '4' }]).map(r => r.id), ['3', '4']);
});
