// SEO sync subrequest budget: the REAL Supabase store (createSeoStore) over a
// fake PostgREST, with every subrequest of every invocation counted — external
// APIs and Supabase alike, exactly what Cloudflare's 50-per-request limit sees.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runSeoSync, SYNC_RUN_KEY } from '../functions/_lib/seo/sync.js';
import { createSeoStore } from '../functions/_lib/seo/store.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const KEYS = { seo_provider_status: ['provider'] };
function fakePostgrest(tables) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const t = u.pathname.replace('/rest/v1/', '');
    if (t.startsWith('rpc/')) return json([]);
    const rows = (tables[t] ||= []);
    if ((init.method || 'GET') === 'GET') {
      const eq = [...u.searchParams].filter(([, v]) => v.startsWith('eq.'));
      return json(rows.filter(r => eq.every(([k, v]) => String(r[k]) === v.slice(3))));
    }
    if (init.method === 'PATCH') return json([]);
    const body = [].concat(JSON.parse(init.body));
    for (const row of body) {
      const key = KEYS[t];
      const existing = key && rows.find(r => key.every(k => r[k] === row[k]));
      if (existing) Object.assign(existing, row); else rows.push({ ...row });
    }
    return json(body, 201);
  };
}

const EXTERNAL = url => {
  if (url.includes('pagespeedonline')) return json({ lighthouseResult: { categories: { performance: { score: 0.8 }, seo: { score: 0.9 } } } });
  if (url.includes('api.weather.gov/points')) return json({ properties: { forecast: 'https://api.weather.gov/gridpoints/FGZ/1,1/forecast' } });
  if (url.includes('api.weather.gov/gridpoints')) return json({ properties: { periods: [{ startTime: '2026-09-29T06:00:00-07:00', isDaytime: true, temperature: 60, shortForecast: 'Sunny' }] } });
  if (url.includes('place/details')) return json({ status: 'OK', result: { rating: 4.9, user_ratings_total: 50 } });
  if (url.includes('place/textsearch')) return json({ status: 'OK', results: [{ place_id: `p-${url.length}`, name: 'Rival Mobile Mechanic', types: ['car_repair'], geometry: { location: { lat: 35.2, lng: -111.65 } } }] });
  if (url.includes('competitor')) return new Response('<title>Competitor</title><p>oil change</p>');
  return new Response('<html><head><title>GID Garage Flagstaff</title></head></html>');
};

// The owner's live setup: Places, PageSpeed (ready_limited), site audit,
// competitor monitoring, NWS forecast — with a heavy key-page list.
function world({ keyPages = 12, competitors = 15, lastSync = null } = {}) {
  const tables = {
    seo_settings: [{ id: 'default', key_pages: Array.from({ length: keyPages }, (_, i) => `https://gidgarage.com/p${i}`) }],
    seo_competitors: Array.from({ length: competitors }, (_, i) => ({ id: `c${String(i).padStart(2, '0')}`, name: `Rival ${i}`, website: `https://competitor${i}.example/`, status: 'active', kind: 'business', tier: 'primary' })),
    seo_provider_status: lastSync ? ['places', 'pagespeed', 'site_audit', 'competitor_pages', 'weather_forecast'].map(provider => ({ provider, status: 'connected', last_sync_at: lastSync.toISOString() })) : [],
  };
  const perCall = [];
  let current;
  const supabase = fakePostgrest(tables);
  globalThis.fetch = async (url, init) => {
    const external = !String(url).startsWith('https://db.test');
    current.total += 1; if (external) current.external += 1;
    return external ? EXTERNAL(String(url)) : supabase(url, init);
  };
  const store = createSeoStore({ supabaseUrl: 'https://db.test', serviceKey: 'svc' });
  const env = { GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'own' };
  const call = async (opts = {}) => { current = { external: 0, total: 0 }; perCall.push(current); return runSeoSync({ env, store, now: NOW, ...opts }); };
  const runToEnd = async (opts, max = 15) => { const outs = []; for (let i = 0; i < max; i += 1) { const o = await call(opts); outs.push(o); if (!o.more) break; } return outs; };
  return { tables, perCall, call, runToEnd };
}

test('no invocation exceeds 20 external fetches or 45 subrequests in total, and the run still finishes', async () => {
  const w = world({ keyPages: 12, competitors: 15 });
  const outs = await w.runToEnd({ manual: true });
  assert.ok(outs.length > 2, 'heavy sync is split across several invocations');
  for (const [i, c] of w.perCall.entries()) {
    assert.ok(c.external <= 20, `call ${i}: ${c.external} external`);
    assert.ok(c.total <= 45, `call ${i}: ${c.total} total subrequests`);
  }
  assert.equal(outs.at(-1).runStatus, 'completed');
  assert.equal(outs.at(-1).more, false);
  assert.equal(w.tables.seo_pagespeed_runs.length, 24); // 12 pages × mobile/desktop, resumed across calls
  assert.equal(w.tables.seo_page_audits.length, 13); // 12 key pages + the soft-404 probe
  assert.equal(w.tables.seo_competitor_snapshots.length, 15); // capped crawl, resumed
  assert.equal(new Set(w.tables.seo_pagespeed_runs.map(r => `${r.url}|${r.strategy}`)).size, 24); // no page done twice
  const status = Object.fromEntries(w.tables.seo_provider_status.map(r => [r.provider, r]));
  for (const id of ['places', 'pagespeed', 'site_audit', 'competitor_pages', 'weather_forecast']) {
    assert.ok(status[id].last_sync_at, `${id} synced`);
    assert.equal(status[id].cursor?.batchOffset, undefined, `${id} batch cursor cleared`);
  }
  assert.ok(outs.some(o => o.analysis && !o.analysis.error), 'analysis ran in its own invocation');
});

test('regression: manual Sync now re-pulls providers synced days ago instead of reporting 0 sources', async () => {
  const w = world({ keyPages: 2, competitors: 2, lastSync: new Date(NOW.getTime() - 2 * 86400000) });
  const outs = await w.runToEnd({ manual: true });
  const pulled = new Set(outs.flatMap(o => o.results).filter(r => r.rows != null).map(r => r.provider));
  assert.deepEqual([...pulled].sort(), ['competitor_pages', 'pagespeed', 'places', 'site_audit', 'weather_forecast']);
});

test('manual Sync now skips only providers pulled within the last hour, and says so', async () => {
  const w = world({ keyPages: 1, competitors: 1, lastSync: new Date(NOW.getTime() - 20 * 60000) });
  const first = await w.call({ manual: true });
  assert.equal(first.summary.pulled, 0);
  assert.equal(first.summary.skipped['pulled within the last hour'], 5);
});

test('the cron keeps the weekly cadence and does not restart a finished run every 15 minutes', async () => {
  const w = world({ keyPages: 1, competitors: 1, lastSync: new Date(NOW.getTime() - 2 * 86400000) });
  const outs = await w.runToEnd({});
  const pulled = outs.flatMap(o => o.results).filter(r => r.rows != null).map(r => r.provider);
  assert.deepEqual(pulled, ['weather_forecast']); // weekly providers not due yet
  assert.equal(outs.at(-1).runStatus, 'completed');
  const idle = await w.call({});
  assert.equal(idle.idle, true);
  assert.ok(w.perCall.at(-1).total <= 1); // just the run-row read
});

test('one failing provider does not block the others; the run ends partial and is retryable', async () => {
  const w = world({ keyPages: 1, competitors: 1 });
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('place/details') ? json({ status: 'REQUEST_DENIED', error_message: 'bad key' }) : inner(url, init));
  const outs = await w.runToEnd({ manual: true });
  const results = outs.flatMap(o => o.results);
  assert.match(results.find(r => r.provider === 'places').error, /REQUEST_DENIED/);
  for (const id of ['pagespeed', 'site_audit', 'competitor_pages', 'weather_forecast']) assert.ok(results.find(r => r.provider === id && r.rows != null), id);
  assert.equal(outs.at(-1).runStatus, 'partial');
  assert.equal(w.tables.seo_provider_status.find(r => r.provider === SYNC_RUN_KEY).status, 'partial');
});
