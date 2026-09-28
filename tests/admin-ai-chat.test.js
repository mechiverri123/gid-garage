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

// ---- 4th pass: remaining Telegram issues ---------------------------------------

const lastToolResult = req => JSON.parse(req.messages.at(-1).content[0].content);

test('P1: "Sergei — what was his job about?", "Summarize Sergei Butaev\'s job history." and "findings on his Ram?" share one booking and its photo evidence', async () => {
  const about = await chat({ messages: [{ role: 'user', content: 'Sergei — what was his job actually about?' }], script: [claudeText('Sergei\'s Ram was checked for P2509…')] });
  const aboutCtx = lastToolResult(about.claudeRequests[0]);
  assert.equal(aboutCtx.status, 'resolved');
  const aboutJob = aboutCtx.jobsChronological.find(j => j.id === 'S1');
  assert.ok(aboutJob.photoNotes.some(n => n.includes('P2509')));

  // Same conversation, and also cold (no context) — both must resolve the same booking.
  for (const context of [about.context, null]) {
    const hist = await chat({ db: about.db, context, messages: [{ role: 'user', content: "Summarize Sergei Butaev's job history." }], script: [claudeText('Sergei has one job…')] });
    const histCtx = lastToolResult(hist.claudeRequests[0]);
    assert.equal(histCtx.status, 'resolved', `context=${!!context}`);
    const histJob = histCtx.jobsChronological.find(j => j.id === 'S1');
    assert.ok(histJob, 'history must include booking S1');
    assert.deepEqual(histJob.photoNotes, aboutJob.photoNotes);
    assert.deepEqual(histJob.scanDocuments, aboutJob.scanDocuments);
  }

  // Sergei's Ram booking is active -> that exact booking is re-read (diagnosis facet keeps photo notes).
  const findings = await chat({ db: about.db, context: about.context, messages: [{ role: 'user', content: 'What were the actual findings on his Ram?' }], script: [claudeText('Both batteries good…')] });
  assert.deepEqual(findings.calls, ['get_job_detail']);
  const detail = lastToolResult(findings.claudeRequests[0]);
  assert.equal(detail.id, 'S1');
  assert.ok(detail.photoNotes.some(n => n.includes('P2509')));
  assert.ok(detail.photoNotes.some(n => n.includes('AC condensation')));
  assert.equal(findings.context.activeBookingId, 'S1');

  // Only the person is active (e.g. after a history summary) -> his Ram jobs, same evidence.
  const personOnly = await chat({ db: about.db, context: { customer: { name: 'Sergei Butaev' } }, messages: [{ role: 'user', content: 'What were the actual findings on his Ram?' }], script: [claudeText('Both batteries good…')] });
  assert.deepEqual(personOnly.calls, ['get_vehicle_jobs']);
  const ram = lastToolResult(personOnly.claudeRequests[0]);
  assert.deepEqual(ram.jobs.map(j => j.id), ['S1']);
  assert.deepEqual(ram.jobs[0].photoNotes, detail.photoNotes);
});

test('P2: cancelling an already-cancelled job changes nothing and cannot be reported as a new cancellation', async () => {
  const db = fakeSupabase(seed());
  Object.assign(db.tables.bookings.find(b => b.id === 'R1'), { job_status: 'CANCELLED', status: 'cancelled' });
  db.tables.jarvis_business_notes.push({ id: 'NC', created_at: '2026-09-27T18:00:00Z', raw_text: 'Job R1 cancelled via Jarvis. Reason: customer cancelled', status: 'resolved' });
  const ctx = { customer: { name: 'Richard Lee' }, activeBookingId: 'R1', vehicle: '2011 Ford Ranger' };
  const honest = await chat({ db, context: ctx, messages: [{ role: 'user', content: 'Cancel his job because customer cancelled' }],
    script: [claudeTool('cancel_job', { job_id: 'R1', reason: 'customer cancelled' }), claudeText("Richard's job was already cancelled (reason: customer cancelled) — nothing changed.")] });
  const result = JSON.parse(honest.claudeRequests.at(-1).messages.at(-1).content[0].content);
  assert.deepEqual([result.ok, result.changed, result.already_cancelled, result.existing_reason], [true, false, true, 'customer cancelled']);
  assert.equal(honest.guarded, false);
  assert.equal(honest.context.pendingAction, undefined); // no confirmation step
  assert.equal(db.writes.length, 0);

  const lying = await chat({ db, context: ctx, messages: [{ role: 'user', content: 'Cancel his job because customer cancelled' }],
    script: [claudeTool('cancel_job', { job_id: 'R1', confirmed: true }), claudeText("Done — I've cancelled Richard's job.")] });
  assert.equal(lying.guarded, true);
  assert.equal(db.writes.length, 0);
});

test('P3: a command naming a nonexistent job id replaces stale Richard context and reports only that failure', async () => {
  const r = await chat({
    messages: [
      { role: 'user', content: "What's the cancellation note on Richard's job?" },
      { role: 'assistant', content: "The cancellation note on Richard's job is 'customer cancelled'." },
      { role: 'user', content: 'Cancel job ID fake-test-id because customer cancelled.' },
    ],
    context: { customer: { name: 'Richard Lee' }, activeBookingId: 'R1', vehicle: '2011 Ford Ranger' },
    script: [claudeText('There is no job with id fake-test-id — nothing was changed.')],
  });
  assert.deepEqual(r.calls, ['get_job_detail']);
  const req = r.claudeRequests[0];
  assert.doesNotMatch(allText(req), /Richard|\bR1\b|Ranger/);
  assert.match(allText(req), /No job found with that id/);
  assert.equal(r.context.activeBookingId, null);
  assert.equal(r.context.customer, null);
});

test('P4: focused job facts only reach the model as that fact', async () => {
  const ctx = { customer: { name: 'Jill Castle', customerId: 'c-jill' }, activeBookingId: 'J2', vehicle: '2017 Acura RDX' };
  const ask = async q => lastToolResult((await chat({ context: ctx, messages: [{ role: 'user', content: q }], script: [claudeText('ok')] })).claudeRequests[0]);

  const diag = JSON.stringify(await ask("What did we diagnose on Jill's last job?"));
  assert.match(diag, /P0562/);
  assert.match(diag, /recommend alternator replacement/);
  assert.doesNotMatch(diag, /84,950|81,200|mileage|5J8TB4H59HL000123|estimateTotal/);

  const miles = JSON.stringify(await ask("What was the mileage on Jill's last visit?"));
  assert.match(miles, /84,950/);
  assert.doesNotMatch(miles, /P0562|Alternator output|5J8TB4H59HL000123|estimateTotal/);

  const vin = JSON.stringify(await ask("What VIN do we have for Jill Castle's Acura?"));
  assert.match(vin, /5J8TB4H59HL000123/);
  assert.doesNotMatch(vin, /84,950|P0562|estimateTotal/);

  const est = await chat({ messages: [{ role: 'user', content: "What is Richard's Ford Ranger estimate total?" }], script: [claudeText('ok')] });
  const estText = JSON.stringify(lastToolResult(est.claudeRequests[0]));
  assert.match(estText, /"estimateTotal":409\.11/);
  assert.doesNotMatch(estText, /water pump|88 Elm/);
});

test('P5: a take-home question gets only take-home — no this-month net profit', async () => {
  const r = await chat({
    messages: [
      { role: 'user', content: 'What is my net profit this month?' },
      { role: 'assistant', content: 'Net profit this month is $250.00.' },
      { role: 'user', content: 'How much can I realistically take home from the last 30 days?' },
    ],
    script: [claudeTool('get_owner_pay_summary', { period: 'last_30_days' }), claudeText('About $X take-home over the last 30 days.')],
  });
  const req = r.claudeRequests[0];
  assert.deepEqual(req.tools.map(t => t.name), ['get_owner_pay_summary']);
  assert.equal(req.messages.length, 1);
  assert.doesNotMatch(allText(req), /net profit this month|\$250\.00/i);
  assert.deepEqual(r.calls, ['get_owner_pay_summary']);
});

// ---- SEO / local growth through Jarvis -------------------------------------------------

test('SEO: a local-search question gets only SEO tools, no chat history, and moves the UI to the matching panel', async () => {
  const db = fakeSupabase({ ...seed(), seo_recommendations: [], seo_provider_status: [] });
  const r = await chat({
    db,
    messages: [
      { role: 'user', content: 'What notes do I have about Lisa?' },
      { role: 'assistant', content: 'One open note on Lisa.' },
      { role: 'user', content: 'Who is my biggest local competitor?' },
    ],
    script: [claudeTool('get_seo_competitors', {}), claudeText('No local competitors are tracked yet.')],
  });
  const req = r.claudeRequests[0];
  assert.equal(req.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(req.messages), /Lisa/);
  assert.ok(req.tools.every(t => /seo|service_area|customer_geography|local_/.test(t.name)), req.tools.map(t => t.name).join(','));
  assert.deepEqual(r.events.filter(e => e.type === 'ui_focus').map(e => [e.mode, e.target]), [['seo', 'competitors']]);
});

test('SEO: "reject the second one" uses the ids from the recommendations just shown and is verified', async () => {
  const recs = [
    { id: 'ctr_opportunity:mobile-mechanic-flagstaff', type: 'ctr_opportunity', title: 'Win more clicks for "mobile mechanic flagstaff"', status: 'open', score: 80 },
    { id: 'demand_gap:battery', type: 'demand_gap', title: 'Local demand for battery / no-start', status: 'open', score: 70 },
  ];
  const db = fakeSupabase({ ...seed(), seo_recommendations: recs, seo_preferences: [] });
  const shown = await chat({ db, messages: [{ role: 'user', content: 'What SEO opportunities do I have?' }], script: [claudeTool('get_seo_opportunities', {}), claudeText('1) CTR… 2) battery gap')] });
  assert.equal(shown.context.domain, 'seo');
  assert.ok(shown.context.activeSeo);
  // SEO recommendations get their own slot; the business result set is untouched.
  assert.deepEqual(shown.context.seoResultSet.items.map(i => i.id), recs.map(x => x.id));
  assert.equal(shown.context.resultSet, undefined);

  const rej = await chat({ db, context: shown.context, messages: [{ role: 'user', content: 'reject the second one' }],
    script: [claudeTool('update_seo_recommendation', { id: 'demand_gap:battery', action: 'reject', reason: 'not now' }), claudeText("Rejected — I won't suggest the battery gap again for 90 days.")] });
  assert.match(JSON.stringify(rej.claudeRequests[0].messages), /2\) Local demand for battery \/ no-start \[id demand_gap:battery\]/);
  assert.equal(rej.guarded, false);
  assert.equal(db.tables.seo_recommendations.find(x => x.id === 'demand_gap:battery').status, 'rejected');
  assert.equal(db.tables.seo_preferences[0].key, 'demand_gap:battery');
});

test('SEO: service-area eligibility is decided by code, not the model', async () => {
  const r = await chat({ messages: [{ role: 'user', content: 'Is Williams in my service area?' }], script: [claudeTool('check_service_area', { location: 'Williams, AZ' }), claudeText('No — about 31 miles out.')] });
  const result = JSON.parse(r.claudeRequests[1].messages.at(-1).content[0].content);
  assert.deepEqual([result.inside, result.requiresExpansionDecision], [false, true]);
  assert.deepEqual(r.events.filter(e => e.type === 'ui_focus').map(e => e.target), ['map']);
});
