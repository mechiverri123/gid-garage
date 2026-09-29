// The Jarvis workspace overlay: renders the top view of the workspace stack
// (shared/jarvis-workspace.js) over the command center. Lazy-loaded, so the
// dashboard never downloads job/calendar/analytics code until Jarvis opens one.
// Esc or the browser Back button closes one level; the command bar keeps
// Jarvis (typed + follow-ups like "payment", "close") available on top.
import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, Briefcase, CalendarDays, BarChart3, Users, ChevronRight, Settings, Sunrise, Star, ThumbsUp, Mail } from 'lucide-react';
import { workspaceTop, type WorkspaceState } from '../../../shared/jarvis-workspace.js';
import { C } from '../ui/theme';
import { JobsView, type JobsViewState } from './JobsView';
import { AnalyticsView } from './AnalyticsView';
import { CalendarView } from './CalendarView';
import { JobListView, CustomersView } from './BrowseViews';
import { ExternalLeadModal, BusinessHub } from '../../JobOps';
import { useAllJobs, putJob } from './jobStore';
import { UsagePanel } from './UsagePanel';
import { BriefView, ReviewsView, SocialView, MailView } from './FeedViews';
import './workspace.css';

type View = { type: string; [k: string]: unknown };
type Dispatch = (a: { type: string; [k: string]: unknown }) => void;

const LABEL: Record<string, string> = { jobs: 'Jobs', analytics: 'Revenue', calendar: 'Calendar', jobList: 'All jobs', customers: 'Customers', newJob: 'New job', settings: 'Settings', brief: 'Daily brief', reviews: 'Google reviews', social: 'Facebook & Instagram', mail: 'Email' };
const ICON = { jobs: Briefcase, analytics: BarChart3, calendar: CalendarDays, jobList: Briefcase, customers: Users, newJob: Briefcase, settings: Settings, brief: Sunrise, reviews: Star, social: ThumbsUp, mail: Mail } as const;

// The admin "new job" wizard (contact → date → estimate), same code and writes,
// re-themed. The finished job opens right here.
function NewJob({ dispatch }: { dispatch: Dispatch }) {
  const { jobs } = useAllJobs();
  if (!jobs) return null;
  return (
    <div className="jv-skin jv-skin--drawer">
      <ExternalLeadModal jobs={jobs} onClose={() => dispatch({ type: 'close' })}
        onAdded={job => { putJob(job); dispatch({ type: 'close' }); dispatch({ type: 'open', view: { type: 'jobs', jobIds: [job.id] } }); }} />
    </div>
  );
}

export default function JarvisWorkspace({ state, dispatch, onAsk, asking, reply }: {
  state: WorkspaceState; dispatch: Dispatch; onAsk: (q: string) => void; asking: boolean; reply: string | null;
}) {
  const view = workspaceTop(state) as View | null;
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.jv-editor')) return; // the full editor closes first
      e.preventDefault(); dispatch({ type: 'close' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  if (!view) return null;
  const Icon = ICON[view.type as keyof typeof ICON] ?? Briefcase;
  const jobsTitle = view.type === 'jobs' ? ((view as unknown as JobsViewState).title || (Array.isArray(view.jobIds) && view.jobIds.length > 1 ? `${view.jobIds.length} jobs` : 'Job')) : null;

  const body = () => {
    switch (view.type) {
      case 'jobs': return <JobsView view={view as unknown as JobsViewState} dispatch={dispatch} />;
      case 'analytics': return <AnalyticsView range={view.range as Record<string, unknown>} dispatch={dispatch} />;
      case 'calendar': return <CalendarView date={(view.date as string) || null} mode={view.mode as 'day' | 'week' | 'month'} dispatch={dispatch} />;
      case 'jobList': return <JobListView query={String(view.query || '')} status={String(view.status || 'active')} dispatch={dispatch} />;
      case 'customers': return <CustomersView query={String(view.query || '')} dispatch={dispatch} />;
      case 'newJob': return <NewJob dispatch={dispatch} />;
      case 'brief': return <BriefView dispatch={dispatch} />;
      case 'reviews': return <ReviewsView />;
      case 'social': return <SocialView />;
      case 'mail': return <MailView open={view.open as string | undefined} dispatch={dispatch} />;
      // The admin Hub (tax rate, business notes, backups), same component and writes, re-themed.
      case 'settings': return <div className="jv-glass jv-pop max-w-[1180px] mx-auto p-4 sm:p-6"><UsagePanel /><div className="jv-skin"><BusinessHub /></div></div>;
      default: return null;
    }
  };

  return (
    <div className="jv-overlay fixed inset-0 z-40 flex flex-col" role="dialog" aria-modal="true" aria-label={`Jarvis — ${LABEL[view.type] ?? 'view'}`}>
      <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-16 shrink-0 border-b" style={{ borderColor: C.border }}>
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(52,214,255,0.12)', border: `1px solid ${C.border}` }}><Icon size={18} color={C.cyan} /></span>
        <nav className="flex items-center gap-1.5 min-w-0 text-[15px]" aria-label="Where you are">
          <button type="button" onClick={() => dispatch({ type: 'close_all' })} className="hover:underline shrink-0" style={{ color: C.text2 }}>Jarvis</button>
          {state.stack.map((v, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              <ChevronRight size={15} color={C.muted} className="shrink-0" />
              <span className="truncate font-semibold" style={{ color: i === state.stack.length - 1 ? C.text : C.text2 }}>{v.type === 'jobs' && i === state.stack.length - 1 ? jobsTitle : LABEL[v.type] ?? v.type}</span>
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[12.5px]" style={{ color: C.muted }}>Esc to go back</span>
          <button type="button" onClick={() => dispatch({ type: 'close_all' })} aria-label="Close and return to Jarvis" title="Close (back to Jarvis)"
            className="cc-btn w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.borderStrong}`, color: C.text, background: 'rgba(3,10,17,0.6)' }}><X size={20} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-6 lg:px-8 py-4 sm:py-6">{body()}</div>

      <form className="shrink-0 border-t px-3 sm:px-6 lg:px-8 py-3" style={{ borderColor: C.border, background: 'rgba(3,10,17,0.75)' }}
        onSubmit={e => { e.preventDefault(); if (!q.trim() || asking) return; onAsk(q); setQ(''); }}>
        <div className="max-w-[1180px] mx-auto flex flex-col gap-2">
          {(asking || reply) && (
            <div className="flex items-center gap-2 text-[14px] min-w-0" style={{ color: C.text2 }} aria-live="polite">
              {asking ? <><Loader2 size={15} className="animate-spin shrink-0" color={C.cyan} />Working…</> : <span className="truncate"><span style={{ color: C.cyan }}>Jarvis: </span>{reply}</span>}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full pl-5 pr-1.5 h-12" style={{ background: 'rgba(8,19,30,0.95)', border: `1px solid ${C.borderStrong}` }}>
            <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder='Ask Jarvis — "payment", "the brake one", "close"'
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" style={{ color: C.text }} aria-label="Ask Jarvis" />
            <button type="submit" disabled={asking || !q.trim()} aria-label="Send" className="cc-btn w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: C.cyan, color: C.bg }}><Send size={16} /></button>
          </div>
        </div>
      </form>
    </div>
  );
}
