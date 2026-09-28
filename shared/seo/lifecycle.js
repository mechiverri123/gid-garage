// Recommendation lifecycle, rejection/preference memory, applied-change
// monitoring, and the local-first SEO briefing. Tests: tests/seo-lifecycle.test.js
//
//   open ──accept──▶ accepted ──mark_applied──▶ applied ──(monitor window ends)──▶ measured
//    │  └─mark_applied──────────────────────────▲
//    ├──reject──▶ rejected   (remembered: not re-suggested for 90 days; "never" mutes the type)
//    ├──dismiss─▶ dismissed  (snoozed 30 days)
//    └──(no longer detected)─▶ expired
//   rejected/dismissed ──reopen──▶ open

const DAY = 86400000;
export const MONITOR_DAYS = 28;

const TRANSITIONS = {
  accept: { from: ['open'], to: 'accepted' },
  reject: { from: ['open', 'accepted'], to: 'rejected' },
  dismiss: { from: ['open'], to: 'dismissed' },
  mark_applied: { from: ['open', 'accepted'], to: 'applied' },
  reopen: { from: ['rejected', 'dismissed', 'expired'], to: 'open' },
};
export const ACTIONS = Object.keys(TRANSITIONS);

// Returns { rec, preference } — preference is the memory row to store, if any.
export function transition(rec, action, { now = new Date(), reason = '', note = '', baseline = null } = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Unknown action "${action}". Use one of: ${ACTIONS.join(', ')}.`);
  if (!t.from.includes(rec.status)) throw new Error(`Can't ${action.replace('_', ' ')} a recommendation that is ${rec.status}.`);
  const iso = now.toISOString();
  const next = { ...rec, status: t.to, updated_at: iso };
  let preference = null;
  if (action === 'reject') {
    next.rejected_reason = reason || null;
    const never = /\b(never|stop|don'?t suggest|not interested)\b/i.test(reason || '');
    preference = never
      ? { kind: 'mute_type', key: rec.type, reason: reason || 'rejected', expires_at: null }
      : { kind: 'reject_rec', key: rec.id, reason: reason || 'rejected', expires_at: new Date(now.getTime() + 90 * DAY).toISOString() };
  }
  if (action === 'dismiss') preference = { kind: 'reject_rec', key: rec.id, reason: reason || 'dismissed', expires_at: new Date(now.getTime() + 30 * DAY).toISOString() };
  if (action === 'mark_applied') {
    next.applied_at = iso;
    next.applied_note = note || null;
    next.baseline = baseline;
    next.monitor_until = new Date(now.getTime() + MONITOR_DAYS * DAY).toISOString();
  }
  if (action === 'reopen') { next.rejected_reason = null; }
  return { rec: next, preference };
}

// Merge a fresh detector run into stored recommendations without losing the
// owner's decisions. Returns the rows to upsert.
export function mergeDetected(existing, detected, now = new Date()) {
  const iso = now.toISOString();
  const byId = new Map(existing.map(r => [r.id, r]));
  const seen = new Set();
  const upserts = [];
  for (const d of detected) {
    seen.add(d.id);
    const cur = byId.get(d.id);
    if (!cur) { upserts.push({ ...d, status: 'open', created_at: iso, updated_at: iso }); continue; }
    if (cur.status === 'open' || cur.status === 'accepted') upserts.push({ ...cur, title: d.title, detail: d.detail, evidence: d.evidence, score: d.score, confidence: d.confidence, updated_at: iso });
    else if (cur.status === 'expired') upserts.push({ ...cur, ...d, status: 'open', updated_at: iso });
    // rejected / dismissed / applied / measured: the owner's decision stands.
  }
  for (const r of existing) {
    if (!seen.has(r.id) && r.status === 'open') upserts.push({ ...r, status: 'expired', updated_at: iso });
  }
  return upserts;
}

// After the monitor window, compare the tracked metric with its baseline.
export function evaluateApplied(rec, currentValue, { now = new Date(), minBaseline = 5, betterIs = 'higher' } = {}) {
  if (rec.status !== 'applied' || !rec.monitor_until || new Date(rec.monitor_until) > now) return null;
  const base = rec.baseline?.value;
  let outcome;
  if (base == null || currentValue == null || (base < minBaseline && currentValue < minBaseline)) outcome = 'insufficient_data';
  else {
    const change = base === 0 ? 1 : (currentValue - base) / Math.abs(base);
    const improved = betterIs === 'lower' ? change <= -0.1 : change >= 0.1;
    const worse = betterIs === 'lower' ? change >= 0.1 : change <= -0.1;
    outcome = improved ? 'improved' : worse ? 'worse' : 'no_clear_change';
  }
  return { ...rec, status: 'measured', outcome: { result: outcome, baseline: base, current: currentValue, metric: rec.baseline?.metric || rec.metric?.kind || null, measuredAt: now.toISOString(), note: 'Before/after comparison; other factors (season, competitors) can also move this.' }, updated_at: now.toISOString() };
}

// ---- briefing ---------------------------------------------------------------------

const fmtPct = n => (n == null ? null : `${n > 0 ? '+' : ''}${n}%`);

// Local business impact is always the headline. Returns null when there is
// nothing real to say (no data connected) — never a filler message.
export function buildSeoBriefing({ overview, recommendations = [], competitorChanges = [] } = {}) {
  if (!overview) return null;
  const k = Object.fromEntries([...overview.primary, ...overview.secondary].map(x => [x.key, x]));
  const hasData = ['local_search_visibility', 'gbp_actions', 'local_leads'].some(key => (k[key]?.value || 0) > 0 || (k[key]?.prev || 0) > 0);
  if (!hasData) return null;
  const lines = [];
  const nb = k.nonbranded_local_impressions;
  const vis = k.local_search_visibility;
  if (nb?.changePct != null && Math.abs(nb.changePct) >= 5) lines.push(`Nonbranded local search impressions ${nb.changePct > 0 ? 'rose' : 'fell'} ${fmtPct(nb.changePct)} (${nb.prev} → ${nb.value}) — ${nb.changePct > 0 ? 'more new local customers are finding GID' : 'fewer new local customers are finding GID'}.`);
  else if (vis?.value != null) lines.push(`Local search visibility: ${vis.value}${vis.changePct != null ? ` (${fmtPct(vis.changePct)})` : ''}.`);
  const f = overview.funnel;
  if (f && f.leads) lines.push(`${f.leads} local lead${f.leads === 1 ? '' : 's'} from website/search, ${f.bookings} booked.`);
  if (k.gbp_actions?.value) lines.push(`Google Business Profile: ${k.gbp_actions.value} actions${k.gbp_actions.changePct != null ? ` (${fmtPct(k.gbp_actions.changePct)})` : ''}.`);
  const nl = overview.localityBreakdown?.clicks;
  if (nl) {
    const total = Object.values(nl).reduce((s, x) => s + x, 0);
    if (total && nl.nonlocal / total > 0.3) lines.push(`${Math.round((nl.nonlocal / total) * 100)}% of search clicks came from outside the service area — not counted as progress.`);
  }
  for (const c of competitorChanges.slice(0, 1)) lines.push(`${c.name}: ${c.summary}.`);
  const top = recommendations.filter(r => r.status === 'open' && !r.requiresDecision && !r.informational).sort((a, b) => b.score - a.score)[0];
  if (top) lines.push(`Top opportunity: ${top.title}.`);
  return lines.join(' ');
}
