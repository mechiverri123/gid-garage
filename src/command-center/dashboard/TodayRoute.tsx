// Today's route on a real dark map (shared MapLibre loader). Stops are placed
// at the community their address names — there's no street-level geocoder —
// and the line shows stop order, not a driving route. Real turn-by-turn
// directions and drive times open in Google Maps with the actual addresses.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Marker } from 'maplibre-gl';
import { Route, Navigation, Plus, Minus, Crosshair, MapPin, List, Map as MapIcon, CalendarCheck } from 'lucide-react';
import type { CommandCenterSummary, RouteStop } from '../types';
import { C, clock, shortDay } from '../ui/theme';
import { CommandCard, SectionHeader, ActionButton, Segmented, EmptyState, StatusBadge, VehicleBadge } from '../ui/primitives';
import { useMapLibre } from '../ui/useMapLibre';
import { radiusBounds } from '../seo/mapFeatures';

const MILES = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180; const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

// Several stops in one community would sit on the same point: fan them out a little.
function spread(stops: RouteStop[]) {
  const seen = new Map<string, number>();
  return stops.map(s => {
    if (s.lat == null || s.lng == null) return { ...s, plat: null, plng: null };
    const k = `${s.lat},${s.lng}`; const i = seen.get(k) ?? 0; seen.set(k, i + 1);
    const a = i * 2.4; const d = i ? 0.012 : 0;
    return { ...s, plat: s.lat + d * Math.sin(a), plng: s.lng + d * Math.cos(a) };
  });
}

export function googleMapsRouteUrl(stops: RouteStop[]) {
  const addrs = stops.map(s => s.address).filter((a): a is string => !!a);
  if (!addrs.length) return null;
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('destination', addrs[addrs.length - 1]);
  if (addrs.length > 1) u.searchParams.set('waypoints', addrs.slice(0, -1).join('|'));
  u.searchParams.set('travelmode', 'driving');
  return u.toString();
}

function stopMarker(n: number) {
  const el = document.createElement('div');
  el.style.cssText = `width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 13px/1 ui-sans-serif,system-ui;color:#030A11;background:${C.cyan};border:2px solid #E8FBFF;box-shadow:0 0 16px rgba(52,214,255,0.7);cursor:pointer`;
  el.textContent = String(n);
  return el;
}
function startMarker() {
  const el = document.createElement('div');
  el.style.cssText = `width:18px;height:18px;border-radius:5px;background:#030A11;border:2px solid ${C.green};box-shadow:0 0 12px rgba(32,229,139,0.6);transform:rotate(45deg)`;
  return el;
}

function RouteMap({ start, stops }: { start: { name: string; lat: number; lng: number }; stops: ReturnType<typeof spread> }) {
  const el = useRef<HTMLDivElement>(null);
  const { map, lib, status, basemapFailed } = useMapLibre(el, { label: "Today's route map" });
  const markers = useRef<Marker[]>([]);
  const placed = stops.filter(s => s.plat != null && s.plng != null) as (ReturnType<typeof spread>[number] & { plat: number; plng: number })[];

  const fit = (animate = true) => {
    const m = map.current; if (!m) return;
    if (!placed.length) { m.fitBounds(radiusBounds(start, 30), { padding: 24, duration: animate ? 500 : 0 }); return; }
    const pts = [start, ...placed.map(s => ({ lat: s.plat, lng: s.plng }))];
    const lngs = pts.map(p => p.lng); const lats = pts.map(p => p.lat);
    m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70, maxZoom: 12, duration: animate ? 500 : 0 });
  };

  useEffect(() => {
    const ml = lib.current; const m = map.current;
    if (status !== 'ready' || !ml || !m) return;
    const line = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[start.lng, start.lat], ...placed.map(s => [s.plng, s.plat])] } };
    const src = m.getSource('route') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(line);
    else {
      m.addSource('route', { type: 'geojson', data: line });
      m.addLayer({ id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': C.cyan, 'line-opacity': 0.25, 'line-width': 8, 'line-blur': 4 } });
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': C.cyan, 'line-width': 2.5, 'line-dasharray': [2, 2] } });
    }
    markers.current.forEach(mk => mk.remove());
    markers.current = [new ml.Marker({ element: startMarker() }).setLngLat([start.lng, start.lat]).setPopup(new ml.Popup({ closeButton: false, offset: 12, className: 'gid-map-tip' }).setText(start.name)).addTo(m)];
    placed.forEach((s, i) => {
      const tip = `${i + 1}. ${clock(s.time)} · ${s.customer || 'Customer'}${s.place ? ` · ${s.place} (approx.)` : ''}`;
      markers.current.push(new ml.Marker({ element: stopMarker(stops.indexOf(s) + 1) }).setLngLat([s.plng, s.plat]).setPopup(new ml.Popup({ closeButton: false, offset: 18, className: 'gid-map-tip' }).setText(tip)).addTo(m));
    });
    fit(false);
    return () => { markers.current.forEach(mk => mk.remove()); markers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stops]);

  if (status === 'failed') return <div className="h-[300px] flex items-center justify-center rounded-xl text-[14px]" style={{ border: `1px dashed ${C.borderStrong}`, color: C.text2 }}>The map couldn't load in this browser — use List view.</div>;
  const btn = 'cc-btn w-9 h-9 flex items-center justify-center rounded-lg';
  const btnStyle = { background: 'rgba(5,13,21,0.88)', border: `1px solid ${C.borderStrong}` };
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div ref={el} className="gid-map h-[340px] sm:h-[400px] xl:h-[430px] w-full" style={{ background: '#0b0f0d' }} role="region" aria-label="Today's route map" />
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button type="button" className={btn} style={btnStyle} onClick={() => map.current?.zoomIn()} aria-label="Zoom in"><Plus size={16} color={C.cyan} /></button>
        <button type="button" className={btn} style={btnStyle} onClick={() => map.current?.zoomOut()} aria-label="Zoom out"><Minus size={16} color={C.cyan} /></button>
        <button type="button" className={btn} style={btnStyle} onClick={() => fit()} aria-label="Fit the route"><Crosshair size={16} color={C.cyan} /></button>
      </div>
      {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-[14px]" style={{ color: C.text2 }}>Loading map…</div>}
      {basemapFailed && <div className="absolute bottom-3 left-3 z-10 text-[12px] px-2 py-1 rounded" style={{ color: C.amber, background: 'rgba(0,0,0,0.6)' }}>Some map tiles didn't load.</div>}
    </div>
  );
}

export function TodayRoute({ summary, onSelectJob }: { summary: CommandCenterSummary; onSelectJob: (id: string) => void }) {
  const route = summary.todayRoute;
  const stops = useMemo(() => spread(route?.stops ?? []), [route]);
  const [view, setView] = useState<'map' | 'list'>('map');
  const start = route?.start ?? { name: 'Flagstaff, AZ (start)', lat: 35.1983, lng: -111.6513 };
  const located = stops.filter(s => s.lat != null) as (RouteStop & { lat: number; lng: number })[];
  const straightMiles = located.length ? located.reduce((sum, s, i) => sum + MILES(i ? located[i - 1] : start, s), 0) : 0;
  const gmaps = googleMapsRouteUrl(route?.stops ?? []);
  const next = summary.upcomingJobs.find(j => j.date > summary.today.date);

  return (
    <CommandCard id="cc-route" variant="primary" className="p-5 h-full">
      <SectionHeader icon={Route} title="Today's route"
        subtitle={stops.length ? `${stops.length} stop${stops.length === 1 ? '' : 's'}${located.length ? ` · ~${Math.round(straightMiles)} mi straight-line` : ''}` : 'No stops scheduled today'}
        right={<>
          <Segmented label="Route view" value={view} onChange={setView} options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List' }]} />
        </>} />
      {view === 'map'
        ? <RouteMap start={start} stops={stops} />
        : stops.length === 0
          ? <EmptyState icon={CalendarCheck} title="No stops today">{next ? <>Next job: {next.customer || 'customer'}, {shortDay(next.date)} at {clock(next.time)}.</> : 'Nothing booked in the next 7 days.'}</EmptyState>
          : (
            <ol className="flex flex-col gap-2">
              {stops.map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSelectJob(s.id)} className="cc-btn cc-card--interactive w-full flex items-center gap-3 rounded-lg p-3 text-left" style={{ background: 'rgba(52,214,255,0.035)', border: `1px solid ${C.border}` }}>
                    <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold" style={{ background: C.cyan, color: C.bg }}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold truncate" style={{ color: C.text }}>{clock(s.time)} · {s.customer || 'Customer'}</span><StatusBadge status={s.status} /></span>
                      <span className="flex items-center gap-3 mt-0.5 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[13px] min-w-0" style={{ color: C.text2 }}><MapPin size={13} className="shrink-0" /><span className="truncate">{s.address || 'No address on file'}</span></span>
                      </span>
                      <span className="block mt-0.5"><VehicleBadge vehicle={s.vehicle} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <span className="text-[12.5px] leading-snug" style={{ color: C.muted }}>
          {stops.length ? 'Pins are approximate (by community). The line is stop order, not the driving route.' : 'Your service area around Flagstaff.'}
        </span>
        <div className="flex gap-2">
          {view === 'map' ? <ActionButton size="sm" icon={List} onClick={() => setView('list')}>List view</ActionButton> : <ActionButton size="sm" icon={MapIcon} onClick={() => setView('map')}>Map view</ActionButton>}
          {gmaps
            ? <ActionButton size="sm" variant="primary" icon={Navigation} href={gmaps} title="Real driving directions and drive times in Google Maps — reorder stops there to optimize">Open route in Google Maps</ActionButton>
            : <ActionButton size="sm" variant="primary" icon={Navigation} disabled title="No addresses on today's jobs">Open route in Google Maps</ActionButton>}
        </div>
      </div>
    </CommandCard>
  );
}
