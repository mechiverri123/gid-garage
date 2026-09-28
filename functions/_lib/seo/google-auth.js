// Google API access tokens, no SDK (Cloudflare Workers + Node both have WebCrypto).
//  - Service account (Search Console, GA4): GOOGLE_SERVICE_ACCOUNT_JSON — the
//    downloaded key file's JSON. The service-account email must be added as a
//    user on the Search Console property / GA4 property.
//  - OAuth refresh token (Business Profile, Google Ads): <PREFIX>_CLIENT_ID,
//    <PREFIX>_CLIENT_SECRET, <PREFIX>_REFRESH_TOKEN.
// Tests: tests/seo-providers.test.js

import { workerFetch } from './http.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export class ProviderError extends Error {
  constructor(status, message) { super(message); this.status = status; } // status: needs_authorization | pending_approval | error
}

function pemToDer(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), c => c.charCodeAt(0)).buffer;
}

export function parseServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return sa.client_email && sa.private_key ? sa : null;
  } catch { return null; }
}

export async function signJwt(claims, privateKeyPem) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

export async function serviceAccountToken(env, scopes, fetchImpl = workerFetch, now = new Date()) {
  const sa = parseServiceAccount(env);
  if (!sa) throw new ProviderError('needs_authorization', 'GOOGLE_SERVICE_ACCOUNT_JSON is missing or invalid.');
  const iat = Math.floor(now.getTime() / 1000);
  const assertion = await signJwt({ iss: sa.client_email, scope: scopes.join(' '), aud: TOKEN_URL, iat, exp: iat + 3600 }, sa.private_key);
  const res = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new ProviderError('needs_authorization', `Google rejected the service account: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}

export async function refreshTokenAccess(env, prefix, fetchImpl = workerFetch) {
  const id = env[`${prefix}_CLIENT_ID`]; const secret = env[`${prefix}_CLIENT_SECRET`]; const refresh = env[`${prefix}_REFRESH_TOKEN`];
  if (!id || !secret) throw new ProviderError('not_configured', `${prefix}_CLIENT_ID / ${prefix}_CLIENT_SECRET not set.`);
  if (!refresh) throw new ProviderError('needs_authorization', `${prefix}_REFRESH_TOKEN not set — complete the OAuth consent step.`);
  const res = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: refresh }).toString() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new ProviderError('needs_authorization', `OAuth refresh failed: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}

// Map a Google API error response to an honest provider status.
export async function googleApiError(res, api) {
  const body = await res.json().catch(() => ({}));
  const msg = body?.error?.message || `HTTP ${res.status}`;
  if (res.status === 401) return new ProviderError('needs_authorization', `${api}: ${msg}`);
  if (res.status === 403 && /has not been used|disabled|not enabled|quota.*0|access.*not.*approved|PERMISSION_DENIED.*api/i.test(msg)) return new ProviderError('pending_approval', `${api}: ${msg}`);
  if (res.status === 403) return new ProviderError('needs_authorization', `${api}: ${msg} (grant the account access to the property)`);
  return new ProviderError('error', `${api}: ${msg}`);
}
