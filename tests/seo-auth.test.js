// Blocker 4: /seo-sync accepts only the exact cron secret; /jarvis/seo-data only a
// VERIFIED Cloudflare Access JWT (real RS256 signature, issuer, audience, expiry).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccess, safeEqual, _clearAccessCertCache } from '../functions/_lib/access-auth.js';
import { onRequest as seoData, handleSeoData } from '../functions/jarvis/seo-data.js';
import { onRequestPost as seoSync } from '../functions/seo-sync.js';
import { fakeSeoStore } from './seo-fake-store.js';
import { runSeoSync } from '../functions/_lib/seo/sync.js';

const TEAM = 'gidgarage.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = Date.parse('2026-09-28T19:00:00Z');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; _clearAccessCertCache(); });

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function keypair(kid) {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { kp, jwk };
}
async function sign(kp, kid, claims) {
  const unsigned = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}
const goodClaims = (over = {}) => ({ iss: `https://${TEAM}`, aud: [AUD], email: 'owner@gidgarage.com', exp: Math.floor(NOW / 1000) + 600, iat: Math.floor(NOW / 1000) - 10, ...over });
const certsFetch = jwks => async url => { assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`); return new Response(JSON.stringify({ keys: jwks })); };
const req = token => new Request('https://gidgarage.com/jarvis/seo-data?action=connections', token ? { headers: { 'Cf-Access-Jwt-Assertion': token } } : {});
const ENV = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD };

test('Access verification: missing -> 401; forged, wrong-key, wrong-aud, wrong-issuer, expired -> 403; valid -> ok', async () => {
  const { kp, jwk } = await keypair('k1');
  const other = await keypair('k1'); // attacker key claiming the same kid
  const opts = { fetchImpl: certsFetch([jwk]), now: NOW };
  assert.deepEqual(await verifyAccess(req(null), ENV, opts), { ok: false, status: 401, error: 'Unauthorized' });
  assert.equal((await verifyAccess(req('present-but-fake'), ENV, opts)).status, 403); // header presence alone is not enough
  assert.equal((await verifyAccess(req(await sign(other.kp, 'k1', goodClaims())), ENV, opts)).status, 403);
  assert.equal((await verifyAccess(req(await sign(kp, 'k1', goodClaims({ aud: ['someone-else'] }))), ENV, opts)).status, 403);
  assert.equal((await verifyAccess(req(await sign(kp, 'k1', goodClaims({ iss: 'https://evil.cloudflareaccess.com' }))), ENV, opts)).status, 403);
  assert.equal((await verifyAccess(req(await sign(kp, 'k1', goodClaims({ exp: Math.floor(NOW / 1000) - 5 }))), ENV, opts)).status, 403);
  assert.equal((await verifyAccess(req(await sign(kp, 'k2', goodClaims())), ENV, opts)).status, 403); // unknown kid
  const ok = await verifyAccess(req(await sign(kp, 'k1', goodClaims())), ENV, opts);
  assert.deepEqual(ok, { ok: true, email: 'owner@gidgarage.com' });
  // CF_Authorization cookie form works too
  const cookieReq = new Request('https://gidgarage.com/jarvis/seo-data', { headers: { Cookie: `x=1; CF_Authorization=${await sign(kp, 'k1', goodClaims())}` } });
  assert.equal((await verifyAccess(cookieReq, ENV, opts)).ok, true);
});

test('Access verification fails closed when not configured', async () => {
  assert.equal((await verifyAccess(req('anything'), {}, { now: NOW })).status, 500);
});

test('/jarvis/seo-data endpoint: 401 without a token, 403 with a spoofed one, 200 with a verified token', async () => {
  const { kp, jwk } = await keypair('k1');
  const env = { ...ENV, SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc' };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); // empty Supabase tables
  };
  assert.equal((await seoData({ request: req(null), env })).status, 401);
  assert.equal((await seoData({ request: req('eyJhbGciOiJSUzI1NiJ9.e30.x'), env })).status, 403);
  const token = await sign(kp, 'k1', goodClaims({ exp: Math.floor(Date.now() / 1000) + 600 }));
  const res = await seoData({ request: req(token), env });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).providers.length > 5);
});

test('/seo-sync: cron secret only — missing 401, wrong 403, unconfigured 503, correct runs; no header bypass', async () => {
  const env = { SEO_SYNC_SECRET: 'correct-horse', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc' };
  const post = headers => seoSync({ request: new Request('https://gidgarage.com/seo-sync', { method: 'POST', headers, body: JSON.stringify({ mode: 'incremental', only: ['search_console'] }) }), env });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ 'X-GID-SEO-Secret': 'wrong' })).status, 403);
  assert.equal((await post({ 'X-GID-SEO-Secret': 'correct-hors' })).status, 403);
  assert.equal((await post({ 'Cf-Access-Jwt-Assertion': 'anything' })).status, 401); // the old admin-header bypass is gone
  assert.equal((await seoSync({ request: new Request('https://gidgarage.com/seo-sync', { method: 'POST', headers: { 'X-GID-SEO-Secret': 'x' } }), env: {} })).status, 503);
  globalThis.fetch = async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  const ok = await post({ 'X-GID-SEO-Secret': 'correct-horse' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).results[0].status, 'not_configured');
});

test('"Sync now" runs server-side through /jarvis/seo-data via the shared run gate; the cron secret is never used', async () => {
  const store = fakeSeoStore({ seo_provider_status: [] });
  const calls = [];
  const runSync = async args => { calls.push(args); return runSeoSync({ ...args, only: ['search_console'] }); };
  const now = new Date(NOW);
  const post = body => handleSeoData({ request: new Request('https://x/jarvis/seo-data', { method: 'POST', body: JSON.stringify(body) }), env: {}, store, now, runSync });
  const first = await post({ action: 'sync_now' });
  assert.equal(first.status, 200);
  assert.equal(calls[0].manual, true);
  assert.equal(calls[0].env.SEO_SYNC_SECRET, undefined);
  assert.deepEqual([(await first.json()).runStatus], ['pending']); // providers done; analysis is the next call
  const second = await post({ action: 'sync_now' });
  assert.deepEqual([second.status, (await second.json()).runStatus], [200, 'completed']);
  const again = await post({ action: 'sync_now' }); // completed moments ago -> cooldown
  assert.equal(again.status, 429);
});

test('constant-time secret compare', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(undefined, ''), true);
});
