// Jarvis calendar: the admin schedule's appointments (list-bookings, same
// "not cancelled" rule) in day / week / month views. An appointment opens its
// job over the calendar; closing the job comes back here.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { patchJob, type Job } from '../../JobOps';
import { phoenixYmd, addDaysYmd } from '../../../shared/business-metrics.js';
import { C, clock } from '../ui/theme';
import { Segmented, Skeleton, ErrorState, EmptyState, StatusBadge, ActionButton } from '../ui/primitives';
import { useAllJobs, jobTitle, putJob } from './jobStore';

type Mode = 'day' | 'week' | 'month';
type Dispatch = (a: { type: string; [k: string]: unknown }) => void;

const minutes = (t: string) => {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return 24 * 60; // TBD / odd values last
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
};
const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' }); };
const dow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const weekStart = (ymd: string) => addDaysYmd(ymd, -dow(ymd));
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const daysInMonth = (ymd: string) => { const [y, m] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const shiftMonth = (ymd: string, k: number) => { const [y, m] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + k, 1, 12)); return t.toISOString().slice(0, 10); };

function Appt({ job, onOpen, big }: { job: Job; onOpen: (id: string) => void; big?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(job.id)} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', job.id); e.dataTransfer.effectAllowed = 'move'; }} className="cc-btn w-full text-left rounded-xl px-3 py-2.5 min-w-0 hover:border-[rgba(52,214,255,0.6)]"
      style={{ background: 'linear-gradient(135deg, rgba(52,214,255,0.12), rgba(3,10,17,0.5))', border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold tabular-nums" style={{ color: C.cyan }}>{clock(job.time)}</span>
        {big && <StatusBadge status={job.jobStatus} />}
      </div>
      <div className={`${big ? 'text-[17px]' : 'text-[14px]'} font-semibold truncate`} style={{ color: C.text }}>{`${job.fname || ''} ${job.lname || ''}`.trim()}</div>
      <div className={`${big ? 'text-[14.5px]' : 'text-[12.5px]'} truncate`} style={{ color: C.text2 }}>{jobTitle(job)}{job.vehicle ? ` · ${job.vehicle}` : ''}</div>
    </button>
  );
}

export function CalendarView({ date, mode, dispatch }: { date: string | null; mode: Mode; dispatch: Dispatch }) {
  const { jobs: allJobs, error } = useAllJobs();
  // Fleet jobs have their own Fleet calendar (FLEET_PLAN.md).
  const jobs = useMemo(() => (allJobs ? allJobs.filter(j => !j.fleetId) : null), [allJobs]);
  const today = phoenixYmd(new Date());
  const anchor = date || today;

  const byDay = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs ?? []) {
      if (j.status === 'cancelled' || j.dateTbd || !j.date) continue; // same visibility as the admin calendar; TBD isn't scheduled
      const list = m.get(j.date) ?? []; list.push(j); m.set(j.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => minutes(a.time) - minutes(b.time));
    return m;
  }, [jobs]);
  const tbd = useMemo(() => (jobs ?? []).filter(j => j.dateTbd && j.status !== 'cancelled' && j.jobStatus !== 'CANCELLED' && j.jobStatus !== 'PAID').length, [jobs]);

  const open = (id: string) => dispatch({ type: 'open', view: { type: 'jobs', jobIds: [id] } });

  // Drag an appointment to another day: same confirm + write as the admin
  // calendar's drag-to-reschedule (patch-booking date, time kept).
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  async function moveTo(id: string, day: string) {
    setDropDay(null);
    const job = jobs?.find(j => j.id === id);
    if (!job || job.date === day) return;
    const who = `${job.fname || ''} ${job.lname || ''}`.trim();
    if (!window.confirm(`Reschedule ${who}${job.vehicle ? ` (${job.vehicle})` : ''} to ${fmt(day, { weekday: 'long', month: 'short', day: 'numeric' })}${job.time && job.time !== 'TBD' ? ` at ${clock(job.time)}` : ''}?`)) return;
    setMoveErr(null);
    try {
      await patchJob(id, { date: day, time: job.time });
      putJob({ ...job, date: day });
    } catch (e) { setMoveErr(`Not rescheduled: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const drop = (day: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropDay(day); },
    onDragLeave: () => setDropDay(d => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) void moveTo(id, day); },
  });
  const go = (d: string, m?: Mode) => dispatch({ type: 'calendar', date: d, ...(m ? { mode: m } : {}) });
  const step = (k: number) => go(mode === 'month' ? shiftMonth(anchor, k) : addDaysYmd(anchor, mode === 'week' ? 7 * k : k));

  const title = mode === 'day' ? fmt(anchor, { weekday: 'long', month: 'long', day: 'numeric' })
    : mode === 'week' ? `${fmt(weekStart(anchor), { month: 'short', day: 'numeric' })} – ${fmt(addDaysYmd(weekStart(anchor), 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
    : fmt(anchor, { month: 'long', year: 'numeric' });

  const body = () => {
    if (error) return <ErrorState message={`Couldn't load the schedule: ${error}`} />;
    if (!jobs) return <Skeleton className="h-[420px]" />;
    if (mode === 'day') {
      const list = byDay.get(anchor) ?? [];
      return list.length
        ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(j => <Appt key={j.id} job={j} onOpen={open} big />)}</div>
        : <EmptyState icon={CalendarDays} title="Nothing scheduled">No appointments on this day.</EmptyState>;
    }
    if (mode === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart(anchor), i));
      return (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map(d => {
            const list = byDay.get(d) ?? []; const isToday = d === today;
            return (
              <div key={d} {...drop(d)} className="rounded-2xl p-2.5 min-w-0 md:min-h-[260px] flex flex-col gap-2" style={{ background: dropDay === d ? 'rgba(255,184,77,0.1)' : isToday ? 'rgba(52,214,255,0.07)' : 'rgba(3,10,17,0.4)', border: `1px solid ${dropDay === d ? C.amber : isToday ? C.borderStrong : C.border}` }}>
                <button type="button" onClick={() => go(d, 'day')} className="text-left px-1">
                  <div className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: isToday ? C.cyan : C.text2 }}>{fmt(d, { weekday: 'short' })}</div>
                  <div className="text-[22px] font-bold leading-tight" style={{ color: C.text }}>{fmt(d, { day: 'numeric' })}</div>
                </button>
                {list.length ? list.map(j => <Appt key={j.id} job={j} onOpen={open} />) : <div className="text-[13px] px-1 hidden md:block" style={{ color: C.muted }}>Open</div>}
              </div>
            );
          })}
        </div>
      );
    }
    const first = monthStart(anchor); const lead = dow(first); const count = daysInMonth(anchor);
    return (
      <div>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => <div key={w} className="text-center text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const d = addDaysYmd(first, i); const list = byDay.get(d) ?? []; const isToday = d === today;
            return (
              <button key={d} type="button" onClick={() => go(d, 'day')} {...drop(d)} className="cc-btn rounded-xl p-1.5 sm:p-2 min-h-[64px] sm:min-h-[96px] text-left flex flex-col gap-1 min-w-0"
                style={{ background: dropDay === d ? 'rgba(255,184,77,0.12)' : isToday ? 'rgba(52,214,255,0.1)' : 'rgba(3,10,17,0.4)', border: `1px solid ${dropDay === d ? C.amber : isToday ? C.cyan : C.border}` }} aria-label={`${fmt(d, { month: 'long', day: 'numeric' })}: ${list.length} appointment${list.length === 1 ? '' : 's'}`}>
                <span className="text-[14px] font-bold" style={{ color: isToday ? C.cyan : C.text }}>{i + 1}</span>
                <span className="hidden sm:flex flex-col gap-1 min-w-0">
                  {list.slice(0, 3).map(j => <span key={j.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', j.id); }} className="text-[12px] truncate rounded px-1.5 py-0.5 cursor-grab" style={{ background: 'rgba(52,214,255,0.14)', color: C.text }}>{clock(j.time)} {j.fname}</span>)}
                  {list.length > 3 && <span className="text-[12px]" style={{ color: C.muted }}>+{list.length - 3} more</span>}
                </span>
                {list.length > 0 && <span className="sm:hidden flex gap-1">{list.slice(0, 4).map(j => <span key={j.id} className="w-1.5 h-1.5 rounded-full" style={{ background: C.cyan }} />)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="jv-glass jv-pop max-w-[1400px] mx-auto p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="cc-btn w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.borderStrong}`, color: C.text }}><ChevronLeft size={20} /></button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="cc-btn w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${C.borderStrong}`, color: C.text }}><ChevronRight size={20} /></button>
          <h2 className="text-[20px] sm:text-[24px] font-bold ml-2" style={{ color: C.text }}>{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {anchor !== today && <ActionButton size="sm" onClick={() => go(today)}>Today</ActionButton>}
          <Segmented label="Calendar view" value={mode} onChange={m => go(anchor, m)} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </div>
      </div>
      {body()}
      {moveErr && <ErrorState message={moveErr} />}
      {mode !== 'day' && <div className="hidden md:block text-[13px]" style={{ color: C.muted }}>Drag an appointment to another day to reschedule it.</div>}
      {tbd > 0 && <div className="text-[13.5px]" style={{ color: C.muted }}>{tbd} open job{tbd === 1 ? '' : 's'} with no date yet (TBD) aren't on the calendar.</div>}
    </div>
  );
}
