// Canonical GID Garage service area — the ONE place geography is decided.
// Every geographic recommendation must pass isInsideServiceArea(); the LLM
// never decides eligibility. Pure functions. Tests: tests/seo-service-area.test.js
//
// Distances are straight-line (great-circle) miles from Flagstaff's center,
// not road miles (the public site lists road miles, e.g. Sedona "28").

export const SERVICE_AREA = {
  name: 'Flagstaff, AZ',
  center: { lat: 35.1983, lng: -111.6513 }, // same point the public site map uses (src/App.tsx SERVICE_AREAS)
  radiusMiles: 30,
  businessType: 'service_area_business', // mobile: customers never travel to a storefront
};

// Communities. In-area coordinates are the ones already published on the
// site's map (App.tsx SERVICE_AREAS). Outside places are here so a query or
// address naming them is recognized as outside, never guessed as local.
// zone = internal intelligence grouping only — never a reason to build pages.
export const PLACES = [
  { slug: 'flagstaff', name: 'Flagstaff', lat: 35.1983, lng: -111.6513, zone: 'flagstaff-core', aliases: ['flag', 'flg'], zips: ['86001', '86004', '86005'] },
  { slug: 'nau', name: 'NAU / university area', lat: 35.1894, lng: -111.6538, zone: 'university', aliases: ['nau', 'northern arizona university', 'nau campus'], zips: ['86011'] },
  { slug: 'fort-valley', name: 'Fort Valley', lat: 35.2300, lng: -111.6800, zone: 'flagstaff-north' },
  { slug: 'kachina-village', name: 'Kachina Village', lat: 35.0970, lng: -111.6927, zone: 'i17-south' },
  { slug: 'mountainaire', name: 'Mountainaire', lat: 35.0855, lng: -111.6656, zone: 'i17-south' },
  { slug: 'doney-park', name: 'Doney Park', lat: 35.2695, lng: -111.5140, zone: 'east' },
  { slug: 'bellemont', name: 'Bellemont', lat: 35.2381, lng: -111.8335, zone: 'west', zips: ['86015'] },
  { slug: 'munds-park', name: 'Munds Park', lat: 35.0219, lng: -111.6291, zone: 'i17-south', zips: ['86017'] },
  { slug: 'winona', name: 'Winona', lat: 35.2045, lng: -111.4051, zone: 'east' },
  { slug: 'parks', name: 'Parks', lat: 35.2636, lng: -111.9505, zone: 'west', zips: ['86018'] },
  { slug: 'sedona', name: 'Sedona', lat: 34.8697, lng: -111.7610, zone: 'sedona-corridor', zips: ['86336'] },
  // Outside the 30-mile radius (listed so they're recognized, not guessed).
  { slug: 'village-of-oak-creek', name: 'Village of Oak Creek', lat: 34.7806, lng: -111.7613, zone: 'sedona-corridor', aliases: ['voc', 'oak creek village'], zips: ['86351'] },
  { slug: 'williams', name: 'Williams', lat: 35.2495, lng: -112.1910, zips: ['86046'] },
  { slug: 'winslow', name: 'Winslow', lat: 35.0242, lng: -110.6974, zips: ['86047'] },
  { slug: 'camp-verde', name: 'Camp Verde', lat: 34.5636, lng: -111.8543, zips: ['86322'] },
  { slug: 'cottonwood', name: 'Cottonwood', lat: 34.7392, lng: -112.0099, zips: ['86326'] },
  { slug: 'prescott', name: 'Prescott', lat: 34.5400, lng: -112.4685 },
  { slug: 'grand-canyon', name: 'Grand Canyon Village', lat: 36.0544, lng: -112.1401 },
  { slug: 'tuba-city', name: 'Tuba City', lat: 36.1350, lng: -111.2399 },
  { slug: 'phoenix', name: 'Phoenix', lat: 33.4484, lng: -112.0740, aliases: ['phx'] },
];

// Places that are unambiguously far outside (no coordinates needed).
export const FAR_PLACES = [
  'tucson', 'mesa', 'scottsdale', 'tempe', 'chandler', 'gilbert', 'glendale', 'peoria', 'surprise', 'yuma', 'kingman',
  'lake havasu', 'show low', 'payson', 'page', 'las vegas', 'albuquerque', 'santa fe', 'los angeles', 'san diego',
  'denver', 'salt lake', 'st george', 'el paso', 'dallas', 'houston', 'austin', 'miami', 'orlando', 'tampa', 'chicago',
  'new york', 'seattle', 'portland', 'sacramento', 'san francisco',
  'california', 'nevada', 'utah', 'new mexico', 'colorado', 'texas', 'florida', 'oregon', 'washington state', 'idaho',
  'uk', 'canada', 'australia', 'india', 'philippines',
];

const EARTH_MILES = 3958.8;
const rad = d => (d * Math.PI) / 180;

export function distanceMiles(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const hasPhrase = (hay, phrase) => ` ${hay} `.includes(` ${norm(phrase)} `);

// Find the known place(s) a free-text string mentions (query, address, city).
export function findPlaces(text) {
  const t = norm(text);
  if (!t) return { places: [], far: [] };
  const places = PLACES.filter(p => [p.name, p.slug.replace(/-/g, ' '), ...(p.aliases || [])].some(n => hasPhrase(t, n))
    || (p.zips || []).some(z => new RegExp(`\\b${z}\\b`).test(t)));
  const far = FAR_PLACES.filter(n => hasPhrase(t, n));
  return { places, far };
}

// THE guard. Accepts {lat,lng}, or free text (address, city, ZIP, query).
// inside: true | false | null (null = can't tell — never guessed).
export function isInsideServiceArea(location, area = SERVICE_AREA) {
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    const d = distanceMiles(area.center, location);
    return verdict(d <= area.radiusMiles, d, 'coordinates', 'high', area);
  }
  const { places, far } = findPlaces(typeof location === 'string' ? location : location?.text);
  if (places.length) {
    // Several named places: the closest one decides (an address says "Flagstaff, AZ 86001").
    const best = places.map(p => ({ p, d: distanceMiles(area.center, p) })).sort((x, y) => x.d - y.d)[0];
    return { ...verdict(best.d <= area.radiusMiles, best.d, `place:${best.p.slug}`, 'medium', area), place: best.p.slug, zone: best.p.zone || null };
  }
  if (far.length) return verdict(false, null, `far_place:${far[0]}`, 'medium', area);
  return { inside: null, distanceMiles: null, resolvedAs: 'unresolved', confidence: 'none', requiresExpansionDecision: false };
}

function verdict(inside, d, resolvedAs, confidence, area) {
  return {
    inside,
    distanceMiles: d == null ? null : Math.round(d * 10) / 10,
    resolvedAs,
    confidence,
    // Anything outside the configured radius needs an explicit business
    // decision to expand — it is never recommended automatically.
    requiresExpansionDecision: inside === false,
    radiusMiles: area.radiusMiles,
  };
}

// Aggregate records (e.g. bookings with an address) into service-area zones
// for the internal map. Never returns an individual address; groups below
// minCount are folded into "other in-area" so one customer can't be singled out.
export function aggregateByArea(records, { textOf = r => r.address, minCount = 3, area = SERVICE_AREA } = {}) {
  const byPlace = new Map();
  let outside = 0;
  let unknown = 0;
  for (const r of records) {
    const v = isInsideServiceArea(textOf(r) || '', area);
    if (v.inside === null) { unknown += 1; continue; }
    if (v.inside === false) { outside += 1; continue; }
    const place = PLACES.find(p => p.slug === v.place) || null;
    const key = place?.slug || 'in-area';
    const g = byPlace.get(key) || { slug: key, name: place?.name || 'In service area', lat: place?.lat ?? area.center.lat, lng: place?.lng ?? area.center.lng, zone: place?.zone || null, count: 0 };
    g.count += 1;
    byPlace.set(key, g);
  }
  const shown = [];
  let other = 0;
  for (const g of byPlace.values()) (g.count >= minCount ? shown.push(g) : (other += g.count));
  shown.sort((a, b) => b.count - a.count);
  return { areas: shown, otherInArea: other, outsideServiceArea: outside, unknownLocation: unknown, total: records.length };
}
