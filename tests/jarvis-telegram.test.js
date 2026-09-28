// Telegram regression: the real webhook handler -> real admin-ai-chat -> reply
// sent back through the Telegram Bot API. Telegram, Supabase and Claude are faked.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/jarvis-telegram.js';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_WEBHOOK_SECRET: 'hook-secret', TELEGRAM_OWNER_CHAT_ID: '4242' };

function telegram({ text, chatId = 4242, secret = 'hook-secret', script = [], db = fakeSupabase({ ...seed(), jarvis_text_messages: [] }) }) {
  const { fetchImpl, claudeRequests } = fakeFetch(db, script);
  const sent = [];
  const seoCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.telegram.org') {
      const body = JSON.parse(init.body);
      sent.push({ method: u.pathname.split('/').pop(), ...body });
      return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname.includes('/rest/v1/seo_')) seoCalls.push(url);
    return fetchImpl(url, init);
  };
  const request = new Request('https://gidgarage.com/jarvis-telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: 1, message: { message_id: 77, chat: { id: chatId }, text } }),
  });
  return onRequestPost({ request, env: ENV }).then(res => ({ res, sent, claudeRequests, db, seoCalls, replies: sent.filter(s => s.method === 'sendMessage').map(s => s.text) }));
}

test('owner message: secret + chat id accepted, reaches Jarvis, reply sent via Telegram', async () => {
  const r = await telegram({
    text: 'What is my revenue this month?',
    script: [claudeTool('get_revenue_summary', { period: 'this_month' }), claudeText('$250.00 collected this month.')],
  });
  assert.equal(r.res.status, 200);
  assert.equal(r.claudeRequests.length, 2); // reached the business backend and ran a tool
  assert.deepEqual(r.replies, ['$250.00 collected this month.']);
  assert.equal(r.sent.find(s => s.method === 'sendMessage').chat_id, '4242');
  assert.deepEqual(r.db.tables.jarvis_text_messages.map(m => m.role), ['user', 'assistant']);
  assert.ok(r.db.tables.jarvis_proactive_state.some(row => row.key === 'telegram_context:4242'));
  assert.deepEqual(r.seoCalls, []); // Telegram business turns never touch SEO tables
});

test('second turn reuses the stored context without failing', async () => {
  const db = fakeSupabase({ ...seed(), jarvis_text_messages: [] });
  await telegram({ db, text: 'What notes do I have about Lisa?', script: [claudeText('One note on Lisa.')] });
  const r = await telegram({ db, text: 'What is my revenue this month?', script: [claudeTool('get_revenue_summary', { period: 'this_month' }), claudeText('$250.00 collected this month.')] });
  assert.deepEqual(r.replies, ['$250.00 collected this month.']);
});

test('wrong webhook secret is rejected and nothing is sent', async () => {
  const r = await telegram({ text: 'hi', secret: 'nope' });
  assert.equal(r.res.status, 403);
  assert.deepEqual(r.sent, []);
});

test('non-owner chat is ignored silently', async () => {
  const r = await telegram({ text: 'hi', chatId: 999 });
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.sent, []);
  assert.equal(r.claudeRequests.length, 0);
});
