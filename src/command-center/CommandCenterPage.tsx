// ── GID GARAGE — JARVIS COMMAND CENTER ───────────────────────────────────
// Full-width layout — this is its own standalone page (gidgarage.com/jarvis),
// not a tab living inside /admin's narrower max-w-6xl convention, so it
// uses the whole viewport like an actual command center, not a centered
// column with dead space on either side. Meant to be usable full-screen
// (F11 or the in-page fullscreen toggle below).
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
import { UpcomingJobsList } from './components/UpcomingJobsList';
import { LeadPipeline } from './components/LeadPipeline';
import { MarketingPanel } from './components/MarketingPanel';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { CommandInput } from './components/CommandInput';
import { PANEL, PANEL_PADDING } from './tokens';

// Full-bleed page shell — this is the thing that changed. Everywhere else
// (admin's tabs) intentionally stays a centered max-w-6xl column; this page
// is the exception, meant to fill a monitor edge to edge.
const PAGE = 'w-full px-4 sm:px-6 lg:px-10 py-4 space-y-4';

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return <span className="text-[11px] text-[#52616D] font-mono">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>;
}

function FullscreenToggle() {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggle() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  return (
    <button onClick={toggle} className="text-[#52616D] hover:text-[#8899A6] text-[11px] uppercase tracking-wide">
      {isFull ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}
    </button>
  );
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

  const palette = useCommandPalette([
    { id: 'today', label: "Today's jobs", run: () => ask("what's scheduled today") },
    { id: 'attention', label: 'Needs attention', run: () => ask('what needs my attention') },
    { id: 'revenue', label: 'Revenue today', run: () => ask("how much revenue have we made today") },
    { id: 'leads', label: 'Show leads', run: () => ask('show me recent leads') },
    { id: 'followup', label: 'Who needs follow-up', run: () => ask('who needs follow-up') },
    { id: 'unpaid', label: 'Unpaid invoices', run: () => ask("what's unpaid") },
    { id: 'takehome', label: 'Take-home this week', run: () => ask('what did I actually take home this week') },
    { id: 'refresh', label: 'Refresh dashboard', run: () => loadSummary() },
  ]);

  if (loading && !summary) {
    return (
      <div className={PAGE}>
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-40 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="h-3 w-12 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`${PANEL} ${PANEL_PADDING} space-y-2`}>
              <div className="h-2 w-16 bg-white/5 rounded animate-pulse" />
              <div className="h-7 w-12 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className={`${PANEL} ${PANEL_PADDING} lg:col-span-2 h-32 animate-pulse`} />
          <div className={`${PANEL} ${PANEL_PADDING} h-32 animate-pulse`} />
        </div>
        <div className={`${PANEL} ${PANEL_PADDING} h-24 animate-pulse`} />
      </div>
    );
  }
  if (error && !summary) {
    return (
      <div className={PAGE + ' text-center py-12'}>
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
    <div className={PAGE}>
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={palette.commands} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#52616D]">GID Garage</div>
          <div className="text-lg font-bold text-[#F5F8FA] tracking-tight">Command Center</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => palette.setOpen(true)} className="hidden sm:flex items-center gap-1.5 text-[10px] text-[#52616D] hover:text-[#8899A6] border border-white/10 rounded px-2 py-1">
            <span>Ctrl</span><span className="opacity-50">+</span><span>K</span>
          </button>
          <FullscreenToggle />
          <LiveClock />
          <button onClick={loadSummary} className="text-[#52616D] hover:text-[#8899A6] text-[11px] uppercase tracking-wide">↻ Refresh</button>
        </div>
      </div>

      {/* ── Business state first (section 34 priority order) ─────────── */}
      <BusinessMetrics today={summary.today} />

      {/* ── Needs Attention + Jarvis Core — denser 12-col band ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          <AttentionPanel items={summary.needsAttention} />
        </div>
        <div className={`lg:col-span-3 ${PANEL} ${PANEL_PADDING} flex items-center justify-center`}>
          <JarvisStatus state={jarvisState} liveActivity={liveActivity} size={230} />
        </div>
        <div className="lg:col-span-4">
          <UpcomingJobs scheduleBar={summary.scheduleBar} />
        </div>
      </div>

      {/* ── Command input — central to the interface, not buried ─────── */}
      <CommandInput chatMessages={chatMessages} asking={asking} liveActivity={liveActivity} onAsk={ask} onClear={clear} />

      {/* ── Upcoming jobs (real list) + Leads + Marketing — 12-col body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          <UpcomingJobsList jobs={summary.upcomingJobs} />
        </div>
        <div className="lg:col-span-4">
          <LeadPipeline
            leadsSummary={summary.leadsSummary}
            leads={leads}
            leadsLoading={leadsLoading}
            leadStatusFilter={leadStatusFilter}
            onFilterChange={s => { setLeadStatusFilter(s); loadLeads(s || undefined); }}
            onStatusChange={updateLeadStatus}
          />
        </div>
        <div className="lg:col-span-3">
          <MarketingPanel marketingFunnel={summary.marketingFunnel} onAddSpend={submitSpend} />
        </div>
      </div>
    </div>
  );
}
