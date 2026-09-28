// Deterministic Local Opportunity Priority (0–100). Tests: tests/seo-scoring.test.js
//
// score = 100 × relevance(intent) × locality × serviceFit × confidence
//             × (0.45 + 0.25·visibilityHeadroom + 0.15·volume + 0.15·conversion)
//         − penalties
//
// The first three factors are gates: a nonlocal searcher, or a service GID
// doesn't offer, scores 0 no matter the volume. Volume is log-scaled and worth
// at most 15% of the remaining weight, so 40 local commercial impressions
// outrank 1,000 global informational ones.

export const INTENT_RELEVANCE = {
  high_local_commercial: 1.0,
  service_no_geo: 0.7,
  branded_local: 0.5, // they already know GID — CTR/visibility still matters
  local_informational: 0.45,
  unclassified: 0.2,
  global_informational: 0.1,
  nonlocal_low_value: 0.05,
};

export const LOCALITY_WEIGHT = { confirmed_local: 1.0, likely_local: 0.9, unknown: 0.5, nonlocal: 0 };

const clamp01 = n => Math.max(0, Math.min(1, n));

// How much room there is to gain clicks from better visibility.
export function visibilityHeadroom(position) {
  if (!Number.isFinite(position) || position <= 0) return 0.5; // no ranking data: neutral
  if (position <= 3) return 0.35;   // already on top: CTR work only
  if (position <= 10) return 0.9;   // page one, below the fold of attention
  if (position <= 20) return 1.0;   // striking distance
  if (position <= 40) return 0.55;
  return 0.25;
}

export const volumeFactor = impressions => clamp01(Math.log10(1 + Math.max(0, impressions || 0)) / 3); // 1000 → 1.0, 40 → 0.54

// Evidence that this demand turns into business (leads/bookings/revenue).
export function conversionFactor({ leads = 0, bookings = 0, revenue = 0 } = {}) {
  return clamp01(0.15 * leads + 0.35 * bookings + revenue / 2000);
}

export function localOpportunityScore(o) {
  const penalties = [];
  const reasons = [];
  if (o.insideServiceArea === false) {
    return { score: 0, blocked: 'outside_service_area', requiresExpansionDecision: true, components: {}, penalties: [], reasons: ['Outside the 30-mile service area — needs an explicit expansion decision.'] };
  }
  const relevance = INTENT_RELEVANCE[o.intentClass] ?? 0.2;
  const locality = LOCALITY_WEIGHT[o.locality] ?? 0.5;
  const serviceFit = o.serviceOffered === false ? 0 : o.serviceOffered === 'unknown' ? 0.6 : 1;
  if (serviceFit === 0) return { score: 0, blocked: 'service_not_offered', components: { relevance, locality, serviceFit }, penalties, reasons: ['GID does not offer this service — not an opportunity.'] };
  if (locality === 0) return { score: 0, blocked: 'nonlocal', components: { relevance, locality, serviceFit }, penalties, reasons: ['Searcher is outside the service area.'] };

  const confidence = clamp01(o.confidence ?? 0.8);
  const visibility = visibilityHeadroom(o.position);
  const volume = volumeFactor(o.impressions);
  const conversion = conversionFactor(o.conversion);
  const capacity = o.capacity == null ? 1 : clamp01(0.5 + 0.5 * o.capacity); // a booked-out week halves urgency, never zeroes it
  let score = 100 * relevance * locality * serviceFit * confidence * capacity * (0.45 + 0.25 * visibility + 0.15 * volume + 0.15 * conversion);

  if (o.competitorPressure) { const p = Math.round(8 * clamp01(o.competitorPressure)); score -= p; penalties.push({ reason: 'strong local competitor coverage', points: p }); }
  if (o.cannibalization) { score -= 6; penalties.push({ reason: 'several of our pages compete for this query', points: 6 }); }
  if (o.serviceOffered === 'unknown') reasons.push('Service availability not confirmed — check before acting.');
  reasons.push(`${o.intentClass} intent, ${o.locality} searcher`);

  return {
    score: Math.max(0, Math.round(score)),
    blocked: null,
    components: { relevance, locality, serviceFit, confidence, capacity, visibility, volume: Math.round(volume * 100) / 100, conversion: Math.round(conversion * 100) / 100 },
    penalties,
    reasons,
  };
}
