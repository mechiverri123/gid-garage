// License plate -> VIN and vehicle (CarAPI, prepaid credits; CARAPI_TOKEN and
// CARAPI_SECRET in Cloudflare). Vehicle data only, never owner details. Each real
// lookup costs a credit, so results are kept in R2 and the UI only calls this from
// a button. Plates move between cars, so a saved result expires.

const API = 'https://carapi.app/api';
const KEEP_MS = 90 * 86400000;
const TOKEN_MS = 3600000;

let jwt = null;
let jwtAt = 0;

export const cleanPlate = raw => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function token(env, fetchImpl, now) {
  if (jwt && now - jwtAt < TOKEN_MS) return jwt;
  const res = await fetchImpl(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
    body: JSON.stringify({ api_token: env.CARAPI_TOKEN, api_secret: env.CARAPI_SECRET }),
  });
  if (!res.ok) throw new Error('Plate lookup login failed. Check CARAPI_TOKEN and CARAPI_SECRET.');
  jwt = (await res.text()).trim();
  jwtAt = now;
  return jwt;
}

export async function plateLookup({ plate, state, env, bucket, fetchImpl = (...a) => fetch(...a), now = Date.now() }) {
  const p = cleanPlate(plate);
  const s = String(state || '').toUpperCase().trim();
  if (p.length < 2 || p.length > 8) throw new Error('Enter the plate, 2 to 8 letters or numbers.');
  if (!/^[A-Z]{2}$/.test(s)) throw new Error('Enter the two-letter state.');
  if (!env.CARAPI_TOKEN || !env.CARAPI_SECRET) throw new Error('Plate lookup is not set up yet. Add CARAPI_TOKEN and CARAPI_SECRET in Cloudflare.');

  const key = `private/plates/${s}-${p}.json`;
  try {
    const saved = await (await bucket?.get(key))?.json();
    if (saved && now - saved.at < KEEP_MS) return { ...saved.result, cached: true };
  } catch { /* a cache miss only costs a lookup */ }

  const url = `${API}/license-plate?country_code=US&region=${s}&lookup=${encodeURIComponent(p)}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${await token(env, fetchImpl, now)}`, Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('No vehicle found for that plate and state.');
  if (!res.ok) {
    if (res.status === 401) jwt = null;
    throw new Error(body.message || `Plate lookup failed (${res.status}).`);
  }

  const engine = body.engine_description || '';
  const result = {
    vin: body.vin || '',
    vehicle: [body.year, body.make, body.model, engine].filter(Boolean).join(' '),
  };
  await bucket?.put(key, JSON.stringify({ at: now, result })).catch(() => {});
  return result;
}
