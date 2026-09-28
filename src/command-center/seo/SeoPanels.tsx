// SEO Mode views. Green palette; local business impact first, raw traffic last.
import type { GeoArea, Kpi, Locality, ProviderStatus, SeoGeography, SeoOverview, SeoRecommendation } from './seoTypes';

export const SEO = {
  accent: '#3DFFA0',
  accentDim: '#1FCF7A',
  border: 'rgba(61,255,160,0.22)',
  panelBg: 'rgba(6,24,16,0.72)',
  text: '#EFFFF6',
  muted: '#8FB5A0',
  faint: '#4F7563',
  warn: '#F5B942',
  bad: '#FF5353',
} as const;

export const SEO_PANEL = 'relative rounded-xl border backdrop-blur-xl p-4 sm:p-5 bg-[rgba(6,24,16,0.72)] border-[rgba(61,255,160,0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.3)]';
export const SEO_LABEL = 'text-[10px] font-semibold uppercase tracking-widest';

const LOCALITY_META: Record<Locality, { label: string; color: string }> = {
  confirmed_local: { label: 'Confirmed local', color: '#3DFFA0' },
  likely_local: { label: 'Likely local', color: '#1FCF7A' },
  unknown: { label: 'Unknown', color: '#4F7563' },
  nonlocal: { label: 'Outside service area', color: '#6B4A4A' },
};

const fmt = (n: number | null | undefined) => (n == null ? '—' : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] py-6 text-center" style={{ color: SEO.muted }}>{children}</div>;
}

export function KpiTile({ kpi, primary }: { kpi: Kpi; primary?: boolean }) {
  const up = kpi.changePct != null && kpi.changePct > 0;
  // For position, lower is better.
  const good = kpi.key === 'local_commercial_position' ? !up : up;
  return (
    <div className={`${SEO_PANEL} ${primary ? '' : 'py-3'}`} title={kpi.note}>
      <div className={SEO_LABEL} style={{ color: SEO.faint }}>{kpi.label}</div>
      <div className={primary ? 'text-[26px] font-bold leading-none mt-1' : 'text-[16px] font-semibold mt-1'} style={{ color: SEO.text }}>{fmt(kpi.value)}</div>
      <div className="text-[11px] mt-1" style={{ color: kpi.changePct == null ? SEO.faint : good ? SEO.accent : SEO.warn }}>
        {kpi.changePct == null ? (kpi.prev == null ? 'no comparison yet' : `prev ${fmt(kpi.prev)}`) : `${up ? '▲' : '▼'} ${Math.abs(kpi.changePct)}% vs prev`}
      </div>
    </div>
  );
}

// "Is SEO bringing people GID can actually serve?"
export function LocalityBar({ breakdown, metric = 'clicks' }: { breakdown: SeoOverview['localityBreakdown']; metric?: 'clicks' | 'impressions' }) {
  const values = breakdown[metric];
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  return (
    <div>
      <div className={SEO_LABEL} style={{ color: SEO.faint }}>Organic search {metric} by searcher location</div>
      {total === 0 ? <Empty>No search data yet — connect Search Console.</Empty> : (
        <div className="mt-3 space-y-2">
          {(Object.keys(LOCALITY_META) as Locality[]).map(l => (
            <div key={l} className="flex items-center gap-3">
              <div className="w-40 text-[11px]" style={{ color: SEO.muted }}>{LOCALITY_META[l].label}</div>
              <div className="flex-1 h-3 rounded bg-black/30 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${(values[l] / total) * 100}%`, background: LOCALITY_META[l].color }} />
              </div>
              <div className="w-20 text-right text-[11px] tabular-nums" style={{ color: SEO.text }}>{fmt(values[l])}</div>
            </div>
          ))}
          <div className="text-[10px] pt-1" style={{ color: SEO.faint }}>Search Console never reports a searcher's city: "likely local" comes from the query (a Flagstaff-area place or "near me"). Confirmed local is only first-party data (your bookings) or ad-platform location reports.</div>
        </div>
      )}
    </div>
  );
}

// Internal decision-support map: 30-mile radius, aggregated booked jobs and leads,
// public competitor locations. No customer addresses.
const LEAD_COLOR = '#7FB8FF';
const COMPETITOR_COLOR = '#FFB454';

// Fallback when the interactive map (ServiceAreaMap.tsx) can't load.
export function ServiceAreaDiagram({ geo }: { geo?: SeoGeography }) {
  if (!geo) return <Empty>Loading service area…</Empty>;
  const size = 360; const pad = 20; const r = size / 2 - pad;
  const milesPerDegLat = 69; const milesPerDegLng = 69 * Math.cos((geo.center.lat * Math.PI) / 180);
  const project = (a: { lat: number; lng: number }) => ({
    x: size / 2 + ((a.lng - geo.center.lng) * milesPerDegLng / geo.radiusMiles) * r,
    y: size / 2 - ((a.lat - geo.center.lat) * milesPerDegLat / geo.radiusMiles) * r,
  });
  const leadAreas = geo.leads?.areas ?? [];
  const competitors = geo.competitors ?? [];
  const max = Math.max(1, ...geo.areas.map(a => a.count), ...leadAreas.map(a => a.count));
  const radius = (n: number) => 5 + 14 * Math.sqrt(n / max);
  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[360px]" role="img" aria-label="Service area map">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(61,255,160,0.05)" stroke={SEO.accent} strokeDasharray="4 4" />
        <circle cx={size / 2} cy={size / 2} r={r / 2} fill="none" stroke={SEO.border} />
        <text x={size / 2} y={pad - 6} textAnchor="middle" fontSize="10" fill={SEO.faint}>{geo.radiusMiles} mi</text>
        {leadAreas.map((a: GeoArea) => {
          const p = project(a);
          return <circle key={`lead-${a.slug}`} cx={p.x} cy={p.y} r={radius(a.count) + 3} fill="none" stroke={LEAD_COLOR} strokeWidth={1.5}><title>{a.name}: {a.count} leads</title></circle>;
        })}
        {geo.areas.map((a: GeoArea) => {
          const p = project(a);
          return (
            <g key={a.slug}>
              <circle cx={p.x} cy={p.y} r={radius(a.count)} fill="rgba(61,255,160,0.35)" stroke={SEO.accent}><title>{a.name}: {a.count} booked jobs</title></circle>
              <text x={p.x} y={p.y - 10 - 14 * Math.sqrt(a.count / max)} textAnchor="middle" fontSize="10" fill={SEO.text}>{a.name} · {a.count}</text>
            </g>
          );
        })}
        {competitors.map(c => {
          const p = project(c);
          return <rect key={`comp-${c.name}-${c.lat}`} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} transform={`rotate(45 ${p.x} ${p.y})`} fill={COMPETITOR_COLOR} opacity={c.tier === 'primary' ? 0.95 : 0.55}><title>{c.name}{c.tier === 'primary' ? ' (mobile)' : ''}</title></rect>;
        })}
        <circle cx={size / 2} cy={size / 2} r={3} fill={SEO.accent} />
      </svg>
      <div className="text-[12px] space-y-1" style={{ color: SEO.muted }}>
        <div><span style={{ color: SEO.accent }}>●</span> <span style={{ color: SEO.text }}>{geo.total}</span> booked jobs in the last year</div>
        {geo.leads && <div><span style={{ color: LEAD_COLOR }}>○</span> <span style={{ color: SEO.text }}>{geo.leads.total}</span> leads ({geo.leads.unknownLocation} with no location on file)</div>}
        {competitors.length > 0 && <div><span style={{ color: COMPETITOR_COLOR }}>◆</span> {competitors.length} local competitors (public Places locations; bright = mobile)</div>}
        {geo.otherInArea > 0 && <div>{geo.otherInArea} in smaller in-area communities (grouped)</div>}
        <div>{geo.outsideServiceArea} outside the service area</div>
        <div>{geo.unknownLocation} without a usable address</div>
        <div className="text-[10px] pt-2" style={{ color: SEO.faint }}>{geo.privacy}</div>
      </div>
    </div>
  );
}

const STATUS_ACTIONS: Record<string, { action: string; label: string }[]> = {
  open: [{ action: 'accept', label: 'Accept' }, { action: 'mark_applied', label: 'Done' }, { action: 'dismiss', label: 'Snooze' }, { action: 'reject', label: 'Reject' }],
  accepted: [{ action: 'mark_applied', label: 'Mark applied' }, { action: 'reject', label: 'Reject' }],
  rejected: [{ action: 'reopen', label: 'Reopen' }],
  dismissed: [{ action: 'reopen', label: 'Reopen' }],
};

export function OpportunityList({ recs, onAction, compact }: { recs?: SeoRecommendation[]; onAction: (id: string, action: string) => void; compact?: boolean }) {
  if (!recs) return <Empty>Loading opportunities…</Empty>;
  if (!recs.length) return <Empty>No open opportunities. They appear after the first data sync.</Empty>;
  return (
    <div className="space-y-2">
      {recs.slice(0, compact ? 6 : 50).map(r => (
        <div key={r.id} className="rounded-lg border p-3" style={{ borderColor: SEO.border, background: 'rgba(0,0,0,0.2)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13px] font-semibold" style={{ color: SEO.text }}>{r.title}</div>
            <div className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: r.requires_decision ? SEO.warn : SEO.accent }}>{r.requires_decision ? 'DECIDE' : r.score}</div>
          </div>
          {!compact && r.detail && <div className="text-[12px] mt-1 leading-relaxed" style={{ color: SEO.muted }}>{r.detail}</div>}
          {r.outcome && <div className="text-[11px] mt-1" style={{ color: SEO.accent }}>Result: {r.outcome.result.replace(/_/g, ' ')} ({fmt(r.outcome.baseline)} → {fmt(r.outcome.current)})</div>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(STATUS_ACTIONS[r.status] || []).map(a => (
              <button key={a.action} onClick={() => onAction(r.id, a.action)} className="text-[10px] uppercase tracking-wide px-2 py-1 rounded border hover:bg-white/5" style={{ borderColor: SEO.border, color: SEO.muted }}>{a.label}</button>
            ))}
            <span className="text-[10px] self-center ml-auto" style={{ color: SEO.faint }}>{r.type.replace(/_/g, ' ')} · {r.confidence || '—'} confidence</span>
          </div>
        </div>
      ))}
    </div>
  );
}

type Cluster = { service: string; label: string; offered: boolean | string; localImpressions: number; gbpImpressions: number; localClicks: number; avgLocalPosition: number | null };
type Gap = { service: string; label: string; localDemand: number; avgLocalPosition: number | null; why: string; competitorsCovering: string[]; score: number };
export function DemandPanel({ d }: { d?: { clusters: Cluster[]; gaps: Gap[]; unconfirmedServiceDemand?: { service: string; label: string; localDemand: number }[]; unsupportedServiceDemand: { service: string; impressions: number }[]; outsideAreaDemand: { place: string; impressions: number }[]; hasData: boolean } }) {
  if (!d) return <Empty>Loading local demand…</Empty>;
  if (!d.hasData) return <Empty>Local demand appears once Search Console or Business Profile is connected.</Empty>;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <div className={SEO_LABEL} style={{ color: SEO.faint }}>Local demand by service</div>
        <table className="w-full text-[12px] mt-2">
          <thead><tr style={{ color: SEO.faint }}><th className="text-left font-normal">Service</th><th className="text-right font-normal">Local impr.</th><th className="text-right font-normal">GBP</th><th className="text-right font-normal">Avg pos</th></tr></thead>
          <tbody>{d.clusters.map(c => (
            <tr key={c.service} style={{ color: c.offered === false ? SEO.faint : SEO.text }}>
              <td className="py-1">{c.label}{c.offered === false ? ' (referred out)' : c.offered === 'unknown' ? ' (?)' : ''}</td>
              <td className="text-right tabular-nums">{fmt(c.localImpressions)}</td><td className="text-right tabular-nums">{fmt(c.gbpImpressions)}</td><td className="text-right tabular-nums">{fmt(c.avgLocalPosition)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="space-y-3">
        <div className={SEO_LABEL} style={{ color: SEO.faint }}>Local demand gaps</div>
        {d.gaps.length ? d.gaps.map(g => (
          <div key={g.service} className="text-[12px]" style={{ color: SEO.muted }}><span style={{ color: SEO.text }}>{g.label}</span> — {g.localDemand} local searches. {g.why}{g.competitorsCovering.length ? ` Covered by ${g.competitorsCovering.join(', ')}.` : ''}</div>
        )) : <Empty>No local gaps found for services you offer.</Empty>}
        {(d.unconfirmedServiceDemand?.length ?? 0) > 0 && <div className="text-[11px]" style={{ color: SEO.muted }}>Local searches for services you haven't confirmed offering (confirm in settings before anything is suggested): {d.unconfirmedServiceDemand!.map(u => `${u.label} (${u.localDemand})`).join(', ')}</div>}
        {d.outsideAreaDemand.length > 0 && <div className="text-[11px]" style={{ color: SEO.warn }}>Outside the service area (expansion decision only): {d.outsideAreaDemand.map(o => `${o.place} (${o.impressions})`).join(', ')}</div>}
        {d.unsupportedServiceDemand.length > 0 && <div className="text-[11px]" style={{ color: SEO.faint }}>Demand for referred-out services (not pursued): {d.unsupportedServiceDemand.map(o => `${o.service} (${o.impressions})`).join(', ')}</div>}
      </div>
    </div>
  );
}

type Comp = { id: string; name: string; tier: string; isMobile?: boolean; is_mobile?: boolean; rating: number | null; reviewCount: number | null; reviewVelocity: number | null; distance_miles: number | null; theyShowWeDont: string[]; strength: number };
export function CompetitorPanel({ c }: { c?: { landscape: Comp[]; ourReviewVelocity: number | null; recentChanges: { id: number; name: string; change_type: string; detected_at: string }[]; searchResultCompetitors: string[]; note: string } }) {
  if (!c) return <Empty>Loading competitors…</Empty>;
  if (!c.landscape.length) return <Empty>No local competitors yet. Connect the Places API or add competitors manually.</Empty>;
  return (
    <div className="space-y-3">
      <div className="text-[11px]" style={{ color: SEO.faint }}>{c.note} GID review velocity: {c.ourReviewVelocity ?? '—'}/30 days.</div>
      {c.landscape.slice(0, 10).map(x => (
        <div key={x.id} className="flex items-center justify-between text-[12px] border-b pb-2" style={{ borderColor: 'rgba(61,255,160,0.08)' }}>
          <div>
            <div style={{ color: SEO.text }}>{x.name} <span className="text-[10px] uppercase ml-1" style={{ color: x.tier === 'primary' ? SEO.accent : SEO.faint }}>{x.tier === 'primary' ? 'mobile' : x.tier}</span></div>
            {x.theyShowWeDont.length > 0 && <div className="text-[11px]" style={{ color: SEO.warn }}>Promotes {x.theyShowWeDont.join(', ')} (you offer it)</div>}
          </div>
          <div className="text-right tabular-nums" style={{ color: SEO.muted }}>{x.rating ?? '—'}★ · {x.reviewCount ?? '—'} reviews<br />{x.reviewVelocity ?? '—'}/30d · {x.distance_miles ?? '—'} mi</div>
        </div>
      ))}
      {c.recentChanges.length > 0 && <div className="text-[11px]" style={{ color: SEO.muted }}>Recent changes: {c.recentChanges.slice(0, 5).map(ch => `${ch.name} ${ch.change_type.replace(/_/g, ' ')}`).join('; ')}</div>}
      {c.searchResultCompetitors.length > 0 && <div className="text-[10px]" style={{ color: SEO.faint }}>Search-result competitors (not businesses): {c.searchResultCompetitors.join(', ')}</div>}
    </div>
  );
}

type Finding = { event: string; label: string; series: string; verdict: string; ratio: number | null; statement: string; approximateDates: boolean };
export function SeasonalityPanel({ s }: { s?: { findings: Finding[]; insufficientDataCount: number; usingApproximateNauDates: boolean; upcomingColdSnap: { start: string; lowestF: number } | null; note: string } }) {
  if (!s) return <Empty>Loading seasonality…</Empty>;
  return (
    <div className="space-y-2 text-[12px]" style={{ color: SEO.muted }}>
      {s.upcomingColdSnap && <div style={{ color: SEO.warn }}>Cold snap forecast from {s.upcomingColdSnap.start} (lows to {s.upcomingColdSnap.lowestF}°F) — battery/no-start demand usually follows.</div>}
      {s.findings.length ? s.findings.map((f, i) => <div key={i}><span style={{ color: f.verdict === 'uplift' ? SEO.accent : SEO.text }}>●</span> {f.statement}</div>) : <Empty>No seasonal pattern is supported by the data yet.</Empty>}
      <div className="text-[10px]" style={{ color: SEO.faint }}>{s.note} {s.insufficientDataCount} event/series pairs don't have enough data yet.{s.usingApproximateNauDates ? ' Using approximate NAU calendar dates — add the official dates to sharpen this.' : ''}</div>
    </div>
  );
}

type AuthorityOpp = { name: string; url?: string; kind: string; local: boolean; score: number; status: string };
type Citation = { id: number; platform: string; issues: { field: string; detail: string }[] };
export function AuthorityPanel({ a }: { a?: { opportunities: AuthorityOpp[]; citations: Citation[] } }) {
  if (!a) return <Empty>Loading local authority…</Empty>;
  return (
    <div className="grid lg:grid-cols-2 gap-4 text-[12px]">
      <div>
        <div className={SEO_LABEL} style={{ color: SEO.faint }}>Local authority opportunities</div>
        {a.opportunities.map(o => <div key={o.name} className="flex justify-between py-1" style={{ color: SEO.text }}><span>{o.name} <span className="text-[10px]" style={{ color: SEO.faint }}>{o.kind}{o.local ? ' · local' : ''}</span></span><span className="tabular-nums" style={{ color: SEO.accent }}>{o.score}</span></div>)}
      </div>
      <div>
        <div className={SEO_LABEL} style={{ color: SEO.faint }}>Listing consistency</div>
        {a.citations.length ? a.citations.map(c => <div key={c.id} className="py-1" style={{ color: c.issues.length ? SEO.warn : SEO.muted }}>{c.platform}: {c.issues.length ? c.issues.map(i => i.detail).join(' ') : 'consistent'}</div>) : <Empty>No listings recorded yet.</Empty>}
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { connected: SEO.accent, ready_limited: SEO.accentDim, manual_only: SEO.muted, pending_approval: SEO.warn, needs_authorization: SEO.warn, not_configured: SEO.faint, error: SEO.bad };
export function ConnectionsPanel({ c, onSync }: { c?: { providers: ProviderStatus[] }; onSync: (mode: 'incremental' | 'backfill') => void }) {
  if (!c) return <Empty>Loading connections…</Empty>;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => onSync('incremental')} className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border hover:bg-white/5" style={{ borderColor: SEO.border, color: SEO.accent }}>Sync now</button>
        <button onClick={() => onSync('backfill')} className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border hover:bg-white/5" style={{ borderColor: SEO.border, color: SEO.muted }}>Backfill next 30 days of history</button>
        <span className="text-[10px] self-center" style={{ color: SEO.faint }}>Setup steps: SEO_SETUP.md</span>
      </div>
      {c.providers.map(p => (
        <div key={p.id} className="flex items-start justify-between gap-3 text-[12px] border-b pb-2" style={{ borderColor: 'rgba(61,255,160,0.08)' }}>
          <div>
            <div style={{ color: SEO.text }}>{p.label}</div>
            <div className="text-[11px]" style={{ color: SEO.faint }}>{p.note}{p.missing?.length ? ` Missing: ${p.missing.join(', ')}.` : ''}{p.lastError ? ` Last error: ${p.lastError}` : ''}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: STATUS_COLOR[p.status] || SEO.muted }}>{p.status.replace(/_/g, ' ')}</div>
            <div className="text-[10px]" style={{ color: SEO.faint }}>{p.lastSyncAt ? `synced ${p.lastSyncAt.slice(0, 10)}` : 'never synced'}{p.backfilledFrom ? ` · history from ${p.backfilledFrom}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
