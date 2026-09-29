// Jarvis monthly AI budget governor: one combined estimate for Anthropic
// (Claude), Deepgram (speech-to-text) and Cartesia (text-to-speech).
//
// ESTIMATE, not billing: prices below are the published list rates as of
// 2026-09 and can be overridden with env vars. Provider-side spending limits
// (MANUAL_STEPS.md) are the real safety net; this keeps normal use visible
// and stops a runaway loop from quietly spending money.
//
// Storage: jarvis_ai_usage (month, provider) totals, incremented atomically by
// the jarvis_add_usage RPC (jarvis_ai_usage_migration.sql). If that table
// isn't there yet, tracking is off and Jarvis keeps working normally.
// Tests: tests/ai-budget.test.js.

import { phoenixYmd } from '../../shared/business-metrics.js';

export const PROVIDERS = ['anthropic', 'stt', 'tts'];

export function pricing(env = {}) {
  const n = (k, d) => (Number.isFinite(Number(env[k])) && env[k] !== '' && env[k] != null ? Number(env[k]) : d);
  return {
    // Claude Haiku 4.5, USD per million tokens
    inPerM: n('JARVIS_ANTHROPIC_IN_PER_MTOK', 1),
    outPerM: n('JARVIS_ANTHROPIC_OUT_PER_MTOK', 5),
    cacheWritePerM: n('JARVIS_ANTHROPIC_CACHE_WRITE_PER_MTOK', 1.25),     // 5-minute cache writes
    cacheWrite1hPerM: n('JARVIS_ANTHROPIC_CACHE_WRITE_1H_PER_MTOK', 2),   // 1-hour cache writes
    cacheReadPerM: n('JARVIS_ANTHROPIC_CACHE_READ_PER_MTOK', 0.1),
    // Deepgram Nova-3 streaming, pay as you go
    sttPerMin: n('JARVIS_STT_USD_PER_MIN', 0.0077),
    // Cartesia Sonic, per character (~$5 per 100k characters)
    ttsPerChar: n('JARVIS_TTS_USD_PER_CHAR', 0.00005),
    limit: n('JARVIS_MONTHLY_AI_BUDGET_USD', 25),
  };
}

// Anthropic usage (summed across turns) -> USD. Cache writes are priced by TTL
// when the response breaks them down (usage.cache_creation.ephemeral_1h/5m_*).
export function anthropicUsd(usage = {}, p = pricing()) {
  const u = k => Number(usage[k] || 0);
  const w1h = u('ephemeral_1h_input_tokens');
  const w5m = usage.ephemeral_5m_input_tokens != null || usage.ephemeral_1h_input_tokens != null ? u('ephemeral_5m_input_tokens') : u('cache_creation_input_tokens');
  return (u('input_tokens') * p.inPerM + u('output_tokens') * p.outPerM
    + w5m * p.cacheWritePerM + w1h * p.cacheWrite1hPerM + u('cache_read_input_tokens') * p.cacheReadPerM) / 1e6;
}
export const sttUsd = (seconds, p = pricing()) => (Math.max(0, Number(seconds) || 0) / 60) * p.sttPerMin;
export const ttsUsd = (chars, p = pricing()) => Math.max(0, Number(chars) || 0) * p.ttsPerChar;

export const budgetMonth = (now = new Date()) => phoenixYmd(now).slice(0, 7);

// normal < 80% (<$20) · warn 80–92% ($20–23) · conscious 92–100% ($23–25) · blocked ≥ 100%
export function budgetState(totalUsd, limit) {
  const pct = limit > 0 ? (totalUsd / limit) * 100 : 0;
  const state = pct >= 100 ? 'blocked' : pct >= 92 ? 'conscious' : pct >= 80 ? 'warn' : 'normal';
  return { state, pct: Math.round(pct * 10) / 10 };
}

export async function readBudget({ base, headers, env = {}, now = new Date(), fetchImpl = (...a) => fetch(...a) }) {
  const p = pricing(env);
  const month = budgetMonth(now);
  const providers = Object.fromEntries(PROVIDERS.map(k => [k, { usd: 0, units: 0 }]));
  let tracking = true;
  try {
    const res = await fetchImpl(`${base}/jarvis_ai_usage?month=eq.${month}&select=provider,units,usd`, { headers });
    if (!res.ok) throw new Error(`usage table ${res.status}`);
    for (const r of await res.json()) if (providers[r.provider]) providers[r.provider] = { usd: Number(r.usd) || 0, units: Number(r.units) || 0 };
  } catch {
    tracking = false; // migration not run yet (or Supabase hiccup): never block Jarvis over bookkeeping
  }
  const total = PROVIDERS.reduce((t, k) => t + providers[k].usd, 0);
  return { month, providers, total: Math.round(total * 10000) / 10000, limit: p.limit, tracking, ...budgetState(total, p.limit) };
}

export async function addUsage({ base, headers, provider, units, usd, now = new Date(), fetchImpl = (...a) => fetch(...a) }) {
  if (!PROVIDERS.includes(provider) || !(usd > 0 || units > 0)) return false;
  try {
    const res = await fetchImpl(`${base}/rpc/jarvis_add_usage`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_month: budgetMonth(now), p_provider: provider, p_units: Number(units) || 0, p_usd: Number(usd) || 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
