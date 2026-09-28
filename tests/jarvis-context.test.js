// Conversation-state rules: explicit names beat stale context, "that"/"each
// one"/"yes" resolve to record ids from the previous turn, and success can
// only be claimed after a successful write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn, updateContext, guardFinalText, extractExplicitSubjects, claimsWriteSuccess } from '../functions/_lib/jarvis-context.js';
import { classifyFocusedIntent } from '../functions/_lib/jarvis-intent.js';

const plan = (text, ctx) => planTurn(text, ctx, classifyFocusedIntent(text));
const JILL_CTX = { customer: { name: 'Jill Castle', customerId: 'c-jill' }, activeBookingId: 'J2', vehicle: '2017 Acura RDX', resultSet: { type: 'jobs', items: [{ id: 'J1', label: 'x' }, { id: 'J2', label: 'y' }] } };

test('2: "what vehicle was that on?" re-reads the anchored booking, not chat memory', () => {
  const p = plan('What vehicle was that on?', JILL_CTX);
  assert.equal(p.mode, 'booking');
  assert.deepEqual(p.prefetch, { tool: 'get_job_detail', input: { job_id: 'J2' } });
  for (const q of ['What mileage was it?', 'What did she pay?', 'What did we diagnose on that job?']) {
    assert.equal(plan(q, JILL_CTX).prefetch?.input?.job_id, 'J2', q);
  }
  assert.equal(plan('What was her last visit?', JILL_CTX).prefetch.tool, 'get_customer_context');
});

test('2: a reference with no active record asks instead of guessing', () => {
  const p = plan('What vehicle was that on?', {});
  assert.equal(p.mode, 'unresolved');
  assert.equal(p.prefetch, undefined);
  assert.match(p.instruction, /Ask one short question/);
});

test('5: an explicit new name replaces stale Ranger/Red/Jill context', () => {
  const stale = { customer: { name: 'Sean Webb' }, activeBookingId: 'SW1', vehicle: '2008 Ford Ranger' };
  const p = plan('Sergei what was his job actually about', stale);
  assert.equal(p.mode, 'explicit');
  assert.equal(p.clearEntities, true);
  assert.deepEqual(p.prefetch, { tool: 'get_customer_context', input: { query: 'Sergei' } });
  assert.match(p.instruction, /no longer applies/);
  const next = updateContext(stale, [{ name: 'get_customer_context', ok: true, input: { query: 'Sergei' }, result: { status: 'resolved', customer: { name: 'Sergei Butaev' }, lastVisitJobId: 'S1', jobsChronological: [{ id: 'S1', vehicle: '2024 Ram 3500 Turbo Diesel' }] } }], { plan: p });
  assert.equal(next.activeBookingId, 'S1');
  assert.equal(next.customer.name, 'Sergei Butaev');
});

test('5/6: "What did Red come in for?" looks Red up; "the last Ranger job" searches Rangers unless one is active', () => {
  assert.deepEqual(plan('What did Red come in for?', JILL_CTX).prefetch, { tool: 'get_customer_context', input: { query: 'Red' } });
  assert.deepEqual(plan('What was the last Ranger job about?', { customer: { name: 'Red' }, activeBookingId: 'RD1', vehicle: '2021 Chevrolet Blazer' }).prefetch,
    { tool: 'get_vehicle_jobs', input: { vehicle: 'ranger' } });
  assert.deepEqual(plan('What was the Ranger estimate?', { activeBookingId: 'R1', vehicle: '2011 Ford Ranger' }).prefetch,
    { tool: 'get_job_detail', input: { job_id: 'R1' } });
});

test('5: "each one" means the previous lead list', () => {
  const ctx = updateContext({ customer: { name: 'Lisa' } }, [{ name: 'list_lead_followups', ok: true, input: {}, result: [{ id: 'L3', fname: 'Dana', lname: 'Ortiz' }, { id: 'L4', fname: 'Mo', lname: 'Khan' }] }]);
  const p = plan('Why does each one need follow-up?', ctx);
  assert.equal(p.mode, 'result_set');
  assert.deepEqual(p.prefetch, { tool: 'get_result_set_details', input: { type: 'leads', ids: ['L3', 'L4'] } });
  assert.match(p.instruction, /Dana Ortiz; Mo Khan/);
  assert.doesNotMatch(p.instruction, /Lisa/);
});

test('12: a revenue question is self-contained — no history, no stale subject', () => {
  const p = plan('What is my revenue this month?', { customer: { name: 'Lisa' }, resultSet: { type: 'notes', items: [{ id: 'N2', label: 'Lisa' }] } });
  assert.equal(p.mode, 'self_contained');
  assert.equal(p.keepHistory, false);
  assert.equal(p.prefetch, undefined);
});

test('9: a plain "yes" executes the pending confirmation deterministically; "no" drops it', () => {
  const ctx = updateContext({}, [{ name: 'cancel_job', ok: true, input: { job_id: 'R1', reason: 'customer cancelled' }, result: { needs_confirmation: true, summary: 'Cancel…' } }]);
  assert.deepEqual(ctx.pendingAction, { tool: 'cancel_job', input: { job_id: 'R1', reason: 'customer cancelled', confirmed: false } });
  assert.deepEqual(plan('yes', ctx).prefetch, { tool: 'cancel_job', input: { job_id: 'R1', reason: 'customer cancelled', confirmed: true } });
  assert.equal(plan('no', ctx).mode, 'declined');
  assert.equal(updateContext(ctx, []).pendingAction, undefined); // only valid for the very next message
});

test('explicit subject extraction handles phone-typed messages', () => {
  assert.deepEqual(extractExplicitSubjects('What Vin Do we have for jill castles acura'), { names: ['jill castle'], vehicles: ['acura'], years: [] });
  assert.deepEqual(extractExplicitSubjects('cancel richards job').names, ['richard']);
  assert.deepEqual(extractExplicitSubjects('What vehicle was that on?').names, []);
  assert.deepEqual(extractExplicitSubjects('Why does each one need follow-up?').names, []);
});

// ---- Bug 10: success claims -----------------------------------------------------

const RICHARD_LIE = 'Done — job status updated and cancellation noted. Richard\'s water pump job is off the books for today.';

test('10: "Done" with no write this turn is replaced', () => {
  assert.equal(claimsWriteSuccess(RICHARD_LIE), true);
  const g = guardFinalText(RICHARD_LIE, [{ name: 'get_customer_context', ok: true, result: { status: 'resolved' } }]);
  assert.equal(g.overridden, true);
  assert.match(g.text, /^Nothing was changed/);
  assert.doesNotMatch(g.text, /Done/);
});

test('10: a thrown or ok:false write cannot be reported as done', () => {
  const thrown = guardFinalText('Done — cancelled.', [{ name: 'cancel_job', ok: false, error: 'No job found with that id.', result: { ok: false, error: 'No job found with that id.' } }]);
  assert.match(thrown.text, /Nothing was changed.*No job found/);
  const notOk = guardFinalText("I've updated the status.", [{ name: 'update_job_status', ok: true, result: { ok: false, error: 'rejected' } }]);
  assert.equal(notOk.overridden, true);
  const pending = guardFinalText("I've cancelled it.", [{ name: 'cancel_job', ok: true, result: { needs_confirmation: true, summary: 'Cancel Richard Lee\'s job.' } }]);
  assert.match(pending.text, /Cancel Richard Lee's job\. Reply yes to confirm/);
});

test('10: real successes and plain read answers pass through', () => {
  const ok = guardFinalText("Done — Richard's job is cancelled.", [{ name: 'cancel_job', ok: true, result: { ok: true, verified: true } }]);
  assert.equal(ok.overridden, false);
  for (const t of ["Richard's Ranger job is CANCELLED.", 'Jill had three jobs; the latest was completed and invoiced.', 'Revenue this month is $4,414.02.']) {
    assert.equal(guardFinalText(t, []).overridden, false, t);
  }
});

test('4: note-history questions search notes first; person follow-ups use the all-domain lookup', () => {
  assert.deepEqual(plan('What did I last say about Lisa?', JILL_CTX).prefetch, { tool: 'list_business_notes', input: { query: 'Lisa', scope: 'all' } });
  assert.deepEqual(plan('What notes do I have about Lisa?', {}).prefetch, { tool: 'list_business_notes', input: { query: 'Lisa', scope: 'all' } });
  assert.deepEqual(plan('Is there anything I need to follow up with Lisa about?', {}).prefetch, { tool: 'get_customer_context', input: { query: 'Lisa' } });
});
