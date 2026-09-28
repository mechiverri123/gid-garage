// Map overlays for the Service Area view, built only from the aggregated
// geography (community centroids + counts, public competitor locations).
// Nothing here can carry a customer address — tooltips are counts and names.
// Tests: tests/seo-map-features.test.js
import type { SeoGeography } from './seoTypes';

export const MAP_COLORS = { jobs: '#3DFFA0', leads: '#7FB8FF', competitor: '#FFB454' } as const;

export type MapFeature =
  | { kind: 'jobs'; key: string; lat: number; lng: number; count: number; size: number; tooltip: string }
  | { kind: 'leads'; key: string; lat: number; lng: number; count: number; size: number; tooltip: string }
  | { kind: 'competitor'; key: string; lat: number; lng: number; primary: boolean; tooltip: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mapFeatures(geo: SeoGeography): MapFeature[] {
  const leadAreas = geo.leads?.areas ?? [];
  const max = Math.max(1, ...geo.areas.map(a => a.count), ...leadAreas.map(a => a.count));
  // Marker diameter in px: 22–46 by count, so overlapping groups stay readable.
  const size = (n: number) => Math.round(22 + 24 * Math.sqrt(n / max));
  const jobCount = new Map(geo.areas.map(a => [a.slug, a.count]));
  return [
    // Leads first so the rings sit under the job markers — and always wider than
    // that community's job marker, so a ring is never hidden behind it.
    ...leadAreas.map(a => ({ kind: 'leads' as const, key: `lead-${a.slug}`, lat: a.lat, lng: a.lng, count: a.count, size: Math.max(size(a.count), size(jobCount.get(a.slug) ?? 0)) + 12, tooltip: `${a.name} · ${plural(a.count, 'lead')}` })),
    ...geo.areas.map(a => ({ kind: 'jobs' as const, key: `job-${a.slug}`, lat: a.lat, lng: a.lng, count: a.count, size: size(a.count), tooltip: `${a.name} · ${plural(a.count, 'booked job')}` })),
    ...(geo.competitors ?? []).map((c, i) => ({ kind: 'competitor' as const, key: `comp-${i}`, lat: c.lat, lng: c.lng, primary: c.tier === 'primary', tooltip: `${c.name}${c.tier === 'primary' ? ' (mobile)' : ''} · public Google Places location` })),
  ];
}

export interface MapStat { key: string; label: string; value: number; color?: string; symbol?: string }

export function mapStats(geo: SeoGeography): MapStat[] {
  const leads = geo.leads;
  return [
    { key: 'jobs', label: 'Booked jobs, last 12 months', value: geo.total, color: MAP_COLORS.jobs, symbol: '●' },
    ...(leads ? [{ key: 'leads', label: 'Leads, last 12 months', value: leads.total, color: MAP_COLORS.leads, symbol: '○' }] : []),
    { key: 'competitors', label: 'Local competitors on the map', value: geo.competitors?.length ?? 0, color: MAP_COLORS.competitor, symbol: '◆' },
    { key: 'grouped', label: 'Jobs in smaller in-area communities (grouped)', value: geo.otherInArea },
    { key: 'outside', label: 'Outside the service area (jobs + leads)', value: geo.outsideServiceArea + (leads?.outsideServiceArea ?? 0) },
    { key: 'unknown', label: 'Records without a usable location', value: geo.unknownLocation + (leads?.unknownLocation ?? 0) },
  ];
}

// Service radius as a polygon ring ([lng, lat] pairs, closed) and its bounding
// box [[west, south], [east, north]], on a spherical earth — accurate to well
// under a percent at 30 miles.
const EARTH_MILES = 3958.8;
export function radiusRing(center: { lat: number; lng: number }, radiusMiles: number, steps = 96): [number, number][] {
  const lat1 = (center.lat * Math.PI) / 180; const lng1 = (center.lng * Math.PI) / 180; const d = radiusMiles / EARTH_MILES;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const brg = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lng2 = lng1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return ring;
}
export function radiusBounds(center: { lat: number; lng: number }, radiusMiles: number): [[number, number], [number, number]] {
  const ring = radiusRing(center, radiusMiles);
  const lngs = ring.map(p => p[0]); const lats = ring.map(p => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
