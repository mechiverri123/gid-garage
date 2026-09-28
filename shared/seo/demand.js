// Local demand intelligence: service clusters, local customer-demand gaps,
// local authority, citation consistency, AI-assistant referrals and content
// guards. Pure. Tests: tests/seo-demand.test.js

import { classifyQuery, gscLocality } from './local-intent.js';
import { localOpportunityScore } from './scoring.js';
import { serviceEligibility, SERVICE_CATALOG } from './services.js';

const LOCALISH = new Set(['confirmed_local', 'likely_local']);

// Group Search Console rows (+ optional GBP keyword counts) by service.
// rows: [{query, page, clicks, impressions, position, country}]
export function serviceClusters(rows, gbpKeywords = [], services = SERVICE_CATALOG) {
  const clusters = new Map();
  const get = id => {
    if (!clusters.has(id)) {
      const s = services.find(x => x.id === id);
      clusters.set(id, { service: id, label: s?.label || id, offered: s?.offered ?? 'unknown', localImpressions: 0, localClicks: 0, allImpressions: 0, gbpImpressions: 0, bestLocalPosition: null, weightedPosSum: 0, pages: new Set(), queries: [] });
    }
    return clusters.get(id);
  };
  for (const r of rows) {
    const c = classifyQuery(r.query);
    const loc = gscLocality(r, c);
    const id = c.service || (c.branded ? 'brand' : null);
    if (!id || id === 'brand') continue;
    const g = get(id);
    g.allImpressions += r.impressions || 0;
    if (LOCALISH.has(loc) && c.intentClass !== 'nonlocal_low_value') {
      g.localImpressions += r.impressions || 0;
      g.localClicks += r.clicks || 0;
      g.weightedPosSum += (r.position || 0) * (r.impressions || 0);
      if (r.position && (g.bestLocalPosition == null || r.position < g.bestLocalPosition)) g.bestLocalPosition = r.position;
      if (r.page) g.pages.add(r.page);
      g.queries.push({ query: r.query, impressions: r.impressions, clicks: r.clicks, position: r.position, intentClass: c.intentClass, locality: loc });
    }
  }
  // GBP search keywords are local by nature (Maps/local discovery).
  for (const k of gbpKeywords) {
    const c = classifyQuery(k.keyword);
    if (!c.service || c.intentClass === 'nonlocal_low_value') continue;
    get(c.service).gbpImpressions += k.impressions || 0;
  }
  return [...clusters.values()].map(g => ({
    ...g,
    avgLocalPosition: g.localImpressions ? Math.round((g.weightedPosSum / g.localImpressions) * 10) / 10 : null,
    pages: [...g.pages],
    queries: g.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 15),
    weightedPosSum: undefined,
  })).sort((a, b) => (b.localImpressions + b.gbpImpressions) - (a.localImpressions + a.gbpImpressions));
}

// A gap only counts when: nearby people search for it, GID offers it, intent
// is meaningful, and GID is underrepresented. Competitor coverage adds weight.
export function demandGaps(clusters, { competitors = [], minLocalDemand = 10, weakPosition = 10, services = SERVICE_CATALOG } = {}) {
  const gaps = [];
  for (const c of clusters) {
    const demand = c.localImpressions + c.gbpImpressions;
    if (!serviceEligibility(c.service, services).eligible) continue; // referred-out or unconfirmed: never a gap
    if (demand < minLocalDemand) continue;
    const underrepresented = !c.pages.length || c.avgLocalPosition == null || c.avgLocalPosition > weakPosition;
    if (!underrepresented) continue;
    const covering = competitors.filter(x => x.kind === 'business' && x.weight > 0 && (x.services || []).includes(c.service));
    const pressure = Math.min(1, covering.reduce((s, x) => s + x.weight, 0) / 2);
    const scored = localOpportunityScore({ intentClass: 'high_local_commercial', locality: 'likely_local', serviceOffered: c.offered, position: c.avgLocalPosition, impressions: demand, competitorPressure: 0, confidence: c.offered === true ? 0.8 : 0.5 });
    gaps.push({
      service: c.service, label: c.label, localDemand: demand, avgLocalPosition: c.avgLocalPosition, pages: c.pages,
      competitorsCovering: covering.map(x => x.name), competitorPressure: Math.round(pressure * 100) / 100,
      score: Math.min(100, scored.score + Math.round(10 * pressure)), // competitor coverage raises urgency for a gap
      why: !c.pages.length ? 'No page of ours shows up for local searches about this service.' : `Our best local visibility averages position ${c.avgLocalPosition}.`,
    });
  }
  return gaps.sort((a, b) => b.score - a.score);
}

// Local demand for services the owner hasn't confirmed — shown as "confirm if
// you offer this", never as work to do.
export function unconfirmedServiceDemand(clusters, services = SERVICE_CATALOG) {
  return clusters
    .filter(c => serviceEligibility(c.service, services).reason === 'unconfirmed' && (c.localImpressions + c.gbpImpressions) > 0)
    .map(c => ({ service: c.service, label: c.label, localDemand: c.localImpressions + c.gbpImpressions, note: 'Not a confirmed GID service — confirm it in SEO settings before any optimization is suggested.' }));
}

// Demand for services GID doesn't offer, or from outside the radius — reported,
// never turned into "go rank for this".
export function nonOpportunities(rows) {
  const unsupported = new Map();
  const outside = new Map();
  for (const r of rows) {
    const c = classifyQuery(r.query);
    if (c.serviceOffered === false && c.geo !== 'outside') unsupported.set(c.service, (unsupported.get(c.service) || 0) + (r.impressions || 0));
    if (c.geo === 'outside') outside.set(c.outsidePlace, (outside.get(c.outsidePlace) || 0) + (r.impressions || 0));
  }
  return {
    unsupportedServiceDemand: [...unsupported].map(([service, impressions]) => ({ service, impressions })).sort((a, b) => b.impressions - a.impressions),
    outsideAreaDemand: [...outside].map(([place, impressions]) => ({ place, impressions, requiresExpansionDecision: true })).sort((a, b) => b.impressions - a.impressions),
  };
}

// ---- local authority -----------------------------------------------------------

// Starting points only — real, well-known platforms plus the Flagstaff Chamber.
// Owner adds the rest; nothing here is a claimed relationship.
export const AUTHORITY_STARTERS = [
  { name: 'Google Business Profile', url: 'https://business.google.com', kind: 'core_listing', local: true },
  { name: 'Bing Places', url: 'https://www.bingplaces.com', kind: 'core_listing', local: true },
  { name: 'Apple Business Connect', url: 'https://businessconnect.apple.com', kind: 'core_listing', local: true },
  { name: 'Yelp', url: 'https://biz.yelp.com', kind: 'directory', local: false },
  { name: 'Better Business Bureau', url: 'https://www.bbb.org', kind: 'directory', local: false },
  { name: 'Nextdoor (business page)', url: 'https://business.nextdoor.com', kind: 'community', local: true },
  { name: 'Flagstaff Chamber of Commerce', url: 'https://www.flagstaffchamber.com', kind: 'chamber', local: true },
];

const KIND_VALUE = { core_listing: 1.0, chamber: 0.85, local_news: 0.8, community: 0.7, local_org: 0.75, local_supplier: 0.65, directory: 0.5, other: 0.3 };

export function authorityScore({ kind = 'other', local = false, relevance = 0.5, effort = 0.5 } = {}) {
  // Local relevance outweighs generic authority; effort discounts a little.
  const v = (KIND_VALUE[kind] ?? 0.3) * (local ? 1 : 0.55) * (0.6 + 0.4 * relevance) * (1 - 0.3 * effort);
  return Math.round(v * 100);
}

// ---- citation consistency (service-area business rules) --------------------------

const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const host = u => { try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; } };
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// canonical: { name, phone, website, hideAddress: true } for a service-area business.
export function citationIssues(canonical, listing) {
  const issues = [];
  if (listing.observed_name && normName(listing.observed_name) !== normName(canonical.name)) issues.push({ field: 'name', severity: 'medium', detail: `Listed as "${listing.observed_name}", expected "${canonical.name}".` });
  if (listing.observed_phone && digits(listing.observed_phone) !== digits(canonical.phone)) issues.push({ field: 'phone', severity: 'high', detail: `Phone ${listing.observed_phone} doesn't match ${canonical.phone}.` });
  if (listing.observed_website && host(listing.observed_website) !== host(canonical.website)) issues.push({ field: 'website', severity: 'medium', detail: `Links to ${listing.observed_website}, not ${canonical.website}.` });
  if (canonical.hideAddress && listing.observed_address_shown) issues.push({ field: 'address', severity: 'medium', detail: 'Shows a street address — a mobile service-area business should show its service area instead, per the platform\'s rules.' });
  return issues;
}

// ---- AI assistant referrals (measurable via GA4 session source) -------------------

const AI_SOURCES = [['chatgpt', /chatgpt\.com|chat\.openai\.com|openai/i], ['perplexity', /perplexity/i], ['gemini', /gemini\.google|bard\.google/i], ['copilot', /copilot\.microsoft|bing\.com\/chat/i], ['claude', /claude\.ai/i]];
export function aiAssistant(source) {
  const hit = AI_SOURCES.find(([, re]) => re.test(String(source || '')));
  return hit ? hit[0] : null;
}

// ---- content guards ---------------------------------------------------------------

const NAU_AFFILIATION = /\b(official|preferred|approved|authorized|partner(ed)?( with)?|endorsed|sponsored)\b[^.]{0,40}\b(nau|northern arizona university|lumberjacks?)\b|\b(nau|northern arizona university)('s)?\s+(official|preferred|approved|partner)\b|\bon[- ]campus\b/i;
const STOREFRONT = /\b(visit our (shop|garage|location|store)|come (in|by) (to )?our (shop|garage)|stop by (our|the) (shop|garage)|walk[- ]ins? welcome|drop (it|your car) off at our)\b/i;

// Returns reasons a piece of suggested copy must not be used.
export function contentGuard(text) {
  const problems = [];
  if (NAU_AFFILIATION.test(text)) problems.push('Implies an NAU affiliation, endorsement or on-campus operation GID does not have.');
  if (STOREFRONT.test(text)) problems.push('Storefront language — GID is mobile; use call / request a quote / schedule mobile service.');
  return problems;
}
