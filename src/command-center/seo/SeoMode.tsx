// ── SEO MODE (green) ──────────────────────────────────────────────────────
// Local-first growth view: the owner should see at a glance whether search
// is bringing people GID can actually serve (inside ~30 mi of Flagstaff).
// Center-focus: whatever Jarvis talks about (ui_focus events) or the owner
// picks is shown large in the center; the opportunities rail stays visible.

import { AnimatePresence, motion } from 'motion/react';
import type { ActivityItem, JarvisState } from '../types';
import { JarvisStatus } from '../components/JarvisStatus';
import { SEO_VIEWS, type SeoView, type SeoOverview, type SeoRecommendation, type SeoGeography } from './seoTypes';
import { useSeoData } from './useSeoData';
import { SEO, SEO_PANEL, SEO_LABEL, KpiTile, LocalityBar, ServiceAreaMap, OpportunityList, DemandPanel, CompetitorPanel, SeasonalityPanel, AuthorityPanel, ConnectionsPanel, Empty } from './SeoPanels';
import { useState } from 'react';

export function SeoMode({ focus, onFocus, coreState, liveActivity }: { focus: SeoView; onFocus: (v: SeoView) => void; coreState: JarvisState; liveActivity: ActivityItem[] }) {
  const [days, setDays] = useState(28);
  const seo = useSeoData(focus, days);
  const overview = seo.get<SeoOverview>('overview');
  const recs = seo.get<SeoRecommendation[]>('opportunities');
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (id: string, action: string) => {
    try { await seo.post({ action: 'update_recommendation', id, recAction: action }); setNotice(`Recommendation ${action.replace('_', ' ')} — saved.`); }
    catch (e) { setNotice(`Not changed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const sync = async (mode: 'incremental' | 'backfill') => {
    setNotice('Syncing…');
    const out = await seo.syncNow(mode);
    if (!out?.ok) { setNotice(`Sync failed: ${out?.error || 'unknown error'}`); return; }
    const skipped = Object.entries(out.skipped).map(([why, n]) => `${n} ${why}`).join(', ');
    const parts = [`${out.pulled.length} source${out.pulled.length === 1 ? '' : 's'} pulled${out.pulled.length ? ` (${out.pulled.join(', ')})` : ''}`];
    if (skipped) parts.push(`skipped: ${skipped}`);
    if (out.errors.length) parts.push(`${out.errors.length} failed: ${out.errors.join('; ')}`);
    if (out.more) parts.push('more remaining — press Sync now again');
    setNotice(`Sync ${out.errors.length ? 'finished with errors' : 'finished'}: ${parts.join(' — ')}.`);
  };

  const center = () => {
    switch (focus) {
      case 'overview': return overview ? (
        <div className="space-y-4">
          <LocalityBar breakdown={overview.localityBreakdown} />
          <div className="grid sm:grid-cols-2 gap-3">
            {overview.secondary.map(k => <KpiTile key={k.key} kpi={k} />)}
          </div>
          {(overview.website || overview.instagram) && (
            <div className="grid sm:grid-cols-2 gap-3 text-[12px]" style={{ color: SEO.muted }}>
              {overview.website && (
                <div className={SEO_PANEL}>
                  <div className={SEO_LABEL} style={{ color: SEO.faint }}>Website visits (GA4, IP-based city)</div>
                  <div className="mt-2">Likely local {overview.website.sessionsByLocality.likely_local ?? 0} · unknown {overview.website.sessionsByLocality.unknown ?? 0} · outside {overview.website.sessionsByLocality.nonlocal ?? 0}</div>
                  <div>Local key events (calls/forms): {overview.website.localKeyEvents}</div>
                  {Object.keys(overview.website.aiAssistantSessions).length > 0 && <div>From AI assistants: {Object.entries(overview.website.aiAssistantSessions).map(([k, v]) => `${k} ${v}`).join(', ')}</div>}
                </div>
              )}
              {overview.instagram && (
                <div className={SEO_PANEL}>
                  <div className={SEO_LABEL} style={{ color: SEO.faint }}>Instagram (local awareness)</div>
                  <div className="mt-2">Local follower share: <span style={{ color: SEO.text }}>{overview.instagram.localFollowerSharePct ?? '—'}%</span> of {overview.instagram.followers ?? '—'}</div>
                  <div className="text-[10px]" style={{ color: SEO.faint }}>{overview.instagram.note}</div>
                </div>
              )}
            </div>
          )}
          <details>
            <summary className="text-[11px] cursor-pointer" style={{ color: SEO.faint }}>Other traffic (not a success metric by itself)</summary>
            <div className="grid sm:grid-cols-3 gap-3 mt-2">{overview.tertiary.map(k => <KpiTile key={k.key} kpi={k} />)}</div>
            {overview.anonymizedImpressionShare != null && <div className="text-[10px] mt-2" style={{ color: SEO.faint }}>{overview.anonymizedImpressionShare}% of impressions come from queries Google hides for privacy.</div>}
          </details>
        </div>
      ) : <Empty>Loading…</Empty>;
      case 'map': return <ServiceAreaMap geo={seo.get<SeoGeography>('map')} />;
      case 'opportunities': return <OpportunityList recs={recs} onAction={act} />;
      case 'demand': return <DemandPanel d={seo.get('demand')} />;
      case 'competitors': return <CompetitorPanel c={seo.get('competitors')} />;
      case 'seasonality': return <SeasonalityPanel s={seo.get('seasonality')} />;
      case 'authority': return <AuthorityPanel a={seo.get('authority')} />;
      case 'connections': return <ConnectionsPanel c={seo.get('connections')} onSync={sync} />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Header: mode, service area, period, compact AI core */}
      <div className={`${SEO_PANEL} flex flex-wrap items-center gap-4 py-3`}>
        <div className="w-[72px] h-[72px] flex items-center justify-center overflow-hidden"><JarvisStatus state={coreState} liveActivity={liveActivity} size={72} /></div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: SEO.accent }}>SEO Mode · Local-first</div>
          <div className="text-[12px]" style={{ color: SEO.muted }}>{overview ? `${overview.serviceArea.center} · ${overview.serviceArea.radiusMiles}-mile service area · ${overview.period.from} → ${overview.period.to}` : 'Flagstaff · 30-mile service area'}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {[7, 28, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className="text-[11px] px-2 py-1 rounded border" style={{ borderColor: days === d ? SEO.accent : SEO.border, color: days === d ? SEO.accent : SEO.muted }}>{d}d</button>
          ))}
        </div>
      </div>

      {notice && <div className="text-[12px] px-1" style={{ color: SEO.muted }}>{notice}</div>}
      {seo.error && <div className="text-[12px] px-1" style={{ color: SEO.bad }}>Couldn't load SEO data: {seo.error}{/404|relation|does not exist/i.test(seo.error) ? ' — run seo_migration.sql first.' : ''}</div>}
      {overview && !overview.hasSearchData && (
        <div className="text-[12px] px-1" style={{ color: SEO.warn }}>
          No search data yet. {overview.dataSources.notConnected.length} data sources aren't connected — see <button className="underline" onClick={() => onFocus('connections')}>Connections</button>.
        </div>
      )}

      {/* Primary KPIs — local business impact first */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {overview ? overview.primary.map(k => <KpiTile key={k.key} kpi={k} primary />) : [...Array(6)].map((_, i) => <div key={i} className={`${SEO_PANEL} h-[92px] animate-pulse`} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Center focus */}
        <div className={`lg:col-span-8 ${SEO_PANEL}`}>
          <div className="flex flex-wrap gap-1.5 mb-4" role="tablist">
            {SEO_VIEWS.map(v => (
              <button key={v.id} role="tab" aria-selected={focus === v.id} onClick={() => onFocus(v.id)}
                className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                style={{ borderColor: focus === v.id ? SEO.accent : SEO.border, color: focus === v.id ? '#04140C' : SEO.muted, background: focus === v.id ? SEO.accent : 'transparent' }}>{v.label}</button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={focus} initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {center()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Opportunities rail */}
        <div className={`lg:col-span-4 ${SEO_PANEL}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={SEO_LABEL} style={{ color: SEO.faint }}>Top local opportunities</div>
            <button className="text-[10px] underline" style={{ color: SEO.muted }} onClick={() => onFocus('opportunities')}>all</button>
          </div>
          <OpportunityList recs={recs} onAction={act} compact />
        </div>
      </div>
    </div>
  );
}
