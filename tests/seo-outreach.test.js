// Competitor listings + link outreach: aggregation, published-email reading,
// the drafted email, the finder (nothing is sent), and the guarded send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf, aggregateListings, findEmails, draftEmail, parseOpportunities, linkOutreach, competitorListings, sendOutreach, skipOutreach, outreachState, GREETING, OPT_OUT, OUTREACH_KEY, DECISIONS_KEY, LISTINGS_KEY, DAILY_CAP } from '../functions/_lib/seo/outreach.js';
import { sendZohoMail } from '../functions/_lib/jarvis-feeds.js';

const NOW = Date.parse('2026-09-30T16:00:00Z');
const jsonRes = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
function fakeBucket(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { m, get: async k => (m.has(k) ? { json: async () => JSON.parse(m.get(k)) } : null), put: async (k, v) => { m.set(k, v); } };
}
const searchReply = urls => jsonRes({ content: [{ type: 'web_search_tool_result', content: urls.map(url => ({ url })) }, { type: 'text', text: 'OK' }], usage: { input_tokens: 500, output_tokens: 2, server_tool_use: { web_search_requests: 1 } } });

test('siteOf folds mirrors and subdomains into the site', () => {
  assert.equal(siteOf('https://lib.www.bbb.org/us/az/flagstaff'), 'bbb.org');
  assert.equal(siteOf('https://ww2.aaa.com/autorepair/shop/x'), 'aaa.com');
  assert.equal(siteOf('https://business.flagstaffchamber.com/list'), 'flagstaffchamber.com');
  assert.equal(siteOf('https://wrench.com/x'), 'wrench.com');
  assert.equal(siteOf('not a url'), null);
});

test('listings: known sites or 2+ competitors; own sites dropped; GID presence marked', () => {
  const sites = aggregateListings([
    { name: 'Heath', urls: ['https://www.aaa.com/autorepair/shop/heaths', 'https://heathsauto.com/', 'https://en.wikipedia.org/wiki/Heath'] },
    { name: 'University', urls: ['https://ww2.aaa.com/autorepair/shop/university', 'https://www.kbb.com/service-centers/flagstaff-az', 'https://flagstaff.mechanicnet.com/'] },
    { name: 'Ascot', urls: ['https://flagstaff.mechanicnet.com/x', 'https://smalltownblog.net/a'] },
  ], ['https://www.kbb.com/service-centers/flagstaff-az'], ['heathsauto.com']);
  assert.deepEqual(sites.map(s => s.site), ['aaa.com', 'mechanicnet.com', 'kbb.com']);
  assert.deepEqual(sites[0].competitors, ['Heath', 'University']);
  assert.equal(sites.find(s => s.site === 'kbb.com').gidListed, true);
  assert.equal(sites[0].gidListed, false);
  assert.ok(sites[0].how);
});

test('competitor_listings provider: one search per competitor + GID, cost recorded, stored in R2', async () => {
  const bucket = fakeBucket(); const prompts = []; const rpc = [];
  const fetch = async (url, init) => { const b = JSON.parse(init.body); prompts.push(b.messages[0].content); return searchReply(['https://www.yelp.com/biz/x', 'https://www.bbb.org/y']); };
  const store = { select: async () => [{ name: 'Munoz & Sons', domain: null }, { name: 'Heath', domain: 'heathsauto.com' }], rpc: async (f, a) => { rpc.push([f, a]); } };
  const out = await competitorListings.sync({ env: { ANTHROPIC_API_KEY: 'k', GID_PHOTOS: bucket }, fetch, store, now: new Date(NOW) });
  assert.equal(prompts.length, 3);
  assert.match(prompts[2], /"GID Garage" Flagstaff AZ/);
  assert.equal(rpc[0][0], 'jarvis_add_usage');
  const saved = JSON.parse(bucket.m.get(LISTINGS_KEY));
  assert.deepEqual(saved.sites.map(s => [s.site, s.gidListed]), [['bbb.org', true], ['yelp.com', true]]);
  assert.match(out.detail, /missing from 0/);
});

test('published emails: junk dropped, same-site address first', () => {
  const html = '<a href="mailto:hello@gmail.com">x</a> write us: editor@flagstafflocal.com <img src="logo@2x.png"> no-reply@flagstafflocal.com 9f8e7d6c5b4a39281716@sentry.wixpress.com';
  assert.deepEqual(findEmails(html, 'flagstafflocal.com'), ['editor@flagstafflocal.com', 'hello@gmail.com']);
  assert.deepEqual(findEmails('<p>no email here</p>', 'x.com'), []);
});

test('draft: starts with the greeting, personal line has no URLs, carries the opt-out', () => {
  const d = draftEmail({ name: 'Flagstaff Local', note: 'Your guide to new-resident services at https://x.com is great.' });
  assert.ok(d.body.startsWith(GREETING));
  assert.ok(d.body.includes(OPT_OUT));
  assert.doesNotMatch(d.body.split('\n\n')[1], /https?:/);
  assert.match(d.body, /https:\/\/gidgarage\.com/);
  assert.ok(draftEmail({ name: 'X' }).body.includes('I came across X'));
});

test('opportunities parsing keeps only real web URLs', () => {
  const list = parseOpportunities([{ type: 'text', text: 'Found some.\nOPPORTUNITIES: [{"name":"Flag Live","url":"https://flaglive.com/","kind":"community","why":"Local news","note":"Love the events page."},{"name":"Bad","url":"http://127.0.0.1/"},{"name":"Nope","url":"javascript:alert(1)"}]' }]);
  assert.deepEqual(list.map(o => o.site), ['flaglive.com']);
  // Code fences, and an answer cut off mid-list: the complete objects still count.
  const fenced = parseOpportunities([{ type: 'text', text: 'OPPORTUNITIES:\n```json\n[{"name":"A","url":"https://a-flag.org/"}]\n```' }]);
  assert.deepEqual(fenced.map(o => o.site), ['a-flag.org']);
  const cut = parseOpportunities([{ type: 'text', text: 'OPPORTUNITIES: [{"name":"A","url":"https://a-flag.org/"}, {"name":"B","url":"https://b-flag.org/"}, {"name":"C","url":"https://c-' }]);
  assert.deepEqual(cut.map(o => o.site), ['a-flag.org', 'b-flag.org']);
});

test('link_outreach finder: skips known sites and platforms, reads contact pages, drafts, sends nothing', async () => {
  const bucket = fakeBucket({ [OUTREACH_KEY]: { prospects: [{ site: 'old.com', status: 'ready' }] } });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('anthropic')) return jsonRes({ content: [{ type: 'text', text: 'OPPORTUNITIES: ' + JSON.stringify([
      { name: 'Old', url: 'https://old.com' }, { name: 'Yelp', url: 'https://yelp.com/x' },
      { name: 'Flag Local', url: 'https://flaglocal.org/', kind: 'community', why: 'Local resources', note: 'Your resident guide is really helpful.' },
      { name: 'AZ Roads', url: 'https://azroads.net/', kind: 'blog', why: 'Road trips' },
    ]) }], usage: { input_tokens: 2000, output_tokens: 300, server_tool_use: { web_search_requests: 3 } } });
    if (String(url) === 'https://flaglocal.org/contact') return new Response('<a href="mailto:hi@flaglocal.org">mail</a>');
    return new Response('<html>nothing</html>');
  };
  const out = await linkOutreach.sync({ env: { ANTHROPIC_API_KEY: 'k', GID_PHOTOS: bucket }, fetch, store: { rpc: async () => {} }, now: new Date(NOW) });
  const saved = JSON.parse(bucket.m.get(OUTREACH_KEY)).prospects;
  assert.deepEqual(saved.map(p => [p.site, p.status]), [['flaglocal.org', 'ready'], ['azroads.net', 'no_email'], ['old.com', 'ready']]);
  assert.equal(saved[0].email, 'hi@flaglocal.org');
  assert.ok(saved[0].draft.body.startsWith(GREETING));
  assert.ok(!calls.some(u => /zoho/.test(u)), 'the finder never sends');
  assert.match(out.detail, /2 new sites, 1 with a published email/);
});

test('send: needs review + confirmation, only to the published address, once per site, daily cap', async () => {
  const prospect = { site: 'flaglocal.org', name: 'Flag Local', email: 'hi@flaglocal.org', status: 'ready' };
  const bucket = fakeBucket({ [OUTREACH_KEY]: { prospects: [prospect, { site: 'b.org', email: 'b@b.org', status: 'ready' }] } });
  const sent = [];
  const send = async a => { sent.push(a); return { from: 'info@gidgarage.com' }; };
  const args = { bucket, site: 'flaglocal.org', subject: 'Hello', body: 'Hello, this is Michael with GID Garage, a mobile mechanic in Flagstaff.', now: NOW, send };
  assert.equal((await sendOutreach({ ...args, reviewed: true })).ok, false);
  const r = await sendOutreach({ ...args, reviewed: true, confirmed: true });
  assert.equal(r.ok, true);
  assert.equal(sent[0].to, 'hi@flaglocal.org');
  assert.ok(sent[0].text.endsWith(OPT_OUT), 'opt-out line added when removed');
  assert.match((await sendOutreach({ ...args, reviewed: true, confirmed: true })).error, /Already emailed/);
  assert.equal((await outreachState(bucket, NOW)).prospects[0].status, 'sent');
  assert.equal((await skipOutreach({ bucket, site: 'b.org', now: NOW })).ok, true);
  assert.match((await sendOutreach({ ...args, site: 'b.org', reviewed: true, confirmed: true })).error, /skipped/);
  // Daily cap.
  const many = Object.fromEntries(Array.from({ length: DAILY_CAP }, (_, i) => [`s${i}.com`, { status: 'sent', at: new Date(NOW - 3600000).toISOString() }]));
  const capped = fakeBucket({ [OUTREACH_KEY]: { prospects: [prospect] }, [DECISIONS_KEY]: many });
  assert.match((await sendOutreach({ ...args, bucket: capped, reviewed: true, confirmed: true })).error, /Daily limit/);
});

test('Zoho send: plain text from the connected mailbox; read-only connection gets a clear message', async () => {
  const bucket = fakeBucket({ 'private/jarvis-connections.json': { zoho: { refreshToken: 'r', clientId: 'c', clientSecret: 's', dc: 'com', accountId: '42', email: 'info@gidgarage.com' } }, 'private/jarvis-zoho-access.json': { token: 't', exp: NOW + 600000 } });
  let req;
  const ok = await sendZohoMail({ bucket, to: 'hi@x.org', subject: 'S', text: 'Body', now: NOW, fetchImpl: async (url, init) => { req = { url, body: JSON.parse(init.body) }; return jsonRes({ data: { messageId: '1' } }); } });
  assert.equal(req.url, 'https://mail.zoho.com/api/accounts/42/messages');
  assert.deepEqual([req.body.fromAddress, req.body.toAddress, req.body.mailFormat], ['info@gidgarage.com', 'hi@x.org', 'plaintext']);
  assert.equal(ok.from, 'info@gidgarage.com');
  await assert.rejects(sendZohoMail({ bucket, to: 'hi@x.org', subject: 'S', text: 'B', now: NOW, fetchImpl: async () => jsonRes({ data: { errorCode: 'INVALID_OAUTHSCOPE' } }, 400) }), /ZohoMail\.messages\.CREATE/);
});

test('listings the owner recorded count as listed, even when search missed them', async () => {
  const bucket = fakeBucket({ [LISTINGS_KEY]: { sites: [{ site: 'yelp.com', gidListed: false }, { site: 'bbb.org', gidListed: false }] } });
  const store = { select: async () => [{ platform: 'Yelp', url: 'https://www.yelp.com/biz/gid-garage-flagstaff' }] };
  const { listingsState } = await import('../functions/_lib/seo/outreach.js');
  const s = await listingsState(bucket, store);
  assert.deepEqual(s.sites.map(x => [x.site, x.gidListed]), [['yelp.com', true], ['bbb.org', false]]);
  assert.equal(s.sites[0].yourUrl, 'https://www.yelp.com/biz/gid-garage-flagstaff');
});
