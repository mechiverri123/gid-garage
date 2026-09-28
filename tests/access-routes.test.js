// /jarvis-livekit-token, /jarvis-speak, /jarvis-transcribe, /jarvis-news used to
// rely only on the Access "jarvis*" path match. They now verify the Access JWT
// themselves (requireAccess), so an Access config change can't make them public.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { _clearAccessCertCache } from '../functions/_lib/access-auth.js';
import * as livekitToken from '../functions/jarvis-livekit-token.js';
import * as speak from '../functions/jarvis-speak.js';
import * as transcribe from '../functions/jarvis-transcribe.js';
import * as news from '../functions/jarvis-news.js';

const TEAM = 'gidgarage.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const ENV = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; _clearAccessCertCache(); });

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function accessToken() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${enc({ iss: `https://${TEAM}`, aud: [AUD], email: 'owner@gidgarage.com', exp: now + 600, iat: now - 10 })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(unsigned));
  return { token: `${unsigned}.${b64url(sig)}`, jwk };
}

const handlers = [
  ['livekit-token GET', livekitToken.onRequestGet], ['livekit-token POST', livekitToken.onRequestPost],
  ['speak GET', speak.onRequestGet], ['speak POST', speak.onRequestPost],
  ['transcribe GET', transcribe.onRequestGet], ['transcribe POST', transcribe.onRequestPost],
  ['news GET', news.onRequestGet],
];

test('every formerly-unauthenticated /jarvis-* route rejects requests without a valid Access JWT', async () => {
  const { jwk } = await accessToken();
  globalThis.fetch = async url => {
    if (String(url).endsWith('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    throw new Error(`handler ran and fetched ${url}`); // must never get this far
  };
  for (const [name, handler] of handlers) {
    const missing = await handler({ request: new Request('https://gidgarage.com/x', { method: 'POST', body: '{}' }), env: ENV });
    assert.equal(missing.status, 401, `${name} without token`);
    const forged = await handler({ request: new Request('https://gidgarage.com/x', { method: 'POST', body: '{}', headers: { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.e30.bad' } }), env: ENV });
    assert.equal(forged.status, 403, `${name} with forged token`);
  }
});

test('a verified Access user still reaches the handler', async () => {
  const { token, jwk } = await accessToken();
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const res = await speak.onRequestGet({ request: new Request('https://gidgarage.com/jarvis-speak', { headers: { 'Cf-Access-Jwt-Assertion': token } }), env: ENV });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});
