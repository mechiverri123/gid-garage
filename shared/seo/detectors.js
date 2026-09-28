// Deterministic opportunity detectors. Each produces recommendations with a
// stable id (so lifecycle state survives re-detection), evidence, a local
// opportunity score and a confidence. Tests: tests/seo-detectors.test.js

import { localOpportunityScore } from './scoring.js';
import { detectChanges } from './competitors.js';
import { contentGuard, citationIssues } from './demand.js';
import { isInsideServiceArea } from './service-area.js';
import { serviceEligibility, SERVICE_CATALOG } from './services.js';
import { evidenceFor } from './evidence.js';

// What this service actually produced in the last 12 months (shown with the recommendation).
const businessEvidence = (evidence, service) => (evidence?.[service] ? { last12Months: { leads: evidence[service].leads, bookedJobs: evidence[service].bookings, netProfit: evidence[service].profit } } : {});

// Rough organic CTR-by-position benchmark (industry-average shape; a
// comparison aid, not a promise).
export const EXPECTED_CTR = { 1: 0.28, 2: 0.15, 3: 0.1, 4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.02 };
const expectedCtr = pos => EXPECTED_CTR[Math.max(1, Math.min(10, Math.round(pos)))];
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const rec = (type, key, fields) => ({ id: `${type}:${slug(key)}`, type, status: 'open', ...fields });

// annotated: GSC rows already run through annotateGsc (query, page, clicks, impressions, position, intentClass, locality, service)
export function detectCtrOpportunities(annotated, { minImpressions = 20, services = SERVICE_CATALOG, evidence = {}, capacity = null } = {}) {
  const out = [];
  for (const r of annotated) {
    if (r.intentClass !== 'high_local_commercial' || !['likely_local', 'confirmed_local'].includes(r.locality)) continue;
    if (!serviceEligibility(r.service, services).eligible) continue;
    if (!(r.position <= 8) || (r.impressions || 0) < minImpressions) continue;
    const ctr = (r.clicks || 0) / r.impressions;
    const exp = expectedCtr(r.position);
    if (ctr >= exp * 0.6) continue;
    const s = localOpportunityScore({ intentClass: r.intentClass, locality: r.locality, serviceOffered: serviceEligibility(r.service, services).eligible, position: r.position, impressions: r.impressions, conversion: evidenceFor(evidence, r.service), capacity });
    out.push(rec('ctr_opportunity', `${r.query}|${r.page}`, {
      title: `Win more clicks for "${r.query}"`,
      detail: `Position ${r.position.toFixed(1)} but ${(ctr * 100).toFixed(1)}% CTR (typical ~${Math.round(exp * 100)}%). Rewrite the title/description of ${r.page} around the local service and mobile convenience.`,
      evidence: { query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, position: r.position, ctr: Math.round(ctr * 1000) / 10, expectedCtrPct: Math.round(exp * 100), ...businessEvidence(evidence, r.service) },
      service: r.service, score: s.score, confidence: 'medium', metric: { kind: 'gsc_query_page_clicks', query: r.query, page: r.page },
    }));
  }
  return out;
}

export function detectStrikingDistance(annotated, { minImpressions = 15, services = SERVICE_CATALOG, evidence = {}, capacity = null } = {}) {
  return annotated
    .filter(r => r.intentClass === 'high_local_commercial' && ['likely_local', 'confirmed_local'].includes(r.locality) && r.position > 8 && r.position <= 20 && (r.impressions || 0) >= minImpressions)
    .filter(r => serviceEligibility(r.service, services).eligible)
    .map(r => rec('striking_distance', `${r.query}`, {
      title: `"${r.query}" is close to page one`,
      detail: `Average position ${r.position.toFixed(1)} with ${r.impressions} local impressions. Strengthen ${r.page || 'the matching service page'} with local, service-specific content and internal links.`,
      evidence: { query: r.query, page: r.page, impressions: r.impressions, position: r.position, ...businessEvidence(evidence, r.service) },
      service: r.service, score: localOpportunityScore({ intentClass: r.intentClass, locality: r.locality, serviceOffered: serviceEligibility(r.service, services).eligible, position: r.position, impressions: r.impressions, conversion: evidenceFor(evidence, r.service), capacity }).score,
      confidence: 'medium', metric: { kind: 'gsc_query_position', query: r.query },
    }));
}

export function detectDemandGaps(gaps) {
  return gaps.map(g => rec('demand_gap', g.service, {
    title: `Local demand for ${g.label.toLowerCase()} that GID isn't capturing`,
    detail: `${g.localDemand} local impressions/searches. ${g.why}${g.competitorsCovering.length ? ` Nearby competitors covering it: ${g.competitorsCovering.join(', ')}.` : ''}`,
    evidence: g, service: g.service, score: g.score, confidence: g.pages.length ? 'medium' : 'high',
    metric: { kind: 'service_local_impressions', service: g.service },
  }));
}

export function detectNonlocalGrowth(cur, prev) {
  const share = b => { const t = Object.values(b.clicks).reduce((s, x) => s + x, 0); return t ? b.clicks.nonlocal / t : 0; };
  const localClicks = b => b.clicks.confirmed_local + b.clicks.likely_local;
  if (!prev) return [];
  const sc = share(cur); const sp = share(prev);
  if (sc - sp < 0.1 || localClicks(cur) > localClicks(prev)) return [];
  return [rec('nonlocal_traffic_growth', 'clicks', {
    title: 'Traffic growth is mostly from outside the service area',
    detail: `Nonlocal share of search clicks rose from ${Math.round(sp * 100)}% to ${Math.round(sc * 100)}% while likely-local clicks didn't grow. This isn't a win to chase — keep local service pages as the priority.`,
    evidence: { nonlocalShareNow: sc, nonlocalSharePrev: sp, localClicksNow: localClicks(cur), localClicksPrev: localClicks(prev) },
    score: 20, confidence: 'medium', informational: true,
  })];
}

export function detectGbpDrop(cur, prev, { minPrev = 8, dropPct = 25 } = {}) {
  if (!prev || prev < minPrev) return [];
  const change = ((cur - prev) / prev) * 100;
  if (change > -dropPct) return [];
  return [rec('gbp_actions_drop', 'actions', {
    title: 'Google Business Profile actions dropped',
    detail: `Calls, website clicks and direction requests fell ${Math.round(-change)}% (${prev} → ${cur}). Check the profile for edits, suspended status, hours, categories and recent reviews.`,
    evidence: { current: cur, previous: prev, changePct: Math.round(change) }, score: 75, confidence: 'high', metric: { kind: 'gbp_actions' },
  })];
}

export function detectReviewVelocityGap(ours, competitors) {
  const top = competitors.filter(c => c.tier === 'primary' && c.weight > 0 && c.reviewVelocity != null).sort((a, b) => b.reviewVelocity - a.reviewVelocity)[0];
  if (!top || ours == null || top.reviewVelocity < 2 || top.reviewVelocity <= ours * 1.5) return [];
  return [rec('review_velocity_gap', top.name, {
    title: `${top.name} is gathering reviews faster`,
    detail: `${top.name} (mobile mechanic) adds ~${top.reviewVelocity} reviews/month vs GID's ~${ours}. Ask every happy customer for a review right after the job (the review follow-up email is already automated).`,
    evidence: { competitor: top.name, theirPer30Days: top.reviewVelocity, oursPer30Days: ours }, score: 60, confidence: 'medium',
  })];
}

export function detectPageSpeed(runs, { minPerf = 50 } = {}) {
  return runs.filter(r => r.strategy === 'mobile').flatMap(r => {
    const problems = [];
    if (r.perf_score != null && r.perf_score < minPerf) problems.push(`performance score ${r.perf_score}`);
    if (r.lcp_ms != null && r.lcp_ms > 4000) problems.push(`LCP ${(r.lcp_ms / 1000).toFixed(1)}s`);
    if (r.cls != null && r.cls > 0.25) problems.push(`CLS ${r.cls}`);
    if (r.inp_ms != null && r.inp_ms > 500) problems.push(`INP ${r.inp_ms}ms`);
    if (!problems.length) return [];
    return [rec('mobile_speed', r.url, { title: `Slow on phones: ${r.url}`, detail: `Mobile ${problems.join(', ')}. Most local searches are on phones — slow pages lose calls.`, evidence: r, score: 55, confidence: 'high', metric: { kind: 'pagespeed_perf', url: r.url } })];
  });
}

export function detectTechnicalIssues(audits) {
  return audits.flatMap(a => (a.issues || []).map(i => rec('technical', `${a.url}|${i.code}`, {
    title: i.title, detail: `${a.url}: ${i.detail}`, evidence: { url: a.url, ...i }, score: i.severity === 'high' ? 60 : i.severity === 'medium' ? 40 : 20, confidence: 'high',
  })));
}

export function detectCompetitorChanges(changes, ourServicesOffered) {
  return changes.filter(c => c.tier === 'primary' || c.tier === 'secondary').flatMap(c => (c.changes || [])
    .filter(ch => ch.type === 'services_added' && ch.services.some(s => ourServicesOffered.includes(s)))
    .map(ch => rec('competitor_move', `${c.name}|${ch.services.join(',')}`, {
      title: `${c.name} started promoting ${ch.services.join(', ')}`,
      detail: `A ${c.tier === 'primary' ? 'mobile-mechanic' : 'local shop'} competitor added ${ch.services.join(', ')} to their site. GID offers this — make sure our page for it is strong.`,
      evidence: { competitor: c.name, ...ch }, score: c.tier === 'primary' ? 55 : 35, confidence: 'medium',
    })));
}

export function detectCitations(canonical, listings) {
  return listings.flatMap(l => {
    const issues = citationIssues(canonical, l);
    if (!issues.length) return [];
    return [rec('citation', l.platform, { title: `Fix your ${l.platform} listing`, detail: issues.map(i => i.detail).join(' '), evidence: { platform: l.platform, url: l.url, issues }, score: issues.some(i => i.severity === 'high') ? 65 : 40, confidence: 'high' })];
  });
}

export function detectAdsOutsideArea(rows, { minSpend = 20, minShare = 0.1 } = {}) {
  const known = rows.filter(r => r.inside_area === true || r.inside_area === false);
  const spend = known.reduce((s, r) => s + Number(r.cost || 0), 0);
  const outside = known.filter(r => r.inside_area === false).reduce((s, r) => s + Number(r.cost || 0), 0);
  if (spend < minSpend || outside / spend < minShare) return [];
  return [rec('ads_outside_area', 'spend', {
    title: 'Ad spend is reaching people outside the service area',
    detail: `${Math.round((outside / spend) * 100)}% of location-attributed spend ($${outside.toFixed(2)} of $${spend.toFixed(2)}) came from users outside the 30-mile radius. Tighten location targeting to "presence" within the radius.`,
    evidence: { outsideSpend: outside, totalSpend: spend }, score: 70, confidence: 'high',
  })];
}

export function detectOutsideDemand(outsideAreaDemand, { minImpressions = 30 } = {}) {
  return outsideAreaDemand.filter(o => o.impressions >= minImpressions).map(o => rec('expansion_decision', o.place, {
    title: `Searches from ${o.place} (outside the service area)`,
    detail: `${o.impressions} impressions mention ${o.place}. This is outside the 30-mile radius — only worth pursuing if you decide to expand. No action recommended by default.`,
    evidence: o, score: 0, confidence: 'medium', requiresDecision: true,
  }));
}

// The site itself advertising places beyond the radius.
export function detectServiceAreaClaims(advertisedPlaces) {
  return advertisedPlaces.map(p => ({ p, v: isInsideServiceArea(p) })).filter(x => x.v.inside === false).map(({ p, v }) => rec('service_area_claim', p, {
    title: `Site lists ${p} as a service area`,
    detail: `${p} is ~${v.distanceMiles} miles away, outside the 30-mile radius. Either confirm you serve it (an expansion decision) or remove it so searchers there don't call expecting service.`,
    evidence: { place: p, distanceMiles: v.distanceMiles }, score: 30, confidence: 'high', requiresDecision: true,
  }));
}

export function detectSeasonalPrep(findings, clusters, { now = new Date(), horizonDays = 45, services = SERVICE_CATALOG } = {}) {
  const out = [];
  for (const f of findings.filter(x => x.verdict === 'uplift')) {
    const seriesService = f.series.split(':')[1] || null;
    if (seriesService && !serviceEligibility(seriesService, services).eligible) continue;
    const start = new Date(`${f.window.start}T00:00:00Z`);
    const next = new Date(Date.UTC(now.getUTCFullYear() + (start.getUTCMonth() < now.getUTCMonth() ? 1 : 0), start.getUTCMonth(), start.getUTCDate()));
    const days = (next - now) / 86400000;
    if (days < 0 || days > horizonDays) continue;
    const service = f.series.split(':')[1] || null;
    const weak = service ? clusters.find(c => c.service === service && (c.avgLocalPosition == null || c.avgLocalPosition > 10)) : null;
    out.push(rec('seasonal_prep', `${f.event}|${f.series}`, {
      title: `Get ahead of ${f.label}`,
      detail: `${f.statement} It's about ${Math.round(days)} days away.${weak ? ` Your ${weak.label.toLowerCase()} visibility is weak (avg position ${weak.avgLocalPosition ?? 'n/a'}).` : ''}`,
      evidence: f, service, score: weak ? 65 : 40, confidence: f.approximateDates ? 'low' : 'medium',
    }));
  }
  return out;
}

export function detectColdSnap(coldSnap, clusters, { services = SERVICE_CATALOG } = {}) {
  if (!coldSnap || !serviceEligibility('battery', services).eligible) return [];
  const battery = clusters.find(c => c.service === 'battery');
  return [rec('cold_snap', coldSnap.start, {
    title: `Cold snap coming ${coldSnap.start}`,
    detail: `Forecast lows to ${coldSnap.lowestF}°F. Dead batteries and no-starts usually follow cold snaps${battery ? `; your battery/no-start local visibility averages position ${battery.avgLocalPosition ?? 'n/a'}` : ''}. Consider a GBP post about mobile battery/no-start service.`,
    evidence: coldSnap, service: 'battery', score: 50, confidence: 'low',
  })];
}

// Suppression from owner preferences (rejections, muted types/services).
export function applyPreferences(recs, prefs = [], now = new Date()) {
  const active = prefs.filter(p => !p.expires_at || new Date(p.expires_at) > now);
  return recs.filter(r => !active.some(p =>
    (p.kind === 'reject_rec' && p.key === r.id)
    || (p.kind === 'mute_type' && p.key === r.type)
    || (p.kind === 'mute_service' && r.service && p.key === r.service)));
}

// THE service gate: any recommendation tied to a service must be for a
// service GID explicitly offers. Referred-out and unconfirmed services never
// become actionable work, whichever detector produced them.
export function serviceGate(recs, services = SERVICE_CATALOG) {
  return recs.filter(r => !r.service || serviceEligibility(r.service, services).eligible);
}

// Every suggestion text passes the content guard (no NAU affiliation, no storefront talk).
export function guardRecommendations(recs) {
  return recs.map(r => {
    const problems = contentGuard(`${r.title} ${r.detail}`);
    return problems.length ? { ...r, blockedByGuard: problems } : r;
  }).filter(r => !r.blockedByGuard);
}

export function runDetectors(s, { prefs = [], now = new Date(), services = SERVICE_CATALOG } = {}) {
  const offeredIds = services.filter(x => x.offered === true).map(x => x.id);
  const all = [
    ...detectCtrOpportunities(s.annotatedGsc || [], { services, evidence: s.serviceEvidence, capacity: s.capacity }),
    ...detectStrikingDistance(s.annotatedGsc || [], { services, evidence: s.serviceEvidence, capacity: s.capacity }),
    ...detectDemandGaps(s.gaps || []),
    ...detectNonlocalGrowth(s.localityBreakdown || { clicks: {} }, s.localityBreakdownPrev),
    ...detectGbpDrop(s.gbpActions ?? 0, s.gbpActionsPrev),
    ...detectReviewVelocityGap(s.ourReviewVelocity, s.competitors || []),
    ...detectPageSpeed(s.pagespeed || []),
    ...detectTechnicalIssues(s.audits || []),
    ...detectCompetitorChanges(s.competitorChanges || [], (s.ourServicesOffered || offeredIds).filter(id => offeredIds.includes(id))),
    ...(s.canonical ? detectCitations(s.canonical, s.citations || []) : []),
    ...detectAdsOutsideArea(s.adsLocations || []),
    ...detectOutsideDemand(s.outsideAreaDemand || []),
    ...detectServiceAreaClaims(s.advertisedPlaces || []),
    ...detectSeasonalPrep(s.seasonalFindings || [], s.clusters || [], { now, services }),
    ...detectColdSnap(s.upcomingColdSnap || null, s.clusters || [], { services }),
  ];
  const unique = [...new Map(all.map(r => [r.id, r])).values()];
  return guardRecommendations(serviceGate(applyPreferences(unique, prefs, now), services)).sort((a, b) => b.score - a.score);
}

export { detectChanges };
