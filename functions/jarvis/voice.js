// Cloudflare Pages Function — /jarvis/voice (admin only)
// Lives under /jarvis/* so the existing Cloudflare Access app covers it (see
// CLAUDE.md §0); the Access JWT is still verified here (verifyAccess).
//
// The browser talks to Deepgram (speech-to-text) and Cartesia (text-to-speech)
// directly over WebSockets for realtime speed, using SHORT-LIVED tokens minted
// here. The master keys (DEEPGRAM_API_KEY, CARTESIA_API_KEY) never leave the
// server. Claude runs server-side in admin-ai-chat.js as it always has.
//
// POST { action: 'session' } -> { deepgram: { token }, cartesia: { token, voiceId, model, version }, budget }
//   refused with { error, reason: 'budget' | 'not_configured' | 'provider' } when voice can't start
// POST { action: 'usage', sttSeconds, ttsChars } -> records estimated voice spend
// GET  ?action=usage -> monthly budget summary for Settings -> Usage
// GET  ?action=voice -> the resolved Cartesia voice (to pin CARTESIA_VOICE_ID if wanted)
// GET  ?action=check -> tests each provider separately (no secrets in the output)

import { verifyAccess } from '../_lib/access-auth.js';
import { readBudget, addUsage, pricing, sttUsd, ttsUsd } from '../_lib/ai-budget.js';

const CARTESIA_VERSION = '2026-08-14';
const TOKEN_TTL_S = 600;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Benedict — Measured Mediator (owner's choice). Looked up once per isolate
// when CARTESIA_VOICE_ID isn't set; never guessed.
let voiceCache = null;
export async function resolveVoice(env, fetchImpl = (...a) => fetch(...a)) {
  if (env.CARTESIA_VOICE_ID) return { id: env.CARTESIA_VOICE_ID, name: 'CARTESIA_VOICE_ID', source: 'env' };
  if (voiceCache) return voiceCache;
  const res = await fetchImpl('https://api.cartesia.ai/voices?q=Benedict&limit=100', {
    headers: { Authorization: `Bearer ${env.CARTESIA_API_KEY}`, 'X-API-Key': env.CARTESIA_API_KEY, 'Cartesia-Version': CARTESIA_VERSION },
  });
  if (!res.ok) throw providerError('cartesia', res.status, `Cartesia voice lookup failed (${res.status}): ${await detail(res)}`);
  const body = await res.json();
  const voices = Array.isArray(body) ? body : body.data || [];
  const text = v => `${v.name || ''} ${v.tagline || ''} ${v.description || ''}`.toLowerCase();
  const pick = voices.find(v => /benedict/.test(text(v)) && /measured|mediator/.test(text(v)));
  if (!pick) throw providerError('cartesia', 404, 'Benedict (Measured Mediator) voice not found — set CARTESIA_VOICE_ID');
  voiceCache = { id: pick.id, name: [pick.name, pick.tagline].filter(Boolean).join(' — '), source: 'lookup' };
  return voiceCache;
}

// Run one provider call; any failure (HTTP, network, bad JSON) names the provider.
async function tagged(provider, fn) {
  try { return await fn(); } catch (e) {
    if (e?.provider) throw e;
    throw providerError(provider, 0, `${provider}: ${e?.message || e}`);
  }
}

async function detail(res) {
  const t = await res.text().catch(() => '');
  try { const j = JSON.parse(t); return String(j.message || j.err_msg || j.error || j.title || t).slice(0, 200); } catch { return t.slice(0, 200); }
}

function providerError(provider, status, message) {
  const e = new Error(message);
  e.provider = provider; e.status = status;
  e.quota = status === 402 || status === 429;
  return e;
}

async function deepgramToken(env, fetchImpl) {
  const res = await fetchImpl('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: TOKEN_TTL_S }),
  });
  if (!res.ok) throw providerError('deepgram', res.status, `Deepgram refused the token request (${res.status}): ${await detail(res)}`);
  const body = await res.json();
  return { token: body.access_token, expiresIn: body.expires_in };
}

async function cartesiaToken(env, fetchImpl) {
  const res = await fetchImpl('https://api.cartesia.ai/access-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CARTESIA_API_KEY}`, 'X-API-Key': env.CARTESIA_API_KEY, 'Cartesia-Version': CARTESIA_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grants: { tts: true }, expires_in: TOKEN_TTL_S }),
  });
  if (!res.ok) throw providerError('cartesia', res.status, `Cartesia refused the token request (${res.status}): ${await detail(res)}`);
  const body = await res.json();
  return body.token;
}

export async function handleVoice({ request, env, fetchImpl = (...a) => fetch(...a), verify = verifyAccess }) {
  const auth = await verify(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  const db = supabaseUrl && serviceKey ? { base: `${supabaseUrl}/rest/v1`, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } } : null;
  const budget = () => (db ? readBudget({ ...db, env, fetchImpl }) : Promise.resolve({ tracking: false, state: 'normal', total: 0, limit: pricing(env).limit, pct: 0, providers: {} }));
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const action = url.searchParams.get('action') || 'usage';
    if (action === 'usage') {
      const b = await budget();
      return json({ ...b, configured: { anthropic: !!env.ANTHROPIC_API_KEY, deepgram: !!env.DEEPGRAM_API_KEY, cartesia: !!env.CARTESIA_API_KEY } });
    }
    if (action === 'check') {
      // Open /jarvis/voice?action=check in the browser to see exactly which provider fails.
      const run = async (name, fn) => { try { const v = await fn(); return { name, ok: true, ...(v || {}) }; } catch (e) { return { name, ok: false, status: e?.status || null, error: e?.message || String(e) }; } };
      const results = await Promise.all([
        run('deepgram token', async () => { if (!env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY is not set'); const t = await deepgramToken(env, fetchImpl); return { expiresIn: t.expiresIn, gotToken: !!t.token }; }),
        run('cartesia token', async () => { if (!env.CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY is not set'); return { gotToken: !!(await cartesiaToken(env, fetchImpl)) }; }),
        run('cartesia voice (Benedict)', async () => { if (!env.CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY is not set'); const v = await resolveVoice(env, fetchImpl); return { id: v.id, voice: v.name, source: v.source }; }),
      ]);
      return json({ ok: results.every(r => r.ok), results, keys: { anthropic: !!env.ANTHROPIC_API_KEY, deepgram: !!env.DEEPGRAM_API_KEY, cartesia: !!env.CARTESIA_API_KEY } });
    }
    if (action === 'voice') {
      if (!env.CARTESIA_API_KEY) return json({ error: 'CARTESIA_API_KEY is not set.' }, 503);
      try { return json(await resolveVoice(env, fetchImpl)); } catch (e) { return json({ error: e.message }, 502); }
    }
    return json({ error: 'Unknown action' }, 400);
  }

  const body = await request.json().catch(() => ({}));
  if (body.action === 'usage') {
    // Client-reported voice usage, clamped to sane per-report maximums.
    const p = pricing(env);
    const sec = Math.min(Math.max(Number(body.sttSeconds) || 0, 0), 900);
    const chars = Math.min(Math.max(Number(body.ttsChars) || 0, 0), 20000);
    if (db) {
      await Promise.all([
        sec > 0 && addUsage({ ...db, provider: 'stt', units: sec, usd: sttUsd(sec, p), fetchImpl }),
        chars > 0 && addUsage({ ...db, provider: 'tts', units: chars, usd: ttsUsd(chars, p), fetchImpl }),
      ]);
    }
    return json({ ok: true });
  }

  if (body.action === 'session') {
    const missing = ['DEEPGRAM_API_KEY', 'CARTESIA_API_KEY', 'ANTHROPIC_API_KEY'].filter(k => !env[k]);
    if (missing.length) return json({ error: `Voice isn't set up yet (missing ${missing.join(', ')}).`, reason: 'not_configured', missing }, 503);
    const b = await budget();
    if (b.state === 'blocked') return json({ error: 'Monthly Jarvis AI budget reached.', reason: 'budget', budget: b }, 402);
    try {
      const [dg, ct, voice] = await Promise.all([
        tagged('deepgram', () => deepgramToken(env, fetchImpl)),
        tagged('cartesia', () => cartesiaToken(env, fetchImpl)),
        tagged('cartesia', () => resolveVoice(env, fetchImpl)),
      ]);
      return json({
        deepgram: { token: dg.token, expiresIn: dg.expiresIn },
        cartesia: { token: ct, voiceId: voice.id, model: env.CARTESIA_MODEL || 'sonic-3', version: CARTESIA_VERSION },
        budget: b,
      });
    } catch (e) {
      // Log which provider failed and how — never the key.
      console.warn(`GID_VOICE_ERROR provider=${e.provider || 'unknown'} status=${e.status || '-'} quota=${!!e.quota} ${e.message}`);
      return json({ error: e.message, reason: 'provider', provider: e.provider || null, status: e.status || null, quota: !!e.quota }, 502);
    }
  }
  return json({ error: 'Unknown action' }, 400);
}

export const onRequest = context => handleVoice(context);
