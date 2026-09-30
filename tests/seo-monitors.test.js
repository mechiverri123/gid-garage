// Outside-world monitors: search engine news (Google status + blogs), IndexNow,
// the weekly AI-answer check, and what the site gives AI crawlers (llms.txt,
// per-service structured data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseIncidents, relevance, mergeNews, ongoingUpdates, readAnswer, searchNews, indexNow, aiVisibility, INDEXNOW_KEY, NEWS_KEY, AI_KEY, AI_QUESTIONS } from '../functions/_lib/seo/monitors.js';
import { detectSearchUpdates, detectAiVisibility } from '../shared/seo/agent-detectors.js';
import { llmsTxt, serviceSchema } from '../scripts/prerender.mjs';
import { SERVICE_PAGES } from '../shared/site-pages.js';

const NOW = new Date('2026-09-30T16:00:00Z');
const jsonRes = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
function fakeBucket() {
  const m = new Map();
  return { m, get: async k => (m.has(k) ? { json: async () => JSON.parse(m.get(k)) } : null), put: async (k, v) => { m.set(k, v); } };
}
const INCIDENTS = [
  { id: 'A1', begin: '2026-09-24T16:15:00+00:00', external_desc: 'September 2026 spam update', most_recent_update: { text: 'Released the September 2026 spam update <https://x>, may take two weeks.' } },
  { id: 'B2', begin: '2026-05-21T00:00:00+00:00', end: '2026-06-02T00:00:00+00:00', external_desc: 'May 2026 core update' },
  { id: 'C3', begin: '2026-02-25T00:00:00+00:00', end: '2026-02-25T05:00:00+00:00', external_desc: 'Serving was experiencing an issue' },
];
const RSS = `<rss><channel><item><title>Business Profile: new review replies</title><link>https://developers.google.com/search/blog/x</link><description><![CDATA[<p>Local businesses &amp; reviews</p>]]></description><pubDate>Thu, 24 Sep 2026 00:00:00 +0000</pubDate><guid>g1</guid></item>
<item><title>Search Central Live Europe</title><link>https://developers.google.com/search/blog/y</link><description>Event</description><pubDate>Mon, 14 Sep 2026 00:00:00 +0000</pubDate><guid>g2</guid></item></channel></rss>`;

test('news: incidents and feeds are parsed, classified, and ongoing updates found', () => {
  const inc = parseIncidents(INCIDENTS);
  assert.deepEqual(inc.map(i => i.kind), ['spam_update', 'core_update', 'incident']);
  assert.equal(inc[0].url, 'https://status.search.google.com/incidents/A1');
  const blog = parseRss(RSS, 'google_blog');
  assert.equal(blog.length, 2);
  assert.equal(blog[0].summary, 'Local businesses & reviews');
  assert.equal(relevance(blog[0]).level, 'high');
  assert.equal(relevance(blog[1]).level, 'info');
  assert.equal(relevance(inc[0]).level, 'high');
  const { items, added } = mergeNews([], [...inc, ...blog], NOW);
  assert.equal(added.length, 5);
  assert.deepEqual(ongoingUpdates(items).map(i => i.title), ['September 2026 spam update']);
  // The update ending later closes it without losing when it was first seen.
  const later = mergeNews(items, [{ ...inc[0], end: '2026-10-08T00:00:00Z' }], new Date('2026-10-09T00:00:00Z'));
  assert.equal(later.added.length, 0);
  assert.equal(ongoingUpdates(later.items).length, 0);
  assert.equal(later.items.find(i => i.id === inc[0].id).firstSeen, NOW.toISOString());
});

test('news provider: reads all feeds, remembers them in R2; one failed feed is tolerated', async () => {
  const bucket = fakeBucket();
  const fetch = async url => (String(url).includes('incidents.json') ? jsonRes(INCIDENTS) : String(url).includes('bing') ? new Response('down', { status: 503 }) : new Response(RSS));
  const out = await searchNews.sync({ env: { GID_PHOTOS: bucket }, fetch, now: NOW });
  assert.equal(out.rows, 5);
  assert.match(out.detail, /September 2026 spam update/);
  assert.match(out.detail, /1 feed failed/);
  assert.equal(JSON.parse(bucket.m.get(NEWS_KEY)).items.length, 5);
  assert.equal(searchNews.status({}).status, 'not_configured');
});

test('ranking update → informational recommendation; AI visibility gap → recommendation', () => {
  const items = mergeNews([], parseIncidents(INCIDENTS), NOW).items;
  const [u] = detectSearchUpdates(items, NOW);
  assert.match(u.title, /September 2026 spam update is rolling out/);
  assert.equal(u.informational, true);
  const run = { at: NOW.toISOString(), results: [
    { question: 'q1', mentioned: false, businesses: ['Munoz & Sons', 'Flagstaff Mobile Mechanic'], sources: ['yelp.com'] },
    { question: 'q2', mentioned: true, rank: 2, businesses: ['Munoz & Sons', 'GID Garage'], sources: ['gidgarage.com'] },
  ] };
  const [ai] = detectAiVisibility(run);
  assert.match(ai.title, /1 of 2/);
  assert.match(ai.detail, /Named instead: Munoz & Sons, Flagstaff Mobile Mechanic/);
  assert.deepEqual(detectAiVisibility({ results: run.results.map(r => ({ ...r, mentioned: true })) }), []);
});

test('AI answer reading: named, rank, cited, businesses list stripped from the answer', () => {
  const r = readAnswer([
    { type: 'server_tool_use', name: 'web_search' },
    { type: 'web_search_tool_result', content: [{ url: 'https://www.yelp.com/biz/x' }, { url: 'https://gidgarage.com/brake-repair-flagstaff' }] },
    { type: 'text', text: 'Good options: Munoz & Sons Mobile Mechanics and GID Garage.', citations: [{ url: 'https://gidgarage.com/' }] },
    { type: 'text', text: '\nBUSINESSES: ["Munoz & Sons Mobile Mechanics", "GID Garage"]' },
  ]);
  assert.deepEqual([r.mentioned, r.rank, r.gidCited], [true, 2, true]);
  assert.ok(r.sources.includes('gidgarage.com') && r.sources.includes('www.yelp.com'));
  assert.doesNotMatch(r.answer, /BUSINESSES/);
  assert.equal(readAnswer([{ type: 'text', text: 'Try Munoz.\nBUSINESSES: ["Munoz"]' }]).mentioned, false);
});

test('AI visibility provider: asks each question with web search near Flagstaff, records cost, keeps history', async () => {
  const bucket = fakeBucket(); const bodies = []; const rpc = [];
  const fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonRes({ content: [{ type: 'text', text: 'GID Garage is a good choice.\nBUSINESSES: ["GID Garage"]' }], usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } });
  };
  const store = { rpc: async (fn, args) => { rpc.push([fn, args]); return null; } };
  const out = await aiVisibility.sync({ env: { ANTHROPIC_API_KEY: 'k', GID_PHOTOS: bucket }, fetch, store, now: NOW });
  assert.equal(bodies.length, AI_QUESTIONS.length);
  assert.equal(bodies[0].tools[0].type, 'web_search_20250305');
  assert.equal(bodies[0].tools[0].user_location.city, 'Flagstaff');
  assert.match(out.detail, /named in 3 of 3/);
  assert.equal(rpc[0][0], 'jarvis_add_usage');
  assert.equal(rpc[0][1].p_provider, 'anthropic');
  assert.ok(rpc[0][1].p_usd > 0.03, 'web searches are counted');
  assert.equal(JSON.parse(bucket.m.get(AI_KEY)).runs.length, 1);
});

test('IndexNow: submits every sitemap page with the public key', async () => {
  let posted = null;
  const fetch = async (url, init) => {
    if (String(url).endsWith('sitemap.xml')) return new Response('<urlset><url><loc>https://gidgarage.com/</loc></url><url><loc>https://gidgarage.com/brake-repair-flagstaff</loc></url></urlset>');
    posted = JSON.parse(init.body); return new Response('', { status: 202 });
  };
  const bucket = fakeBucket();
  const out = await indexNow.sync({ env: { GID_PHOTOS: bucket }, fetch, now: NOW });
  assert.equal(JSON.parse(bucket.m.get('private/seo-indexnow.json')).urls.length, 2);
  assert.equal(out.rows, 2);
  assert.equal(posted.key, INDEXNOW_KEY);
  assert.equal(posted.keyLocation, `https://gidgarage.com/${INDEXNOW_KEY}.txt`);
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim(), INDEXNOW_KEY);
});

test('AI crawlers get llms.txt and per-service structured data', () => {
  const t = llmsTxt();
  assert.match(t, /^# GID Garage/);
  for (const p of SERVICE_PAGES) assert.ok(t.includes(p.canonical), p.path);
  assert.match(t, /480-757-0476/);
  assert.doesNotMatch(t, /Winslow/);
  const s = JSON.parse(serviceSchema(SERVICE_PAGES.find(p => p.serviceId === 'brakes')));
  assert.equal(s['@type'], 'Service');
  assert.equal(s.offers.price, '149.99');
  assert.equal(s.provider.name, 'GID Garage');
});
