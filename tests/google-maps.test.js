// Google Places (New) / Routes helpers return the legacy shapes callers read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeDetails, textSearch, drivingMeters } from '../functions/_lib/google-maps.js';

const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('place details: key and field mask in headers, legacy shape back', async () => {
  const p = await placeDetails('k', 'ChIJ1', ['rating', 'user_ratings_total', 'reviews'], async (url, init) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places/ChIJ1');
    assert.equal(init.headers['X-Goog-Api-Key'], 'k');
    assert.equal(init.headers['X-Goog-FieldMask'], 'rating,userRatingCount,reviews');
    return res({ rating: 4.8, userRatingCount: 9, reviews: [{ authorAttribution: { displayName: 'Ann' }, rating: 5, text: { text: 'Great' }, publishTime: '2026-10-01T00:00:00Z' }] });
  });
  assert.deepEqual([p.rating, p.user_ratings_total, p.reviews[0].author_name, p.reviews[0].text, p.reviews[0].time], [4.8, 9, 'Ann', 'Great', 1790812800]);
});

test('text search maps ids and locations; errors carry Google status and denied flag', async () => {
  const [r] = await textSearch('k', 'auto repair', { lat: 35, lng: -111, radius: 60000 }, async (_u, init) => {
    assert.equal(JSON.parse(init.body).locationBias.circle.radius, 50000);
    return res({ places: [{ id: 'p1', displayName: { text: 'Shop' }, location: { latitude: 35.1, longitude: -111.6 } }] });
  });
  assert.deepEqual([r.place_id, r.name, r.geometry.location.lat], ['p1', 'Shop', 35.1]);
  const err = await placeDetails('k', 'x', ['rating'], async () => res({ error: { message: 'API not enabled', status: 'PERMISSION_DENIED' } }, 403)).catch(e => e);
  assert.equal(err.denied, true);
  assert.match(err.message, /Google 403: API not enabled \(PERMISSION_DENIED\)/);
  const html = await placeDetails('k', 'x', ['rating'], async () => new Response('<!DOCTYPE html>', { status: 404 })).catch(e => e);
  assert.match(html.message, /Google 404: not a data response/);
});

test('driving distance: meters from the route matrix, clear error when no route', async () => {
  assert.equal(await drivingMeters('k', 'A', 'B', { fetchImpl: async () => res([{ distanceMeters: 52679, condition: 'ROUTE_EXISTS', status: {} }]) }), 52679);
  await assert.rejects(drivingMeters('k', 'A', 'B', { fetchImpl: async () => res([{ condition: 'ROUTE_NOT_FOUND', status: {} }]) }), /No driving route/);
});
