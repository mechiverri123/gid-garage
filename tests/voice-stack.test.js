// Direct voice stack (Deepgram STT -> Jarvis/Claude -> Cartesia TTS):
// what gets spoken, the monthly AI budget governor, the Claude stream reader,
// and the chat backend's voice mode (streamed sentences, write guard, budget).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { speakable, createSentenceBuffer, wantsFullReadout } from '../shared/voice-text.js';
import { anthropicUsd, sttUsd, ttsUsd, budgetState, pricing, readBudget } from '../functions/_lib/ai-budget.js';
import { readClaudeStream } from '../functions/_lib/claude-stream.js';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { handleVoice } from '../functions/jarvis/voice.js';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('only conversational text is spoken', () => {
  assert.equal(speakable('**Done.** See https://gidgarage.com/invoice?id=GID-1790278994988 for details.'), 'Done. See the link for details.');
  assert.equal(speakable('- Oil change\n- Brakes'), 'Oil change Brakes');
  assert.equal(speakable('Result: {"id":"GID-1","total":771.37,"status":"PAID","extra":"x"} ok'), 'Result: ok');
  const long = 'This is a sentence. '.repeat(60);
  assert.ok(speakable(long, { maxChars: 120 }).length <= 120);
  assert.ok(speakable(long, { maxChars: 120 }).endsWith('.'));
  assert.equal(wantsFullReadout('read me all the details'), true);
  assert.equal(wantsFullReadout("pull up Jill's jobs"), false);
});

test('streamed text becomes whole sentences without splitting money or dates', () => {
  const b = createSentenceBuffer();
  const out = [];
  for (const d of ['September revenue is $4,4', '39.02 so far. Up 13', '.7% from Aug. ', 'That is good']) out.push(...b.push(d));
  out.push(b.flush());
  assert.deepEqual(out, ['September revenue is $4,439.02 so far.', 'Up 13.7% from Aug.', 'That is good']);
});

test('budget: price math and the $20 / $23 / $25 thresholds', () => {
  const p = pricing({});
  assert.equal(Math.round(anthropicUsd({ input_tokens: 1e6, output_tokens: 1e5, cache_read_input_tokens: 1e6 }, p) * 1000) / 1000, 1.6);
  assert.equal(Math.round(sttUsd(600, p) * 10000) / 10000, 0.077); // 10 minutes
  assert.equal(ttsUsd(100000, p), 5);
  assert.equal(budgetState(15, 25).state, 'normal');
  assert.equal(budgetState(20, 25).state, 'warn');
  assert.equal(budgetState(23, 25).state, 'conscious');
  assert.equal(budgetState(25, 25).state, 'blocked');
  assert.equal(pricing({ JARVIS_MONTHLY_AI_BUDGET_USD: '10' }).limit, 10);
});

test('budget: missing usage table never blocks Jarvis', async () => {
  const b = await readBudget({ base: 'https://db.test/rest/v1', headers: {}, fetchImpl: async () => new Response('relation does not exist', { status: 404 }) });
  assert.equal(b.tracking, false);
  assert.equal(b.state, 'normal');
});

// ---- Claude streaming ------------------------------------------------------------
function sse(events) {
  const text = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const streamOf = msg => {
  const ev = [{ type: 'message_start', message: { usage: { input_tokens: 1200, cache_read_input_tokens: 4000 } } }];
  msg.content.forEach((b, i) => {
    if (b.type === 'text') {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      for (const piece of b.text.match(/.{1,6}/gs)) ev.push({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: piece } });
    } else {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      const js = JSON.stringify(b.input);
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: js.slice(0, 5) } });
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: js.slice(5) } });
    }
    ev.push({ type: 'content_block_stop', index: i });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: msg.stop_reason }, usage: { output_tokens: 40 } });
  ev.push({ type: 'message_stop' });
  return sse(ev);
};

test('stream reader rebuilds text and tool calls exactly', async () => {
  const deltas = [];
  const r = await readClaudeStream(streamOf({ content: [{ type: 'text', text: 'Pulling up.' }, { type: 'tool_use', id: 't1', name: 'show_jobs', input: { customer: 'Jill', count: 3 } }], stop_reason: 'tool_use' }), { onText: d => deltas.push(d) });
  assert.equal(deltas.join(''), 'Pulling up.');
  assert.deepEqual(r.content[1], { type: 'tool_use', id: 't1', name: 'show_jobs', input: { customer: 'Jill', count: 3 } });
  assert.equal(r.stop_reason, 'tool_use');
  assert.deepEqual(r.usage, { input_tokens: 1200, cache_read_input_tokens: 4000, output_tokens: 40 });
});

// ---- chat backend in voice mode ------------------------------------------------------
const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
async function voiceChat({ text, script, usageRows = [], voice = true }) {
  const db = fakeSupabase(seed());
  const { fetchImpl, claudeRequests } = fakeFetch(db, script);
  const rpc = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/jarvis_ai_usage')) return new Response(JSON.stringify(usageRows), { headers: { 'Content-Type': 'application/json' } });
    if (u.pathname.endsWith('/rpc/jarvis_add_usage')) { rpc.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    if (u.hostname === 'api.anthropic.com' && JSON.parse(init.body).stream) {
      const res = await fetchImpl(url, init);
      return streamOf(await res.json());
    }
    return fetchImpl(url, init);
  };
  const res = await onRequestPost({
    request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }], voice, stream: voice }) }),
    env: ENV,
  });
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { events, claudeRequests, rpc, says: events.filter(e => e.type === 'say').map(e => e.text), final: events.find(e => e.type === 'final') };
}

test('voice turn: sentences stream as they arrive, short-reply hint, prompt caching, usage recorded', async () => {
  const r = await voiceChat({ text: 'what can you do for me today', script: [claudeText('I can pull up jobs and revenue. What do you need?')] });
  assert.deepEqual(r.says, ['I can pull up jobs and revenue.', 'What do you need?']);
  assert.equal(r.final.spoken, true);
  const req = r.claudeRequests[0];
  assert.equal(req.stream, true);
  assert.equal(req.max_tokens, 350);
  assert.equal(req.system[0].cache_control.type, 'ephemeral');
  assert.match(JSON.stringify(req.messages.at(-1)), /VOICE: This reply is spoken aloud/);
  assert.equal(r.rpc.length, 1);
  assert.equal(r.rpc[0].p_provider, 'anthropic');
  assert.ok(r.rpc[0].p_usd > 0);
});

test('voice turn never speaks a write claim that did not happen', async () => {
  const r = await voiceChat({ text: 'mark the Tacoma job paid', script: [claudeText("Done, I've marked it paid.")] });
  assert.deepEqual(r.says, []);
  assert.equal(r.final.guarded, true);
  assert.equal(r.final.spoken, false); // the page speaks the corrected final text instead
});

test('voice turn: tool calls still run from a streamed response', async () => {
  const r = await voiceChat({ text: "what's my revenue this month", script: [claudeTool('get_revenue_summary', { period: 'this_month' }), claudeText('September revenue is $4,439.02 so far.')] });
  assert.ok(r.events.some(e => e.type === 'tool_call' && e.tool === 'get_revenue_summary'));
  assert.deepEqual(r.says, ['September revenue is $4,439.02 so far.']);
});

test('at the monthly ceiling Claude is not called and Jarvis explains why', async () => {
  const r = await voiceChat({ text: 'brief me', script: [], usageRows: [{ provider: 'anthropic', usd: 20, units: 1 }, { provider: 'tts', usd: 5.2, units: 1 }] });
  assert.equal(r.claudeRequests.length, 0);
  assert.match(r.final.text, /Monthly Jarvis AI budget reached/);
  assert.equal(r.events[0].type, 'budget');
});

test('cost-conscious mode ($23+) shortens spoken replies', async () => {
  const r = await voiceChat({ text: 'what can you do', script: [claudeText('Plenty.')], usageRows: [{ provider: 'anthropic', usd: 23.5, units: 1 }] });
  assert.equal(r.claudeRequests[0].max_tokens, 200);
  assert.match(JSON.stringify(r.claudeRequests[0].messages.at(-1)), /ONE short spoken sentence/);
});

test('typed (non-voice) turns are unchanged: no streaming, normal length', async () => {
  const r = await voiceChat({ text: 'what can you do', script: [claudeText('Plenty.')], voice: false });
  assert.equal(r.claudeRequests[0].stream, undefined);
  assert.equal(r.claudeRequests[0].max_tokens, 1024);
  assert.equal(r.says.length, 0);
});

// ---- /jarvis/voice token endpoint ----------------------------------------------------
const VOICE_ENV = { ...ENV, DEEPGRAM_API_KEY: 'dg-secret', CARTESIA_API_KEY: 'ct-secret' };
const allow = async () => ({ ok: true });
const post = body => new Request('https://gidgarage.com/jarvis/voice', { method: 'POST', body: JSON.stringify(body) });
function providers({ dgStatus = 200, usage = [] } = {}) {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), headers: init.headers || {} });
    const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (String(url).includes('deepgram.com/v1/auth/grant')) return dgStatus === 200 ? j({ access_token: 'dg-temp', expires_in: 600 }) : j({ err: 'x' }, dgStatus);
    if (String(url).includes('cartesia.ai/access-token')) return j({ token: 'ct-temp' });
    if (String(url).includes('cartesia.ai/voices')) return j({ data: [{ id: 'v-other', name: 'Benedict - Friendly', description: 'upbeat' }, { id: 'v-benedict', name: 'Benedict - Measured Mediator', description: 'calm British' }] });
    if (String(url).includes('/jarvis_ai_usage')) return j(usage);
    return j({}, 404);
  };
  return { fetchImpl, seen };
}

test('voice session: short-lived tokens only, Benedict resolved by name, keys never returned', async () => {
  const { fetchImpl } = providers();
  const res = await handleVoice({ request: post({ action: 'session' }), env: VOICE_ENV, fetchImpl, verify: allow });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.deepgram.token, 'dg-temp');
  assert.equal(body.cartesia.token, 'ct-temp');
  assert.equal(body.cartesia.voiceId, 'v-benedict');
  assert.doesNotMatch(JSON.stringify(body), /dg-secret|ct-secret/);
});

test('voice session: refuses cleanly on budget, missing keys, provider quota, or no Access', async () => {
  const blocked = await handleVoice({ request: post({ action: 'session' }), env: VOICE_ENV, fetchImpl: providers({ usage: [{ provider: 'stt', usd: 26, units: 1 }] }).fetchImpl, verify: allow });
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).reason, 'budget');
  const unset = await handleVoice({ request: post({ action: 'session' }), env: ENV, fetchImpl: providers().fetchImpl, verify: allow });
  assert.equal(unset.status, 503);
  assert.deepEqual((await unset.json()).missing, ['DEEPGRAM_API_KEY', 'CARTESIA_API_KEY']);
  const quota = await handleVoice({ request: post({ action: 'session' }), env: VOICE_ENV, fetchImpl: providers({ dgStatus: 402 }).fetchImpl, verify: allow });
  const q = await quota.json();
  assert.deepEqual([quota.status, q.provider, q.quota], [502, 'deepgram', true]);
  const denied = await handleVoice({ request: post({ action: 'session' }), env: VOICE_ENV, fetchImpl: providers().fetchImpl, verify: async () => ({ ok: false, status: 401, error: 'Unauthorized' }) });
  assert.equal(denied.status, 401);
});

test('voice turn: narration before a tool call is not spoken, only the reply', async () => {
  const pre = { content: [{ type: 'text', text: "Now I'll open all three jobs side by side. " }, { type: 'tool_use', id: 't1', name: 'get_revenue_summary', input: { period: 'this_month' } }], stop_reason: 'tool_use' };
  const r = await voiceChat({ text: "what's my revenue this month", script: [pre, claudeText('Revenue is up. It was a good month.')] });
  assert.deepEqual(r.says, ['Revenue is up.', 'It was a good month.']);
});
