// ── GID GARAGE — JARVIS COMMAND CENTER ───────────────────────────────────
// Phase 1 of the visual rebuild: new component architecture, design tokens,
// new grid layout, existing data wired in. No Three.js Jarvis Core yet
// (Phase 3), no Motion library yet (Phase 5 polish), no new dependencies —
// deliberately, so this phase is small enough to verify against the real
// site before building further on top of it.
//
// Talks to the same backends as before:
//   admin-api-data.js  — get-command-center-summary, list-leads, patch-lead,
//                         add-marketing-spend
//   admin-ai-chat.js   — streamed NDJSON agent (tool_call/tool_result/data/final)
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useBusinessSummary } from './hooks/useBusinessSummary';
import { useAdminAI } from './hooks/useAdminAI';
import { JarvisStatus } from './components/JarvisStatus';
import { BusinessMetrics } from './components/BusinessMetrics';
import { AttentionPanel } from './components/AttentionPanel';
import { UpcomingJobs } from './components/UpcomingJobs';
import { LeadPipeline } from './components/LeadPipeline';
import { MarketingPanel } from './components/MarketingPanel';
import { CommandInput } from './components/CommandInput';
import { PANEL, PANEL_PADDING } from './tokens';

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return <span className="text-[11px] text-[#52616D] font-mono">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>;
}

export function CommandCenterPage() {
  const {
    summary, loading, error, loadSummary,
    leads, leadsLoading, leadStatusFilter, setLeadStatusFilter, loadLeads,
    updateLeadStatus, submitSpend,
  } = useBusinessSummary();

  const { chatMessages, asking, liveActivity, jarvisState, ask, clear } = useAdminAI(() => {
    loadSummary();
    loadLeads(leadStatusFilter || undefined);
  });

  if (loading && !summary) {
    return <div className="max-w-6xl mx-auto py-12 px-4 text-center text-[#52616D] text-sm">Loading command center…</div>;
  }
  if (error && !summary) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-center">
        <p className="text-[#FF5353] text-sm mb-3">Failed to load: {error}</p>
        <p className="text-[#52616D] text-xs mb-4">
          If this is the first time loading this tab, make sure you've run <code className="text-[#8899A6]">gid_command_center_migration.sql</code> in the Supabase SQL editor.
        </p>
        <button onClick={loadSummary} className="border border-white/10 text-[#8899A6] hover:border-[#32D9FF] hover:text-[#32D9FF] text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded">Retry</button>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div className="max-w-6xl mx-auto py-4 px-3 sm:px-6 space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52616D]">GID Garage</div>
          <div className="text-lg font-bold text-[#F5F8FA] tracking-tight">Command Center</div>
        </div>
        <div className="flex items-center gap-3">
          <LiveClock />
          <button onClick={loadSummary} className="text-[#52616D] hover:text-[#8899A6] text-[11px] uppercase tracking-wide">↻ Refresh</button>
        </div>
      </div>

      {/* ── Business state first (section 34 priority order) ─────────── */}
      <BusinessMetrics today={summary.today} />

      {/* ── Needs Attention + Jarvis status ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <AttentionPanel items={summary.needsAttention} />
        </div>
        <div className={`${PANEL} ${PANEL_PADDING} flex items-center justify-center`}>
          <JarvisStatus state={jarvisState} />
        </div>
      </div>

      {/* ── Command input — central to the interface, not buried ─────── */}
      <CommandInput chatMessages={chatMessages} asking={asking} liveActivity={liveActivity} onAsk={ask} onClear={clear} />

      {/* ── Upcoming work ──────────────────────────────────────────────── */}
      <UpcomingJobs scheduleBar={summary.scheduleBar} />

      {/* ── Leads + Marketing ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LeadPipeline
          leadsSummary={summary.leadsSummary}
          leads={leads}
          leadsLoading={leadsLoading}
          leadStatusFilter={leadStatusFilter}
          onFilterChange={s => { setLeadStatusFilter(s); loadLeads(s || undefined); }}
          onStatusChange={updateLeadStatus}
        />
        <MarketingPanel marketingFunnel={summary.marketingFunnel} onAddSpend={submitSpend} />
      </div>
    </div>
  );
}
