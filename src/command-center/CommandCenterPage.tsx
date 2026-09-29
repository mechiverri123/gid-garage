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

import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Lead, NeedsAttentionItem, JarvisState } from './types';
import { useBusinessSummary } from './hooks/useBusinessSummary';
import { useAdminAI } from './hooks/useAdminAI';
import { useLiveKitJarvis, type RealtimeVoiceState } from './hooks/useLiveKitJarvis';
import { useDirectVoice } from './voice/useDirectVoice';
import { useWakeWord, WakeWordToggle } from './voice/wakeWord';

// Voice engine: 'direct' (default) = browser <-> Deepgram STT / Cartesia TTS with
// Claude via admin-ai-chat.js. 'livekit' = the legacy LiveKit agent, kept only
// as a rollback (set VITE_JARVIS_VOICE=livekit and redeploy). Never both.
const VOICE_MODE: 'direct' | 'livekit' = import.meta.env.VITE_JARVIS_VOICE === 'livekit' ? 'livekit' : 'direct';
const WAKE_SLEEP_MS = 45_000; // a wake-word session sleeps after this long with no new request
import { RealtimeVoiceControl } from './components/RealtimeVoiceControl';
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
import { workspaceReduce, parseLocalCommand, describeScreen, workspaceTop, isScreenFollowUp, INITIAL_WORKSPACE } from '../../shared/jarvis-workspace.js';
import { phoenixYmd } from '../../shared/business-metrics.js';
import { jobMeta, revenuePrefetch, feedPrefetch } from './workspace/jobMeta';

// Jobs, calendar, revenue and lists open here, over the dashboard (never /admin).
const JarvisWorkspace = lazy(() => import('./workspace/JarvisWorkspace'));

type WsAction = { type: string; [k: string]: unknown };
const TAB_WORD: Record<string, string> = { overview: 'Overview', estimate: 'Estimate', payment: 'Payment', inspection: 'Inspection', notes: 'Notes', parts: 'Parts' };
// Short JARVIS-style acknowledgement for a screen command handled on the page
// (shown in the transcript; spoken when the command came by voice).
let ackTurn = 0;
const pick = (...options: string[]) => options[ackTurn++ % options.length];
const STATUS_WORD: Record<string, string> = { all: 'all jobs', active: 'active jobs', unpaid: 'unpaid jobs', PAID: 'paid jobs', CANCELLED: 'cancelled jobs', BOOKED: 'booked jobs', ESTIMATE_SENT: 'estimates sent', SIGNED: 'signed jobs', IN_PROGRESS: 'jobs in progress', COMPLETED: 'completed jobs', INVOICED: 'invoiced jobs' };
function ackFor(a: WsAction) {
  if (a.type === 'noop') return `${String(a.reply || 'Nothing to do').replace(/\.$/, '')}, sir.`;
  if (a.type === 'close') return pick('Very good, sir.', 'As you wish.', 'Of course, sir.');
  if (a.type === 'close_all') return pick('Cleared, sir.', 'Very good, sir.');
  if (a.type === 'home') return pick('Welcome back, sir.', 'Back to the main screen, sir.');
  if (a.type === 'mode') return a.mode === 'seo' ? 'Local search, sir.' : 'The command center, sir.';
  if (a.type === 'tab') return `The ${TAB_WORD[String(a.tab)]?.toLowerCase() ?? 'details'}, sir.`;
  if (a.type === 'focus') return a.tab ? `The ${String(a.tab)}, sir.` : pick('Right away, sir.', 'Here it is, sir.');
  if (a.type === 'step') return pick('Next one, sir.', 'Here you are, sir.');
  if (a.type === 'open') {
    const v = (a.view as { type?: string; status?: string }) || {};
    return v.type === 'calendar' ? 'Your calendar, sir.' : v.type === 'jobList' ? (v.status === 'all' ? 'All jobs, sir.' : 'Your jobs, sir.') : v.type === 'customers' ? 'Your customers, sir.' : v.type === 'settings' ? 'Settings, sir.' : v.type === 'newJob' ? 'A new job, sir.' : 'Right away, sir.';
  }
  if (a.type === 'range') { const r = a.range as Record<string, unknown>; return r.last_days ? `The last ${r.last_days} days, sir.` : r.last_months ? `The last ${r.last_months} months, sir.` : 'Very good, sir.'; }
  if (a.type === 'calendar') return a.mode && !a.date ? `${String(a.mode).replace(/^./, c => c.toUpperCase())} view, sir.` : 'Very good, sir.';
  if (a.type === 'filter') return typeof a.query === 'string' ? (a.query ? `Searching for ${a.query}, sir.` : 'Search cleared, sir.') : `Showing ${STATUS_WORD[String(a.status)] ?? 'those jobs'}, sir.`;
  return 'Done, sir.';
}

// Real state only: the typed agent's stream wins while it's working,
// otherwise the realtime voice session's state.
export function orbStateFor(asking: boolean, jarvisState: JarvisState, voice: RealtimeVoiceState): OrbState {
  const fromAgent: Record<JarvisState, OrbState> = { idle: 'idle', processing: 'thinking', tool: 'working', success: 'complete', error: 'error' };
  if (asking) return fromAgent[jarvisState];
  if (voice === 'connecting' || voice === 'thinking') return 'thinking';
  if (voice === 'listening' || voice === 'interrupted') return 'listening';
  if (voice === 'speaking') return 'working';
  if (voice === 'error') return 'error';
  return fromAgent[jarvisState];
}
const VOICE_LABEL: Record<RealtimeVoiceState, string> = { off: 'off', connecting: 'connecting…', listening: 'listening', thinking: 'thinking', speaking: 'speaking', interrupted: 'listening', unavailable: 'unavailable', error: 'error' };

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

  // Visual workspace (shared/jarvis-workspace.js): one stack of views that Jarvis,
  // the sidebar and on-screen commands all drive.
  const [ws, dispatchWs] = useReducer(workspaceReduce, INITIAL_WORKSPACE);
  const wsRef = useRef(ws);
  const modeRef = useRef<'ops' | 'seo'>('ops');
  wsRef.current = ws;
  const screenMeta = () => { const t = workspaceTop(wsRef.current); return t?.type === 'jobs' ? t.jobIds.map((id: string) => jobMeta.get(id) ?? { label: '', date: '' }) : []; };
  const openView = useCallback((view: Record<string, unknown>) => dispatchWs({ type: 'open', view }), []);
  const openJob = useCallback((id: string) => dispatchWs({ type: 'open', view: { type: 'jobs', jobIds: [id] } }), []);
  // A view opened by Jarvis (chat `ui` event or voice gid.ui). Revenue actions
  // carry the numbers Jarvis just quoted, so the chart shows them instantly.
  const applyScreenAction = (action: unknown) => {
    const a = action as WsAction;
    if (!a || typeof a.type !== 'string') return;
    const range = (a.view as { range?: { from?: string; to?: string } } | undefined)?.range;
    if (a.data && range?.from && range?.to) revenuePrefetch.set(`${range.from}|${range.to}`, a.data);
    const vt = (a.view as { type?: string } | undefined)?.type;
    if (a.data && vt && ['brief', 'reviews', 'social', 'mail', 'messages', 'leads'].includes(vt)) feedPrefetch.set(vt, a.data);
    dispatchWs(a);
  };
  const screenHooks = useMemo(() => ({
    // What's open, plus which page (SEO vs command center) the owner is on.
    getScreen: () => { const d = describeScreen(wsRef.current, screenMeta()); return d ? { ...d, pageMode: modeRef.current } : { view: 'none', pageMode: modeRef.current }; },
    onWorkspace: (action: unknown) => applyScreenAction(action),
  }), []);

  // Spoken on-screen commands ("close jobs", "show payment") via the voice transcript.
  const askRef = useRef<((q: string, o?: { speak?: boolean }) => void) | null>(null);
  const applyLocalRef = useRef<((a: WsAction, q: string) => void) | null>(null);
  const utteranceRef = useRef<((text: string) => void) | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const livekit = useLiveKitJarvis(text => {
    const local = parseLocalCommand(text, wsRef.current, { meta: screenMeta(), today: phoenixYmd(new Date()) });
    if (local && local.type !== 'noop') { applyLocalRef.current?.(local, text); markHandledRef.current?.(text); }
    else if (!local && isScreenFollowUp(text, wsRef.current)) {
      // Typed Jarvis answers it (with the screen) and that answer is spoken;
      // the voice agent stays quiet, so there's one reply and one LLM call.
      markHandledRef.current?.(text);
      askRef.current?.(text);
    }
  }, applyScreenAction);
  // Direct voice: every final utterance enters the same command path as typing.
  const direct = useDirectVoice({ onUtterance: text => utteranceRef.current?.(text), onBargeIn: () => abortRef.current?.() });
  const voice = VOICE_MODE === 'direct' ? direct : livekit;

  // "Jarvis" wake word (voice/wakeWord.tsx, free): the browser listens for the
  // word only; the paid voice session starts when it hears it and goes back to
  // sleep after WAKE_SLEEP_MS without a new request.
  const [wakeOn, setWakeOn] = useState(() => { try { return localStorage.getItem('jv-wake') === '1'; } catch { return false; } });
  const setWake = (v: boolean) => { setWakeOn(v); try { localStorage.setItem('jv-wake', v ? '1' : '0'); } catch { /* private mode */ } };
  const wakeSession = useRef(false);
  const disconnectVoice = direct.disconnect; // stable (useCallback); `direct` itself is new every render
  const voiceLive = direct.state !== 'off' && direct.state !== 'error' && direct.state !== 'unavailable';
  const wake = useWakeWord({
    enabled: wakeOn && VOICE_MODE === 'direct',
    paused: voiceLive,
    onWake: async command => {
      wakeSession.current = true;
      await direct.connect();
      if (!direct.isActive()) return;
      if (command) utteranceRef.current?.(command);
      else void direct.speak('Yes, sir?');
    },
  });
  useEffect(() => {
    if (!voiceLive) { wakeSession.current = false; return; }
    if (!wakeSession.current || direct.state !== 'listening') return;
    const t = window.setTimeout(() => { if (wakeSession.current) void disconnectVoice(); }, WAKE_SLEEP_MS);
    return () => window.clearTimeout(t);
  }, [direct.state, voiceLive, disconnectVoice]);
  const markHandledRef = useRef<((t: string) => void) | null>(null);
  markHandledRef.current = livekit.markHandled;

  // Ops (default) vs SEO Mode. SEO answers from Jarvis switch modes and bring
  // the relevant panel into focus (structured ui_focus events).
  const [ui, setUi] = useState(INITIAL_UI_MODE);
  const onUiEvent = useCallback((e: UiModeEvent) => setUi(s => applyUiEvent(s, e)), []);
  const setMode = useCallback((m: 'ops' | 'seo') => setUi(s => applyUiEvent(s, { type: 'manual', mode: m })), []);
  const setSeoFocus = useCallback((v: SeoView) => setUi(s => applyUiEvent(s, { type: 'ui_focus', mode: 'seo', target: v })), []);
  const { mode, seoFocus } = ui;
  modeRef.current = mode;

  const { chatMessages, asking, liveActivity, jarvisState, ask, abort, clear, addLocal } = useAdminAI(() => {
    loadSummary();
    loadLeads(leadStatusFilter || undefined);
  }, async (text) => {
    if (voice.connected) await voice.speakText(text);
  }, onUiEvent, screenHooks);

  askRef.current = ask;
  abortRef.current = abort;
  const askingRef = useRef(false);
  askingRef.current = asking;

  // Every typed command: things about what's on screen are handled instantly
  // here (deterministic parser); everything else goes to Jarvis with the
  // screen context so it can answer with a view.
  // Page-level screen actions: modes ("switch to SEO", "back to Jarvis") plus
  // everything the workspace reducer handles.
  const applyLocal = (local: WsAction, q: string) => {
    if (local.type === 'mode') { dispatchWs({ type: 'close_all' }); setMode(local.mode as 'ops' | 'seo'); } // the new mode is what you see
    else if (local.type === 'home') { dispatchWs({ type: 'close_all' }); setMode('ops'); }
    else if (local.type !== 'noop') dispatchWs(local);
    addLocal(q, ackFor(local));
  };
  applyLocalRef.current = applyLocal;
  const command = useCallback((q: string) => {
    const local = parseLocalCommand(q, wsRef.current, { meta: screenMeta(), today: phoenixYmd(new Date()) });
    if (local) { applyLocalRef.current?.(local, q); return; }
    ask(q);
  }, [ask]);

  // Dev-only test hook: inject a final spoken sentence (what Deepgram delivers)
  // so the voice -> command path can be regression-tested without a microphone.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __jarvisVoiceUtterance?: (t: string) => void }).__jarvisVoiceUtterance = t => utteranceRef.current?.(t);
  }, []);

  // A finished spoken sentence (direct voice). Screen commands run instantly
  // for free; anything else goes to Jarvis in voice mode, and its reply is
  // spoken sentence by sentence as it streams in.
  utteranceRef.current = (text: string) => {
    const local = parseLocalCommand(text, wsRef.current, { meta: screenMeta(), today: phoenixYmd(new Date()) });
    if (local) {
      applyLocal(local, text);
      direct.setThinking(false);
      // He always answers, even when the screen already shows it (a few characters of speech).
      void direct.speak(ackFor(local));
      return;
    }
    if (askingRef.current) { abort(); window.setTimeout(() => utteranceRef.current?.(text), 150); return; } // newest request wins
    void ask(text, {
      voice: true,
      speak: false,
      onSay: sentence => { void direct.speakChunk(sentence); },
      onFinal: e => {
        if (e.spoken) direct.endSpeech();
        else if (e.text) void direct.speak(e.text); // guard override, or a reply that wasn't streamed
        direct.setThinking(false);
      },
    });
  };

  // Browser Back closes the workspace one level instead of leaving /jarvis.
  const depth = ws.stack.length;
  const pushedDepth = useRef(0);
  // Our own history.go() after an in-page close also fires popstate; that one
  // must not close a second level (it sent a calendar job straight home).
  const selfPops = useRef(0);
  useEffect(() => {
    if (depth > pushedDepth.current) { for (let i = pushedDepth.current; i < depth; i++) window.history.pushState({ jarvisView: i + 1 }, ''); pushedDepth.current = depth; }
    else if (depth < pushedDepth.current) { const n = pushedDepth.current - depth; pushedDepth.current = depth; selfPops.current += 1; window.history.go(-n); }
  }, [depth]);
  useEffect(() => {
    const onPop = () => {
      if (selfPops.current > 0) { selfPops.current -= 1; return; }
      if (pushedDepth.current > 0 && wsRef.current.stack.length === pushedDepth.current) { pushedDepth.current -= 1; dispatchWs({ type: 'close' }); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const lastReply = [...chatMessages].reverse().find(m => m.role === 'assistant')?.content ?? null;

  // Voice actions change the same records as the typed agent: refresh quietly
  // while a realtime session is open.
  useEffect(() => {
    if (!voice.connected) return;
    const timer = window.setInterval(() => { loadSummary(); loadLeads(leadStatusFilter || undefined); }, 15000);
    return () => window.clearInterval(timer);
  }, [voice.connected, loadSummary, loadLeads, leadStatusFilter]);

  const orb = orbStateFor(asking, jarvisState, voice.state);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawer, setDrawer] = useState(false);
  const jarvisInput = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const askAndShow = useCallback((q: string) => {
    command(q);
    if (mode === 'ops' && !wsRef.current.stack.length) scrollTo('cc-jarvis');
  }, [command, mode]);

  const onGo = (t: NavTarget) => {
    if (t.kind === 'view') { dispatchWs({ type: 'close_all' }); openView(t.view); return; }
    if (wsRef.current.stack.length) dispatchWs({ type: 'close_all' });
    if (t.kind === 'mode') { setMode(t.mode); main.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.kind === 'section') {
      if (mode !== 'ops') setMode('ops');
      scrollTo(t.id);
      if (t.id === 'cc-jarvis') window.setTimeout(() => jarvisInput.current?.focus(), 400);
    }
  };
  const openAttention = (a: NeedsAttentionItem) => {
    if (a.bookingId) { openJob(a.bookingId); return; }
    const lead = a.leadId ? leads.find(l => l.id === a.leadId) : null;
    if (lead) { setSelectedLead(lead); return; }
    askAndShow(a.type === 'missed_call' ? `Who called from ${a.label} and did we call them back?` : `Tell me about ${a.label}`);
  };

  const palette = useCommandPalette([
    { id: 'today', label: "Today's jobs", run: () => askAndShow("what's scheduled today") },
    { id: 'calendar', label: 'Open calendar', run: () => openView({ type: 'calendar', mode: 'week' }) },
    { id: 'jobs', label: 'All jobs', run: () => openView({ type: 'jobList', status: 'active' }) },
    { id: 'customers', label: 'Customers', run: () => openView({ type: 'customers' }) },
    { id: 'revenue-month', label: 'Revenue this month', run: () => openView({ type: 'analytics', range: { period: 'this_month' } }) },
    { id: 'attention', label: 'Needs attention', run: () => askAndShow('what needs my attention') },
    { id: 'revenue', label: 'Revenue today', run: () => askAndShow('how much revenue have we made today') },
    { id: 'leads', label: 'Show leads', run: () => askAndShow('show me recent leads') },
    { id: 'followup', label: 'Who needs follow-up', run: () => askAndShow('who needs follow-up') },
    { id: 'unpaid', label: 'Unpaid invoices', run: () => askAndShow("what's unpaid") },
    { id: 'takehome', label: 'Take-home this week', run: () => askAndShow('what did I actually take home this week') },
    { id: 'seo', label: 'SEO Mode (local search)', run: () => setMode('seo') },
    { id: 'seo-brief', label: 'How is local search doing?', run: () => ask('How is my local SEO doing this month?') },
    { id: 'brief', label: 'Daily brief', run: () => openView({ type: 'brief' }) },
    { id: 'reviews', label: 'Google reviews', run: () => openView({ type: 'reviews' }) },
    { id: 'social', label: 'Facebook & Instagram', run: () => openView({ type: 'social' }) },
    { id: 'mail', label: 'Email inbox', run: () => openView({ type: 'mail' }) },
    { id: 'leads-view', label: 'Leads (reply on Messenger)', run: () => openView({ type: 'leads' }) },
    { id: 'messages', label: 'Facebook messages', run: () => openView({ type: 'messages' }) },
    { id: 'refresh', label: 'Refresh dashboard', run: () => loadSummary() },
  ]);

  const voiceControl = <div className="flex flex-col gap-2">
    <RealtimeVoiceControl mode={VOICE_MODE} state={voice.state} error={voice.error} diagnostics={voice.diagnostics} onToggle={() => { wakeSession.current = false; voice.toggle(); }} onTestVoice={voice.testVoice}
      partial={VOICE_MODE === 'direct' ? direct.partial : ''} note={VOICE_MODE === 'direct' ? direct.budgetNote : null} />
    {VOICE_MODE === 'direct' && <WakeWordToggle on={wakeOn} onChange={setWake} supported={wake.supported} listening={wake.listening} error={wake.error} />}
  </div>;
  const title = mode === 'seo' ? 'Local Search Command Center' : 'Command Center';

  return (
    <div className="cc-root cc-grid-bg flex h-screen overflow-hidden">
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={palette.commands} />
      <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
      {ws.stack.length > 0 && (
        <Suspense fallback={<div className="jv-overlay fixed inset-0 z-40" style={{ background: 'rgba(2,7,12,0.86)' }} />}>
          <JarvisWorkspace state={ws} dispatch={dispatchWs} onAsk={command} asking={asking} reply={lastReply} />
        </Suspense>
      )}

      <AppSidebar active={mode === 'seo' ? 'seo' : 'dashboard'} onGo={onGo} onLock={onLock} systemOk={!error} voiceLabel={VOICE_LABEL[voice.state]} drawerOpen={drawer} onCloseDrawer={() => setDrawer(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <CommandTopBar title={title} attention={summary?.needsAttention ?? []} onSearch={q => openView({ type: 'jobList', query: q, status: 'all' })}
          onOpenMenu={() => setDrawer(true)} onSettings={() => openView({ type: 'settings' })} onRefresh={loadSummary} onLock={onLock} onAttention={openAttention} refreshing={loading} />

        <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 xl:px-8 py-5 flex flex-col gap-4 sm:gap-5">
            {error && !summary && <ErrorState message={`Couldn't load the dashboard: ${error}`} onRetry={loadSummary} />}
            {mode === 'seo' ? (
              <SeoMode focus={seoFocus} onFocus={setSeoFocus} orb={orb} onOpenReviews={() => openView({ type: 'reviews' })} />
            ) : !summary ? (
              loading ? <DashboardSkeleton /> : null
            ) : (<>
              {error && <ErrorState message={`Showing the last loaded data — refresh failed: ${error}`} onRetry={loadSummary} />}
              <KpiStrip summary={summary} />

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-12 items-stretch">
                <div className="xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 sm:gap-5 min-w-0">
                  <TodaysJobs summary={summary} onSelectJob={openJob} />
                  <AttentionCard items={summary.needsAttention} onOpen={openAttention} />
                </div>
                <div className="xl:col-span-8 2xl:col-span-5 min-w-0"><TodayRoute summary={summary} onSelectJob={openJob} /></div>
                <div className="xl:col-span-12 2xl:col-span-4 min-w-0">
                  <JarvisPanel summary={summary} state={orb} asking={asking} liveActivity={liveActivity} messages={chatMessages} onAsk={command} onClear={clear} voiceControl={voiceControl} inputRef={jarvisInput} />
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-4 min-w-0"><QuickActionHero onLeadSaved={() => { loadSummary(); loadLeads(leadStatusFilter || undefined); }} onNewJob={() => openView({ type: 'newJob' })} onPickJob={() => openView({ type: 'jobList', status: 'active' })} onCustomers={() => openView({ type: 'customers' })} /></div>
                <div className="xl:col-span-5 min-w-0"><ThisMonth summary={summary} /></div>
                <div className="lg:col-span-2 xl:col-span-3 min-w-0"><LeadsBySource summary={summary} /></div>
              </div>

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-12 items-start">
                <div className="xl:col-span-8 min-w-0"><UpcomingJobsTable jobs={summary.upcomingJobs} onSelect={openJob} onCalendar={() => openView({ type: 'calendar', mode: 'week' })} /></div>
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
            <CommandInput chatMessages={chatMessages} asking={asking} liveActivity={liveActivity} onAsk={command} onClear={clear} />
          </div>
        )}
      </div>
    </div>
  );
}
