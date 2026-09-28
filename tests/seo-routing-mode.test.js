// Blockers 2 & 3: SEO never hijacks normal business actions, and the Command
// Center leaves SEO Mode as soon as the conversation returns to business.
// Runs the real admin-ai-chat handler (scripted Claude, in-memory Supabase) and
// feeds its trusted ui_mode/ui_focus events into the real UI reducer.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { classifyFocusedIntent, classifyWithContext } from '../functions/_lib/jarvis-intent.js';
import { applyUiEvent, INITIAL_UI_MODE } from '../src/command-center/seo/uiMode.ts';
import { fakeSupabase, fakeFetch, claudeText, claudeTool } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const ENV = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
const SEO_TOOL = /seo|service_area|customer_geography|local_/;

async function turn(db, text, context, script) {
  const { fetchImpl, claudeRequests } = fakeFetch(db, script);
  globalThis.fetch = fetchImpl;
  const res = await onRequestPost({ request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal' }, body: JSON.stringify({ messages: [{ role: 'user', content: text }], context }) }), env: ENV });
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { events, context: events.find(e => e.type === 'context')?.context, tools: claudeRequests[0]?.tools.map(t => t.name) || [] };
}
const uiAfter = (state, events) => events.filter(e => e.type === 'ui_mode' || e.type === 'ui_focus').reduce(applyUiEvent, state);
const newDb = () => fakeSupabase({ ...seed(), seo_recommendations: [{ id: 'demand_gap:brakes', type: 'demand_gap', title: 'Local brake demand', status: 'open', score: 70 }], seo_preferences: [] });

// ---- Blocker 2: routing priority -------------------------------------------------------

test('explicit business commands keep their normal routes despite SEO words', () => {
  assert.equal(classifyFocusedIntent('Remind me to check competitors tomorrow'), 'reminders');
  for (const q of ['Log a call — customer asked about rankings', 'What keywords did Jill use in her lead form?', 'Send Jill the Google Maps link']) {
    assert.notEqual(classifyFocusedIntent(q), 'seo', q);
  }
  for (const q of ['How is my local SEO doing?', 'Who is my biggest competitor?', 'What changed in local search this week?', 'Are we getting traffic from outside the area?']) {
    assert.equal(classifyFocusedIntent(q), 'seo', q);
  }
});

test('follow-ups bind to an ACTIVE SEO entity, not merely the previous mode', () => {
  const active = { domain: 'seo', activeSeo: { tool: 'get_seo_opportunities' } };
  for (const q of ["accept Richard's estimate", 'mark the first one as contacted']) assert.notEqual(classifyWithContext(q, active), 'seo', q);
  for (const q of ['why?', 'show me the last 90 days', 'apply that recommendation', 'reject the second one']) assert.equal(classifyWithContext(q, active), 'seo', q);
  assert.notEqual(classifyWithContext('why?', { domain: 'seo' }), 'seo'); // stale domain alone can't capture it
});

test('end to end: after an SEO answer, business commands get business tools, not SEO tools', async () => {
  const db = newDb();
  const seo = await turn(db, 'What SEO opportunities do I have?', null, [claudeTool('get_seo_opportunities', {}), claudeText('1) Local brake demand')]);
  assert.ok(seo.context.activeSeo);
  const remind = await turn(db, 'Remind me to check competitors tomorrow', seo.context, [claudeText('Reminder set.')]);
  assert.ok(remind.tools.includes('create_reminder'));
  assert.ok(!remind.tools.some(t => SEO_TOOL.test(t)));
  const accept = await turn(db, "accept Richard's estimate", seo.context, [claudeText('ok')]);
  assert.ok(accept.tools.includes('get_customer_context'), accept.tools.join(','));
  const call = await turn(db, 'Log a call — customer asked about rankings', seo.context, [claudeText('ok')]);
  assert.ok(call.tools.includes('log_call'));
  // a genuine SEO follow-up still stays SEO
  const why = await turn(db, 'why?', seo.context, [claudeText('Because…')]);
  assert.ok(why.tools.length && why.tools.every(t => SEO_TOOL.test(t)), why.tools.join(','));
});

// ---- Blocker 3: SEO Mode exits automatically ----------------------------------------------

test('SEO overview → Action Center question returns to operations and clears SEO focus', async () => {
  const db = newDb();
  const a = await turn(db, 'How is my local SEO doing?', null, [claudeTool('get_seo_overview', {}), claudeText('Local visibility…')]);
  let ui = uiAfter(INITIAL_UI_MODE, a.events);
  assert.deepEqual(ui, { mode: 'seo', seoFocus: 'overview' });
  const b = await turn(db, 'What needs my attention?', a.context, [claudeText('Two things…')]);
  ui = uiAfter(ui, b.events);
  assert.deepEqual(ui, { mode: 'ops', seoFocus: 'overview' });
});

test('SEO query → Jill job question, SEO recommendation → reminder, SEO → revenue all return to operations', async () => {
  const cases = [
    ['Who is my biggest competitor?', [claudeTool('get_seo_competitors', {}), claudeText('…')], "What were Jill Castle's jobs about?", [claudeText('Jill had…')]],
    ['What SEO opportunities do I have?', [claudeTool('get_seo_opportunities', {}), claudeText('…')], 'Remind me in 2 minutes to test reminders.', [claudeText('Set.')]],
    ['Where do my customers come from?', [claudeTool('get_customer_geography', {}), claudeText('…')], 'What is my revenue this month?', [claudeTool('get_revenue_summary', { period: 'this_month' }), claudeText('$250.')]],
  ];
  for (const [seoQ, seoScript, bizQ, bizScript] of cases) {
    const db = newDb();
    const s = await turn(db, seoQ, null, seoScript);
    let ui = uiAfter(INITIAL_UI_MODE, s.events);
    assert.equal(ui.mode, 'seo', seoQ);
    assert.notEqual(ui.seoFocus, undefined);
    const b = await turn(db, bizQ, s.context, bizScript);
    ui = uiAfter(ui, b.events);
    assert.deepEqual(ui, { mode: 'ops', seoFocus: 'overview' }, bizQ);
    assert.equal(b.context.activeSeo, undefined, bizQ); // SEO context cleared too
  }
});

test('normal → SEO → normal', async () => {
  const db = newDb();
  const one = await turn(db, 'Who needs a lead follow-up?', null, [claudeTool('list_lead_followups', {}), claudeText('Dana and Mo.')]);
  let ui = uiAfter(INITIAL_UI_MODE, one.events);
  assert.equal(ui.mode, 'ops');
  const two = await turn(db, 'Is Williams in my service area?', one.context, [claudeTool('check_service_area', { location: 'Williams' }), claudeText('No.')]);
  ui = uiAfter(ui, two.events);
  assert.deepEqual(ui, { mode: 'seo', seoFocus: 'map' });
  const three = await turn(db, 'Why does each one need follow-up?', two.context, [claudeText('Dana was never contacted…')]);
  ui = uiAfter(ui, three.events);
  assert.equal(ui.mode, 'ops');
  // the business result set (leads) survived the SEO detour
  assert.ok(three.events.some(e => e.type === 'tool_call' && e.tool === 'get_result_set_details'));
});

test('manual sidebar switch still works and leaving SEO resets focus', () => {
  let ui = applyUiEvent(INITIAL_UI_MODE, { type: 'ui_focus', mode: 'seo', target: 'competitors' });
  assert.deepEqual(ui, { mode: 'seo', seoFocus: 'competitors' });
  ui = applyUiEvent(ui, { type: 'manual', mode: 'ops' });
  assert.deepEqual(ui, { mode: 'ops', seoFocus: 'overview' });
});
