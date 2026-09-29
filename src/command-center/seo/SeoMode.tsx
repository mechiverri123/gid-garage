// SEO / Local Search Command Center. Same design system as the main dashboard:
// cyan interface, green reserved for positive growth. Local-first: the headline
// is whether search brings people GID can serve (~30 mi around Flagstaff).
// Jarvis ui_focus events (or the tabs) pick the focused detail view.

import { useState } from 'react';
import { Radar, CalendarRange, RefreshCw, Target, ChevronDown } from 'lucide-react';
import { SEO_VIEWS, type SeoView, type SeoOverview, type SeoRecommendation, type SeoGeography, type SeoQueries, type SeoTechnical, type SeoConnections } from './seoTypes';
import { useSeoData } from './useSeoData';
import { SeoKpiCard, LocalPerformanceChart, LocalityPanel, SearchPerformance, QueryMovement, TechnicalHealth, OpportunityList, DemandPanel, CompetitorPanel, SeasonalityPanel, AuthorityPanel, ConnectionsPanel, connectionGroup } from './SeoPanels';
import { ServiceAreaMap } from './ServiceAreaMap';
import { C, timeAgo } from '../ui/theme';
import { CommandCard, SectionHeader, StatusBadge, Segmented, Skeleton, ErrorState } from '../ui/primitives';
import { JarvisOrb, orbLabel, type OrbState } from '../ui/JarvisOrb';
import { ReviewsCard } from '../workspace/FeedViews';
import { AgentStatus, ActionQueueTop, ActionsView, Top5View, BlueprintView, RankingsView, ResearchView, HistoryView } from './SeoAgent';

const niceDate = (ymd?: string) => { if (!ymd) return ''; const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };

export function SeoMode({ focus, onFocus, orb, onOpenReviews }: { focus: SeoView; onFocus: (v: SeoView) => void; orb: OrbState; onOpenReviews?: () => void }) {
  const [days, setDays] = useState(28);
  const seo = useSeoData(focus, days);
  const overview = seo.get<SeoOverview>('overview');
  const recs = seo.get<SeoRecommendation[]>('opportunities');
  const conn = seo.get<SeoConnections>('connections');
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const act = async (id: string, action: string) => {
    try { await seo.post({ action: 'update_recommendation', id, recAction: action }); setNotice(`Recommendation ${action.replace('_', ' ')} — saved.`); }
    catch (e) { setNotice(`Not changed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const sync = async (mode: 'incremental' | 'backfill') => {
    setSyncing(true);
    setNotice(mode === 'backfill' ? 'Loading search history… this can take a minute or two.' : 'Syncing…');
    try {
      const out = await seo.syncNow(mode);
      if (!out?.ok) { setNotice(`Sync failed: ${out?.error || 'unknown error'}`); return; }
      const skipped = Object.entries(out.skipped).map(([why, n]) => `${n} ${why}`).join(', ');
      const parts = [`${out.pulled.length} source${out.pulled.length === 1 ? '' : 's'} pulled${out.pulled.length ? ` (${out.pulled.join(', ')})` : ''}`];
      if (skipped) parts.push(`skipped: ${skipped}`);
      if (out.errors.length) parts.push(`${out.errors.length} failed: ${out.errors.join('; ')}`);
      if (out.more) parts.push('more remaining — press Sync now again');
      if (mode === 'backfill') parts.push(out.historyIncomplete ? `${out.runs} runs done, more history left — press Backfill again` : `history loaded (${out.runs} run${out.runs === 1 ? '' : 's'})`);
      setNotice(`Sync ${out.errors.length ? 'finished with errors' : 'finished'}: ${parts.join(' — ')}.`);
    } finally { setSyncing(false); }
  };

  const groups = conn?.providers.map(p => connectionGroup(p.status)) ?? [];
  const connected = groups.filter(g => g === 'connected').length;
  const attention = groups.filter(g => g === 'attention').length;
  const lastSync = conn?.providers.map(p => p.lastSyncAt).filter(Boolean).sort().pop() ?? conn?.lastRun?.at ?? null;
  const activeRecs = recs?.filter(r => r.status === 'accepted' || r.status === 'applied') ?? [];

  const detail = () => {
    switch (focus) {
      case 'overview': return overview ? (
        <div className="flex flex-col gap-4">
          {(overview.website || overview.instagram) && (
            <div className="grid gap-3 sm:grid-cols-2 text-[14px]" style={{ color: C.text2 }}>
              {overview.website && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }}>
                  <div className="text-[13px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Website visits (GA4, IP-based city)</div>
                  <div>Likely local {overview.website.sessionsByLocality.likely_local ?? 0} · unknown {overview.website.sessionsByLocality.unknown ?? 0} · outside {overview.website.sessionsByLocality.nonlocal ?? 0}</div>
                  <div>Local key events (calls/forms): {overview.website.localKeyEvents}</div>
                  {Object.keys(overview.website.aiAssistantSessions).length > 0 && <div>From AI assistants: {Object.entries(overview.website.aiAssistantSessions).map(([k, v]) => `${k} ${v}`).join(', ')}</div>}
                </div>
              )}
              {overview.instagram && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }}>
                  <div className="text-[13px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Instagram (local awareness)</div>
                  <div>Local follower share: <span style={{ color: C.text }}>{overview.instagram.localFollowerSharePct ?? '—'}%</span> of {overview.instagram.followers ?? '—'}</div>
                  <div className="text-[12.5px] mt-1" style={{ color: C.muted }}>{overview.instagram.note}</div>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="text-[14px] font-semibold mb-2" style={{ color: C.text2 }}>Other traffic (not a success metric by itself)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {overview.tertiary.map(k => (
                <div key={k.key} className="rounded-xl p-4" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }} title={k.note}>
                  <div className="text-[13.5px]" style={{ color: C.text2 }}>{k.label}</div>
                  <div className="text-[22px] font-bold tabular-nums mt-1" style={{ color: C.text }}>{k.value == null ? '—' : k.value.toLocaleString('en-US')}</div>
                </div>
              ))}
            </div>
            {overview.anonymizedImpressionShare != null && <div className="text-[13px] mt-2" style={{ color: C.muted }}>{overview.anonymizedImpressionShare}% of impressions come from queries Google hides for privacy.</div>}
          </div>
          <LocalityPanel overview={overview} metric="clicks" />
        </div>
      ) : <Skeleton className="h-[240px]" />;
      case 'map': return <ServiceAreaMap geo={seo.get<SeoGeography>('map')} />;
      case 'opportunities': return <OpportunityList recs={recs} onAction={act} />;
      case 'demand': return <DemandPanel d={seo.get('demand')} />;
      case 'competitors': return <CompetitorPanel c={seo.get('competitors')} />;
      case 'seasonality': return <SeasonalityPanel s={seo.get('seasonality')} />;
      case 'authority': return <AuthorityPanel a={seo.get('authority')} />;
      case 'connections': return <ConnectionsPanel c={conn} onSync={sync} syncing={syncing} />;
      case 'actions': return <ActionsView a={seo.get('actions')} post={seo.post} />;
      case 'top5': return <Top5View t={seo.get('top5')} />;
      case 'blueprint': return <BlueprintView b={seo.get('blueprint')} post={seo.post} />;
      case 'rankings': return <RankingsView r={seo.get('rankings')} post={seo.post} />;
      case 'research': return <ResearchView k={seo.get('research')} post={seo.post} />;
      case 'history': return <HistoryView hs={seo.get('history')} />;
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Hero */}
      <CommandCard variant="primary" scan className="p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="shrink-0 w-[76px] h-[76px]" title={orbLabel(orb)}><JarvisOrb state={orb} size={76} /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.25em]" style={{ color: C.cyan }}><Radar size={16} /> SEO Mode · Local-first</div>
              <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight mt-1" style={{ color: C.text }}>{overview?.serviceArea.center ?? 'Flagstaff, AZ'} local search</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[14px]" style={{ color: C.text2 }}>
                <span>{overview?.serviceArea.radiusMiles ?? 30}-mile service area</span>
                {overview && <span className="inline-flex items-center gap-1.5"><CalendarRange size={15} />{niceDate(overview.period.from)} – {niceDate(overview.period.to)}</span>}
              </div>
            </div>
          </div>
          <div className="lg:ml-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {conn ? <>
                  <StatusBadge tone="green" dot>{connected} connected</StatusBadge>
                  {attention > 0 && <StatusBadge tone="amber" dot>{attention} need attention</StatusBadge>}
                </> : <Skeleton className="h-7 w-40" />}
              </div>
              <button type="button" onClick={() => onFocus('connections')} className="text-left text-[13px] inline-flex items-center gap-1.5 hover:underline" style={{ color: C.text2 }}>
                <RefreshCw size={13} />{lastSync ? `Last sync ${timeAgo(lastSync)}` : 'Never synced'} · Connections
              </button>
            </div>
            <Segmented label="Period" value={String(days) as '7' | '28' | '90'} onChange={v => setDays(Number(v))} options={[{ value: '7', label: '7d' }, { value: '28', label: '28d' }, { value: '90', label: '90d' }]} />
          </div>
        </div>
      </CommandCard>

      {/* Google reviews first: rating, total, new this week, newest two. */}
      <ReviewsCard compact onOpen={onOpenReviews} />

      {/* The SEO agent: status, then HIGH priority actions (dominant). */}
      <AgentStatus a={seo.get('actions')} onOpen={() => { onFocus('actions'); document.getElementById('seo-detail')?.scrollIntoView({ behavior: 'smooth' }); }} />
      <ActionQueueTop a={seo.get('actions')} post={seo.post} />

      {notice && <div className="text-[14px] rounded-xl px-4 py-3" style={{ color: C.text, background: 'rgba(52,214,255,0.07)', border: `1px solid ${C.border}` }} role="status">{notice}</div>}
      {seo.error && <ErrorState message={`Couldn't load SEO data: ${seo.error}${/404|relation|does not exist/i.test(seo.error) ? ' — run seo_migration.sql first.' : ''}`} />}
      {overview && !overview.hasSearchData && (
        <div className="text-[14px] rounded-xl px-4 py-3" style={{ color: C.amber, background: 'rgba(255,184,77,0.07)', border: '1px solid rgba(255,184,77,0.35)' }}>
          No search data yet. {overview.dataSources.notConnected.length} data sources aren't connected — see <button className="underline" onClick={() => onFocus('connections')}>Connections</button>.
        </div>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 sm:gap-4">
        {overview ? overview.primary.map(k => <SeoKpiCard key={k.key} kpi={k} series={overview.series} />) : [...Array(6)].map((_, i) => <Skeleton key={i} className="h-[150px]" />)}
      </div>

      {/* Chart + intent */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LocalPerformanceChart overview={overview} />
        <LocalityPanel overview={overview} />
      </div>

      {/* Opportunities + technical */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <CommandCard className="p-5">
          <SectionHeader icon={Target} title="Opportunities" subtitle={activeRecs.length ? `${activeRecs.length} in progress · highest priority first` : 'Ranked by expected local impact'}
            right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => onFocus('opportunities')}>View all</button>} />
          <OpportunityList recs={recs && [...activeRecs, ...recs.filter(r => !activeRecs.includes(r))]} onAction={act} compact />
        </CommandCard>
        <TechnicalHealth t={seo.getAction<SeoTechnical>('technical')} />
      </div>

      {/* Search performance + keywords */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <SearchPerformance overview={overview} />
        <QueryMovement q={seo.getAction<SeoQueries>('queries')} />
      </div>

      {/* Focused detail (tabs; Jarvis can switch these) */}
      <CommandCard className="p-5" id="seo-detail">
        <div className="flex items-center gap-2 mb-4 min-w-0">
          <label className="sm:hidden relative flex-1">
            <span className="sr-only">Section</span>
            <select value={focus} onChange={e => onFocus(e.target.value as SeoView)} className="w-full appearance-none rounded-lg h-11 pl-3 pr-9 text-[15px] font-semibold outline-none" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text, colorScheme: 'dark' }}>
              {SEO_VIEWS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" color={C.text2} />
          </label>
          <div className="hidden sm:flex flex-wrap gap-2" role="tablist">
            {SEO_VIEWS.map(v => (
              <button key={v.id} role="tab" aria-selected={focus === v.id} onClick={() => onFocus(v.id)}
                className="text-[14px] font-medium px-3.5 h-9 rounded-full border transition-colors"
                style={{ borderColor: focus === v.id ? C.cyan : C.border, color: focus === v.id ? '#021019' : C.text2, background: focus === v.id ? C.cyan : 'rgba(3,10,17,0.4)' }}>{v.label}</button>
            ))}
          </div>
        </div>
        <div key={focus} className="cc-fade-up">{detail()}</div>
      </CommandCard>
    </div>
  );
}
