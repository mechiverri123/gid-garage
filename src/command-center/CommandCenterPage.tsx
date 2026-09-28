// ── GID GARAGE — COMMAND CENTER ───────────────────────────────────────────
// App shell (sidebar + command bar + page) with two modes that share one
// design system (./ui): the ops dashboard and SEO Mode.
//
// Backends (unchanged contracts):
//   admin-api-data.js  — get-command-center-summary (+ redesign extras),
//                         list-leads, patch-lead, upsert-lead, add-marketing-spend
//   admin-ai-chat.js   — streamed NDJSON agent (tool_call/tool_result/data/final)
//   jarvis-livekit-token.js — realtime voice
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lead, NeedsAttentionItem, JarvisState } from './types';
import { useBusinessSummary } from './hooks/useBusinessSummary';
import { useAdminAI } from './hooks/useAdminAI';
import { useLiveKitJarvis, type RealtimeVoiceState } from './hooks/useLiveKitJarvis';
import { RealtimeVoiceControl } from './components/RealtimeVoiceControl';
import { JobDetailPanel } from './components/JobDetailPanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { LeadPipeline } from './components/LeadPipeline';
import { MarketingPanel } from './components/MarketingPanel';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { CommandInput } from './components/CommandInput';
import { SeoMode } from './seo/SeoMode';
import type { SeoView } from './seo/seoTypes';
import { applyUiEvent, INITIAL_UI_MODE, type UiModeEvent } from './seo/uiMode';
import { AppSidebar, type NavTarget } from './shell/AppSidebar';
import { CommandTopBar } from './shell/CommandTopBar';
import { KpiStrip, TodaysJobs, AttentionCard } from './dashboard/TodaySections';
import { TodayRoute } from './dashboard/TodayRoute';
import { JarvisPanel } from './dashboard/JarvisPanel';
import { QuickActionHero, ThisMonth, LeadsBySource, RecentActivity, UpcomingJobsTable, RevenueTrend, QuickCommandTiles } from './dashboard/BusinessSections';
import { Skeleton, ErrorState } from './ui/primitives';
import type { OrbState } from './ui/JarvisOrb';
import { C } from './ui/theme';
import './ui/command-center.css';

// Real state only: the typed agent's stream wins while it's working,
// otherwise the realtime voice session's state.
export function orbStateFor(asking: boolean, jarvisState: JarvisState, voice: RealtimeVoiceState): OrbState {
  const fromAgent: Record<JarvisState, OrbState> = { idle: 'idle', processing: 'thinking', tool: 'working', success: 'complete', error: 'error' };
  if (asking) return fromAgent[jarvisState];
  if (voice === 'connecting') return 'thinking';
  if (voice === 'listening') return 'listening';
  if (voice === 'speaking') return 'working';
  if (voice === 'error') return 'error';
  return fromAgent[jarvisState];
}
const VOICE_LABEL: Record<RealtimeVoiceState, string> = { off: 'off', connecting: 'connecting…', listening: 'listening', speaking: 'speaking', error: 'error' };

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the command center">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[148px]" />)}</div>
      <div className="grid gap-4 xl:grid-cols-12"><Skeleton className="h-[420px] xl:col-span-4" /><Skeleton className="h-[420px] xl:col-span-8" /></div>
      <div className="grid gap-4 xl:grid-cols-12"><Skeleton className="h-[320px] xl:col-span-8" /><Skeleton className="h-[320px] xl:col-span-4" /></div>
    </div>
  );
}

export function CommandCenterPage({ onLock }: { onLock: () => void }) {
  const {
    summary, loading, error, loadSummary,
    leads, leadsLoading, leadStatusFilter, setLeadStatusFilter, loadLeads,
    updateLeadStatus, submitSpend,
  } = useBusinessSummary();

  const voice = useLiveKitJarvis();

  // Ops (default) vs SEO Mode. SEO answers from Jarvis switch modes and bring
  // the relevant panel into focus (structured ui_focus events).
  const [ui, setUi] = useState(INITIAL_UI_MODE);
  const onUiEvent = useCallback((e: UiModeEvent) => setUi(s => applyUiEvent(s, e)), []);
  const setMode = useCallback((m: 'ops' | 'seo') => setUi(s => applyUiEvent(s, { type: 'manual', mode: m })), []);
  const setSeoFocus = useCallback((v: SeoView) => setUi(s => applyUiEvent(s, { type: 'ui_focus', mode: 'seo', target: v })), []);
  const { mode, seoFocus } = ui;

  const { chatMessages, asking, liveActivity, jarvisState, ask, clear } = useAdminAI(() => {
    loadSummary();
    loadLeads(leadStatusFilter || undefined);
  }, async (text) => {
    if (voice.connected) await voice.speakText(text);
  }, onUiEvent);

  // Voice actions change the same records as the typed agent: refresh quietly
  // while a realtime session is open.
  useEffect(() => {
    if (!voice.connected) return;
    const timer = window.setInterval(() => { loadSummary(); loadLeads(leadStatusFilter || undefined); }, 15000);
    return () => window.clearInterval(timer);
  }, [voice.connected, loadSummary, loadLeads, leadStatusFilter]);

  const orb = orbStateFor(asking, jarvisState, voice.state);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawer, setDrawer] = useState(false);
  const jarvisInput = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const askAndShow = useCallback((q: string) => {
    ask(q);
    if (mode === 'ops') scrollTo('cc-jarvis');
  }, [ask, mode]);

  const onGo = (t: NavTarget) => {
    if (t.kind === 'mode') { setMode(t.mode); main.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.kind === 'section') {
      if (mode !== 'ops') setMode('ops');
      scrollTo(t.id);
      if (t.id === 'cc-jarvis') window.setTimeout(() => jarvisInput.current?.focus(), 400);
    }
  };
  const openAttention = (a: NeedsAttentionItem) => {
    if (a.bookingId) { setSelectedJobId(a.bookingId); return; }
    const lead = a.leadId ? leads.find(l => l.id === a.leadId) : null;
    if (lead) { setSelectedLead(lead); return; }
    askAndShow(a.type === 'missed_call' ? `Who called from ${a.label} and did we call them back?` : `Tell me about ${a.label}`);
  };

  const palette = useCommandPalette([
    { id: 'today', label: "Today's jobs", run: () => askAndShow("what's scheduled today") },
    { id: 'attention', label: 'Needs attention', run: () => askAndShow('what needs my attention') },
    { id: 'revenue', label: 'Revenue today', run: () => askAndShow('how much revenue have we made today') },
    { id: 'leads', label: 'Show leads', run: () => askAndShow('show me recent leads') },
    { id: 'followup', label: 'Who needs follow-up', run: () => askAndShow('who needs follow-up') },
    { id: 'unpaid', label: 'Unpaid invoices', run: () => askAndShow("what's unpaid") },
    { id: 'takehome', label: 'Take-home this week', run: () => askAndShow('what did I actually take home this week') },
    { id: 'seo', label: 'SEO Mode (local search)', run: () => setMode('seo') },
    { id: 'seo-brief', label: 'How is local search doing?', run: () => ask('How is my local SEO doing this month?') },
    { id: 'refresh', label: 'Refresh dashboard', run: () => loadSummary() },
  ]);

  const voiceControl = <RealtimeVoiceControl state={voice.state} error={voice.error} diagnostics={voice.diagnostics} onToggle={voice.toggle} onTestVoice={voice.testVoice} />;
  const title = mode === 'seo' ? 'Local Search Command Center' : 'Command Center';

  return (
    <div className="cc-root cc-grid-bg flex h-screen overflow-hidden">
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={palette.commands} />
      <JobDetailPanel jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <AppSidebar active={mode === 'seo' ? 'seo' : 'dashboard'} onGo={onGo} onLock={onLock} systemOk={!error} voiceLabel={VOICE_LABEL[voice.state]} drawerOpen={drawer} onCloseDrawer={() => setDrawer(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <CommandTopBar title={title} attention={summary?.needsAttention ?? []} onSearch={q => askAndShow(`Find jobs, customers or vehicles matching "${q}"`)}
          onOpenMenu={() => setDrawer(true)} onRefresh={loadSummary} onLock={onLock} onAttention={openAttention} refreshing={loading} />

        <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 xl:px-8 py-5 flex flex-col gap-4 sm:gap-5">
            {error && !summary && <ErrorState message={`Couldn't load the dashboard: ${error}`} onRetry={loadSummary} />}
            {mode === 'seo' ? (
              <SeoMode focus={seoFocus} onFocus={setSeoFocus} orb={orb} />
            ) : !summary ? (
              loading ? <DashboardSkeleton /> : null
            ) : (<>
              {error && <ErrorState message={`Showing the last loaded data — refresh failed: ${error}`} onRetry={loadSummary} />}
              <KpiStrip summary={summary} />

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-12 items-stretch">
                <div className="xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 sm:gap-5 min-w-0">
                  <TodaysJobs summary={summary} onSelectJob={setSelectedJobId} />
                  <AttentionCard items={summary.needsAttention} onOpen={openAttention} />
                </div>
                <div className="xl:col-span-8 2xl:col-span-5 min-w-0"><TodayRoute summary={summary} onSelectJob={setSelectedJobId} /></div>
                <div className="xl:col-span-12 2xl:col-span-4 min-w-0">
                  <JarvisPanel summary={summary} state={orb} asking={asking} liveActivity={liveActivity} messages={chatMessages} onAsk={ask} onClear={clear} voiceControl={voiceControl} inputRef={jarvisInput} />
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-4 min-w-0"><QuickActionHero onLeadSaved={() => { loadSummary(); loadLeads(leadStatusFilter || undefined); }} /></div>
                <div className="xl:col-span-5 min-w-0"><ThisMonth summary={summary} /></div>
                <div className="lg:col-span-2 xl:col-span-3 min-w-0"><LeadsBySource summary={summary} /></div>
              </div>

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-12 items-start">
                <div className="xl:col-span-8 min-w-0"><UpcomingJobsTable jobs={summary.upcomingJobs} onSelect={setSelectedJobId} /></div>
                <div className="xl:col-span-4 min-w-0"><RecentActivity summary={summary} /></div>
              </div>

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-12">
                <div className="xl:col-span-8 min-w-0"><RevenueTrend summary={summary} /></div>
                <div className="xl:col-span-4 min-w-0"><QuickCommandTiles onAsk={askAndShow} /></div>
              </div>

              <div id="cc-marketing" className="grid gap-4 sm:gap-5 xl:grid-cols-12 scroll-mt-4">
                <div className="xl:col-span-7 min-w-0">
                  <LeadPipeline leadsSummary={summary.leadsSummary} leads={leads} leadsLoading={leadsLoading} leadStatusFilter={leadStatusFilter}
                    onFilterChange={s => { setLeadStatusFilter(s); loadLeads(s || undefined); }} onStatusChange={updateLeadStatus} onSelect={setSelectedLead} />
                </div>
                <div className="xl:col-span-5 min-w-0"><MarketingPanel marketingFunnel={summary.marketingFunnel} onAddSpend={submitSpend} /></div>
              </div>
            </>)}
          </div>
        </main>

        {/* SEO Mode keeps Jarvis one keystroke away at the bottom; the dashboard has its own Jarvis panel. */}
        {mode === 'seo' && (
          <div className="border-t px-4 sm:px-6 lg:px-8 py-3" style={{ borderColor: C.border, background: 'rgba(5,13,21,0.9)', backdropFilter: 'blur(16px)' }}>
            <CommandInput chatMessages={chatMessages} asking={asking} liveActivity={liveActivity} onAsk={ask} onClear={clear} />
          </div>
        )}
      </div>
    </div>
  );
}
