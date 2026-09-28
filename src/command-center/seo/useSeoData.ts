import { useCallback, useEffect, useState } from 'react';
import type { SeoView } from './seoTypes';

// Which /jarvis/seo-data read backs each SEO view.
const ACTION_FOR: Record<SeoView, string> = {
  overview: 'overview', map: 'geography', opportunities: 'opportunities', demand: 'demand',
  competitors: 'competitors', seasonality: 'seasonality', authority: 'authority', connections: 'connections',
};

export function useSeoData(view: SeoView, days: number) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async (v: SeoView) => {
    const action = ACTION_FOR[v];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/jarvis/seo-data?action=${action}&days=${days}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(prev => ({ ...prev, [action]: body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Overview + the current view; the opportunities rail is always visible.
  useEffect(() => { void load('overview'); void load('opportunities'); }, [load, version]);
  useEffect(() => { if (view !== 'overview' && view !== 'opportunities') void load(view); }, [view, load, version]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/jarvis/seo-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok || out?.error) throw new Error(out?.error || `HTTP ${res.status}`);
    setVersion(v => v + 1);
    return out;
  }, []);

  const syncNow = useCallback(async (mode: 'incremental' | 'backfill' | 'force' = 'incremental') => {
    // Server-side, Access-authenticated sync (the cron secret never reaches the browser).
    const res = await fetch('/jarvis/seo-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_now', mode: mode === 'force' ? 'incremental' : mode }) });
    const out = await res.json();
    setVersion(v => v + 1);
    return out;
  }, []);

  return { get: <T,>(v: SeoView) => data[ACTION_FOR[v]] as T | undefined, loading, error, post, syncNow, reload: () => setVersion(v => v + 1) };
}
