// Real server-side Cloudflare Access verification (not header presence).
// Verifies the Access JWT's RS256 signature against the team's public keys and
// checks issuer, audience, expiry. Fails closed when not configured.
//
// Env:
//   CF_ACCESS_TEAM_DOMAIN  e.g. "gidgarage.cloudflareaccess.com" (Zero Trust → Settings → Custom pages / team domain)
//   CF_ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"
// Tests: tests/seo-auth.test.js

const certCache = new Map(); // team -> { keys, fetchedAt }
const CERT_TTL_MS = 60 * 60 * 1000;

const b64urlToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const decodePart = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
const teamOrigin = d => `https://${String(d).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

function tokenFrom(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] || null;
}

async function teamKeys(team, fetchImpl, now, forceRefresh = false) {
  const cached = certCache.get(team);
  if (cached && !forceRefresh && now - cached.fetchedAt < CERT_TTL_MS) return cached.keys;
  const res = await fetchImpl(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const keys = (await res.json()).keys || [];
  certCache.set(team, { keys, fetchedAt: now });
  return keys;
}

// -> { ok: true, email } | { ok: false, status: 401 | 403 | 500, error }
export async function verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return { ok: false, status: 500, error: 'Access verification not configured (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD).' };
  const token = tokenFrom(request);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 403, error: 'Forbidden' };
  let header; let payload;
  try { header = decodePart(parts[0]); payload = decodePart(parts[1]); } catch { return { ok: false, status: 403, error: 'Forbidden' }; }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, status: 403, error: 'Forbidden' };

  const team = teamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  let keys;
  try {
    keys = await teamKeys(team, fetchImpl, now);
    if (!keys.some(k => k.kid === header.kid)) keys = await teamKeys(team, fetchImpl, now, true); // key rotation
  } catch (e) {
    return { ok: false, status: 500, error: e.message };
  }
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return { ok: false, status: 403, error: 'Forbidden' };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return { ok: false, status: 403, error: 'Forbidden' };

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const nowSec = Math.floor(now / 1000);
  if (payload.iss !== team) return { ok: false, status: 403, error: 'Forbidden' };
  if (!aud.includes(env.CF_ACCESS_AUD)) return { ok: false, status: 403, error: 'Forbidden' };
  if (!payload.exp || payload.exp < nowSec) return { ok: false, status: 403, error: 'Forbidden' };
  if (payload.nbf && payload.nbf > nowSec + 60) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, email: payload.email || null };
}

// Constant-time string comparison for shared secrets.
export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a ?? ''));
  const y = new TextEncoder().encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function _clearAccessCertCache() { certCache.clear(); }
