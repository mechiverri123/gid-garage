// Local SEO agent: priorities, grouping, learning, outcome horizons, Top-5 gap,
// site-structure detectors, review rivals, job case studies (anonymised),
// rank observations, change detection, knowledge base, and the agent routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionQueue, categoryLearning, opportunityScore, priorityOf, playbookFor, horizonVerdict, dueHorizons, top5Gap, changesSince, jobContentCandidates, parseRankCsv, rankGrid, blueprint, enrich } from '../shared/seo/agent.js';
import { detectSiteStructure, detectReviewGap, reviewRivals, detectJobContent, detectKnowledgeChanges } from '../shared/seo/agent-detectors.js';
import { KNOWLEDGE, withStoredStatus, pageFingerprint } from '../shared/seo/knowledge.js';
import { runDetectors } from '../shared/seo/detectors.js';
import { parsePublicPage } from '../shared/seo/competitors.js';
import { auditPage } from '../functions/_lib/seo/providers.js';
import { createSeoOps } from '../functions/_lib/seo/ops.js';
import { handleSeoData } from '../functions/jarvis/seo-data.js';
import { fakeSeoStore } from './seo-fake-store.js';

const NOW = new Date('2026-09-29T17:00:00Z');
const HOME = 'https://gidgarage.com/';

// The live site on 2026-09-29: an SPA shell for every URL.
const shell = { title: 'Flagstaff Mobile Mechanic Near Me | GID Garage', canonical: HOME, h1: null, issues: [] };
const town = t => ({ ...shell, url: `${HOME}service-area/${t}` });
const AUDITS = [
  { ...shell, url: HOME }, ...['fort-valley', 'kachina-village', 'doney-park', 'bellemont', 'munds-park', 'winona', 'sedona', 'winslow'].map(town),
  { url: 'https://gidgarage.com/__gid-seo-audit-missing-page', issues: [{ code: 'probe', status: 200 }] },
];

test('meta description keeps apostrophes inside double quotes', () => {
  assert.equal(parsePublicPage('<meta name="description" content="GID Garage is Flagstaff\'s mobile mechanic." />').description, "GID Garage is Flagstaff's mobile mechanic.");
  assert.equal(parsePublicPage("<meta content='Say \"hi\"' name='description'>").description, 'Say "hi"');
});

test('site structure: soft 404, canonical conflict, duplicate titles, no H1, doorway risk, service pages', () => {
  const clusters = [{ service: 'brakes', localImpressions: 240, avgLocalPosition: 14 }];
  const recs = detectSiteStructure(AUDITS, { clusters });
  const byCode = Object.fromEntries(recs.map(r => [r.evidence.code === 'service_page_gap' ? `gap:${r.evidence.service}` : r.evidence.code, r]));
  assert.ok(byCode.soft_404);
  assert.equal(byCode.canonical_conflict.evidence.pages.length, 8);
  assert.equal(byCode.duplicate_raw_titles.evidence.urls.length, 9);
  assert.ok(byCode.no_h1_raw);
  assert.deepEqual(byCode.doorway_risk.evidence.outsideRadius, ['Winslow']);
  assert.ok(byCode['gap:brakes'].score > byCode['gap:audio'].score, 'demand raises the score');
  assert.equal(byCode['gap:battery'], undefined, 'unconfirmed services never produce work');
  assert.equal(byCode['gap:alignment'], undefined, 'referred-out services never produce work');
  // A real 404 and pages with their own canonical/H1: nothing to report on those.
  const healthy = [{ url: HOME, title: 'A', canonical: HOME, h1: 'Mobile Mechanic', issues: [] }, { url: `${HOME}brake-repair-flagstaff`, title: 'B', canonical: `${HOME}brake-repair-flagstaff`, h1: 'Brakes', issues: [] }, { url: 'x', issues: [{ code: 'probe', status: 404 }] }];
  const codes = detectSiteStructure(healthy).map(r => r.evidence.code);
  assert.deepEqual(codes.filter(c => c !== 'service_page_gap'), []);
  assert.ok(!detectSiteStructure(healthy).some(r => r.evidence.service === 'brakes'), 'a /brake-… page counts as coverage');
  // The probe row itself is never a technical finding.
  assert.ok(!runDetectors({ audits: AUDITS }).some(r => r.title === 'Soft-404 probe'));
});

test('audit probe row: auditPage still reports ordinary issues', () => {
  const a = auditPage(HOME, '<html><head><title>Home</title></head></html>');
  assert.ok(a.issues.some(i => i.code === 'title_no_location'));
});

test('review gap compares with other mobile mechanics, not dealers or chains', () => {
  const comps = [
    { name: 'University Auto Repair', tier: 'secondary', weight: 0.6, review_count: 1208, rating: 4.6, inside_service_area: true },
    { name: 'Meineke', tier: 'tertiary', weight: 0.3, review_count: 1078, rating: 4.5, inside_service_area: true },
    { name: 'Munoz & Sons Mobile Mechanics', tier: 'primary', weight: 1, review_count: 250, rating: 5, inside_service_area: true },
    { name: 'Flagstaff Mobile Mechanic LLC', tier: 'primary', weight: 1, review_count: 200, rating: 4.4, inside_service_area: true },
    { name: 'High Power mobile mechanic', tier: 'primary', weight: 0, review_count: 2, rating: 3, inside_service_area: false },
  ];
  const r = reviewRivals(comps);
  assert.deepEqual(r.mobile.map(c => c.review_count), [250, 200]);
  assert.ok(!r.shops.some(c => c.name === 'Meineke'));
  const [gap] = detectReviewGap({ count: 22, rating: 5 }, comps);
  assert.match(gap.title, /22 vs ~250 for the other mobile mechanics/);
  assert.equal(gap.evidence.comparedWith, 'mobile mechanics');
  assert.equal(detectReviewGap({ count: 240, rating: 5 }, comps).length, 0);
});

test('priorities: calibrated, grouped, never all HIGH, low confidence never HIGH', () => {
  const recs = [
    { id: 'review_gap:local', type: 'review_gap', status: 'open', score: 88, confidence: 'high', title: 'Review gap' },
    ...['brakes', 'oil', 'diagnostics'].map(s => ({ id: `site:service_page_gap-${s}`, type: 'site', status: 'open', score: 80, confidence: 'high', service: s, title: `No page for ${s}`, detail: s, evidence: { code: 'service_page_gap', service: s } })),
    ...['oil change flagstaff', 'auto repair flagstaff'].map(q => ({ id: `ctr_opportunity:${q}`, type: 'ctr_opportunity', status: 'open', score: 50, confidence: 'medium', title: q, detail: q, evidence: { query: q, page: HOME } })),
    { id: 'striking_distance:flagstaff mobile mechanic', type: 'striking_distance', status: 'open', score: 50, confidence: 'medium', service: 'general', title: 'near page one', evidence: { query: 'flagstaff mobile mechanic' } },
    { id: 'site:duplicate_raw_titles', type: 'site', status: 'open', score: 45, confidence: 'high', title: 'dup', evidence: { code: 'duplicate_raw_titles' } },
    { id: 'cold_snap:x', type: 'cold_snap', status: 'open', score: 50, confidence: 'low', title: 'cold' },
    { id: 'service_area_claim:winslow', type: 'service_area_claim', status: 'open', score: 30, confidence: 'high', title: 'Winslow', requires_decision: true },
    { id: 'mobile_speed:x', type: 'mobile_speed', status: 'applied', score: 55, confidence: 'high', title: 'speed', applied_at: '2026-09-20' },
  ];
  const q = actionQueue(recs);
  const titles = q.high.map(c => c.title);
  assert.ok(titles.includes('Review gap'));
  assert.ok(titles.some(t => /Build dedicated service pages \(3 offered services/.test(t)), 'service-page gaps are one card');
  assert.ok(titles.includes('near page one'), 'the core search near page one is HIGH');
  assert.ok(q.medium.some(c => /Rewrite the homepage title and description \(2 searches/.test(c.title)), 'CTR findings for one page are one card');
  assert.ok(q.high.length < recs.length / 2);
  assert.ok(![...q.high].some(c => c.confidence === 'Low'));
  assert.equal(q.decisions[0].title, 'Winslow');
  assert.equal(q.monitoring[0].statusLabel, 'Monitoring');
  assert.equal(priorityOf(90, 'low'), 'MEDIUM');
  const card = q.high.find(c => c.title === 'Review gap');
  assert.ok(card.sources.some(s => s.url.includes('7091')) && card.why && card.action);
  assert.ok(!/incentiv|discount|free .* for (a )?review/i.test(card.action.replace(/Never offer anything in return/, '')), 'never suggests incentivised reviews');
  const bp = blueprint(q);
  assert.equal(bp[0].id, 'now');
  assert.ok(bp.find(h => h.id === 'now').items.some(c => c.title === 'Review gap'));
});

test('learning: needs 3 measured results and stays within ±20%', () => {
  const measured = v => ({ type: 'review_gap', outcome: { horizons: { 30: { verdict: v } } } });
  assert.equal(categoryLearning([measured('positive_correlation'), measured('positive_correlation')]).REVIEWS.multiplier, 1);
  const l = categoryLearning([measured('positive_correlation'), measured('positive_correlation'), measured('positive_correlation'), measured('positive_correlation')]);
  assert.equal(l.REVIEWS.multiplier, 1.2);
  assert.equal(categoryLearning([1, 2, 3].map(() => measured('negative_correlation'))).REVIEWS.multiplier, 0.8);
  const rec = { type: 'review_gap', score: 80, confidence: 'high' };
  assert.ok(opportunityScore(rec, playbookFor(rec), l).score > opportunityScore(rec).score);
});

test('outcome horizons: due dates and correlation verdicts', () => {
  const rec = { applied_at: '2026-08-01T00:00:00Z', outcome: { horizons: { 7: { verdict: 'no_clear_change' } } } };
  assert.deepEqual(dueHorizons(rec, NOW), [30]);
  assert.equal(horizonVerdict({ total: 300, perDay: 10 }, { total: 390, perDay: 13 }), 'positive_correlation');
  assert.equal(horizonVerdict({ total: 300, perDay: 10 }, { total: 270, perDay: 9 }), 'negative_correlation');
  assert.equal(horizonVerdict({ total: 300, perDay: 10 }, { total: 310, perDay: 10.3 }), 'no_clear_change');
  assert.equal(horizonVerdict({ total: 2, perDay: 0.1 }, { total: 3, perDay: 0.2 }), 'insufficient_data');
  assert.equal(horizonVerdict({ total: 50, perDay: 12 }, { total: 60, perDay: 9 }, { betterIs: 'lower' }), 'positive_correlation', 'position: lower is better');
});

test('Top-5 gap: states measured gaps, never guarantees a rank', () => {
  const t = top5Gap({
    ownReviews: { count: 22, rating: 5 },
    competitors: [{ name: 'Munoz & Sons', tier: 'primary', weight: 1, review_count: 250, rating: 5, inside_service_area: true }, { name: 'Heath\'s', tier: 'secondary', weight: 0.6, review_count: 1032, rating: 4.8, inside_service_area: true }],
    servicePages: { offered: ['general', 'brakes', 'oil'], withPage: [] },
    coreQueries: [{ query: 'flagstaff mobile mechanic', impressions: 100, position: 9.4 }], techIssues: 3,
  });
  const s = Object.fromEntries(t.sections.map(x => [x.id, x]));
  assert.equal(s.relevance.status, 'behind');
  assert.match(s.relevance.statement, /Brakes, Oil change/);
  assert.equal(s.reviews.status, 'behind');
  assert.match(s.reviews.statement, /Munoz & Sons 250/);
  assert.equal(s.website.status, 'behind');
  assert.equal(s.distance.status, 'info');
  assert.match(s.unknown.statement, /Business Profile performance/);
  assert.match(t.summary, /No one can guarantee a Top-5 position/);
});

test('change detection: only meaningful moves', () => {
  const prev = { localImpressions: 1000, localClicks: 40, avgCorePosition: 9.4, ownReviews: 22, rivalReviews: { A: 250 } };
  assert.deepEqual(changesSince(prev, { ...prev, localImpressions: 1050 }), []);
  const ch = changesSince(prev, { ...prev, localImpressions: 1340, avgCorePosition: 7.9, ownReviews: 25, rivalReviews: { A: 262 } });
  assert.ok(ch.some(c => /rose 34%/.test(c.text)));
  assert.ok(ch.some(c => /9.4 to 7.9/.test(c.text) && c.direction === 'up'));
  assert.ok(ch.some(c => /A gained 12 reviews/.test(c.text)));
  assert.deepEqual(changesSince(null, prev), []);
});

test('job case studies: best candidates, anonymised', () => {
  const jobs = [
    { id: 'J1', date: '2026-09-26', service: 'other', vehicle: '2013 Jeep Wrangler 3.6L', job_status: 'PAID', job_photos: [1, 2, 3], pre_scan: {}, post_scan: {}, line_items: [{ label: 'Replace O2 sensors (x4)' }, { label: 'Diagnostic scan' }, { label: 'Call Leasa at 860-944-9888 leasa@x.com' }] },
    { id: 'J2', date: '2026-09-20', service: 'oil', vehicle: '2019 Honda Civic', job_status: 'PAID', line_items: [{ label: 'Oil change' }] },
    { id: 'J3', date: '2026-09-21', service: 'brakes', vehicle: '2018 F-150', job_status: 'CANCELLED' },
  ];
  const c = jobContentCandidates(jobs);
  assert.equal(c[0].bookingId, 'J1');
  assert.equal(c.length, 2);
  assert.ok(!JSON.stringify(c).match(/860|944|@|leasa@/i), 'no phone numbers or emails');
  assert.equal(detectJobContent(c).length, 1);
});

test('rank observations: CSV parsing and the latest-per-area grid', () => {
  const r = parseRankCsv('keyword,area,rank,date,in_local_pack,competitors\nmobile mechanic flagstaff,Doney Park,4,2026-09-29,yes,Munoz;Heath\nmobile mechanic flagstaff,Flagstaff,,2026-09-29,,\nbad line\nx,Flagstaff,999,2026-09-29');
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].rank, null);
  assert.deepEqual(r.rows[0].competitors, ['Munoz', 'Heath']);
  assert.equal(r.errors.length, 2);
  const g = rankGrid([...r.rows, { ...r.rows[0], rank: 6, observed_on: '2026-09-01' }]);
  assert.equal(g.cells['mobile mechanic flagstaff|Doney Park'].rank, 4, 'newest observation wins');
});

test('knowledge: sources are cited, superseded guidance is not, changed pages flag a review', () => {
  assert.ok(KNOWLEDGE.every(k => k.url.startsWith('https://') && k.claim && ['google_confirmed', 'strong_industry', 'experimental', 'speculation'].includes(k.tier)));
  const kb = withStoredStatus(KNOWLEDGE, [{ id: 'reviews_asking', status: 'superseded' }, { id: 'spam_doorway', status: 'changed', changed_at: '2026-10-05' }]);
  const card = enrich({ id: 'review_gap:local', type: 'review_gap', status: 'open', score: 80, confidence: 'high', title: 'x' }, null, kb);
  assert.ok(!card.sources.some(s => s.id === 'reviews_asking'));
  assert.equal(detectKnowledgeChanges(kb)[0].evidence.knowledgeId, 'spam_doorway');
  assert.equal(pageFingerprint('<p>a</p><script>x()</script>').hash, pageFingerprint('<div>a</div>').hash);
});

test('routes: actions/top5/blueprint/history/ranks work before the migration', async () => {
  const store = fakeSeoStore({
    seo_recommendations: [{ id: 'review_gap:local', type: 'review_gap', status: 'open', score: 88, confidence: 'high', title: 'Review gap', detail: 'd', evidence: {} }],
    seo_review_snapshots: [{ subject: 'own', rating: 5, review_count: 22, captured_at: '2026-09-28T00:00:00Z' }],
  });
  const get = async action => (await handleSeoData({ request: new Request(`https://x/jarvis/seo-data?action=${action}`), env: {}, store, now: NOW })).json();
  const a = await get('actions');
  assert.equal(a.high[0].title, 'Review gap');
  assert.ok(a.status);
  const t = await get('top5');
  assert.ok(t.sections.length >= 8);
  assert.ok((await get('blueprint')).horizons.length === 5);
  assert.ok(Array.isArray((await get('history')).outcomes));
  const k = await get('knowledge');
  assert.ok(k.entries.length === KNOWLEDGE.length);
  const r = await get('ranks');
  assert.ok(r.areas.some(x => x.name === 'Doney Park'));
});

test('analyze writes agent findings through the same gates and records a snapshot', async () => {
  const store = fakeSeoStore({ seo_page_audits: AUDITS.map((x, i) => ({ ...x, fetched_at: `2026-09-29T00:00:${String(i).padStart(2, '0')}Z` })) });
  const ops = createSeoOps({ store, env: {}, now: NOW });
  const out = await ops.analyze();
  assert.ok(out.detected > 0);
  const recs = await store.select('seo_recommendations', {});
  assert.ok(recs.some(r => r.id === 'site:soft-404'));
  assert.ok(recs.some(r => r.id === 'site:service-page-gap-brakes'));
  assert.ok(out.snapshot.ok || /seo_snapshots/.test(out.snapshot.error || ''));
});
