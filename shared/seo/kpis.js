// Local-first KPI hierarchy + attribution. Tests: tests/seo-kpis.test.js
//
// PRIMARY    local search visibility, local organic clicks, GBP actions,
//            local leads, local bookings, local conversion rate
// SECONDARY  overall impressions/clicks, CTR and position on LOCAL commercial queries
// TERTIARY   total traffic incl. nonlocal/informational — never the headline

import { classifyQuery, gscLocality, LOCALITY_ORDER } from './local-intent.js';
import { aggregateByArea, isInsideServiceArea } from './service-area.js';

const LOCALISH = new Set(['confirmed_local', 'likely_local']);
const GBP_VISIBILITY = ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'];
const GBP_ACTIONS = ['CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS', 'BUSINESS_CONVERSATIONS', 'BUSINESS_BOOKINGS'];

// Lead sources that come from search/website discovery. Source-level only:
// leads don't carry the search query, so query→lead attribution isn't claimed.
export const DISCOVERY_SOURCES = ['website_form', 'website_booking', 'organic', 'gbp', 'google_business_profile', 'google_maps'];

const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const round = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

// Classify every GSC row once.
export function annotateGsc(rows) {
  return rows.map(r => {
    const c = classifyQuery(r.query || '');
    return { ...r, intentClass: c.intentClass, service: c.service, branded: c.branded, locality: gscLocality(r, c) };
  });
}

export function localityBreakdown(annotated) {
  const out = { clicks: {}, impressions: {} };
  for (const l of LOCALITY_ORDER) {
    out.clicks[l] = sum(annotated.filter(r => r.locality === l), r => r.clicks);
    out.impressions[l] = sum(annotated.filter(r => r.locality === l), r => r.impressions);
  }
  return out;
}

function gscSide(rows) {
  const a = annotateGsc(rows);
  const local = a.filter(r => LOCALISH.has(r.locality));
  const localCommercial = local.filter(r => r.intentClass === 'high_local_commercial');
  const nonbrandedLocal = local.filter(r => !r.branded);
  const impr = sum(localCommercial, r => r.impressions);
  return {
    annotated: a,
    localImpressions: sum(local, r => r.impressions),
    localClicks: sum(local, r => r.clicks),
    nonbrandedLocalImpressions: sum(nonbrandedLocal, r => r.impressions),
    brandedImpressions: sum(a.filter(r => r.branded), r => r.impressions),
    allImpressions: sum(a, r => r.impressions),
    allClicks: sum(a, r => r.clicks),
    localCommercialCtr: impr ? round((sum(localCommercial, r => r.clicks) / impr) * 100, 2) : null,
    localCommercialPosition: impr ? round(sum(localCommercial, r => r.position * r.impressions) / impr) : null,
    informationalImpressions: sum(a.filter(r => r.intentClass === 'global_informational' || r.intentClass === 'nonlocal_low_value'), r => r.impressions),
  };
}

function gbpSide(daily) {
  return {
    visibility: sum(daily.filter(d => GBP_VISIBILITY.includes(d.metric)), d => d.value),
    actions: sum(daily.filter(d => GBP_ACTIONS.includes(d.metric)), d => d.value),
    calls: sum(daily.filter(d => d.metric === 'CALL_CLICKS'), d => d.value),
  };
}

// Leads from discovery sources; "local" unless their booking is outside the area.
export function discoveryFunnel(leads, bookingsById = new Map()) {
  const rows = leads.filter(l => DISCOVERY_SOURCES.includes(String(l.source || '').toLowerCase()));
  let outside = 0; let confirmed = 0;
  const local = rows.filter(l => {
    const b = l.booking_id ? bookingsById.get(l.booking_id) : null;
    const v = b ? isInsideServiceArea(b.service_address || b.address || '') : { inside: null };
    if (v.inside === false) { outside += 1; return false; }
    if (v.inside === true) confirmed += 1;
    return true;
  });
  const booked = local.filter(l => l.booking_id || String(l.status).toLowerCase() === 'booked');
  const collected = sum(booked, l => Number(bookingsById.get(l.booking_id)?.amount_paid || 0));
  return {
    leads: local.length,
    confirmedLocalLeads: confirmed,
    outsideServiceArea: outside,
    bookings: booked.length,
    conversionRatePct: local.length ? round((booked.length / local.length) * 100) : null,
    collectedOnThoseJobs: Math.round(collected * 100) / 100,
    bySource: Object.entries(local.reduce((m, l) => ({ ...m, [l.source]: (m[l.source] || 0) + 1 }), {})).map(([source, count]) => ({ source, count })),
    attributionLevel: 'source',
  };
}

// Where customers come from: bookings by service-area community (aggregated).
export function customerGeography(bookings) {
  return aggregateByArea(bookings, { textOf: b => b.service_address || b.address || b.notes || '' });
}

export function computeOverview({ gscCur = [], gscPrev = [], gbpCur = [], gbpPrev = [], leadsCur = [], leadsPrev = [], bookingsById = new Map(), gscTotals = null } = {}) {
  const g = gscSide(gscCur); const gp = gscSide(gscPrev);
  const b = gbpSide(gbpCur); const bp = gbpSide(gbpPrev);
  const f = discoveryFunnel(leadsCur, bookingsById); const fp = discoveryFunnel(leadsPrev, bookingsById);
  const kpi = (key, label, value, prev, note) => ({ key, label, value, prev, changePct: value == null || prev == null ? null : pct(value, prev), note });
  const querySum = g.allImpressions;
  return {
    primary: [
      kpi('local_search_visibility', 'Local search visibility', g.localImpressions + b.visibility, gp.localImpressions + bp.visibility, 'likely-local Search Console impressions + Google Business Profile search/Maps impressions'),
      kpi('local_organic_clicks', 'Local organic clicks', g.localClicks, gp.localClicks, 'Search Console clicks on likely-local queries'),
      kpi('gbp_actions', 'GBP actions', b.actions, bp.actions, 'calls, website clicks, directions, messages, bookings'),
      kpi('local_leads', 'Local leads', f.leads, fp.leads, 'website/organic/GBP-source leads not outside the service area'),
      kpi('local_bookings', 'Local bookings', f.bookings, fp.bookings, 'of those leads'),
      kpi('local_conversion_rate', 'Local conversion rate %', f.conversionRatePct, fp.conversionRatePct, 'bookings ÷ local leads'),
    ],
    secondary: [
      kpi('nonbranded_local_impressions', 'Nonbranded local impressions', g.nonbrandedLocalImpressions, gp.nonbrandedLocalImpressions, 'new local customers discovering GID, not people already searching the name'),
      kpi('branded_impressions', 'Branded impressions', g.brandedImpressions, gp.brandedImpressions, 'people already looking for GID Garage'),
      kpi('local_commercial_ctr', 'Local commercial CTR %', g.localCommercialCtr, gp.localCommercialCtr),
      kpi('local_commercial_position', 'Local commercial avg position', g.localCommercialPosition, gp.localCommercialPosition, 'lower is better'),
      kpi('gbp_calls', 'GBP calls', b.calls, bp.calls),
    ],
    tertiary: [
      kpi('all_impressions', 'All search impressions', g.allImpressions, gp.allImpressions, 'includes nonlocal and informational — not a success metric by itself'),
      kpi('all_clicks', 'All search clicks', g.allClicks, gp.allClicks),
      kpi('informational_impressions', 'Informational / low-value impressions', g.informationalImpressions, gp.informationalImpressions),
    ],
    localityBreakdown: localityBreakdown(g.annotated),
    localityBreakdownPrev: localityBreakdown(gp.annotated),
    funnel: f,
    // Search Console hides rare/anonymized queries from query-level data.
    anonymizedImpressionShare: gscTotals && gscTotals.impressions > 0 ? round(Math.max(0, 1 - querySum / gscTotals.impressions) * 100) : null,
  };
}
