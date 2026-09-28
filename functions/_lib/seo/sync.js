// SEO sync orchestration: incremental + resumable historical backfill,
// per-provider cadence, honest status rows, then analysis.
// Tests: tests/seo-sync.test.js

import { PROVIDERS, addDays, ymd } from './providers.js';
import { ProviderError } from './google-auth.js';
import { createSeoOps } from './ops.js';

const RUNNABLE = new Set(['connected', 'ready_limited']);
const BACKFILL_CHUNK_DAYS = 30;
// How often snapshot-style providers refresh.
const CADENCE_DAYS = { pagespeed: 7, site_audit: 7, places: 7, competitor_pages: 7, apple_business_connect: 30, weather_forecast: 1, instagram: 1, bing: 1 };

export async function runSeoSync({ env, store, fetch: fetchImpl = fetch, now = new Date(), mode = 'incremental', only = null }) {
  const today = ymd(now);
  const settings = (await store.select('seo_settings', { id: 'eq.default', limit: '1' }).catch(() => []))[0] || {};
  const stored = new Map((await store.select('seo_provider_status', {}).catch(() => [])).map(r => [r.provider, r]));
  const results = [];

  for (const p of PROVIDERS.filter(x => !only || only.includes(x.id))) {
    const st = p.status(env);
    const prev = stored.get(p.id) || {};
    const record = async (status, extra = {}) => {
      await store.upsert('seo_provider_status', [{ provider: p.id, status, detail: extra.detail ?? st.note ?? null, cursor: extra.cursor ?? prev.cursor ?? null, last_sync_at: extra.synced ? now.toISOString() : prev.last_sync_at ?? null, last_error: extra.error ?? null, updated_at: now.toISOString() }], 'provider');
    };
    if (!RUNNABLE.has(st.status)) {
      await record(st.status, { detail: [st.note, st.missing?.length ? `missing: ${st.missing.join(', ')}` : ''].filter(Boolean).join(' — ') });
      results.push({ provider: p.id, status: st.status, skipped: true, missing: st.missing });
      continue;
    }

    // Decide the date range for this run.
    let range;
    const cursor = prev.cursor || {};
    if (p.snapshot) {
      const due = !prev.last_sync_at || (now - new Date(prev.last_sync_at)) / 86400000 >= (CADENCE_DAYS[p.id] ?? 1) - 0.01;
      if (!due && mode !== 'force') { results.push({ provider: p.id, status: st.status, skipped: true, reason: 'not due' }); continue; }
      range = { from: today, to: today };
    } else if (mode === 'backfill') {
      const limit = addDays(today, -p.maxHistoryDays);
      const earliest = cursor.backfilledFrom || addDays(today, -(p.lagDays || 1));
      if (earliest <= limit) { results.push({ provider: p.id, status: st.status, skipped: true, reason: 'backfill complete' }); continue; }
      const to = addDays(earliest, -1);
      const from = [addDays(to, -(BACKFILL_CHUNK_DAYS - 1)), limit].sort().pop();
      range = { from, to };
    } else {
      // Re-pull the provisional tail every run (recent data keeps changing).
      range = { from: addDays(today, -((p.lagDays || 1) + 4)), to: addDays(today, -1) };
    }

    const started = new Date().toISOString();
    try {
      const r = await p.sync({ env, fetch: fetchImpl, store, now, settings }, range);
      const nextCursor = { ...cursor, ...(mode === 'backfill' && !p.snapshot ? { backfilledFrom: range.from } : {}), ...(!p.snapshot ? { latest: [cursor.latest, range.to].filter(Boolean).sort().pop() } : {}) };
      await record(st.status, { detail: r.detail, cursor: nextCursor, synced: true });
      await store.insert('seo_sync_runs', [{ provider: p.id, mode, range_from: range.from, range_to: range.to, status: 'ok', rows_written: r.rows, detail: r.detail, started_at: started, finished_at: new Date().toISOString() }]);
      results.push({ provider: p.id, status: st.status, rows: r.rows, range });
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : 'error';
      await record(status, { error: e.message });
      await store.insert('seo_sync_runs', [{ provider: p.id, mode, range_from: range.from, range_to: range.to, status: 'error', rows_written: 0, detail: e.message, started_at: started, finished_at: new Date().toISOString() }]).catch(() => {});
      results.push({ provider: p.id, status, error: e.message });
    }
  }

  // Analysis runs even when few providers are connected (first-party data still counts).
  const analysis = await createSeoOps({ store, env, now }).analyze().catch(e => ({ error: e.message }));
  return { mode, results, analysis };
}
