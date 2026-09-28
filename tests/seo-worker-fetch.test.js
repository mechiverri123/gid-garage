// Production hotfix regression: Cloudflare Workers throws "Illegal invocation"
// when native fetch runs with a `this` other than the global. Node doesn't, so
// these tests install a strict fetch that behaves like Workers and run every
// SEO provider through the real production path (no injected fetch).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runSeoSync, syncGate, SYNC_RUN_KEY } from '../functions/_lib/seo/sync.js';
import { createSeoStore } from '../functions/_lib/seo/store.js';
import { verifyAccess, _clearAccessCertCache } from '../functions/_lib/access-auth.js';
import { fakeSeoStore } from './seo-fake-store.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; _clearAccessCertCache(); });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

// Workers-style native fetch: only a plain call (this = undefined/globalThis) is legal.
function workersFetch(route) {
  return function fetch(url, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation: function called with incorrect 'this' reference.");
    return Promise.resolve(route(String(url), init));
  };
}

const ROUTES = url => {
  if (url.includes('pagespeedonline')) return json({ lighthouseResult: { categories: { performance: { score: 0.8 }, seo: { score: 0.9 } } } });
  if (url.includes('api.weather.gov/points')) return json({ properties: { forecast: 'https://api.weather.gov/gridpoints/FGZ/1,1/forecast' } });
  if (url.includes('api.weather.gov/gridpoints')) return json({ properties: { periods: [{ startTime: '2026-09-29T06:00:00-07:00', isDaytime: true, temperature: 60, shortForecast: 'Sunny' }] } });
  if (url.includes('place/details')) return json({ status: 'OK', result: { rating: 4.9, user_ratings_total: 50 } });
  if (url.includes('place/textsearch')) return json({ status: 'OK', results: [] });
  if (url.includes('GetQueryStats')) return json({ d: [] });
  if (url.includes('ncei.noaa.gov')) return json({ results: [] });
  if (url.includes('graph.facebook.com') && url.includes('insights?fields')) return json({ data: [] });
  if (url.includes('graph.facebook.com')) return json({ followers_count: 10, data: [] });
  if (url.includes('competitor.example')) return new Response('<title>Competitor</title><p>oil change</p>');
  if (url.includes('gidgarage.com')) return new Response('<html><head><title>GID Garage Flagstaff</title></head></html>');
  throw new Error(`unrouted ${url}`);
};

test('the Workers fetch stand-in reproduces the production error for the old ctx.fetch pattern', () => {
  const strict = workersFetch(ROUTES);
  const ctx = { fetch: strict };
  assert.throws(() => ctx.fetch('https://gidgarage.com/'), /Illegal invocation/);
  assert.doesNotThrow(() => strict('https://gidgarage.com/'));
});

test('every network-using SEO provider syncs through the production fetch path without Illegal invocation', async () => {
  globalThis.fetch = workersFetch(ROUTES);
  const store = fakeSeoStore({ seo_competitors: [{ id: 'c1', name: 'Rival Mobile', website: 'https://competitor.example/', status: 'active', kind: 'business', tier: 'primary' }] });
  const env = {
    GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'own', BING_WEBMASTER_API_KEY: 'k', BING_SITE_URL: 'https://gidgarage.com',
    NOAA_CDO_TOKEN: 't', INSTAGRAM_ACCESS_TOKEN: 't', INSTAGRAM_BUSINESS_ACCOUNT_ID: '1', META_GRAPH_VERSION: 'vX',
    META_ADS_ACCESS_TOKEN: 't', META_AD_ACCOUNT_ID: '9',
  };
  const out = await runSeoSync({ env, store, now: NOW, mode: 'force' }); // no fetch injected = production path
  const byId = Object.fromEntries(out.results.map(r => [r.provider, r]));
  for (const id of ['places', 'pagespeed', 'site_audit', 'weather_forecast', 'competitor_pages', 'bing', 'instagram', 'weather_history', 'meta_ads']) {
    assert.equal(byId[id].error, undefined, `${id}: ${byId[id].error}`);
    assert.ok(byId[id].rows != null, id);
  }
  assert.ok(!JSON.stringify(out).includes('Illegal invocation'));
  assert.equal(store.tables.seo_competitor_snapshots.length, 1);
  assert.equal(out.runStatus, 'completed');
});

test('Google-auth providers (Search Console, GA4, Business Profile, Google Ads) are Workers-safe', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----
${btoa(String.fromCharCode(...der))}
-----END PRIVATE KEY-----`;
  globalThis.fetch = workersFetch(url => {
    if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'tok' });
    if (url.includes('searchAnalytics/query')) return json({ rows: [] });
    if (url.includes(':runReport')) return json({ rows: [] });
    if (url.includes('businessprofileperformance')) return json({});
    if (url.includes('googleads.googleapis.com')) return json({ results: [] });
    return ROUTES(url);
  });
  const env = {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'seo@x.iam.gserviceaccount.com', private_key: pem }), GSC_SITE_URL: 'sc-domain:gidgarage.com', GA4_PROPERTY_ID: '1',
    GBP_OAUTH_CLIENT_ID: 'c', GBP_OAUTH_CLIENT_SECRET: 's', GBP_OAUTH_REFRESH_TOKEN: 'r', GBP_LOCATION_NAME: 'locations/1', GBP_API_APPROVED: 'true',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'd', GOOGLE_ADS_CUSTOMER_ID: '1', GOOGLE_ADS_OAUTH_CLIENT_ID: 'c', GOOGLE_ADS_OAUTH_CLIENT_SECRET: 's', GOOGLE_ADS_OAUTH_REFRESH_TOKEN: 'r', GOOGLE_ADS_API_VERSION: 'vX',
  };
  const out = await runSeoSync({ env, store: fakeSeoStore(), now: NOW, only: ['search_console', 'ga4', 'business_profile', 'google_ads'] });
  for (const r of out.results) assert.equal(r.error, undefined, `${r.provider}: ${r.error}`);
  assert.equal(out.results.length, 4);
});

test('store and Access verification default fetch paths are Workers-safe too', async () => {
  globalThis.fetch = workersFetch(url => (url.includes('/rest/v1/') ? json([{ ok: 1 }]) : json({ keys: [] })));
  const store = createSeoStore({ supabaseUrl: 'https://db.test', serviceKey: 'svc' });
  assert.deepEqual(await store.select('seo_settings', {}), [{ ok: 1 }]);
  const res = await verifyAccess(new Request('https://gidgarage.com/jarvis/seo-data', { headers: { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImsifQ.e30.x' } }), { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'a' });
  assert.equal(res.status, 403); // reached the certs endpoint through the global fetch without throwing
});

// ---- sync run gate ------------------------------------------------------------------------

test('run gate: running blocks everyone; completed throttles only manual; failed/partial retry immediately', () => {
  const at = (status, minsAgo) => ({ status, updated_at: new Date(NOW.getTime() - minsAgo * 60000).toISOString() });
  assert.equal(syncGate(at('running', 1), NOW, { manual: true }).status, 409);
  assert.equal(syncGate(at('running', 1), NOW, { manual: false }).status, 409); // cron can't overlap either
  assert.equal(syncGate(at('running', 11), NOW, { manual: true }).ok, true); // abandoned run
  assert.equal(syncGate(at('completed', 2), NOW, { manual: true }).status, 429);
  assert.equal(syncGate(at('completed', 2), NOW, { manual: false }).ok, true);
  assert.equal(syncGate(at('completed', 6), NOW, { manual: true }).ok, true);
  assert.equal(syncGate(at('failed', 1), NOW, { manual: true }).ok, true);
  assert.equal(syncGate(at('partial', 1), NOW, { manual: true }).ok, true);
  assert.equal(syncGate(undefined, NOW, { manual: true }).ok, true);
});

test('a partial run is recorded as partial and can be retried manually right away', async () => {
  globalThis.fetch = workersFetch(url => (url.includes('place/details') ? json({ status: 'REQUEST_DENIED', error_message: 'bad key' }) : ROUTES(url)));
  const store = fakeSeoStore();
  const env = { GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'own' };
  const first = await runSeoSync({ env, store, now: NOW, mode: 'force', manual: true, only: ['places', 'pagespeed'] });
  assert.equal(first.runStatus, 'partial');
  const run = store.tables.seo_provider_status.find(r => r.provider === SYNC_RUN_KEY);
  assert.equal(run.status, 'partial');
  assert.match(run.last_error, /places: .*REQUEST_DENIED/);
  const retry = await runSeoSync({ env, store, now: NOW, mode: 'force', manual: true, only: ['pagespeed'] });
  assert.equal(retry.blocked, undefined);
  assert.equal(retry.runStatus, 'completed');
  const blocked = await runSeoSync({ env, store, now: NOW, mode: 'force', manual: true, only: ['pagespeed'] });
  assert.deepEqual([blocked.blocked, blocked.status], [true, 429]);
});

test('a running sync blocks a concurrent one', async () => {
  const store = fakeSeoStore({ seo_provider_status: [{ provider: SYNC_RUN_KEY, status: 'running', updated_at: new Date(NOW.getTime() - 30000).toISOString() }] });
  const out = await runSeoSync({ env: {}, store, now: NOW, only: ['search_console'] });
  assert.deepEqual([out.blocked, out.status], [true, 409]);
  assert.equal(store.tables.seo_sync_runs, undefined); // nothing ran
});
