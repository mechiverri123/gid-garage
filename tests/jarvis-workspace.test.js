// Jarvis visual workspace: overlay state, on-screen commands, calendar words,
// and the exact day ranges the analytics overlay uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceReduce, parseLocalCommand, resolveCalendarWhen, describeScreen, INITIAL_WORKSPACE, workspaceTop } from '../shared/jarvis-workspace.js';
import { resolveDayRange, dayRangeWindow } from '../shared/business-metrics.js';
import { statusChangeFields } from '../shared/business-rules.js';

const run = (actions, s = INITIAL_WORKSPACE) => actions.reduce(workspaceReduce, s);
const three = { type: 'open', view: { type: 'jobs', jobIds: ['a', 'b', 'c'] } };
const META = [{ label: 'Full Synthetic Oil Change 2015 Acura TLX', date: '2026-09-21' }, { label: 'Transmission Diagnostic 2015 Acura TLX', date: '2026-09-24' }, { label: 'Front Brake & Transmission Service 2015 Acura TLX', date: '2026-09-26' }];
const cmd = (text, s, extra = {}) => parseLocalCommand(text, s, { meta: META, today: '2026-09-28', ...extra });

test('Jill workflow: three cards -> middle -> inspection -> payment -> close it -> close jobs', () => {
  let s = run([three]);
  assert.deepEqual(workspaceTop(s), { type: 'jobs', jobIds: ['a', 'b', 'c'], focus: 1, expanded: false, tab: 'overview', title: null, family: false });
  s = workspaceReduce(s, cmd('open the middle one', s));
  assert.equal(workspaceTop(s).focus, 1); assert.equal(workspaceTop(s).expanded, true);
  s = workspaceReduce(s, cmd('Show the inspection.', s));
  assert.equal(workspaceTop(s).tab, 'inspection');
  s = workspaceReduce(s, cmd('payment', s));
  assert.equal(workspaceTop(s).tab, 'payment');
  s = workspaceReduce(s, cmd('close it', s)); // back to the three cards
  assert.equal(workspaceTop(s).expanded, false); assert.equal(s.stack.length, 1);
  s = workspaceReduce(s, cmd('Jarvis close jobs', s));
  assert.deepEqual(s, INITIAL_WORKSPACE);
});

test('close words: one level vs everything', () => {
  const open = run([three, { type: 'focus', index: 2, expand: true }]);
  for (const t of ['close', 'close it', 'close that', 'go back', 'back', 'close the job']) assert.deepEqual(cmd(t, open), { type: 'close' }, t);
  for (const t of ['exit', 'Jarvis exit', 'close jobs', 'close all jobs', 'close everything', 'get rid of these', 'close these']) assert.deepEqual(cmd(t, open), { type: 'close_all' }, t);
  assert.deepEqual(cmd('back to Jarvis', open), { type: 'home' }); // closes everything AND leaves SEO mode
  assert.equal(cmd('close', INITIAL_WORKSPACE).type, 'noop');
});

test('picking a job by position, date or what it was', () => {
  const s = run([three]);
  assert.equal(cmd('open the first one', s).index, 0);
  assert.equal(cmd('the last one', s).index, 2);
  assert.equal(cmd('show the newest', s).index, 2);
  assert.equal(cmd('oldest', s).index, 0);
  assert.equal(cmd('open the brake one', s).index, 2);
  assert.equal(cmd('the brake one', s).index, 2);
  assert.equal(cmd('that oil change job', s).index, 0);
  assert.equal(cmd('open the oil change', s).index, 0);
  assert.equal(cmd('open the transmission one', s), null); // two match -> ask the AI with the screen context
  assert.equal(cmd('number 2', s).index, 1);
  assert.equal(cmd('what did jill pay for the brakes?', s), null); // a real question is not a screen command
});

test('focused tab words', () => {
  const s = run([three]);
  const tab = t => cmd(t, s)?.tab;
  assert.equal(tab('show diagnostic notes'), 'notes');
  assert.equal(tab('go to payment'), 'payment');
  assert.equal(tab('estimate'), 'estimate');
  assert.equal(tab('open parts'), 'parts');
  assert.equal(tab('show me the overview'), 'overview');
});

test('analytics follow-ups resolve exact day counts', () => {
  const s = run([{ type: 'open', view: { type: 'analytics', range: { period: 'this_month' } } }]);
  assert.deepEqual(cmd('show me the last 13 days', s), { type: 'range', range: { last_days: 13 } });
  assert.deepEqual(cmd('53 days', s), { type: 'range', range: { last_days: 53 } });
  assert.deepEqual(cmd('graph the past 7 days', s), { type: 'range', range: { last_days: 7 } });
  assert.deepEqual(cmd('last month', s), { type: 'range', range: { period: 'last_month' } });
  const now = new Date('2026-09-28T19:00:00Z');
  assert.deepEqual(resolveDayRange({ period: 'this_month' }, now), { from: '2026-09-01', to: '2026-09-28', days: 28, key: 'this_month' });
  assert.deepEqual(resolveDayRange({ last_days: 13 }, now), { from: '2026-09-16', to: '2026-09-28', days: 13, key: 'last_13_days' });
  assert.deepEqual(resolveDayRange({ last_days: 53 }, now), { from: '2026-08-07', to: '2026-09-28', days: 53, key: 'last_53_days' });
  assert.equal(resolveDayRange({ month: 'October' }, now).from, '2025-10-01'); // the most recent October
  assert.equal(resolveDayRange({ from: '2026-09-10', to: '2026-12-01' }, now).to, '2026-09-28'); // never into the future
  assert.throws(() => resolveDayRange({ from: '2026-09-20', to: '2026-09-10' }, now));
});

test('Arizona day window: 11:30 PM Phoenix on the 30th is still the 30th', () => {
  const w = dayRangeWindow('2026-09-01', '2026-09-30');
  assert.equal(w.inWindow('2026-10-01T06:30:00Z'), true); // 11:30 PM MST Sep 30
  assert.equal(w.inWindow('2026-10-01T07:30:00Z'), false); // 12:30 AM MST Oct 1
  assert.equal(w.days, 30);
});

test('calendar words (today is Monday 2026-09-28)', () => {
  assert.deepEqual(resolveCalendarWhen('tomorrow', '2026-09-28'), { date: '2026-09-29', mode: 'day' });
  assert.deepEqual(resolveCalendarWhen('friday', '2026-09-28'), { date: '2026-10-02', mode: 'day' });
  assert.deepEqual(resolveCalendarWhen('monday', '2026-09-28'), { date: '2026-09-28', mode: 'day' });
  assert.deepEqual(resolveCalendarWhen('next monday', '2026-09-28'), { date: '2026-10-05', mode: 'day' });
  assert.deepEqual(resolveCalendarWhen('next week', '2026-09-28'), { date: '2026-10-05', mode: 'week' });
  const cal = run([{ type: 'open', view: { type: 'calendar', date: '2026-09-28', mode: 'week' } }]);
  assert.deepEqual(cmd('what do I have friday', cal), { type: 'calendar', date: '2026-10-02', mode: 'day' });
  assert.deepEqual(cmd('month view', cal), { type: 'calendar', mode: 'month' });
});

test('a job opened from the calendar closes back to the calendar', () => {
  let s = run([{ type: 'open', view: { type: 'calendar', date: '2026-09-28', mode: 'week' } }, { type: 'open', view: { type: 'jobs', jobIds: ['x'] } }]);
  assert.equal(s.stack.length, 2);
  assert.equal(workspaceTop(s).expanded, true); // a single job opens straight to focus
  s = workspaceReduce(s, { type: 'close' });
  assert.equal(workspaceTop(s).type, 'calendar');
  // A new answer replaces the screen instead of piling up modals.
  s = workspaceReduce(s, { type: 'open', view: { type: 'analytics', range: { last_days: 7 } } });
  assert.deepEqual(s.stack.map(v => v.type), ['analytics']);
});

test('bad views from the backend are ignored', () => {
  assert.deepEqual(workspaceReduce(INITIAL_WORKSPACE, { type: 'open', view: { type: 'jobs', jobIds: [] } }), INITIAL_WORKSPACE);
  assert.deepEqual(workspaceReduce(INITIAL_WORKSPACE, { type: 'open', view: { type: 'admin' } }), INITIAL_WORKSPACE);
  assert.equal(workspaceTop(workspaceReduce(INITIAL_WORKSPACE, { type: 'open', view: { type: 'jobs', jobIds: ['a', 'b'], tab: 'nope', focus: 9 } })).focus, 1);
});

test('screen description gives the model real ids and positions', () => {
  const d = describeScreen(run([three]), META);
  assert.equal(d.focusedJobId, 'b');
  assert.deepEqual(d.jobs.map(j => [j.position, j.id]), [[1, 'a'], [2, 'b'], [3, 'c']]);
  assert.equal(describeScreen(INITIAL_WORKSPACE), null);
});

test('status clicks write the same fields in admin and Jarvis', () => {
  assert.deepEqual(statusChangeFields('BOOKED', 'IN_PROGRESS'), { job_status: 'IN_PROGRESS' });
  assert.deepEqual(statusChangeFields('BOOKED', 'CANCELLED'), { job_status: 'CANCELLED', status: 'cancelled' });
  assert.deepEqual(statusChangeFields('CANCELLED', 'BOOKED'), { job_status: 'BOOKED', status: 'confirmed' });
});

// ---- backend: the chart and the spoken answer use the same numbers --------------
import { createBusinessOps } from '../functions/_lib/business-data.js';

const ROWS = [
  { id: 'j1', fname: 'Jill', lname: 'Castle', vehicle: '2015 Acura TLX', date: '2026-09-21', job_status: 'PAID', status: 'completed', paid_at: '2026-09-21T20:00:00Z', amount_paid: 111.39, invoice_amount: 102, tax_amount: 9.39, parts_cost: 40, payments: [{ amount: 111.39, at: '2026-09-21T20:00:00Z', method: 'Card' }], line_items: [{ label: 'Full Synthetic Oil', amount: 102, type: 'fixed' }] },
  { id: 'j2', fname: 'Jill', lname: 'Castle', vehicle: '2015 Acura TLX', date: '2026-09-26', job_status: 'PAID', status: 'completed', paid_at: '2026-09-27T06:30:00Z', amount_paid: 771.37, invoice_amount: 705.19, tax_amount: 66.18, parts_cost: 210, payments: [], line_items: [{ label: 'Front Pads', amount: 300, type: 'parts' }] },
  { id: 'j3', fname: 'Bo', lname: 'Lee', vehicle: '2012 F-150', date: '2026-08-02', job_status: 'PAID', status: 'completed', paid_at: '2026-08-02T18:00:00Z', amount_paid: 50, invoice_amount: 46, tax_amount: 4, payments: [{ amount: 50, at: '2026-08-02T18:00:00Z' }] },
  { id: 'j4', fname: 'Al', lname: 'Ray', vehicle: '2019 Civic', date: '2026-09-25', job_status: 'INVOICED', status: 'confirmed', invoice_amount: 200, tax_amount: 18.77, amount_paid: 0, payments: [] },
];
const fakeOps = () => createBusinessOps({
  sbGet: async (table, params) => {
    if (table !== 'bookings') return [];
    if (params.id?.startsWith('in.(')) { const ids = params.id.slice(4, -1).split(','); return ROWS.filter(r => ids.includes(r.id)); }
    return ROWS;
  },
  sbPatch: () => { throw new Error('read only'); },
  now: () => new Date('2026-09-28T19:00:00Z'),
});

test('show_revenue (this month) equals get_revenue_summary (this month)', async () => {
  const ops = fakeOps();
  const r = await ops.revenueRange({ period: 'this_month' });
  const s = await ops.revenueSummary({ period: 'this_month' });
  assert.equal(`$${r.collected.toFixed(2)}`, s.grossCollected);
  assert.equal(`$${r.netProfit.toFixed(2)}`, s.netProfit);
  assert.equal(r.collected, 882.76); // paid-invoice fallback for j2 counted on Sep 26 in Arizona
  assert.equal(r.series.length, 28);
  assert.equal(r.series.find(d => d.date === '2026-09-26').collected, 771.37);
  assert.equal(r.jobsPaid, 2);
  assert.deepEqual(r.outstanding, { count: 1, total: 218.77 });
  assert.equal(r.previous.from, '2026-08-04'); // the 28 days before Sep 1
});

test('show_jobs lays cards out oldest to newest, newest N kept', async () => {
  const ops = fakeOps();
  const v = await ops.jobsForView({ job_ids: ['j2', 'j1', 'j3'], count: 2 });
  assert.deepEqual(v.jobs.map(j => j.id), ['j1', 'j2']);
  assert.equal(v.jobs[1].total, 771.37);
  const nf = await ops.jobsForView({ job_ids: ['j2', 'j1'], newest_first: true });
  assert.deepEqual(nf.jobs.map(j => j.id), ['j2', 'j1']);
});

// ---- chat and voice open the same views (functions/_lib/jarvis-screen.js) -------
import { runScreenTool } from '../functions/_lib/jarvis-screen.js';

test('screen tools: same actions for chat and voice', async () => {
  const ops = fakeOps();
  const jobs = await runScreenTool('show_jobs', { job_ids: ['j2', 'j1'], tab: 'inspection' }, { ops, today: '2026-09-28' });
  assert.deepEqual(jobs.__ui, [{ type: 'open', view: { type: 'jobs', jobIds: ['j1', 'j2'], tab: 'inspection', focus: undefined, title: null } }]);
  assert.equal(jobs.say, 'The inspection, sir.');
  const cal = await runScreenTool('show_calendar', { when: 'friday' }, { ops, today: '2026-09-28' });
  assert.deepEqual(cal.__ui[0].view, { type: 'calendar', date: '2026-10-02', mode: 'day' });
  const rev = await runScreenTool('show_revenue', { last_days: 13 }, { ops, today: '2026-09-28' });
  assert.deepEqual(rev.__ui[0].view.range, { from: '2026-09-16', to: '2026-09-28', key: 'last_13_days' });
  assert.equal(rev.__ui[0].data.collected, rev.collected); // the chart gets the numbers Jarvis quotes
  assert.equal('series' in rev, false); // the model sees facts, not 13 rows of chart data
  const ctl = await runScreenTool('control_screen', { action: 'tab', position: 2, tab: 'payment' }, { ops, today: '2026-09-28', screen: { jobs: [{ id: 'a' }, { id: 'b' }] } });
  assert.deepEqual(ctl.__ui, [{ type: 'focus', index: 1, expand: true }, { type: 'tab', tab: 'payment' }]);
  const none = await runScreenTool('control_screen', { action: 'close' }, { ops, today: '2026-09-28' });
  assert.equal(none.ok, false);
  assert.equal(workspaceTop(workspaceReduce(INITIAL_WORKSPACE, { type: 'open', view: { type: 'settings' } })).type, 'settings');
});

test('natural phrasing: filler, dates, synonyms (owner-reported cases)', () => {
  const s = run([three]);
  assert.deepEqual(cmd('back to overview', s), { type: 'tab', tab: 'overview' });
  assert.deepEqual(cmd('go back to the overview', s), { type: 'tab', tab: 'overview' });
  assert.deepEqual(cmd('take me to the payment tab', s), { type: 'tab', tab: 'payment' });
  assert.deepEqual(cmd('can you show me the inspection', s), { type: 'tab', tab: 'inspection' });
  assert.equal(cmd('pull up the sep 26 job', s).index, 2);
  assert.equal(cmd('open September 21st', s).index, 0);
  assert.equal(cmd('the 24th', s).index, 1);
  assert.equal(cmd('9/26', s).index, 2);
  assert.equal(cmd('pull up the brake job', s).index, 2);
  assert.equal(cmd('the diagnostic one', s).index, 1); // a job, not the Inspection tab
  assert.deepEqual(cmd('diagnostics', s), { type: 'tab', tab: 'inspection' });
  assert.equal(cmd('pull up the oct 3 job', s), null); // no such date on screen -> Jarvis decides
  assert.deepEqual(cmd('go back', s), { type: 'close' });
});

test('spoken screen follow-ups the parser misses go to Jarvis; other topics do not', async () => {
  const { isScreenFollowUp } = await import('../shared/jarvis-workspace.js');
  const s = run([three]);
  assert.equal(isScreenFollowUp('pull up the one with the new rotors', s), true);
  assert.equal(isScreenFollowUp("what's my revenue this month", s), false);
  assert.equal(isScreenFollowUp('remind me tomorrow to order pads', s), false);
  assert.equal(isScreenFollowUp('pull up the one with the new rotors', INITIAL_WORKSPACE), false); // nothing open
});

test('jobs list and calendar: same spoken/typed switching as the job tabs', () => {
  const L = run([{ type: 'open', view: { type: 'jobList', status: 'active' } }]);
  assert.deepEqual(cmd('all', L), { type: 'filter', status: 'all' });
  assert.deepEqual(cmd('show all jobs', L), { type: 'filter', status: 'all' });
  assert.deepEqual(cmd('the paid ones', L), { type: 'filter', status: 'PAID' });
  assert.deepEqual(cmd('back to active', L), { type: 'filter', status: 'active' });
  assert.deepEqual(cmd('unpaid', L), { type: 'filter', status: 'unpaid' });
  assert.deepEqual(cmd('missing parts', L), { type: 'filter', status: 'noParts' });
  assert.deepEqual(cmd('show me in progress', L), { type: 'filter', status: 'IN_PROGRESS' });
  assert.deepEqual(cmd('find Jill', L), { type: 'filter', query: 'jill' });
  assert.deepEqual(cmd('clear search', L), { type: 'filter', query: '' });
  assert.equal(workspaceTop(workspaceReduce(L, cmd('all', L))).status, 'all');
  const Cal = run([{ type: 'open', view: { type: 'calendar', date: '2026-09-28', mode: 'week' } }]);
  assert.deepEqual(cmd('month', Cal), { type: 'calendar', mode: 'month' });
  assert.deepEqual(cmd('switch to day', Cal), { type: 'calendar', mode: 'day' });
});

// ---- one voice/text grammar everywhere (owner-reported: list -> Jill -> "September 26th") ---------
import { jobFamily, spokenYmd } from '../shared/jarvis-workspace.js';

const LIST = [
  { id: 'j1', customerId: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '239-233-0993', date: '2026-09-21', status: 'completed', jobStatus: 'PAID' },
  { id: 'j2', customerId: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '239-233-0993', date: '2026-09-24', status: 'completed', jobStatus: 'PAID' },
  { id: 'j3', customerId: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '239-233-0993', date: '2026-09-26', status: 'completed', jobStatus: 'PAID' },
  { id: 'x1', customerId: 'c-other', fname: 'Jill', lname: 'Castle', phone: '480-000-0000', date: '2026-09-25', status: 'confirmed', jobStatus: 'BOOKED' }, // different file, same name
  { id: 'x2', customerId: null, fname: 'Jill', lname: '', phone: '', date: '2026-09-22' },
  { id: 'x3', customerId: 'c-jill', fname: 'Jill', lname: 'Castle', date: '2026-09-23', status: 'cancelled', jobStatus: 'CANCELLED' },
];

test("a job opened from a list widens to that customer's jobs, then 'September 26th' / 'job 3' work", () => {
  assert.deepEqual(jobFamily(LIST, 'j2'), ['j1', 'j2', 'j3']); // same customer file, cancelled left out, namesakes never mixed in
  assert.deepEqual(jobFamily(LIST, 'x2'), ['x2']); // first name only: never guessed
  let s = run([{ type: 'open', view: { type: 'jobList', status: 'all' } }, { type: 'open', view: { type: 'jobs', jobIds: ['j2'] } }]);
  s = workspaceReduce(s, { type: 'context', forId: 'j2', jobIds: jobFamily(LIST, 'j2'), title: 'Jill Castle' });
  assert.deepEqual(workspaceTop(s), { type: 'jobs', jobIds: ['j1', 'j2', 'j3'], focus: 1, expanded: true, tab: 'overview', title: 'Jill Castle', family: true });
  const meta = [{ label: 'Oil Change Jill Castle', date: '2026-09-21' }, { label: 'Diagnostic Fee Jill Castle', date: '2026-09-24' }, { label: 'Front Rotor Pads Jill Castle', date: '2026-09-26' }];
  const say = q => parseLocalCommand(q, s, { meta, today: '2026-09-28' });
  for (const q of ['September 26th', 'septembet 26th', 'september twenty sixth', 'the twenty sixth', 'the 26th', '9/26', 'job 3', 'job three', 'job number three', 'number 3', 'the last one', 'next', "Jill's brake job"]) {
    const a = say(q);
    assert.ok(a && (a.type === 'step' || a.index === 2), `${q} -> ${JSON.stringify(a)}`);
  }
  assert.deepEqual(say("the brake job's payment"), { type: 'focus', index: 2, expand: true, tab: 'payment' });
  assert.deepEqual(say('september 26th inspection'), { type: 'focus', index: 2, expand: true, tab: 'inspection' });
  // A stale widen (the owner already moved on) is ignored.
  assert.equal(workspaceReduce(s, { type: 'context', forId: 'j2', jobIds: ['j9'] }), s);
  // Closing goes back to the list, like Esc.
  assert.equal(workspaceTop(workspaceReduce(workspaceReduce(s, { type: 'close' }), { type: 'close' })).type, 'jobList');
});

test('spoken numbers, periods and dates on the revenue chart and calendar', () => {
  const A = run([{ type: 'open', view: { type: 'analytics', range: { period: 'this_month' } } }]);
  const rev = q => cmd(q, A)?.range;
  assert.deepEqual(rev('two weeks'), { last_days: 14 });
  assert.deepEqual(rev('the last thirteen days'), { last_days: 13 });
  assert.deepEqual(rev('a week'), { last_days: 7 });
  assert.deepEqual(rev('three months'), { last_months: 3 });
  assert.deepEqual(rev('since september 10th'), { from: '2026-09-10' });
  assert.deepEqual(rev('from sep 1 to sep 15'), { from: '2026-09-01', to: '2026-09-15' });
  assert.deepEqual(rev('what about august'), { month: 'august' });
  assert.deepEqual(rev('year to date'), { period: 'this_year' });
  assert.deepEqual(resolveDayRange({ last_months: 3 }, new Date('2026-09-28T19:00:00Z')), { from: '2026-06-29', to: '2026-09-28', days: 92, key: 'last_3_months' });
  const Cal = run([{ type: 'open', view: { type: 'calendar', date: '2026-09-28', mode: 'week' } }]);
  const cal = q => cmd(q, Cal);
  assert.deepEqual(cal('october 3rd'), { type: 'calendar', date: '2026-10-03', mode: 'day' });
  assert.deepEqual(cal('the 3rd'), { type: 'calendar', date: '2026-10-03', mode: 'day' }); // next 3rd, not last
  assert.deepEqual(cal('next'), { type: 'calendar', date: '2026-10-05' }); // a week forward in week view
  assert.deepEqual(cal("what's on friday"), { type: 'calendar', date: '2026-10-02', mode: 'day' });
  assert.deepEqual(cal('november'), { type: 'calendar', date: '2026-11-01', mode: 'month' });
  assert.equal(spokenYmd('the 30th', '2026-09-28', 'past'), '2026-08-30');
});

test('more natural tab and close words', () => {
  const s = run([three]);
  assert.deepEqual(cmd('show me the photos', s), { type: 'tab', tab: 'notes' });
  assert.deepEqual(cmd('scan report', s), { type: 'tab', tab: 'inspection' });
  assert.deepEqual(cmd('the receipts', s), { type: 'tab', tab: 'parts' });
  assert.deepEqual(cmd('what about the balance', s), { type: 'tab', tab: 'payment' });
  for (const q of ["I'm done", "that's all"]) assert.deepEqual(cmd(q, s), { type: 'close_all' }, q);
  for (const q of ['go home', 'take me home']) assert.deepEqual(cmd(q, s), { type: 'home' }, q);
});

test('voice follow-ups for every open view reach Jarvis; new topics stay with the voice agent', async () => {
  const { isScreenFollowUp } = await import('../shared/jarvis-workspace.js');
  const A = run([{ type: 'open', view: { type: 'analytics', range: { period: 'this_month' } } }]);
  const Cal = run([{ type: 'open', view: { type: 'calendar', date: '2026-09-28', mode: 'week' } }]);
  const L = run([{ type: 'open', view: { type: 'jobList', status: 'active' } }]);
  assert.equal(isScreenFollowUp('compare that to the week before', A), true);
  assert.equal(isScreenFollowUp('what about the afternoon of the 3rd', Cal), true);
  assert.equal(isScreenFollowUp('only the ones that are signed', L), true);
  assert.equal(isScreenFollowUp('remind me to call Jill', L), false);
});

test('global voice/typed commands need no AI: modes and main screens, from anywhere', () => {
  const none = INITIAL_WORKSPACE;
  for (const q of ['switch to SEO', 'SEO mode', 'open the SEO dashboard', 'go to local search']) assert.deepEqual(cmd(q, none), { type: 'mode', mode: 'seo' }, q);
  for (const q of ['go back to Jarvis', 'back to Jarvis', 'Jarvis dashboard', 'go home', 'main screen']) assert.deepEqual(cmd(q, none), { type: 'home' }, q);
  assert.deepEqual(cmd('open calendar', none), { type: 'open', view: { type: 'calendar', mode: 'week' } });
  assert.deepEqual(cmd('show me my schedule', none), { type: 'open', view: { type: 'calendar', mode: 'week' } });
  assert.deepEqual(cmd('pull up all jobs', none), { type: 'open', view: { type: 'jobList', status: 'all' } });
  assert.deepEqual(cmd('open customers', run([three])), { type: 'open', view: { type: 'customers' } });
  assert.deepEqual(cmd('new job', none), { type: 'open', view: { type: 'newJob' } });
  for (const q of ['parts checklist', 'show me the parts checklist', 'jobs missing parts cost', 'which jobs are missing parts', 'unrecorded parts costs', 'open parts cost checklist'])
    assert.deepEqual(cmd(q, none), { type: 'open', view: { type: 'jobList', status: 'noParts' } }, q);
  // Real questions still go to Jarvis.
  assert.equal(cmd('show bookings this week', none), null);
  assert.equal(cmd("pull up Jill's jobs", none), null);
  assert.equal(cmd('how is my SEO doing', none), null);
});
