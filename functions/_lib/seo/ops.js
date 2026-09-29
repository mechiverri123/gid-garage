// SEO operations — the ONE read/analysis layer used by the SEO API
// (functions/jarvis/seo-data.js), Jarvis tools (admin-ai-chat.js), the proactive briefing and
// the sync job. Numbers come from here + shared/seo, never from the model.
// Tests: tests/seo-sync.test.js

import { computeOverview, annotateGsc, customerGeography as geoAggregate, localDailySeries } from '../../../shared/seo/kpis.js';
import { serviceClusters, demandGaps, unconfirmedServiceDemand, nonOpportunities, AUTHORITY_STARTERS, authorityScore, citationIssues } from '../../../shared/seo/demand.js';
import { competitorLandscape, reviewVelocity, detectChanges } from '../../../shared/seo/competitors.js';
import { seasonalFindings, eventsForYear, forecastColdSnap } from '../../../shared/seo/seasonality.js';
import { runDetectors } from '../../../shared/seo/detectors.js';
import { transition, mergeDetected, evaluateApplied, buildSeoBriefing, ACTIONS } from '../../../shared/seo/lifecycle.js';
import { detectService } from '../../../shared/seo/local-intent.js';
import { resolveServices } from '../../../shared/seo/services.js';
import { SERVICE_AREA } from '../../../shared/seo/service-area.js';
import { serviceEvidence, capacityFactor } from '../../../shared/seo/evidence.js';
import { providerStatuses } from './providers.js';
import { createAgentOps } from './agent-ops.js';

const DAY = 86400000;
const ymd = d => new Date(d).toISOString().slice(0, 10);
const shift = (d, n) => ymd(new Date(new Date(`${ymd(d)}T12:00:00Z`).getTime() + n * DAY));
const GSC_LAG = 3;

export function windows(now, days = 28) {
  const curTo = shift(now, -GSC_LAG);
  const curFrom = shift(curTo, -(days - 1));
  const prevTo = shift(curFrom, -1);
  return { cur: { from: curFrom, to: curTo }, prev: { from: shift(prevTo, -(days - 1)), to: prevTo }, days };
}

const numify = r => ({ ...r, clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0), position: r.position == null ? null : Number(r.position) });

export function createSeoOps({ store, env = {}, now = new Date() }) {
  const safe = p => p.catch(() => []);
  const gscPeriod = async w => (await safe(store.rpc('seo_gsc_period', { p_from: w.from, p_to: w.to }))).map(numify);
  const gbpPeriod = w => safe(store.select('seo_gbp_daily', { select: 'date,metric,value', date: `gte.${w.from}`, and: `(date.lte.${w.to})` }));
  const settings = async () => (await safe(store.select('seo_settings', { id: 'eq.default', limit: '1' })))[0] || {};
  // Canonical catalog + the owner's confirmations (seo_settings.services).
  const servicesNow = async () => resolveServices((await settings()).services);

  // What each service actually produced (12 months) + schedule room, for scoring.
  async function businessInputs() {
    const since = shift(now, -365);
    const [leads, bookings] = await Promise.all([
      safe(store.selectAll('leads', { select: 'created_at,requested_service', created_at: `gte.${since}` })),
      safe(store.selectAll('bookings', { select: 'id,date,date_tbd,service,job_status,status,paid_at,amount_paid,invoice_amount,tax_amount,parts_cost,payments', date: `gte.${since}` })),
    ]);
    return { serviceEvidence: serviceEvidence({ leads, bookings }, now), capacity: capacityFactor(bookings, now) };
  }

  async function funnelInputs(w) {
    const leads = await safe(store.selectAll('leads', { select: 'id,created_at,source,status,booking_id', created_at: `gte.${w.from}`, and: `(created_at.lte.${w.to}T23:59:59)` }));
    const ids = [...new Set(leads.map(l => l.booking_id).filter(Boolean))];
    const bookings = ids.length ? await safe(store.select('bookings', { select: 'id,service_address,notes,amount_paid', id: `in.(${ids.join(',')})` })) : [];
    return { leads, bookingsById: new Map(bookings.map(b => [b.id, b])) };
  }

  async function overview({ days = 28 } = {}) {
    const w = windows(now, days);
    const [gscCur, gscPrev, gbpCur, gbpPrev, fc, fp, totals] = await Promise.all([
      gscPeriod(w.cur), gscPeriod(w.prev), gbpPeriod(w.cur), gbpPeriod(w.prev), funnelInputs(w.cur), funnelInputs(w.prev),
      safe(store.select('seo_gsc_totals', { select: 'impressions', date: `gte.${w.cur.from}`, and: `(date.lte.${w.cur.to})` })),
    ]);
    const o = computeOverview({
      gscCur, gscPrev, gbpCur, gbpPrev, leadsCur: fc.leads, leadsPrev: fp.leads,
      bookingsById: new Map([...fp.bookingsById, ...fc.bookingsById]),
      gscTotals: totals.length ? { impressions: totals.reduce((s, r) => s + Number(r.impressions || 0), 0) } : null,
    });
    const statuses = providerStatuses(env);
    const [ga4Rows, igDaily, igAudience] = await Promise.all([
      safe(store.selectAll('seo_ga4_daily', { select: 'sessions,key_events,locality,ai_assistant', date: `gte.${w.cur.from}`, and: `(date.lte.${w.cur.to})` })),
      safe(store.select('seo_instagram_daily', { select: 'date,followers', order: 'date.desc', limit: '1' })),
      safe(store.select('seo_instagram_audience', { select: 'captured_at,followers,locality', order: 'captured_at.desc', limit: '200' })),
    ]);
    const sumBy = (rows, key, val) => rows.reduce((m, r) => ({ ...m, [r[key] || 'unknown']: (m[r[key] || 'unknown'] || 0) + Number(r[val] || 0) }), {});
    const latestAud = igAudience.filter(a => a.captured_at === igAudience[0]?.captured_at);
    const audTotal = latestAud.reduce((s, a) => s + Number(a.followers || 0), 0);
    return {
      period: { ...w.cur, days, comparedTo: w.prev, note: `Search data lags ~${GSC_LAG} days, so the window ends ${w.cur.to}.` },
      serviceArea: { center: SERVICE_AREA.name, radiusMiles: SERVICE_AREA.radiusMiles },
      ...o,
      // GA4: city is IP-derived, so the best label is likely_local.
      website: ga4Rows.length ? {
        sessionsByLocality: sumBy(ga4Rows, 'locality', 'sessions'),
        localKeyEvents: ga4Rows.filter(r => r.locality === 'likely_local').reduce((s, r) => s + Number(r.key_events || 0), 0),
        aiAssistantSessions: sumBy(ga4Rows.filter(r => r.ai_assistant), 'ai_assistant', 'sessions'),
      } : null,
      // Instagram: local followers matter, not the raw count.
      instagram: igDaily.length ? {
        followers: igDaily[0].followers,
        localFollowerSharePct: audTotal ? Math.round((latestAud.filter(a => a.locality === 'likely_local').reduce((s, a) => s + Number(a.followers || 0), 0) / audTotal) * 1000) / 10 : null,
        note: 'Share of followers in cities inside the service area (Instagram\'s own city estimate — likely, not confirmed).',
      } : null,
      dataSources: { connected: statuses.filter(s => ['connected', 'ready_limited'].includes(s.status)).map(s => s.id), notConnected: statuses.filter(s => !['connected', 'ready_limited'].includes(s.status)).map(s => ({ id: s.id, status: s.status })) },
      hasSearchData: gscCur.length > 0 || gbpCur.length > 0,
      // Daily local impressions/clicks + local discovery leads/bookings for the chart and sparklines.
      series: localDailySeries({ serviceDaily: await safe(store.rpc('seo_gsc_service_daily', { p_from: w.cur.from, p_to: w.cur.to })), leads: fc.leads, bookingsById: fc.bookingsById, from: w.cur.from, to: w.cur.to }),
    };
  }

  async function competitorsView() {
    const [comps, snaps, changes, own, services] = await Promise.all([
      safe(store.select('seo_competitors', { select: '*', status: 'eq.active' })),
      safe(store.selectAll('seo_review_snapshots', { select: 'subject,captured_at,review_count', order: 'captured_at.asc' }, 5000)),
      safe(store.select('seo_competitor_changes', { select: '*', order: 'detected_at.desc', limit: '20' })),
      safe(store.select('seo_page_audits', { select: 'url,schema_types', order: 'fetched_at.desc', limit: '1' })),
      servicesNow(),
    ]);
    const bySubject = new Map();
    for (const s of snaps) bySubject.set(s.subject, [...(bySubject.get(s.subject) || []), { at: s.captured_at, reviewCount: s.review_count }]);
    const enriched = comps.map(c => ({ ...c, reviewCount: c.review_count, reviewVelocity: reviewVelocity(bySubject.get(c.id) || []), services: c.services || [] }));
    const ourServices = services.filter(s => s.offered === true && s.id !== 'general').map(s => s.id);
    const nameOf = id => comps.find(c => c.id === id)?.name || id;
    return {
      landscape: competitorLandscape(enriched, own.length ? ourServices : [], services),
      searchResultCompetitors: comps.filter(c => c.kind === 'search_result').map(c => c.name),
      ourReviewVelocity: reviewVelocity(bySubject.get('own') || []),
      recentChanges: changes.map(ch => ({ ...ch, name: nameOf(ch.competitor_id), tier: comps.find(c => c.id === ch.competitor_id)?.tier || null })),
      note: 'Weighted by local customer competition: mobile mechanics 1.0, local shops 0.6, dealers/chains 0.3, anything outside the service area 0.',
    };
  }

  async function localDemand({ days = 28 } = {}) {
    const w = windows(now, days);
    const [rows, kws, cv, services, biz] = await Promise.all([gscPeriod(w.cur), safe(store.select('seo_gbp_keywords', { select: 'keyword,impressions,threshold,month', order: 'month.desc', limit: '200' })), competitorsView(), servicesNow(), businessInputs()]);
    const latestMonth = kws[0]?.month;
    const gbpKeywords = kws.filter(k => k.month === latestMonth).map(k => ({ keyword: k.keyword, impressions: k.impressions ?? 0 }));
    const clusters = serviceClusters(rows, gbpKeywords, services);
    return { period: w.cur, clusters, gaps: demandGaps(clusters, { competitors: cv.landscape, services, evidence: biz.serviceEvidence, capacity: biz.capacity }), capacity: biz.capacity, unconfirmedServiceDemand: unconfirmedServiceDemand(clusters, services), ...nonOpportunities(rows), gbpKeywordsMonth: latestMonth || null, hasData: rows.length > 0 || gbpKeywords.length > 0 };
  }

  async function seasonality() {
    const year = now.getUTCFullYear();
    const [dbEvents, leads, svcDaily, forecast, weatherDays] = await Promise.all([
      safe(store.select('seo_calendar_events', { select: '*' })),
      safe(store.selectAll('leads', { select: 'created_at,requested_service', created_at: `gte.${year - 2}-01-01` })),
      safe(store.rpc('seo_gsc_service_daily', { p_from: `${year - 2}-01-01`, p_to: ymd(now) })),
      safe(store.select('seo_weather_forecast', { select: 'date,tmin_f', date: `gte.${ymd(now)}`, order: 'date.asc' })),
      safe(store.select('seo_weather_daily', { select: 'date', limit: '1' })),
    ]);
    const events = dbEvents.length ? dbEvents.map(e => ({ kind: e.kind, label: e.label, start: e.start_date, end: e.end_date, approximate: !!e.approximate })) : [year - 2, year - 1].flatMap(y => eventsForYear(y));
    const series = { leads: leads.map(l => ({ date: String(l.created_at).slice(0, 10), value: 1 })) };
    for (const l of leads) { const s = detectService(l.requested_service || ''); if (s) (series[`leads:${s.id}`] ||= []).push({ date: String(l.created_at).slice(0, 10), value: 1 }); }
    for (const r of svcDaily) if (['likely_local', 'confirmed_local'].includes(r.locality) && r.service !== 'none') (series[`local searches:${r.service}`] ||= []).push({ date: r.date, value: Number(r.impressions || 0) });
    const findings = seasonalFindings(series, events);
    return {
      findings: findings.filter(f => f.verdict !== 'insufficient_data'),
      insufficientDataCount: findings.filter(f => f.verdict === 'insufficient_data').length,
      eventsUsed: events, usingApproximateNauDates: !dbEvents.length,
      upcomingColdSnap: forecastColdSnap(forecast.map(f => ({ date: f.date, tminF: Number(f.tmin_f) }))),
      weatherHistoryConnected: weatherDays.length > 0,
      note: 'Patterns are only stated when the data shows a clear change against surrounding weeks.',
    };
  }

  async function customerGeography({ days = 365 } = {}) {
    const since = shift(now, -days);
    const [bookings, leads, comps] = await Promise.all([
      safe(store.selectAll('bookings', { select: 'id,service_address,notes,job_status,status', date: `gte.${since}` })),
      safe(store.selectAll('leads', { select: 'booking_id,notes', created_at: `gte.${since}` })),
      safe(store.select('seo_competitors', { select: 'name,lat,lng,tier,inside_service_area', status: 'eq.active', kind: 'eq.business' })),
    ]);
    const addressOf = b => b.service_address || (String(b.notes || '').match(/Address:\s*([^|]+)/)?.[1] ?? '');
    const active = bookings.filter(b => b.job_status !== 'CANCELLED' && String(b.status || '').toLowerCase() !== 'cancelled');
    const byId = new Map(bookings.map(b => [b.id, b]));
    // A lead's area: its job's service address once booked, else a place named in its notes.
    const leadGeo = geoAggregate(leads.map(l => ({ address: byId.has(l.booking_id) ? addressOf(byId.get(l.booking_id)) : (l.notes || '') })));
    return {
      ...geoAggregate(active.map(b => ({ address: addressOf(b) }))),
      leads: leadGeo,
      // Public Places locations of local competitors inside the radius (mobile ones often hide theirs).
      competitors: comps.filter(c => c.inside_service_area === true && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) && c.lat != null && c.lng != null)
        .map(c => ({ name: c.name, lat: Number(c.lat), lng: Number(c.lng), tier: c.tier })),
      center: SERVICE_AREA.center, radiusMiles: SERVICE_AREA.radiusMiles, periodDays: days,
      privacy: 'Counts by community only; groups under 3 jobs or leads are merged so no customer can be singled out.',
    };
  }

  async function authority() {
    const [s, stored, citations] = await Promise.all([settings(), safe(store.select('seo_authority_opportunities', { select: '*' })), safe(store.select('seo_citations', { select: '*' }))]);
    const canonical = { name: s.canonical_name || 'GID Garage', phone: s.canonical_phone || '', website: s.canonical_website || '', hideAddress: s.hide_address !== false };
    const known = new Set(stored.map(o => o.name.toLowerCase()));
    const ideas = [...stored, ...AUTHORITY_STARTERS.filter(a => !known.has(a.name.toLowerCase())).map(a => ({ ...a, status: 'idea', relevance: 0.8, effort: 0.3 }))];
    return { opportunities: ideas.map(o => ({ ...o, score: authorityScore(o) })).sort((a, b) => b.score - a.score), citations: citations.map(c => ({ ...c, issues: citationIssues(canonical, c) })), canonical };
  }

  async function connections() {
    const [stored, runs] = await Promise.all([safe(store.select('seo_provider_status', { select: '*' })), safe(store.select('seo_sync_runs', { select: '*', order: 'started_at.desc', limit: '30' }))]);
    const byId = new Map(stored.map(r => [r.provider, r]));
    const run = byId.get('__sync_run__');
    return { providers: providerStatuses(env).map(p => ({ ...p, lastSyncAt: byId.get(p.id)?.last_sync_at || null, lastError: byId.get(p.id)?.last_error || null, backfilledFrom: byId.get(p.id)?.cursor?.backfilledFrom || null })), recentRuns: runs, lastRun: run ? { status: run.status, detail: run.detail, error: run.last_error, at: run.updated_at } : null };
  }

  // status: one status, 'all', or 'active' = everything still in play (open,
  // accepted, applied/being measured, measured) with in-progress ones first,
  // so an accepted item never drops out of view before it's marked applied.
  const IN_PROGRESS_FIRST = { accepted: 0, applied: 1, measured: 2, open: 3 };
  async function opportunities({ status = 'open', limit = 25 } = {}) {
    const params = { select: '*', order: 'score.desc', limit: String(limit) };
    if (status === 'active') params.status = 'in.(open,accepted,applied,measured)';
    else if (status !== 'all') params.status = `eq.${status}`;
    const rows = await safe(store.select('seo_recommendations', params));
    return status === 'active' ? rows.sort((a, b) => (IN_PROGRESS_FIRST[a.status] ?? 9) - (IN_PROGRESS_FIRST[b.status] ?? 9) || b.score - a.score) : rows;
  }

  // Current value of the metric a recommendation is tracked by.
  async function metricValue(metric, ctx) {
    if (!metric) return null;
    if (metric.kind === 'gsc_query_page_clicks') return ctx.gsc.filter(r => r.query === metric.query && (!metric.page || r.page === metric.page)).reduce((s, r) => s + r.clicks, 0);
    if (metric.kind === 'gsc_query_position') { const r = ctx.gsc.filter(x => x.query === metric.query); const imp = r.reduce((s, x) => s + x.impressions, 0); return imp ? r.reduce((s, x) => s + x.position * x.impressions, 0) / imp : null; }
    if (metric.kind === 'service_local_impressions') return ctx.clusters.find(c => c.service === metric.service)?.localImpressions ?? 0;
    if (metric.kind === 'gbp_actions') return ctx.gbpActions;
    if (metric.kind === 'pagespeed_perf') return ctx.pagespeed.find(p => p.url === metric.url && p.strategy === 'mobile')?.perf_score ?? null;
    return null;
  }

  async function analysisContext() {
    const w = windows(now, 28);
    const [gsc, gscPrev, gbpCur, gbpPrev, ps, audits, citations, ads, cv, s] = await Promise.all([
      gscPeriod(w.cur), gscPeriod(w.prev), gbpPeriod(w.cur), gbpPeriod(w.prev),
      safe(store.select('seo_pagespeed_runs', { select: '*', order: 'fetched_at.desc', limit: '20' })),
      safe(store.select('seo_page_audits', { select: '*', order: 'fetched_at.desc', limit: '120' })),
      safe(store.select('seo_citations', { select: '*' })),
      safe(store.select('seo_ads_location_daily', { select: '*', date: `gte.${w.cur.from}` })),
      competitorsView(), settings(),
    ]);
    const biz = await businessInputs();
    const latest = (rows, key) => [...new Map(rows.map(r => [key(r), r])).values()];
    const pagespeed = latest(ps.slice().reverse(), r => `${r.url}|${r.strategy}`);
    const latestAudits = latest(audits.slice().reverse(), r => r.url);
    const services = resolveServices(s.services);
    const clusters = serviceClusters(gsc, [], services);
    const annotated = annotateGsc(gsc);
    const sumActions = rows => rows.filter(r => ['CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS', 'BUSINESS_CONVERSATIONS', 'BUSINESS_BOOKINGS'].includes(r.metric)).reduce((a, r) => a + Number(r.value || 0), 0);
    const overviewLike = computeOverview({ gscCur: gsc, gscPrev });
    return { w, gsc, clusters, services, annotated, pagespeed, audits: latestAudits, citations, ads, cv, s, gbpActions: sumActions(gbpCur), gbpActionsPrev: gbpPrev.length ? sumActions(gbpPrev) : null, overviewLike, biz };
  }

  // Record competitor page changes (latest vs previous snapshot, once).
  async function recordCompetitorChanges() {
    const snaps = await safe(store.select('seo_competitor_snapshots', { select: '*', order: 'fetched_at.desc', limit: '200' }));
    const byComp = new Map();
    for (const s of snaps) byComp.set(s.competitor_id, [...(byComp.get(s.competitor_id) || []), s]);
    const rows = [];
    for (const [id, list] of byComp) {
      const [next, prev] = list;
      if (!prev || next.content_hash === prev.content_hash) continue;
      const already = await safe(store.select('seo_competitor_changes', { select: 'id', competitor_id: `eq.${id}`, detected_at: `gte.${next.fetched_at}`, limit: '1' }));
      if (already.length) continue;
      for (const ch of detectChanges({ ...prev, description: prev.meta_description }, { ...next, description: next.meta_description })) rows.push({ competitor_id: id, change_type: ch.type, detail: ch });
    }
    if (rows.length) await store.insert('seo_competitor_changes', rows);
    return rows.length;
  }

  async function analyze() {
    const newChanges = await recordCompetitorChanges();
    const c = await analysisContext();
    const extra = await agent().detections(c).catch(() => []);
    const [prefs, existing, season] = await Promise.all([safe(store.select('seo_preferences', { select: '*' })), safe(store.selectAll('seo_recommendations', { select: '*' })), seasonality()]);
    const s = c.s;
    const detected = runDetectors({
      annotatedGsc: c.annotated, clusters: c.clusters, gaps: demandGaps(c.clusters, { competitors: c.cv.landscape, services: c.services, evidence: c.biz.serviceEvidence, capacity: c.biz.capacity }),
      serviceEvidence: c.biz.serviceEvidence, capacity: c.biz.capacity,
      localityBreakdown: c.overviewLike.localityBreakdown, localityBreakdownPrev: c.overviewLike.localityBreakdownPrev,
      gbpActions: c.gbpActions, gbpActionsPrev: c.gbpActionsPrev,
      ourReviewVelocity: c.cv.ourReviewVelocity, competitors: c.cv.landscape,
      pagespeed: c.pagespeed, audits: c.audits,
      competitorChanges: groupChanges(c.cv.recentChanges), ourServicesOffered: c.services.filter(x => x.offered === true).map(x => x.id),
      canonical: { name: s.canonical_name || 'GID Garage', phone: s.canonical_phone || '', website: s.canonical_website || '', hideAddress: s.hide_address !== false }, citations: c.citations,
      adsLocations: c.ads, outsideAreaDemand: nonOpportunities(c.gsc).outsideAreaDemand,
      advertisedPlaces: [...new Set(c.audits.flatMap(a => a.advertised_places || []))],
      seasonalFindings: season.findings, upcomingColdSnap: season.upcomingColdSnap,
      extra,
    }, { prefs, now, services: c.services });
    const upserts = mergeDetected(existing, detected, now).map(toRow);
    // Applied changes whose monitoring window ended get measured.
    const measured = [];
    for (const r of existing.filter(x => x.status === 'applied')) {
      const m = evaluateApplied(r, await metricValue(r.metric, { gsc: c.gsc, clusters: c.clusters, gbpActions: c.gbpActions, pagespeed: c.pagespeed }), { now, betterIs: r.metric?.kind === 'gsc_query_position' ? 'lower' : 'higher' });
      if (m) measured.push(toRow(m));
    }
    // 7/30/90/180-day outcomes for applied changes (learning loop).
    const measuredIds = new Set(measured.map(m => m.id));
    const horizons = (await agent().measureHorizons(existing.map(r => (measuredIds.has(r.id) ? { ...r, ...measured.find(m => m.id === r.id) } : r)), c.services).catch(() => [])).map(toRow);
    const byId = new Map([...upserts, ...measured, ...horizons].map(r => [r.id, r]));
    const all = [...byId.values()];
    if (all.length) await store.upsert('seo_recommendations', all, 'id');
    const after = new Map(existing.map(r => [r.id, r]));
    for (const r of all) after.set(r.id, { ...after.get(r.id), ...r });
    const snapshot = await agent().recordSnapshot(c, [...after.values()]);
    return { detected: detected.length, written: all.length, newOpen: upserts.filter(u => u.status === 'open' && !existing.some(e => e.id === u.id)).length, expired: upserts.filter(u => u.status === 'expired').length, measured: measured.length, horizonsMeasured: horizons.length, competitorChanges: newChanges, snapshot };
  }

  async function updateRecommendation({ id, action, reason = '', note = '' } = {}) {
    if (!ACTIONS.includes(action)) throw new Error(`action must be one of: ${ACTIONS.join(', ')}`);
    const rows = await store.select('seo_recommendations', { select: '*', id: `eq.${id}`, limit: '1' });
    const rec = rows[0];
    if (!rec) throw new Error('No SEO recommendation with that id.');
    let baseline = null;
    if (action === 'mark_applied') {
      const c = await analysisContext();
      baseline = { metric: rec.metric?.kind || null, value: await metricValue(rec.metric, { gsc: c.gsc, clusters: c.clusters, gbpActions: c.gbpActions, pagespeed: c.pagespeed }), window: c.w.cur };
    }
    const t = transition(rec, action, { now, reason, note, baseline });
    const fields = { status: t.rec.status, updated_at: t.rec.updated_at, rejected_reason: t.rec.rejected_reason ?? null, applied_at: t.rec.applied_at ?? rec.applied_at ?? null, applied_note: t.rec.applied_note ?? rec.applied_note ?? null, baseline: t.rec.baseline ?? rec.baseline ?? null, monitor_until: t.rec.monitor_until ?? rec.monitor_until ?? null };
    const after = await store.patch('seo_recommendations', { id: `eq.${id}` }, fields);
    if (!Array.isArray(after) || after.length !== 1 || after[0].status !== t.rec.status) throw new Error('Recommendation update was not confirmed by the database.');
    if (t.preference) await store.insert('seo_preferences', [t.preference]);
    return { ok: true, verified: true, entity: 'seo_recommendation', id, changed: { status: { before: rec.status, after: t.rec.status } }, remembered: t.preference ? `${t.preference.kind} ${t.preference.key}${t.preference.expires_at ? ` until ${t.preference.expires_at.slice(0, 10)}` : ''}` : null, monitorUntil: fields.monitor_until };
  }

  async function briefing() {
    const [o, recs, cv] = await Promise.all([overview({ days: 7 }), opportunities({ status: 'open', limit: 10 }), competitorsView()]);
    const changes = cv.recentChanges.filter(ch => Date.now() - new Date(ch.detected_at).getTime() < 8 * DAY).slice(0, 1).map(ch => ({ name: ch.name, summary: summarizeChange(ch) }));
    return { text: buildSeoBriefing({ overview: o, recommendations: recs.map(fromRow), competitorChanges: changes }), period: o.period };
  }

  // Query movement: this window vs the previous one, per query (all Search
  // Console queries, each labeled with its locality/intent from sync time).
  async function queries({ days = 28, limit = 40 } = {}) {
    const w = windows(now, days);
    const [cur, prev] = await Promise.all([gscPeriod(w.cur), gscPeriod(w.prev)]);
    const agg = rows => {
      const m = new Map();
      for (const r of rows) {
        const q = m.get(r.query) || { query: r.query, impressions: 0, clicks: 0, posWeight: 0, locality: r.locality, intent: r.intent_class };
        q.impressions += r.impressions; q.clicks += r.clicks; q.posWeight += (r.position || 0) * r.impressions;
        m.set(r.query, q);
      }
      return m;
    };
    const c = agg(cur); const p = agg(prev);
    const rows = [...c.values()].map(q => {
      const before = p.get(q.query);
      const position = q.impressions ? Math.round((q.posWeight / q.impressions) * 10) / 10 : null;
      const previousPosition = before?.impressions ? Math.round((before.posWeight / before.impressions) * 10) / 10 : null;
      return {
        query: q.query, locality: q.locality, intent: q.intent, impressions: q.impressions, clicks: q.clicks,
        ctrPct: q.impressions ? Math.round((q.clicks / q.impressions) * 1000) / 10 : 0,
        position, previousPosition, movement: position != null && previousPosition != null ? Math.round((previousPosition - position) * 10) / 10 : null,
      };
    }).sort((a, b) => b.impressions - a.impressions).slice(0, limit);
    return { period: w.cur, comparedTo: w.prev, rows, note: 'Movement = positions gained (+) or lost (−) vs the previous period; lower position is better.' };
  }

  // Technical health from what was actually measured (PageSpeed + page audits).
  async function technical() {
    const [runs, audits] = await Promise.all([
      safe(store.select('seo_pagespeed_runs', { select: '*', order: 'fetched_at.desc', limit: '20' })),
      safe(store.select('seo_page_audits', { select: '*', order: 'fetched_at.desc', limit: '20' })),
    ]);
    const latest = (rows, key) => [...new Map(rows.slice().reverse().map(r => [key(r), r])).values()];
    const pagespeed = latest(runs, r => `${r.url}|${r.strategy}`);
    const pages = latest(audits, r => r.url);
    const issues = pages.flatMap(a => (a.issues || []).map(i => ({ ...i, url: a.url })));
    const has = codes => issues.filter(i => codes.includes(i.code));
    const check = (key, label, codes, measured) => ({ key, label, measured, issues: measured ? has(codes) : [] });
    return {
      measuredAt: runs[0]?.fetched_at || audits[0]?.fetched_at || null,
      pagesAudited: pages.length,
      pagespeed: pagespeed.map(r => ({ url: r.url, strategy: r.strategy, perfScore: r.perf_score, seoScore: r.seo_score, lcpMs: r.lcp_ms, cls: r.cls, inpMs: r.inp_ms, fieldData: r.field_data, fetchedAt: r.fetched_at })),
      checks: [
        check('indexability', 'Indexability', ['noindex', 'http_error'], pages.length > 0),
        check('metadata', 'Titles & descriptions', ['missing_title', 'title_no_location', 'missing_description', 'no_canonical'], pages.length > 0),
        check('structured_data', 'Structured data', ['no_local_schema', 'no_area_served'], pages.length > 0),
        check('mobile', 'Mobile setup', ['no_viewport'], pages.length > 0),
        check('content', 'Copy & service area', ['guard'], pages.length > 0),
      ],
    };
  }

  // Local SEO agent layer (agent-ops.js): action queue, Top-5 gap, blueprint, learning, research, rankings.
  let agentOps = null;
  const agent = () => (agentOps ||= createAgentOps({ store, env, now, h: { gscPeriod, gbpPeriod, analysisContext, servicesNow, windows } }));

  return { overview, opportunities, localDemand, queries, technical, competitors: competitorsView, seasonality, customerGeography, authority, connections, analyze, updateRecommendation, briefing, agent };
}

function groupChanges(changes) {
  const m = new Map();
  for (const ch of changes) {
    const g = m.get(ch.competitor_id) || { name: ch.name, tier: ch.tier, changes: [] };
    g.changes.push({ type: ch.change_type, ...(ch.detail || {}) });
    m.set(ch.competitor_id, g);
  }
  return [...m.values()];
}

function summarizeChange(ch) {
  const d = ch.detail || {};
  if (ch.change_type === 'services_added') return `started promoting ${(d.services || []).join(', ')}`;
  if (ch.change_type === 'title_changed') return `changed their site title to "${d.to}"`;
  return ch.change_type.replace(/_/g, ' ');
}

const toRow = r => ({
  id: r.id, type: r.type, title: r.title, detail: r.detail ?? null, evidence: r.evidence ?? null, service: r.service ?? null,
  score: r.score ?? 0, confidence: r.confidence ?? null, status: r.status, requires_decision: !!(r.requiresDecision ?? r.requires_decision),
  informational: !!r.informational, metric: r.metric ?? null, baseline: r.baseline ?? null, outcome: r.outcome ?? null,
  rejected_reason: r.rejected_reason ?? null, applied_note: r.applied_note ?? null, applied_at: r.applied_at ?? null, monitor_until: r.monitor_until ?? null,
  created_at: r.created_at, updated_at: r.updated_at,
});
const fromRow = r => ({ ...r, requiresDecision: r.requires_decision });
