// Seasonality, competitors, demand gaps, guards, KPIs, detectors, lifecycle, briefing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowUplift, weeklySeries, seasonalFindings, firstColdSnap, eventsForYear } from '../shared/seo/seasonality.js';
import { classifyCompetitor, reviewVelocity, parsePublicPage, detectChanges, competitorLandscape } from '../shared/seo/competitors.js';
import { serviceClusters, demandGaps, unconfirmedServiceDemand, nonOpportunities, citationIssues, aiAssistant, contentGuard, authorityScore } from '../shared/seo/demand.js';
import { computeOverview, annotateGsc } from '../shared/seo/kpis.js';
import { runDetectors, detectCtrOpportunities } from '../shared/seo/detectors.js';
import { transition, mergeDetected, evaluateApplied, buildSeoBriefing } from '../shared/seo/lifecycle.js';

const NOW = new Date('2026-09-28T19:00:00Z');
const days = (start, n, value) => [...Array(n)].map((_, i) => ({ date: new Date(Date.parse(`${start}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10), value }));

// ---- seasonality -----------------------------------------------------------------

test('seasonality only claims an uplift the data supports', () => {
  const pts = [...days('2025-07-07', 35, 1), ...days('2025-08-11', 14, 4), ...days('2025-08-25', 35, 1)];
  const r = windowUplift(weeklySeries(pts), { start: '2025-08-11', end: '2025-08-24' });
  assert.equal(r.verdict, 'uplift');
  assert.ok(r.ratio >= 3);
  const thin = windowUplift(weeklySeries(days('2025-08-11', 14, 0.2)), { start: '2025-08-11', end: '2025-08-24' });
  assert.equal(thin.verdict, 'insufficient_data');
  const [f] = seasonalFindings({ 'leads:battery': pts }, [{ kind: 'nau_fall_move_in', label: 'NAU move-in', start: '2025-08-11', end: '2025-08-24', approximate: true }]);
  assert.match(f.statement, /approximate dates/);
  assert.ok(eventsForYear(2026).every(e => e.approximate && /replace with official dates/.test(e.source)));
});

test('first sustained cold snap', () => {
  const daily = [{ date: '2026-10-01', tminF: 30 }, { date: '2026-10-02', tminF: 19 }, { date: '2026-10-03', tminF: 18 }, { date: '2026-10-04', tminF: 25 }, { date: '2026-10-20', tminF: 15 }, { date: '2026-10-21', tminF: 12 }, { date: '2026-10-22', tminF: 17 }];
  assert.deepEqual(firstColdSnap(daily), { start: '2026-10-20', end: '2026-10-22', lowestF: 12 });
});

// ---- competitors -----------------------------------------------------------------

test('competitor model: mobile mechanics weigh most; publishers are search-result competitors only', () => {
  const mobile = classifyCompetitor({ name: 'Peak Mobile Mechanic', location: 'Flagstaff' });
  assert.deepEqual([mobile.kind, mobile.tier, mobile.weight], ['business', 'primary', 1]);
  assert.equal(classifyCompetitor({ name: 'Flagstaff Auto Repair', location: 'Flagstaff' }).tier, 'secondary');
  assert.equal(classifyCompetitor({ name: 'Jiffy Lube', location: 'Flagstaff' }).tier, 'tertiary');
  assert.equal(classifyCompetitor({ name: 'Findlay Toyota Flagstaff', types: ['car_dealer'], location: 'Flagstaff' }).tier, 'tertiary');
  assert.equal(classifyCompetitor({ name: 'RepairPal', website: 'https://repairpal.com/x' }).kind, 'search_result');
  assert.equal(classifyCompetitor({ name: 'Valley Mobile Mechanic', location: 'Phoenix' }).weight, 0);
  assert.equal(reviewVelocity([{ at: '2026-08-01', reviewCount: 10 }, { at: '2026-08-31', reviewCount: 16 }]), 6);
});

test('public page parse + change detection', () => {
  const a = parsePublicPage('<title>Peak Mobile</title><h1>Mobile oil change</h1><p>We do oil change service.</p>');
  const b = parsePublicPage('<title>Peak Mobile</title><h1>Mobile oil change</h1><p>We do oil change and brake repair.</p>');
  assert.deepEqual(a.services, ['oil']);
  assert.deepEqual(detectChanges(a, b), [{ type: 'services_added', services: ['brakes'] }]);
  const land = competitorLandscape([{ name: 'Peak', kind: 'business', weight: 1, tier: 'primary', services: ['brakes', 'alignment'], reviewCount: 40, rating: 4.8 }], ['oil']);
  assert.deepEqual(land[0].theyShowWeDont, ['brakes']); // alignment is referred out, not a gap
});

// ---- demand / guards ----------------------------------------------------------------

const GSC = [
  { query: 'mobile mechanic flagstaff', page: '/', clicks: 2, impressions: 120, position: 4.2, country: 'usa' },
  { query: 'brake repair flagstaff', page: null, clicks: 0, impressions: 60, position: 18, country: 'usa' },
  { query: 'battery replacement near me', page: null, clicks: 0, impressions: 30, position: 25, country: 'usa' },
  { query: 'ac recharge flagstaff', page: null, clicks: 0, impressions: 80, position: 30, country: 'usa' },
  { query: 'how do brake pads work', page: '/', clicks: 5, impressions: 900, position: 9, country: 'usa' },
  { query: 'mechanic williams az', page: '/', clicks: 0, impressions: 50, position: 12, country: 'usa' },
  { query: 'gid garage', page: '/', clicks: 20, impressions: 40, position: 1, country: 'usa' },
];

test('demand gaps: offered local services with weak visibility; referred-out and outside demand are not gaps', () => {
  const clusters = serviceClusters(GSC);
  const gaps = demandGaps(clusters, { competitors: [{ name: 'Peak Mobile', kind: 'business', weight: 1, services: ['brakes'] }] });
  // battery is not a confirmed GID service, so it is reported as unconfirmed demand, never a gap
  assert.deepEqual(gaps.map(g => g.service).sort(), ['brakes']);
  assert.deepEqual(unconfirmedServiceDemand(clusters).map(u => u.service), ['battery']);
  assert.deepEqual(gaps.find(g => g.service === 'brakes').competitorsCovering, ['Peak Mobile']);
  const non = nonOpportunities(GSC);
  assert.deepEqual(non.unsupportedServiceDemand.map(x => x.service), ['ac']);
  assert.deepEqual(non.outsideAreaDemand.map(x => [x.place, x.requiresExpansionDecision]), [['Williams', true]]);
});

test('guards: no NAU affiliation claims, no storefront language; citations respect SAB rules', () => {
  assert.equal(contentGuard('Official NAU mechanic').length, 1);
  assert.equal(contentGuard('Partnered with Northern Arizona University').length, 1);
  assert.equal(contentGuard('Visit our shop on Route 66').length, 1);
  assert.equal(contentGuard('Mobile brake repair for NAU students and Flagstaff residents').length, 0);
  const issues = citationIssues({ name: 'GID Garage', phone: '480-757-0476', website: 'https://gidgarage.com', hideAddress: true },
    { observed_name: 'GID Garage LLC', observed_phone: '(480) 757-0476', observed_website: 'gidgarage.com', observed_address_shown: true });
  assert.deepEqual(issues.map(i => i.field), ['name', 'address']);
  assert.equal(aiAssistant('chatgpt.com'), 'chatgpt');
  assert.equal(aiAssistant('google'), null);
  assert.ok(authorityScore({ kind: 'chamber', local: true, relevance: 0.8 }) > authorityScore({ kind: 'directory', local: false, relevance: 0.8 }));
});

// ---- KPIs / detectors / lifecycle / briefing ---------------------------------------------

test('KPIs lead with local business impact; nonlocal traffic is tertiary', () => {
  const o = computeOverview({
    gscCur: GSC, gscPrev: GSC.map(r => ({ ...r, impressions: Math.round(r.impressions / 2), clicks: Math.round(r.clicks / 2) })),
    leadsCur: [{ id: 'l1', source: 'website_form', booking_id: 'b1' }, { id: 'l2', source: 'google_ads' }, { id: 'l3', source: 'website_booking', booking_id: 'b2' }],
    bookingsById: new Map([['b1', { service_address: 'Flagstaff AZ', amount_paid: 300 }], ['b2', { service_address: 'Winslow AZ' }]]),
    gscTotals: { impressions: 1400 },
  });
  assert.deepEqual(o.primary.map(k => k.key), ['local_search_visibility', 'local_organic_clicks', 'gbp_actions', 'local_leads', 'local_bookings', 'local_conversion_rate']);
  assert.equal(o.funnel.leads, 1); // google_ads isn't discovery; Winslow booking is outside
  assert.equal(o.funnel.outsideServiceArea, 1);
  assert.equal(o.funnel.collectedOnThoseJobs, 300);
  assert.ok(o.localityBreakdown.impressions.unknown > 0 && o.localityBreakdown.impressions.nonlocal === 50);
  assert.equal(o.anonymizedImpressionShare, 8.6); // 1 − 1280 query-level / 1400 total
  assert.ok(o.tertiary.some(k => k.key === 'all_impressions'));
});

test('detectors: CTR opportunity, gaps, expansion decisions and SAB claims; preferences suppress', () => {
  const annotated = annotateGsc(GSC);
  assert.deepEqual(detectCtrOpportunities(annotated).map(r => r.evidence.query), ['mobile mechanic flagstaff']);
  const clusters = serviceClusters(GSC);
  const recs = runDetectors({
    annotatedGsc: annotated, clusters, gaps: demandGaps(clusters),
    outsideAreaDemand: [{ place: 'Williams', impressions: 50 }], advertisedPlaces: ['Winslow', 'Sedona'],
  }, { now: NOW });
  const types = recs.map(r => r.type);
  for (const t of ['ctr_opportunity', 'striking_distance', 'demand_gap', 'expansion_decision', 'service_area_claim']) assert.ok(types.includes(t), t);
  assert.ok(recs.filter(r => r.type === 'expansion_decision' || r.type === 'service_area_claim').every(r => r.requiresDecision));
  assert.ok(!recs.some(r => r.evidence?.place === 'Sedona'));
  const muted = runDetectors({ annotatedGsc: annotated }, { now: NOW, prefs: [{ kind: 'mute_type', key: 'ctr_opportunity' }] });
  assert.ok(!muted.some(r => r.type === 'ctr_opportunity'));
});

test('lifecycle: transitions, rejection memory, merge keeps decisions, applied-change measurement', () => {
  const r = { id: 'ctr_opportunity:x', type: 'ctr_opportunity', status: 'open' };
  const rej = transition(r, 'reject', { now: NOW, reason: 'not now' });
  assert.equal(rej.rec.status, 'rejected');
  assert.equal(rej.preference.kind, 'reject_rec');
  assert.equal(transition(r, 'reject', { now: NOW, reason: 'never suggest this' }).preference.kind, 'mute_type');
  assert.throws(() => transition({ ...r, status: 'rejected' }, 'mark_applied'), /Can't mark applied/);
  const applied = transition(r, 'mark_applied', { now: NOW, baseline: { metric: 'clicks', value: 10 } }).rec;
  assert.equal(applied.status, 'applied');
  assert.equal(evaluateApplied(applied, 30, { now: NOW }), null); // still inside the monitor window
  const later = new Date(NOW.getTime() + 29 * 86400000);
  assert.equal(evaluateApplied(applied, 30, { now: later }).outcome.result, 'improved');
  assert.equal(evaluateApplied(applied, 2, { now: later, minBaseline: 50 }).outcome.result, 'insufficient_data');

  const merged = mergeDetected([{ ...r, status: 'rejected' }, { id: 'gone', status: 'open' }], [{ ...r, score: 90 }, { id: 'new', type: 't', score: 50 }], NOW);
  assert.ok(!merged.some(m => m.id === r.id)); // rejected stays rejected
  assert.equal(merged.find(m => m.id === 'gone').status, 'expired');
  assert.equal(merged.find(m => m.id === 'new').status, 'open');
});

test('briefing headlines local impact and stays silent without data', () => {
  assert.equal(buildSeoBriefing({ overview: computeOverview({}) }), null);
  const o = computeOverview({ gscCur: GSC, gscPrev: GSC.map(x => ({ ...x, impressions: Math.round(x.impressions * 0.8) })), leadsCur: [{ source: 'website_form', booking_id: 'b1' }], bookingsById: new Map([['b1', { service_address: 'Flagstaff' }]]) });
  const text = buildSeoBriefing({ overview: o, recommendations: [{ status: 'open', title: 'Win more clicks for "mobile mechanic flagstaff"', score: 80 }] });
  assert.match(text, /^Nonbranded local search impressions rose/);
  assert.match(text, /1 local lead from website\/search, 1 booked/);
  assert.match(text, /Top opportunity: Win more clicks/);
  assert.doesNotMatch(text, /traffic (is )?up/i);
});
