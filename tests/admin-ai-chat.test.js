// End-to-end: the real admin-ai-chat handler with a scripted Claude and the
// in-memory Supabase fake. Asserts what Claude is given and what the owner
// is told — the model's prose is scripted, the guarantees are the server's.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };

async function chat({ messages, context = null, script, db = fakeSupabase(seed()) }) {
  const { fetchImpl, claudeRequests } = fakeFetch(db, script);
  globalThis.fetch = fetchImpl;
  const res = await onRequestPost({
    request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, context }) }),
    env: ENV,
  });
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  return {
    db, claudeRequests, events,
    final: events.find(e => e.type === 'final')?.text,
    guarded: events.find(e => e.type === 'final')?.guarded === true,
    context: events.find(e => e.type === 'context')?.context,
    calls: events.filter(e => e.type === 'tool_call').map(e => e.tool),
  };
}

const allText = req => JSON.stringify(req.messages);

test('12: a revenue question after a Lisa conversation sends Claude only the revenue question', async () => {
  const r = await chat({
    messages: [
      { role: 'user', content: 'What notes do I have about Lisa?' },
      { role: 'assistant', content: 'You have one open note on Lisa: she might want an oil change next week.' },
      { role: 'user', content: 'What is my revenue this month?' },
    ],
    context: { customer: { name: 'Lisa' }, resultSet: { type: 'notes', items: [{ id: 'N2', label: 'Lisa' }] } },
    script: [claudeTool('get_revenue_summary', { period: 'this_month' }), claudeText('$250.00 collected this month.')],
  });
  assert.doesNotMatch(allText(r.claudeRequests[0]), /Lisa/);
  assert.equal(r.claudeRequests[0].messages.length, 1);
  assert.deepEqual(r.claudeRequests[0].tools.map(t => t.name).sort(), ['get_owner_pay_summary', 'get_revenue_summary', 'list_marketing_spend']);
  assert.equal(r.final, '$250.00 collected this month.');
});

test('2: "what vehicle was that on?" re-reads the anchored Jill booking before Claude answers', async () => {
  const r = await chat({
    messages: [{ role: 'user', content: 'What vehicle was that on?' }],
    context: { customer: { name: 'Jill Castle', customerId: 'c-jill' }, activeBookingId: 'J2', vehicle: '2017 Acura RDX' },
    script: [claudeText('That was on her 2017 Acura RDX.')],
  });
  assert.deepEqual(r.calls, ['get_job_detail']);
  const record = r.claudeRequests[0].messages.at(-1).content[0].content; // the re-read booking
  assert.equal(JSON.parse(record).id, 'J2');
  assert.equal(JSON.parse(record).vehicle, '2017 Acura RDX');
  assert.doesNotMatch(allText(r.claudeRequests[0]), /Civic|Camry|Blazer/); // no unrelated fixture vehicle reaches the model
  assert.doesNotMatch(record, /Ranger/);
  assert.equal(r.context.activeBookingId, 'J2');
});

test('5: "Sergei …" replaces the stale Ranger context and looks Sergei up', async () => {
  const r = await chat({
    messages: [{ role: 'user', content: 'Sergei what was his job actually about' }],
    context: { customer: { name: 'Sean Webb' }, activeBookingId: 'SW1', vehicle: '2008 Ford Ranger' },
    script: [claudeText('Sergei\'s Ram was checked around a P2509 code…')],
  });
  assert.deepEqual(r.calls, ['get_customer_context']);
  const first = allText(r.claudeRequests[0]);
  assert.match(first, /P2509/);
  assert.match(first, /AC condensation/);
  assert.doesNotMatch(first.replace(/earlier subject \([^)]*\)/, ''), /Sean Webb|2008 Ford Ranger/);
  assert.equal(r.context.activeBookingId, 'S1');
});

test('5: "each one" answers from the previous lead list', async () => {
  const r = await chat({
    messages: [{ role: 'user', content: 'Why does each one need follow-up?' }],
    context: { resultSet: { type: 'leads', items: [{ id: 'L3', label: 'Dana Ortiz' }, { id: 'L4', label: 'Mo Khan' }] }, customer: { name: 'Lisa' } },
    script: [claudeText('Dana was never contacted; Mo\'s follow-up is due.')],
  });
  assert.deepEqual(r.calls, ['get_result_set_details']);
  assert.match(allText(r.claudeRequests[0]), /uncontacted_over_24h[\s\S]*follow_up_due|follow_up_due[\s\S]*uncontacted_over_24h/);
});

test('6: "What did Red come in for?" resolves Red from bookings', async () => {
  const r = await chat({ messages: [{ role: 'user', content: 'What did Red come in for?' }], script: [claudeText('Red brought in the Blazer…')] });
  assert.deepEqual(r.calls, ['get_customer_context']);
  assert.match(allText(r.claudeRequests[0]), /SAS Reset/);
});

test('10: "Done" with no successful write is replaced before the owner sees it', async () => {
  const r = await chat({
    messages: [{ role: 'user', content: 'both note and update' }],
    script: [claudeText("Done — job status updated and cancellation noted. Richard's water pump job is off the books for today.")],
  });
  assert.equal(r.guarded, true);
  assert.match(r.final, /^Nothing was changed/);
  assert.equal(r.db.tables.bookings.find(b => b.id === 'R1').job_status, 'ESTIMATE_SENT');
});

test('10: a failed cancel cannot be reported as done', async () => {
  const db = fakeSupabase(seed());
  db.failPatch = true;
  const r = await chat({
    db,
    messages: [{ role: 'user', content: 'yes' }],
    context: { pendingAction: { tool: 'cancel_job', input: { job_id: 'R1', reason: 'customer cancelled', confirmed: false } } },
    script: [claudeText('Done — Richard\'s job is cancelled.')],
  });
  assert.deepEqual(r.calls, ['cancel_job']);
  assert.equal(r.guarded, true);
  assert.match(r.final, /Nothing was changed.*simulated database error/);
  assert.equal(db.tables.bookings.find(b => b.id === 'R1').job_status, 'ESTIMATE_SENT');
});

test('9/14: confirmed cancel executes, is verified, and can be read back', async () => {
  const preview = await chat({
    messages: [{ role: 'user', content: "Cancel Richard's Ford Ranger job because customer cancelled." }],
    script: [claudeTool('cancel_job', { job_id: 'R1', reason: 'customer cancelled' }), claudeText("Cancel Richard Lee's 2011 Ford Ranger job today at 3 PM? Reply yes.")],
  });
  assert.deepEqual(preview.calls, ['get_customer_context', 'cancel_job']);
  assert.equal(preview.db.tables.bookings.find(b => b.id === 'R1').job_status, 'ESTIMATE_SENT');
  assert.equal(preview.context.pendingAction.tool, 'cancel_job');

  const done = await chat({
    db: preview.db,
    messages: [{ role: 'user', content: 'yes' }],
    context: preview.context,
    script: [claudeText("Done — Richard's Ranger job is cancelled.")],
  });
  assert.equal(done.guarded, false);
  const row = done.db.tables.bookings.find(b => b.id === 'R1');
  assert.deepEqual([row.job_status, row.status], ['CANCELLED', 'cancelled']);
  assert.equal(done.context.pendingAction, undefined);

  const status = await chat({
    db: done.db,
    messages: [{ role: 'user', content: "What status is Richard's Ranger job now?" }],
    context: done.context,
    script: [claudeText("Richard's Ranger job is CANCELLED.")],
  });
  assert.match(allText(status.claudeRequests[0]), /"status\\":\\"CANCELLED\\"/);
});

test('11: payment preview then confirmation records it once', async () => {
  const preview = await chat({
    messages: [{ role: 'user', content: 'Record $10 cash on Jill Moreno\'s oil change' }],
    script: [claudeTool('mark_job_paid', { job_id: 'M1', amount: 10, method: 'Cash' }), claudeText('Record $10 cash… sound right?')],
  });
  assert.equal(preview.db.tables.bookings.find(b => b.id === 'M1').amount_paid, 0);
  const done = await chat({ db: preview.db, messages: [{ role: 'user', content: 'yes' }], context: preview.context, script: [claudeText('Done — recorded $10 cash; $75 still owed.')] });
  assert.equal(done.guarded, false);
  assert.equal(done.db.tables.bookings.find(b => b.id === 'M1').amount_paid, 10);
  const again = await chat({ db: done.db, messages: [{ role: 'user', content: 'yes' }], context: done.context, script: [claudeText('Done — recorded again.')] });
  assert.equal(again.guarded, true); // no pending action any more, so nothing was written
  assert.equal(again.db.tables.bookings.find(b => b.id === 'M1').amount_paid, 10);
});
