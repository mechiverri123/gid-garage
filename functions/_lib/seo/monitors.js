// Outside-world monitors for the SEO sync (functions/_lib/seo/sync.js runs them
// like any provider, on their cadence):
//   search_news    daily   Google Search Status Dashboard (core/spam/ranking
//                          updates), Google Search Central blog, Bing Webmaster blog
//   indexnow       weekly  tells Bing / IndexNow engines about the site's pages
//                          (Bing's index feeds ChatGPT search and Copilot)
//   ai_visibility  weekly  asks an AI assistant (Claude + live web search) the
//                          questions local customers ask, records whether GID
//                          Garage is named and who is
// State lives in R2 (GID_PHOTOS, private/) so no new tables are needed.
// Tests: tests/seo-monitors.test.js

import { ProviderError } from './google-auth.js';
import { readJson, writeJson } from '../jarvis-feeds.js';
import { anthropicUsd, pricing, budgetMonth } from '../ai-budget.js';

export const NEWS_KEY = 'private/seo-search-news.json';
export const AI_KEY = 'private/seo-ai-visibility.json';
export const INDEXNOW_KEY = '5f1c3a9e7b2d4c8f9a6e1b3d7c2f8a4e'; // public by design: served at /<key>.txt
const SITE = 'https://gidgarage.com';

// ---- search engine news -------------------------------------------------------------------

const decode = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
export function parseRss(xml = '', source) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const tag = t => decode(m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]);
    const date = new Date(tag('pubDate'));
    return { id: `${source}:${tag('guid') || tag('link')}`, source, title: tag('title'), url: tag('link'), date: Number.isFinite(date.getTime()) ? date.toISOString() : null, summary: tag('description').slice(0, 280) };
  }).filter(i => i.title && i.url);
}

// Google Search Status Dashboard incidents: ranking updates and serving issues.
export function parseIncidents(json = []) {
  return (Array.isArray(json) ? json : []).map(i => ({
    id: `google_status:${i.id}`, source: 'google_status', title: i.external_desc, date: i.begin, end: i.end || null,
    url: `https://status.search.google.com/incidents/${i.id}`,
    summary: decode(i.most_recent_update?.text || '').slice(0, 280),
    kind: /core update/i.test(i.external_desc) ? 'core_update' : /spam update/i.test(i.external_desc) ? 'spam_update' : /update/i.test(i.external_desc) ? 'ranking_update' : 'incident',
  }));
}

// How much an item matters to a local mobile-mechanic site.
const LOCAL = /\b(local|business profile|maps|review|near me)\b/i;
const AI = /\b(ai|llm|gemini|copilot|chatgpt|ai overviews?|ai mode)\b/i;
const RANKING = /\b(core update|spam update|ranking|helpful content|algorithm)\b/i;
const TECH = /\b(search console|structured data|crawl|index|javascript|sitemap|core web vitals|page experience)\b/i;
export function relevance(item) {
  const t = `${item.title} ${item.summary}`;
  if (item.kind && item.kind !== 'incident') return { level: 'high', why: 'Google ranking update — positions can move for every site while it rolls out.' };
  if (LOCAL.test(t)) return { level: 'high', why: 'Local search / Business Profile change.' };
  if (AI.test(t)) return { level: 'medium', why: 'AI search change — affects how assistants find and cite local businesses.' };
  if (RANKING.test(t)) return { level: 'medium', why: 'Ranking-related guidance.' };
  if (TECH.test(t)) return { level: 'low', why: 'Technical SEO / tooling change.' };
  return { level: 'info', why: 'General news.' };
}

export function mergeNews(stored = [], fresh = [], now = new Date()) {
  const byId = new Map(stored.map(i => [i.id, i]));
  const added = [];
  for (const f of fresh) {
    const cur = byId.get(f.id);
    if (!cur) { const n = { ...f, ...relevanceFields(f), firstSeen: now.toISOString() }; byId.set(f.id, n); added.push(n); }
    else byId.set(f.id, { ...cur, ...f, ...relevanceFields(f), firstSeen: cur.firstSeen }); // updates (e.g. an update's end date)
  }
  const items = [...byId.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 150);
  return { items, added };
}
const relevanceFields = f => { const r = relevance(f); return { relevance: r.level, why: r.why }; };

// Google ranking updates rolling out now (no end date yet).
export const ongoingUpdates = (items = []) => items.filter(i => i.source === 'google_status' && i.kind && i.kind !== 'incident' && !i.end);

export const searchNews = {
  id: 'search_news', label: 'Search engine updates (Google status, Google & Bing blogs)', category: 'research', env: [], docs: 'monitors', snapshot: true,
  status(env) { return env.GID_PHOTOS ? { status: 'connected', missing: [], note: 'Free public feeds, checked daily.' } : { status: 'not_configured', missing: ['GID_PHOTOS (R2 binding)'], note: 'Needs the R2 bucket to remember what it has seen.' }; },
  async sync(ctx) {
    const get = async (url, as) => { const r = await ctx.fetch(url, { headers: { 'User-Agent': 'GID-Garage-SEO-Monitor/1.0' } }); if (!r.ok) throw new ProviderError('error', `${url}: HTTP ${r.status}`); return as === 'json' ? r.json() : r.text(); };
    const results = await Promise.allSettled([
      get('https://status.search.google.com/incidents.json', 'json').then(parseIncidents),
      get('https://developers.google.com/search/blog/feed.xml').then(x => parseRss(x, 'google_blog')),
      get('https://blogs.bing.com/webmaster/feed').then(x => parseRss(x, 'bing_blog').slice(0, 20)),
    ]);
    const fresh = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    if (!fresh.length) throw new ProviderError('error', 'No search news feed could be read.');
    const stored = (await readJson(ctx.env.GID_PHOTOS, NEWS_KEY))?.items || [];
    const { items, added } = mergeNews(stored, fresh, ctx.now);
    await writeJson(ctx.env.GID_PHOTOS, NEWS_KEY, { checkedAt: new Date(ctx.now).toISOString(), items });
    const failed = results.filter(r => r.status === 'rejected').length;
    return { rows: added.length, detail: `${added.length} new item${added.length === 1 ? '' : 's'}${ongoingUpdates(items).length ? `; Google update rolling out: ${ongoingUpdates(items).map(i => i.title).join(', ')}` : ''}${failed ? ` (${failed} feed failed)` : ''}` };
  },
};

// ---- IndexNow -----------------------------------------------------------------------------------

export const indexNow = {
  id: 'indexnow', label: 'IndexNow (Bing, Yandex, Seznam — feeds ChatGPT search & Copilot)', category: 'search', env: [], docs: 'monitors', snapshot: true,
  status(env) { return env.GID_PHOTOS ? { status: 'connected', missing: [], note: 'Weekly: submits the sitemap pages. Google does not use IndexNow (use Search Console there).' } : { status: 'not_configured', missing: ['GID_PHOTOS (R2 binding)'], note: 'Records each submission in R2.' }; },
  async sync(ctx) {
    const sm = await ctx.fetch(`${SITE}/sitemap.xml`);
    if (!sm.ok) throw new ProviderError('error', `sitemap: HTTP ${sm.status}`);
    const urlList = [...(await sm.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).slice(0, 500);
    const res = await ctx.fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'gidgarage.com', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList }),
    });
    // 200 = accepted, 202 = accepted pending key check.
    if (res.status !== 200 && res.status !== 202) throw new ProviderError('error', `IndexNow: HTTP ${res.status}`);
    await writeJson(ctx.env.GID_PHOTOS, 'private/seo-indexnow.json', { at: new Date(ctx.now).toISOString(), status: res.status, urls: urlList });
    return { rows: urlList.length, detail: `${urlList.length} pages submitted (HTTP ${res.status})` };
  },
};

// ---- AI visibility --------------------------------------------------------------------------------

export const AI_QUESTIONS = [
  'What is the best mobile mechanic in Flagstaff, Arizona?',
  'I need my brakes done at my house in Flagstaff AZ. Who should I call?',
  'Who does mobile oil changes in Flagstaff, Arizona?',
];

// Read one answer: is GID named, at what position among businesses, who else, was gidgarage.com cited.
export function readAnswer(content = []) {
  const text = content.filter(b => b.type === 'text').map(b => b.text).join('');
  const cited = content.flatMap(b => (b.type === 'text' ? (b.citations || []).map(c => c.url) : []))
    .concat(content.flatMap(b => (b.type === 'web_search_tool_result' && Array.isArray(b.content) ? b.content.map(r => r.url) : [])));
  const json = text.match(/BUSINESSES:\s*(\[[\s\S]*?\])/)?.[1];
  let businesses = [];
  try { businesses = JSON.parse(json || '[]').map(String).slice(0, 10); } catch { /* model skipped the list */ }
  const answer = text.replace(/BUSINESSES:[\s\S]*$/, '').trim();
  const isGid = s => /\bgid\s*garage\b/i.test(s);
  const rank = businesses.findIndex(isGid);
  return {
    mentioned: isGid(answer) || rank >= 0, rank: rank >= 0 ? rank + 1 : null, businesses,
    gidCited: cited.some(u => /gidgarage\.com/i.test(String(u))), sources: [...new Set(cited.map(u => { try { return new URL(u).hostname; } catch { return null; } }).filter(Boolean))].slice(0, 12),
    answer: answer.slice(0, 1200),
  };
}

export const aiVisibility = {
  id: 'ai_visibility', label: 'AI assistant answers (Claude + web search)', category: 'research', env: ['ANTHROPIC_API_KEY'], docs: 'monitors', snapshot: true,
  status(env) {
    if (!env.GID_PHOTOS) return { status: 'not_configured', missing: ['GID_PHOTOS (R2 binding)'], note: '' };
    return env.ANTHROPIC_API_KEY ? { status: 'connected', missing: [], note: `Weekly, ${AI_QUESTIONS.length} questions (~$0.05/week incl. web search).` } : { status: 'not_configured', missing: ['ANTHROPIC_API_KEY'], note: '' };
  },
  async sync(ctx) {
    const results = []; const usage = {};
    for (const q of AI_QUESTIONS) {
      const res = await ctx.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 700,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2, user_location: { type: 'approximate', city: 'Flagstaff', region: 'Arizona', country: 'US', timezone: 'America/Phoenix' } }],
          system: 'Answer the way a helpful assistant answers a local customer: search the web, then recommend specific businesses briefly. After the answer, on its own line, write BUSINESSES: followed by a JSON array of the business names you recommended, in order.',
          messages: [{ role: 'user', content: q }],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ProviderError(res.status === 401 ? 'needs_authorization' : 'error', `Anthropic: HTTP ${res.status} ${body.error?.message || ''}`.trim());
      for (const [k, v] of Object.entries(body.usage || {})) if (typeof v === 'number') usage[k] = (usage[k] || 0) + v;
      results.push({ question: q, ...readAnswer(body.content || []) });
    }
    // Cost into the shared Jarvis AI budget (web searches are $10 per 1,000).
    const searches = Number(usage.server_tool_use?.web_search_requests || 0) || results.length * 2;
    const usd = anthropicUsd(usage, pricing(ctx.env)) + searches * 0.01;
    await ctx.store.rpc('jarvis_add_usage', { p_month: budgetMonth(new Date(ctx.now)), p_provider: 'anthropic', p_units: (usage.input_tokens || 0) + (usage.output_tokens || 0), p_usd: usd }).catch(() => {});
    const history = (await readJson(ctx.env.GID_PHOTOS, AI_KEY))?.runs || [];
    const run = { at: new Date(ctx.now).toISOString(), model: 'claude-haiku-4-5 + web search', results };
    await writeJson(ctx.env.GID_PHOTOS, AI_KEY, { runs: [run, ...history].slice(0, 26) });
    const hits = results.filter(r => r.mentioned).length;
    return { rows: results.length, detail: `GID Garage named in ${hits} of ${results.length} answers ($${usd.toFixed(3)})` };
  },
};

export const MONITOR_PROVIDERS = [searchNews, indexNow, aiVisibility];
