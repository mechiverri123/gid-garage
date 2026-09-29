// Several jobs side by side (previous · ACTIVE · next). Desktop shows three
// full cards with the center emphasized; tablets narrow the sides; phones show
// one card and swipe. Clicking a side card brings it to the center; clicking
// the center card (or "open the middle one") expands it into JobFocus.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, LayoutGrid, Maximize2 } from 'lucide-react';
import type { Job } from '../../JobOps';
import { C, money } from '../ui/theme';
import { StatusBadge, Skeleton, ErrorState, ActionButton } from '../ui/primitives';
import { useJobs, jobTitle, loadAllJobs } from './jobStore';
import { jobFamily } from '../../../shared/jarvis-workspace.js';
import { JobFocus, customerName, jobTotal, whenLabel } from './JobFocus';

export interface JobsViewState { type: 'jobs'; jobIds: string[]; focus: number; expanded: boolean; tab: string; title: string | null }
type Dispatch = (a: { type: string; [k: string]: unknown }) => void;

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return w;
}

const MON = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase(); };

function JobCard({ job, role, compact, onClick, delay }: { job: Job | null; role: 'center' | 'side'; compact: boolean; onClick: () => void; delay: number }) {
  if (!job) return <div className="jv-glass p-6 w-full h-[420px]"><Skeleton className="h-full" /></div>;
  const items = (job.lineItems || []).filter(li => !/mobile service fee/i.test(li.label) && li.type !== 'discount');
  const center = role === 'center';
  return (
    <button type="button" onClick={onClick} aria-label={center ? `Open ${customerName(job)}'s ${jobTitle(job)} job` : `Bring ${jobTitle(job)} to the center`}
      className={`jv-glass jv-card jv-pop w-full text-left flex flex-col gap-3 ${center ? 'jv-card--center p-6 sm:p-7' : 'jv-card--side p-5'}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`${center ? 'text-[30px]' : 'text-[22px]'} font-bold leading-none tracking-wide`} style={{ color: C.cyan }}>{job.dateTbd ? 'TBD' : MON(job.date)}</div>
          <div className="text-[14px] mt-1.5" style={{ color: C.text2 }}>{whenLabel(job)}</div>
        </div>
        <StatusBadge status={job.jobStatus} />
      </div>
      <div className="min-w-0">
        <div className={`${center ? 'text-[24px]' : 'text-[18px]'} font-bold leading-snug break-words`} style={{ color: C.text }}>{jobTitle(job)}</div>
        <div className="text-[15px] mt-1 break-words" style={{ color: C.text2 }}>{job.vehicle || 'Vehicle not recorded'}</div>
      </div>
      <div className={`${center ? 'text-[34px]' : 'text-[24px]'} font-bold tabular-nums leading-none`} style={{ color: C.text }}>{money(jobTotal(job), 2)}</div>
      {!compact && items.length > 0 && (
        <ul className="flex flex-col gap-1.5 pt-3 border-t" style={{ borderColor: C.border }}>
          {items.slice(0, center ? 5 : 3).map(li => (
            <li key={li.id} className="flex items-start gap-2 text-[14.5px] min-w-0" style={{ color: C.text }}>
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" color={C.green} /><span className="break-words min-w-0">{li.label}</span>
            </li>
          ))}
          {items.length > (center ? 5 : 3) && <li className="text-[13px] pl-6" style={{ color: C.muted }}>+{items.length - (center ? 5 : 3)} more</li>}
        </ul>
      )}
      {center && <div className="mt-auto pt-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: C.cyan }}><Maximize2 size={15} />Open job</div>}
    </button>
  );
}

export function JobsView({ view, dispatch }: { view: JobsViewState; dispatch: Dispatch }) {
  const { jobs, error } = useJobs(view.jobIds);

  // One job opened from anywhere (list, calendar, dashboard, a single Jarvis
  // match) sits inside its customer's jobs, so "job 3", "Sep 26", "next" and
  // "the brake one" work the same everywhere. Same list data /admin loads.
  const single = view.jobIds.length === 1 && !(view as { family?: boolean }).family ? view.jobIds[0] : null;
  useEffect(() => {
    if (!single) return;
    let live = true;
    loadAllJobs().then(list => {
      if (!live) return;
      const target = list.find(j => j.id === single);
      const name = target ? `${target.fname || ''} ${target.lname || ''}`.trim() : '';
      dispatch({ type: 'context', forId: single, jobIds: jobFamily(list, single), title: name || null });
    }, () => { if (live) dispatch({ type: 'context', forId: single, jobIds: [single] }); });
    return () => { live = false; };
  }, [single, dispatch]);
  const width = useWidth();
  const n = view.jobIds.length;
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowLeft') dispatch({ type: 'step', delta: -1 });
      else if (e.key === 'ArrowRight') dispatch({ type: 'step', delta: 1 });
      else if (e.key === 'Enter' && !view.expanded) dispatch({ type: 'focus', index: view.focus, expand: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, view.expanded, view.focus]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = e.touches[0].clientX; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current == null) return;
      const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
      if (Math.abs(dx) > 50) dispatch({ type: 'step', delta: dx < 0 ? 1 : -1 });
    },
  };

  if (error && jobs.every(j => !j)) return <div className="max-w-xl mx-auto"><ErrorState message={`Couldn't load the job: ${error}`} /></div>;

  const pager = n > 1 && (
    <div className="flex items-center justify-center gap-3">
      <button type="button" onClick={() => dispatch({ type: 'step', delta: -1 })} disabled={view.focus === 0} aria-label="Previous job" className="cc-btn w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${C.borderStrong}`, color: C.text }}><ChevronLeft size={20} /></button>
      <div className="flex items-center gap-1.5" aria-label={`Job ${view.focus + 1} of ${n}`}>
        {view.jobIds.map((id, i) => (
          <button key={id} type="button" onClick={() => dispatch({ type: 'focus', index: i })} aria-label={`Job ${i + 1}`}
            className="h-2.5 rounded-full transition-all" style={{ width: i === view.focus ? 26 : 10, background: i === view.focus ? C.cyan : 'rgba(167,181,194,0.35)' }} />
        ))}
      </div>
      <button type="button" onClick={() => dispatch({ type: 'step', delta: 1 })} disabled={view.focus === n - 1} aria-label="Next job" className="cc-btn w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${C.borderStrong}`, color: C.text }}><ChevronRight size={20} /></button>
    </div>
  );

  if (view.expanded) {
    const job = jobs[view.focus];
    const nav = n > 1 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <ActionButton size="sm" variant="ghost" icon={LayoutGrid} onClick={() => dispatch({ type: 'close' })}>All {n} jobs</ActionButton>
        <div className="flex items-center gap-2 text-[14px]" style={{ color: C.text2 }}>
          <button type="button" onClick={() => dispatch({ type: 'step', delta: -1 })} disabled={view.focus === 0} aria-label="Previous job" className="cc-btn w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${C.border}` }}><ChevronLeft size={18} /></button>
          <span className="tabular-nums">Job {view.focus + 1} of {n}</span>
          <button type="button" onClick={() => dispatch({ type: 'step', delta: 1 })} disabled={view.focus === n - 1} aria-label="Next job" className="cc-btn w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ border: `1px solid ${C.border}` }}><ChevronRight size={18} /></button>
        </div>
      </div>
    ) : null;
    return (
      <div className="h-full max-w-[1180px] mx-auto" {...(width < 768 ? swipe : {})}>
        {job ? <JobFocus key={job.id} job={job} tab={view.tab as never} onTab={t => dispatch({ type: 'tab', tab: t })} nav={nav} /> : <div className="jv-glass h-full p-6"><Skeleton className="h-full" /></div>}
      </div>
    );
  }

  // Which cards are on screen: all (≤3) or a window of three around the focus.
  const phone = width < 768;
  const start = phone ? view.focus : n <= 3 ? 0 : Math.max(0, Math.min(view.focus - 1, n - 3));
  const visible = phone ? [view.focus] : Array.from({ length: Math.min(3, n) }, (_, k) => start + k);
  const centerBasis = width >= 1280 ? 44 : width >= 1024 ? 46 : 58;
  const sideBasis = n === 2 ? 100 - centerBasis - 4 : (100 - centerBasis - 4) / 2;

  return (
    <div className="h-full flex flex-col justify-center gap-6 max-w-[1500px] mx-auto" {...swipe}>
      {view.title && <div className="text-center text-[14px] font-bold uppercase tracking-[0.24em]" style={{ color: C.text2 }}>{view.title} · {n} job{n === 1 ? '' : 's'}</div>}
      <div className="flex items-center justify-center gap-[2%]">
        {visible.map((i, k) => {
          const center = i === view.focus;
          return (
            <div key={view.jobIds[i]} className="jv-card min-w-0" style={{ flexBasis: phone ? '100%' : `${center ? centerBasis : sideBasis}%`, flexGrow: 0, flexShrink: 0 }}>
              <JobCard job={jobs[i]} role={center ? 'center' : 'side'} compact={!phone && !center && width < 1024} delay={k * 40}
                onClick={() => dispatch(center ? { type: 'focus', index: i, expand: true } : { type: 'focus', index: i })} />
            </div>
          );
        })}
      </div>
      {pager}
    </div>
  );
}
