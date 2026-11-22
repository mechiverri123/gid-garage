import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, readReceipt } from '../functions/_lib/receipt-read.js';

test('parseReceipt keeps the total, store and a valid date', () => {
  assert.deepEqual(parseReceipt('Here: {"store": "AutoZone 2782", "date": "2026-11-10", "total": 220.64}'), { total: 220.64, store: 'AutoZone 2782', address: '', date: '2026-11-10' });
  assert.equal(parseReceipt('{"store":"OReilly","address":"2654 E Route 66, Flagstaff, AZ","total":12}').address, '2654 E Route 66, Flagstaff, AZ');
  assert.deepEqual(parseReceipt('{"store": "Walmart", "date": "11/14", "total": "60.056"}'), { total: 60.06, store: 'Walmart', address: '', date: null });
  assert.equal(parseReceipt('{"total": null}'), null);
  assert.equal(parseReceipt('{"total": -5}'), null);
  assert.equal(parseReceipt('no json'), null);
});

test('readReceipt refuses odd files before spending anything', async () => {
  const env = { ANTHROPIC_API_KEY: 'k' };
  const never = async () => { throw new Error('should not fetch'); };
  await assert.rejects(readReceipt({ env, mediaType: 'image/heic', data: 'x', fetchImpl: never }), /photos|PDF/);
  await assert.rejects(readReceipt({ env, mediaType: 'image/jpeg', data: 'x'.repeat(7_000_001), fetchImpl: never }), /too large/);
});

test('readReceipt sends the image to Haiku and returns the total', async () => {
  let sent;
  const fake = async (url, opts = {}) => {
    if (url.includes('api.anthropic.com')) {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 30 }, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"store":"O\'Reilly","date":"2026-11-02","total":935.92}' }] }) };
    }
    return { ok: true, json: async () => [] }; // budget read / usage write
  };
  const r = await readReceipt({ base: 'https://db/rest/v1', headers: {}, env: { ANTHROPIC_API_KEY: 'k' }, mediaType: 'image/jpeg', data: 'abc', fetchImpl: fake });
  assert.equal(r.total, 935.92);
  assert.equal(sent.model, 'claude-haiku-5-5');
  assert.deepEqual(sent.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' } });
});

test('VIN and odometer reads are checked before they reach a job', async () => {
  const { parseVin, parseOdometer } = await import('../functions/_lib/receipt-read.js');
  assert.deepEqual(parseVin('{"vin": "1ftfw1e5 0nfa12345"}'), { vin: '1FTFW1E50NFA12345' });
  assert.deepEqual(parseVin('{"vin": "1FTFW1E5ONFA1234I"}'), { vin: '1FTFW1E50NFA12341' }, 'O and I become 0 and 1');
  assert.equal(parseVin('{"vin": "1FTFW1E50NFA1234"}'), null, '16 characters');
  assert.equal(parseVin('{"vin": null}'), null);
  assert.deepEqual(parseOdometer('{"reading": 98231, "unit": "mi"}'), { miles: 98231 });
  assert.deepEqual(parseOdometer('{"reading": 100000, "unit": "km"}'), { miles: 62137 });
  assert.equal(parseOdometer('{"reading": null}'), null);
});
