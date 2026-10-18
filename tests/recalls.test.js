// Free NHTSA recall check (functions/_lib/recalls.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleRecalls } from '../functions/_lib/recalls.js';

test('VIN -> model -> NHTSA recalls; bad VIN or failed lookup shows nothing', async () => {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    if (url.includes('vpic')) return new Response(JSON.stringify({ Results: [{ Make: 'FORD', Model: 'F-150', ModelYear: '2015' }] }));
    return new Response(JSON.stringify({ results: [{ NHTSACampaignNumber: '15V340000', Component: 'SEAT BELTS:FRONT', Summary: 'Belt may detach.' }] }));
  };
  const r = await vehicleRecalls('1ftew1ef5fkd12345', fetch);
  assert.equal(r.vehicle, '2015 Ford F-150');
  assert.deepEqual(r.recalls, [{ campaign: '15V340000', component: 'Seat Belts', summary: 'Belt may detach.', date: null }]);
  assert.match(urls[1], /make=FORD&model=F-150&modelYear=2015/);
  assert.equal(await vehicleRecalls('nope', fetch), null);
  assert.equal(await vehicleRecalls('1FTEW1EF5FKD12345', async () => { throw new Error('down'); }), null);
});
