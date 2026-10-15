// Jarvis vocabulary: entries, the extra prompt block (after the cached prompt),
// and Deepgram keyterms (names + short terms, capped).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEntry, upsertEntry, removeEntry, vocabularyPrompt, voiceKeyterms, loadVocabulary, saveVocabulary, VOCAB_KEY, MAX_ENTRIES } from '../functions/_lib/vocabulary.js';
import { handleVoice, keytermNames } from '../functions/jarvis/voice.js';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { fakeSupabase, fakeFetch, claudeText } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function fakeBucket(init = {}) {
  const store = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { store, get: async k => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null), put: async (k, v) => { store.set(k, v); } };
}

test('entries: both sides required, same word replaces (any case), newest first, capped, removable', () => {
  assert.throws(() => cleanEntry({ said: ' ', meant: 'x' }), /What do you say/);
  assert.throws(() => cleanEntry({ said: 'Kass', meant: '' }), /What do you mean/);
  const now = new Date('2026-10-15T16:00:00Z');
  let l = upsertEntry([], { said: ' Kass ', meant: 'Kassidy' }, { now });
  l = upsertEntry(l, { said: 'close it', meant: 'mark the lead lost' }, { now, source: 'correction' });
  l = upsertEntry(l, { said: 'KASS', meant: 'Kassidy, my girlfriend' }, { now });
  assert.deepEqual(l.map(e => [e.said, e.meant, e.source]), [['KASS', 'Kassidy, my girlfriend', 'manual'], ['close it', 'mark the lead lost', 'correction']]);
  assert.deepEqual(removeEntry(l, l[0].id).map(e => e.said), ['close it']);
  let big = [];
  for (let i = 0; i < MAX_ENTRIES + 5; i++) big = upsertEntry(big, { said: `w${i}`, meant: 'm' }, { now });
  assert.equal(big.length, MAX_ENTRIES);
  assert.equal(big[0].said, `w${MAX_ENTRIES + 4}`);
});

test('prompt block: empty when nothing saved; never overrides confirmations', () => {
  assert.equal(vocabularyPrompt([]), '');
  const p = vocabularyPrompt([{ said: 'Kass', meant: 'Kassidy' }]);
  assert.match(p, /"Kass" means: Kassidy/);
  assert.match(p, /never skip a confirmation/);
});

test('keyterms: brand words first, short terms, then names; deduped; long phrases skipped; capped', () => {
  const k = voiceKeyterms({ entries: [{ said: 'Kass' }, { said: 'close all my lead follow ups please' }], names: ['Lakisha Chee', 'lakisha chee', 'Shvonne Honie'] });
  assert.deepEqual(k, ['Jarvis', 'GID Garage', 'Kass', 'Lakisha Chee', 'Shvonne Honie']);
  const many = voiceKeyterms({ names: Array.from({ length: 200 }, (_, i) => `Name${i} Person`) });
  assert.equal(many.length, 50);
  assert.ok(many.join('').length <= 1400);
});

test('storage round trip; a missing bucket reads as empty and refuses to save', async () => {
  const bucket = fakeBucket();
  await saveVocabulary(bucket, [{ id: 'a', said: 'Kass', meant: 'Kassidy' }]);
  assert.ok(bucket.store.has(VOCAB_KEY));
  assert.equal((await loadVocabulary(bucket))[0].said, 'Kass');
  assert.deepEqual(await loadVocabulary(null), []);
  await assert.rejects(saveVocabulary(null, []), /Storage/);
});

test('voice session: keyterms include vocabulary and customer/lead names; lookups failing never block voice', async () => {
  const j = b => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async url => {
    const u = String(url);
    if (u.includes('deepgram.com/v1/auth/grant')) return j({ access_token: 'dg-temp', expires_in: 600 });
    if (u.includes('cartesia.ai/access-token')) return j({ token: 'ct-temp' });
    if (u.includes('cartesia.ai/voices')) return j({ data: [{ id: 'v-b', name: 'Benedict', tagline: 'Measured Mediator' }] });
    if (u.includes('/jarvis_ai_usage')) return j([]);
    if (u.includes('/bookings?')) return j([{ fname: 'Jill', lname: 'Hart' }]);
    if (u.includes('/leads?')) return j([{ fname: 'Lakisha', lname: 'Chee' }]);
    return j({});
  };
  const env = { ANTHROPIC_API_KEY: 'a', DEEPGRAM_API_KEY: 'd', CARTESIA_API_KEY: 'c', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 's', GID_PHOTOS: fakeBucket({ [VOCAB_KEY]: { entries: [{ id: 'a', said: 'Kass', meant: 'Kassidy' }] } }) };
  const req = new Request('https://gidgarage.com/jarvis/voice', { method: 'POST', body: JSON.stringify({ action: 'session' }) });
  const body = await (await handleVoice({ request: req, env, fetchImpl, verify: async () => ({ ok: true }) })).json();
  assert.deepEqual(body.deepgram.keyterms, ['Jarvis', 'GID Garage', 'Kass', 'Jill Hart', 'Lakisha Chee']);
  assert.deepEqual(await keytermNames({ base: 'b', headers: {} }, async () => { throw new Error('down'); }), []);
  assert.deepEqual(await keytermNames(null, fetchImpl), []);
});

test('chat: vocabulary goes in its own block after the cached prompt (cache untouched); none saved = no block', async () => {
  async function chat(env) {
    const { fetchImpl, claudeRequests } = fakeFetch(fakeSupabase(seed()), [claudeText('Very good, sir.')]);
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/jarvis_ai_usage')) return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      if (u.pathname.endsWith('/rpc/jarvis_add_usage')) return new Response(null, { status: 204 });
      return fetchImpl(url, init);
    };
    const res = await onRequestPost({ request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'did Kass pay me back' }] }) }), env });
    await res.text();
    return claudeRequests[0];
  }
  const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
  const withVocab = await chat({ ...ENV, GID_PHOTOS: fakeBucket({ [VOCAB_KEY]: { entries: [{ id: 'a', said: 'Kass', meant: 'Kassidy' }] } }) });
  assert.equal(withVocab.system.length, 2);
  assert.deepEqual(withVocab.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  assert.equal(withVocab.system[1].cache_control, undefined);
  assert.match(withVocab.system[1].text, /"Kass" means: Kassidy/);
  const without = await chat(ENV);
  assert.equal(without.system.length, 1);
});
