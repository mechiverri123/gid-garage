// SEO Command Center data: daily local series, query movement and technical
// health — all from stored rows; nothing measured is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeoOps } from '../functions/_lib/seo/ops.js';
import { localDailySeries, discoveryFunnel } from '../shared/seo/kpis.js';
import { fakeSeoStore } from './seo-fake-store.js';

const NOW = new Date('2026-09-28T19:00:00Z'); // 28-day window = 2026-08-29 .. 2026-09-25, previous = 08-01 .. 08-28
const g = (date, query, locality, impressions, clicks, position, extra = {}) => ({ date, query, page: 'https://gidgarage.com/', country: 'usa', device: 'MOBILE', locality, intent_class: 'high_local_commercial', service: 'brakes', impressions, clicks, position, ...extra });

test('daily series counts only local impressions/clicks and local discovery leads', () => {
  const s = localDailySeries({
    from: '2026-09-01', to: '2026-09-03',
    serviceDaily: [
      { date: '2026-09-01', locality: 'likely_local', impressions: 40, clicks: 3 },
      { date: '2026-09-01', locality: 'nonlocal', impressions: 500, clicks: 9 }, // excluded
      { date: '2026-09-03', locality: 'confirmed_local', impressions: 5, clicks: 1 },
    ],
    leads: [
      { created_at: '2026-09-02T15:00:00Z', source: 'website_booking', status: 'booked' },
      { created_at: '2026-09-02T16:00:00Z', source: 'referral', status: 'new' }, // not search discovery
    ],
  });
  assert.deepEqual(s.map(d => [d.date, d.impressions, d.clicks, d.leads, d.bookings]), [['2026-09-01', 40, 3, 0, 0], ['2026-09-02', 0, 0, 1, 1], ['2026-09-03', 5, 1, 0, 0]]);
});

test('the funnel and the daily series use the same local-lead rule', () => {
  const leads = [{ created_at: '2026-09-02T15:00:00Z', source: 'website_booking', status: 'booked' }, { created_at: '2026-09-05T15:00:00Z', source: 'organic', status: 'new' }, { created_at: '2026-09-05T16:00:00Z', source: 'referral' }];
  const f = discoveryFunnel(leads);
  const s = localDailySeries({ from: '2026-09-01', to: '2026-09-30', leads });
  assert.equal(s.reduce((t, d) => t + d.leads, 0), f.leads);
  assert.equal(s.reduce((t, d) => t + d.bookings, 0), f.bookings);
  assert.deepEqual([f.leads, f.bookings], [2, 1]); // referral isn't search discovery
});

test('query movement: positions gained are positive, impressions-weighted, sorted by impressions', async () => {
  const store = fakeSeoStore({ seo_gsc_daily: [
    g('2026-09-10', 'mobile mechanic flagstaff', 'likely_local', 30, 2, 8), g('2026-09-12', 'mobile mechanic flagstaff', 'likely_local', 10, 0, 4),
    g('2026-08-10', 'mobile mechanic flagstaff', 'likely_local', 20, 0, 12),
    g('2026-09-11', 'brake repair', 'unknown', 12, 0, 15), g('2026-08-11', 'brake repair', 'unknown', 12, 0, 11),
    g('2026-09-11', 'new query', 'likely_local', 3, 0, 20),
  ] });
  const q = await createSeoOps({ store, env: {}, now: NOW }).queries({ days: 28 });
  assert.deepEqual(q.rows.map(r => r.query), ['mobile mechanic flagstaff', 'brake repair', 'new query']);
  assert.deepEqual(q.rows[0], { query: 'mobile mechanic flagstaff', locality: 'likely_local', intent: 'high_local_commercial', impressions: 40, clicks: 2, ctrPct: 5, position: 7, previousPosition: 12, movement: 5 });
  assert.equal(q.rows[1].movement, -4); // 11 -> 15 = lost 4 positions
  assert.equal(q.rows[2].movement, null); // no previous data
});

test('technical health only reports what was measured', async () => {
  const empty = await createSeoOps({ store: fakeSeoStore(), env: {}, now: NOW }).technical();
  assert.equal(empty.pagesAudited, 0);
  assert.ok(empty.checks.every(c => c.measured === false && c.issues.length === 0));
  assert.deepEqual(empty.pagespeed, []);

  const store = fakeSeoStore({
    seo_pagespeed_runs: [{ url: 'https://gidgarage.com/', strategy: 'mobile', perf_score: 77, seo_score: 100, lcp_ms: 4000, cls: 0, fetched_at: '2026-09-28T18:38:00Z' }],
    seo_page_audits: [{ url: 'https://gidgarage.com/', fetched_at: '2026-09-28T18:38:00Z', issues: [{ code: 'no_area_served', severity: 'medium', title: 'Schema lacks areaServed' }] }],
  });
  const t = await createSeoOps({ store, env: {}, now: NOW }).technical();
  assert.equal(t.pagesAudited, 1);
  assert.equal(t.pagespeed[0].perfScore, 77);
  assert.deepEqual(t.checks.find(c => c.key === 'structured_data').issues.map(i => i.code), ['no_area_served']);
  assert.deepEqual(t.checks.find(c => c.key === 'indexability').issues, []);
});
