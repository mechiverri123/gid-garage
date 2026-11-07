// License plate lookup: a saved result must not spend a second credit, and bad
// input must never reach the paid API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateLookup, cleanPlate } from '../functions/_lib/plate-lookup.js';

const env = { CARAPI_TOKEN: 't', CARAPI_SECRET: 's' };
const bucketStub = () => {
  const m = new Map();
  return { get: async k => (m.has(k) ? { json: async () => JSON.parse(m.get(k)) } : null), put: async (k, v) => { m.set(k, v); } };
};
const api = (status, body) => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/login')) return new Response('jwt-token', { status: 200 });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
};
const found = { year: 2020, make: 'Ford', model: 'F-150', vin: '1FTFW1E5XLFA00000', engine_description: '5.0L V8' };

test('cleans plates the way people type them', () => {
  assert.equal(cleanPlate(' abc-12 34 '), 'ABC1234');
});

test('returns the vehicle and VIN, and a repeat lookup is free', async () => {
  const { calls, fetchImpl } = api(200, found);
  const bucket = bucketStub();
  const first = await plateLookup({ plate: 'abc 1234', state: 'az', env, bucket, fetchImpl, now: 1 });
  assert.deepEqual(first, { vin: found.vin, vehicle: '2020 Ford F-150 5.0L V8' });
  assert.ok(calls.some(u => u.includes('region=AZ') && u.includes('lookup=ABC1234')));

  const lookups = () => calls.filter(u => u.includes('license-plate')).length;
  assert.equal(lookups(), 1);
  const second = await plateLookup({ plate: 'ABC1234', state: 'AZ', env, bucket, fetchImpl, now: 2 });
  assert.equal(second.cached, true);
  assert.equal(lookups(), 1);
});

test('a saved result expires, because plates move between cars', async () => {
  const { calls, fetchImpl } = api(200, found);
  const bucket = bucketStub();
  await plateLookup({ plate: 'EXP123', state: 'AZ', env, bucket, fetchImpl, now: 1 });
  await plateLookup({ plate: 'EXP123', state: 'AZ', env, bucket, fetchImpl, now: 91 * 86400000 });
  assert.equal(calls.filter(u => u.includes('license-plate')).length, 2);
});

test('bad input and missing keys never call the paid API', async () => {
  const { calls, fetchImpl } = api(200, found);
  await assert.rejects(plateLookup({ plate: 'A', state: 'AZ', env, fetchImpl }), /2 to 8/);
  await assert.rejects(plateLookup({ plate: 'ABC123', state: 'Arizona', env, fetchImpl }), /two-letter/);
  await assert.rejects(plateLookup({ plate: 'ABC123', state: 'AZ', env: {}, fetchImpl }), /not set up/);
  assert.equal(calls.length, 0);
});

test('no match says so and is not saved', async () => {
  const { fetchImpl } = api(404, { message: 'Not found' });
  const bucket = bucketStub();
  await assert.rejects(plateLookup({ plate: 'NOPE12', state: 'AZ', env, bucket, fetchImpl, now: 1 }), /No vehicle found/);
  assert.equal(await bucket.get('private/plates/AZ-NOPE12.json'), null);
});
