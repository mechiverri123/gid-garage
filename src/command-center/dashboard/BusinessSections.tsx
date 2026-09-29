// Lower dashboard: quick actions, this month, leads by source, activity,
// upcoming jobs, revenue trend and quick commands. Real data only; money
// headlines come from the canonical server totals (never summed chart bars).
import { useState } from 'react';
import { PlusCircle, UserPlus, Users, FileText, TrendingUp, Target, CheckCircle2, Percent, DollarSign, PieChart, Activity, CalendarRange, BarChart3, UserRound, CalendarCheck2, CreditCard, PhoneMissed, UserCheck, Zap, Receipt, Megaphone, Wallet, CalendarClock, Route, X , type LucideIcon } from 'lucide-react';
import type { CommandCenterSummary, UpcomingJob } from '../types';
import { adminPost } from '../api';
import { C, money, pct, shortDay, clock, timeAgo } from '../ui/theme';
import { CommandCard, SectionHeader, StatusBadge, ActionButton, CommandButton, EmptyState, ErrorState, TrendIndicator, ActivityItem, DataTable, Segmented, type Column, useCountUp } from '../ui/primitives';
import { Sparkline, BarChart, Donut, type Segment } from '../ui/charts';

// ---- quick actions -----------------------------------------------------------------------

const SOURCES = ['phone', 'website', 'referral', 'google', 'facebook', 'instagram', 'other'];
function NewLeadDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ fname: '', lname: '', phone: '', vehicle: '', requested_service: '', source: 'phone', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(s => ({ ...s, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.fname.trim() && !f.phone.trim()) { setErr('Add at least a name or a phone number.'); return; }
    setSaving(true); setErr(null);
    try {
      const row = Object.fromEntries(Object.entries({ ...f, status: 'new' }).filter(([, v]) => String(v).trim() !== '')) as Record<string, string>;
      await adminPost('upsert-lead', { row });
      onSaved(); onClose();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setSaving(false); }
  }
  const input = 'w-full rounded-lg px-3 h-11 text-[15px] outline-none';
  const style = { background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New lead">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={save} className="cc-card cc-card--primary relative w-full max-w-lg p-6 cc-fade-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] font-semibold" style={{ color: C.text }}>New lead</h2>
          <button type="button" onClick={onClose} className="cc-btn p-2 rounded-lg" aria-label="Close" style={{ color: C.text2 }}><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px]" style={{ color: C.text2 }}>First name<input autoFocus value={f.fname} onChange={set('fname')} className={`${input} mt-1`} style={style} /></label>
          <label className="text-[13px]" style={{ color: C.text2 }}>Last name<input value={f.lname} onChange={set('lname')} className={`${input} mt-1`} style={style} /></label>
          <label className="text-[13px]" style={{ color: C.text2 }}>Phone<input value={f.phone} onChange={set('phone')} inputMode="tel" className={`${input} mt-1`} style={style} /></label>
          <label className="text-[13px]" style={{ color: C.text2 }}>Source<select value={f.source} onChange={set('source')} className={`${input} mt-1`} style={style}>{SOURCES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
          <label className="text-[13px] col-span-2" style={{ color: C.text2 }}>Vehicle<input value={f.vehicle} onChange={set('vehicle')} placeholder="e.g. 2014 Ford F-150" className={`${input} mt-1`} style={style} /></label>
          <label className="text-[13px] col-span-2" style={{ color: C.text2 }}>Service needed<input value={f.requested_service} onChange={set('requested_service')} placeholder="e.g. front brakes grinding" className={`${input} mt-1`} style={style} /></label>
          <label className="text-[13px] col-span-2" style={{ color: C.text2 }}>Notes<textarea value={f.notes} onChange={set('notes')} rows={2} className="w-full rounded-lg px-3 py-2 text-[15px] outline-none mt-1" style={style} /></label>
        </div>
        {err && <div className="mt-3"><ErrorState message={err} /></div>}
        <div className="flex justify-end gap-2 mt-5">
          <ActionButton variant="ghost" onClick={onClose}>Cancel</ActionButton>
          <ActionButton type="submit" variant="primary" icon={UserPlus} disabled={saving}>{saving ? 'Saving…' : 'Save lead'}</ActionButton>
        </div>
      </form>
    </div>
  );
}

export function QuickActionHero({ onLeadSaved, onNewJob, onPickJob }: { onLeadSaved: () => void; onNewJob: () => void; onPickJob: () => void }) {
  const [newLead, setNewLead] = useState(false);
  return (
    <CommandCard variant="primary" className="p-5 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(600px 220px at 0% 0%, rgba(52,214,255,0.16), transparent 70%), radial-gradient(400px 200px at 100% 100%, rgba(255,77,95,0.10), transparent 70%)' }} />
      <div className="relative flex items-center gap-4 mb-4">
        <img src="/opt/website_logo-192.webp" width={56} height={56} alt="GID Garage" className="rounded-xl shrink-0" style={{ boxShadow: '0 0 24px rgba(52,214,255,0.25)' }} />
        <div className="min-w-0">
          <div className="text-[20px] font-bold leading-tight" style={{ color: C.text }}>GID Garage</div>
          <div className="text-[13.5px]" style={{ color: C.text2 }}>Mobile mechanic · Flagstaff, AZ</div>
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-2.5">
        <CommandButton icon={PlusCircle} label="New Job" hint="Contact → date → estimate" onClick={onNewJob} />
        <CommandButton icon={UserPlus} label="New Lead" hint="Add it here" tone="purple" onClick={() => setNewLead(true)} />
        <CommandButton icon={Users} label="Add Customer" hint="Customers" tone="green" href="/admin?tab=customers" />
        <CommandButton icon={FileText} label="Send Estimate" hint="Pick a job" tone="amber" onClick={onPickJob} />
      </div>
      {newLead && <NewLeadDialog onClose={() => setNewLead(false)} onSaved={onLeadSaved} />}
    </CommandCard>
  );
}

// ---- this month ---------------------------------------------------------------------------

function StatPanel({ icon: Icon, label, value, prev, format, spark, color, betterIs = 'higher' }: { icon: LucideIcon; label: string; value: number | null; prev: number | null; format: (n: number) => string; spark: number[]; color: string; betterIs?: 'higher' | 'lower' }) {
  const v = useCountUp(value ?? 0);
  const change = value != null && prev != null && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null;
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2 min-w-0" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 text-[14px]" style={{ color: C.text2 }}><Icon size={16} color={color} />{label}</div>
      <div className="text-[28px] font-bold leading-none tabular-nums truncate" style={{ color: C.text }}>{value == null ? '—' : format(v)}</div>
      <div className="flex items-end justify-between gap-2">
        <TrendIndicator changePct={change} betterIs={betterIs} label={change == null ? (prev === 0 && value ? 'new this month' : 'no prior data') : 'vs last month'} size={12} />
        <Sparkline bars={label !== 'Conversion'} values={spark} color={color} width={72} height={28} />
      </div>
    </div>
  );
}

export function ThisMonth({ summary }: { summary: CommandCenterSummary }) {
  const ms = summary.monthStats;
  const month = (summary.trend || []).filter(d => ms && d.date >= ms.current.from);
  let cumL = 0; let cumB = 0;
  const conv = month.map(d => { cumL += d.leads; cumB += d.booked; return cumL ? (cumB / cumL) * 100 : 0; });
  return (
    <CommandCard className="p-5">
      <SectionHeader icon={TrendingUp} title="This month" subtitle={ms ? `${shortDay(ms.current.from)} – today · compared with the same days last month` : undefined} />
      {!ms ? <EmptyState title="Monthly stats unavailable">Refresh to load this month's numbers.</EmptyState> : (
        <div className="grid grid-cols-2 gap-3">
          <StatPanel icon={Target} label="Leads" value={ms.current.leads} prev={ms.previous.leads} format={n => Math.round(n).toString()} spark={month.map(d => d.leads)} color={C.purple} />
          <StatPanel icon={CheckCircle2} label="Booked" value={ms.current.booked} prev={ms.previous.booked} format={n => Math.round(n).toString()} spark={month.map(d => d.booked)} color={C.cyan} />
          <StatPanel icon={Percent} label="Conversion" value={ms.current.conversionPct} prev={ms.previous.conversionPct} format={n => pct(n)} spark={conv} color={C.amber} />
          <StatPanel icon={DollarSign} label="Revenue" value={ms.current.collected} prev={ms.previous.collected} format={n => money(n)} spark={month.map(d => d.collected)} color={C.green} />
        </div>
      )}
    </CommandCard>
  );
}

// ---- leads by source ---------------------------------------------------------------------------

const SOURCE_COLORS = [C.cyan, C.purple, C.green, C.amber, C.cyan2, '#FF7AB6', C.red, C.muted];
const prettySource = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export function LeadsBySource({ summary }: { summary: CommandCenterSummary }) {
  const rows = [...summary.marketingFunnel].filter(r => r.leads > 0).sort((a, b) => b.leads - a.leads);
  const top = rows.slice(0, 6); const rest = rows.slice(6).reduce((s, r) => s + r.leads, 0);
  const segs: Segment[] = [...top.map((r, i) => ({ label: prettySource(r.channel), value: r.leads, color: SOURCE_COLORS[i] })), ...(rest ? [{ label: 'Other', value: rest, color: C.muted }] : [])];
  const total = segs.reduce((s, x) => s + x.value, 0);
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={PieChart} tone="purple" title="Leads by source" subtitle={`Last ${summary.leadsSummary.windowDays} days`} />
      {!total ? <EmptyState icon={PieChart} title="No leads in this window">Leads from the website, ads and referrals will show up here.</EmptyState> : (
        <div className="flex flex-col sm:flex-row xl:flex-col items-center gap-5">
          <Donut segments={segs} center={<><div className="text-[30px] font-bold leading-none" style={{ color: C.text }}>{total}</div><div className="text-[12.5px] mt-1" style={{ color: C.text2 }}>leads</div></>} />
          <ul className="flex-1 w-full min-w-0 flex flex-col gap-2">
            {segs.map(s => {
              const row = rows.find(r => prettySource(r.channel) === s.label);
              return (
                <li key={s.label} className="flex items-center gap-2.5 text-[14px] min-w-0">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="truncate flex-1" style={{ color: C.text }}>{s.label}</span>
                  {row && row.bookings > 0 && <span className="text-[12px] shrink-0" style={{ color: C.green }}>{row.bookings} booked</span>}
                  <span className="tabular-nums font-semibold shrink-0 w-[70px] text-right" style={{ color: C.text }}>{s.value} <span className="font-normal" style={{ color: C.muted }}>{Math.round((s.value / total) * 100)}%</span></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </CommandCard>
  );
}

// ---- recent activity ---------------------------------------------------------------------------

const FEED = {
  lead: { icon: UserRound, tone: 'purple' as const },
  booking: { icon: CalendarCheck2, tone: 'cyan' as const },
  payment: { icon: CreditCard, tone: 'green' as const },
  missed_call: { icon: PhoneMissed, tone: 'amber' as const },
  customer: { icon: UserCheck, tone: 'cyan' as const },
};
export function RecentActivity({ summary }: { summary: CommandCenterSummary }) {
  const items = summary.activity || [];
  const now = Date.now();
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Activity} title="Recent activity" subtitle={<span className="inline-flex items-center gap-2"><span className="cc-pulse" style={{ color: C.green, background: C.green, width: 7, height: 7 }} />Last 14 days</span>} />
      {items.length === 0 ? <EmptyState icon={Activity} title="Quiet for now">New leads, bookings, payments and missed calls appear here as they happen.</EmptyState> : (
        <div className="divide-y" style={{ borderColor: 'rgba(54,211,255,0.08)' }}>
          {items.slice(0, 9).map((e, i) => { const m = FEED[e.type] ?? FEED.lead; return <ActivityItem key={i} icon={m.icon} tone={m.tone} title={e.title} detail={e.detail} time={timeAgo(e.at, now)} />; })}
        </div>
      )}
    </CommandCard>
  );
}

// ---- upcoming jobs -------------------------------------------------------------------------------

export function UpcomingJobsTable({ jobs, onSelect, onCalendar }: { jobs: UpcomingJob[]; onSelect: (id: string) => void; onCalendar: () => void }) {
  const cols: Column<UpcomingJob>[] = [
    { key: 'date', header: 'Date', width: '17%', render: j => <span className="font-medium">{shortDay(j.date)}</span> },
    { key: 'time', header: 'Time', width: '12%', render: j => <span className="tabular-nums" style={{ color: C.text2 }}>{clock(j.time)}</span> },
    { key: 'customer', header: 'Customer', width: '20%', render: j => <span className="font-semibold">{j.customer || '—'}</span> },
    { key: 'vehicle', header: 'Vehicle', hideBelow: 'md', render: j => <span style={{ color: C.text2 }}>{j.vehicle || '—'}</span> },
    { key: 'service', header: 'Service', width: '14%', hideBelow: '2xl', render: j => <span style={{ color: C.text2 }}>{j.service || '—'}</span> },
    { key: 'status', header: 'Status', width: '19%', render: j => <StatusBadge status={j.job_status} /> },
    { key: 'amount', header: 'Amount', width: '11%', align: 'right', hideBelow: 'sm', render: j => <span className="tabular-nums font-semibold">{j.amount != null ? money(j.amount) : '—'}</span> },
  ];
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={CalendarRange} title="Upcoming jobs" subtitle="Today and the next 7 days" right={<ActionButton size="sm" onClick={onCalendar}>Calendar</ActionButton>} />
      <DataTable columns={cols} rows={jobs} rowKey={j => j.id} onRowClick={j => onSelect(j.id)}
        empty={<EmptyState icon={CalendarRange} title="Nothing on the books">No jobs in the next 7 days.</EmptyState>} />
    </CommandCard>
  );
}

// ---- revenue trend ---------------------------------------------------------------------------------

export function RevenueTrend({ summary }: { summary: CommandCenterSummary }) {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const days = (summary.trend || []).slice(-Number(range));
  const totals = summary.collectedTotals;
  const total = totals ? totals[`d${range}` as 'd7' | 'd30' | 'd90'] : null;
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={BarChart3} tone="green" title="Revenue trend" subtitle="Money actually collected, by day"
        right={<Segmented label="Revenue range" value={range} onChange={setRange} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} />} />
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[32px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{total == null ? '—' : money(total)}</span>
        <span className="text-[13.5px]" style={{ color: C.text2 }}>collected in the last {range} days</span>
      </div>
      <BarChart labels={days.map(d => d.date)} values={days.map(d => d.collected)} color={C.green} height={190} format={n => money(n, 2)} formatLabel={shortDay} />
    </CommandCard>
  );
}

// ---- quick commands -----------------------------------------------------------------------------------

export const QUICK_COMMANDS = [
  { icon: UserRound, label: 'Follow-ups', hint: 'Who needs a call?', ask: 'Who needs follow-up?', tone: 'cyan' as const },
  { icon: Receipt, label: 'Unpaid', hint: 'Money owed', ask: 'What jobs are unpaid?', tone: 'red' as const },
  { icon: Megaphone, label: 'Ad performance', hint: 'Spend vs bookings', ask: 'How are my ads doing?', tone: 'purple' as const },
  { icon: Wallet, label: 'Take-home', hint: 'After fees & reserve', ask: "What's my take-home this month?", tone: 'green' as const },
  { icon: CalendarClock, label: 'Open schedule', hint: 'Free days this week', ask: 'When is my next open day this week?', tone: 'amber' as const },
  { icon: Route, label: 'Route tomorrow', hint: "Tomorrow's stops", ask: "What is tomorrow's route?", tone: 'cyan' as const },
];
export function QuickCommandTiles({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Zap} title="Quick commands" subtitle="Answered by Jarvis from live data" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {QUICK_COMMANDS.map(q => <CommandButton key={q.label} icon={q.icon} label={q.label} hint={q.hint} tone={q.tone} onClick={() => onAsk(q.ask)} />)}
      </div>
    </CommandCard>
  );
}
