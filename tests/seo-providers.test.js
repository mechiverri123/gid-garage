// Providers: honest statuses without credentials, Google auth, and parsing of
// each API's real response shape (mocked fetch — no network, no keys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signJwt, serviceAccountToken, ProviderError } from '../functions/_lib/seo/google-auth.js';
import { providerStatuses, searchConsole, businessProfile, ga4, parsePageSpeed, auditPage, places, metaAds, bing, instagram } from '../functions/_lib/seo/providers.js';
import { fakeSeoStore } from './seo-fake-store.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// A real RSA key so the JWT path is exercised end to end.
async function serviceAccountEnv() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { kp, env: { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'seo@gid.iam.gserviceaccount.com', private_key: pem }) } };
}

// Routes mocked fetch calls by URL substring.
function router(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const hit = routes.find(([match]) => String(url).includes(match));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    return typeof hit[1] === 'function' ? hit[1](String(url), init) : hit[1].clone(); // fresh body per call
  };
  return { fetch: f, calls };
}
const tokenRoute = ['oauth2.googleapis.com/token', () => json({ access_token: 'tok' })];

test('no credentials: every provider reports an honest status, nothing crashes', () => {
  const s = Object.fromEntries(providerStatuses({}).map(p => [p.id, p.status]));
  assert.equal(s.search_console, 'not_configured');
  assert.equal(s.business_profile, 'not_configured');
  assert.equal(s.ga4, 'not_configured');
  assert.equal(s.pagespeed, 'ready_limited');
  assert.equal(s.apple_business_connect, 'manual_only');
  assert.equal(s.weather_forecast, 'connected');
  assert.equal(businessProfile.status({ GBP_OAUTH_CLIENT_ID: 'x', GBP_OAUTH_CLIENT_SECRET: 'y' }).status, 'needs_authorization');
  assert.equal(businessProfile.status({ GBP_OAUTH_CLIENT_ID: 'x', GBP_OAUTH_CLIENT_SECRET: 'y', GBP_OAUTH_REFRESH_TOKEN: 'r', GBP_LOCATION_NAME: 'locations/1' }).status, 'pending_approval');
  assert.equal(searchConsole.status({ GOOGLE_SERVICE_ACCOUNT_JSON: 'not json', GSC_SITE_URL: 'sc-domain:gidgarage.com' }).status, 'needs_authorization');
});

test('service-account JWT is RS256-signed and exchanged for a token', async () => {
  const { kp, env } = await serviceAccountEnv();
  const jwt = await signJwt({ iss: 'a', aud: 'b' }, JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key);
  const [h, p, sig] = jwt.split('.');
  const bytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
  assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, bytes(sig), new TextEncoder().encode(`${h}.${p}`)), true);
  const r = router([tokenRoute]);
  assert.equal(await serviceAccountToken(env, ['scope'], r.fetch, NOW), 'tok');
  assert.match(r.calls[0].init.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  await assert.rejects(serviceAccountToken({}, ['s'], r.fetch), e => e instanceof ProviderError && e.status === 'needs_authorization');
});

test('Search Console sync classifies every row; locality is never "confirmed"', async () => {
  const { env } = await serviceAccountEnv();
  const store = fakeSeoStore();
  const r = router([tokenRoute, ['searchAnalytics/query', (url, init) => {
    const body = JSON.parse(init.body);
    if (body.dimensions.length === 1) return json({ rows: [{ keys: ['2026-09-20'], clicks: 9, impressions: 400 }] });
    return json({ rows: [
      { keys: ['2026-09-20', 'mobile mechanic flagstaff', 'https://gidgarage.com/', 'usa', 'MOBILE'], clicks: 3, impressions: 90, position: 4.23 },
      { keys: ['2026-09-20', 'how do brake pads work', 'https://gidgarage.com/', 'usa', 'DESKTOP'], clicks: 1, impressions: 250, position: 8 },
      { keys: ['2026-09-20', 'brake repair', 'https://gidgarage.com/', 'gbr', 'MOBILE'], clicks: 0, impressions: 5, position: 30 },
    ] });
  }]]);
  const out = await searchConsole.sync({ env: { ...env, GSC_SITE_URL: 'sc-domain:gidgarage.com' }, fetch: r.fetch, store, now: NOW }, { from: '2026-09-20', to: '2026-09-20' });
  assert.equal(out.rows, 3);
  assert.deepEqual(store.tables.seo_gsc_daily.map(x => [x.intent_class, x.locality]), [['high_local_commercial', 'likely_local'], ['global_informational', 'unknown'], ['service_no_geo', 'nonlocal']]);
  assert.ok(!store.tables.seo_gsc_daily.some(x => x.locality === 'confirmed_local'));
  assert.deepEqual(store.tables.seo_gsc_totals, [{ date: '2026-09-20', clicks: 9, impressions: 400 }]);
  assert.match(r.calls[1].url, /sites\/sc-domain%3Agidgarage\.com\/searchAnalytics/);
});

test('Business Profile: daily metrics, threshold keywords, and 403 "not used" -> pending_approval', async () => {
  const env = { GBP_OAUTH_CLIENT_ID: 'c', GBP_OAUTH_CLIENT_SECRET: 's', GBP_OAUTH_REFRESH_TOKEN: 'r', GBP_LOCATION_NAME: 'locations/42', GBP_API_APPROVED: 'true' };
  const store = fakeSeoStore();
  const ok = router([tokenRoute,
    ['fetchMultiDailyMetricsTimeSeries', json({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: 'CALL_CLICKS', timeSeries: { datedValues: [{ date: { year: 2026, month: 9, day: 20 }, value: '4' }] } }] }] })],
    ['searchkeywords', json({ searchKeywordsCounts: [{ searchKeyword: 'mobile mechanic', insightsValue: { value: '120' } }, { searchKeyword: 'gid garage', insightsValue: { threshold: '15' } }] })],
  ]);
  await businessProfile.sync({ env, fetch: ok.fetch, store, now: NOW }, { from: '2026-09-01', to: '2026-09-20' });
  assert.deepEqual(store.tables.seo_gbp_daily, [{ date: '2026-09-20', metric: 'CALL_CLICKS', value: 4 }]);
  assert.deepEqual(store.tables.seo_gbp_keywords.map(k => [k.keyword, k.impressions, k.threshold]), [['mobile mechanic', 120, null], ['gid garage', null, 15]]);
  const denied = router([tokenRoute, ['fetchMultiDailyMetricsTimeSeries', json({ error: { message: 'Business Profile Performance API has not been used in project 123' } }, 403)]]);
  await assert.rejects(businessProfile.sync({ env, fetch: denied.fetch, store, now: NOW }, { from: '2026-09-01', to: '2026-09-20' }), e => e.status === 'pending_approval');
});

test('GA4: city locality is at best likely_local; AI assistants detected from source', async () => {
  const { env } = await serviceAccountEnv();
  const store = fakeSeoStore();
  const row = (city, region, source) => ({ dimensionValues: ['20260920', '/', source, 'organic', city, region, 'United States'].map(value => ({ value })), metricValues: ['5', '4', '1'].map(value => ({ value })) });
  const r = router([tokenRoute, ['runReport', json({ rows: [row('Flagstaff', 'Arizona', 'google'), row('Phoenix', 'Arizona', 'google'), row('Denver', 'Colorado', 'chatgpt.com')] })]]);
  await ga4.sync({ env: { ...env, GA4_PROPERTY_ID: '123' }, fetch: r.fetch, store, now: NOW }, { from: '2026-09-20', to: '2026-09-20' });
  assert.deepEqual(store.tables.seo_ga4_daily.map(x => [x.city, x.locality, x.ai_assistant]), [['Flagstaff', 'likely_local', null], ['Phoenix', 'unknown', null], ['Denver', 'nonlocal', 'chatgpt']]);
});

test('PageSpeed prefers field data; own-site audit applies SAB/NAU guards and finds out-of-area claims', () => {
  const ps = parsePageSpeed('https://gidgarage.com/', 'mobile', { lighthouseResult: { categories: { performance: { score: 0.42 }, seo: { score: 0.9 } }, audits: { 'largest-contentful-paint': { numericValue: 5100 } } }, loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4300 }, INTERACTION_TO_NEXT_PAINT: { percentile: 210 } } } });
  assert.deepEqual([ps.perf_score, ps.seo_score, ps.lcp_ms, ps.inp_ms, ps.field_data], [42, 90, 4300, 210, true]);
  const a = auditPage('https://gidgarage.com/', '<html><head><title>GID Garage | Mobile Mechanic</title><meta name="viewport" content="width=device-width"></head><body><h1>Mobile mechanic</h1><p>Visit our shop! Serving Flagstaff, Sedona and Winslow.</p></body></html>');
  const codes = a.issues.map(i => i.code);
  for (const c of ['title_no_location', 'missing_description', 'no_local_schema', 'guard', 'no_canonical']) assert.ok(codes.includes(c), c);
  assert.deepEqual(a.advertised_places.sort(), ['Flagstaff', 'Sedona', 'Winslow']);
});

test('Places discovery weights mobile mechanics inside the radius; outside businesses get weight 0', async () => {
  const store = fakeSeoStore();
  const r = router([
    ['place/details', json({ status: 'OK', result: { rating: 4.9, user_ratings_total: 57 } })],
    ['place/textsearch', json({ status: 'OK', results: [
      { place_id: 'p1', name: 'Peak Mobile Mechanic', geometry: { location: { lat: 35.2, lng: -111.64 } }, rating: 4.8, user_ratings_total: 40, types: ['car_repair'] },
      { place_id: 'p2', name: 'Valley Auto Repair', geometry: { location: { lat: 33.45, lng: -112.07 } }, rating: 4.5, user_ratings_total: 300, types: ['car_repair'] },
    ] })],
  ]);
  await places.sync({ env: { GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'own' }, fetch: r.fetch, store, now: NOW });
  const byId = Object.fromEntries(store.tables.seo_competitors.map(c => [c.id, c]));
  assert.deepEqual([byId.p1.tier, byId.p1.weight, byId.p1.inside_service_area], ['primary', 1, true]);
  assert.deepEqual([byId.p2.weight, byId.p2.inside_service_area], [0, false]);
  assert.equal(store.tables.seo_review_snapshots.find(s => s.subject === 'own').review_count, 57);
});

test('Meta Ads can only say "outside" for non-Arizona regions; Arizona stays unknown', async () => {
  const store = fakeSeoStore();
  const r = router([['act_9/insights', json({ data: [{ date_start: '2026-09-20', region: 'Arizona', spend: '10', clicks: '5', campaign_name: 'c' }, { date_start: '2026-09-20', region: 'California', spend: '4', clicks: '2', campaign_name: 'c' }] })]]);
  await metaAds.sync({ env: { META_ADS_ACCESS_TOKEN: 't', META_AD_ACCOUNT_ID: '9', META_GRAPH_VERSION: 'vX' }, fetch: r.fetch, store, now: NOW }, { from: '2026-09-20', to: '2026-09-20' });
  assert.deepEqual(store.tables.seo_ads_location_daily.map(x => [x.location_label, x.inside_area]), [['Arizona', null], ['California', false]]);
});

test('Bing and Instagram parse their responses; Instagram audience locality by city', async () => {
  const store = fakeSeoStore();
  const b = router([['GetQueryStats', json({ d: [{ Query: 'mobile mechanic flagstaff', Clicks: 2, Impressions: 30, AvgImpressionPosition: 3, Date: '/Date(1758326400000)/' }] })]]);
  await bing.sync({ env: { BING_WEBMASTER_API_KEY: 'k', BING_SITE_URL: 'https://gidgarage.com' }, fetch: b.fetch, store, now: NOW });
  assert.equal(store.tables.seo_bing_daily[0].locality, 'likely_local');
  const ig = router([
    ['/insights?metric=reach', json({ data: [{ name: 'reach', total_value: { value: 900 } }] })],
    ['follower_demographics', json({ data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['Flagstaff, Arizona'], value: 120 }, { dimension_values: ['Los Angeles, California'], value: 30 }] }] } }] })],
    ['fields=followers_count', json({ followers_count: 480 })],
  ]);
  await instagram.sync({ env: { INSTAGRAM_ACCESS_TOKEN: 't', INSTAGRAM_BUSINESS_ACCOUNT_ID: '7', META_GRAPH_VERSION: 'vX' }, fetch: ig.fetch, store, now: NOW });
  assert.equal(store.tables.seo_instagram_daily[0].followers, 480);
  assert.deepEqual(store.tables.seo_instagram_audience.map(x => [x.city, x.locality]), [['Flagstaff, Arizona', 'likely_local'], ['Los Angeles, California', 'nonlocal']]);
});

// Production: GSC_SITE_URL "gidgarage.com" made Google check http://gidgarage.com → 403.
test('Search Console: a bare domain means the Domain property, and a 403 names the property it tried', async () => {
  const { gscSiteUrl, searchConsole } = await import('../functions/_lib/seo/providers.js');
  assert.equal(gscSiteUrl('gidgarage.com'), 'sc-domain:gidgarage.com');
  assert.equal(gscSiteUrl('https://gidgarage.com'), 'https://gidgarage.com/');
  assert.equal(gscSiteUrl('sc-domain:GIDGarage.com'), 'sc-domain:gidgarage.com');
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  const asked = [];
  const fetchImpl = async url => {
    if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 't' }));
    asked.push(String(url));
    return new Response(JSON.stringify({ error: { code: 403, message: "User does not have sufficient permission for site 'sc-domain:gidgarage.com'." } }), { status: 403 });
  };
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'seo@x.iam.gserviceaccount.com', private_key: pem }), GSC_SITE_URL: 'gidgarage.com' };
  await assert.rejects(searchConsole.sync({ env, fetch: fetchImpl, store: { upsert: async () => 0 }, now: new Date('2026-09-28T19:00:00Z') }, { from: '2026-09-01', to: '2026-09-02' }), /Property used: "sc-domain:gidgarage\.com"/);
  assert.match(asked[0], /sites\/sc-domain%3Agidgarage\.com\//);
});
