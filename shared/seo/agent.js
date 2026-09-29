// The Local SEO agent layer: turns detector output + GID's own history into a
// prioritised, explained action queue, and learns which kinds of actions have
// actually moved GID's numbers. Pure functions — ops.js feeds them data.
// Tests: tests/seo-agent.test.js
//
//   detectors (what's wrong/possible) ──▶ enrich (why / action / impact / effort /
//   sources) ──▶ GID Opportunity Score ──▶ HIGH / MEDIUM / LOW ──▶ applied ──▶
//   7/30/90/180-day outcomes ──▶ per-category learning ──▶ next score
//
// The score is GID's own prioritisation number, not a Google ranking score.

import { KNOWLEDGE } from './knowledge.js';
import { reviewRivals } from './agent-detectors.js';
import { SERVICE_CATALOG } from './services.js';

export const CATEGORIES = ['GBP', 'REVIEWS', 'WEBSITE', 'TECHNICAL SEO', 'CONTENT', 'LOCAL AUTHORITY', 'CITATIONS', 'BACKLINKS', 'COMPETITOR GAP', 'CONVERSION', 'OTHER'];
const IMPACT = { very_high: 1, high: 0.82, moderate: 0.6, low: 0.35 };
const CONF = { high: 1, medium: 0.8, low: 0.55 };
const EFFORT = { very_low: 1, low: 1.1, moderate: 1.35, high: 1.7 };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// ---- playbook: what each finding means and exactly what to do ---------------------------
// group: findings that share one fix are shown as one action (e.g. nine searches
// that all need the homepage title rewritten).
const pageOf = r => r.evidence?.page || r.evidence?.url || 'https://gidgarage.com/';
const short = u => String(u || '').replace(/^https?:\/\/(www\.)?gidgarage\.com/, '') || '/';
const T = {
  ctr_opportunity: r => ({
    category: 'WEBSITE', impact: 'moderate', effort: 'very_low', blueprint: 'now', group: `ctr|${pageOf(r)}`,
    groupTitle: n => `Rewrite the ${short(pageOf(r)) === '/' ? 'homepage' : short(pageOf(r))} title and description (${n} searches under-clicked)`,
    why: 'You already show on page one for these searches, but fewer people click than usual for that position. A clearer title and description is the cheapest way to turn existing impressions into calls.',
    action: 'Edit the <title> and <meta name="description"> in index.html (served for this page). Lead with the service and "Flagstaff", mention that you come to them, and the phone number in the description, e.g. "Mobile Mechanic in Flagstaff, AZ — We Come to You | GID Garage". Keep titles under ~60 characters.',
    sources: ['title_ctr'], files: ['index.html'],
  }),
  // GID's core search ("mobile mechanic flagstaff") near page one is worth more than any other query.
  striking_distance: r => ({ category: 'CONTENT', impact: CORE_QUERY.test(r.evidence?.query || '') ? 'very_high' : 'high', effort: 'low', blueprint: '30d',
    why: 'This search sits just off page one. Page-one positions get most of the clicks, so a small relevance gain can matter a lot.',
    action: 'Strengthen the page that should rank: add a clearly headed section for this exact service in Flagstaff, real job photos, the process and price context, and 2–3 FAQs from real customer questions; link to it from the homepage.', sources: ['service_pages', 'local_ranking_factors'] }),
  demand_gap: () => ({ category: 'CONTENT', impact: 'high', effort: 'moderate', blueprint: '30d',
    why: 'Local people search for this service and GID offers it, but no page on the site is built for it, so Google has little reason to show GID.',
    action: 'Create one genuine service page for it (not per-town copies): what you do, how the mobile visit works, typical price range, real photos from your jobs, FAQs, and a booking button.', sources: ['service_pages', 'spam_doorway'] }),
  review_velocity_gap: () => ({ category: 'REVIEWS', impact: 'very_high', effort: 'low', blueprint: 'now',
    why: 'Prominence (reviews count and recency) is one of the three things Google says drives local ranking. A competitor adding reviews faster pulls ahead over time.',
    action: 'Ask every customer after every job — not just happy ones — with the Google review link (the follow-up email already does this). Reply to each new review with something specific about the job.', sources: ['local_ranking_factors', 'reviews_asking', 'reviews_no_incentives'] }),
  review_gap: () => ({ category: 'REVIEWS', impact: 'very_high', effort: 'low', blueprint: 'now',
    why: 'Businesses ranking above GID in the area have several times more reviews. Review count and score are part of prominence, one of Google\'s three local ranking factors.',
    action: 'Make the review request part of every job close-out: send the Google review link the same day (text or email), to every customer. Never offer anything in return and never filter who gets asked. Reply to every review within a few days.', sources: ['local_ranking_factors', 'reviews_asking', 'reviews_no_incentives', 'review_velocity'] }),
  gbp_actions_drop: () => ({ category: 'GBP', impact: 'high', effort: 'low', blueprint: 'now',
    why: 'Calls, website clicks and direction requests from the profile fell sharply; that is lost business, not just visibility.',
    action: 'Open Business Profile Manager: check for a suspension or pending edits, confirm hours and special hours, primary category, phone and website link. Reply to recent reviews.', sources: ['gbp_complete_info'] }),
  mobile_speed: () => ({ category: 'TECHNICAL SEO', impact: 'moderate', effort: 'moderate', blueprint: '30d',
    why: 'Most local searches are on phones; a slow page loses callers before it loads.',
    action: 'Run PageSpeed Insights on this URL and fix the largest item first (usually the hero image: serve WebP/AVIF, correct size, preload only it; defer non-critical scripts).', sources: ['js_prerender'] }),
  citation: () => ({ category: 'CITATIONS', impact: 'moderate', effort: 'low', blueprint: '7d',
    why: 'Inconsistent name/phone/website across listings confuses customers and search engines about which business is which.',
    action: 'Edit the listing so the name, phone and website exactly match the Google profile. Keep the address hidden (service-area business).', sources: ['gbp_service_area'] }),
  competitor_move: () => ({ category: 'COMPETITOR GAP', impact: 'moderate', effort: 'moderate', blueprint: '30d',
    why: 'A nearby competitor started promoting a service GID offers. If their page is better, they take those searches.',
    action: 'Compare their page with yours for that service; make sure yours shows real work, clear pricing context and how the mobile visit works.', sources: ['service_pages'] }),
  seasonal_prep: () => ({ category: 'CONTENT', impact: 'moderate', effort: 'low', blueprint: '7d',
    why: 'Demand for this rises at this time of year; being visible before the peak captures it.',
    action: 'Post a Google Business Profile update about the service a week or two before the peak and make sure the matching page is current.', sources: ['gbp_complete_info'] }),
  cold_snap: () => ({ category: 'GBP', impact: 'low', effort: 'very_low', blueprint: 'now',
    why: 'Cold snaps cause no-starts; people search for help that morning.', action: 'Post a short Business Profile update offering mobile no-start/battery help this week.', sources: ['gbp_complete_info'] }),
  ads_outside_area: () => ({ category: 'CONVERSION', impact: 'high', effort: 'very_low', blueprint: 'now',
    why: 'Money spent reaching people outside the service area can\'t become jobs.', action: 'In the ads account set location targeting to "Presence: people in or regularly in" the 30-mile radius.', sources: [] }),
  job_case_study: () => ({ category: 'CONTENT', impact: 'moderate', effort: 'moderate', blueprint: '90d',
    why: 'Real completed jobs show first-hand experience that generic competitor pages can\'t. A few strong ones beat many thin ones.',
    action: 'Pick one candidate below, write a short case study: vehicle, the symptom, how you diagnosed it, what you replaced, before/after photos, and the outcome. No customer names or addresses. Link it from the matching service page.', sources: ['real_job_content', 'spam_scaled'] }),
  nonlocal_traffic_growth: () => ({ category: 'OTHER', impact: 'low', effort: 'very_low', blueprint: 'long', why: 'Growth from outside the service area can\'t become jobs.', action: 'No action — keep the local service pages as the priority.', sources: [] }),
  knowledge_update: () => ({ category: 'OTHER', impact: 'moderate', effort: 'very_low', blueprint: 'now',
    why: 'A Google document the recommendations rely on changed.', action: 'Open the source, read what changed, then keep, update or mark the guidance superseded on the Research tab.', sources: [] }),
};
// Technical findings are keyed by the audit issue code.
const TECH = {
  soft_404: { category: 'TECHNICAL SEO', impact: 'moderate', effort: 'low', blueprint: '7d',
    why: 'Any mistyped or old URL returns HTTP 200 with the homepage. Google treats these as soft 404s, wastes crawling on them and can index junk URLs.',
    action: 'Make unknown routes return a real 404: in public/_redirects keep the explicit routes (/, /service-area/*, /jarvis, /admin …) and add a final catch-all to a 404 page served with status 404 (Cloudflare Pages serves 404.html with a 404 status when it exists), or have the app add <meta name="robots" content="noindex"> on its not-found view.',
    sources: ['js_soft404'], files: ['public/_redirects', 'public/404.html', 'src/App.tsx'] },
  canonical_conflict: { category: 'TECHNICAL SEO', impact: 'high', effort: 'moderate', blueprint: '7d',
    why: 'These pages say "canonical = homepage" in their HTML and then JavaScript changes it to themselves. Google says a JavaScript canonical must match the original HTML; conflicting signals make Google guess.',
    action: 'Serve each page\'s canonical, title and description in the HTML itself: pre-render the service-area pages at build time (a static HTML file per page, generated from the same SERVICE_AREAS list) or drop the canonical tag from index.html and let each route set its own consistently.',
    sources: ['js_canonical', 'js_prerender'], files: ['index.html', 'src/App.tsx', 'vite.config.ts'] },
  duplicate_raw_titles: { category: 'TECHNICAL SEO', impact: 'moderate', effort: 'moderate', blueprint: '30d',
    why: 'Before JavaScript runs, every page has the same title and description, so crawlers that don\'t render (and Google before rendering) see copies of the homepage.',
    action: 'Pre-render key pages so each ships its own <title>, description and H1 in the HTML (build step writing dist/<route>/index.html).', sources: ['js_prerender'], files: ['vite.config.ts', 'index.html'] },
  no_h1_raw: { category: 'WEBSITE', impact: 'moderate', effort: 'low', blueprint: '30d',
    why: 'The HTML Google fetches has no H1 or visible text at all — everything appears only after JavaScript. Pre-rendered text is read immediately and by every crawler.',
    action: 'Pre-render the homepage (and service pages) so the H1 "Mobile Mechanic in Flagstaff, AZ" and the core copy are in the HTML.', sources: ['js_prerender'], files: ['index.html', 'vite.config.ts'] },
  doorway_risk: { category: 'CONTENT', impact: 'high', effort: 'low', blueprint: 'now',
    why: 'Many near-identical town pages built to rank for "mobile mechanic <town>" fit Google\'s definition of doorway abuse — and some towns are outside the service area.',
    action: 'Keep town pages only where they carry genuinely different, useful information (real jobs done there, drive time, local notes). Remove towns outside the radius from the sitemap and the service-area list, or make them one "areas we serve" page.',
    sources: ['spam_doorway', 'gbp_service_area'], files: ['public/sitemap.xml', 'src/App.tsx'] },
  service_page_gap: { category: 'CONTENT', impact: 'very_high', effort: 'moderate', blueprint: '30d', group: 'service_pages',
    groupTitle: n => `Build dedicated service pages (${n} offered services have none)`,
    why: 'GID offers this service but the site has no page for it — only the homepage and town pages exist. Competitors with a dedicated page are more relevant for these searches.',
    action: 'Build one real page for the service (e.g. /brake-repair-flagstaff): what\'s included, how the mobile visit works, price range, real photos from your jobs, FAQs customers actually ask, and a booking button. Add it to the sitemap and link it from the homepage.',
    sources: ['service_pages', 'local_ranking_factors', 'spam_doorway'], files: ['src/App.tsx', 'public/sitemap.xml'] },
};
const techDefault = { category: 'TECHNICAL SEO', impact: 'moderate', effort: 'low', blueprint: '30d', why: 'A technical problem on the site can stop Google reading or trusting the page.', action: 'Fix as described in "What we found".', sources: [] };

export function playbookFor(rec) {
  if (rec.type === 'technical') return { ...techDefault, ...(TECH[rec.evidence?.code] || {}) };
  if (rec.type === 'site' && TECH[rec.evidence?.code]) return { ...techDefault, ...TECH[rec.evidence.code] };
  const f = T[rec.type];
  return f ? f(rec) : { category: 'OTHER', impact: 'moderate', effort: 'moderate', blueprint: '30d', why: rec.detail || '', action: rec.detail || '', sources: [] };
}

// ---- learning: which categories actually moved GID's numbers ----------------------------------
// Needs >= 3 measured results before it moves anything, and stays within ±20% so
// one small experiment can never override Google's own guidance.
export function categoryLearning(recs = []) {
  const out = {};
  for (const c of CATEGORIES) out[c] = { measured: 0, positive: 0, negative: 0, none: 0, insufficient: 0, multiplier: 1, note: 'No measured results yet.' };
  for (const r of recs) {
    const h = r.outcome?.horizons || {};
    const verdict = (h[90] || h[30] || h[7] || {}).verdict || (r.outcome?.result === 'improved' ? 'positive_correlation' : r.outcome?.result === 'worse' ? 'negative_correlation' : r.outcome?.result === 'no_clear_change' ? 'no_clear_change' : r.outcome?.result ? 'insufficient_data' : null);
    if (!verdict) continue;
    const cat = playbookFor(r).category;
    const s = out[cat];
    if (verdict === 'insufficient_data') { s.insufficient += 1; continue; }
    s.measured += 1;
    s[verdict === 'positive_correlation' ? 'positive' : verdict === 'negative_correlation' ? 'negative' : 'none'] += 1;
  }
  for (const s of Object.values(out)) {
    if (s.measured >= 3) {
      s.multiplier = Math.round(clamp(1 + 0.2 * ((s.positive - s.negative) / s.measured), 0.8, 1.2) * 100) / 100;
      s.note = `${s.positive} of ${s.measured} measured actions coincided with improvement, ${s.negative} with a decline.`;
    } else if (s.measured) s.note = `${s.measured} measured so far — needs 3 before it affects priority.`;
  }
  return out;
}

// ---- GID Opportunity Score + priority ---------------------------------------------------------
// score = 100 × impact × confidence × value × learning ÷ effort   (clamped 0–100)
//   value = 0.5 + 0.5 × detector score/100 (search/lead value, relevance, competition),
//   +0.1 for GID's core searches ("mobile mechanic / auto repair …" in the area).
export const CORE_QUERY = /\b(mobile mechanic|mechanic|auto repair|car repair)\b/i;
export function opportunityScore(rec, pb = playbookFor(rec), learning = null) {
  const impact = IMPACT[pb.impact] ?? 0.6;
  const conf = CONF[rec.confidence] ?? 0.8;
  const core = rec.service === 'general' && CORE_QUERY.test(rec.evidence?.query || '') ? 0.1 : 0;
  const value = Math.min(1, 0.5 + 0.5 * clamp((rec.score ?? 0) / 100, 0, 1) + core);
  const effort = EFFORT[pb.effort] ?? 1.35;
  const learn = learning?.[pb.category]?.multiplier ?? 1;
  return { score: Math.round(clamp((100 * impact * conf * value * learn) / effort, 0, 100)), parts: { impact, confidence: conf, value: Math.round(value * 100) / 100, effort, learning: learn } };
}

// HIGH needs a strong score AND at least medium confidence; speculation never ranks HIGH.
export function priorityOf(score, confidence) {
  if (score >= 55 && confidence !== 'low') return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export const STATUS_LABEL = { open: 'Open', accepted: 'In Progress', applied: 'Monitoring', measured: 'Completed', dismissed: 'Dismissed', rejected: 'Dismissed', expired: 'Resolved' };

// One action card from one or more stored recommendations (same group).
// kb: knowledge entries with stored status (superseded guidance is never cited).
export function enrich(recs, learning = null, kb = KNOWLEDGE) {
  const list = Array.isArray(recs) ? recs : [recs];
  const lead = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const pb = playbookFor(lead);
  const scored = list.map(r => opportunityScore(r, pb, learning));
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  // A group of several searches is worth a little more than its best member.
  const score = Math.min(100, best.score + Math.min(10, (list.length - 1) * 2));
  const confidence = lead.confidence || 'medium';
  const queries = [...new Set(list.map(r => r.evidence?.query).filter(Boolean))];
  const sources = (pb.sources || []).map(id => kb.find(k => k.id === id)).filter(Boolean).filter(k => k.status !== 'superseded');
  return {
    id: list.length > 1 ? `group:${pb.group}` : lead.id,
    ids: list.map(r => r.id),
    title: list.length > 1 && pb.groupTitle ? pb.groupTitle(list.length) : lead.title,
    priority: lead.informational ? 'LOW' : priorityOf(score, confidence),
    opportunityScore: score, scoreParts: best.parts,
    category: pb.category, impact: label(pb.impact), effort: label(pb.effort), confidence: label(confidence),
    why: pb.why, found: list.length > 1 ? list.map(r => r.detail).join('\n') : lead.detail, action: pb.action,
    files: pb.files || [], affectedSearches: queries, blueprint: pb.blueprint || '30d',
    evidence: list.length > 1 ? list.map(r => r.evidence) : lead.evidence,
    sources: sources.map(k => ({ id: k.id, title: k.source, url: k.url, tier: k.tier, claim: k.claim })),
    status: lead.status, statusLabel: STATUS_LABEL[lead.status] || label(lead.status),
    requiresDecision: !!(lead.requires_decision ?? lead.requiresDecision), informational: !!lead.informational,
    analyzedAt: lead.updated_at || lead.created_at || null, createdAt: lead.created_at || null,
    appliedAt: lead.applied_at || null, outcome: lead.outcome || null, service: lead.service || null,
  };
}

const ACTIVE = new Set(['open', 'accepted', 'applied']);
// The action queue: grouped, scored, split into priorities; decisions apart.
export function actionQueue(recs = [], learning = categoryLearning(recs), kb = KNOWLEDGE) {
  const live = recs.filter(r => ACTIVE.has(r.status));
  const groups = new Map();
  for (const r of live) {
    const g = r.status === 'open' ? playbookFor(r).group : null;
    const key = g ? `g:${g}` : `r:${r.id}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const cards = [...groups.values()].map(g => enrich(g, learning, kb)).sort((a, b) => b.opportunityScore - a.opportunityScore);
  const decisions = cards.filter(c => c.requiresDecision);
  const rest = cards.filter(c => !c.requiresDecision);
  const pick = p => rest.filter(c => c.priority === p && c.status === 'open');
  return {
    high: pick('HIGH'), medium: pick('MEDIUM'), low: pick('LOW'),
    inProgress: rest.filter(c => c.status === 'accepted'), monitoring: rest.filter(c => c.status === 'applied'),
    decisions, learning,
  };
}

// ---- blueprint: when to do what --------------------------------------------------------------
export const HORIZONS = [
  { id: 'now', label: 'Do now' }, { id: '7d', label: 'Next 7 days' }, { id: '30d', label: 'Next 30 days' }, { id: '90d', label: 'Next 90 days' }, { id: 'long', label: 'Long term' },
];
export function blueprint(queue) {
  const cards = [...queue.high, ...queue.medium, ...queue.low, ...queue.inProgress];
  const out = Object.fromEntries(HORIZONS.map(h => [h.id, []]));
  for (const c of cards) {
    // HIGH items move up one step; LOW items move back one.
    const i = HORIZONS.findIndex(h => h.id === c.blueprint);
    const shiftBy = c.priority === 'HIGH' ? -1 : c.priority === 'LOW' ? 1 : 0;
    out[HORIZONS[clamp(i + shiftBy, 0, HORIZONS.length - 1)].id].push(c);
  }
  return HORIZONS.map(h => ({ ...h, items: out[h.id] }));
}

// ---- measuring outcomes at 7 / 30 / 90 / 180 days ---------------------------------------------
export const OUTCOME_DAYS = [7, 30, 90, 180];
// before/after: per-day averages of the tracked metric in equal windows either
// side of the day it was applied. Correlation, never causation.
export function horizonVerdict(before, after, { betterIs = 'higher', minVolume = 5 } = {}) {
  if (before == null || after == null) return 'insufficient_data';
  if (betterIs === 'higher' && Math.max(before.total ?? 0, after.total ?? 0) < minVolume) return 'insufficient_data';
  const b = before.perDay; const a = after.perDay;
  if (b == null || a == null) return 'insufficient_data';
  const change = b === 0 ? (a > 0 ? 1 : 0) : (a - b) / Math.abs(b);
  const good = betterIs === 'lower' ? change <= -0.1 : change >= 0.1;
  const bad = betterIs === 'lower' ? change >= 0.1 : change <= -0.1;
  return good ? 'positive_correlation' : bad ? 'negative_correlation' : 'no_clear_change';
}
// Which horizons are due now and not yet recorded (data lags ~3 days).
export function dueHorizons(rec, now = new Date(), lagDays = 3) {
  if (!rec.applied_at) return [];
  const age = (now - new Date(rec.applied_at)) / 86400000;
  const done = rec.outcome?.horizons || {};
  return OUTCOME_DAYS.filter(d => age >= d + lagDays && !done[d]);
}

// ---- Top-5 gap report ----------------------------------------------------------------------------
// inputs: { ownReviews:{count,rating}, competitors:[{name,review_count,rating,tier,inside_service_area,weight}],
//   servicePages:{offered:[ids], withPage:[ids]}, techIssues:n, pagespeedMobile, coreQueries:[{query,position,impressions}],
//   gbpConnected, rankObservations:n, citations:n, authority:n, reviewVelocity:{ours, sinceDays} }
export function top5Gap(x) {
  const sections = [];
  const add = (id, title, status, statement, evidence = {}) => sections.push({ id, title, status, statement, evidence });
  const { mobile: mobileRivals, shops } = reviewRivals(x.competitors || []);
  const rivals = mobileRivals.length ? mobileRivals : shops;
  const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const rivalMedian = median(rivals.map(c => c.review_count));
  const ours = x.ownReviews?.count ?? null;

  const offered = x.servicePages?.offered || []; const withPage = new Set(x.servicePages?.withPage || []);
  const missing = offered.filter(s => s !== 'general' && !withPage.has(s));
  const labelOf = id => SERVICE_CATALOG.find(s => s.id === id)?.label || id;
  add('relevance', 'Relevance gap', missing.length ? 'behind' : 'competitive',
    missing.length ? `GID offers ${offered.length - 1} specific services but has no dedicated page for ${missing.length}: ${missing.map(labelOf).join(', ')}. Only the homepage speaks to them.` : 'Every offered service has its own page.',
    { missingServicePages: missing.map(labelOf) });

  if (ours != null && rivalMedian != null) {
    const ratio = rivalMedian ? ours / rivalMedian : 1;
    add('reviews', 'Review gap', ratio >= 0.8 ? 'competitive' : 'behind',
      `${ours} Google reviews (${x.ownReviews.rating ?? '—'}★) vs ${mobileRivals.length ? `the other mobile mechanics: ${mobileRivals.map(c => `${c.name} ${c.review_count}`).join(', ')}` : `a median of ${rivalMedian} among top local shops`}.${shops.length ? ` Independent shops (which also show for "auto repair") have ${shops[shops.length - 1].review_count}–${shops[0].review_count}.` : ''}${ratio < 0.8 && (x.ownReviews.rating ?? 0) >= 4.5 ? ' Rating is strong; the count is what lags.' : ''}`,
      { ours, rating: x.ownReviews.rating, rivalMedian, mobile: mobileRivals.map(c => ({ name: c.name, reviews: c.review_count, rating: c.rating })), shops: shops.map(c => ({ name: c.name, reviews: c.review_count, rating: c.rating })) });
  } else add('reviews', 'Review gap', 'unknown', 'Review counts not collected yet (Places sync).');

  const vel = x.reviewVelocity;
  add('prominence', 'Prominence gap', vel?.sinceDays >= 14 ? (vel.ours > 0 ? 'competitive' : 'behind') : 'unknown',
    vel?.sinceDays >= 14 ? `${vel.ours} new reviews in the last ${vel.sinceDays} days.` : 'Review velocity needs about two weeks of daily snapshots (collecting since the first sync).', vel || {});

  add('content', 'Content gap', (x.caseStudies ?? 0) > 0 ? 'competitive' : 'behind',
    `${x.caseStudies ?? 0} real-job case studies published; ${x.jobCandidates ?? 0} completed jobs are strong candidates.`, {});

  const core = (x.coreQueries || []).filter(q => q.position != null);
  const avgPos = core.length ? Math.round((core.reduce((s, q) => s + q.position * q.impressions, 0) / Math.max(1, core.reduce((s, q) => s + q.impressions, 0))) * 10) / 10 : null;
  add('website', 'Website gap', avgPos == null ? 'unknown' : avgPos <= 5 ? 'competitive' : 'behind',
    avgPos == null ? 'No Search Console data for the core "mobile mechanic / auto repair Flagstaff" searches yet.' : `Organic average position ${avgPos} across core local searches (${core.slice(0, 3).map(q => `"${q.query}" ${q.position}`).join(', ')}).`,
    { averagePosition: avgPos, queries: core.slice(0, 8) });

  add('technical', 'Technical gap', x.techIssues ? 'behind' : 'competitive',
    x.techIssues ? `${x.techIssues} open technical findings${x.pagespeedMobile != null ? `; mobile performance score ${x.pagespeedMobile}` : ''}.` : 'No open technical findings.', { openFindings: x.techIssues, mobilePerformance: x.pagespeedMobile });

  add('authority', 'Authority gap', x.authority || x.citations ? 'unknown' : 'unknown',
    x.citations || x.authority ? `${x.citations} listings and ${x.authority} local authority opportunities tracked.` : 'No citations or local links tracked yet — add the key listings (Yelp, Apple, Bing, BBB, Chamber) on the Authority tab.', {});

  const above = mobileRivals.filter(c => ours == null || c.review_count > ours);
  const below = mobileRivals.filter(c => ours != null && c.review_count <= ours);
  add('competitor', 'Competitor gap', !mobileRivals.length ? 'unknown' : above.length ? 'behind' : 'competitive',
    mobileRivals.length ? `${above.length ? `Behind on reviews: ${above.map(c => `${c.name} (${c.review_count})`).join(', ')}.` : ''}${below.length ? ` Ahead of ${below.map(c => `${c.name} (${c.review_count})`).join(', ')}.` : ''}`.trim() : 'No other mobile mechanics found in the area by Places; the visible competitors are shops, which rank on proximity.',
    { mobileRivals: mobileRivals.map(c => ({ name: c.name, reviews: c.review_count })) });

  add('distance', 'Distance limitations', 'info',
    'Local rank depends on where the searcher is. A mobile business with a hidden address is ranked from its verified base; shops near a searcher get a proximity edge GID can\'t remove. Measure rank from several parts of town (Rankings tab) instead of one number.', { rankObservations: x.rankObservations ?? 0 });

  const unknown = [];
  if (!x.gbpConnected) unknown.push('Business Profile performance (calls, direction requests, search keywords) — waiting on Google API approval');
  if (!x.rankObservations) unknown.push('Local pack rank from different parts of the service area — add observations on the Rankings tab');
  if (!x.citations) unknown.push('Citation consistency — no listings recorded yet');
  add('unknown', 'Unknown / need more data', unknown.length ? 'unknown' : 'competitive', unknown.length ? unknown.join('; ') + '.' : 'All key data sources are connected.', { missing: unknown });

  const behind = sections.filter(s => s.status === 'behind').map(s => s.title.replace(' gap', '').toLowerCase());
  const ahead = sections.filter(s => s.status === 'competitive').map(s => s.title.replace(' gap', '').toLowerCase());
  return {
    summary: `GID Garage appears ${ahead.length ? `competitive on ${ahead.join(', ')}` : 'not yet clearly competitive on any measured factor'}${behind.length ? ` but behind visible competitors on ${behind.join(', ')}` : ''}. No one can guarantee a Top-5 position; these are the gaps GID controls.`,
    sections,
  };
}

// ---- change detection between analyses -----------------------------------------------------------
// snapshot: { at, localImpressions, localClicks, avgCorePosition, ownReviews, rivalReviews:{name:count}, openHigh, openTotal }
export function changesSince(prev, cur) {
  if (!prev) return [];
  const out = [];
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const move = (key, labelText, minAbs, minPct) => {
    const a = cur[key]; const b = prev[key];
    if (a == null || b == null) return;
    const p = pct(a, b);
    if (Math.abs(a - b) >= minAbs && (p == null || Math.abs(p) >= minPct)) out.push({ kind: key, text: `${labelText} ${a > b ? 'rose' : 'fell'} ${p == null ? '' : `${Math.abs(p)}% `}(${b} → ${a}).`, direction: a > b ? 'up' : 'down' });
  };
  move('localImpressions', 'Local search impressions (28 days)', 20, 15);
  move('localClicks', 'Local search clicks (28 days)', 5, 15);
  if (cur.avgCorePosition != null && prev.avgCorePosition != null && Math.abs(cur.avgCorePosition - prev.avgCorePosition) >= 1) {
    out.push({ kind: 'position', text: `Average position on core local searches moved from ${prev.avgCorePosition} to ${cur.avgCorePosition}.`, direction: cur.avgCorePosition < prev.avgCorePosition ? 'up' : 'down' });
  }
  if (cur.ownReviews != null && prev.ownReviews != null && cur.ownReviews !== prev.ownReviews) out.push({ kind: 'reviews', text: `GID reviews: ${prev.ownReviews} → ${cur.ownReviews}.`, direction: cur.ownReviews > prev.ownReviews ? 'up' : 'down' });
  for (const [name, n] of Object.entries(cur.rivalReviews || {})) {
    const before = prev.rivalReviews?.[name];
    if (before != null && n - before >= 5) out.push({ kind: 'competitor_reviews', text: `${name} gained ${n - before} reviews (${before} → ${n}).`, direction: 'down' });
  }
  return out;
}

// ---- real jobs worth turning into case studies ----------------------------------------------------
// bookings: rows with vehicle/service/job_status/has_photos/pre_scan/post_scan/line_items/estimate_notes/date.
// Output is anonymised: vehicle, service, month, what was done — never names, contacts or addresses.
export function jobContentCandidates(bookings = [], { limit = 5 } = {}) {
  const done = bookings.filter(b => ['PAID', 'COMPLETED', 'INVOICED'].includes(b.job_status) && b.vehicle);
  const seen = new Map();
  for (const b of done) { const k = `${b.vehicle}|${b.service}`.toLowerCase(); seen.set(k, (seen.get(k) || 0) + 1); }
  const clean = s => String(s || '').replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '').replace(/\+?\d[\d\s().-]{8,}\d/g, '').trim();
  return done.map(b => {
    const work = (Array.isArray(b.line_items) ? b.line_items : []).map(li => clean(li.label || li.description)).filter(Boolean).slice(0, 4);
    const photos = Array.isArray(b.job_photos) ? b.job_photos.length : b.has_photos ? 1 : 0;
    const scans = !!(b.pre_scan && b.post_scan);
    let score = 0;
    if (photos) score += Math.min(3, photos) * 10;
    if (scans) score += 20;
    if (b.has_inspection) score += 10;
    if (work.length >= 2) score += 15;
    if ((seen.get(`${b.vehicle}|${b.service}`.toLowerCase()) || 0) === 1) score += 10; // unique vehicle + job
    if (/diag|o2|sensor|electrical|no.?start|misfire|code/i.test(`${b.service} ${work.join(' ')}`)) score += 15; // a real diagnosis story
    return { bookingId: b.id, vehicle: String(b.vehicle).replace(/\s+/g, ' ').trim(), service: b.service, month: String(b.date || '').slice(0, 7), work, photos, scans, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---- rank observations -------------------------------------------------------------------------
// CSV: keyword,area,rank,date[,in_local_pack][,competitors separated by ;]
export function parseRankCsv(text = '') {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: [] };
  const header = /keyword/i.test(lines[0]) ? lines.shift().toLowerCase().split(',').map(s => s.trim()) : ['keyword', 'area', 'rank', 'date', 'in_local_pack', 'competitors'];
  const idx = k => header.indexOf(k);
  const rows = []; const errors = [];
  lines.forEach((l, i) => {
    const cols = l.split(',').map(s => s.trim());
    const get = k => (idx(k) >= 0 ? cols[idx(k)] : '');
    const keyword = get('keyword'); const area = get('area'); const rawRank = get('rank');
    const date = get('date') || new Date().toISOString().slice(0, 10);
    const rank = /^(nr|none|not ranked|-|)$/i.test(rawRank) ? null : Number(rawRank);
    if (!keyword || !area || (rank != null && !(Number.isInteger(rank) && rank >= 1 && rank <= 100)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Line ${i + 1}: "${l}"`); return; }
    rows.push({ keyword: keyword.toLowerCase(), area_name: area, rank, observed_on: date, in_local_pack: /^(y|yes|true|1)$/i.test(get('in_local_pack')), competitors: get('competitors') ? get('competitors').split(';').map(s => s.trim()).filter(Boolean) : [], method: 'csv' });
  });
  return { rows, errors };
}

// Latest rank per keyword × area, for the grid.
export function rankGrid(obs = []) {
  const latest = new Map();
  for (const o of obs) {
    const k = `${o.keyword}|${o.area_name}`;
    const cur = latest.get(k);
    if (!cur || o.observed_on > cur.observed_on) latest.set(k, o);
  }
  const keywords = [...new Set([...latest.values()].map(o => o.keyword))].sort();
  const areas = [...new Set([...latest.values()].map(o => o.area_name))].sort();
  return { keywords, areas, cells: Object.fromEntries([...latest.entries()].map(([k, o]) => [k, { rank: o.rank, date: o.observed_on, localPack: o.in_local_pack }])) };
}
