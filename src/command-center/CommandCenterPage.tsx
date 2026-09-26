// ── GID GARAGE — JARVIS COMMAND CENTER ───────────────────────────────────
// App-shell layout: left nav rail + top status bar + scrollable middle +
// persistent bottom Ask GID bar — a real operating-system composition
// (sidebar, header, content, footer all fixed in their own flex regions)
// rather than a single scrolling page of cards. Built with a flex-column
// h-screen shell + overflow-y-auto on the middle region only, which keeps
// the header/footer always visible without needing position:fixed (safer:
// no z-index/overlap juggling, no content-hidden-behind-fixed-bar risk).
//
// Talks to the same backends as before:
//   admin-api-data.js  — get-command-center-summary, list-leads, patch-lead,
//                         add-marketing-spend
//   admin-ai-chat.js   — streamed NDJSON agent (tool_call/tool_result/data/final)
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion } from 'motion/react';
import type { Lead } from './types';
import { useBusinessSummary } from './hooks/useBusinessSummary';
import { useAdminAI } from './hooks/useAdminAI';
import { Sidebar } from './components/Sidebar';
import { TopStatusBar } from './components/TopStatusBar';
import { JarvisStatus } from './components/JarvisStatus';
import { BusinessMetrics } from './components/BusinessMetrics';
import { AttentionPanel } from './components/AttentionPanel';
import { UpcomingJobsList } from './components/UpcomingJobsList';
import { JobDetailPanel } from './components/JobDetailPanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { LeadPipeline } from './components/LeadPipeline';
import { MarketingPanel } from './components/MarketingPanel';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { CommandInput } from './components/CommandInput';
import { PANEL, PANEL_PADDING, COLORS } from './tokens';

const fadeRise = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: (delay: number) => ({ opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, delay, ease: 'easeOut' as const } }),
};

export function CommandCenterPage({ onLock }: { onLock: () => void }) {
  const {
    summary, loading, error, loadSummary,
    leads, leadsLoading, leadStatusFilter, setLeadStatusFilter, loadLeads,
    updateLeadStatus, submitSpend,
  } = useBusinessSummary();

  const { chatMessages, asking, liveActivity, jarvisState, ask, clear } = useAdminAI(() => {
    loadSummary();
    loadLeads(leadStatusFilter || undefined);
  });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

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
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-[#52616D] text-sm animate-pulse">Loading command center…</div>
      </div>
    );
  }
  if (error && !summary) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="text-[#FF5353] text-sm mb-3">Failed to load: {error}</p>
          <p className="text-[#52616D] text-xs mb-4">
            If this is the first time loading this tab, make sure you've run <code className="text-[#8899A6]">gid_command_center_migration.sql</code> in the Supabase SQL editor.
          </p>
          <button onClick={loadSummary} className="border border-white/10 text-[#8899A6] hover:border-[#4FE8FF] hover:text-[#4FE8FF] text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded">Retry</button>
        </div>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={palette.commands} />
      <JobDetailPanel jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <Sidebar onLock={onLock} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopStatusBar onSearch={() => palette.setOpen(true)} onRefresh={loadSummary} streamOk={!error} />

        {/* ── Scrollable middle region ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
          {/* ── Three-zone hero: status | AI CORE (dominant) | attention ── */}
          <motion.div initial="hidden" animate="show" custom={0.05} variants={fadeRise} className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3">
              <BusinessMetrics today={summary.today} />
            </div>
            <div className={`lg:col-span-6 ${PANEL} ${PANEL_PADDING} flex flex-col items-center justify-center py-6 relative overflow-hidden`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] relative" style={{ color: COLORS.accent }}>GID GARAGE</div>
              <div className="text-[9px] uppercase tracking-[0.2em] mb-3 relative" style={{ color: COLORS.textFaint }}>AI Core</div>
              <JarvisStatus state={jarvisState} liveActivity={liveActivity} size={280} />
            </div>
            <div className="lg:col-span-3">
              <AttentionPanel items={summary.needsAttention} />
            </div>
          </motion.div>

          {/* ── Upcoming jobs — full-width timeline ───────────────────── */}
          <motion.div initial="hidden" animate="show" custom={0.15} variants={fadeRise}>
            <UpcomingJobsList jobs={summary.upcomingJobs} onSelect={setSelectedJobId} />
          </motion.div>

          {/* ── Leads + Marketing ──────────────────────────────────────── */}
          <motion.div id="marketing" initial="hidden" animate="show" custom={0.25} variants={fadeRise} className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-7">
              <LeadPipeline
                leadsSummary={summary.leadsSummary}
                leads={leads}
                leadsLoading={leadsLoading}
                leadStatusFilter={leadStatusFilter}
                onFilterChange={s => { setLeadStatusFilter(s); loadLeads(s || undefined); }}
                onStatusChange={updateLeadStatus}
                onSelect={setSelectedLead}
              />
            </div>
            <div className="lg:col-span-5">
              <MarketingPanel marketingFunnel={summary.marketingFunnel} onAddSpend={submitSpend} />
            </div>
          </motion.div>
        </div>

        {/* ── Persistent bottom Ask GID bar ────────────────────────────── */}
        <div className="border-t px-4 sm:px-6 lg:px-8 py-3" style={{ borderColor: COLORS.border, background: 'rgba(5,11,20,0.9)', backdropFilter: 'blur(16px)' }}>
          <CommandInput chatMessages={chatMessages} asking={asking} liveActivity={liveActivity} onAsk={ask} onClear={clear} />
        </div>
      </div>
    </div>
  );
}
