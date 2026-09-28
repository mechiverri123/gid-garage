// Top of the ops dashboard: KPI strip, today's service timeline, and who
// needs attention — all from get-command-center-summary.
import { Briefcase, DollarSign, UserPlus, PhoneMissed, CloudSun, CloudRain, CloudSnow, CloudLightning, Sun, CalendarCheck, Clock, AlertTriangle, UserRound, Receipt, MapPin, CheckCircle2 } from 'lucide-react';
import type { CommandCenterSummary, NeedsAttentionItem } from '../types';
import { C, money, shortDay, clock } from '../ui/theme';
import { CommandCard, SectionHeader, MetricCard, StatusBadge, TimelineItem, EmptyState, VehicleBadge, statusTone } from '../ui/primitives';
import { Sparkline } from '../ui/charts';

function weatherIcon(summary?: string | null) {
  const s = (summary || '').toLowerCase();
  if (/thunder|storm/.test(s)) return { icon: CloudLightning, tone: 'amber' as const };
  if (/snow|sleet|ice|flurr/.test(s)) return { icon: CloudSnow, tone: 'amber' as const };
  if (/rain|shower|drizzle/.test(s)) return { icon: CloudRain, tone: 'amber' as const };
  if (/sunny|clear/.test(s)) return { icon: Sun, tone: 'green' as const };
  return { icon: CloudSun, tone: 'cyan' as const };
}

export function KpiStrip({ summary }: { summary: CommandCenterSummary }) {
  const t = summary.today;
  const week = summary.scheduleBar || [];
  const trend = summary.trend || [];
  const last14 = trend.slice(-14);
  const leads30 = trend.slice(-30).reduce((s, d) => s + d.leads, 0);
  const todaysJobs = summary.upcomingJobs.filter(j => j.date === t.date);
  const nextJob = todaysJobs[0];
  const w = summary.weather?.today ?? null;
  const wi = weatherIcon(w?.summary);
  const weekJobs = week.reduce((s, d) => s + d.jobCount, 0);
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
      <MetricCard icon={Briefcase} label="Today's jobs" value={t.jobCount}
        caption={nextJob ? <>Next: <b style={{ color: C.text }}>{clock(nextJob.time)}</b> · {nextJob.customer || 'customer'}</> : 'Nothing scheduled today'}
        accent={<Sparkline bars values={week.map(d => d.jobCount)} width={70} height={30} />} />
      <MetricCard icon={DollarSign} label="Booked revenue" tone="green" value={t.revenue} display={money(t.revenue)}
        caption={<>Scheduled today · {weekJobs} job{weekJobs === 1 ? '' : 's'} next 7 days</>}
        accent={<Sparkline bars values={week.map(d => d.revenue)} width={70} height={30} color={C.green} />} />
      <MetricCard icon={UserPlus} label="New leads" tone="purple" value={t.newLeads}
        caption={<>Today · {leads30} in the last 30 days</>}
        accent={<Sparkline bars values={last14.map(d => d.leads)} width={70} height={30} color={C.purple} />} />
      <MetricCard icon={PhoneMissed} label="Missed calls" tone={t.missedCalls > 0 ? 'red' : 'green'} value={t.missedCalls}
        caption={t.missedCalls > 0 ? 'Today — call them back' : 'None today'} />
      <MetricCard icon={wi.icon} label="Weather" tone={wi.tone}
        display={w ? <span>{w.highF ?? '—'}°<span className="text-[20px] font-semibold" style={{ color: C.text2 }}> / {w.lowF ?? '—'}°</span></span> : '—'}
        caption={w ? <span className="line-clamp-2">{w.summary} · Flagstaff</span> : 'Forecast not synced yet'} />
      <MetricCard icon={CalendarCheck} label="Next open day" tone="cyan"
        display={<span className="text-[26px] sm:text-[28px]">{t.nextOpenDay ? shortDay(t.nextOpenDay) : 'Booked'}</span>}
        caption={t.nextOpenDay ? 'First day with no jobs booked' : 'No open day in the next 7'} />
    </div>
  );
}

export function TodaysJobs({ summary, onSelectJob }: { summary: CommandCenterSummary; onSelectJob: (id: string) => void }) {
  const today = summary.today.date;
  const jobs = summary.upcomingJobs.filter(j => j.date === today);
  const stops = new Map((summary.todayRoute?.stops || []).map((s, i) => [s.id, { n: i + 1, place: s.place }]));
  const next = summary.upcomingJobs.find(j => j.date > today);
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Clock} title="Today's jobs" subtitle={jobs.length ? `${jobs.length} scheduled · ${shortDay(today)}` : shortDay(today)} />
      {jobs.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No jobs today">
          {next ? <>Next up: <b style={{ color: C.text }}>{next.customer || 'customer'}</b> on {shortDay(next.date)} at {clock(next.time)}.</> : 'Nothing booked in the next 7 days yet.'}
        </EmptyState>
      ) : (
        <div>
          {jobs.map((j, i) => {
            const stop = stops.get(j.id);
            return (
              <TimelineItem key={j.id} time={clock(j.time)} tone={statusTone(j.job_status)} last={i === jobs.length - 1} onClick={() => onSelectJob(j.id)}
                title={j.customer || 'Customer'} right={<StatusBadge status={j.job_status} />}>
                <div className="mt-1 flex flex-col gap-1 min-w-0">
                  <div className="text-[13.5px] truncate" style={{ color: C.text2 }}>{j.service || 'Service not specified'}{j.amount != null && <> · <span style={{ color: C.text }}>{money(j.amount)}</span></>}</div>
                  <div className="flex items-center gap-3 min-w-0">
                    <VehicleBadge vehicle={j.vehicle} />
                    {stop && <span className="inline-flex items-center gap-1 text-[12.5px] shrink-0" style={{ color: C.cyan }}><MapPin size={13} />Stop {stop.n}{stop.place ? ` · ${stop.place}` : ''}</span>}
                  </div>
                </div>
              </TimelineItem>
            );
          })}
        </div>
      )}
    </CommandCard>
  );
}

const ATTN = {
  lead_follow_up: { icon: UserRound, tone: 'cyan' as const, label: 'Follow up' },
  missed_call: { icon: PhoneMissed, tone: 'amber' as const, label: 'Call back' },
  unpaid_invoice: { icon: Receipt, tone: 'red' as const, label: 'Unpaid' },
};
export function AttentionCard({ items, onOpen }: { items: NeedsAttentionItem[]; onOpen: (i: NeedsAttentionItem) => void }) {
  return (
    <CommandCard className="p-5">
      <SectionHeader icon={AlertTriangle} tone={items.length ? 'amber' : 'green'} title="Needs attention" subtitle={items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'All caught up'} />
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing needs you right now">No overdue follow-ups, missed calls today, or unpaid invoices this week.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {items.slice(0, 6).map((a, i) => {
            const m = ATTN[a.type] ?? ATTN.lead_follow_up;
            const Icon = m.icon;
            return (
              <button key={i} type="button" onClick={() => onOpen(a)} className="cc-btn cc-card--interactive w-full flex items-center gap-3 text-left rounded-lg p-3" style={{ background: 'rgba(52,214,255,0.035)', border: `1px solid ${C.border}` }}>
                <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}><Icon size={17} color={m.tone === 'red' ? C.red : m.tone === 'amber' ? C.amber : C.cyan} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold truncate" style={{ color: C.text }}>{a.label}</span><span className="block text-[13px] truncate" style={{ color: C.text2 }}>{a.detail}</span></span>
                <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
              </button>
            );
          })}
          {items.length > 6 && <div className="text-[13px] px-1" style={{ color: C.text2 }}>+{items.length - 6} more in the notifications bell</div>}
        </div>
      )}
    </CommandCard>
  );
}
