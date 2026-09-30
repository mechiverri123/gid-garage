// Local SEO agent operations: the action queue, Top-5 gap report, blueprint,
// learning history, knowledge base, rank observations, change detection and
// baselines. Built on createSeoOps (ops.js) data; pure logic lives in
// shared/seo/agent.js + agent-detectors.js. Tables from seo_agent_migration.sql
// (seo_snapshots, seo_knowledge, seo_rank_observations) are optional: before the
// migration runs, those parts report "not set up" and everything else works.
// Tests: tests/seo-agent.test.js

import { actionQueue, blueprint as buildBlueprint, categoryLearning, top5Gap, changesSince, jobContentCandidates, dueHorizons, horizonVerdict, playbookFor, parseRankCsv, rankGrid, OUTCOME_DAYS } from '../../../shared/seo/agent.js';
import { detectSiteStructure, detectReviewGap, detectJobContent, detectKnowledgeChanges, detectSearchUpdates, detectAiVisibility, currentCrawl } from '../../../shared/seo/agent-detectors.js';
import { readJson } from '../jarvis-feeds.js';
import { NEWS_KEY, AI_KEY, ongoingUpdates } from './monitors.js';
import { KNOWLEDGE, withStoredStatus, pageFingerprint } from '../../../shared/seo/knowledge.js';
import { annotateGsc } from '../../../shared/seo/kpis.js';
import { serviceClusters } from '../../../shared/seo/demand.js';
import { PLACES, isInsideServiceArea } from '../../../shared/seo/service-area.js';

// Named test areas for rank observations: every known place inside the radius.
const SERVICE_AREA_PLACES = PLACES.filter(p => isInsideServiceArea({ lat: p.lat, lng: p.lng }).inside === true).map(({ name, lat, lng }) => ({ name, lat, lng }));

const DAY = 86400000;
const ymd = d => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => ymd(new Date(new Date(`${ymd(d)}T12:00:00Z`).getTime() + n * DAY));
const LOCAL = new Set(['likely_local', 'confirmed_local']);
const KNOWLEDGE_EVERY_DAYS = 7;

// h: helpers from createSeoOps — { gscPeriod, gbpPeriod, analysisContext, servicesNow, windows }
export function createAgentOps({ store, env = {}, now = new Date(), h }) {
  const safe = p => p.catch(() => []);
  const missingTable = e => /does not exist|relation|42P01|PGRST205|schema cache/i.test(String(e?.message || e));

  async function knowledge() {
    let stored = []; let ready = true;
    try { stored = await store.select('seo_knowledge', { select: '*' }); } catch (e) { if (missingTable(e)) ready = false; }
    return { ready, entries: withStoredStatus(KNOWLEDGE, stored) };
  }

  async function ownReviews() {
    const [latest] = await safe(store.select('seo_review_snapshots', { select: 'rating,review_count,captured_at', subject: 'eq.own', order: 'captured_at.desc', limit: '1' }));
    return latest ? { count: latest.review_count, rating: latest.rating == null ? null : Number(latest.rating), at: latest.captured_at } : null;
  }
  const competitorRows = () => safe(store.select('seo_competitors', { select: 'id,name,tier,kind,weight,rating,review_count,inside_service_area,distance_miles', status: 'eq.active' }));
  const recentJobs = () => safe(store.select('bookings', { select: 'id,date,service,vehicle,job_status,has_photos,has_inspection,job_photos,pre_scan,post_scan,line_items', date: `gte.${addDays(now, -365)}`, order: 'date.desc', limit: '300' }));
  const latestAudits = async () => {
    return currentCrawl(await safe(store.select('seo_page_audits', { select: '*', order: 'fetched_at.desc', limit: '120' })));
  };

  // Outside-world monitors (monitors.js) keep their state in R2.
  const bucket = env.GID_PHOTOS;
  const newsItems = async () => (await readJson(bucket, NEWS_KEY))?.items || [];
  const aiRuns = async () => (await readJson(bucket, AI_KEY))?.runs || [];
  async function news() {
    const doc = await readJson(bucket, NEWS_KEY);
    const items = doc?.items || [];
    return { checkedAt: doc?.checkedAt || null, ongoing: ongoingUpdates(items), items: items.filter(i => i.relevance !== 'info').slice(0, 40) };
  }
  async function aiVisibility() { return { runs: await aiRuns() }; }

  // Extra recommendations for analyze() (they pass the same service/content gates).
  async function detections(c) {
    const [audits, own, comps, jobs, kb, items, runs] = await Promise.all([latestAudits(), ownReviews(), competitorRows(), recentJobs(), knowledge(), newsItems().catch(() => []), aiRuns().catch(() => [])]);
    return [
      ...detectSiteStructure(audits, { services: c.services, clusters: c.clusters }),
      ...detectReviewGap(own, comps),
      ...detectJobContent(jobContentCandidates(jobs)),
      ...detectKnowledgeChanges(kb.entries),
      ...detectSearchUpdates(items, now),
      ...detectAiVisibility(runs[0]),
    ];
  }

  // ---- outcomes at 7/30/90/180 days -------------------------------------------------------
  const metricFor = rec => {
    if (rec.metric?.kind) return rec.metric;
    const cat = playbookFor(rec).category;
    if (cat === 'REVIEWS') return { kind: 'review_gain' };
    if (cat === 'GBP') return { kind: 'gbp_actions' };
    if (['CONTENT', 'WEBSITE', 'TECHNICAL SEO', 'COMPETITOR GAP'].includes(cat)) return { kind: 'local_impressions' };
    return null;
  };
  async function windowValue(metric, from, to, services) {
    const days = Math.round((new Date(to) - new Date(from)) / DAY) + 1;
    const per = total => ({ total, perDay: days ? total / days : null });
    if (metric.kind === 'gbp_actions') {
      const rows = await h.gbpPeriod({ from, to });
      if (!rows.length) return null;
      return per(rows.filter(r => ['CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'].includes(r.metric)).reduce((s, r) => s + Number(r.value || 0), 0));
    }
    if (metric.kind === 'review_gain') {
      const snaps = await safe(store.select('seo_review_snapshots', { select: 'review_count,captured_at', subject: 'eq.own', captured_at: `gte.${from}`, and: `(captured_at.lte.${to}T23:59:59)`, order: 'captured_at.asc' }));
      if (snaps.length < 2) return null;
      return per(Number(snaps[snaps.length - 1].review_count) - Number(snaps[0].review_count));
    }
    const rows = await h.gscPeriod({ from, to });
    if (!rows.length) return null;
    if (metric.kind === 'gsc_query_page_clicks') return per(rows.filter(r => r.query === metric.query && (!metric.page || r.page === metric.page)).reduce((s, r) => s + r.clicks, 0));
    if (metric.kind === 'gsc_query_position') {
      const q = rows.filter(r => r.query === metric.query); const imp = q.reduce((s, r) => s + r.impressions, 0);
      return imp ? { total: imp, perDay: q.reduce((s, r) => s + r.position * r.impressions, 0) / imp } : null;
    }
    if (metric.kind === 'service_local_impressions') return per(serviceClusters(rows, [], services).find(c => c.service === metric.service)?.localImpressions ?? 0);
    if (metric.kind === 'local_impressions') return per(rows.filter(r => LOCAL.has(r.locality)).reduce((s, r) => s + r.impressions, 0));
    return null;
  }
  // Bounded per run (each horizon is two data reads); the rest are picked up next run.
  async function measureHorizons(recs, services, max = 6) {
    const rows = [];
    let budget = max;
    for (const r of recs.filter(x => ['applied', 'measured'].includes(x.status))) {
      const due = dueHorizons(r, now);
      if (!due.length) continue;
      const metric = metricFor(r);
      const horizons = { ...(r.outcome?.horizons || {}) };
      for (const d of due) {
        if (budget-- <= 0) break;
        const applied = ymd(r.applied_at);
        if (!metric) { horizons[d] = { verdict: 'insufficient_data', note: 'No metric tracks this kind of action.', measuredAt: now.toISOString() }; continue; }
        const [before, after] = await Promise.all([windowValue(metric, addDays(applied, -d), addDays(applied, -1), services), windowValue(metric, applied, addDays(applied, d - 1), services)]);
        horizons[d] = { verdict: horizonVerdict(before, after, { betterIs: metric.kind === 'gsc_query_position' ? 'lower' : 'higher', minVolume: metric.kind === 'review_gain' ? 1 : 5 }), metric: metric.kind, before, after, measuredAt: now.toISOString() };
      }
      rows.push({ ...r, outcome: { ...(r.outcome || {}), horizons, note: 'Before/after the change, same-length windows. Correlation only: season, competitors and Google updates also move these numbers.' }, updated_at: now.toISOString() });
      if (budget <= 0) break;
    }
    return rows;
  }

  // ---- snapshots (baseline + "changes since last analysis") -------------------------------------
  // c / recs: pass what analyze() already loaded (the analysis call has a small request budget).
  async function snapshotData(c = null, recsIn = null) {
    c ||= await h.analysisContext();
    const local = c.gsc.filter(r => LOCAL.has(r.locality));
    const annotated = annotateGsc(c.gsc).filter(r => r.service === 'general' && r.intentClass === 'high_local_commercial' && r.position != null);
    const imp = annotated.reduce((s, r) => s + r.impressions, 0);
    const [own, comps, recs] = await Promise.all([ownReviews(), competitorRows(), recsIn || safe(store.selectAll('seo_recommendations', { select: '*' }))]);
    const q = actionQueue(recs);
    return {
      localImpressions: local.reduce((s, r) => s + r.impressions, 0),
      localClicks: local.reduce((s, r) => s + r.clicks, 0),
      avgCorePosition: imp ? Math.round((annotated.reduce((s, r) => s + r.position * r.impressions, 0) / imp) * 10) / 10 : null,
      ownReviews: own?.count ?? null, ownRating: own?.rating ?? null,
      rivalReviews: Object.fromEntries(comps.filter(x => x.inside_service_area !== false && x.review_count != null).sort((a, b) => b.review_count - a.review_count).slice(0, 8).map(x => [x.name, x.review_count])),
      openHigh: q.high.length, openMedium: q.medium.length, openLow: q.low.length,
      window: c.w.cur,
    };
  }
  async function recordSnapshot(c = null, recs = null) {
    try {
      const prev = await store.select('seo_snapshots', { select: 'id,label', order: 'created_at.asc', limit: '1' });
      const data = await snapshotData(c, recs);
      await store.insert('seo_snapshots', [{ label: prev.length ? `Analysis ${ymd(now)}` : 'Baseline #1', data }]);
      return { ok: true, baseline: !prev.length };
    } catch (e) {
      return { ok: false, error: missingTable(e) ? 'seo_snapshots table not created yet (run seo_agent_migration.sql)' : e.message };
    }
  }
  async function history() {
    const [snaps, recs] = await Promise.all([
      store.select('seo_snapshots', { select: 'id,label,created_at,data', order: 'created_at.desc', limit: '60' }).catch(e => (missingTable(e) ? null : [])),
      safe(store.selectAll('seo_recommendations', { select: '*' })),
    ]);
    const learning = categoryLearning(recs);
    const outcomes = recs.filter(r => r.applied_at).sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at))).map(r => ({
      id: r.id, title: r.title, category: playbookFor(r).category, appliedAt: r.applied_at, status: r.status,
      horizons: Object.fromEntries(OUTCOME_DAYS.map(d => [d, r.outcome?.horizons?.[d]?.verdict || null])), baseline: r.baseline,
    }));
    return { ready: snaps !== null, snapshots: (snaps || []).map(s => ({ id: s.id, label: s.label, at: s.created_at, data: s.data })), changes: snaps?.length >= 2 ? changesSince(snaps[1].data, snaps[0].data) : [], learning, outcomes };
  }

  // ---- views --------------------------------------------------------------------------------
  async function actions() {
    const [recs, kb, hist, items] = await Promise.all([safe(store.selectAll('seo_recommendations', { select: '*' })), knowledge(), history().catch(() => ({ changes: [], snapshots: [] })), newsItems().catch(() => [])]);
    const q = actionQueue(recs, categoryLearning(recs), kb.entries);
    const top = q.high[0] || q.medium[0] || null;
    const problem = [...q.high, ...q.medium].find(c => ['REVIEWS', 'TECHNICAL SEO'].includes(c.category) || /gap/i.test(c.title)) || top;
    const last = hist.snapshots?.[0]?.data || null;
    return {
      status: {
        visibility: last ? { localImpressions: last.localImpressions, localClicks: last.localClicks, avgCorePosition: last.avgCorePosition, window: last.window } : null,
        trend: hist.changes?.find(ch => ch.kind === 'localImpressions') || null,
        biggestOpportunity: top ? { title: top.title, score: top.opportunityScore } : null,
        biggestProblem: problem ? { title: problem.title, category: problem.category } : null,
        changes: hist.changes || [],
        searchUpdates: ongoingUpdates(items).map(i => ({ title: i.title, started: i.date, url: i.url })),
        lastAnalysis: hist.snapshots?.[0]?.at || null, baselineAt: hist.snapshots?.length ? hist.snapshots[hist.snapshots.length - 1].at : null,
      },
      ...q,
    };
  }
  async function blueprintView() { const a = await actions(); return { horizons: buildBlueprint(a) }; }

  async function top5() {
    const [c, own, comps, recs, kb, ranks, citations, authority, conn, jobs, snaps] = await Promise.all([
      h.analysisContext(), ownReviews(), competitorRows(), safe(store.selectAll('seo_recommendations', { select: '*' })), knowledge(),
      safe(store.select('seo_rank_observations', { select: 'id', limit: '1000' })), safe(store.select('seo_citations', { select: 'id' })),
      safe(store.select('seo_authority_opportunities', { select: 'id' })), safe(store.select('seo_provider_status', { select: 'provider,status' })),
      recentJobs(), safe(store.select('seo_review_snapshots', { select: 'review_count,captured_at', subject: 'eq.own', order: 'captured_at.asc', limit: '1000' })),
    ]);
    const ai = (await aiRuns().catch(() => []))[0] || null;
    const q = actionQueue(recs, categoryLearning(recs), kb.entries);
    const offered = c.services.filter(s => s.offered === true).map(s => s.id);
    const audits = await latestAudits();
    const gapSvcs = new Set(recs.filter(r => r.status !== 'expired' && r.evidence?.code === 'service_page_gap').map(r => r.evidence.service));
    const annotated = annotateGsc(c.gsc).filter(r => r.service === 'general' && r.intentClass === 'high_local_commercial' && r.position != null);
    const byQ = new Map();
    for (const r of annotated) { const x = byQ.get(r.query) || { query: r.query, impressions: 0, pw: 0 }; x.impressions += r.impressions; x.pw += r.position * r.impressions; byQ.set(r.query, x); }
    const coreQueries = [...byQ.values()].map(x => ({ query: x.query, impressions: x.impressions, position: Math.round((x.pw / x.impressions) * 10) / 10 })).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
    const first = snaps[0]; const last = snaps[snaps.length - 1];
    const sinceDays = first && last ? Math.round((new Date(last.captured_at) - new Date(first.captured_at)) / DAY) : 0;
    const gap = top5Gap({
      ownReviews: own, competitors: comps,
      servicePages: { offered, withPage: audits.length ? offered.filter(s => !gapSvcs.has(s)) : [] },
      techIssues: [...q.high, ...q.medium, ...q.low].filter(x => x.category === 'TECHNICAL SEO').length,
      pagespeedMobile: c.pagespeed.find(p => p.strategy === 'mobile')?.perf_score ?? null,
      coreQueries, gbpConnected: conn.some(p => p.provider === 'business_profile' && p.status === 'connected'),
      rankObservations: ranks.length, citations: citations.length, authority: authority.length,
      reviewVelocity: sinceDays ? { ours: Number(last.review_count) - Number(first.review_count), sinceDays } : null,
      caseStudies: 4, jobCandidates: jobContentCandidates(jobs).filter(j => j.score >= 40).length, ai,
    });
    return { ...gap, actions: q.high.slice(0, 4).map(x => ({ id: x.id, title: x.title, category: x.category })) };
  }

  async function jobs() { return { candidates: jobContentCandidates(await recentJobs(), { limit: 10 }), privacy: 'Vehicle, work done and month only — no names, contacts or addresses.' }; }

  // ---- rank observations -------------------------------------------------------------------------
  async function ranks() {
    try {
      const rows = await store.select('seo_rank_observations', { select: '*', order: 'observed_on.desc', limit: '2000' });
      return { ready: true, grid: rankGrid(rows), recent: rows.slice(0, 50), areas: SERVICE_AREA_PLACES };
    } catch (e) { return { ready: !missingTable(e), grid: rankGrid([]), recent: [], areas: SERVICE_AREA_PLACES, error: missingTable(e) ? 'Run seo_agent_migration.sql to enable rank observations.' : e.message }; }
  }
  const placeFor = name => SERVICE_AREA_PLACES.find(p => p.name.toLowerCase() === String(name).toLowerCase());
  async function addRanks(rows) {
    const clean = rows.map(r => ({ ...r, lat: r.lat ?? placeFor(r.area_name)?.lat ?? null, lng: r.lng ?? placeFor(r.area_name)?.lng ?? null, competitors: r.competitors || [], method: r.method || 'manual' }));
    if (!clean.length) return { ok: true, added: 0 };
    const out = await store.insert('seo_rank_observations', clean);
    return { ok: true, added: out.length };
  }
  async function addRank({ keyword, area, rank, date, inLocalPack = false, competitors = [], note = '' }) {
    const r = parseRankCsv(`keyword,area,rank,date,in_local_pack,competitors\n${[keyword, area, rank ?? '', date || ymd(now), inLocalPack ? 'yes' : '', (competitors || []).join(';')].map(v => String(v).replace(/,/g, ' ')).join(',')}`);
    if (r.errors.length) throw new Error('Keyword, area and a rank 1–100 (or blank for not ranked) are required.');
    return addRanks(r.rows.map(x => ({ ...x, method: 'manual', note: String(note).slice(0, 300) || null })));
  }
  async function importRanks(csv) {
    const r = parseRankCsv(csv);
    const added = await addRanks(r.rows.slice(0, 1000));
    return { ...added, errors: r.errors.slice(0, 20), skipped: r.errors.length };
  }

  // ---- knowledge refresh (weekly) ------------------------------------------------------------------
  async function knowledgeDue() {
    try {
      const rows = await store.select('seo_knowledge', { select: 'last_checked_at', order: 'last_checked_at.asc.nullsfirst', limit: '1' });
      return !rows.length || !rows[0].last_checked_at || now - new Date(rows[0].last_checked_at) > KNOWLEDGE_EVERY_DAYS * DAY;
    } catch { return false; } // table not there yet
  }
  // A page counts as changed only when its visible text length moves > 3%
  // (help pages carry small dynamic bits that change the hash on every load).
  async function refreshKnowledge(fetchImpl = (...a) => fetch(...a)) {
    const stored = new Map((await store.select('seo_knowledge', { select: '*' })).map(r => [r.id, r]));
    const byUrl = new Map();
    for (const k of KNOWLEDGE.filter(x => x.tier === 'google_confirmed')) byUrl.set(k.url, [...(byUrl.get(k.url) || []), k]);
    const rows = []; const changed = [];
    for (const [url, entries] of byUrl) {
      let fp = null;
      try { const res = await fetchImpl(url, { headers: { 'User-Agent': 'GID-Garage-SEO-Research/1.0' } }); if (res.ok) fp = pageFingerprint(await res.text()); } catch { /* try next week */ }
      for (const k of entries) {
        const s = stored.get(k.id);
        const moved = fp && s?.content_length && Math.abs(fp.length - s.content_length) / s.content_length > 0.03;
        const status = s?.status === 'superseded' ? 'superseded' : moved ? 'changed' : (s?.status || 'active');
        if (moved && s?.status !== 'changed') changed.push(k.id);
        rows.push({ id: k.id, status, content_hash: fp?.hash ?? s?.content_hash ?? null, content_length: moved || !s?.content_length ? fp?.length ?? null : s.content_length, last_checked_at: now.toISOString(), changed_at: moved ? now.toISOString() : s?.changed_at ?? null, retrieved_at: s?.retrieved_at ?? '2026-09-29' });
      }
    }
    await store.upsert('seo_knowledge', rows, 'id');
    return { checked: byUrl.size, changed };
  }
  async function setKnowledgeStatus({ id, status }) {
    if (!['active', 'superseded'].includes(status)) throw new Error('status must be active or superseded');
    if (!KNOWLEDGE.some(k => k.id === id)) throw new Error('Unknown knowledge entry.');
    await store.upsert('seo_knowledge', [{ id, status, changed_at: null, last_checked_at: now.toISOString() }], 'id');
    return { ok: true, id, status };
  }

  return { detections, measureHorizons, recordSnapshot, history, actions, blueprint: blueprintView, top5, jobs, knowledge, ranks, addRank, importRanks, knowledgeDue, refreshKnowledge, setKnowledgeStatus, news, aiVisibility };
}
