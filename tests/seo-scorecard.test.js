// Scorecard (SEO → Scorecard tab): Google search standing + review race.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchStanding, reviewRace } from '../shared/seo/agent.js';

test('searchStanding: impression-weighted position per search and overall, now vs before', () => {
  const cur = [
    { query: 'mobile mechanic flagstaff', position: 4, impressions: 30, clicks: 2 },
    { query: 'mobile mechanic flagstaff', position: 8, impressions: 10, clicks: 0 },
    { query: 'brake repair flagstaff az', position: 2, impressions: 60, clicks: 1 },
  ];
  const prev = [{ query: 'mobile mechanic flagstaff', position: 9, impressions: 20, clicks: 1 }];
  const out = searchStanding(cur, prev, { core: ['mobile mechanic flagstaff', 'mobile mechanic'], extra: 5 });
  const mm = out.searches.find(s => s.query === 'mobile mechanic flagstaff');
  assert.equal(mm.position, 5); // (4*30 + 8*10) / 40
  assert.equal(mm.previousPosition, 9);
  assert.equal(mm.clicks, 2);
  // Core searches stay listed with no data; busiest other searches follow.
  assert.deepEqual(out.searches.map(s => s.query), ['mobile mechanic flagstaff', 'mobile mechanic', 'brake repair flagstaff az']);
  assert.equal(out.searches[1].position, null);
  assert.equal(out.totals.position, 3.2); // (120 + 80 + 120) / 100
  assert.equal(out.totals.previousPosition, 9);
  assert.equal(out.totals.impressions, 100);
});

test('reviewRace: gain over the last 30 days, mobile mechanics only, GID placed', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const comps = [
    { id: 'w', name: 'Woody', is_mobile: true },
    { id: 'm', name: 'Munoz', is_mobile: true },
    { id: 's', name: 'Shop', is_mobile: false },
    { id: 'far', name: 'Far away', is_mobile: true, inside_service_area: false },
  ];
  const snaps = [
    { subject: 'own', review_count: 18, captured_at: '2026-09-01T00:00:00Z' },
    { subject: 'own', review_count: 22, captured_at: '2026-09-20T00:00:00Z' }, // last one before the cutoff (Sep 17)? no: after it
    { subject: 'own', review_count: 26, captured_at: '2026-10-15T00:00:00Z' },
    { subject: 'w', review_count: 17, captured_at: '2026-09-28T00:00:00Z' },
    { subject: 'w', review_count: 18, captured_at: '2026-10-15T00:00:00Z' },
    { subject: 'm', review_count: 250, captured_at: '2026-10-15T00:00:00Z' },
    { subject: 's', review_count: 100, captured_at: '2026-09-28T00:00:00Z' },
    { subject: 's', review_count: 140, captured_at: '2026-10-15T00:00:00Z' },
    { subject: 'far', review_count: 5, captured_at: '2026-09-28T00:00:00Z' },
    { subject: 'far', review_count: 50, captured_at: '2026-10-15T00:00:00Z' },
  ];
  const out = reviewRace(snaps, comps, now, 30);
  assert.deepEqual(out.rows.map(r => [r.name, r.gained]), [['GID Garage', 8], ['Woody', 1], ['Munoz', 0]]);
  assert.equal(out.rows[0].since, '2026-09-01'); // last snapshot on/before the 30-day cutoff
  assert.equal(out.ownPlace, 1);
  assert.equal(out.of, 3);
});
