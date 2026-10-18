// Daily Google Maps position (monitors.js maps_rank) and its Scorecard summary (mapsStanding).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsRank, rankChecks, placeIn } from '../functions/_lib/seo/monitors.js';
import { mapsStanding } from '../shared/seo/agent.js';

test('maps_rank: one Places search per tracked search x town, GID found by place id or name', async () => {
  const calls = []; const inserted = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ mask: init.headers['X-Goog-FieldMask'], q: body.textQuery });
    const places = [{ id: 'w', displayName: { text: 'Woodys Auto And Mobile Mechanic' }, primaryTypeDisplayName: { text: 'Auto repair shop' } }, { id: 'gid', displayName: { text: 'GID Garage Mobile Mechanic' }, primaryTypeDisplayName: { text: 'Mechanic' } }, { id: 'm', displayName: { text: 'Munoz & Sons' } }];
    return new Response(JSON.stringify({ places: body.textQuery === 'auto repair flagstaff' ? places.filter(p => p.id !== 'gid') : places }));
  };
  const store = { insert: async (t, rows) => { inserted.push(...rows.map(r => ({ t, ...r }))); return rows; } };
  const r = await mapsRank.sync({ env: { GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'gid' }, fetch, store, now: new Date('2026-10-18T03:00:00Z') });
  assert.equal(calls.length, rankChecks().length);
  assert.equal(calls[0].mask, 'places.id,places.displayName,places.primaryTypeDisplayName'); // Pro tier only
  assert.equal(inserted.length, rankChecks().length);
  const fl = inserted.find(x => x.keyword === 'mobile mechanic' && x.area_name === 'Flagstaff');
  assert.deepEqual([fl.t, fl.rank, fl.in_local_pack, fl.method, fl.observed_on], ['seo_rank_observations', 2, true, 'api', '2026-10-17']); // Arizona date
  assert.deepEqual(fl.competitors, [{ name: 'Woodys Auto And Mobile Mechanic', category: 'Auto repair shop' }, { name: 'Munoz & Sons', category: null }, { name: 'GID Garage Mobile Mechanic', category: 'Mechanic', you: true }]);
  assert.equal(inserted.find(x => x.keyword === 'auto repair flagstaff').rank, null);
  assert.equal(r.next, null);
  // Without a place id, the name still finds GID.
  assert.equal(placeIn([{ name: 'Other' }, { name: 'GID Garage Mobile Mechanic' }], undefined), 2);
});

test('maps_rank: batched by the sync budget', async () => {
  const fetch = async () => new Response(JSON.stringify({ places: [] }));
  const r = await mapsRank.sync({ env: { GOOGLE_PLACES_API_KEY: 'k' }, fetch, store: { insert: async () => [] }, now: new Date(), batch: { offset: 0, limit: 10 } });
  assert.equal(r.rows, 10);
  assert.equal(r.next, 10);
});

test('mapsStanding: latest day per search x town vs a week earlier; manual checks ignored', () => {
  const o = (keyword, area_name, observed_on, rank, extra = {}) => ({ keyword, area_name, observed_on, rank, method: 'api', competitors: ['Woody'], ...extra });
  const rows = [
    o('mobile mechanic', 'Flagstaff', '2026-10-17', 2),
    o('mobile mechanic', 'Flagstaff', '2026-10-17', 1, { created_at: '2026-10-17T20:00:00Z' }), // Check now later that day wins
    o('mobile mechanic', 'Sedona', '2026-10-17', null),
    o('mobile mechanic', 'Flagstaff', '2026-10-14', 9), // inside the week: not the comparison
    o('mobile mechanic', 'Flagstaff', '2026-10-09', 5),
    o('mobile mechanic', 'Sedona', '2026-10-09', 4),
    { keyword: 'mobile mechanic', area_name: 'Flagstaff', observed_on: '2026-10-18', rank: 15, method: 'manual' },
  ];
  const m = mapsStanding(rows);
  assert.equal(m.date, '2026-10-17');
  assert.equal(m.comparedTo, '2026-10-09');
  assert.deepEqual(m.cells.map(c => [c.area, c.rank, c.before]), [['Flagstaff', 1, 5], ['Sedona', null, 4]]);
  assert.deepEqual([m.checks, m.shown, m.top3, m.top3Before, m.average, m.averageBefore], [2, 1, 1, 0, 1, 4.5]);
  assert.equal(mapsStanding([]), null);
});

test('mapsStanding: categories of the businesses above GID vs its own; old name-only rows still work', () => {
  const o = (keyword, area_name, rank, competitors) => ({ keyword, area_name, observed_on: '2026-10-18', rank, method: 'api', competitors });
  const m = mapsStanding([
    o('brake repair', 'Flagstaff', 9, [{ name: 'Big O', category: 'Brake shop' }, { name: 'Woody', category: 'Auto repair shop' }, { name: 'GID', category: 'Mechanic', you: true }]),
    o('brake repair', 'Sedona', null, [{ name: 'Midas', category: 'Brake shop' }]),
    o('mobile mechanic', 'Flagstaff', 2, [{ name: 'Woody', category: 'Mechanic' }]), // GID top 3: not counted
    o('oil change', 'Flagstaff', 7, ['Jiffy Lube']),
  ]);
  assert.equal(m.categories.yours, 'Mechanic');
  assert.deepEqual(m.categories.beatingYou, [
    { category: 'Brake shop', searches: 2, names: ['Big O', 'Midas'], missing: true },
    { category: 'Auto repair shop', searches: 1, names: ['Woody'], missing: true },
  ]);
  assert.equal(m.cells.find(c => c.keyword === 'oil change').leader, 'Jiffy Lube');
  assert.equal(m.cells.find(c => c.keyword === 'brake repair' && c.area === 'Flagstaff').leader, 'Big O');
});
