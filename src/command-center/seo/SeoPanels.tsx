// SEO Command Center panels (shared design system: cyan interface, green only
// for positive performance). Every number comes from /jarvis/seo-data;
// anything not measured says so instead of showing a score.
import type { ReactNode } from 'react';
import { Eye, MousePointerClick, MapPin, UserPlus, CalendarCheck, Percent, Target, Gauge, ShieldCheck, FileSearch, Code2, Smartphone, FileText, CheckCircle2, AlertTriangle, CircleDashed, Star, Plug, RefreshCw, History, TrendingUp, Users2, CloudSnow, Link2, Search , type LucideIcon } from 'lucide-react';
import type { GeoArea, Kpi, Locality, ProviderStatus, SeoGeography, SeoOverview, SeoRecommendation, QueryRow, SeoQueries, SeoTechnical } from './seoTypes';
import { C, TONE, num, timeAgo, type Tone } from '../ui/theme';
import { CommandCard, SectionHeader, StatusBadge, ActionButton, EmptyState, TrendIndicator, DataTable, Skeleton, CountUp, type Column } from '../ui/primitives';
import { Sparkline, Donut, AreaChart, type Segment } from '../ui/charts';

// Legacy names kept for ServiceAreaMap's fallback diagram.
export const SEO = { accent: C.green, accentDim: C.cyan2, border: C.border, text: C.text, muted: C.text2, faint: C.muted, warn: C.amber, bad: C.red } as const;
export function Empty({ children }: { children: ReactNode }) { return <div className="text-[14px] py-8 text-center" style={{ color: C.text2 }}>{children}</div>; }

const fmt = (n: number | null | undefined) => (n == null ? '—' : Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1));
const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

// ---- KPIs ------------------------------------------------------------------------------------------

const KPI_META: Record<string, { icon: LucideIcon; tone: Tone; series?: 'impressions' | 'clicks' | 'leads' | 'bookings'; suffix?: string }> = {
  local_search_visibility: { icon: Eye, tone: 'cyan', series: 'impressions' },
  local_organic_clicks: { icon: MousePointerClick, tone: 'cyan', series: 'clicks' },
  gbp_actions: { icon: MapPin, tone: 'purple' },
  local_leads: { icon: UserPlus, tone: 'purple', series: 'leads' },
  local_bookings: { icon: CalendarCheck, tone: 'green', series: 'bookings' },
  local_conversion_rate: { icon: Percent, tone: 'amber', suffix: '%' },
};
export function SeoKpiCard({ kpi, series }: { kpi: Kpi; series?: SeoOverview['series'] }) {
  const m = KPI_META[kpi.key] ?? { icon: Target, tone: 'cyan' as Tone };
  const color = TONE[m.tone]; const Icon = m.icon;
  const values = m.series && series ? series.map(d => d[m.series!]) : null;
  return (
    <CommandCard className="p-4 sm:p-5 flex flex-col gap-3 overflow-hidden" title={kpi.note}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium leading-tight line-clamp-2" style={{ color: C.text2 }}>{kpi.label}</span>
        <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}14`, border: `1px solid ${color}30` }}><Icon size={18} color={color} /></span>
      </div>
      <div className="text-[30px] sm:text-[34px] font-bold leading-none tabular-nums" style={{ color: C.text }}>
        {kpi.value == null ? '—' : <CountUp value={kpi.value} format={n => (Number.isInteger(kpi.value) ? Math.round(n).toLocaleString('en-US') : n.toFixed(1)) + (m.suffix ?? '')} />}
      </div>
      <div className="flex items-end justify-between gap-2 min-h-[28px]">
        <TrendIndicator changePct={kpi.changePct} betterIs={kpi.key.includes('position') ? 'lower' : 'higher'} label={kpi.changePct == null ? (kpi.prev == null ? 'no comparison yet' : `prev ${fmt(kpi.prev)}`) : 'vs prev'} size={12.5} />
        {values && <Sparkline values={values} color={color} width={76} height={30} bars={m.series === 'leads' || m.series === 'bookings'} />}
      </div>
      <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${color}90, transparent)` }} aria-hidden />
    </CommandCard>
  );
}

// ---- performance chart ------------------------------------------------------------------------------

export function LocalPerformanceChart({ overview }: { overview?: SeoOverview }) {
  const s = overview?.series ?? [];
  const day = (d: string) => { const [y, mo, da] = d.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, da, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
  return (
    <CommandCard variant="primary" className="p-5 h-full">
      <SectionHeader icon={TrendingUp} title="Local performance" subtitle={overview ? `${day(overview.period.from)} – ${day(overview.period.to)} · likely-local searches and search-driven leads` : 'Loading…'} />
      {!overview ? <Skeleton className="h-[260px]" /> : (
        <AreaChart labels={s.map(d => d.date)} formatLabel={day} height={250}
          series={[
            { key: 'impressions', label: 'Local impressions', color: C.cyan, values: s.map(d => d.impressions) },
            { key: 'clicks', label: 'Local clicks', color: C.green, values: s.map(d => d.clicks) },
            { key: 'leads', label: 'Leads', color: C.purple, values: s.map(d => d.leads) },
            { key: 'bookings', label: 'Bookings', color: C.amber, values: s.map(d => d.bookings) },
          ]}
          empty={<EmptyState icon={Search} title="No local search data in this period">Connect Search Console in Connections, then Sync now.</EmptyState>} />
      )}
      <div className="text-[12.5px] mt-2" style={{ color: C.muted }}>Each line has its own scale so small numbers stay visible. Hover for exact values.</div>
    </CommandCard>
  );
}

// ---- search intent / locality -------------------------------------------------------------------------

const LOCALITY_META: Record<Locality, { label: string; color: string }> = {
  confirmed_local: { label: 'Confirmed local', color: C.green },
  likely_local: { label: 'Likely local', color: C.cyan },
  unknown: { label: 'Unknown', color: C.muted },
  nonlocal: { label: 'Outside service area', color: '#C2506A' },
};
export function LocalityPanel({ overview, metric = 'impressions' }: { overview?: SeoOverview; metric?: 'clicks' | 'impressions' }) {
  const values = overview?.localityBreakdown[metric];
  const segs: Segment[] = values ? (Object.keys(LOCALITY_META) as Locality[]).map(l => ({ label: LOCALITY_META[l].label, value: values[l] ?? 0, color: LOCALITY_META[l].color })) : [];
  const total = segs.reduce((s, x) => s + x.value, 0);
  const localShare = total ? Math.round((((values?.likely_local ?? 0) + (values?.confirmed_local ?? 0)) / total) * 100) : null;
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={MapPin} title="Local search intent" subtitle={`Where searchers are, by ${metric}`} />
      {!overview ? <Skeleton className="h-[200px]" /> : !total ? <EmptyState title="No search data yet">Connect Search Console to see who's searching.</EmptyState> : (
        <div className="flex flex-col items-center gap-4">
          <Donut segments={segs} size={160} center={<><div className="text-[28px] font-bold leading-none" style={{ color: C.text }}>{localShare}%</div><div className="text-[12px] mt-1" style={{ color: C.text2 }}>local</div></>} />
          <ul className="w-full flex flex-col gap-2">
            {segs.map(s => (
              <li key={s.label} className="flex items-center gap-2.5 text-[14px]">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="flex-1 min-w-0 truncate" style={{ color: C.text }}>{s.label}</span>
                <span className="tabular-nums shrink-0" style={{ color: C.text2 }}>{fmt(s.value)}</span>
                <span className="tabular-nums font-semibold shrink-0 w-11 text-right" style={{ color: C.text }}>{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] leading-relaxed" style={{ color: C.muted }}>Search Console never reports a searcher's city: "likely local" comes from the query itself (a Flagstaff-area place or "near me"). "Confirmed local" is only your own bookings or ad-platform location data.</p>
        </div>
      )}
    </CommandCard>
  );
}

// ---- search performance (secondary KPIs) ----------------------------------------------------------------

const SECONDARY_ICON: Record<string, LucideIcon> = { nonbranded_local_impressions: Users2, branded_impressions: Star, local_commercial_ctr: MousePointerClick, local_commercial_position: Target, gbp_calls: MapPin };
export function SearchPerformance({ overview }: { overview?: SeoOverview }) {
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Gauge} title="Search performance" subtitle="Local commercial searches, vs the previous period" />
      {!overview ? <Skeleton className="h-[160px]" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
          {overview.secondary.map(k => {
            const Icon = SECONDARY_ICON[k.key] ?? Target;
            const pos = k.key.includes('position');
            return (
              <div key={k.key} className="rounded-xl p-4 min-w-0" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }} title={k.note}>
                <div className="flex items-center gap-2 text-[13.5px]" style={{ color: C.text2 }}><Icon size={16} color={C.cyan} /><span className="truncate">{k.label}</span></div>
                <div className="text-[26px] font-bold tabular-nums leading-tight mt-1.5" style={{ color: C.text }}>{fmt(k.value)}{k.key.includes('ctr') && k.value != null ? '%' : ''}</div>
                <div className="mt-1"><TrendIndicator changePct={k.changePct} betterIs={pos ? 'lower' : 'higher'} label={pos ? 'lower is better' : 'vs prev'} size={12.5} /></div>
              </div>
            );
          })}
        </div>
      )}
    </CommandCard>
  );
}

// ---- query movement -----------------------------------------------------------------------------------

function Movement({ m }: { m: number | null }) {
  if (m == null) return <span className="text-[13px]" style={{ color: C.muted }}>new</span>;
  if (Math.abs(m) < 0.5) return <span className="text-[13px]" style={{ color: C.text2 }}>—</span>;
  const good = m > 0; const meaningful = Math.abs(m) >= 3;
  return <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: good ? C.green : meaningful ? C.red : C.amber }}>{good ? '▲' : '▼'} {Math.abs(m).toFixed(1)}</span>;
}
export function QueryMovement({ q }: { q?: SeoQueries }) {
  const cols: Column<QueryRow>[] = [
    { key: 'query', header: 'Query', render: r => <span className="inline-flex items-center gap-2 min-w-0 max-w-full"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: LOCALITY_META[r.locality]?.color ?? C.muted }} title={LOCALITY_META[r.locality]?.label} /><span className="truncate font-medium">{r.query}</span></span> },
    { key: 'pos', header: 'Position', width: '12%', align: 'right', render: r => <span className="tabular-nums font-semibold">{fmt(r.position)}</span> },
    { key: 'prev', header: 'Previous', width: '12%', align: 'right', hideBelow: '2xl', render: r => <span className="tabular-nums" style={{ color: C.text2 }}>{fmt(r.previousPosition)}</span> },
    { key: 'move', header: 'Move', width: '11%', align: 'right', render: r => <Movement m={r.movement} /> },
    { key: 'imp', header: 'Impr.', width: '11%', align: 'right', hideBelow: 'sm', render: r => <span className="tabular-nums">{num(r.impressions)}</span> },
    { key: 'clk', header: 'Clicks', width: '10%', align: 'right', hideBelow: '2xl', render: r => <span className="tabular-nums">{num(r.clicks)}</span> },
    { key: 'ctr', header: 'CTR', width: '10%', align: 'right', hideBelow: 'lg', render: r => <span className="tabular-nums" style={{ color: C.text2 }}>{r.ctrPct}%</span> },
  ];
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Search} title="Keyword movement" subtitle="Top queries this period vs the previous one · ▲ = moved up" />
      {!q ? <Skeleton className="h-[240px]" /> : (
        <>
          <DataTable columns={cols} rows={q.rows.slice(0, 15)} rowKey={r => r.query} empty={<EmptyState icon={Search} title="No queries yet">Queries appear after Search Console syncs.</EmptyState>} />
          {q.rows.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12.5px]" style={{ color: C.muted }}>
            {(Object.keys(LOCALITY_META) as Locality[]).map(l => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: LOCALITY_META[l].color }} />{LOCALITY_META[l].label}</span>)}
          </div>}
        </>
      )}
    </CommandCard>
  );
}

// ---- technical health -----------------------------------------------------------------------------------

function ScoreRing({ score, label }: { score: number | null; label: string }) {
  const color = score == null ? C.muted : score >= 90 ? C.green : score >= 50 ? C.amber : C.red;
  const r = 26; const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[68px] h-[68px]">
        <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90" aria-hidden>
          <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(52,214,255,0.1)" strokeWidth="6" />
          {score != null && <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * circ} ${circ}`} className="cc-fade-up" />}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[18px] font-bold tabular-nums" style={{ color: score == null ? C.muted : C.text }}>{score ?? '—'}</div>
      </div>
      <span className="text-[12.5px]" style={{ color: C.text2 }}>{label}</span>
    </div>
  );
}
const CHECK_ICON: Record<string, LucideIcon> = { indexability: FileSearch, metadata: FileText, structured_data: Code2, mobile: Smartphone, content: ShieldCheck };
export function TechnicalHealth({ t }: { t?: SeoTechnical }) {
  const mobile = t?.pagespeed.find(p => p.strategy === 'mobile' && /gidgarage\.com\/?$/.test(p.url)) ?? t?.pagespeed.find(p => p.strategy === 'mobile');
  const desktop = t?.pagespeed.find(p => p.strategy === 'desktop' && p.url === mobile?.url) ?? t?.pagespeed.find(p => p.strategy === 'desktop');
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={ShieldCheck} title="Technical SEO" subtitle={t?.measuredAt ? `Measured ${timeAgo(t.measuredAt)} · ${t.pagesAudited} page${t.pagesAudited === 1 ? '' : 's'} audited` : 'Only measured results are shown'} />
      {!t ? <Skeleton className="h-[240px]" /> : (
        <>
          <div className="flex items-center justify-around gap-2 pb-4 mb-3 border-b" style={{ borderColor: C.border }}>
            <ScoreRing score={mobile?.perfScore ?? null} label="Mobile speed" />
            <ScoreRing score={desktop?.perfScore ?? null} label="Desktop speed" />
            <ScoreRing score={mobile?.seoScore ?? null} label="SEO basics" />
          </div>
          {mobile?.lcpMs != null && <div className="text-[13.5px] mb-3" style={{ color: C.text2 }}>Mobile load (LCP): <b style={{ color: mobile.lcpMs <= 2500 ? C.green : mobile.lcpMs <= 4000 ? C.amber : C.red }}>{(mobile.lcpMs / 1000).toFixed(1)} s</b> · Google's "good" is under 2.5 s{mobile.fieldData ? ' (real visitors)' : ' (lab test)'}</div>}
          <ul className="flex flex-col gap-2">
            {t.checks.map(c => {
              const Icon = CHECK_ICON[c.key] ?? FileSearch;
              const state = !c.measured ? 'na' : c.issues.length ? 'issue' : 'ok';
              return (
                <li key={c.key} className="flex items-start gap-3 min-w-0">
                  <Icon size={17} className="mt-0.5 shrink-0" color={C.text2} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium" style={{ color: C.text }}>{c.label}</div>
                    {state === 'issue' && <div className="text-[12.5px] leading-snug" style={{ color: C.text2 }}>{c.issues.slice(0, 2).map(i => i.title).join(' · ')}</div>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap">{state === 'ok' && <StatusBadge tone="green"><CheckCircle2 size={13} /> Pass</StatusBadge>}
                  {state === 'issue' && <StatusBadge tone="amber"><AlertTriangle size={13} /> {c.issues.length}</StatusBadge>}
                  {state === 'na' && <StatusBadge tone="muted"><CircleDashed size={13} /> Not measured</StatusBadge>}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </CommandCard>
  );
}

// ---- opportunities ---------------------------------------------------------------------------------------

const STATUS_ACTIONS: Record<string, { action: string; label: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }[]> = {
  open: [{ action: 'accept', label: 'Accept', variant: 'primary' }, { action: 'mark_applied', label: 'Done' }, { action: 'dismiss', label: 'Snooze', variant: 'ghost' }, { action: 'reject', label: 'Reject', variant: 'ghost' }],
  accepted: [{ action: 'mark_applied', label: 'Mark applied', variant: 'primary' }, { action: 'reject', label: 'Reject', variant: 'ghost' }],
  rejected: [{ action: 'reopen', label: 'Reopen' }],
  dismissed: [{ action: 'reopen', label: 'Reopen' }],
};
const OUTCOME: Record<string, string> = {
  gsc_query_page_clicks: 'More clicks from this search', gsc_query_position: 'Higher ranking position', service_local_impressions: 'More local visibility for the service',
  gbp_actions: 'More calls and direction requests', pagespeed_perf: 'Faster page on phones',
};
function priority(r: SeoRecommendation) {
  if (r.requires_decision) return { label: 'Decide', tone: 'amber' as Tone };
  if (r.score >= 60) return { label: 'High', tone: 'red' as Tone };
  if (r.score >= 40) return { label: 'Medium', tone: 'amber' as Tone };
  return { label: 'Low', tone: 'cyan' as Tone };
}
function statusLine(r: SeoRecommendation) {
  if (r.status === 'accepted') return 'In progress — press "Mark applied" as soon as the change is live.';
  if (r.status === 'applied') return `Applied ${shortDate(r.applied_at)} · measuring the result until ${shortDate(r.monitor_until)}.`;
  if (r.status === 'measured') return 'Measured — result below.';
  return null;
}
export function OpportunityCard({ r, onAction, compact }: { r: SeoRecommendation; onAction: (id: string, action: string) => void; compact?: boolean }) {
  const p = priority(r); const pc = TONE[p.tone];
  const active = r.status === 'accepted' || r.status === 'applied';
  const line = statusLine(r);
  const outcome = (r.metric && OUTCOME[r.metric.kind]) ?? null;
  return (
    <article className="rounded-xl p-4 min-w-0 cc-fade-up" style={{ background: active ? 'linear-gradient(135deg, rgba(255,184,77,0.08), rgba(3,10,17,0.5))' : 'rgba(3,10,17,0.5)', border: `1px solid ${active ? 'rgba(255,184,77,0.45)' : C.border}`, borderLeft: `4px solid ${pc}` }}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center" style={{ background: `${pc}18`, border: `1px solid ${pc}55` }} title={`Priority score ${r.score}`}>
          <span className="text-[17px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{r.requires_decision ? '!' : r.score}</span>
          <span className="text-[11px] font-semibold mt-0.5" style={{ color: pc }}>{p.label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug break-words" style={{ color: C.text }}>{r.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {r.status !== 'open' && <StatusBadge status={r.status} />}
            <StatusBadge tone="muted">{r.type.replace(/_/g, ' ')}</StatusBadge>
            {r.confidence && <span className="text-[12px]" style={{ color: C.muted }}>{r.confidence} confidence</span>}
          </div>
        </div>
      </div>
      {line && <div className="text-[13px] mt-2.5 font-medium" style={{ color: r.status === 'measured' ? C.green : C.amber }}>{line}</div>}
      {!compact && r.detail && <p className="text-[14px] mt-2 leading-relaxed" style={{ color: C.text2 }}>{r.detail}</p>}
      {!compact && outcome && <div className="text-[13px] mt-1.5" style={{ color: C.text2 }}>Expected outcome: <span style={{ color: C.text }}>{outcome}</span></div>}
      {r.outcome && <div className="text-[13.5px] mt-2 font-semibold" style={{ color: r.outcome.result === 'improved' ? C.green : r.outcome.result === 'worse' ? C.red : C.text2 }}>Result: {r.outcome.result.replace(/_/g, ' ')} ({fmt(r.outcome.baseline)} → {fmt(r.outcome.current)})</div>}
      {(STATUS_ACTIONS[r.status] || []).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {(STATUS_ACTIONS[r.status] || []).map(a => <ActionButton key={a.action} size="sm" variant={a.variant ?? 'secondary'} onClick={() => onAction(r.id, a.action)}>{a.label}</ActionButton>)}
        </div>
      )}
    </article>
  );
}
export function OpportunityList({ recs, onAction, compact }: { recs?: SeoRecommendation[]; onAction: (id: string, action: string) => void; compact?: boolean }) {
  if (!recs) return <div className="flex flex-col gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[120px]" />)}</div>;
  if (!recs.length) return <EmptyState icon={Target} title="No opportunities yet">They appear after the first data sync and analysis.</EmptyState>;
  return <div className={compact ? 'flex flex-col gap-3' : 'grid gap-3 lg:grid-cols-2'}>{recs.slice(0, compact ? 6 : 50).map(r => <OpportunityCard key={r.id} r={r} onAction={onAction} compact={compact} />)}</div>;
}

// ---- demand / competitors / seasonality / authority -----------------------------------------------------------

type Cluster = { service: string; label: string; offered: boolean | string; localImpressions: number; gbpImpressions: number; localClicks: number; avgLocalPosition: number | null };
type Gap = { service: string; label: string; localDemand: number; avgLocalPosition: number | null; why: string; competitorsCovering: string[]; score: number };
export function DemandPanel({ d }: { d?: { clusters: Cluster[]; gaps: Gap[]; unconfirmedServiceDemand?: { service: string; label: string; localDemand: number }[]; unsupportedServiceDemand: { service: string; impressions: number }[]; outsideAreaDemand: { place: string; impressions: number }[]; hasData: boolean } }) {
  if (!d) return <Skeleton className="h-[300px]" />;
  if (!d.hasData) return <EmptyState icon={Search} title="No local demand data yet">Appears once Search Console or Business Profile is connected.</EmptyState>;
  const max = Math.max(1, ...d.clusters.map(c => c.localImpressions + c.gbpImpressions));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>Local demand by service</div>
        <ul className="flex flex-col gap-3">
          {d.clusters.map(c => {
            const total = c.localImpressions + c.gbpImpressions; const off = c.offered === false;
            return (
              <li key={c.service} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="truncate" style={{ color: off ? C.muted : C.text }}>{c.label}{off ? ' (referred out)' : c.offered === 'unknown' ? ' (unconfirmed)' : ''}</span>
                  <span className="tabular-nums shrink-0" style={{ color: C.text2 }}>{fmt(total)} · pos {fmt(c.avgLocalPosition)}</span>
                </div>
                <div className="h-2.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgba(52,214,255,0.08)' }}>
                  <div className="h-full rounded-full cc-fade-up" style={{ width: `${(total / max) * 100}%`, background: off ? C.muted : `linear-gradient(90deg, ${C.cyan2}, ${C.cyan})` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-[15px] font-semibold" style={{ color: C.text }}>Local demand gaps</div>
        {d.gaps.length ? d.gaps.map(g => (
          <div key={g.service} className="rounded-xl p-3.5" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }}>
            <div className="text-[14.5px] font-semibold" style={{ color: C.text }}>{g.label} <span className="font-normal" style={{ color: C.text2 }}>· {g.localDemand} local searches</span></div>
            <div className="text-[13.5px] mt-1" style={{ color: C.text2 }}>{g.why}{g.competitorsCovering.length ? ` Covered by ${g.competitorsCovering.join(', ')}.` : ''}</div>
          </div>
        )) : <EmptyState icon={CheckCircle2} title="No gaps for services you offer" />}
        {(d.unconfirmedServiceDemand?.length ?? 0) > 0 && <div className="text-[13.5px]" style={{ color: C.text2 }}>Searches for services you haven't confirmed offering (confirm before anything is suggested): {d.unconfirmedServiceDemand!.map(u => `${u.label} (${u.localDemand})`).join(', ')}</div>}
        {d.outsideAreaDemand.length > 0 && <div className="text-[13.5px]" style={{ color: C.amber }}>Outside the service area (an expansion decision only): {d.outsideAreaDemand.map(o => `${o.place} (${o.impressions})`).join(', ')}</div>}
        {d.unsupportedServiceDemand.length > 0 && <div className="text-[13px]" style={{ color: C.muted }}>Referred-out services (not pursued): {d.unsupportedServiceDemand.map(o => `${o.service} (${o.impressions})`).join(', ')}</div>}
      </div>
    </div>
  );
}

type Comp = { id: string; name: string; tier: string; is_mobile?: boolean; rating: number | null; reviewCount: number | null; reviewVelocity: number | null; distance_miles: number | null; theyShowWeDont: string[]; weShowTheyDont?: string[]; strength: number };
export function CompetitorPanel({ c }: { c?: { landscape: Comp[]; ourReviewVelocity: number | null; recentChanges: { id: number; name: string; change_type: string; detected_at: string }[]; searchResultCompetitors: string[]; note: string } }) {
  if (!c) return <Skeleton className="h-[300px]" />;
  if (!c.landscape.length) return <EmptyState icon={Users2} title="No local competitors yet">Connect the Places API or add competitors manually.</EmptyState>;
  const maxStrength = Math.max(1, ...c.landscape.map(x => x.strength || 0));
  const cols: Column<Comp>[] = [
    { key: 'name', header: 'Competitor', render: x => <span className="inline-flex items-center gap-2 min-w-0 max-w-full"><span className="truncate font-semibold">{x.name}</span>{x.tier === 'primary' && <StatusBadge tone="cyan">Mobile</StatusBadge>}</span> },
    { key: 'strength', header: 'Local strength', width: '20%', hideBelow: 'sm', render: x => <span className="flex items-center gap-2"><span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(52,214,255,0.08)' }}><span className="block h-full rounded-full" style={{ width: `${((x.strength || 0) / maxStrength) * 100}%`, background: C.purple }} /></span><span className="tabular-nums text-[13px] w-8 text-right" style={{ color: C.text2 }}>{fmt(x.strength)}</span></span> },
    { key: 'rating', header: 'Rating', width: '12%', align: 'right', render: x => <span className="tabular-nums">{x.rating ?? '—'}★</span> },
    { key: 'reviews', header: 'Reviews', width: '11%', align: 'right', hideBelow: 'md', render: x => <span className="tabular-nums" style={{ color: C.text2 }}>{fmt(x.reviewCount)}</span> },
    { key: 'dist', header: 'Distance', width: '11%', align: 'right', hideBelow: 'lg', render: x => <span className="tabular-nums" style={{ color: C.text2 }}>{x.distance_miles != null ? `${x.distance_miles} mi` : '—'}</span> },
    { key: 'overlap', header: 'Promotes what you offer', width: '22%', hideBelow: 'xl', render: x => <span style={{ color: x.theyShowWeDont.length ? C.amber : C.muted }}>{x.theyShowWeDont.length ? x.theyShowWeDont.join(', ') : '—'}</span> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px]" style={{ color: C.text2 }}>{c.note} Your review pace: {c.ourReviewVelocity ?? '—'} per 30 days.</p>
      <DataTable columns={cols} rows={c.landscape.slice(0, 15)} rowKey={x => x.id} />
      {c.recentChanges.length > 0 && <div className="text-[13.5px]" style={{ color: C.text2 }}>Recent changes: {c.recentChanges.slice(0, 5).map(ch => `${ch.name} ${ch.change_type.replace(/_/g, ' ')}`).join('; ')}</div>}
      {c.searchResultCompetitors.length > 0 && <div className="text-[13px]" style={{ color: C.muted }}>Search-result competitors (not businesses): {c.searchResultCompetitors.join(', ')}</div>}
    </div>
  );
}

type Finding = { event: string; label: string; series: string; verdict: string; ratio: number | null; statement: string; approximateDates: boolean };
export function SeasonalityPanel({ s }: { s?: { findings: Finding[]; insufficientDataCount: number; usingApproximateNauDates: boolean; upcomingColdSnap: { start: string; lowestF: number } | null; note: string } }) {
  if (!s) return <Skeleton className="h-[200px]" />;
  return (
    <div className="flex flex-col gap-3">
      {s.upcomingColdSnap && <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.4)' }}><CloudSnow size={20} color={C.amber} className="shrink-0" /><span className="text-[14.5px]" style={{ color: C.text }}>Cold snap forecast from {s.upcomingColdSnap.start} (lows to {s.upcomingColdSnap.lowestF}°F) — battery and no-start demand usually follows.</span></div>}
      {s.findings.length ? s.findings.map((f, i) => (
        <div key={i} className="flex gap-3 text-[14.5px] leading-relaxed"><span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: f.verdict === 'uplift' ? C.green : C.cyan }} /><span style={{ color: C.text }}>{f.statement}</span></div>
      )) : <EmptyState icon={History} title="No seasonal pattern proven yet">Patterns are only stated when the data shows a clear change.</EmptyState>}
      <p className="text-[13px]" style={{ color: C.muted }}>{s.note} {s.insufficientDataCount} event/series pairs don't have enough data yet.{s.usingApproximateNauDates ? ' Using approximate NAU calendar dates — add the official dates to sharpen this.' : ''}</p>
    </div>
  );
}

type AuthorityOpp = { name: string; url?: string; kind: string; local: boolean; score: number; status: string };
type Citation = { id: number; platform: string; issues: { field: string; detail: string }[] };
export function AuthorityPanel({ a }: { a?: { opportunities: AuthorityOpp[]; citations: Citation[] } }) {
  if (!a) return <Skeleton className="h-[260px]" />;
  const max = Math.max(1, ...a.opportunities.map(o => o.score));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>Local authority opportunities</div>
        <ul className="flex flex-col gap-2.5">
          {a.opportunities.map(o => (
            <li key={o.name} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="truncate" style={{ color: C.text }}>{o.name} <span style={{ color: C.muted }}>· {o.kind}{o.local ? ' · local' : ''}</span></span><span className="tabular-nums shrink-0 font-semibold" style={{ color: C.cyan }}>{o.score}</span></div>
              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(52,214,255,0.08)' }}><div className="h-full rounded-full" style={{ width: `${(o.score / max) * 100}%`, background: C.cyan }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>Listing consistency</div>
        {a.citations.length ? (
          <ul className="flex flex-col gap-2">{a.citations.map(c => (
            <li key={c.id} className="flex items-start gap-2.5 text-[14px]">
              {c.issues.length ? <AlertTriangle size={16} color={C.amber} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} color={C.green} className="mt-0.5 shrink-0" />}
              <span style={{ color: C.text }}>{c.platform}<span style={{ color: C.text2 }}>{c.issues.length ? ` — ${c.issues.map(i => i.detail).join(' ')}` : ' — consistent'}</span></span>
            </li>
          ))}</ul>
        ) : <EmptyState icon={Link2} title="No listings recorded yet">Add your Google, Apple, Yelp and other listings to check name/phone/website consistency.</EmptyState>}
      </div>
    </div>
  );
}

// ---- connections ---------------------------------------------------------------------------------------------

export function connectionGroup(status: string): 'connected' | 'attention' | 'off' {
  if (status === 'connected' || status === 'ready_limited') return 'connected';
  if (status === 'needs_authorization' || status === 'pending_approval' || status === 'error') return 'attention';
  return 'off';
}
const GROUP_LABEL = { connected: 'Connected', attention: 'Needs attention', off: 'Not configured' } as const;
const GROUP_TONE = { connected: 'green', attention: 'amber', off: 'muted' } as const;
export function ConnectionsPanel({ c, onSync, syncing }: { c?: { providers: ProviderStatus[] }; onSync: (mode: 'incremental' | 'backfill') => void; syncing?: boolean }) {
  if (!c) return <Skeleton className="h-[300px]" />;
  const order = { connected: 0, attention: 1, off: 2 };
  const providers = [...c.providers].sort((a, b) => order[connectionGroup(a.status)] - order[connectionGroup(b.status)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton variant="primary" icon={RefreshCw} onClick={() => onSync('incremental')} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</ActionButton>
        <ActionButton icon={History} onClick={() => onSync('backfill')} disabled={syncing}>Backfill history</ActionButton>
        <span className="text-[13px]" style={{ color: C.muted }}>Setup steps: SEO_SETUP.md</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {providers.map(p => {
          const g = connectionGroup(p.status);
          return (
            <div key={p.id} className="rounded-xl p-4 min-w-0" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${g === 'connected' ? 'rgba(32,229,139,0.35)' : g === 'attention' ? 'rgba(255,184,77,0.4)' : C.border}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0"><Plug size={16} color={TONE[GROUP_TONE[g]]} className="shrink-0" /><span className="text-[14.5px] font-semibold truncate" style={{ color: C.text }}>{p.label}</span></div>
                <StatusBadge tone={GROUP_TONE[g]} dot>{GROUP_LABEL[g]}</StatusBadge>
              </div>
              <div className="text-[13px] mt-2" style={{ color: C.text2 }}>{p.lastSyncAt ? `Last synced ${timeAgo(p.lastSyncAt)}` : 'Never synced'}{p.backfilledFrom ? ` · history from ${p.backfilledFrom}` : ''}</div>
              {p.status !== 'connected' && p.status !== 'not_configured' && <div className="text-[12.5px] mt-0.5" style={{ color: C.muted }}>{p.status.replace(/_/g, ' ')}</div>}
              {p.lastError && <div className="text-[12.5px] mt-1 line-clamp-2" style={{ color: C.red }}>{p.lastError}</div>}
              {g !== 'connected' && p.missing?.length > 0 && <div className="text-[12.5px] mt-1 line-clamp-2" style={{ color: C.muted }}>Missing: {p.missing.join(', ')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Fallback when the interactive map (ServiceAreaMap.tsx) can't load.
export function ServiceAreaDiagram({ geo }: { geo?: SeoGeography }) {
  if (!geo) return <Empty>Loading service area…</Empty>;
  const size = 360; const pad = 20; const r = size / 2 - pad;
  const milesPerDegLat = 69; const milesPerDegLng = 69 * Math.cos((geo.center.lat * Math.PI) / 180);
  const project = (a: { lat: number; lng: number }) => ({ x: size / 2 + ((a.lng - geo.center.lng) * milesPerDegLng / geo.radiusMiles) * r, y: size / 2 - ((a.lat - geo.center.lat) * milesPerDegLat / geo.radiusMiles) * r });
  const max = Math.max(1, ...geo.areas.map(a => a.count));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[360px]" role="img" aria-label="Service area diagram">
      <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(52,214,255,0.04)" stroke={C.cyan} strokeDasharray="4 4" />
      {geo.areas.map((a: GeoArea) => { const p = project(a); return <g key={a.slug}><circle cx={p.x} cy={p.y} r={5 + 14 * Math.sqrt(a.count / max)} fill="rgba(32,229,139,0.35)" stroke={C.green} /><text x={p.x} y={p.y - 12 - 14 * Math.sqrt(a.count / max)} textAnchor="middle" fontSize="12" fill={C.text}>{a.name} · {a.count}</text></g>; })}
    </svg>
  );
}
