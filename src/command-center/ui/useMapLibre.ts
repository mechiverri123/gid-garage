// Shared real-map loader (MapLibre GL + OpenFreeMap "dark" OpenStreetMap
// style, no API key). Lazy-loads MapLibre only when a map is on screen and
// reports 'failed' — never hangs — so callers can show a fallback.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

// Optional override (Cloudflare Pages build variable): any MapLibre style URL.
export const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark';
export type MapLibreModule = typeof import('maplibre-gl');

const LOAD_TIMEOUT_MS = 20000;
const hasWebGL = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

export function useMapLibre(el: RefObject<HTMLDivElement>, { center = [-111.6513, 35.1983] as [number, number], zoom = 8, label = 'Map' } = {}) {
  const map = useRef<MapLibreMap | null>(null);
  const lib = useRef<MapLibreModule | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [basemapFailed, setBasemapFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const fail = (why: unknown) => {
      if (cancelled || loaded) return;
      console.warn(`${label} could not load; showing the fallback instead.`, why);
      setStatus('failed');
    };
    const timer = window.setTimeout(() => fail(`no map load after ${LOAD_TIMEOUT_MS / 1000}s`), LOAD_TIMEOUT_MS);
    (async () => {
      try {
        if (!hasWebGL()) { fail('WebGL is not available in this browser'); return; }
        const [ml] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !el.current) return;
        lib.current = ml;
        const m = new ml.Map({ container: el.current, style: STYLE_URL, center, zoom, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
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
    return () => { cancelled = true; window.clearTimeout(timer); map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { map, lib, status, basemapFailed };
}
