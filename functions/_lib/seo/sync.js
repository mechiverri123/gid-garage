// SEO sync orchestration: incremental + resumable historical backfill,
// per-provider cadence, honest status rows, then analysis.
// Tests: tests/seo-sync.test.js

import { PROVIDERS, addDays, ymd } from './providers.js';
import { ProviderError } from './google-auth.js';
import { createSeoOps } from './ops.js';
import { boundFetch } from './http.js';

const RUNNABLE = new Set(['connected', 'ready_limited']);
const BACKFILL_CHUNK_DAYS = 30;
// How often snapshot-style providers refresh.
const CADENCE_DAYS = { pagespeed: 7, site_audit: 7, places: 7, competitor_pages: 7, apple_business_connect: 30, weather_forecast: 1, instagram: 1, bing: 1 };

// Run state lives in one seo_provider_status row (no schema change):
//   running   -> nobody may start another sync (cron or manual); >10 min = abandoned
//   completed -> manual "Sync now" waits 5 minutes (cron is not throttled)
//   partial / failed -> an immediate manual retry is allowed
export const SYNC_RUN_KEY = '__sync_run__';
const RUN_STALE_MS = 10 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;

export function syncGate(runRow, now, { manual = false } = {}) {
  const age = runRow?.updated_at ? now - new Date(runRow.updated_at) : Infinity;
  if (runRow?.status === 'running' && age < RUN_STALE_MS) return { ok: false, status: 409, error: 'A sync is already running — wait for it to finish.' };
  if (manual && runRow?.status === 'completed' && age < MANUAL_COOLDOWN_MS) return { ok: false, status: 429, error: 'A sync completed in the last 5 minutes — try again shortly.' };
  return { ok: true };
}

export async function runSeoSync({ env, store, fetch: injectedFetch = null, now = new Date(), mode = 'incremental', only = null, manual = false }) {
  const runRow = (await store.select('seo_provider_status', { provider: `eq.${SYNC_RUN_KEY}`, limit: '1' }).catch(() => []))[0];
  const gate = syncGate(runRow, now, { manual });
  if (!gate.ok) return { blocked: true, status: gate.status, error: gate.error, mode, results: [], runStatus: runRow?.status || null };
  const setRun = (status, detail, error = null) => store.upsert('seo_provider_status', [{ provider: SYNC_RUN_KEY, status, detail, last_error: error, last_sync_at: status === 'running' ? null : now.toISOString(), updated_at: now.toISOString() }], 'provider');
  await setRun('running', `${mode}${manual ? ' (manual)' : ' (cron)'}`);
  try {
    const out = await runProviders({ env, store, injectedFetch, now, mode, only });
    const errored = out.results.filter(r => r.error);
    const pulled = out.results.filter(r => r.rows != null);
    const runStatus = errored.length || out.analysis?.error ? (pulled.length ? 'partial' : 'failed') : 'completed';
    await setRun(runStatus, `${pulled.length} pulled, ${errored.length} failed`, errored.map(r => `${r.provider}: ${r.error}`).join('; ') || out.analysis?.error || null);
    return { ...out, runStatus };
  } catch (e) {
    await setRun('failed', 'sync crashed', e.message).catch(() => {});
    throw e;
  }
}

async function runProviders({ env, store, injectedFetch, now, mode, only }) {
  // Providers call ctx.fetch(...) as a method; a bound wrapper keeps native fetch's
  // receiver correct in Cloudflare Workers (see http.js).
  const fetchImpl = boundFetch(injectedFetch);
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
