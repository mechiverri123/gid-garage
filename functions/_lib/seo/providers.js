// SEO data providers. Each provider:
//   id, label, category, env (required), optionalEnv, docs (SEO_SETUP.md section)
//   status(env)            -> { status, missing[], note }   (no network)
//   sync(ctx, { from, to }) -> { rows, detail, cursorTo? }   (writes via ctx.store)
// Missing credentials are a status, never a crash. Statuses:
//   connected | ready_limited | not_configured | needs_authorization |
//   pending_approval | manual_only | error
// ctx = { env, fetch, store, now, settings }. Tests: tests/seo-providers.test.js

import { serviceAccountToken, refreshTokenAccess, googleApiError, parseServiceAccount, ProviderError } from './google-auth.js';
import { classifyQuery, gscLocality, cityLocality } from '../../../shared/seo/local-intent.js';
import { classifyCompetitor, parsePublicPage } from '../../../shared/seo/competitors.js';
import { isInsideServiceArea, SERVICE_AREA, findPlaces } from '../../../shared/seo/service-area.js';
import { aiAssistant, contentGuard } from '../../../shared/seo/demand.js';
import { MONITOR_PROVIDERS } from './monitors.js';
import { OUTREACH_PROVIDERS } from './outreach.js';

const missing = (env, keys) => keys.filter(k => !env[k]);
const ymd = d => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => ymd(new Date(new Date(`${ymd(d)}T12:00:00Z`).getTime() + n * 86400000));
const eachDay = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const envStatus = (env, required, note) => {
  const m = missing(env, required);
  return m.length ? { status: 'not_configured', missing: m, note } : { status: 'connected', missing: [], note };
};

// ---- Google Search Console ----------------------------------------------------------------
// The API needs the property name exactly: "sc-domain:gidgarage.com" (Domain
// property) or "https://gidgarage.com/" (URL prefix, trailing slash). A bare
// "gidgarage.com" is read by Google as http://gidgarage.com, which is never the
// property — so a bare domain means the Domain property.
export function gscSiteUrl(value) {
  const v = String(value || '').trim();
  if (/^sc-domain:/i.test(v)) return `sc-domain:${v.slice(10).trim().toLowerCase()}`;
  if (/^https?:\/\//i.test(v)) return v.endsWith('/') ? v : `${v}/`;
  return v ? `sc-domain:${v.replace(/\/+$/, '').toLowerCase()}` : v;
}

export const searchConsole = {
  id: 'search_console', label: 'Google Search Console', category: 'search',
  env: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL'], docs: 'search-console',
  maxHistoryDays: 480, lagDays: 3, // ~16 months kept by Google; recent days are provisional
  status(env) {
    const s = envStatus(env, this.env, 'Query-level data has no searcher city — locality is inferred from the query text and labeled likely_local/unknown, never confirmed.');
    if (s.status === 'connected' && !parseServiceAccount(env)) return { status: 'needs_authorization', missing: ['GOOGLE_SERVICE_ACCOUNT_JSON (invalid JSON)'], note: s.note };
    return s;
  },
  async sync(ctx, { from, to }) {
    const token = await serviceAccountToken(ctx.env, ['https://www.googleapis.com/auth/webmasters.readonly'], ctx.fetch, ctx.now);
    const site = gscSiteUrl(ctx.env.GSC_SITE_URL);
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
    const post = async body => {
      const res = await ctx.fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await googleApiError(res, 'Search Console');
        if (res.status === 403) e.message += ` Property used: "${site}". Add the service account (client_email) as a user on exactly that property, or set GSC_SITE_URL to the property name shown in Search Console.`;
        throw e;
      }
      return res.json();
    };
    let written = 0;
    for (let startRow = 0; ; startRow += 25000) {
      const data = await post({ startDate: from, endDate: to, dimensions: ['date', 'query', 'page', 'country', 'device'], rowLimit: 25000, startRow, dataState: 'all' });
      const rows = (data.rows || []).map(r => {
        const [date, query, page, country, device] = r.keys;
        const c = classifyQuery(query);
        return { date, query, page, country, device, clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10, intent_class: c.intentClass, locality: gscLocality({ country }, c), service: c.service, branded: c.branded };
      });
      if (rows.length) await ctx.store.upsert('seo_gsc_daily', rows, 'date,query,page,country,device');
      written += rows.length;
      if ((data.rows || []).length < 25000) break;
    }
    const totals = await post({ startDate: from, endDate: to, dimensions: ['date'], rowLimit: 1000, dataState: 'all' });
    const totalRows = (totals.rows || []).map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
    if (totalRows.length) await ctx.store.upsert('seo_gsc_totals', totalRows, 'date');
    return { rows: written, detail: `${written} query rows, ${totalRows.length} daily totals` };
  },
};

// ---- Google Business Profile Performance ---------------------------------------------------
export const GBP_METRICS = ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS', 'BUSINESS_CONVERSATIONS', 'BUSINESS_BOOKINGS'];
const dateParams = (prefix, d) => { const [y, m, day] = d.split('-').map(Number); return { [`${prefix}.year`]: y, [`${prefix}.month`]: m, [`${prefix}.day`]: day }; };

export const businessProfile = {
  id: 'business_profile', label: 'Google Business Profile', category: 'local',
  env: ['GBP_OAUTH_CLIENT_ID', 'GBP_OAUTH_CLIENT_SECRET', 'GBP_OAUTH_REFRESH_TOKEN', 'GBP_LOCATION_NAME'], docs: 'business-profile',
  maxHistoryDays: 540, lagDays: 3,
  status(env) {
    if (!env.GBP_OAUTH_CLIENT_ID || !env.GBP_OAUTH_CLIENT_SECRET) return { status: 'not_configured', missing: missing(env, ['GBP_OAUTH_CLIENT_ID', 'GBP_OAUTH_CLIENT_SECRET']), note: 'Business Profile APIs require an approved API-access request and an OAuth grant from the profile owner.' };
    if (!env.GBP_OAUTH_REFRESH_TOKEN) return { status: 'needs_authorization', missing: ['GBP_OAUTH_REFRESH_TOKEN'], note: 'Complete the OAuth consent step (SEO_SETUP.md).' };
    if (!env.GBP_LOCATION_NAME) return { status: 'not_configured', missing: ['GBP_LOCATION_NAME'], note: 'e.g. locations/1234567890' };
    if (env.GBP_API_APPROVED !== 'true') return { status: 'pending_approval', missing: ['GBP_API_APPROVED=true (after Google approves API access)'], note: 'Google must approve Business Profile API access for your project before data flows.' };
    return { status: 'connected', missing: [], note: 'Search keywords are monthly; low counts are reported by Google only as a threshold.' };
  },
  async sync(ctx, { from, to }) {
    const token = await refreshTokenAccess(ctx.env, 'GBP_OAUTH', ctx.fetch);
    const loc = ctx.env.GBP_LOCATION_NAME;
    const qs = new URLSearchParams({ ...dateParams('dailyRange.start_date', from), ...dateParams('dailyRange.end_date', to) });
    GBP_METRICS.forEach(m => qs.append('dailyMetrics', m));
    const res = await ctx.fetch(`https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw await googleApiError(res, 'Business Profile Performance');
    const data = await res.json();
    const rows = [];
    for (const series of data.multiDailyMetricTimeSeries || []) {
      for (const s of series.dailyMetricTimeSeries || []) {
        for (const p of s.timeSeries?.datedValues || []) {
          rows.push({ date: `${p.date.year}-${String(p.date.month).padStart(2, '0')}-${String(p.date.day).padStart(2, '0')}`, metric: s.dailyMetric, value: Number(p.value || 0) });
        }
      }
    }
    if (rows.length) await ctx.store.upsert('seo_gbp_daily', rows, 'date,metric');

    // Monthly search keywords (what people typed when the profile showed).
    const [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
    const kq = new URLSearchParams({ 'monthlyRange.start_month.year': fy, 'monthlyRange.start_month.month': fm, 'monthlyRange.end_month.year': ty, 'monthlyRange.end_month.month': tm });
    const kres = await ctx.fetch(`https://businessprofileperformance.googleapis.com/v1/${loc}/searchkeywords/impressions/monthly?${kq}`, { headers: { Authorization: `Bearer ${token}` } });
    let kws = 0;
    if (kres.ok) {
      const kd = await kres.json();
      const krows = (kd.searchKeywordsCounts || []).map(k => {
        const c = classifyQuery(k.searchKeyword);
        return { month: `${ty}-${String(tm).padStart(2, '0')}-01`, keyword: k.searchKeyword, impressions: k.insightsValue?.value != null ? Number(k.insightsValue.value) : null, threshold: k.insightsValue?.threshold != null ? Number(k.insightsValue.threshold) : null, intent_class: c.intentClass, service: c.service };
      });
      if (krows.length) await ctx.store.upsert('seo_gbp_keywords', krows, 'month,keyword');
      kws = krows.length;
    }
    return { rows: rows.length + kws, detail: `${rows.length} daily metric points, ${kws} search keywords` };
  },
};

// ---- GA4 ---------------------------------------------------------------------------------------
export const ga4 = {
  id: 'ga4', label: 'Google Analytics 4', category: 'analytics',
  env: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GA4_PROPERTY_ID'], docs: 'ga4', maxHistoryDays: 420, lagDays: 1,
  status(env) { return envStatus(env, this.env, 'City is IP-derived (approximate) — labeled likely_local at best. Phoenix is treated as unknown (mobile carriers).'); },
  async sync(ctx, { from, to }) {
    const token = await serviceAccountToken(ctx.env, ['https://www.googleapis.com/auth/analytics.readonly'], ctx.fetch, ctx.now);
    let written = 0;
    for (let offset = 0; ; offset += 10000) {
      const res = await ctx.fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${ctx.env.GA4_PROPERTY_ID}:runReport`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: from, endDate: to }], dimensions: ['date', 'landingPage', 'sessionSource', 'sessionMedium', 'city', 'region', 'country'].map(name => ({ name })), metrics: ['sessions', 'engagedSessions', 'keyEvents'].map(name => ({ name })), limit: 10000, offset }),
      });
      if (!res.ok) throw await googleApiError(res, 'GA4 Data API');
      const data = await res.json();
      const rows = (data.rows || []).map(r => {
        const [d, landing_page, source, medium, city, region, country] = r.dimensionValues.map(v => v.value);
        const [sessions, engaged, keyEvents] = r.metricValues.map(v => Number(v.value || 0));
        return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, landing_page, source, medium, city, region, country, sessions, engaged_sessions: engaged, key_events: keyEvents, locality: cityLocality({ city, region, country }), ai_assistant: aiAssistant(source) };
      });
      if (rows.length) await ctx.store.upsert('seo_ga4_daily', rows, 'date,landing_page,source,medium,city,region,country');
      written += rows.length;
      if (rows.length < 10000) break;
    }
    return { rows: written, detail: `${written} GA4 rows` };
  },
};

// ---- PageSpeed Insights + own-page technical audit ----------------------------------------------
const pageUrls = ctx => (Array.isArray(ctx.settings?.key_pages) && ctx.settings.key_pages.length ? ctx.settings.key_pages : ['https://gidgarage.com/']);
// A URL that cannot exist: a real 404 here is healthy; 200 means every bad URL
// serves the homepage (a "soft 404" — Google's JavaScript SEO guide).
export const SOFT_404_PROBE = 'https://gidgarage.com/__gid-seo-audit-missing-page';
// Every page the sitemap lists (plus key pages and the soft-404 probe), capped.
async function auditUrls(ctx) {
  const urls = new Set(pageUrls(ctx));
  try {
    const res = await ctx.fetch('https://gidgarage.com/sitemap.xml', { headers: { 'User-Agent': 'GID-Garage-SEO-Audit/1.0' } });
    if (res.ok) for (const m of (await res.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) urls.add(m[1]);
  } catch { /* sitemap unavailable: key pages only */ }
  return [...urls].slice(0, 40).concat(SOFT_404_PROBE);
}

// Resumable batches: sync.js passes ctx.batch = { offset, limit } sized to the
// invocation's subrequest budget; `next` is where the following call resumes
// (null = finished). Without ctx.batch the whole list runs.
function batchOf(ctx, items) {
  const offset = ctx.batch?.offset ?? 0;
  const slice = items.slice(offset, offset + (ctx.batch?.limit ?? items.length));
  const end = offset + slice.length;
  return { slice, offset, total: items.length, next: end < items.length ? end : null, label: end < items.length || offset ? ` (${offset + 1}-${end} of ${items.length})` : '' };
}

export const pageSpeed = {
  id: 'pagespeed', label: 'PageSpeed Insights', category: 'technical', env: [], optionalEnv: ['PAGESPEED_API_KEY'], docs: 'pagespeed', snapshot: true,
  status(env) { return env.PAGESPEED_API_KEY ? { status: 'connected', missing: [], note: '' } : { status: 'ready_limited', missing: ['PAGESPEED_API_KEY (optional, raises quota)'], note: 'Works without a key at a low quota.' }; },
  async sync(ctx) {
    const rows = [];
    const b = batchOf(ctx, pageUrls(ctx));
    for (const url of b.slice) {
      for (const strategy of ['mobile', 'desktop']) {
        const qs = new URLSearchParams({ url, strategy });
        qs.append('category', 'performance'); qs.append('category', 'seo');
        if (ctx.env.PAGESPEED_API_KEY) qs.set('key', ctx.env.PAGESPEED_API_KEY);
        const res = await ctx.fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`);
        if (!res.ok) throw await googleApiError(res, 'PageSpeed Insights');
        rows.push(parsePageSpeed(url, strategy, await res.json()));
      }
    }
    await ctx.store.insert('seo_pagespeed_runs', rows);
    return { rows: rows.length, detail: `${rows.length} PageSpeed runs${b.label}`, next: b.next };
  },
};

export function parsePageSpeed(url, strategy, data) {
  const lh = data.lighthouseResult || {};
  const field = data.loadingExperience?.metrics || {};
  const score = k => (lh.categories?.[k]?.score != null ? Math.round(lh.categories[k].score * 100) : null);
  const audit = k => lh.audits?.[k]?.numericValue;
  const inp = field.INTERACTION_TO_NEXT_PAINT?.percentile;
  return {
    url, strategy, perf_score: score('performance'), seo_score: score('seo'),
    lcp_ms: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? (audit('largest-contentful-paint') != null ? Math.round(audit('largest-contentful-paint')) : null),
    cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : (audit('cumulative-layout-shift') ?? null),
    inp_ms: inp ?? null, field_data: !!data.loadingExperience?.metrics,
  };
}

export const siteAudit = {
  id: 'site_audit', label: 'Own-site technical audit', category: 'technical', env: [], docs: 'site-audit', snapshot: true,
  status() { return { status: 'connected', missing: [], note: 'Reads the raw HTML of every sitemap page (what crawlers get before JavaScript runs) and checks that a missing page really returns 404.' }; },
  async sync(ctx) {
    const rows = [];
    const b = batchOf(ctx, await auditUrls(ctx));
    for (const url of b.slice) {
      const res = await ctx.fetch(url, { headers: { 'User-Agent': 'GID-Garage-SEO-Audit/1.0' } });
      // The probe is stored for its status only (a missing page is expected to fail).
      rows.push(url === SOFT_404_PROBE ? { url, title: null, meta_description: null, h1: null, canonical: null, schema_types: [], advertised_places: [], issues: [{ code: 'probe', severity: 'info', title: 'Soft-404 probe', detail: `HTTP ${res.status}`, status: res.status }] } : auditPage(url, res.ok ? await res.text() : '', res.status));
    }
    await ctx.store.insert('seo_page_audits', rows);
    return { rows: rows.length, detail: `${rows.length} pages audited${b.label}`, next: b.next };
  },
};

export function auditPage(url, html, httpStatus = 200) {
  const p = parsePublicPage(html);
  const pick = re => (html.match(re)?.[1] || '').trim();
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const issues = [];
  const add = (code, severity, title, detail) => issues.push({ code, severity, title, detail });
  if (httpStatus >= 400) add('http_error', 'high', 'Page returns an error', `HTTP ${httpStatus}.`);
  if (!p.title) add('missing_title', 'high', 'Missing page title', 'Add a title naming the service and Flagstaff.');
  // Legal pages (privacy, terms) aren't meant to rank for local searches.
  else if (!/flagstaff/i.test(p.title) && !/\/(privacy|terms)/i.test(url)) add('title_no_location', 'medium', 'Title doesn\'t mention Flagstaff', `"${p.title}"`);
  if (!p.description) add('missing_description', 'medium', 'Missing meta description', 'Describe the mobile service and area in ~150 characters.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add('no_viewport', 'high', 'No mobile viewport tag', 'Phones are where local searches happen.');
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) add('noindex', 'high', 'Page is set to noindex', 'Google is told not to index it.');
  if (!canonical) add('no_canonical', 'low', 'No canonical URL', 'Add <link rel="canonical">.');
  const localSchema = p.schemaTypes.some(t => /AutoRepair|LocalBusiness|AutomotiveBusiness/i.test(t));
  if (!localSchema) add('no_local_schema', 'medium', 'No LocalBusiness/AutoRepair schema', 'Add AutoRepair structured data with areaServed (not a street address — mobile business).');
  if (localSchema && !/"areaServed"/.test(html)) add('no_area_served', 'medium', 'Schema lacks areaServed', 'List the service area in structured data.');
  for (const problem of contentGuard(html.replace(/<[^>]+>/g, ' '))) add('guard', 'medium', 'Copy conflicts with the local rules', problem);
  const advertised = [...new Set(findPlaces(html.replace(/<[^>]+>/g, ' ')).places.map(pl => pl.name))];
  return { url, title: p.title, meta_description: p.description, h1: p.h1s[0] || null, canonical: canonical || null, schema_types: p.schemaTypes, advertised_places: advertised, issues };
}

// ---- Places API: own reviews + local competitor discovery ------------------------------------------
export const places = {
  id: 'places', label: 'Google Places (reviews + competitor discovery)', category: 'local',
  env: ['GOOGLE_PLACES_API_KEY'], optionalEnv: ['GOOGLE_PLACE_ID'], docs: 'places', snapshot: true,
  status(env) { return envStatus(env, this.env, 'Already used by the homepage reviews widget. Mobile competitors that hide their address may not appear — add them manually.'); },
  async sync(ctx) {
    const key = ctx.env.GOOGLE_PLACES_API_KEY;
    const get = async url => { const r = await ctx.fetch(url); const d = await r.json(); if (d.status && !['OK', 'ZERO_RESULTS'].includes(d.status)) throw new ProviderError(d.status === 'REQUEST_DENIED' ? 'needs_authorization' : 'error', `Places: ${d.status} ${d.error_message || ''}`); return d; };
    let written = 0;
    if (ctx.env.GOOGLE_PLACE_ID) {
      const own = await get(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(ctx.env.GOOGLE_PLACE_ID)}&fields=rating,user_ratings_total&key=${key}`);
      await ctx.store.insert('seo_review_snapshots', [{ subject: 'own', rating: own.result?.rating ?? null, review_count: own.result?.user_ratings_total ?? null }]);
      written += 1;
    }
    const found = new Map();
    const { lat, lng } = SERVICE_AREA.center;
    for (const q of ['mobile mechanic', 'auto repair', 'mobile auto repair']) {
      const d = await get(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&location=${lat},${lng}&radius=48280&key=${key}`);
      for (const r of d.results || []) if (r.place_id !== ctx.env.GOOGLE_PLACE_ID) found.set(r.place_id, r);
    }
    const rows = [...found.values()].map(r => {
      const loc = r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : null;
      const c = classifyCompetitor({ name: r.name, types: r.types || [], location: loc });
      const area = loc ? isInsideServiceArea(loc) : { inside: null, distanceMiles: null };
      return { id: r.place_id, name: r.name, kind: c.kind, tier: c.tier, is_mobile: c.isMobile, weight: c.weight, lat: loc?.lat ?? null, lng: loc?.lng ?? null, distance_miles: area.distanceMiles, inside_service_area: area.inside, rating: r.rating ?? null, review_count: r.user_ratings_total ?? null, source: 'places_api', last_seen: new Date(ctx.now).toISOString() };
    });
    if (rows.length) {
      await ctx.store.upsert('seo_competitors', rows, 'id');
      await ctx.store.insert('seo_review_snapshots', rows.map(r => ({ subject: r.id, rating: r.rating, review_count: r.review_count })));
    }
    // Text search doesn't return websites, so competitor page monitoring had
    // nothing to fetch. Look them up for the competitors that matter (in the
    // area, relevant, most-reviewed first), a few per run.
    const needSite = await ctx.store.select('seo_competitors', { select: 'id,name', website: 'is.null', inside_service_area: 'eq.true', weight: 'gt.0', status: 'eq.active', order: 'review_count.desc.nullslast', limit: '6' }).catch(() => []);
    let sites = 0;
    for (const c of needSite) {
      const d = await get(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(c.id)}&fields=website&key=${key}`).catch(() => null);
      const website = d?.result?.website || null;
      let domain = null;
      try { domain = website ? new URL(website).hostname.replace(/^www\./, '') : null; } catch { /* bad url */ }
      // No website on Google: remember that ('none') so it isn't looked up every week.
      await ctx.store.patch('seo_competitors', { id: `eq.${c.id}` }, { website: website || 'none', domain });
      if (website) sites += 1;
    }
    return { rows: written + rows.length, detail: `${rows.length} local businesses found (${rows.filter(r => r.tier === 'primary').length} mobile); ${sites} competitor website${sites === 1 ? '' : 's'} found` };
  },
};

// Public-page monitoring for competitors with a website (weekly is plenty).
export const competitorPages = {
  id: 'competitor_pages', label: 'Competitor website monitoring', category: 'competitors', env: [], docs: 'competitors', snapshot: true,
  status() { return { status: 'connected', missing: [], note: 'Fetches each competitor homepage/service page (public HTML only) to detect changes.' }; },
  async sync(ctx) {
    // Capped at 15 per weekly pass; stable order so batches resume deterministically.
    // Real websites only ('none' = checked, has no site), most relevant local competitors first.
    const comps = await ctx.store.select('seo_competitors', { select: 'id,name,website,tier', status: 'eq.active', kind: 'eq.business', website: 'like.http*', order: 'review_count.desc.nullslast', limit: '15' });
    const rows = [];
    const b = batchOf(ctx, comps.slice(0, 15));
    for (const c of b.slice) {
      const res = await ctx.fetch(c.website, { headers: { 'User-Agent': 'GID-Garage-SEO-Monitor/1.0' } }).catch(() => null);
      if (!res?.ok) continue;
      const p = parsePublicPage(await res.text());
      rows.push({ competitor_id: c.id, url: c.website, title: p.title, meta_description: p.description, h1s: p.h1s, services: p.services, content_hash: p.contentHash });
    }
    if (rows.length) await ctx.store.insert('seo_competitor_snapshots', rows);
    return { rows: rows.length, detail: `${rows.length} competitor pages captured${b.label}`, next: b.next };
  },
};

// ---- Bing Webmaster (optional) -------------------------------------------------------------------------
export const bing = {
  id: 'bing', label: 'Bing Webmaster Tools', category: 'search', env: ['BING_WEBMASTER_API_KEY', 'BING_SITE_URL'], docs: 'bing', snapshot: true,
  status(env) { return envStatus(env, this.env, 'Optional. Bing also powers some AI assistants\' web results.'); },
  async sync(ctx) {
    const res = await ctx.fetch(`https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=${encodeURIComponent(ctx.env.BING_SITE_URL)}&apikey=${ctx.env.BING_WEBMASTER_API_KEY}`);
    if (res.status === 401 || res.status === 403) throw new ProviderError('needs_authorization', `Bing: HTTP ${res.status}`);
    if (!res.ok) throw new ProviderError('error', `Bing: HTTP ${res.status}`);
    const data = await res.json();
    const rows = (data.d || []).map(r => {
      const c = classifyQuery(r.Query);
      const ms = Number(String(r.Date).match(/\d+/)?.[0]);
      return { date: Number.isFinite(ms) ? ymd(ms) : ymd(ctx.now), query: r.Query, clicks: r.Clicks, impressions: r.Impressions, position: r.AvgImpressionPosition, intent_class: c.intentClass, locality: gscLocality({ country: 'usa' }, c) };
    });
    if (rows.length) await ctx.store.upsert('seo_bing_daily', rows, 'date,query');
    return { rows: rows.length, detail: `${rows.length} Bing query rows` };
  },
};

// ---- Apple Business Connect (capability/status only) -------------------------------------------------
export const appleBusinessConnect = {
  id: 'apple_business_connect', label: 'Apple Business Connect', category: 'local', env: [], docs: 'apple', snapshot: true,
  status() { return { status: 'manual_only', missing: [], note: 'No self-serve insights API for a business this size (partner API only). Manage the place card and read Insights in the web dashboard. Verify service-area/hidden-address eligibility first — never list a fake address.' }; },
  async sync() { return { rows: 0, detail: 'manual only' }; },
};

// ---- Instagram (Graph API, business/creator account) --------------------------------------------------
export const instagram = {
  id: 'instagram', label: 'Instagram insights', category: 'social', env: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', 'META_GRAPH_VERSION'], docs: 'instagram', snapshot: true,
  status(env) { return envStatus(env, this.env, 'Audience-by-city needs a business/creator account with enough followers. Metric names change between Graph API versions — set META_GRAPH_VERSION explicitly.'); },
  async sync(ctx) {
    const v = ctx.env.META_GRAPH_VERSION; const id = ctx.env.INSTAGRAM_BUSINESS_ACCOUNT_ID; const token = ctx.env.INSTAGRAM_ACCESS_TOKEN;
    const get = async path => {
      const r = await ctx.fetch(`https://graph.facebook.com/${v}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new ProviderError(d?.error?.code === 190 ? 'needs_authorization' : 'error', `Instagram: ${d?.error?.message || r.status}`);
      return d;
    };
    const profile = await get(`${id}?fields=followers_count`);
    const today = ymd(ctx.now);
    const ins = await get(`${id}/insights?metric=reach,profile_views,website_clicks&period=day&metric_type=total_value`).catch(() => ({ data: [] }));
    const val = name => ins.data?.find(m => m.name === name)?.total_value?.value ?? null;
    await ctx.store.upsert('seo_instagram_daily', [{ date: today, followers: profile.followers_count ?? null, reach: val('reach'), profile_views: val('profile_views'), website_clicks: val('website_clicks') }], 'date');
    const aud = await get(`${id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city`).catch(() => null);
    const cities = aud?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    const rows = cities.map(c => { const city = c.dimension_values?.[0] || ''; return { captured_at: today, city, followers: c.value, locality: cityLocality({ city: city.split(',')[0], region: city.split(',')[1]?.trim() }) }; });
    if (rows.length) await ctx.store.upsert('seo_instagram_audience', rows, 'captured_at,city');
    return { rows: 1 + rows.length, detail: `followers ${profile.followers_count ?? '?'}, ${rows.length} audience cities` };
  },
};

// ---- Google Ads (optional) ------------------------------------------------------------------------------
export const googleAds = {
  id: 'google_ads', label: 'Google Ads', category: 'ads',
  env: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_OAUTH_CLIENT_ID', 'GOOGLE_ADS_OAUTH_CLIENT_SECRET', 'GOOGLE_ADS_OAUTH_REFRESH_TOKEN', 'GOOGLE_ADS_API_VERSION'], optionalEnv: ['GOOGLE_ADS_LOGIN_CUSTOMER_ID'], docs: 'google-ads',
  maxHistoryDays: 365, lagDays: 1,
  status(env) {
    if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) return { status: 'not_configured', missing: ['GOOGLE_ADS_DEVELOPER_TOKEN'], note: 'Optional. A developer token needs Google approval (Basic access) before it can read a live account.' };
    if (!env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN) return { status: 'needs_authorization', missing: missing(env, this.env), note: '' };
    const m = missing(env, this.env);
    return m.length ? { status: 'not_configured', missing: m, note: '' } : { status: 'connected', missing: [], note: 'Uses the physical location of users (user_location_view) — city-level, so the radius check is approximate.' };
  },
  async sync(ctx, { from, to }) {
    const token = await refreshTokenAccess(ctx.env, 'GOOGLE_ADS_OAUTH', ctx.fetch);
    const headers = { Authorization: `Bearer ${token}`, 'developer-token': ctx.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json', ...(ctx.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': ctx.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}) };
    const base = `https://googleads.googleapis.com/${ctx.env.GOOGLE_ADS_API_VERSION}/customers/${ctx.env.GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`;
    const search = async query => {
      const res = await ctx.fetch(base, { method: 'POST', headers, body: JSON.stringify({ query }) });
      if (!res.ok) { const e = await googleApiError(res, 'Google Ads'); if (/DEVELOPER_TOKEN_NOT_APPROVED|not approved/i.test(e.message)) e.status = 'pending_approval'; throw e; }
      return (await res.json()).results || [];
    };
    const rows = await search(`SELECT segments.date, campaign.name, user_location_view.country_criterion_id, segments.geo_target_city, metrics.clicks, metrics.cost_micros, metrics.conversions FROM user_location_view WHERE segments.date BETWEEN '${from}' AND '${to}' AND user_location_view.targeting_location = TRUE`);
    const cityIds = [...new Set(rows.map(r => r.segments?.geoTargetCity).filter(Boolean))];
    const names = new Map();
    if (cityIds.length) {
      const geo = await search(`SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${cityIds.map(c => `'${c}'`).join(',')})`);
      for (const g of geo) names.set(g.geoTargetConstant.resourceName, g.geoTargetConstant.canonicalName || g.geoTargetConstant.name);
    }
    const out = rows.map(r => {
      const label = names.get(r.segments?.geoTargetCity) || 'unknown city';
      const v = isInsideServiceArea(label);
      return { date: r.segments.date, platform: 'google_ads', campaign: r.campaign?.name || '', location_label: label, granularity: 'city', inside_area: v.inside, clicks: Number(r.metrics?.clicks || 0), cost: Number(r.metrics?.costMicros || 0) / 1e6, conversions: Number(r.metrics?.conversions || 0) };
    });
    if (out.length) await ctx.store.upsert('seo_ads_location_daily', out, 'date,platform,campaign,location_label');
    return { rows: out.length, detail: `${out.length} Google Ads location rows` };
  },
};

// ---- Meta Ads (optional) -----------------------------------------------------------------------------------
export const metaAds = {
  id: 'meta_ads', label: 'Meta Ads', category: 'ads', env: ['META_ADS_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_VERSION'], docs: 'meta-ads', maxHistoryDays: 365, lagDays: 1,
  status(env) { return envStatus(env, this.env, 'Optional. Meta reports location only by region/DMA — it cannot tell whether a click was inside the 30-mile radius (inside_area stays unknown).'); },
  async sync(ctx, { from, to }) {
    const qs = new URLSearchParams({ fields: 'spend,clicks,actions,campaign_name', breakdowns: 'region', level: 'campaign', time_increment: '1', time_range: JSON.stringify({ since: from, until: to }), access_token: ctx.env.META_ADS_ACCESS_TOKEN });
    const res = await ctx.fetch(`https://graph.facebook.com/${ctx.env.META_GRAPH_VERSION}/act_${ctx.env.META_AD_ACCOUNT_ID}/insights?${qs}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProviderError(d?.error?.code === 190 ? 'needs_authorization' : 'error', `Meta Ads: ${d?.error?.message || res.status}`);
    const rows = (d.data || []).map(r => ({
      date: r.date_start, platform: 'meta_ads', campaign: r.campaign_name || '', location_label: r.region || '', granularity: 'region',
      inside_area: String(r.region || '').toLowerCase() === 'arizona' ? null : false, // a non-Arizona region is certainly outside; Arizona can't be narrowed further
      clicks: Number(r.clicks || 0), cost: Number(r.spend || 0), conversions: (r.actions || []).filter(a => /lead|contact|schedule/i.test(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0),
    }));
    if (rows.length) await ctx.store.upsert('seo_ads_location_daily', rows, 'date,platform,campaign,location_label');
    return { rows: rows.length, detail: `${rows.length} Meta Ads region rows` };
  },
};

// ---- Weather (seasonality) ---------------------------------------------------------------------------------------
export const weatherForecast = {
  id: 'weather_forecast', label: 'NWS forecast (Flagstaff)', category: 'seasonality', env: [], optionalEnv: ['SEO_CONTACT_EMAIL'], docs: 'weather', snapshot: true,
  status() { return { status: 'connected', missing: [], note: 'api.weather.gov — free, no key. Used to anticipate cold snaps.' }; },
  async sync(ctx) {
    const ua = { 'User-Agent': `GID Garage SEO (${ctx.env.SEO_CONTACT_EMAIL || 'gidgarage.com'})`, Accept: 'application/geo+json' };
    const { lat, lng } = SERVICE_AREA.center;
    const pt = await ctx.fetch(`https://api.weather.gov/points/${lat},${lng}`, { headers: ua });
    if (!pt.ok) throw new ProviderError('error', `NWS points: HTTP ${pt.status}`);
    const fc = await ctx.fetch((await pt.json()).properties.forecast, { headers: ua });
    if (!fc.ok) throw new ProviderError('error', `NWS forecast: HTTP ${fc.status}`);
    const byDate = new Map();
    for (const p of (await fc.json()).properties?.periods || []) {
      const date = String(p.startTime).slice(0, 10);
      const d = byDate.get(date) || { date, tmin_f: null, tmax_f: null, short_forecast: null };
      if (p.isDaytime) { d.tmax_f = p.temperature; d.short_forecast = p.shortForecast; } else d.tmin_f = p.temperature;
      byDate.set(date, d);
    }
    const rows = [...byDate.values()];
    if (rows.length) await ctx.store.upsert('seo_weather_forecast', rows, 'date');
    return { rows: rows.length, detail: `${rows.length} forecast days` };
  },
};

export const weatherHistory = {
  id: 'weather_history', label: 'NOAA daily weather history', category: 'seasonality', env: ['NOAA_CDO_TOKEN'], optionalEnv: ['NOAA_STATION_ID'], docs: 'weather', maxHistoryDays: 730, lagDays: 5,
  status(env) { return envStatus(env, this.env, 'Optional. Free NOAA token. Defaults to Flagstaff Pulliam Airport (GHCND:USW00003103) — verify the station id.'); },
  async sync(ctx, { from, to }) {
    const station = ctx.env.NOAA_STATION_ID || 'GHCND:USW00003103';
    const qs = new URLSearchParams({ datasetid: 'GHCND', stationid: station, startdate: from, enddate: to, units: 'standard', limit: '1000', datatypeid: 'TMIN' });
    ['TMAX', 'SNOW', 'PRCP'].forEach(t => qs.append('datatypeid', t));
    const res = await ctx.fetch(`https://www.ncei.noaa.gov/cdo-web/api/v2/data?${qs}`, { headers: { token: ctx.env.NOAA_CDO_TOKEN } });
    if (res.status === 400 || res.status === 401) throw new ProviderError('needs_authorization', `NOAA: HTTP ${res.status}`);
    if (!res.ok) throw new ProviderError('error', `NOAA: HTTP ${res.status}`);
    const byDate = new Map();
    for (const r of (await res.json()).results || []) {
      const date = r.date.slice(0, 10);
      const d = byDate.get(date) || { date, tmin_f: null, tmax_f: null, snow_in: null, precip_in: null, source: station };
      if (r.datatype === 'TMIN') d.tmin_f = r.value; if (r.datatype === 'TMAX') d.tmax_f = r.value; if (r.datatype === 'SNOW') d.snow_in = r.value; if (r.datatype === 'PRCP') d.precip_in = r.value;
      byDate.set(date, d);
    }
    const rows = [...byDate.values()];
    if (rows.length) await ctx.store.upsert('seo_weather_daily', rows, 'date');
    return { rows: rows.length, detail: `${rows.length} weather days` };
  },
};

export const PROVIDERS = [searchConsole, businessProfile, ga4, places, pageSpeed, siteAudit, competitorPages, bing, instagram, googleAds, metaAds, weatherForecast, weatherHistory, appleBusinessConnect, ...MONITOR_PROVIDERS, ...OUTREACH_PROVIDERS];

export function providerStatuses(env) {
  return PROVIDERS.map(p => ({ id: p.id, label: p.label, category: p.category, docs: p.docs, ...p.status(env) }));
}

export { eachDay, addDays, ymd };
