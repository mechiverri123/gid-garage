import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Lead } from './types';
import { useBusinessSummary } from './hooks/useBusinessSummary';
import { useAdminAI } from './hooks/useAdminAI';
import { useJarvisSpeech } from './hooks/useJarvisSpeech';
import { useJarvisListener } from './hooks/useJarvisListener';
import { Sidebar } from './components/Sidebar';
import { TopStatusBar } from './components/TopStatusBar';
import { JarvisStatus } from './components/JarvisStatus';
import { BusinessMetrics } from './components/BusinessMetrics';
import { AttentionPanel } from './components/AttentionPanel';
import { WeekSummary } from './components/WeekSummary';
import { QuickCommands } from './components/QuickCommands';
import { UpcomingJobsList } from './components/UpcomingJobsList';
import { LiveFeed } from './components/LiveFeed';
import { JobDetailPanel } from './components/JobDetailPanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { LeadPipeline } from './components/LeadPipeline';
import { MarketingPanel } from './components/MarketingPanel';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { CommandInput } from './components/CommandInput';
import { OwnerBriefing } from './components/OwnerBriefing';
import { VoiceControl } from './components/VoiceControl';
import { COLORS } from './tokens';

const fadeRise = {
  hidden: { opacity: 0, y: 16 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay, ease: 'easeOut' as const } }),
};

function HeroTelemetry({ liveActivity, asking }: { liveActivity: { tool: string; status: string }[]; asking: boolean }) {
  const current = liveActivity.find(i => i.status === 'running');
  const cells = [
    { label: 'Agent', value: asking ? 'Active' : 'Standby', color: asking ? COLORS.accent : COLORS.textMuted },
    { label: 'Stream', value: 'Ready', color: COLORS.success },
    { label: 'Tools', value: current ? current.tool.replace(/_/g, ' ') : 'Idle', color: current ? COLORS.accent : COLORS.textMuted },
    { label: 'Focus', value: current ? 'Processing' : 'Monitoring', color: current ? COLORS.warning : COLORS.textMuted },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 w-full max-w-[760px]">
      {cells.map(cell => (
        <div key={cell.label} className="rounded-xl border px-3 py-2 backdrop-blur-sm" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>{cell.label}</div>
          <div className="text-sm font-semibold mt-1 capitalize" style={{ color: cell.color }}>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

function greetingFor(summary: any) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const urgent = summary.needsAttention?.length
    ? `You have ${summary.needsAttention.length} item${summary.needsAttention.length === 1 ? '' : 's'} needing attention.`
    : 'Nothing urgent is waiting on you.';
  const jobs = summary.today?.jobCount ?? 0;
  const revenue = Number(summary.today?.revenue || 0);
  const leads = summary.today?.newLeads ?? 0;
  return `${hello}, Michael. GID Garage is online. You have ${jobs} job${jobs === 1 ? '' : 's'} today, ${revenue > 0 ? `$${revenue.toLocaleString()} in revenue` : 'no revenue posted yet'}, and ${leads} new lead${leads === 1 ? '' : 's'}. ${urgent} I'm standing by.`;
}

export function CommandCenterPage({ onLock }: { onLock: () => void }) {
  const {
    summary, loading, error, loadSummary,
    leads, leadsLoading, leadStatusFilter, setLeadStatusFilter, loadLeads,
    updateLeadStatus, submitSpend,
  } = useBusinessSummary();

  const voice = useJarvisSpeech();
  const handleAssistantFinal = useCallback((text: string) => {
    voice.speak(text);
  }, [voice.speak]);

  const { chatMessages, asking, liveActivity, jarvisState, ask, clear } = useAdminAI(() => {
    loadSummary();
    loadLeads(leadStatusFilter || undefined);
  }, handleAssistantFinal);

  const handleVoiceCommand = useCallback((command: string) => {
    voice.stop();
    ask(command);
  }, [ask, voice.stop]);

  const hearing = useJarvisListener({
    onCommand: handleVoiceCommand,
    suspended: voice.speaking || asking,
  });

  const displayJarvisState = voice.speaking ? 'speaking' as const : jarvisState;
  const greetedRef = useRef(false);

  useEffect(() => {
    if (!summary || greetedRef.current || !voice.enabled) return;
    greetedRef.current = true;
    const timer = window.setTimeout(() => {
      void voice.speakStartup(greetingFor(summary));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [summary, voice.enabled, voice.speakStartup]);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const palette = useCommandPalette([
    { id: 'today', label: "Today's jobs", run: () => ask("what's scheduled today") },
    { id: 'attention', label: 'Needs attention', run: () => ask('what needs my attention') },
    { id: 'revenue', label: 'Revenue today', run: () => ask('how much revenue have we made today') },
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
    <div className="flex h-screen overflow-hidden" style={{ background: `radial-gradient(circle at top, rgba(24,76,108,0.18), transparent 32%), linear-gradient(180deg, ${COLORS.bg1} 0%, ${COLORS.bg0} 100%)` }}>
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={palette.commands} />
      <JobDetailPanel jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <Sidebar onLock={onLock} />

      <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(84,231,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(84,231,255,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.25))',
        }} />
        <div className="absolute inset-x-0 top-0 h-52 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(84,231,255,0.07), transparent)' }} />

        <TopStatusBar onSearch={() => palette.setOpen(true)} onRefresh={loadSummary} streamOk={!error} />

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 relative">
          <div className="max-w-[1880px] mx-auto space-y-4 relative">
            <motion.div initial="hidden" animate="show" custom={0.01} variants={fadeRise}>
              <OwnerBriefing summary={summary} />
            </motion.div>

            <motion.div initial="hidden" animate="show" custom={0.05} variants={fadeRise} className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-3 space-y-4">
                <BusinessMetrics today={summary.today} />
                <WeekSummary leadsSummary={summary.leadsSummary} marketingFunnel={summary.marketingFunnel} />
              </div>

              <div className="xl:col-span-6 relative rounded-[28px] border px-5 md:px-6 py-5 overflow-hidden min-h-[560px] flex flex-col items-center justify-center"
                style={{
                  borderColor: 'rgba(84,231,255,0.22)',
                  background: 'linear-gradient(180deg, rgba(8,18,30,0.88) 0%, rgba(4,10,18,0.72) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 0 1px rgba(84,231,255,0.04), 0 20px 60px rgba(0,0,0,0.38)',
                }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(84,231,255,0.1), transparent 44%)' }} />
                <div className="absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.borderStrong}, transparent)` }} />
                <div className="absolute inset-y-[16%] left-1/2 w-px bg-white/[0.04]" />
                <div className="absolute inset-x-[16%] top-1/2 h-px bg-white/[0.04]" />
                <div className="absolute left-5 top-5 w-10 h-10 border-l border-t opacity-45" style={{ borderColor: COLORS.accent }} />
                <div className="absolute right-5 top-5 w-10 h-10 border-r border-t opacity-45" style={{ borderColor: COLORS.accent }} />
                <div className="absolute left-5 bottom-5 w-10 h-10 border-l border-b opacity-35" style={{ borderColor: COLORS.accentDim }} />
                <div className="absolute right-5 bottom-5 w-10 h-10 border-r border-b opacity-35" style={{ borderColor: COLORS.accentDim }} />
                <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.34em]" style={{ color: COLORS.accent }}>MICHAEL · GID GARAGE</div>
                  <div className="text-[9px] uppercase tracking-[0.22em] mt-1" style={{ color: COLORS.textFaint }}>Owner Copilot</div>
                </div>
                <div className="absolute top-5 right-5 z-20">
                  <VoiceControl
                    enabled={voice.enabled}
                    speaking={voice.speaking}
                    error={voice.error}
                    errorDetail={(voice as any).errorDetail}
                    needsInteraction={voice.needsInteraction}
                    onToggle={voice.toggleEnabled}
                    onStop={voice.stop}
                    onUnlock={voice.unlock}
                    onRetry={(voice as any).retry}
                    hearingEnabled={hearing.enabled}
                    hearingState={hearing.state}
                    hearingError={hearing.error}
                    onToggleHearing={hearing.toggle}
                  />
                </div>
                <JarvisStatus state={displayJarvisState} liveActivity={liveActivity} size={390} />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full flex justify-center px-5">
                  <HeroTelemetry liveActivity={liveActivity} asking={asking} />
                </div>
              </div>

              <div className="xl:col-span-3 space-y-4">
                <AttentionPanel items={summary.needsAttention} />
                <QuickCommands onRun={ask} />
              </div>
            </motion.div>

            <motion.div initial="hidden" animate="show" custom={0.12} variants={fadeRise} className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-7">
                <UpcomingJobsList jobs={summary.upcomingJobs} onSelect={setSelectedJobId} />
              </div>
              <div className="xl:col-span-5">
                <LiveFeed leads={leads} />
              </div>
            </motion.div>

            <motion.div initial="hidden" animate="show" custom={0.2} variants={fadeRise} className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-7">
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
              <div className="xl:col-span-5" id="marketing">
                <MarketingPanel marketingFunnel={summary.marketingFunnel} onAddSpend={submitSpend} />
              </div>
            </motion.div>
          </div>
        </div>

        <div className="relative border-t px-4 sm:px-6 lg:px-8 py-4" style={{ borderColor: COLORS.border, background: 'rgba(4,10,18,0.9)', backdropFilter: 'blur(20px)' }}>
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.borderStrong}, transparent)` }} />
          <CommandInput
            chatMessages={chatMessages}
            asking={asking}
            liveActivity={liveActivity}
            onAsk={ask}
            onClear={clear}
            hearingEnabled={hearing.enabled}
            hearingState={hearing.state}
            hearingError={hearing.error}
            onToggleHearing={hearing.toggle}
          />
        </div>
      </div>
    </div>
  );
}
