import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFocusedIntent, isLikelyNaturalBusinessNote, INTENT_TOOL_NAMES } from '../functions/_lib/jarvis-intent.js';

const route = text => (isLikelyNaturalBusinessNote(text) ? 'note' : classifyFocusedIntent(text));
const tools = text => INTENT_TOOL_NAMES[route(text)] || [];

test('customer/job depth questions route to rich retrieval, not shallow list_jobs', () => {
  for (const q of [
    "What were Jill Castle's jobs about?",
    'What did we actually do on Jill\'s last job?',
    'Summarize Jill Castle\'s service history.',
    "What were the scope notes on Jill's latest job?",
    'What was the customer\'s complaint?',
    'What did we diagnose?',
    'Were there any unresolved recommendations?',
    'What did we do on her last visit?',
    'Why did Richard bring the Ranger in?',
    'What did I tell Lisa?',
    'What is the next action for Richard?',
    'Why was that quote so high?',
  ]) {
    assert.equal(route(q), 'customer_history', q);
    assert.ok(tools(q).includes('get_customer_context'), q);
    assert.ok(!tools(q).includes('list_jobs'), q);
  }
});

test('money routes keep revenue and take-home apart', () => {
  assert.equal(route('What is my revenue this month?'), 'money');
  assert.equal(route('What is my net profit this month?'), 'money');
  assert.equal(route('What is my take-home for the last 30 days?'), 'money');
  assert.ok(tools('What is my revenue this month?').includes('get_revenue_summary'));
  assert.ok(!tools('What is my revenue this month?').includes('get_business_summary'));
});

test('focused operational routes', () => {
  assert.equal(route('Who needs a lead follow-up?'), 'leads');
  assert.equal(route('Remind me in 2 minutes to test reminders.'), 'reminders');
  assert.deepEqual(tools('Remind me in 2 minutes to test reminders.').filter(t => !/reminder/.test(t)), []);
  assert.equal(route('Brief me.'), 'briefing');
  assert.equal(route('What does tomorrow look like?'), 'briefing');
  assert.equal(route('What needs my attention?'), 'action_center');
  assert.equal(route('What am I waiting on?'), 'waiting_on');
  assert.equal(route('Who should I contact next?'), 'waiting_on');
  assert.equal(route("What's blocking tomorrow?"), 'waiting_on');
  assert.equal(route('Who owes me money?'), 'unpaid');
  assert.deepEqual(tools('Any unpaid invoices?'), ['get_unpaid_jobs', 'get_customer_context']);
  assert.equal(route('Run a data health check'), 'data_health');
  assert.equal(route('What notes do I have about Lisa?'), 'notes');
});

test('owner notes are captured, including tentative waiting-on statements', () => {
  assert.equal(route("Richard's Ranger estimate is sent, waiting on him to confirm Tuesday."), 'note');
  assert.equal(route('Jake called, 2013 F150, grinding front brakes, maybe Friday, quoted 350.'), 'note');
  assert.equal(route('Lisa might want an oil change sometime next week.'), 'note');
  // A payment instruction is a command, not a note, and reaches the payment tool.
  assert.equal(route('Record $200 cash on Jill\'s job'), 'jobs');
  assert.ok(tools('Record $200 cash on Jill\'s job').includes('mark_job_paid'));
});
