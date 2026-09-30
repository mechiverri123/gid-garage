// Detectors added by the Local SEO agent: whole-site structure (from the raw-HTML
// crawl), service-page coverage, the review gap to visible competitors, real-job
// case-study candidates, and changed Google guidance. Same shape and stable ids as
// detectors.js, so lifecycle state (accepted / applied / dismissed) survives reruns.
// Tests: tests/seo-agent.test.js

import { SERVICE_CATALOG, serviceEligibility } from './services.js';
import { isInsideServiceArea } from './service-area.js';

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const rec = (type, key, fields) => ({ id: `${type}:${slug(key)}`, type, status: 'open', ...fields });
const HOME = 'https://gidgarage.com/';

// The pages of the most recent crawl, one row per URL. A page removed from the
// site (e.g. an old town page) drops out instead of producing findings forever.
// rows: seo_page_audits rows with fetched_at; a crawl (resumed across sync calls) finishes well within 3 hours.
export function currentCrawl(rows = [], windowHours = 3) {
  const times = rows.map(r => Date.parse(r.fetched_at)).filter(Number.isFinite);
  if (!times.length) return [...new Map(rows.map(r => [r.url, r])).values()];
  const cutoff = Math.max(...times) - windowHours * 3600_000;
  const recent = rows.filter(r => Date.parse(r.fetched_at) >= cutoff).sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at));
  return [...new Map(recent.map(r => [r.url, r])).values()];
}
const norm = u => String(u || '').replace(/\/+$/, '') || u;
// URL path words that mean "this page is about that service".
const PAGE_WORDS = { brakes: /brake/, oil: /oil/, diagnostics: /diagnos|check-engine/, suspension: /suspension|shocks|struts/, audio: /audio|stereo/, maintenance: /maintenance|full-service|inspection|tune/, battery: /battery|no-start/, inspection: /pre-purchase|inspection/ };

// audits: latest raw-HTML audit per URL (incl. the soft-404 probe row).
export function detectSiteStructure(audits = [], { services = SERVICE_CATALOG, clusters = [] } = {}) {
  const out = [];
  const probe = audits.find(a => (a.issues || []).some(i => i.code === 'probe'));
  const pages = audits.filter(a => a !== probe);
  if (!pages.length) return out;

  const probeStatus = probe?.issues.find(i => i.code === 'probe')?.status;
  if (probeStatus === 200) out.push(rec('site', 'soft_404', {
    title: 'Missing pages return "200 OK" with the homepage (soft 404)',
    detail: `A URL that doesn't exist (${probe.url}) returned HTTP 200 and the homepage. Every typo or old link looks like a real page to Google.`,
    evidence: { code: 'soft_404', url: probe.url, status: probeStatus }, score: 50, confidence: 'high',
  }));

  const conflicts = pages.filter(a => norm(a.url) !== norm(HOME) && a.canonical && norm(a.canonical) !== norm(a.url));
  if (conflicts.length) out.push(rec('site', 'canonical_conflict', {
    title: `${conflicts.length} pages declare the homepage as canonical in their HTML`,
    detail: `${conflicts.slice(0, 4).map(a => a.url.replace(HOME, '/')).join(', ')}${conflicts.length > 4 ? '…' : ''} ship <link rel="canonical" href="${conflicts[0].canonical}"> and JavaScript later changes it — conflicting signals.`,
    evidence: { code: 'canonical_conflict', pages: conflicts.map(a => ({ url: a.url, rawCanonical: a.canonical })) }, score: 70, confidence: 'high',
  }));

  const byTitle = new Map();
  for (const a of pages) if (a.title) byTitle.set(a.title, [...(byTitle.get(a.title) || []), a.url]);
  const dup = [...byTitle.entries()].filter(([, urls]) => urls.length > 1).sort((a, b) => b[1].length - a[1].length)[0];
  if (dup) out.push(rec('site', 'duplicate_raw_titles', {
    title: `${dup[1].length} pages share one title before JavaScript runs`,
    detail: `"${dup[0]}" is the HTML title of ${dup[1].length} different URLs; each page's own title only appears after rendering.`,
    evidence: { code: 'duplicate_raw_titles', title: dup[0], urls: dup[1] }, score: 45, confidence: 'high',
  }));

  const home = pages.find(a => norm(a.url) === norm(HOME));
  if (home && !home.h1) out.push(rec('site', 'no_h1_raw', {
    title: 'Homepage HTML has no H1 or visible text',
    detail: 'The HTML Google fetches for gidgarage.com has no <h1> and no body copy — the page is built only by JavaScript.',
    evidence: { code: 'no_h1_raw', url: HOME }, score: 50, confidence: 'high',
  }));

  const towns = pages.filter(a => /\/service-area\//.test(a.url));
  const townNames = towns.map(a => a.url.split('/service-area/')[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const outside = townNames.filter(t => isInsideServiceArea(t).inside === false);
  if (towns.length >= 5) out.push(rec('site', 'doorway_risk', {
    title: `${towns.length} near-identical town pages${outside.length ? ` (${outside.length} outside the service area)` : ''}`,
    detail: `Town pages: ${townNames.join(', ')}. They share the same HTML${outside.length ? `, and ${outside.join(', ')} ${outside.length === 1 ? 'is' : 'are'} beyond the 30-mile radius` : ''}. This pattern matches Google's doorway-page definition unless each page has genuinely different content.`,
    evidence: { code: 'doorway_risk', towns: townNames, outsideRadius: outside }, score: outside.length ? 75 : 55, confidence: 'high',
  }));

  // Service coverage: an offered service with no page whose URL is about it.
  const paths = pages.map(a => a.url.toLowerCase());
  for (const s of services) {
    if (s.id === 'general' || serviceEligibility(s.id, services).eligible !== true) continue;
    const re = PAGE_WORDS[s.id] || new RegExp(s.id);
    if (paths.some(p => re.test(p))) continue;
    const c = clusters.find(x => x.service === s.id);
    const demand = c?.localImpressions ?? c?.impressions ?? 0;
    out.push(rec('site', `service_page_gap|${s.id}`, {
      title: `No page for ${s.label.toLowerCase()}`,
      detail: `GID offers ${s.label.toLowerCase()} (${s.source}) but no URL on the site is about it.${demand ? ` ${demand} local search impressions for it in the last 28 days.` : ''}`,
      evidence: { code: 'service_page_gap', service: s.id, localImpressions: demand, avgPosition: c?.avgLocalPosition ?? null }, service: s.id,
      score: Math.min(100, 55 + Math.round(Math.log10(1 + demand) * 15)), confidence: 'high',
    }));
  }
  return out;
}

// The competitors a review count should be compared with: other mobile mechanics
// first (same searches, same business model), then independent local shops.
// Dealers and national chains (tertiary) are left out.
export function reviewRivals(competitors = []) {
  const inArea = competitors.filter(c => c.inside_service_area !== false && c.review_count != null && c.tier !== 'tertiary' && (c.weight ?? 1) >= 0.6);
  const byCount = list => list.sort((a, b) => b.review_count - a.review_count);
  return { mobile: byCount(inArea.filter(c => c.tier === 'primary')).slice(0, 5), shops: byCount(inArea.filter(c => c.tier !== 'primary')).slice(0, 5) };
}

// ours: { count, rating }; competitors: seo_competitors rows (Places).
export function detectReviewGap(ours, competitors = []) {
  if (!ours || ours.count == null) return [];
  const { mobile, shops } = reviewRivals(competitors);
  const rivals = mobile.length ? mobile : shops;
  if (!rivals.length) return [];
  const sorted = rivals.map(c => c.review_count).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median || ours.count >= median * 0.8) return [];
  const ratio = ours.count / median;
  const list = cs => cs.map(c => `${c.name} ${c.review_count} (${c.rating ?? '—'}★)`).join(', ');
  return [rec('review_gap', 'local', {
    title: `Review count gap: ${ours.count} vs ~${median} for ${mobile.length ? 'the other mobile mechanics' : 'top local shops'}`,
    detail: `GID has ${ours.count} reviews at ${ours.rating ?? '—'}★.${mobile.length ? ` Other mobile mechanics: ${list(mobile)}.` : ''}${shops.length ? ` Top independent shops: ${list(shops.slice(0, 3))}.` : ''} The rating is strong; the count is what lags.`,
    evidence: { ours: ours.count, rating: ours.rating, rivalMedian: median, comparedWith: mobile.length ? 'mobile mechanics' : 'local shops', mobile: mobile.map(c => ({ name: c.name, reviews: c.review_count, rating: c.rating })), shops: shops.map(c => ({ name: c.name, reviews: c.review_count, rating: c.rating })) },
    score: Math.round(Math.min(100, 40 + 60 * (1 - ratio))), confidence: 'high',
  })];
}

export function detectJobContent(candidates = []) {
  const good = candidates.filter(c => c.score >= 40);
  if (!good.length) return [];
  return [rec('job_case_study', 'real-jobs', {
    title: `Turn real jobs into case studies (${good.length} strong candidates)`,
    detail: good.map(c => `${c.vehicle} — ${c.work.join(', ') || c.service} (${c.month}${c.photos ? `, ${c.photos} photos` : ''}${c.scans ? ', before/after scans' : ''})`).join('\n'),
    evidence: { candidates: good }, score: Math.min(100, 60 + good.length * 8), confidence: 'medium',
  })];
}

// knowledge: entries with stored status; changed ones need the owner to review.
export function detectKnowledgeChanges(knowledge = []) {
  return knowledge.filter(k => k.status === 'changed').map(k => rec('knowledge_update', k.id, {
    title: `Google updated: ${k.source}`,
    detail: `The page behind "${k.claim.slice(0, 120)}…" changed on ${String(k.changedAt || '').slice(0, 10)}. Recommendations still cite the old reading until it is reviewed.`,
    evidence: { url: k.url, knowledgeId: k.id }, score: 40, confidence: 'high', informational: true,
  }));
}
