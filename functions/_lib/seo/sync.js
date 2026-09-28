// SEO sync orchestration: incremental + resumable historical backfill,
// per-provider cadence, honest status rows, then analysis.
//
// Every invocation is BOUNDED (Cloudflare Workers fails a request after 50
// subrequests, Supabase calls included): at most 20 external fetches and 40
// subrequests in total, plus a 5-call reserve for final bookkeeping — so one
// invocation can never make more than 45. A full sync is a *run* of several
// invocations: each call does what fits, returns `more: true`, and the next
// call (Sync now loops; cron runs every 15 min) resumes. Analysis gets its own
// call. Run progress lives in the `__sync_run__` status row's cursor.
// Tests: tests/seo-sync.test.js, tests/seo-sync-budget.test.js

import { PROVIDERS, addDays, ymd } from './providers.js';
import { ProviderError } from './google-auth.js';
import { createSeoOps } from './ops.js';
import { boundFetch, subrequestBudget, SubrequestBudgetExceeded } from './http.js';

const RUNNABLE = new Set(['connected', 'ready_limited']);
const BACKFILL_CHUNK_DAYS = 30;
// How often snapshot-style providers refresh on the cron.
const CADENCE_DAYS = { pagespeed: 7, site_audit: 7, places: 7, competitor_pages: 7, apple_business_connect: 30, weather_forecast: 1, instagram: 1, bing: 1 };
// Manual "Sync now" may re-pull a snapshot provider once it's an hour old.
const MANUAL_PROVIDER_COOLDOWN_MS = 60 * 60 * 1000;
// Worst-case external fetches for one provider run (token calls included).
const EXTERNAL_COST = { search_console: 4, business_profile: 3, ga4: 3, places: 4, bing: 1, instagram: 3, google_ads: 3, meta_ads: 1, weather_forecast: 2, weather_history: 1, apple_business_connect: 0 };
// Batched providers: external fetches per item (page / competitor).
const BATCH_COST = { pagespeed: 2, site_audit: 1, competitor_pages: 1 };
// Supabase calls per provider run: status row + run log + its own writes.
const DB_COST = { places: 5, search_console: 5 };
const dbCost = id => DB_COST[id] ?? 4;

// Run state lives in one seo_provider_status row (no schema change):
//   running   -> nobody may start another call (cron or manual); >10 min = abandoned
//   pending   -> a run is part-way through; the next call continues it
//   completed -> manual "Sync now" waits 5 minutes (cron and backfill are not
//                throttled: a backfill is a chain of runs, each pulling the next 30 days)
//   partial / failed -> an immediate manual retry is allowed
export const SYNC_RUN_KEY = '__sync_run__';
const RUN_STALE_MS = 10 * 60 * 1000;
const PENDING_STALE_MS = 60 * 60 * 1000; // an unfinished run older than this starts over
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;
const CRON_RUN_SPACING_MS = 20 * 60 * 60 * 1000; // cron starts a new incremental run at most ~daily

export function syncGate(runRow, now, { manual = false, mode = 'incremental' } = {}) {
  const age = runRow?.updated_at ? now - new Date(runRow.updated_at) : Infinity;
  if (runRow?.status === 'running' && age < RUN_STALE_MS) return { ok: false, status: 409, error: 'A sync is already running — wait for it to finish.' };
  if (manual && mode !== 'backfill' && runRow?.status === 'completed' && age < MANUAL_COOLDOWN_MS) return { ok: false, status: 429, error: 'A sync completed in the last 5 minutes — try again shortly.' };
  return { ok: true };
}

export async function runSeoSync({ env, store: baseStore, fetch: injectedFetch = null, now = new Date(), mode = 'incremental', only = null, manual = false, budget = subrequestBudget() }) {
  // Every Supabase call and external fetch in this invocation is metered.
  const store = baseStore.withFetch ? baseStore.withFetch(f => budget.wrap(f, false)) : baseStore;
  const fetchImpl = budget.wrap(boundFetch(injectedFetch), true);

  const runRow = (await store.select('seo_provider_status', { provider: `eq.${SYNC_RUN_KEY}`, limit: '1' }).catch(() => []))[0];
  const gate = syncGate(runRow, now, { manual, mode });
  if (!gate.ok) return { blocked: true, status: gate.status, error: gate.error, mode, results: [], runStatus: runRow?.status || null };

  const age = runRow?.updated_at ? now - new Date(runRow.updated_at) : Infinity;
  const prevRun = runRow?.cursor?.run;
  const continuing = runRow?.status === 'pending' && prevRun?.mode === mode && age < PENDING_STALE_MS;
  // The cron (every 15 min) only continues an unfinished run, or starts a new
  // incremental run once a day. Backfill/force and manual calls always proceed.
  if (!manual && !continuing && mode === 'incremental' && runRow?.status && runRow.status !== 'pending' && age < CRON_RUN_SPACING_MS) {
    return { mode, results: [], idle: true, more: false, runStatus: runRow.status, summary: { pulled: 0, skipped: {}, deferred: 0, errors: [] }, budget: { ...budget.used } };
  }
  const run = continuing ? prevRun : { mode, startedAt: now.toISOString(), done: [], pulled: 0, errors: [], phase: 'providers' };

  const setRun = (status, detail, error = null) => store.upsert('seo_provider_status', [{ provider: SYNC_RUN_KEY, status, detail, cursor: { run }, last_error: error, last_sync_at: status === 'running' ? null : now.toISOString(), updated_at: now.toISOString() }], 'provider');
  await setRun('running', `${mode}${manual ? ' (manual)' : ' (cron)'}`);
  try {
    const out = await runSlice({ env, store, fetchImpl, budget, now, mode, only, manual, run });
    budget.openReserve();
    const runStatus = out.more ? 'pending' : run.errors.length ? (run.pulled ? 'partial' : 'failed') : 'completed';
    await setRun(runStatus, `${run.pulled} pulled, ${run.errors.length} failed${out.more ? ' — continuing' : ''}`, run.errors.join('; ') || null);
    return { ...out, runStatus, budget: { ...budget.used } };
  } catch (e) {
    budget.openReserve();
    await setRun('failed', 'sync crashed', e.message).catch(() => {});
    throw e;
  }
}

async function runSlice({ env, store, fetchImpl, budget, now, mode, only, manual, run }) {
  const results = [];
  const summary = { pulled: 0, skipped: {}, deferred: 0, errors: [] };
  const skip = (r, reason) => { results.push({ ...r, skipped: true, reason }); summary.skipped[reason] = (summary.skipped[reason] || 0) + 1; };

  // Analysis is its own invocation: it reads a lot of Supabase rows.
  if (run.phase === 'analysis') {
    const analysis = await createSeoOps({ store, env, now }).analyze().catch(e => ({ error: e.message }));
    if (analysis.error) run.errors.push(`analysis: ${analysis.error}`);
    run.phase = 'done';
    return { mode, results, analysis, more: false, summary };
  }

  const today = ymd(now);
  const settings = (await store.select('seo_settings', { id: 'eq.default', limit: '1' }).catch(() => []))[0] || {};
  const stored = new Map((await store.select('seo_provider_status', {}).catch(() => [])).map(r => [r.provider, r]));
  const statusRows = []; // not-runnable providers, written in one call
  let more = false;
  let ranInSlice = 0;

  for (const p of PROVIDERS.filter(x => !only || only.includes(x.id))) {
    const st = p.status(env);
    const prev = stored.get(p.id) || {};
    const cursor = prev.cursor || {};
    const record = async (status, extra = {}) => {
      await store.upsert('seo_provider_status', [{ provider: p.id, status, detail: extra.detail ?? st.note ?? null, cursor: extra.cursor ?? prev.cursor ?? null, last_sync_at: extra.synced ? now.toISOString() : prev.last_sync_at ?? null, last_error: extra.error ?? null, updated_at: now.toISOString() }], 'provider');
    };
    if (!RUNNABLE.has(st.status)) {
      statusRows.push({ provider: p.id, status: st.status, detail: [st.note, st.missing?.length ? `missing: ${st.missing.join(', ')}` : ''].filter(Boolean).join(' — '), cursor: prev.cursor ?? null, last_sync_at: prev.last_sync_at ?? null, last_error: null, updated_at: now.toISOString() });
      skip({ provider: p.id, status: st.status, missing: st.missing }, 'not configured');
      continue;
    }
    if (run.done.includes(p.id)) continue; // already handled earlier in this run

    // Decide the date range for this run.
    let range;
    const inBatch = cursor.batchOffset != null;
    if (p.snapshot) {
      const age = prev.last_sync_at ? now - new Date(prev.last_sync_at) : Infinity;
      const cadenceMs = ((CADENCE_DAYS[p.id] ?? 1) - 0.01) * 86400000;
      const due = mode === 'force' || inBatch || age >= (manual ? Math.min(cadenceMs, MANUAL_PROVIDER_COOLDOWN_MS) : cadenceMs);
      if (!due) { run.done.push(p.id); skip({ provider: p.id, status: st.status }, manual ? 'pulled within the last hour' : 'not due'); continue; }
      range = { from: today, to: today };
    } else if (mode === 'backfill') {
      const limit = addDays(today, -p.maxHistoryDays);
      const earliest = cursor.backfilledFrom || addDays(today, -(p.lagDays || 1));
      if (earliest <= limit) { run.done.push(p.id); skip({ provider: p.id, status: st.status }, 'backfill complete'); continue; }
      const to = addDays(earliest, -1);
      const from = [addDays(to, -(BACKFILL_CHUNK_DAYS - 1)), limit].sort().pop();
      range = { from, to };
    } else {
      // Re-pull the provisional tail every run (recent data keeps changing).
      range = { from: addDays(today, -((p.lagDays || 1) + 4)), to: addDays(today, -1) };
    }

    // Fit the provider into what's left of this invocation's budget, or defer it.
    const left = budget.left();
    const roomForExternal = Math.min(left.external, left.total - dbCost(p.id));
    let batch;
    if (BATCH_COST[p.id]) {
      const limit = Math.floor(roomForExternal / BATCH_COST[p.id]);
      if (limit < 1) { more = true; summary.deferred += 1; results.push({ provider: p.id, status: st.status, deferred: true }); continue; }
      batch = { offset: cursor.batchOffset ?? 0, limit };
    } else if (roomForExternal < (EXTERNAL_COST[p.id] ?? 3)) {
      more = true; summary.deferred += 1; results.push({ provider: p.id, status: st.status, deferred: true }); continue;
    }

    const started = new Date().toISOString();
    ranInSlice += 1;
    try {
      const r = await p.sync({ env, fetch: fetchImpl, store, now, settings, batch }, range);
      const unfinished = r.next != null;
      const { batchOffset: _drop, ...rest } = cursor;
      const nextCursor = unfinished ? { ...cursor, batchOffset: r.next } : { ...rest, ...(mode === 'backfill' && !p.snapshot ? { backfilledFrom: range.from } : {}), ...(!p.snapshot ? { latest: [cursor.latest, range.to].filter(Boolean).sort().pop() } : {}) };
      await record(st.status, { detail: r.detail, cursor: nextCursor, synced: !unfinished });
      await store.insert('seo_sync_runs', [{ provider: p.id, mode, range_from: range.from, range_to: range.to, status: 'ok', rows_written: r.rows, detail: r.detail, started_at: started, finished_at: new Date().toISOString() }]);
      results.push({ provider: p.id, status: st.status, rows: r.rows, range, ...(unfinished ? { partial: true, next: r.next } : {}) });
      summary.pulled += 1;
      if (unfinished) more = true;
      else { run.done.push(p.id); run.pulled += 1; }
    } catch (e) {
      if (e instanceof SubrequestBudgetExceeded && ranInSlice > 1) {
        // Ran out mid-provider after others used the budget: nothing recorded, it resumes next call.
        more = true; summary.deferred += 1; results.push({ provider: p.id, status: st.status, deferred: true });
        break;
      }
      // A real failure — or a provider too big for a whole fresh invocation. Record it and move on.
      budget.openReserve();
      const status = e instanceof ProviderError ? e.status : 'error';
      const msg = e instanceof SubrequestBudgetExceeded ? `too large for one invocation (${e.message})` : e.message;
      await record(status, { error: msg }).catch(() => {});
      await store.insert('seo_sync_runs', [{ provider: p.id, mode, range_from: range.from, range_to: range.to, status: 'error', rows_written: 0, detail: msg, started_at: started, finished_at: new Date().toISOString() }]).catch(() => {});
      results.push({ provider: p.id, status, error: msg });
      summary.errors.push(`${p.id}: ${msg}`);
      run.errors.push(`${p.id}: ${msg}`);
      run.done.push(p.id);
      if (e instanceof SubrequestBudgetExceeded) { more = true; break; }
    }
  }

  budget.openReserve();
  if (statusRows.length) await store.upsert('seo_provider_status', statusRows, 'provider').catch(() => {});
  // All providers handled: analysis next (its own invocation), even when few
  // providers are connected — first-party data still counts.
  if (!more) { run.phase = 'analysis'; more = true; }
  return { mode, results, more, summary };
}
