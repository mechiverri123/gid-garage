// Google Places API (New) + Routes API. Google Cloud projects created after
// early 2025 can't enable the legacy Places / Distance Matrix APIs, so every
// caller goes through here. Results come back in the legacy shapes the callers
// already read (place_id, user_ratings_total, reviews[].author_name, ...).
// Tests: tests/google-maps.test.js

const FIELD = { name: 'displayName', rating: 'rating', user_ratings_total: 'userRatingCount', reviews: 'reviews', url: 'googleMapsUri', website: 'websiteUri' };

export class GoogleMapsError extends Error {
  constructor(status, message, reason) { super(`Google ${status}: ${message}${reason ? ` (${reason})` : ''}`); this.status = status; this.denied = status === 401 || status === 403; }
}

async function call(fetchImpl, url, key, mask, body, signal) {
  const res = await fetchImpl(url, {
    method: body ? 'POST' : 'GET', signal,
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new GoogleMapsError(res.status, data?.error?.message || 'not a data response (check the Google Cloud project and billing)', data?.error?.status);
  return data;
}

export const legacyPlace = (p = {}) => ({
  place_id: p.id, name: p.displayName?.text, rating: p.rating, user_ratings_total: p.userRatingCount,
  url: p.googleMapsUri, website: p.websiteUri, types: p.types,
  geometry: p.location ? { location: { lat: p.location.latitude, lng: p.location.longitude } } : undefined,
  reviews: p.reviews?.map(r => ({
    author_name: r.authorAttribution?.displayName, profile_photo_url: r.authorAttribution?.photoUri, rating: r.rating,
    text: r.text?.text || r.originalText?.text || '', relative_time_description: r.relativePublishTimeDescription,
    time: r.publishTime ? Math.floor(Date.parse(r.publishTime) / 1000) : undefined,
  })),
});

// fields: legacy names, e.g. ['rating', 'user_ratings_total', 'reviews'].
export async function placeDetails(key, placeId, fields, fetchImpl = (...a) => fetch(...a)) {
  return legacyPlace(await call(fetchImpl, `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, key, fields.map(f => FIELD[f]).join(',')));
}

export async function textSearch(key, query, { lat, lng, radius, fields = 'places.id,places.displayName,places.rating,places.userRatingCount,places.types,places.location' }, fetchImpl = (...a) => fetch(...a)) {
  const d = await call(fetchImpl, 'https://places.googleapis.com/v1/places:searchText', key, fields,
    // Pure service-area businesses (no public address: GID and most mobile mechanics)
    // are left out unless asked for.
    { textQuery: query, includePureServiceAreaBusinesses: true, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 50000) } } });
  return (d.places || []).map(legacyPlace);
}

// One-way driving distance in meters (Routes API route matrix).
export async function drivingMeters(key, origin, destination, { fetchImpl = (...a) => fetch(...a), signal } = {}) {
  const d = await call(fetchImpl, 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', key, 'distanceMeters,condition,status',
    { origins: [{ waypoint: { address: origin } }], destinations: [{ waypoint: { address: destination } }], travelMode: 'DRIVE' }, signal);
  const el = Array.isArray(d) ? d[0] : null;
  if (!el || el.condition !== 'ROUTE_EXISTS' || !(el.distanceMeters > 0)) throw new Error(`No driving route found${el?.status?.message ? `: ${el.status.message}` : ''}`);
  return el.distanceMeters;
}
