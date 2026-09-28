// Service Area map overlays: built only from aggregated geography; tooltips are
// counts and public names, never customer details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFeatures, mapStats, radiusRing, radiusBounds } from '../src/command-center/seo/mapFeatures.ts';

const GEO = {
  areas: [{ slug: 'flagstaff', name: 'Flagstaff', lat: 35.198, lng: -111.651, count: 9, zone: 'core' }, { slug: 'munds-park', name: 'Munds Park', lat: 34.941, lng: -111.64, count: 3, zone: 'south' }],
  otherInArea: 2, outsideServiceArea: 1, unknownLocation: 4, total: 15,
  leads: { areas: [{ slug: 'flagstaff', name: 'Flagstaff', lat: 35.198, lng: -111.651, count: 1, zone: 'core' }], otherInArea: 0, outsideServiceArea: 2, unknownLocation: 5, total: 8 },
  competitors: [{ name: 'Rival Mobile', lat: 35.2, lng: -111.64, tier: 'primary' }, { name: 'Downtown Auto', lat: 35.19, lng: -111.65, tier: 'secondary' }],
  center: { lat: 35.1983, lng: -111.6513 }, radiusMiles: 30, privacy: 'Counts by community only.',
};

test('overlays: one numbered job marker and one lead ring per community, competitors as diamonds', () => {
  const f = mapFeatures(GEO);
  assert.deepEqual(f.filter(x => x.kind === 'jobs').map(x => [x.tooltip, x.count]), [['Flagstaff · 9 booked jobs', 9], ['Munds Park · 3 booked jobs', 3]]);
  assert.deepEqual(f.filter(x => x.kind === 'leads').map(x => x.tooltip), ['Flagstaff · 1 lead']);
  assert.deepEqual(f.filter(x => x.kind === 'competitor').map(x => [x.tooltip, x.primary]), [['Rival Mobile (mobile) · public Google Places location', true], ['Downtown Auto · public Google Places location', false]]);
  const job = f.find(x => x.key === 'job-flagstaff'); const lead = f.find(x => x.key === 'lead-flagstaff');
  assert.ok(lead.size > job.size, 'lead ring surrounds the job marker, so both stay visible');
  assert.ok(f[0].kind === 'leads', 'lead rings are drawn underneath');
});

test('tooltips can only carry community names, counts and public competitor names', () => {
  const withAddress = { ...GEO, areas: [{ ...GEO.areas[0], address: '101 Pine St', phone: '928-555-0100' }] };
  const text = JSON.stringify(mapFeatures(withAddress).map(x => x.tooltip));
  assert.doesNotMatch(text, /Pine St|555/);
});

test('legend numbers: jobs, leads, competitors, grouped, outside and unknown (jobs + leads)', () => {
  assert.deepEqual(Object.fromEntries(mapStats(GEO).map(s => [s.key, s.value])), { jobs: 15, leads: 8, competitors: 2, grouped: 2, outside: 3, unknown: 9 });
  assert.equal(mapStats({ ...GEO, leads: undefined, competitors: undefined }).find(s => s.key === 'competitors').value, 0); // older API response still renders
});

test('the service radius is a real 30-mile ring around Flagstaff, and the initial view fits all of it', () => {
  const center = { lat: 35.1983, lng: -111.6513 };
  const ring = radiusRing(center, 30);
  assert.deepEqual(ring[0], ring.at(-1)); // closed polygon
  const miles = ([lng, lat]) => { // haversine
    const r = Math.PI / 180; const a = Math.sin(((lat - center.lat) * r) / 2) ** 2 + Math.cos(center.lat * r) * Math.cos(lat * r) * Math.sin(((lng - center.lng) * r) / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(a));
  };
  for (const p of ring) assert.ok(Math.abs(miles(p) - 30) < 0.05, `${miles(p)} mi`);
  const [[w, s], [e, n]] = radiusBounds(center, 30);
  assert.ok(w < center.lng && e > center.lng && s < center.lat && n > center.lat);
  assert.ok(Math.abs((n - s) * 69 - 60) < 1); // ~60 miles tall
});
