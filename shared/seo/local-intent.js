// Deterministic local-intent classifier + honest locality labels.
// Tests: tests/seo-local-intent.test.js
//
// Query classes (what the searcher wants):
//   high_local_commercial  service/mechanic + in-area place or "near me"  ("mobile brake repair flagstaff")
//   branded_local          GID Garage by name
//   service_no_geo         service + buying intent, no place              ("mobile brake repair")
//   local_informational    question about an in-area problem              ("why won't my car start in cold flagstaff")
//   nonlocal_low_value     names a place outside the area, or DIY specs   ("mechanic phoenix", "toyota brake torque spec")
//   global_informational   general knowledge, no place                    ("history of disc brakes")
//   unclassified
//
// Locality labels (where the searcher probably is — never more precise than
// the source allows):
//   confirmed_local  first-party proof: a lead/booking service address or an
//                    ad platform's physical-location report inside the radius
//   likely_local     strong signal but not proof: in-area place or "near me"
//                    in the query, GA4/Instagram city inside the area
//   unknown          no geographic signal (most Search Console rows)
//   nonlocal         names a place outside the area, or a non-US country

import { findPlaces, isInsideServiceArea } from './service-area.js';
import { SERVICE_CATALOG } from './services.js';

export const BRAND_TERMS = ['gid garage', 'gidgarage', 'gid mobile', 'gid mechanic'];

// The service catalog lives in ./services.js (with the source of every
// "offered" flag). Re-exported here for existing callers.
export const SERVICES = SERVICE_CATALOG;

const COMMERCIAL = ['repair', 'mechanic', 'service', 'replace', 'replacement', 'fix', 'cost', 'price', 'prices', 'quote', 'shop', 'mobile', 'change', 'install', 'best', 'cheap', 'affordable', 'near', 'open', 'appointment', 'same day', 'come to you', 'at home'];
const INFORMATIONAL = ['how', 'why', 'what', 'when', 'does', 'do i', 'can i', 'should i', 'symptoms', 'signs', 'meaning', 'vs', 'versus', 'history', 'guide', 'explained', 'diy', 'yourself'];
const LOW_VALUE = ['torque spec', 'torque specs', 'torque specification', 'part number', 'firing order', 'wiring diagram', 'diagram', 'fuse box', 'recall list', 'manual pdf'];
const NEAR_ME = ['near me', 'nearby', 'close to me', 'around me', 'in my area'];

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const phraseCache = new Map(); // catalog phrases: normalize once (hot path, see service-area.js)
const normPhrase = p => { let v = phraseCache.get(p); if (v === undefined) { v = norm(p); phraseCache.set(p, v); } return v; };
const has = (t, phrase) => ` ${t} `.includes(` ${normPhrase(phrase)} `);

export function detectService(query, services = SERVICES) {
  const t = norm(query);
  // Longest matching term wins ("brake pad" over "pad"), specific services before "general".
  let best = null;
  for (const s of services) {
    for (const term of s.terms) {
      if (has(t, term) && (!best || norm(term).length > norm(best.term).length || (best.service.id === 'general' && s.id !== 'general'))) best = { service: s, term };
    }
  }
  return best ? { id: best.service.id, label: best.service.label, offered: best.service.offered, matched: best.term } : null;
}

// Same query text → same answer, and Search Console repeats each query across
// dates/pages/devices, so default-option results are cached (capped). Each
// call gets its own copy so no caller can alter a cached result.
const classifyCache = new Map();
const CLASSIFY_CACHE_MAX = 5000;
export function classifyQuery(query, opts) {
  if (opts && (opts.brandTerms || opts.services || opts.area)) return classifyQueryUncached(query, opts);
  const key = String(query ?? '');
  let hit = classifyCache.get(key);
  if (!hit) {
    if (classifyCache.size >= CLASSIFY_CACHE_MAX) classifyCache.clear();
    hit = classifyQueryUncached(query);
    classifyCache.set(key, hit);
  }
  return { ...hit, reasons: [...hit.reasons] };
}

function classifyQueryUncached(query, { brandTerms = BRAND_TERMS, services = SERVICES, area } = {}) {
  const t = norm(query);
  const reasons = [];
  const branded = brandTerms.some(b => has(t, b));
  const { places, far } = findPlaces(t);
  const inAreaPlaces = places.filter(p => isInsideServiceArea(p, area).inside);
  const outsidePlaces = [...places.filter(p => !isInsideServiceArea(p, area).inside).map(p => p.name), ...far];
  const nearMe = NEAR_ME.some(p => has(t, p));
  const service = detectService(t, services);
  const commercial = COMMERCIAL.some(w => has(t, w));
  const informational = INFORMATIONAL.some(w => t.startsWith(`${w} `) || has(t, w));
  const lowValue = LOW_VALUE.some(w => has(t, w));

  let geo = 'none';
  if (inAreaPlaces.length) geo = 'in_area';
  else if (outsidePlaces.length) geo = 'outside';
  else if (nearMe) geo = 'near_me';

  let cls;
  if (branded) { cls = 'branded_local'; reasons.push('mentions GID Garage'); }
  else if (geo === 'outside') { cls = 'nonlocal_low_value'; reasons.push(`names a place outside the service area: ${outsidePlaces[0]}`); }
  else if (lowValue) { cls = 'nonlocal_low_value'; reasons.push('DIY/spec lookup with no realistic path to a local job'); }
  else if ((geo === 'in_area' || geo === 'near_me') && (service || commercial) && !(informational && !commercial)) {
    cls = 'high_local_commercial'; reasons.push(geo === 'near_me' ? '"near me" + service/buying intent' : `in-area place (${inAreaPlaces[0].name}) + service/buying intent`);
  } else if (geo === 'in_area' || geo === 'near_me') { cls = 'local_informational'; reasons.push('local question without buying intent'); }
  else if (service && (commercial || service.id === 'general') && !informational) { cls = 'service_no_geo'; reasons.push('service + buying intent, no place named'); }
  else if (informational || service) { cls = 'global_informational'; reasons.push('general information, no place named'); }
  else { cls = 'unclassified'; }

  return {
    query,
    intentClass: cls,
    geo,
    inAreaPlace: inAreaPlaces[0]?.slug || null,
    outsidePlace: outsidePlaces[0] || null,
    service: service ? service.id : null,
    serviceOffered: service ? service.offered : null,
    branded,
    nonbrandedLocal: !branded && (cls === 'high_local_commercial' || cls === 'local_informational'),
    reasons,
  };
}

const US = new Set(['usa', 'us', 'united states', 'united states of america']);

// Search Console row -> locality. GSC gives country, never city/ZIP, so it
// can never be "confirmed_local".
export function gscLocality(row, classification) {
  const country = String(row.country || '').toLowerCase();
  if (country && !US.has(country)) return 'nonlocal';
  const c = classification || classifyQuery(row.query || '');
  if (c.geo === 'outside') return 'nonlocal';
  if (c.geo === 'in_area' || c.geo === 'near_me' || c.branded) return 'likely_local';
  return 'unknown';
}

// GA4 / Instagram city (IP- or profile-derived approximation) -> locality.
// Never "confirmed": mobile carriers often geolocate phones to Phoenix, so
// Phoenix is "unknown", not "nonlocal".
export function cityLocality({ city, region, country } = {}) {
  const ctry = String(country || '').toLowerCase();
  if (ctry && !US.has(ctry)) return 'nonlocal';
  const c = String(city || '').toLowerCase();
  if (!c || c === '(not set)') return 'unknown';
  if (c === 'phoenix') return 'unknown';
  const v = isInsideServiceArea(`${city}`);
  if (v.inside === true) return 'likely_local';
  if (v.inside === false) return 'nonlocal';
  const reg = String(region || '').toLowerCase();
  if (reg && reg !== 'arizona') return 'nonlocal';
  return 'unknown';
}

// First-party proof: a booking/lead service address, or an ad platform's
// physical-location report with coordinates.
export function firstPartyLocality(location) {
  const v = isInsideServiceArea(location);
  if (v.inside === true) return 'confirmed_local';
  if (v.inside === false) return 'nonlocal';
  return 'unknown';
}

export const LOCALITY_ORDER = ['confirmed_local', 'likely_local', 'unknown', 'nonlocal'];
