// Feed panels: Google reviews ("3 new in the past 7 days"), Facebook/Instagram
// overnight changes, Zoho Mail (O'Reilly parts emails), the spoken daily brief,
// the request grammar that opens them, and the free "Jarvis" wake word.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pollMetaLeads, newLeadAlert, messengerFeed, sendMessenger, conversationForLead, messagesLine, leadsLine, newReviewCount, reviewsFeed, socialDeltas, snapshotBefore, briefLine, reviewsLine, mailLine, htmlToText, isPartsEmail, connectZoho, mailFeed, feedStatus } from '../functions/_lib/jarvis-feeds.js';
import { parsePanelRequest, workspaceReduce, INITIAL_WORKSPACE } from '../shared/jarvis-workspace.js';
import { matchFastPath } from '../functions/_lib/jarvis-fastpath.js';
import { afterWakeWord } from '../shared/voice-text.js';
import { onRequestPost } from '../functions/admin-ai-chat.js';
import { fakeSupabase, fakeFetch } from './fake-supabase.js';
import { seed } from './fixtures.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// In-memory R2 bucket.
function fakeBucket(init = {}) {
  const store = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    store,
    get: async k => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null),
    put: async (k, v) => { store.set(k, v); },
  };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const NOW = Date.parse('2026-09-28T16:00:00Z'); // 9 a.m. Arizona
const daysAgo = n => new Date(NOW - n * 86400_000).toISOString();

test('new reviews in 7 days: timestamps, or the total-count history when more than 5 arrived', () => {
  const reviews = [{ time: daysAgo(1) }, { time: daysAgo(3) }, { time: daysAgo(6.5) }, { time: daysAgo(8) }, { time: daysAgo(40) }];
  assert.equal(newReviewCount(reviews, 22, {}, NOW, '2026-09-28'), 3);
  // A week ago the total was 14 -> 8 new, more than the 5 Google returns.
  assert.equal(newReviewCount(reviews, 22, { '2026-09-20': 13, '2026-09-21': 14, '2026-09-27': 21 }, NOW, '2026-09-28'), 8);
  assert.equal(newReviewCount([], 22, {}, NOW, '2026-09-28'), 0);
});

test('reviews feed: newest-first Places call, cached, history recorded, review links', async () => {
  const bucket = fakeBucket();
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    assert.match(String(url), /reviews_sort=newest/);
    return jsonRes({ status: 'OK', result: { rating: 5, user_ratings_total: 22, url: 'https://maps.google.com/?cid=1', reviews: [
      { author_name: 'Jill', rating: 5, text: 'Great', relative_time_description: 'a day ago', time: Math.floor((NOW - 86400_000) / 1000) },
      { author_name: 'Bob', rating: 5, text: 'Fast', relative_time_description: 'a month ago', time: Math.floor((NOW - 30 * 86400_000) / 1000) },
    ] } });
  };
  const env = { GOOGLE_PLACES_API_KEY: 'k', GOOGLE_PLACE_ID: 'ChIJx' };
  const r = await reviewsFeed({ env, bucket, now: NOW, fetchImpl });
  assert.deepEqual([r.connected, r.rating, r.total, r.new7, r.reviews[0].author], [true, 5, 22, 1, 'Jill']);
  assert.match(r.writeReviewUrl, /writereview\?placeid=ChIJx/);
  await reviewsFeed({ env, bucket, now: NOW + 60_000, fetchImpl });
  assert.equal(calls, 1, 'second read within 3 h comes from the R2 cache');
  const hist = JSON.parse(bucket.store.get('private/jarvis-feed-history.json'));
  assert.equal(hist.reviews['2026-09-28'], 22);
  assert.equal(reviewsLine(r), '5 stars across 22 reviews, sir. One new one this past week.');
  assert.equal((await reviewsFeed({ env: {}, bucket, now: NOW })).connected, false);
});

test('social: overnight changes compare with the latest earlier snapshot', () => {
  const series = { '2026-09-26': { fbFollowers: 100 }, '2026-09-27': { fbFollowers: 104, igFollowers: 50, igPostLikes: 30 }, '2026-09-28': { fbFollowers: 107 } };
  const prev = snapshotBefore(series, '2026-09-28');
  assert.equal(prev.date, '2026-09-27');
  const d = socialDeltas({ fbFollowers: 107, igFollowers: 53, igPostLikes: 42, fbPageLikes: null, fbPostReactions: 5 }, prev);
  assert.deepEqual([d.since, d.fbFollowers, d.igFollowers, d.igPostLikes, d.fbPageLikes, d.fbPostReactions], ['2026-09-27', 3, 3, 12, null, null]);
  assert.equal(socialDeltas({ fbFollowers: 1 }, null), null);
});

test('mail: HTML becomes plain text, O\'Reilly emails are flagged', () => {
  assert.equal(htmlToText('<p>Hi&nbsp;Mike,</p><script>alert(1)</script><div>Order <b>#123</b> ready</div>'), 'Hi Mike,\nOrder #123 ready');
  assert.equal(isPartsEmail({ from: 'orders@oreillyauto.com', fromName: '', subject: 'Receipt' }), true);
  assert.equal(isPartsEmail({ from: 'x@y.com', fromName: "O'Reilly Auto Parts", subject: '' }), true);
  assert.equal(isPartsEmail({ from: 'jill@gmail.com', fromName: 'Jill', subject: 'Brakes' }), false);
});

test('zoho: finds the data center, stores the refresh token privately, reads the inbox', async () => {
  const bucket = fakeBucket();
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); seen.push(u);
    if (u.startsWith('https://accounts.zoho.com/')) return jsonRes({ error: 'invalid_code' });
    if (u.startsWith('https://accounts.zoho.eu/oauth/v2/token')) return jsonRes({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
    if (u === 'https://mail.zoho.eu/api/accounts') { assert.equal(init.headers.Authorization, 'Zoho-oauthtoken at'); return jsonRes({ data: [{ accountId: '77', primaryEmailAddress: 'mike@gidgarage.com' }] }); }
    if (u.includes('/api/accounts/77/messages/view') && u.includes('status=unread')) return jsonRes({ data: [{ messageId: '2' }] });
    if (u.includes('/api/accounts/77/messages/view')) return jsonRes({ data: [
      { messageId: '1', folderId: '9', subject: 'Hello', sender: 'Jill', fromAddress: 'jill@x.com', receivedTime: String(NOW - 3600_000), summary: 'hi' },
      { messageId: '2', folderId: '9', subject: 'Your order receipt', sender: "O'Reilly Auto Parts", fromAddress: 'noreply@oreillyauto.com', receivedTime: String(NOW - 7200_000), summary: 'pads' },
    ] });
    throw new Error(`unexpected ${u}`);
  };
  const out = await connectZoho({ bucket, clientId: 'cid', clientSecret: 'sec', code: '1000.abc', now: NOW, fetchImpl });
  assert.deepEqual(out, { connected: true, email: 'mike@gidgarage.com' });
  const conn = JSON.parse(bucket.store.get('private/jarvis-connections.json'));
  assert.deepEqual([conn.zoho.dc, conn.zoho.refreshToken, conn.zoho.accountId], ['eu', 'rt', '77']);
  const status = await feedStatus({ env: {}, bucket });
  assert.equal(JSON.stringify(status).includes('rt'), false, 'status never exposes tokens');
  const mail = await mailFeed({ bucket, now: NOW, fetchImpl });
  assert.deepEqual([mail.unreadCount, mail.last24, mail.partsEmails.length, mail.messages[1].unread], [1, 2, 1, true]);
  assert.equal(mailLine(mail), "One unread email, one from O'Reilly, sir.");
  await assert.rejects(connectZoho({ bucket, clientId: 'c', clientSecret: 's', code: '', fetchImpl }), /all needed/);
});

test('brief line: short, facts only, skips what isn\'t connected', () => {
  const b = {
    business: { todayJobs: [{ customer: 'Jill Smith', time: '09:30' }, { customer: 'Bob Ray', time: '13:00' }], tomorrowJobs: [], leadsNeedingAttention: [{}], unpaid: [], remindersNeedingAttention: [] },
    weather: { today: { summary: 'Sunny', highF: 71.4 } },
    reviews: { connected: true, new7: 3, rating: 5 },
    social: { connected: true, changes: { fbPostReactions: 4, igPostLikes: 8, fbFollowers: 2, igFollowers: 0 } },
    mail: { connected: false }, ads: { connected: false },
  };
  assert.equal(briefLine(b, 8), "Good morning, sir. Two jobs today, the first at 9:30 a.m. with Jill. Sunny, high of 71. One lead to follow up. You've had three new reviews in the past week, holding at 5 stars. Overnight: 12 new likes and two new followers.");
  assert.equal(briefLine({ business: {}, reviews: { connected: false } }, 18), 'Good evening, sir. The schedule is clear today.');
});

test('panel requests: brief, reviews, social, email — and nothing else', () => {
  const p = t => parsePanelRequest(t)?.panel ?? null;
  assert.equal(p('Jarvis, brief me'), 'brief');
  assert.equal(p('good morning jarvis'), 'brief');
  assert.equal(p('show me my reviews'), 'reviews');
  assert.equal(p('any new reviews?'), 'reviews');
  assert.equal(p("what's our google rating"), 'reviews');
  assert.equal(p('pull up my facebook'), 'social');
  assert.equal(p('any new followers overnight'), 'social');
  assert.equal(p('check my email'), 'mail');
  assert.equal(p("did I get an O'Reilly order"), 'mail');
  for (const t of ['revenue this month', 'email Jill her invoice', 'show me the calendar', 'reviews for the brake page seo', "Jill's jobs"]) assert.equal(p(t), null, t);
  assert.deepEqual(matchFastPath('brief me', '2026-09-28'), { tool: 'show_panel', input: { panel: 'brief' } });
});

test('workspace: whatever the brief opens stacks, so close returns to the brief', () => {
  let s = workspaceReduce(INITIAL_WORKSPACE, { type: 'open', view: { type: 'brief' } });
  s = workspaceReduce(s, { type: 'open', view: { type: 'mail', open: '123' } });
  assert.deepEqual(s.stack.map(v => v.type), ['brief', 'mail']);
  assert.equal(s.stack[1].open, '123');
  s = workspaceReduce(s, { type: 'close' });
  assert.deepEqual(s.stack.map(v => v.type), ['brief']);
  s = workspaceReduce(s, { type: 'open', view: { type: 'reviews' } });
  s = workspaceReduce(s, { type: 'open', view: { type: 'social' } });
  assert.deepEqual(s.stack.map(v => v.type), ['brief', 'social'], 'panels opened from a panel replace it');
});

test('wake word: the command after "Jarvis", empty alone, null without it', () => {
  assert.equal(afterWakeWord('Jarvis, brief me'), 'brief me');
  assert.equal(afterWakeWord("hey jarvis what's on tomorrow"), "what's on tomorrow");
  assert.equal(afterWakeWord('Jarvis.'), '');
  assert.equal(afterWakeWord('jervis show me my reviews'), 'show me my reviews');
  assert.equal(afterWakeWord('turn on the lights'), null);
});

test('"brief me" on /jarvis: visual brief + spoken line, no Claude call; Telegram unchanged', async () => {
  const db = fakeSupabase(seed());
  const { fetchImpl, claudeRequests } = fakeFetch(db, []);
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/jarvis_ai_usage')) return jsonRes([]);
    if (u.pathname.endsWith('/rpc/jarvis_add_usage')) return new Response(null, { status: 204 });
    return fetchImpl(url, init);
  };
  const env = { ANTHROPIC_API_KEY: 'test', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', TELEGRAM_WEBHOOK_SECRET: 'internal' };
  const res = await onRequestPost({
    request: new Request('https://x/admin-ai-chat', { method: 'POST', headers: { 'X-GID-Internal-Jarvis': 'internal', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Jarvis, brief me' }], ui: { enabled: true, screen: null }, voice: true, stream: true }) }),
    env,
  });
  const events = (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.equal(claudeRequests.length, 0);
  const ui = events.find(e => e.type === 'ui')?.action;
  assert.equal(ui.view.type, 'brief');
  assert.ok(ui.data.business, 'the panel gets the same data the line was built from');
  const final = events.find(e => e.type === 'final').text;
  assert.match(final, /^Good (morning|afternoon|evening), sir\./);
  assert.deepEqual(events.filter(e => e.type === 'say').map(e => e.text), [final]);
});

test('lead forms: first run backfills quietly, later leads alert once, duplicates skipped', async () => {
  const bucket = fakeBucket({ 'private/jarvis-connections.json': { meta: { pageId: 'P1', pageToken: 'pt' } } });
  const leads = [];
  const sbGet = async (_t, p) => { const ids = p.external_lead_id.replace(/^in\.\(|\)$/g, '').split(','); return leads.filter(l => ids.includes(l.external_lead_id)); };
  const sbInsert = async (_t, row) => { leads.push(row); return row; };
  let meta = [{ id: 'L1', created_time: daysAgo(2), form_id: 'F1', campaign_name: 'Brakes Sept', field_data: [{ name: 'full_name', values: ['Allison Taylor'] }, { name: 'phone_number', values: ['9285551234'] }, { name: 'what_service', values: ['Brake change'] }] }];
  const fetchImpl = async url => {
    const u = String(url);
    assert.match(u, /access_token=pt/);
    if (u.includes('/P1/leadgen_forms')) return jsonRes({ data: [{ id: 'F1', name: 'Quote form', status: 'ACTIVE' }, { id: 'F0', status: 'ARCHIVED' }] });
    if (u.includes('/F1/leads')) { assert.match(decodeURIComponent(u), /"time_created","operator":"GREATER_THAN"/); return jsonRes({ data: meta }); }
    throw new Error(`unexpected ${u}`);
  };
  const first = await pollMetaLeads({ env: {}, bucket, sbGet, sbInsert, now: NOW, fetchImpl });
  assert.deepEqual(first.imported.map(l => [l.external_lead_id, l.fresh, l.source, l.fname]), [['L1', false, 'meta_ads', 'Allison']]);
  meta = [...meta, { id: 'L2', created_time: daysAgo(0.01), form_id: 'F1', field_data: [{ name: 'full_name', values: ['Rick Moe'] }, { name: 'email', values: ['r@x.com'] }] }];
  const second = await pollMetaLeads({ env: {}, bucket, sbGet, sbInsert, now: NOW + 300_000, fetchImpl });
  assert.deepEqual(second.imported.map(l => [l.external_lead_id, l.fresh]), [['L2', true]], 'L1 is not imported twice');
  assert.equal(leads.length, 2);
  assert.equal(newLeadAlert(leads[0]), "New Facebook lead, sir: Allison Taylor — brakes · 9285551234. It's in your leads.");
  // A permission problem is recorded for the panel, and nothing is written.
  const bad = async () => jsonRes({ error: { message: '(#200) Requires leads_retrieval permission' } }, 403);
  await assert.rejects(pollMetaLeads({ env: {}, bucket, sbGet, sbInsert, now: NOW + 600_000, fetchImpl: bad }), /leads_retrieval/);
  assert.match(JSON.parse(bucket.store.get('private/jarvis-meta-leads.json')).lastError, /leads_retrieval/);
  assert.equal((await pollMetaLeads({ env: {}, bucket: fakeBucket(), sbGet, sbInsert, fetchImpl })).connected, false);
});

test('messenger: inbox read, exact-name lead match, lines', async () => {
  const bucket = fakeBucket({ 'private/jarvis-connections.json': { meta: { pageId: 'P1', pageToken: 'pt' } } });
  const fetchImpl = async url => {
    assert.match(String(url), /\/P1\/conversations\?.*platform=messenger/);
    return jsonRes({ data: [
      { id: 't_1', updated_time: daysAgo(0.1), unread_count: 1, link: '/GID/inbox/1', participants: { data: [{ id: '555', name: 'Emma Yazzie' }, { id: 'P1', name: 'GID Garage' }] }, messages: { data: [{ message: 'Is Friday ok?', from: { id: '555' }, created_time: daysAgo(0.1) }] } },
      { id: 't_2', updated_time: daysAgo(3), unread_count: 0, participants: { data: [{ id: '777', name: 'Bob Ray' }, { id: 'P1' }] }, messages: { data: [{ message: 'Thanks', from: { id: 'P1' } }] } },
    ] });
  };
  const f = await messengerFeed({ env: {}, bucket, now: NOW, fetchImpl });
  assert.deepEqual(f.conversations.map(c => [c.psid, c.name, c.unread, c.lastFromPage]), [['555', 'Emma Yazzie', 1, false], ['777', 'Bob Ray', 0, true]]);
  assert.equal(f.conversations[0].link, 'https://www.facebook.com/GID/inbox/1');
  assert.equal(messagesLine(f), 'One unread conversation, sir — the latest from Emma Yazzie.');
  assert.equal(conversationForLead({ fname: 'Emma', lname: 'Yazzie' }, f.conversations).psid, '555');
  assert.equal(conversationForLead({ fname: 'Emma', lname: '' }, f.conversations), null, 'first name alone never matches');
  assert.equal(leadsLine([{ status: 'new', fname: 'Emma', lname: 'Yazzie' }, { status: 'new', fname: 'Trace', lname: 'D' }, { status: 'booked' }]), 'Two new leads, sir — the newest is Emma Yazzie.');
  assert.equal(parsePanelRequest('show me my leads').panel, 'leads');
  assert.equal(parsePanelRequest('any facebook messages').panel, 'messages');
});

test('messenger send: refuses without both confirmations, replies as the page, marks the lead contacted', async () => {
  const bucket = fakeBucket({ 'private/jarvis-connections.json': { meta: { pageId: 'P1', pageToken: 'pt' } } });
  const posts = [];
  const patches = [];
  const sbGet = async () => [{ id: 'L1', status: 'new', notes: 'Issue answer: squeal' }];
  const sbPatch = async (_t, filter, fields) => { patches.push([filter, fields]); return [{}]; };
  const ok = async (url, init) => { posts.push({ url: String(url), init, body: JSON.parse(init.body) }); return jsonRes({ message_id: 'm1' }); };
  assert.equal((await sendMessenger({ env: {}, bucket, psid: '555', text: 'Hi', reviewed: true, confirmed: false, fetchImpl: ok })).needs_confirmation, true);
  assert.equal(posts.length, 0, 'nothing sent without the second confirmation');
  const r = await sendMessenger({ env: {}, bucket, psid: '555', text: 'Hi Emma', reviewed: true, confirmed: true, leadId: 'L1', sbGet, sbPatch, now: NOW, fetchImpl: ok });
  assert.deepEqual([r.ok, r.leadStatus], [true, 'contacted']);
  assert.equal(posts[0].init.method, 'POST');
  assert.match(posts[0].url, /\/P1\/messages\?access_token=pt/);
  assert.deepEqual(posts[0].body, { recipient: { id: '555' }, message: { text: 'Hi Emma' }, messaging_type: 'RESPONSE' });
  assert.equal(patches[0][1].status, 'contacted');
  assert.match(patches[0][1].notes, /squeal\nMessaged on Messenger 2026-09-28/);
  // Outside 24 h: tries the human-agent tag, then explains plainly.
  const tries = [];
  const late = async (url, init) => { const b = JSON.parse(init.body); tries.push(b.messaging_type); return jsonRes({ error: { message: '(#10) This message is sent outside of allowed window.' } }, 400); };
  await assert.rejects(sendMessenger({ env: {}, bucket, psid: '555', text: 'Hi', reviewed: true, confirmed: true, fetchImpl: late }), /within 24 hours.*nothing was sent/);
  assert.deepEqual(tries, ['RESPONSE', 'MESSAGE_TAG']);
  await assert.rejects(sendMessenger({ env: {}, bucket, psid: 'abc', text: 'Hi', reviewed: true, confirmed: true, fetchImpl: ok }), /No Messenger conversation/);
});
