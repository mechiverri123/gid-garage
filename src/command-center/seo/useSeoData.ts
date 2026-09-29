import { useCallback, useEffect, useState } from 'react';
import type { SeoView } from './seoTypes';

// Which /jarvis/seo-data read backs each SEO view.
const ACTION_FOR: Record<SeoView, string> = {
  overview: 'overview', map: 'geography', opportunities: 'opportunities', demand: 'demand',
  competitors: 'competitors', seasonality: 'seasonality', authority: 'authority', connections: 'connections',
  actions: 'actions', top5: 'top5', blueprint: 'blueprint', rankings: 'ranks', research: 'knowledge', history: 'history',
};

type SyncCall = { ok: boolean; error?: string; more?: boolean; runStatus?: string; results?: { provider: string; rows?: number; partial?: boolean; skipped?: boolean; reason?: string }[]; summary?: { errors?: string[] }; runs?: number; historyIncomplete?: boolean };

export function useSeoData(view: SeoView, days: number) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async (v: SeoView | 'queries' | 'technical') => {
    const action = v === 'queries' || v === 'technical' ? v : ACTION_FOR[v];
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

  // Always: overview + opportunities rail + source health for the header, plus
  // query movement and technical health for the overview page. Then the current view.
  useEffect(() => { void load('overview'); void load('opportunities'); void load('connections'); void load('queries'); void load('technical'); void load('actions'); }, [load, version]);
  useEffect(() => { if (!['overview', 'opportunities', 'connections', 'actions'].includes(view)) void load(view); }, [view, load, version]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/jarvis/seo-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok || out?.error) throw new Error(out?.error || `HTTP ${res.status}`);
    setVersion(v => v + 1);
    return out;
  }, []);

  const syncNow = useCallback(async (mode: 'incremental' | 'backfill' | 'force' = 'incremental') => {
    // Server-side, Access-authenticated sync (the cron secret never reaches the browser).
    // Each call is budget-bounded on the server; keep calling while it reports more work.
    const pulled = new Set<string>();
    const skipReason = new Map<string, string>();
    const errors: string[] = [];
    let out: SyncCall = { ok: false };
    // A backfill is a chain of runs (each pulls the next 30 days of history):
    // keep starting runs while the last one still pulled something.
    const maxRuns = mode === 'backfill' ? 20 : 1;
    let runs = 0;
    for (; runs < maxRuns; runs += 1) {
      let pulledThisRun = 0;
      for (let i = 0; i < 15; i += 1) {
        const res = await fetch('/jarvis/seo-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_now', mode: mode === 'force' ? 'incremental' : mode }) });
        out = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
        if (!out.ok) break;
        for (const r of out.results || []) if (r.rows != null && !r.partial) { pulled.add(r.provider); pulledThisRun += 1; }
        for (const r of out.results || []) if (r.skipped && r.reason) skipReason.set(r.provider, r.reason);
        errors.push(...(out.summary?.errors || []));
        if (!out.more) break;
      }
      if (!out.ok || !pulledThisRun) break;
    }
    setVersion(v => v + 1);
    const skipped: Record<string, number> = {};
    for (const [provider, why] of skipReason) if (!pulled.has(provider)) skipped[why] = (skipped[why] || 0) + 1;
    return { ...out, pulled: [...pulled], skipped, errors, runs: runs + (runs < maxRuns ? 1 : 0), historyIncomplete: mode === 'backfill' && runs >= maxRuns };
  }, []);

  return { get: <T,>(v: SeoView) => data[ACTION_FOR[v]] as T | undefined, getAction: <T,>(a: 'queries' | 'technical') => data[a] as T | undefined, loading, error, post, syncNow, reload: () => setVersion(v => v + 1) };
}
