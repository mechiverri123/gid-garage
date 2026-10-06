// Revenue for any exact period, inside Jarvis. Numbers come from the
// canonical revenue function (admin-api-data `revenue-range` →
// business-data.js revenueRange → shared/business-metrics.js), the same one
// Jarvis's spoken answer uses, so the chart and the sentence always agree.
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, CalendarRange, Receipt, Wallet, AlertCircle } from 'lucide-react';
import { adminPost } from '../api';
import { C, money } from '../ui/theme';
import { CountUp, TrendIndicator, Skeleton, ErrorState, ActionButton } from '../ui/primitives';
import { AreaChart } from '../ui/charts';
import { revenuePrefetch as prefetchStore } from './jobMeta';

const revenuePrefetch = prefetchStore as Map<string, RevenueRange>;

export interface RevenueRange { from: string; to: string; days: number; key: string; collected: number; netProfit: number; jobsPaid: number; averageTicket: number | null; previous: { from: string; to: string; collected: number }; changePct: number | null; outstanding: { count: number; total: number }; series: { date: string; collected: number }[] }
type Spec = Record<string, unknown>;
type Dispatch = (a: { type: string; [k: string]: unknown }) => void;

const cache = new Map<string, RevenueRange>();

const d = (ymd: string, opts: Intl.DateTimeFormatOptions) => { const [y, m, dd] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }); };
const span = (a: string, b: string) => (a === b ? d(a, { month: 'short', day: 'numeric', year: 'numeric' }) : `${d(a, { month: 'short', day: 'numeric' })} – ${d(b, { month: 'short', day: 'numeric', year: a.slice(0, 4) === b.slice(0, 4) ? undefined : 'numeric' })}`);

function heading(r: RevenueRange) {
  if (r.key === 'today') return 'Today';
  if (r.key === 'yesterday') return 'Yesterday';
  if (r.key === 'this_year') return `${r.from.slice(0, 4)} so far`;
  if (r.key === 'this_month' || r.key === 'last_month' || r.key.startsWith('month:')) return `${d(r.from, { month: 'long' })}${r.from.slice(0, 4) !== new Date().toLocaleDateString('en-US', { year: 'numeric', timeZone: 'America/Phoenix' }) ? ` ${r.from.slice(0, 4)}` : ''}`;
  if (r.key.startsWith('last_')) return `Last ${r.days} days`;
  return span(r.from, r.to);
}

const CHIPS: { label: string; spec: Spec }[] = [
  { label: 'Today', spec: { period: 'today' } }, { label: '7 days', spec: { last_days: 7 } }, { label: '30 days', spec: { last_days: 30 } },
  { label: 'This month', spec: { period: 'this_month' } }, { label: 'Last month', spec: { period: 'last_month' } }, { label: '90 days', spec: { last_days: 90 } }, { label: 'This year', spec: { period: 'this_year' } },
];

function Stat({ icon: Icon, label, value, sub, color = C.cyan }: { icon: typeof Receipt; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: C.text2 }}><Icon size={15} color={color} />{label}</div>
      <div className="text-[26px] font-bold tabular-nums mt-1.5" style={{ color: C.text }}>{value}</div>
      {sub && <div className="text-[13px] mt-0.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

export function AnalyticsView({ range, dispatch }: { range: Spec; dispatch: Dispatch }) {
  const key = JSON.stringify(range);
  const pre = range.from && range.to ? revenuePrefetch.get(`${range.from}|${range.to}`) : undefined;
  const [data, setData] = useState<RevenueRange | null>(pre ?? cache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');

  useEffect(() => {
    const hit = (range.from && range.to ? revenuePrefetch.get(`${range.from}|${range.to}`) : undefined) ?? cache.get(key);
    setError(null);
    if (hit) { setData(hit); return; }
    let live = true;
    adminPost('revenue-range', { range }).then((r: RevenueRange) => { if (!live) return; cache.set(key, r); setData(r); }, e => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { if (data) { setFrom(data.from); setTo(data.to); } }, [data]);

  // Running total so the curve reads as "how the period built up"; daily is the second line.
  const running = useMemo(() => { let t = 0; return (data?.series ?? []).map(p => (t += p.collected)); }, [data]);
  const setRange = (spec: Spec) => dispatch({ type: 'range', range: spec });

  if (error) return <div className="max-w-xl mx-auto"><ErrorState message={`Couldn't load revenue: ${error}`} /></div>;

  return (
    <div className="jv-glass jv-pop max-w-[1180px] mx-auto p-5 sm:p-7 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-bold uppercase tracking-[0.24em]" style={{ color: C.cyan }}>{data ? `${heading(data)} revenue` : 'Revenue'}</div>
          <div className="flex items-center gap-2 text-[15px] mt-1" style={{ color: C.text2 }}><CalendarRange size={15} />{data ? span(data.from, data.to) : '…'}</div>
          <div className="text-[44px] sm:text-[56px] font-bold tabular-nums leading-none mt-3" style={{ color: C.text }}>
            {data ? <CountUp value={data.collected} format={v => money(v, 2)} /> : <Skeleton className="h-14 w-64" />}
          </div>
          {data && <div className="mt-2"><TrendIndicator changePct={data.changePct} label={data.changePct == null ? 'nothing to compare yet' : `vs ${span(data.previous.from, data.previous.to)} (${money(data.previous.collected, 2)})`} size={14} /></div>}
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:items-end w-full sm:w-auto">
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {CHIPS.map(c => (
              <button key={c.label} type="button" onClick={() => setRange(c.spec)} className="cc-btn text-[13px] font-semibold px-3 h-9 rounded-lg"
                style={JSON.stringify(c.spec) === key ? { background: 'rgba(52,214,255,0.18)', color: C.text, border: `1px solid ${C.cyan}` } : { color: C.text2, border: `1px solid ${C.border}` }}>{c.label}</button>
            ))}
          </div>
          <form className="flex flex-wrap items-center gap-2 sm:justify-end" onSubmit={e => { e.preventDefault(); if (from && to) setRange({ from, to }); }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From" className="h-9 rounded-lg px-2.5 text-[14px] outline-none" style={{ background: 'rgba(3,10,17,0.8)', border: `1px solid ${C.border}`, color: C.text, colorScheme: 'dark' }} />
            <span style={{ color: C.muted }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To" className="h-9 rounded-lg px-2.5 text-[14px] outline-none" style={{ background: 'rgba(3,10,17,0.8)', border: `1px solid ${C.border}`, color: C.text, colorScheme: 'dark' }} />
            <ActionButton size="sm" type="submit">Show</ActionButton>
          </form>
        </div>
      </div>

      {data ? (
        <AreaChart labels={data.series.map(p => p.date)} height={260} formatLabel={s => d(s, { month: 'short', day: 'numeric' })}
          series={[
            { key: 'running', label: 'Running total', color: C.cyan, values: running, format: v => money(v, 2) },
            { key: 'daily', label: 'Collected that day', color: C.green, values: data.series.map(p => p.collected), format: v => money(v, 2) },
          ]} />
      ) : <Skeleton className="h-[260px]" />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Receipt} label="Jobs paid" value={data ? String(data.jobsPaid) : '—'} sub="jobs with money in this period" />
        <Stat icon={TrendingUp} label="Avg ticket" value={data ? money(data.averageTicket, 2) : '—'} sub="collected ÷ jobs paid" />
        <Stat icon={Wallet} label="Net profit" value={data ? money(data.netProfit, 2) : '—'} sub="after sales tax, parts and helper pay" color={C.green} />
        <Stat icon={AlertCircle} label="Outstanding" value={data ? money(data.outstanding.total, 2) : '—'} sub={data ? `${data.outstanding.count} unpaid job${data.outstanding.count === 1 ? '' : 's'}, as of now` : undefined} color={C.amber} />
      </div>
    </div>
  );
}
