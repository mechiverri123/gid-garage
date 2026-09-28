// Linking owner notes to customer records by id. Guarantees under test:
// only jarvis_business_notes is ever written; links need strong evidence;
// everything still works before the migration adds the columns.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOps } from '../functions/_lib/business-data.js';
import { noteMatch } from '../shared/job-context.js';
import { latestNotePerContact } from '../shared/business-rules.js';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const CUSTOMERS = [
  { id: 'c-richard', fname: 'Richard', lname: 'Lee', phone: '(928) 555-0144' },
  { id: 'c-mike-a', fname: 'Mike', lname: 'Brown', phone: '928-555-0101' },
  { id: 'c-mike-b', fname: 'Mike', lname: 'Brown', phone: '928-555-0102' }, // two customers, same name
  { id: 'c-dana', fname: 'Dana', lname: 'Cruz', phone: '928-555-0177' },
];
const BOOKINGS = [{ id: 'GID-1', customer_id: 'c-richard' }, { id: 'GID-2', customer_id: 'c-dana' }];
const opsFor = db => createBusinessOps({ sbGet: db.sbGet, sbPatch: db.sbPatch, sbInsert: db.sbInsert });

test('links only on strong evidence: unique full name or phone; never first name only or an ambiguous name', async () => {
  const ops = opsFor(fakeSupabase({ customers: CUSTOMERS, bookings: BOOKINGS }));
  assert.deepEqual((await ops.noteLinkFor({ contact_name: 'Richard Lee' })).link, { linked: true, by: 'full_name', customer: 'Richard Lee' });
  assert.equal((await ops.noteLinkFor({ contact_name: 'richard  lee' })).customer_id, 'c-richard'); // case/spacing
  assert.deepEqual((await ops.noteLinkFor({ contact_name: 'Richard' })).link, { linked: false, reason: 'first_name_only' });
  assert.deepEqual((await ops.noteLinkFor({ contact_name: 'Mike Brown' })).link, { linked: false, reason: 'ambiguous_full_name' });
  assert.equal((await ops.noteLinkFor({ contact_name: 'Mike', phone: '928.555.0102' })).customer_id, 'c-mike-b'); // phone disambiguates
  assert.deepEqual((await ops.noteLinkFor({ contact_name: 'Zed Nobody' })).link, { linked: false, reason: 'no_customer_with_that_name' });
});

test('a job id links only when it does not contradict the customer', async () => {
  const ops = opsFor(fakeSupabase({ customers: CUSTOMERS, bookings: BOOKINGS }));
  assert.equal((await ops.noteLinkFor({ contact_name: 'Richard Lee', job_id: 'GID-1' })).booking_id, 'GID-1');
  assert.equal((await ops.noteLinkFor({ contact_name: 'Richard Lee', job_id: 'GID-2' })).booking_id, null); // Dana's job
  assert.equal((await ops.noteLinkFor({ contact_name: 'Richard Lee', job_id: 'GID-404' })).booking_id, null);
});

test('backfill dry run writes nothing; apply writes ONLY customer_id on jarvis_business_notes', async () => {
  const db = fakeSupabase({
    customers: CUSTOMERS, bookings: BOOKINGS,
    jarvis_business_notes: [
      { id: 'n1', created_at: '2026-09-01T00:00:00Z', contact_name: 'Richard Lee', status: 'open', customer_id: null },
      { id: 'n2', created_at: '2026-09-02T00:00:00Z', contact_name: 'Richard', status: 'open', customer_id: null },
      { id: 'n3', created_at: '2026-09-03T00:00:00Z', contact_name: 'Mike Brown', status: 'resolved', customer_id: null },
      { id: 'n4', created_at: '2026-09-04T00:00:00Z', contact_name: 'Dana Cruz', status: 'open', customer_id: 'c-dana' }, // already linked
    ],
  });
  const ops = opsFor(db);
  const plan = await ops.planNoteLinks();
  assert.deepEqual(plan.map(p => [p.note_id, p.linked, p.customer_id]), [['n1', true, 'c-richard'], ['n2', false, null], ['n3', false, null]]);
  assert.deepEqual(db.writes, []); // dry run: zero writes

  const results = await ops.applyNoteLinks(plan);
  assert.deepEqual(results, [{ note_id: 'n1', ok: true }]);
  assert.deepEqual(db.writes.map(w => [w.op, w.table, Object.keys(w.fields)]), [['patch', 'jarvis_business_notes', ['customer_id']]]);
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'n1').customer_id, 'c-richard');
  assert.equal(db.tables.jarvis_business_notes.find(n => n.id === 'n2').customer_id, null);
  assert.deepEqual(db.tables.customers, CUSTOMERS); // untouched
});

test('a note linked to one customer never attaches to a different customer with the same name', () => {
  const note = { customer_id: 'c-mike-a', contact_name: 'Mike Brown', raw_text: 'Mike Brown wants brakes' };
  assert.equal(noteMatch(note, { customerId: 'c-mike-a', name: 'Mike Brown', phone: '' }), 'linked');
  assert.equal(noteMatch(note, { customerId: 'c-mike-b', name: 'Mike Brown', phone: '' }), null);
  assert.equal(noteMatch({ contact_name: 'Mike Brown' }, { customerId: 'c-mike-b', name: 'Mike Brown', phone: '' }), 'full_name'); // unlinked: unchanged behaviour
});

test('"waiting on" keeps two same-name customers apart once their notes are linked', () => {
  const groups = latestNotePerContact([
    { id: 'a', created_at: '2026-09-01', status: 'open', contact_name: 'Mike Brown', customer_id: 'c-mike-a' },
    { id: 'b', created_at: '2026-09-02', status: 'open', contact_name: 'Mike Brown', customer_id: 'c-mike-b' },
    { id: 'c', created_at: '2026-09-03', status: 'open', contact_name: 'Mike Brown', customer_id: 'c-mike-a' },
  ]);
  assert.deepEqual(groups.map(g => [g.note.id, g.earlier.map(e => e.id)]).sort(), [['b', []], ['c', ['a']]]);
});

// ---- live capture, before and after the migration -----------------------------------

const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
async function chat(db, text, script) {
  const { fetchImpl } = fakeFetch(db, script);
  globalThis.fetch = fetchImpl;
  const res = await onRequestPost({ request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }] }) }), env: ENV });
  return (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
}
const capture = input => [claudeTool('capture_business_note', { raw_text: input.summary, ...input }), claudeText('Saved.')];

test('after the migration: a new note about Richard Lee is saved linked to his customer record — and nothing else is written', async () => {
  const db = fakeSupabase({ ...seed(), customers: CUSTOMERS, jarvis_business_notes: [] });
  await chat(db, 'Richard Lee called, wants his Ranger brakes done maybe Friday', capture({ summary: 'Richard Lee — Ranger brakes, maybe Friday', contact_name: 'Richard Lee', preferred_timing: 'maybe Friday' }));
  const note = db.tables.jarvis_business_notes.at(-1);
  assert.equal(note.customer_id, 'c-richard');
  assert.deepEqual([...new Set(db.writes.map(w => w.table))], ['jarvis_business_notes']);
});

test('before the migration (no link columns yet): the note still saves exactly as before', async () => {
  const db = fakeSupabase({ ...seed(), customers: CUSTOMERS, jarvis_business_notes: [] });
  const insert = db.sbInsert;
  db.sbInsert = async (t, row) => {
    if (t === 'jarvis_business_notes' && ('customer_id' in row || 'booking_id' in row)) throw new Error('{"code":"PGRST204","message":"Could not find the \'customer_id\' column of \'jarvis_business_notes\' in the schema cache"}');
    return insert(t, row);
  };
  const events = await chat(db, 'Richard Lee called, wants his Ranger brakes done maybe Friday', capture({ summary: 'Richard Lee — Ranger brakes, maybe Friday', contact_name: 'Richard Lee' }));
  assert.equal(db.tables.jarvis_business_notes.length, 1);
  assert.equal(db.tables.jarvis_business_notes[0].customer_id, undefined);
  assert.equal(events.find(e => e.type === 'final').text, 'Saved.');
  assert.ok(!events.some(e => e.type === 'error'));
});

test('dry run also works before the migration (every note treated as unlinked, still no writes)', async () => {
  const db = fakeSupabase({ customers: CUSTOMERS, bookings: BOOKINGS, jarvis_business_notes: [{ id: 'n1', created_at: '2026-09-01T00:00:00Z', contact_name: 'Richard Lee', status: 'open' }] });
  const get = db.sbGet;
  db.sbGet = async (t, params) => {
    if (t === 'jarvis_business_notes' && JSON.stringify(params).includes('customer_id')) throw new Error('{"code":"42703","message":"column jarvis_business_notes.customer_id does not exist"}');
    return get(t, params);
  };
  const plan = await opsFor(db).planNoteLinks();
  assert.deepEqual(plan.map(p => [p.note_id, p.customer_id]), [['n1', 'c-richard']]);
  assert.deepEqual(db.writes, []);
});
