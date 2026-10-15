// AI job summary: facts only (no address/phone), cached until the job changes,
// cachedOnly never calls the AI, budget respected, cost recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobSummary, summaryInput, summaryKey } from '../functions/_lib/job-summary.js';

function fakeBucket() {
  const store = new Map();
  return { store, get: async k => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null), put: async (k, v) => { store.set(k, v); } };
}

const row = {
  id: 'GID-1', customer_id: 'c1', fname: 'Jill', lname: 'Hart', phone: '9285551234', email: 'j@x.com', service_address: '12 Pine St',
  date: '2026-10-15', job_status: 'ESTIMATE', service: 'brakes', vehicle: '2014 Jeep Wrangler',
  line_items: JSON.stringify([{ label: 'Front pads + rotors', amount: 269.99 }]), estimate_notes: 'Front brakes grinding',
  inspection_data: JSON.stringify({ nextVisit: { items: [{ id: 'coil', label: 'Coil packs', service: 'Coil pack replacement', status: 'soon', laborHours: 1.2 }], response: { approved: [], declined: ['coil'] } } }),
};
const past = [{ id: 'GID-0', date: '2026-08-01', job_status: 'PAID', service: 'oil', vehicle: '2014 Jeep Wrangler', line_items: JSON.stringify([{ label: 'Oil change', amount: 79.99 }]) }];

test('summary input: the job facts, next-visit answers and past jobs, never address/phone/email', () => {
  const s = summaryInput(row, [row, ...past]);
  assert.match(s, /Front pads \+ rotors/);
  assert.match(s, /Coil pack replacement/);
  assert.match(s, /"declined":\["coil"\]/);
  assert.match(s, /Oil change/);
  assert.match(s, /"customerFirstName":"Jill"/);
  for (const secret of ['12 Pine St', '9285551234', 'j@x.com', 'Hart']) assert.ok(!s.includes(secret), secret);
  assert.equal((s.match(/GID-1/g) || []).length, 0, 'the job itself is not repeated as a past job');
});

test('job summary: one AI call, then cached until the job changes; cachedOnly is free; budget stops it', async () => {
  let current = { ...row }; let ai = 0; const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push(u);
    if (u.includes('jarvis_ai_usage')) return new Response('[]');
    if (u.includes('rpc/jarvis_add_usage')) return new Response(null, { status: 204 });
    if (u.includes('/bookings?') && u.includes('customer_id=')) return new Response(JSON.stringify([current, ...past]));
    if (u.includes('/bookings?')) return new Response(JSON.stringify([current]));
    ai += 1;
    const body = JSON.parse(init.body);
    assert.match(body.system, /ONLY those facts/);
    assert.ok(!body.messages[0].content.includes('12 Pine St'));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: `2014 Wrangler · front brakes (${ai})` }], usage: { input_tokens: 900, output_tokens: 60 } }));
  };
  const bucket = fakeBucket();
  const args = { base: 'https://sb/rest/v1', headers: {}, env: { ANTHROPIC_API_KEY: 'k' }, bucket, id: 'GID-1', fetchImpl };

  assert.deepEqual(await jobSummary({ ...args, cachedOnly: true }), { summary: null, stale: false });
  assert.equal(ai, 0, 'cachedOnly never calls the AI');

  const first = await jobSummary(args);
  assert.deepEqual([first.summary, first.cached, ai], ['2014 Wrangler · front brakes (1)', false, 1]);
  assert.ok(calls.some(u => u.includes('rpc/jarvis_add_usage')), 'cost recorded');
  assert.ok(bucket.store.has(summaryKey('GID-1')));

  const again = await jobSummary(args);
  assert.deepEqual([again.summary, again.cached, ai], [first.summary, true, 1], 'unchanged job: no second AI call');
  assert.equal((await jobSummary({ ...args, cachedOnly: true })).summary, first.summary);

  current = { ...row, garage_notes: 'Rotors were warped' };
  assert.deepEqual(await jobSummary({ ...args, cachedOnly: true }), { summary: null, stale: true }, 'changed job: saved summary is reported stale, not shown');
  const fresh = await jobSummary(args);
  assert.deepEqual([fresh.summary, ai], ['2014 Wrangler · front brakes (2)', 2]);

  current = { ...row, garage_notes: 'changed again' };
  const blocked = async (u, init) => (String(u).includes('jarvis_ai_usage') ? new Response(JSON.stringify([{ provider: 'anthropic', usd: 999, units: 1 }])) : fetchImpl(u, init));
  await assert.rejects(jobSummary({ ...args, fetchImpl: blocked }), /budget/);
  await assert.rejects(jobSummary({ ...args, id: '' }), /Which job/);
});
