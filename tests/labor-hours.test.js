// Labor-hour suggestion: VIN decode, hours only, budget respected, cost recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeVin, parseSuggestion, suggestLaborHours } from '../functions/_lib/labor-hours.js';

const vpic = { Results: [{ ModelYear: '2015', Make: 'ACURA', Model: 'TLX', Trim: 'Tech', DisplacementL: '3.5', EngineCylinders: '6', FuelTypePrimary: 'Gasoline', DriveType: 'FWD' }] };

test('VIN decode: 17-character VINs only; vehicle text from vPIC', async () => {
  assert.equal(await decodeVin('123'), null);
  assert.equal(await decodeVin('19UUB1F5XFA00000I'), null); // I is never in a VIN
  const v = await decodeVin('19uub1f5xfa000000', async () => new Response(JSON.stringify(vpic)));
  assert.equal(v, '2015 ACURA TLX Tech 3.5L 6-cyl Gasoline FWD');
});

test('answer parsing: hours only, sane range', () => {
  assert.deepEqual(parseSuggestion('Sure: {"hours": 1.25, "low": 1, "high": 1.5, "reason": "Two-piston caliper"}'), { hours: 1.3, low: 1, high: 1.5, reason: 'Two-piston caliper' });
  assert.equal(parseSuggestion('{"hours": 99}'), null);
  assert.equal(parseSuggestion('no json'), null);
});

test('suggest: uses the decoded VIN, records the cost, stops when the budget is used up', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push(u);
    if (u.includes('jarvis_ai_usage')) return new Response('[]');
    if (u.includes('rpc/jarvis_add_usage')) return new Response(null, { status: 204 });
    if (u.includes('vpic')) return new Response(JSON.stringify(vpic));
    const body = JSON.parse(init.body);
    assert.match(body.messages[0].content, /2015 ACURA TLX/);
    assert.match(body.system, /no prices/);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"hours":1.2,"low":1,"high":1.5,"reason":"Front pads, slides cleaned"}' }], usage: { input_tokens: 200, output_tokens: 40 } }));
  };
  const r = await suggestLaborHours({ base: 'https://sb/rest/v1', headers: {}, env: { ANTHROPIC_API_KEY: 'k' }, vin: '19UUB1F5XFA000000', service: 'Front brake pad replacement', fetchImpl });
  assert.deepEqual([r.hours, r.decodedFromVin], [1.2, true]);
  assert.ok(calls.some(u => u.includes('rpc/jarvis_add_usage')));
  const blocked = async u => (String(u).includes('jarvis_ai_usage') ? new Response(JSON.stringify([{ provider: 'anthropic', usd: 999, units: 1 }])) : new Response('{}'));
  await assert.rejects(suggestLaborHours({ base: 'b', headers: {}, env: { ANTHROPIC_API_KEY: 'k' }, service: 'x', fetchImpl: blocked }), /budget/);
});
