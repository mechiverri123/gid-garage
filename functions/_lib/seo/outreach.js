// Links and listings for the SEO sync, plus the owner-approved outreach emails.
//   competitor_listings  monthly  searches each top competitor (and GID) by name
//                                 with Claude + web search and records which
//                                 directories/sites list them, and whether GID is on them
//   link_outreach        weekly   finds Flagstaff / Arizona sites that could link to
//                                 GID, reads the contact email each site publishes, and
//                                 drafts a friendly email. Nothing is sent here.
// Sending (sendOutreach) happens only from /jarvis after the owner reviews and
// confirms each email: one email per site ever, at most DAILY_CAP a day, every
// email carries an opt-out line. Emails go out from the connected Zoho mailbox.
// State lives in R2 private/: the providers write the found lists, the owner's
// decisions (sent / skipped) live in their own file so a sync never overwrites them.
// Tests: tests/seo-outreach.test.js

import { ProviderError } from './google-auth.js';
import { readJson, writeJson, sendZohoMail } from '../jarvis-feeds.js';
import { claudeSearch, recordSearchCost, searchResultUrls } from './monitors.js';

export const LISTINGS_KEY = 'private/seo-competitor-listings.json';
export const OUTREACH_KEY = 'private/seo-outreach.json';
export const DECISIONS_KEY = 'private/seo-outreach-decisions.json';
export const DAILY_CAP = 10;
const GID = 'GID Garage';

// Listing sites worth knowing by name, with how GID gets on them.
export const KNOWN_LISTINGS = {
  'yelp.com': { name: 'Yelp', how: 'Free — biz.yelp.com. Hide the address and set a service area. Siri and Apple Maps read Yelp.' },
  'bbb.org': { name: 'Better Business Bureau', how: 'Free basic listing (accreditation is paid) — bbb.org/get-listed.' },
  'aaa.com': { name: 'AAA Approved Auto Repair', how: 'Paid program built around a shop inspection; mostly for fixed shops.' },
  'kbb.com': { name: 'Kelley Blue Book service centers', how: 'Fed by repair-shop data partners; mostly fixed shops.' },
  'mechanicnet.com': { name: 'MechanicNet', how: 'Paid shop websites/marketing — skip.' },
  'customerlobby.com': { name: 'Customer Lobby', how: 'Paid review platform — skip; ask for Google reviews instead.' },
  'getjerry.com': { name: 'Jerry (auto shop pages)', how: 'Free "claim your shop" listing.' },
  'flagstaffchamber.com': { name: 'Flagstaff Chamber of Commerce', how: 'Member directory (paid membership) — a strong local link.' },
  'azdailysun.com': { name: 'Arizona Daily Sun (Best of Flag)', how: 'Ask customers to nominate and vote in Best of Flag.' },
  'yellowpages.com': { name: 'Yellow Pages', how: 'Free basic listing.' },
  'angi.com': { name: 'Angi', how: 'Free profile; leads are paid.' },
  'thumbtack.com': { name: 'Thumbtack', how: 'Free profile; leads are paid.' },
  'nextdoor.com': { name: 'Nextdoor', how: 'Free business page — neighbours recommend you.' },
  'facebook.com': { name: 'Facebook', how: 'You have a page.' },
  'mapquest.com': { name: 'MapQuest', how: 'Fed by data aggregators (Yelp, Foursquare).' },
  'manta.com': { name: 'Manta', how: 'Free listing.' },
  'foursquare.com': { name: 'Foursquare', how: 'Free — feeds many apps and maps.' },
  'roadtrippers.com': { name: 'Roadtrippers', how: 'Pulls business data from aggregators.' },
  'repairpal.com': { name: 'RepairPal', how: 'Certified-shop program (paid).' },
  'carfax.com': { name: 'Carfax', how: 'Shop program for fixed shops.' },
  'wrench.com': { name: 'Wrench', how: 'A competing mobile-mechanic platform (you could join as a mechanic).' },
  'yourmechanic.com': { name: 'YourMechanic', how: 'A competing mobile-mechanic platform.' },
};

// "lib.www.bbb.org", "ww2.aaa.com", "business.flagstaffchamber.com" -> the site.
export function siteOf(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const parts = host.split('.');
  return parts.length > 2 && /^(com|org|net|gov|edu)$/.test(parts.at(-1)) ? parts.slice(-2).join('.') : host.replace(/^w+\d*\./, '');
}

// Keep a site if it's a known listing site or lists 2+ competitors (the rest is search noise).
export function aggregateListings(searches, gidUrls = [], ownDomains = []) {
  const own = new Set(ownDomains.filter(Boolean).map(d => siteOf(`https://${d}`)));
  const gid = new Set(gidUrls.map(siteOf).filter(Boolean));
  const bySite = new Map();
  for (const { name, urls } of searches) {
    for (const u of urls) {
      const s = siteOf(u);
      if (!s || own.has(s) || s === 'gidgarage.com' || /(^|\.)google\./.test(s)) continue;
      const cur = bySite.get(s) || { site: s, competitors: new Set(), urls: new Set() };
      cur.competitors.add(name); if (cur.urls.size < 3) cur.urls.add(u);
      bySite.set(s, cur);
    }
  }
  return [...bySite.values()]
    .filter(x => KNOWN_LISTINGS[x.site] || x.competitors.size >= 2)
    .map(x => ({ site: x.site, name: KNOWN_LISTINGS[x.site]?.name || x.site, how: KNOWN_LISTINGS[x.site]?.how || '', competitors: [...x.competitors], urls: [...x.urls], gidListed: gid.has(x.site) }))
    .sort((a, b) => b.competitors.length - a.competitors.length || a.site.localeCompare(b.site));
}

export const competitorListings = {
  id: 'competitor_listings', label: 'Where competitors are listed (Claude + web search)', category: 'research', env: ['ANTHROPIC_API_KEY'], docs: 'monitors', snapshot: true,
  status(env) {
    if (!env.GID_PHOTOS) return { status: 'not_configured', missing: ['GID_PHOTOS (R2 binding)'], note: '' };
    return env.ANTHROPIC_API_KEY ? { status: 'connected', missing: [], note: 'Monthly: 7 searches (~$0.15).' } : { status: 'not_configured', missing: ['ANTHROPIC_API_KEY'], note: '' };
  },
  async sync(ctx) {
    // Mobile competitors first, then the most-reviewed shops.
    const comps = await ctx.store.select('seo_competitors', { select: 'name,domain', status: 'eq.active', weight: 'gt.0', inside_service_area: 'eq.true', order: 'weight.desc,review_count.desc.nullslast', limit: '6' });
    if (!comps.length) throw new ProviderError('error', 'No competitors yet (the places provider finds them).');
    const usage = {}; const searches = [];
    const search = name => claudeSearch(ctx, usage, { maxUses: 1, maxTokens: 20, prompt: `Search the web for exactly this query: "${name}" Flagstaff AZ\nThen reply with only: OK` }).then(searchResultUrls);
    for (const c of comps) searches.push({ name: c.name, urls: await search(c.name) });
    const gidUrls = await search(GID);
    await recordSearchCost(ctx, usage, comps.length + 1);
    const sites = aggregateListings(searches, gidUrls, comps.map(c => c.domain));
    await writeJson(ctx.env.GID_PHOTOS, LISTINGS_KEY, { checkedAt: new Date(ctx.now).toISOString(), competitors: comps.map(c => c.name), gidFound: gidUrls.length, sites });
    const missing = sites.filter(s => !s.gidListed).length;
    return { rows: sites.length, detail: `${sites.length} listing sites found; GID is missing from ${missing}` };
  },
};

// ---- outreach: find sites, read their published contact email, draft -------------------------

// Sites that don't take emailed link requests (big platforms, search engines).
const NO_OUTREACH = /(^|\.)(google|facebook|instagram|youtube|twitter|x|tiktok|linkedin|pinterest|reddit|wikipedia|amazon|yelp|bbb|angi|thumbtack|yellowpages|nextdoor|tripadvisor|wrench|yourmechanic|getjerry|kbb|aaa|mapquest|apple|bing|microsoft)\.[a-z.]+$/;

const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|sentry|wixpress|sentry-next)\.|^(no-?reply|donotreply|abuse|postmaster|privacy|webmaster)@|^[0-9a-f]{16,}@/i;
// Emails a page publishes (mailto links and plain text), same-site addresses first.
export function findEmails(html, site) {
  const found = [...String(html).matchAll(/(?:mailto:)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)].map(m => m[1].toLowerCase().replace(/\.$/, ''));
  const ok = [...new Set(found)].filter(e => !JUNK_EMAIL.test(e));
  return ok.sort((a, b) => Number(siteOf(`https://${b.split('@')[1]}`) === site) - Number(siteOf(`https://${a.split('@')[1]}`) === site));
}

export const GREETING = 'Hello, this is Michael with GID Garage,';
export const OPT_OUT = "If you'd rather not hear from me, just reply and let me know, and I won't reach out again.";
const clean = (s, n) => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

export function draftEmail(p) {
  const personal = clean(p.note, 260) || `I came across ${p.name} and really like what you're doing for people here in Arizona.`;
  return {
    subject: 'A quick hello from a Flagstaff mobile mechanic',
    body: [
      `${GREETING} a mobile mechanic based in Flagstaff. We drive to people's homes and workplaces for brakes, oil changes, diagnostics and suspension work, so they don't have to lose a day at the shop.`,
      personal,
      `If you think it would be useful to your visitors, I'd be really grateful if you'd consider adding GID Garage to ${p.name} with a link to https://gidgarage.com. I'm happy to send a short description, photos from real jobs, or answer car questions for your audience — whatever is easiest for you.`,
      'Thank you so much for your time, and have a great day!',
      'Best regards,\nMichael\nGID Garage\n480-757-0476 · https://gidgarage.com',
      OPT_OUT,
    ].join('\n\n'),
  };
}

const DISCOVER = `You help a small mobile mechanic in Flagstaff, Arizona (GID Garage, gidgarage.com) earn links from real local websites.
Search the web, then list websites that could reasonably link to a local mobile mechanic, in this order of preference:
1. Flagstaff / Northern Arizona community sites: local blogs, community and neighbourhood sites, resource pages for residents, new movers or NAU students, local event or sponsorship pages, local business directories run by local organisations.
2. Arizona-wide sites: Arizona car, outdoor, road-trip or small-business blogs and resource pages.
Do NOT include: other mechanics or auto shops, national directories or platforms (Yelp, BBB, Angi, Thumbtack, Google, Facebook, etc.), government agencies, or sites you did not see in the search results.
Keep your prose to one short line. Always finish with the list, even if only a few sites fit: on its own line write OPPORTUNITIES: followed by a JSON array (max 8) of objects:
{"name": site name, "url": homepage or most relevant page URL, "kind": "community" | "resource page" | "blog" | "directory" | "events" | "other", "why": one short sentence on why a link fits, "note": one warm, specific sentence Michael could write to the site owner about their site (no flattery beyond what the search showed, no URLs)}`;

const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !/^(localhost|[\d.]+|\[.*\])$/.test(x.hostname) ? x : null; } catch { return null; } };

// The list after "OPPORTUNITIES", tolerating code fences and a cut-off answer
// (then each complete {...} object is read on its own).
export const answerText = (content = []) => content.filter(b => b.type === 'text').map(b => b.text).join('');
export function parseOpportunities(content = []) {
  const text = answerText(content);
  const at = text.lastIndexOf('OPPORTUNITIES');
  const seg = at >= 0 ? text.slice(at) : text;
  let list = [];
  try { list = JSON.parse(seg.slice(seg.indexOf('['), seg.lastIndexOf(']') + 1)); } catch {
    list = [...seg.matchAll(/\{[^{}]*\}/g)].map(m => { try { return JSON.parse(m[0]); } catch { return null; } });
  }
  if (!Array.isArray(list)) return [];
  return list.filter(o => o && safeUrl(o.url)).map(o => ({ name: clean(o.name, 80) || siteOf(o.url), url: safeUrl(o.url).href, site: siteOf(o.url), kind: clean(o.kind, 30) || 'other', why: clean(o.why, 200), note: clean(o.note, 260) }));
}

const PAGE_LIMIT = 300_000;
async function pageText(ctx, url) {
  const r = await ctx.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GID-Garage-Outreach/1.0; +https://gidgarage.com)' }, redirect: 'follow' }).catch(() => null);
  return r?.ok ? (await r.text()).slice(0, PAGE_LIMIT) : '';
}

// Home page, then the usual contact pages, until a published email turns up.
async function contactFor(ctx, p) {
  const base = new URL(p.url).origin;
  for (const path of ['', '/contact', '/contact-us']) {
    const url = path ? `${base}${path}` : p.url;
    const emails = findEmails(await pageText(ctx, url), p.site);
    if (emails.length) return { email: emails[0], foundOn: url };
  }
  return { email: null, foundOn: null, contactUrl: `${base}/contact` };
}

export const PER_RUN = 5;
export const linkOutreach = {
  id: 'link_outreach', label: 'Link outreach: find sites + draft emails (nothing is sent)', category: 'research', env: ['ANTHROPIC_API_KEY'], docs: 'monitors', snapshot: true,
  status(env) {
    if (!env.GID_PHOTOS) return { status: 'not_configured', missing: ['GID_PHOTOS (R2 binding)'], note: '' };
    return env.ANTHROPIC_API_KEY ? { status: 'connected', missing: [], note: `Weekly: up to ${PER_RUN} new sites (~$0.06). Emails are only sent after you review them in /jarvis.` } : { status: 'not_configured', missing: ['ANTHROPIC_API_KEY'], note: '' };
  },
  async sync(ctx) {
    const bucket = ctx.env.GID_PHOTOS;
    const state = (await readJson(bucket, OUTREACH_KEY)) || { prospects: [] };
    const decisions = (await readJson(bucket, DECISIONS_KEY)) || {};
    const known = new Set([...state.prospects.map(p => p.site), ...Object.keys(decisions)]);
    const usage = {}; const info = {};
    const content = await claudeSearch(ctx, usage, { maxUses: 4, maxTokens: 3000, system: DISCOVER, prompt: `Find link opportunities for GID Garage. Already known, skip these: ${[...known].slice(0, 80).join(', ') || 'none'}.` }, info);
    const usd = await recordSearchCost(ctx, usage, 4);
    const suggested = parseOpportunities(content);
    const fresh = suggested.filter(o => o.site && !known.has(o.site) && !NO_OUTREACH.test(o.site) && o.site !== 'gidgarage.com').slice(0, PER_RUN);
    // Why a run found nothing, visible in the detail and kept in R2.
    const lastRun = { at: new Date(ctx.now).toISOString(), stopReason: info.stopReason, suggested: suggested.length, kept: fresh.length, tail: suggested.length ? '' : answerText(content).slice(-600) };
    const found = [];
    for (const o of fresh) {
      const c = await contactFor(ctx, o);
      found.push({ ...o, ...c, status: c.email ? 'ready' : 'no_email', foundAt: new Date(ctx.now).toISOString(), draft: c.email ? draftEmail(o) : null });
    }
    await writeJson(bucket, OUTREACH_KEY, { checkedAt: new Date(ctx.now).toISOString(), lastRun, prospects: [...found, ...state.prospects].slice(0, 300) });
    const why = suggested.length ? (fresh.length ? '' : ` (all ${suggested.length} suggested were already known or big platforms)`) : ` (no list in the answer; stop: ${info.stopReason || '?'}; ends: "${lastRun.tail.slice(-160).replace(/\s+/g, ' ')}")`;
    return { rows: found.length, detail: `${found.length} new site${found.length === 1 ? '' : 's'}, ${found.filter(f => f.email).length} with a published email${why} ($${usd.toFixed(3)})` };
  },
};

export const OUTREACH_PROVIDERS = [competitorListings, linkOutreach];

// ---- reads + the owner's actions (from /jarvis/seo-data) ----------------------------------------

const DAY = 86400000;
export async function outreachState(bucket, now = Date.now()) {
  const state = (await readJson(bucket, OUTREACH_KEY)) || { prospects: [] };
  const decisions = (await readJson(bucket, DECISIONS_KEY)) || {};
  const conn = (await readJson(bucket, 'private/jarvis-connections.json')) || {};
  const sentToday = Object.values(decisions).filter(d => d.status === 'sent' && now - Date.parse(d.at) < DAY).length;
  return {
    checkedAt: state.checkedAt || null, from: conn.zoho?.email || null, cap: DAILY_CAP, sentToday,
    prospects: state.prospects.map(p => (decisions[p.site] ? { ...p, ...decisions[p.site], decidedAt: decisions[p.site].at } : p)),
  };
}

// The web search index misses many real listings (it barely knows gidgarage.com), so
// listings the owner recorded (seo_citations, "I'm on this") count as listed.
export async function listingsState(bucket, store) {
  const l = (await readJson(bucket, LISTINGS_KEY)) || { sites: [] };
  const mine = store ? await store.select('seo_citations', { select: 'platform,url' }).catch(() => []) : [];
  const bySite = new Map(mine.filter(c => c.url).map(c => [siteOf(c.url), c.url]));
  return { ...l, sites: (l.sites || []).map(s => (bySite.has(s.site) ? { ...s, gidListed: true, yourUrl: bySite.get(s.site) } : s)) };
}

async function decide(bucket, site, record) {
  const decisions = (await readJson(bucket, DECISIONS_KEY)) || {};
  decisions[site] = record;
  await writeJson(bucket, DECISIONS_KEY, decisions);
}

export async function skipOutreach({ bucket, site, now = Date.now() }) {
  const s = await outreachState(bucket, now);
  const p = s.prospects.find(x => x.site === site);
  if (!p) return { ok: false, error: 'No such site.' };
  if (p.status === 'sent') return { ok: false, error: 'Already emailed.' };
  await decide(bucket, site, { status: 'skipped', at: new Date(now).toISOString() });
  return { ok: true, site, status: 'skipped' };
}

// The owner reviewed this exact email and confirmed it. Recipient is always the
// address the site itself publishes; one email per site; daily cap; opt-out line kept.
export async function sendOutreach({ bucket, site, subject, body, reviewed, confirmed, now = Date.now(), send = sendZohoMail, fetchImpl }) {
  if (reviewed !== true || confirmed !== true) return { ok: false, error: 'Review the email and confirm before sending.' };
  const s = await outreachState(bucket, now);
  const p = s.prospects.find(x => x.site === site);
  if (!p?.email) return { ok: false, error: 'No published email for that site.' };
  if (p.status === 'sent') return { ok: false, error: `Already emailed ${p.email}.` };
  if (p.status === 'skipped') return { ok: false, error: 'You skipped this site.' };
  if (s.sentToday >= DAILY_CAP) return { ok: false, error: `Daily limit reached (${DAILY_CAP} a day keeps the mailbox out of spam filters). Try again tomorrow.` };
  const subj = clean(subject, 150);
  let text = String(body || '').trim().slice(0, 5000);
  if (!subj || text.length < 40) return { ok: false, error: 'Subject and message are required.' };
  if (!text.includes(OPT_OUT)) text = `${text}\n\n${OPT_OUT}`;
  const r = await send({ bucket, to: p.email, subject: subj, text, now, ...(fetchImpl ? { fetchImpl } : {}) });
  await decide(bucket, site, { status: 'sent', at: new Date(now).toISOString(), to: p.email, subject: subj, from: r.from });
  return { ok: true, site, to: p.email, from: r.from };
}
