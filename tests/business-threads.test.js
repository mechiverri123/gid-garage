// Business threads: a person's latest open note is the current state of their
// thread. "What am I waiting on?" lists each person once, and saving a newer
// note offers to close the older ones — closed only on the owner's "yes".
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionQueue, latestNotePerContact } from '../shared/business-rules.js';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const OLD = { id: 'R1', created_at: '2026-09-20T15:00:00Z', status: 'open', contact_name: 'Richard', summary: "Richard's Ranger estimate sent, waiting on him to confirm Tuesday", preferred_timing: 'Tuesday', raw_text: "Richard's Ranger estimate is sent, waiting on him to confirm Tuesday." };
const NEWER_WAITING = { id: 'R2', created_at: '2026-09-25T15:00:00Z', status: 'open', contact_name: 'richard ', summary: 'Richard checking with work about Tuesday', raw_text: 'Richard is checking with work about Tuesday.' };
const NEWER_DONE = { id: 'R3', created_at: '2026-09-26T15:00:00Z', status: 'open', contact_name: 'Richard', summary: 'Richard confirmed Tuesday 9am', raw_text: 'Richard confirmed Tuesday 9am.' };

test('waiting on lists a person once, from their latest open note, with the earlier count', () => {
  const q = buildActionQueue({ notes: [OLD, NEWER_WAITING] }, NOW);
  const richard = q.waiting_on.filter(w => w.type === 'owner_note');
  assert.equal(richard.length, 1);
  assert.equal(richard[0].id, 'R2');
  assert.equal(richard[0].earlier_open_notes, 1);
});

test('a newer note without waiting language means the person is no longer waited on', () => {
  const q = buildActionQueue({ notes: [OLD, NEWER_DONE] }, NOW);
  assert.deepEqual(q.waiting_on.filter(w => w.type === 'owner_note'), []);
});

test('notes for different people, and notes without a name, are never merged', () => {
  const lisa = { id: 'L1', created_at: '2026-09-27T00:00:00Z', status: 'open', contact_name: 'Lisa', summary: 'Lisa might want an oil change next week', raw_text: '' };
  const nameless = { id: 'X1', created_at: '2026-09-27T01:00:00Z', status: 'open', contact_name: null, summary: 'Waiting on the parts supplier', raw_text: '' };
  const groups = latestNotePerContact([OLD, lisa, nameless, { ...nameless, id: 'X2' }]);
  assert.deepEqual(groups.map(g => g.note.id).sort(), ['L1', 'R1', 'X1', 'X2']);
});

// ---- end to end through admin-ai-chat --------------------------------------------

const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
async function chat({ text, context = null, script, db }) {
  const { fetchImpl, claudeRequests } = fakeFetch(db, script);
  globalThis.fetch = fetchImpl;
  const res = await onRequestPost({ request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }], context }) }), env: ENV });
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { events, claudeRequests, context: events.find(e => e.type === 'context')?.context, final: events.find(e => e.type === 'final')?.text, results: events.filter(e => e.type === 'tool_result') };
}

test('saving a newer note offers to close the older one; "yes" closes exactly that one', async () => {
  const db = fakeSupabase({ ...seed(), jarvis_business_notes: [structuredClone(OLD)] });
  const first = await chat({
    db, text: 'Richard confirmed Tuesday 9am',
    script: [claudeTool('capture_business_note', { raw_text: 'Richard confirmed Tuesday 9am', summary: 'Richard confirmed Tuesday 9am', contact_name: 'Richard' }), claudeText('Saved. Close the earlier note?')],
  });
  const toolResult = JSON.stringify(first.claudeRequests[1].messages);
  assert.match(toolResult, /owner_question/);
  assert.match(toolResult, /R1/);
  assert.deepEqual(first.context.pendingAction, { tool: 'resolve_business_note', input: { note_ids: ['R1'] } });
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'R1').status, 'open'); // nothing closed yet

  const yes = await chat({ db, text: 'yes', context: first.context, script: [claudeText('Closed the earlier Richard note.')] });
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'R1').status, 'resolved');
  assert.equal(db.tables.jarvis_business_notes.filter(n => n.contact_name === 'Richard' && n.status === 'open').length, 1); // the new one stays open
  assert.equal(yes.final, 'Closed the earlier Richard note.');
  assert.equal(yes.context.pendingAction, undefined);
});

test('"no" leaves the earlier note open', async () => {
  const db = fakeSupabase({ ...seed(), jarvis_business_notes: [structuredClone(OLD)] });
  const first = await chat({ db, text: 'Richard confirmed Tuesday 9am', script: [claudeTool('capture_business_note', { raw_text: 'Richard confirmed Tuesday 9am', summary: 'Richard confirmed Tuesday 9am', contact_name: 'Richard' }), claudeText('Saved. Close the earlier note?')] });
  await chat({ db, text: 'no', context: first.context, script: [claudeText('Left it open.')] });
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'R1').status, 'open');
});

test('a note about someone with no earlier open notes asks nothing', async () => {
  const db = fakeSupabase({ ...seed(), jarvis_business_notes: [structuredClone(OLD)] });
  const r = await chat({ db, text: 'Dana called about a 2015 Civic, grinding brakes, maybe Monday', script: [claudeTool('capture_business_note', { raw_text: 'Dana called about a 2015 Civic, grinding brakes, maybe Monday', summary: 'Dana — 2015 Civic grinding brakes, maybe Monday', contact_name: 'Dana' }), claudeText('Saved.')] });
  assert.doesNotMatch(r.claudeRequests[1].messages.at(-1).content[0].content, /owner_question/); // the tool result itself
  assert.equal(r.context.pendingAction, undefined);
});

// ---- production regression: Postgres echoes timestamps in its own format --------
// PATCH … Prefer: return=representation returns resolved_at as "…59.4+00:00" for
// "…59.400Z". The old read-back compared text, so every close that actually
// succeeded was reported as "Close failed".
const pgTimestamp = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v)
  ? v.replace(/(\.\d*?)0+Z$/, '$1Z').replace(/\.Z$/, 'Z').replace(/Z$/, '+00:00') : v);
function postgresLike(db, { failIds = [] } = {}) {
  const orig = db.sbPatch;
  db.sbPatch = async (table, filter, fields) => {
    if (failIds.some(id => filter.includes(id))) throw new Error('simulated database error');
    return (await orig(table, filter, fields)).map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, pgTimestamp(v)])));
  };
  return db;
}
const RICHARD_OLDER = [
  { ...OLD, id: 'R1' },
  { id: 'R0', created_at: '2026-09-19T15:00:00Z', status: 'open', contact_name: 'Richard', summary: 'Richard waiting to hear about the Ranger parts', raw_text: 'Richard is waiting to hear about the Ranger parts.' },
];
const toolResultText = req => JSON.stringify(req.messages);

test('regression: "Richard confirmed Tuesday" → yes → every earlier note persists closed and is reported closed', async () => {
  const db = postgresLike(fakeSupabase({ ...seed(), jarvis_business_notes: structuredClone(RICHARD_OLDER) }));
  const first = await chat({ db, text: 'Richard confirmed Tuesday', script: [claudeTool('capture_business_note', { raw_text: 'Richard confirmed Tuesday', summary: 'Richard confirmed Tuesday', contact_name: 'Richard' }), claudeText('Saved. Richard has 2 earlier open notes. Close them?')] });
  assert.deepEqual([...first.context.pendingAction.input.note_ids].sort(), ['R0', 'R1']);

  const yes = await chat({ db, text: 'yes', context: first.context, script: [claudeText('Closed both earlier Richard notes.')] });
  const seen = toolResultText(yes.claudeRequests[0]);
  assert.match(seen, /Closed all 2 earlier notes \(verified in the database\)/);
  assert.doesNotMatch(seen, /not closed|Write not confirmed|still open/);
  assert.deepEqual(db.tables.jarvis_business_notes.filter(n => ['R0', 'R1'].includes(n.id)).map(n => n.status), ['resolved', 'resolved']);

  const waiting = await chat({ db, text: 'What am I waiting on?', script: [claudeTool('get_action_center', {}), claudeText('Nothing from Richard.')] });
  const queue = JSON.parse(waiting.claudeRequests[1].messages.at(-1).content[0].content);
  // (the fixture's separate Richard *job* with an unapproved estimate is still legitimately listed)
  assert.equal(queue.waiting_on.filter(w => w.type === 'owner_note' && /richard/i.test(w.who || '')).length, 0);
});

test('partial close is reported from the database, with the count', async () => {
  const db = postgresLike(fakeSupabase({ ...seed(), jarvis_business_notes: structuredClone(RICHARD_OLDER) }), { failIds: ['R0'] });
  const first = await chat({ db, text: 'Richard confirmed Tuesday', script: [claudeTool('capture_business_note', { raw_text: 'Richard confirmed Tuesday', summary: 'Richard confirmed Tuesday', contact_name: 'Richard' }), claudeText('Close them?')] });
  const yes = await chat({ db, text: 'yes', context: first.context, script: [claudeText('Closed 1 of 2.')] });
  assert.match(toolResultText(yes.claudeRequests[0]), /Closed 1 of 2 earlier notes; 1 is still open/);
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'R0').status, 'open');
});

test('verified writes accept Postgres timestamp formatting (paid_at, completed_at, resolved_at …)', async () => {
  const { patchVerified } = await import('../functions/_lib/business-data.js');
  const sent = '2026-09-28T16:35:59.400Z';
  const row = await patchVerified(async () => [{ id: 'X', resolved_at: '2026-09-28T16:35:59.4+00:00', status: 'resolved' }], 't', 'X', { status: 'resolved', resolved_at: sent });
  assert.equal(row.id, 'X');
  await assert.rejects(patchVerified(async () => [{ id: 'X', resolved_at: '2026-09-28T16:36:59.4+00:00' }], 't', 'X', { resolved_at: sent }), /read back different values/);
});
