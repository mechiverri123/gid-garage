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
