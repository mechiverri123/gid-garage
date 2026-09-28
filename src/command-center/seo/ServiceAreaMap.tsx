// Service Area view: a real dark basemap (MapLibre GL + OpenFreeMap's "dark"
// OpenStreetMap style — free, no API key) with the aggregated overlays on top.
// MapLibre is lazy-loaded only for this tab; if it can't load, the simple
// diagram is shown instead so SEO Mode keeps working.
// Overlays come from mapFeatures.ts: counts and public names only.
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { Crosshair, Minus, Plus } from 'lucide-react';
import type { SeoGeography } from './seoTypes';
import { MAP_COLORS, mapFeatures, mapStats, radiusBounds, radiusRing } from './mapFeatures';
import { SEO, ServiceAreaDiagram, Empty } from './SeoPanels';

// Optional override (Cloudflare Pages build variable): any MapLibre style URL.
const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark';

type MapLibreModule = typeof import('maplibre-gl');

const LOAD_TIMEOUT_MS = 20000;
const hasWebGL = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

function markerElement(kind: 'jobs' | 'leads' | 'competitor', size: number, count: number, primary = true) {
  const el = document.createElement('div');
  if (kind === 'competitor') {
    // MapLibre positions the marker element with a transform, so the diamond's rotation goes on a child.
    el.style.cssText = 'width:14px;height:14px;display:flex;align-items:center;justify-content:center;cursor:pointer';
    const diamond = document.createElement('div');
    diamond.style.cssText = `width:10px;height:10px;transform:rotate(45deg);background:${MAP_COLORS.competitor};opacity:${primary ? 1 : 0.6};border:1px solid rgba(0,0,0,0.6)`;
    el.appendChild(diamond);
    return el;
  }
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 11px/1 ui-sans-serif,system-ui;cursor:pointer;`
    + (kind === 'jobs'
      ? `background:rgba(61,255,160,0.3);border:2px solid ${MAP_COLORS.jobs};color:#EFFFF6;box-shadow:0 0 14px rgba(61,255,160,0.45)`
      : `border:2px solid ${MAP_COLORS.leads};background:rgba(127,184,255,0.07)`);
  if (kind === 'jobs') el.textContent = String(count);
  return el;
}

export function ServiceAreaMap({ geo }: { geo?: SeoGeography }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const lib = useRef<MapLibreModule | null>(null);
  const markers = useRef<Marker[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [basemapFailed, setBasemapFailed] = useState(false);

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const fail = (why: unknown) => {
      if (cancelled || loaded) return;
      console.warn('Service area map could not load; showing the diagram instead.', why);
      setStatus('failed');
    };
    const timer = window.setTimeout(() => fail(`no map load after ${LOAD_TIMEOUT_MS / 1000}s`), LOAD_TIMEOUT_MS);
    (async () => {
      try {
        if (!hasWebGL()) { fail('WebGL is not available in this browser'); return; }
        const [ml] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !el.current) return;
        lib.current = ml;
        const m = new ml.Map({ container: el.current, style: STYLE_URL, center: [-111.6513, 35.1983], zoom: 8, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
        m.touchZoomRotate.disableRotation();
        // The basemap style names a few POI icons its sprite lacks; a blank stand-in keeps the console clean.
        m.on('styleimagemissing', e => { if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
        // Before the first load an error means no map at all; after it, only some tiles are missing.
        m.on('error', e => { if (loaded) setBasemapFailed(true); else fail(e?.error || e); });
        m.on('load', () => { loaded = true; window.clearTimeout(timer); if (!cancelled) setStatus('ready'); });
        map.current = m;
      } catch (e) {
        fail(e);
      }
    })();
    return () => { cancelled = true; window.clearTimeout(timer); markers.current.forEach(mk => mk.remove()); map.current?.remove(); map.current = null; };
  }, []);

  // Draw the overlays whenever the data arrives or changes.
  useEffect(() => {
    const ml = lib.current; const m = map.current;
    if (status !== 'ready' || !ml || !m || !geo) return;
    m.fitBounds(radiusBounds(geo.center, geo.radiusMiles), { padding: 28, duration: 0 });

    const ring = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [radiusRing(geo.center, geo.radiusMiles)] } };
    const src = m.getSource('service-area') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(ring);
    else {
      m.addSource('service-area', { type: 'geojson', data: ring });
      m.addLayer({ id: 'service-area-fill', type: 'fill', source: 'service-area', paint: { 'fill-color': MAP_COLORS.jobs, 'fill-opacity': 0.04 } });
      m.addLayer({ id: 'service-area-line', type: 'line', source: 'service-area', paint: { 'line-color': MAP_COLORS.jobs, 'line-opacity': 0.75, 'line-width': 1.5, 'line-dasharray': [3, 3] } });
    }

    markers.current.forEach(mk => mk.remove());
    markers.current = [];
    for (const f of mapFeatures(geo)) {
      const size = f.kind === 'competitor' ? 12 : f.size;
      const node = markerElement(f.kind, size, f.kind === 'competitor' ? 0 : f.count, f.kind === 'competitor' ? f.primary : true);
      node.setAttribute('aria-label', f.tooltip);
      node.style.zIndex = f.kind === 'competitor' ? '3' : f.kind === 'jobs' ? '2' : '1';
      const popup = new ml.Popup({ closeButton: false, closeOnClick: true, offset: size / 2 + 4, className: 'gid-map-tip' }).setText(f.tooltip);
      node.addEventListener('mouseenter', () => popup.setLngLat([f.lng, f.lat]).addTo(m));
      node.addEventListener('mouseleave', () => popup.remove());
      node.addEventListener('click', e => { e.stopPropagation(); if (popup.isOpen()) popup.remove(); else popup.setLngLat([f.lng, f.lat]).addTo(m); }); // tap on phones
      markers.current.push(new ml.Marker({ element: node }).setLngLat([f.lng, f.lat]).addTo(m));
    }
  }, [status, geo]);

  const recenter = () => { if (map.current && geo) map.current.fitBounds(radiusBounds(geo.center, geo.radiusMiles), { padding: 28 }); };

  if (!geo) return <Empty>Loading service area…</Empty>;
  if (status === 'failed') {
    return (
      <div>
        <div className="text-[11px] mb-3" style={{ color: SEO.warn }}>The interactive map couldn't load — showing the simple diagram instead.</div>
        <ServiceAreaDiagram geo={geo} />
      </div>
    );
  }

  const btn = 'w-8 h-8 flex items-center justify-center rounded-md border backdrop-blur bg-[rgba(6,24,16,0.85)] border-[rgba(61,255,160,0.3)] hover:bg-[rgba(61,255,160,0.12)]';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(240px,3fr)]">
      <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: SEO.border }}>
        <div ref={el} className="gid-map h-[360px] sm:h-[460px] lg:h-[560px] w-full" style={{ background: '#0b0f0d' }} role="region" aria-label="Service area map" />
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button type="button" className={btn} onClick={() => map.current?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus size={15} color={SEO.accent} /></button>
          <button type="button" className={btn} onClick={() => map.current?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus size={15} color={SEO.accent} /></button>
          <button type="button" className={btn} onClick={recenter} aria-label="Recenter on service area" title="Recenter on service area"><Crosshair size={15} color={SEO.accent} /></button>
        </div>
        {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: SEO.muted }}>Loading map…</div>}
        {basemapFailed && <div className="absolute bottom-3 left-3 z-10 text-[11px] px-2 py-1 rounded" style={{ color: SEO.warn, background: 'rgba(0,0,0,0.6)' }}>Some basemap tiles didn't load — overlays still shown.</div>}
      </div>
      <aside className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: SEO.muted }}>{geo.radiusMiles}-mile service area</div>
        <ul className="space-y-2.5">
          {mapStats(geo).map(s => (
            <li key={s.key} className="flex items-baseline gap-2.5 text-[12.5px]">
              <span className="w-4 text-center shrink-0" style={{ color: s.color ?? SEO.faint }} aria-hidden>{s.symbol ?? '·'}</span>
              <span className="tabular-nums font-semibold" style={{ color: SEO.text }}>{s.value}</span>
              <span style={{ color: SEO.muted }}>{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10.5px] leading-relaxed pt-2 border-t" style={{ color: SEO.faint, borderColor: SEO.border }}>
          {geo.privacy} Numbers on green markers are booked jobs per community; blue rings are leads. Competitor diamonds use public Google Places locations.
        </p>
      </aside>
    </div>
  );
}
