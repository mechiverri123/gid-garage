import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickQuoteVehicle } from '../functions/_lib/quick-quote.js';

test('quick quote: a message pasted into Model goes to the notes, not the vehicle', () => {
  const msg = 'Bolt Hi I was looking to get a quote for some work on my Bolt, front ABS sensor and washers';
  assert.deepEqual(quickQuoteVehicle({ year: '2017', make: 'Chevy', model: msg, engine: 'Premier Trim', issue: '' }),
    { vehicle: '2017 Chevy Bolt Premier Trim', notes: msg });
  assert.deepEqual(quickQuoteVehicle({ year: '2015', make: 'Toyota', model: 'Camry', engine: '2.5L', issue: 'Brakes squeak' }),
    { vehicle: '2015 Toyota Camry 2.5L', notes: 'Brakes squeak' });
  assert.equal(quickQuoteVehicle({}).vehicle, 'Not specified');
});
