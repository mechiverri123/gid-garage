// Local-first SEO foundation: service area guard, intent, locality honesty, scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInsideServiceArea, distanceMiles, SERVICE_AREA, aggregateByArea } from '../shared/seo/service-area.js';
import { classifyQuery, gscLocality, cityLocality, firstPartyLocality } from '../shared/seo/local-intent.js';
import { localOpportunityScore } from '../shared/seo/scoring.js';

test('30-mile hard guard: coordinates, place names, ZIPs, far places, unknowns', () => {
  assert.equal(isInsideServiceArea({ lat: 35.1983, lng: -111.6513 }).inside, true);
  assert.equal(isInsideServiceArea('Sedona').inside, true); // ~23.5 mi straight line
  assert.equal(isInsideServiceArea('Williams').inside, false); // ~30.7 mi
  const winslow = isInsideServiceArea('Winslow, AZ');
  assert.deepEqual([winslow.inside, winslow.requiresExpansionDecision], [false, true]);
  assert.equal(isInsideServiceArea('123 Elm St, Flagstaff AZ 86001').inside, true);
  assert.equal(isInsideServiceArea('86011').place, 'nau');
  assert.equal(isInsideServiceArea('mechanic in las vegas').inside, false);
  assert.equal(isInsideServiceArea('brake repair').inside, null); // never guessed
  assert.ok(Math.abs(distanceMiles(SERVICE_AREA.center, { lat: 34.8697, lng: -111.7610 }) - 23.5) < 0.5);
});

test('service-area aggregation hides small groups and never returns addresses', () => {
  const recs = [...Array(4)].map(() => ({ address: 'Flagstaff AZ' })).concat([{ address: 'Bellemont' }, { address: 'Phoenix' }, { address: '' }]);
  const a = aggregateByArea(recs);
  assert.deepEqual(a.areas.map(x => [x.slug, x.count]), [['flagstaff', 4]]);
  assert.equal(a.otherInArea, 1); // Bellemont (1) folded — can't single out a customer
  assert.equal(a.outsideServiceArea, 1);
  assert.equal(a.unknownLocation, 1);
  assert.ok(!JSON.stringify(a).includes('Elm'));
});

test('local-intent classifier matches the spec examples', () => {
  const cls = q => classifyQuery(q).intentClass;
  assert.equal(cls('mobile mechanic flagstaff'), 'high_local_commercial');
  assert.equal(cls('mechanic near me'), 'high_local_commercial');
  assert.equal(cls('mobile brake repair flagstaff'), 'high_local_commercial');
  assert.equal(cls('car diagnostic flagstaff'), 'high_local_commercial');
  assert.equal(cls("why car won't start in cold flagstaff"), 'local_informational');
  assert.equal(cls('mobile brake repair'), 'service_no_geo');
  assert.equal(cls('GID Garage Flagstaff'), 'branded_local');
  assert.equal(cls('Toyota brake torque specification'), 'nonlocal_low_value');
  assert.equal(cls('history of disc brakes'), 'global_informational');
  assert.equal(cls('mechanic phoenix'), 'nonlocal_low_value');
  assert.equal(classifyQuery('ac repair flagstaff').serviceOffered, false); // referred out per FAQ
});

test('locality labels are honest: Search Console is never "confirmed_local"', () => {
  for (const q of ['mobile mechanic flagstaff', 'mechanic near me', 'gid garage']) assert.equal(gscLocality({ query: q, country: 'usa' }), 'likely_local');
  assert.equal(gscLocality({ query: 'brake repair', country: 'usa' }), 'unknown');
  assert.equal(gscLocality({ query: 'brake repair', country: 'gbr' }), 'nonlocal');
  assert.equal(gscLocality({ query: 'mechanic phoenix', country: 'usa' }), 'nonlocal');
  assert.equal(cityLocality({ city: 'Flagstaff', region: 'Arizona', country: 'United States' }), 'likely_local');
  assert.equal(cityLocality({ city: 'Phoenix', region: 'Arizona', country: 'United States' }), 'unknown'); // mobile-carrier IPs
  assert.equal(cityLocality({ city: 'Denver', region: 'Colorado', country: 'United States' }), 'nonlocal');
  assert.equal(firstPartyLocality('55 Pine Ave, Flagstaff, AZ 86001'), 'confirmed_local');
});

test('scoring: 40 local commercial impressions beat 1,000 global informational ones', () => {
  const local = localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: true, position: 7, impressions: 40 });
  const global = localOpportunityScore({ intentClass: 'global_informational', locality: 'unknown', serviceOffered: true, position: 5, impressions: 1000 });
  assert.ok(local.score > global.score * 5, `${local.score} vs ${global.score}`);
  assert.equal(localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: false, impressions: 5000 }).blocked, 'service_not_offered');
  assert.equal(localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'nonlocal', serviceOffered: true, impressions: 5000 }).score, 0);
  const outside = localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: true, insideServiceArea: false });
  assert.deepEqual([outside.score, outside.requiresExpansionDecision], [0, true]);
  const withBookings = localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: true, position: 7, impressions: 40, conversion: { bookings: 2 } });
  assert.ok(withBookings.score > local.score);
});
