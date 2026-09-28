// Sync orchestration, the ops/analysis layer, and the SEO endpoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeoSync } from '../functions/_lib/seo/sync.js';
import { createSeoOps, windows } from '../functions/_lib/seo/ops.js';
import { handleSeoData } from '../functions/jarvis/seo-data.js';
import { fakeSeoStore } from './seo-fake-store.js';
import { classifyQuery, gscLocality } from '../shared/seo/local-intent.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function gscRow(date, query, clicks, impressions, position, page = 'https://gidgarage.com/') {
  const c = classifyQuery(query);
  return { date, query, page, country: 'usa', device: 'MOBILE', clicks, impressions, position, intent_class: c.intentClass, locality: gscLocality({ country: 'usa' }, c), service: c.service, branded: c.branded };
}

function seededStore() {
  const w = windows(NOW, 28);
  const d = w.cur.to; const p = w.prev.to;
  return fakeSeoStore({
    seo_settings: [{ id: 'default', canonical_name: 'GID Garage', canonical_phone: '480-757-0476', canonical_website: 'https://gidgarage.com', hide_address: true }],
    seo_gsc_daily: [
      gscRow(d, 'mobile mechanic flagstaff', 2, 120, 4.2), gscRow(p, 'mobile mechanic flagstaff', 2, 60, 6),
      gscRow(d, 'brake repair flagstaff', 0, 60, 16), gscRow(d, 'how do brake pads work', 5, 900, 9),
      gscRow(d, 'mechanic williams az', 0, 50, 12), gscRow(d, 'gid garage', 20, 40, 1),
    ],
    leads: [
      { id: 'l1', created_at: `${d}T10:00:00Z`, source: 'website_form', status: 'booked', booking_id: 'b1', requested_service: 'brakes' },
      { id: 'l2', created_at: `${d}T11:00:00Z`, source: 'website_booking', status: 'new', booking_id: null, requested_service: 'oil change' },
    ],
    bookings: [
      { id: 'b1', service_address: '12 Pine St, Flagstaff AZ 86001', amount_paid: 420, date: d, job_status: 'PAID', status: 'completed' },
      ...[1, 2, 3].map(i => ({ id: `bx${i}`, service_address: `${i} Oak, Flagstaff AZ`, date: d, job_status: 'PAID' })),
      { id: 'bs', service_address: 'Sedona', date: d, job_status: 'COMPLETED' },
    ],
    seo_page_audits: [{ url: 'https://gidgarage.com/', fetched_at: NOW.toISOString(), advertised_places: ['Flagstaff', 'Winslow'], issues: [] }],
  });
}

test('sync with no credentials records honest statuses and makes no network calls for them', async () => {
  const store = fakeSeoStore();
  const calls = [];
  const out = await runSeoSync({ env: {}, store, fetch: async u => { calls.push(u); throw new Error('no network'); }, now: NOW, only: ['search_console', 'business_profile', 'ga4', 'google_ads', 'apple_business_connect'] });
  assert.deepEqual(out.results.map(r => [r.provider, r.status, r.skipped]), [
    ['search_console', 'not_configured', true], ['business_profile', 'not_configured', true], ['ga4', 'not_configured', true],
    ['google_ads', 'not_configured', true], ['apple_business_connect', 'manual_only', true],
  ]);
  assert.equal(calls.length, 0);
  assert.equal(store.tables.seo_provider_status.length, 5);
  assert.match(store.tables.seo_provider_status.find(s => s.provider === 'search_console').detail, /missing: GOOGLE_SERVICE_ACCOUNT_JSON, GSC_SITE_URL/);
});

test('backfill walks backwards in 30-day chunks and resumes from the cursor; incremental re-pulls the tail', async () => {
  const store = fakeSeoStore();
  const env = { BING_WEBMASTER_API_KEY: 'k', BING_SITE_URL: 'x', NOAA_CDO_TOKEN: 't' };
  const ranges = [];
  const fetchImpl = async url => { const m = String(url).match(/startdate=([\d-]+)&enddate=([\d-]+)/); if (m) ranges.push([m[1], m[2]]); return json({ results: [] }); };
  await runSeoSync({ env, store, fetch: fetchImpl, now: NOW, mode: 'backfill', only: ['weather_history'] });
  await runSeoSync({ env, store, fetch: fetchImpl, now: NOW, mode: 'backfill', only: ['weather_history'] });
  // NOAA lags 5 days: backfill starts the day before today−5 and chunks are contiguous.
  assert.deepEqual(ranges, [['2026-08-24', '2026-09-22'], ['2026-07-25', '2026-08-23']]);
  assert.equal(store.tables.seo_provider_status[0].cursor.backfilledFrom, '2026-07-25');
  ranges.length = 0;
  await runSeoSync({ env, store, fetch: fetchImpl, now: NOW, mode: 'incremental', only: ['weather_history'] });
  assert.deepEqual(ranges, [['2026-09-19', '2026-09-27']]);
  assert.equal(store.tables.seo_sync_runs.length, 3);
});

test('a provider error is recorded as its status, not thrown', async () => {
  const store = fakeSeoStore();
  const out = await runSeoSync({ env: { NOAA_CDO_TOKEN: 'bad' }, store, fetch: async () => new Response('bad token', { status: 400 }), now: NOW, only: ['weather_history'] });
  assert.equal(out.results[0].status, 'needs_authorization');
  assert.equal(store.tables.seo_sync_runs[0].status, 'error');
});

test('overview: local-first KPIs from stored search data + first-party leads/bookings', async () => {
  const ops = createSeoOps({ store: seededStore(), env: {}, now: NOW });
  const o = await ops.overview({ days: 28 });
  assert.equal(o.primary[0].key, 'local_search_visibility');
  assert.equal(o.primary.find(k => k.key === 'local_leads').value, 2);
  assert.equal(o.primary.find(k => k.key === 'local_bookings').value, 1);
  assert.equal(o.funnel.confirmedLocalLeads, 1);
  assert.equal(o.localityBreakdown.impressions.nonlocal, 50);
  assert.ok(o.dataSources.notConnected.some(s => s.id === 'search_console'));
});

test('analysis creates local recommendations; rejection is remembered across re-analysis', async () => {
  const store = seededStore();
  const ops = createSeoOps({ store, env: {}, now: NOW });
  const a = await ops.analyze();
  assert.ok(a.newOpen > 0);
  const recs = store.tables.seo_recommendations;
  for (const t of ['ctr_opportunity', 'demand_gap', 'expansion_decision', 'service_area_claim']) assert.ok(recs.some(r => r.type === t), t);
  assert.ok(recs.find(r => r.type === 'service_area_claim').requires_decision);

  const ctr = recs.find(r => r.type === 'ctr_opportunity');
  const res = await ops.updateRecommendation({ id: ctr.id, action: 'reject', reason: 'not now' });
  assert.deepEqual([res.verified, res.changed.status.after], [true, 'rejected']);
  assert.equal(store.tables.seo_preferences.length, 1);
  await ops.analyze();
  assert.equal(store.tables.seo_recommendations.find(r => r.id === ctr.id).status, 'rejected');

  const gap = store.tables.seo_recommendations.find(r => r.type === 'demand_gap');
  const applied = await ops.updateRecommendation({ id: gap.id, action: 'mark_applied', note: 'added brake page' });
  assert.equal(applied.changed.status.after, 'applied');
  assert.ok(store.tables.seo_recommendations.find(r => r.id === gap.id).baseline.value >= 0);
  await assert.rejects(ops.updateRecommendation({ id: gap.id, action: 'dismiss' }), /Can't dismiss/);
  await assert.rejects(ops.updateRecommendation({ id: 'nope', action: 'accept' }), /No SEO recommendation/);
});

test('customer geography is aggregated (no addresses) and briefing leads with local impact', async () => {
  const ops = createSeoOps({ store: seededStore(), env: {}, now: NOW });
  const g = await ops.customerGeography();
  assert.deepEqual(g.areas.map(a => [a.slug, a.count]), [['flagstaff', 4]]);
  assert.equal(g.otherInArea, 1); // Sedona (1 job) folded in
  assert.ok(!JSON.stringify(g).includes('Pine'));
  await ops.analyze();
  const b = await ops.briefing();
  assert.ok(b.text && !/website traffic is up/i.test(b.text));
});

test('data endpoint serves reads and allowlisted writes (auth is covered in seo-auth.test.js)', async () => {

  const store = seededStore();
  const read = await handleSeoData({ request: new Request('https://x/jarvis/seo-data?action=connections'), env: {}, store, now: NOW });
  assert.ok((await read.json()).providers.some(p => p.id === 'search_console' && p.status === 'not_configured'));
  const add = await handleSeoData({ request: new Request('https://x/jarvis/seo-data', { method: 'POST', body: JSON.stringify({ action: 'add_competitor', name: 'Summit Mobile Mechanic', website: 'https://summitmobile.example' }) }), env: {}, store, now: NOW });
  assert.equal((await add.json()).competitor.tier, 'primary');
  const loc = await handleSeoData({ request: new Request('https://x/jarvis/seo-data', { method: 'POST', body: JSON.stringify({ action: 'check_location', location: 'Williams, AZ' }) }), env: {}, store, now: NOW });
  assert.deepEqual([(await loc.json()).inside], [false]);
  const bad = await handleSeoData({ request: new Request('https://x/jarvis/seo-data', { method: 'POST', body: JSON.stringify({ action: 'drop_table' }) }), env: {}, store, now: NOW });
  assert.equal(bad.status, 400);
});

test('overview adds GA4 (likely-local sessions, AI referrals) and Instagram local follower share', async () => {
  const store = seededStore();
  const d = windows(NOW, 28).cur.to;
  store.tables.seo_ga4_daily = [
    { date: d, sessions: 30, key_events: 4, locality: 'likely_local', ai_assistant: null },
    { date: d, sessions: 10, key_events: 0, locality: 'nonlocal', ai_assistant: 'chatgpt' },
  ];
  store.tables.seo_instagram_daily = [{ date: d, followers: 500 }];
  store.tables.seo_instagram_audience = [{ captured_at: d, city: 'Flagstaff, Arizona', followers: 120, locality: 'likely_local' }, { captured_at: d, city: 'Los Angeles, California', followers: 80, locality: 'nonlocal' }];
  const o = await createSeoOps({ store, env: {}, now: NOW }).overview({ days: 28 });
  assert.deepEqual(o.website, { sessionsByLocality: { likely_local: 30, nonlocal: 10 }, localKeyEvents: 4, aiAssistantSessions: { chatgpt: 10 } });
  assert.deepEqual([o.instagram.followers, o.instagram.localFollowerSharePct], [500, 60]);
});
