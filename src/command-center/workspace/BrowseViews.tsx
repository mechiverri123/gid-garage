// Jarvis Jobs and Customers: searchable lists over the same list-bookings data
// the admin Jobs/Customers tabs use. Picking one opens it in the job overlay.
import { useMemo, useState } from 'react';
import { Search, Briefcase, Users, ChevronRight } from 'lucide-react';
import type { Job } from '../../JobOps';
import { jobMoney, isAwaitingPayment, jobBalance, isCancelled } from '../../../shared/business-rules.js';
import { collectedRevenue } from '../../../shared/business-metrics.js';
import { C, money, shortDay } from '../ui/theme';
import { StatusBadge, Skeleton, ErrorState, EmptyState, ActionButton } from '../ui/primitives';
import { useAllJobs, jobTitle } from './jobStore';

type Dispatch = (a: { type: string; [k: string]: unknown }) => void;

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' }, { value: 'all', label: 'All' },
];
function statusMatch(j: Job, s: string) {
  if (s === 'all') return true;
  if (s === 'active') return !isCancelled(j) && j.jobStatus !== 'PAID';
  if (s === 'unpaid') return isAwaitingPayment(j) && jobBalance(j) > 0.01;
  if (s === 'CANCELLED') return isCancelled(j);
  return j.jobStatus === s && !isCancelled(j);
}
const haystack = (j: Job) => `${j.fname} ${j.lname} ${j.phone} ${j.email} ${j.vehicle} ${j.vin} ${j.service} ${jobTitle(j)}`.toLowerCase();

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex-1 min-w-[220px]">
      <span className="sr-only">{placeholder}</span>
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color={C.text2} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus
        className="w-full h-11 rounded-xl pl-10 pr-3 text-[15px] outline-none" style={{ background: 'rgba(3,10,17,0.8)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
    </label>
  );
}

export function JobListView({ query, status, dispatch }: { query: string; status: string; dispatch: Dispatch }) {
  const { jobs, error } = useAllJobs();
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? []).filter(j => statusMatch(j, status) && (!q || q.split(/\s+/).every(w => haystack(j).includes(w))))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [jobs, query, status]);
  const open = (j: Job) => dispatch({ type: 'open', view: { type: 'jobs', jobIds: [j.id] } });

  return (
    <div className="jv-glass jv-pop max-w-[1180px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[22px] font-bold mr-2" style={{ color: C.text }}><Briefcase size={22} color={C.cyan} />Jobs</h2>
        <SearchBox value={query} onChange={v => dispatch({ type: 'filter', query: v })} placeholder="Search name, vehicle, phone, service…" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(f => (
          <button key={f.value} type="button" onClick={() => dispatch({ type: 'filter', status: f.value })} className="cc-btn text-[13px] font-semibold px-3 h-9 rounded-lg"
            style={f.value === status ? { background: 'rgba(52,214,255,0.18)', color: C.text, border: `1px solid ${C.cyan}` } : { color: C.text2, border: `1px solid ${C.border}` }}>{f.label}</button>
        ))}
        {jobs && <span className="self-center text-[13.5px] ml-1" style={{ color: C.muted }}>{rows.length} job{rows.length === 1 ? '' : 's'}</span>}
      </div>
      {error ? <ErrorState message={`Couldn't load jobs: ${error}`} /> : !jobs ? <Skeleton className="h-[360px]" /> : !rows.length ? <EmptyState icon={Briefcase} title="No jobs match">Try another name or filter.</EmptyState> : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, limit).map(j => {
            const m = jobMoney(j);
            return (
              <button key={j.id} type="button" onClick={() => open(j)} className="cc-btn w-full text-left rounded-xl px-4 py-3 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1"
                style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
                <span className="hidden sm:block text-[14px] font-semibold tabular-nums" style={{ color: C.cyan }}>{j.dateTbd ? 'TBD' : shortDay(j.date)}</span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold truncate" style={{ color: C.text }}>{`${j.fname} ${j.lname}`.trim() || '—'}</span>
                  <span className="block text-[13.5px] truncate sm:hidden" style={{ color: C.text2 }}>{j.dateTbd ? 'TBD' : shortDay(j.date)} · {jobTitle(j)}</span>
                </span>
                <span className="hidden sm:block min-w-0">
                  <span className="block text-[14.5px] truncate" style={{ color: C.text }}>{jobTitle(j)}</span>
                  <span className="block text-[13px] truncate" style={{ color: C.text2 }}>{j.vehicle}</span>
                </span>
                <span className="hidden sm:block"><StatusBadge status={isCancelled(j) ? 'CANCELLED' : j.jobStatus} /></span>
                <span className="flex items-center gap-2 text-[15px] font-semibold tabular-nums" style={{ color: C.text }}>{money(m.invoiceTotal ?? m.estimateTotal, 2)}<ChevronRight size={17} color={C.muted} /></span>
              </button>
            );
          })}
          {rows.length > limit && <div className="flex justify-center pt-2"><ActionButton onClick={() => setLimit(l => l + 40)}>Show more</ActionButton></div>}
        </div>
      )}
    </div>
  );
}

interface Person { key: string; name: string; phone: string; vehicles: string[]; jobs: Job[]; last: string; collected: number }

export function CustomersView({ query, dispatch }: { query: string; dispatch: Dispatch }) {
  const { jobs, error } = useAllJobs();
  const [limit, setLimit] = useState(40);
  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const j of jobs ?? []) {
      if (j.status === 'deleted') continue;
      const name = `${j.fname || ''} ${j.lname || ''}`.trim();
      const key = j.customerId || `${name.toLowerCase()}|${String(j.phone || '').replace(/\D/g, '').slice(-10)}`;
      const p = map.get(key) ?? { key, name, phone: j.phone, vehicles: [], jobs: [], last: '', collected: 0 };
      p.jobs.push(j);
      if (j.vehicle && !p.vehicles.includes(j.vehicle)) p.vehicles.push(j.vehicle);
      if (!j.dateTbd && j.date > p.last) { p.last = j.date; p.name = name || p.name; p.phone = j.phone || p.phone; }
      map.set(key, p);
    }
    // Lifetime collected with the canonical revenue rule (all dates).
    for (const p of map.values()) p.collected = collectedRevenue(p.jobs, () => true).total;
    const q = query.trim().toLowerCase();
    return [...map.values()]
      .filter(p => !q || q.split(/\s+/).every(w => `${p.name} ${p.phone} ${p.vehicles.join(' ')}`.toLowerCase().includes(w)))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [jobs, query]);
  const open = (p: Person) => {
    const ids = [...p.jobs].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12).reverse().map(j => j.id);
    dispatch({ type: 'open', view: { type: 'jobs', jobIds: ids, title: p.name, focus: ids.length - 1 } });
  };

  return (
    <div className="jv-glass jv-pop max-w-[1180px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[22px] font-bold mr-2" style={{ color: C.text }}><Users size={22} color={C.cyan} />Customers</h2>
        <SearchBox value={query} onChange={v => dispatch({ type: 'filter', query: v })} placeholder="Search name, phone, vehicle…" />
      </div>
      {error ? <ErrorState message={`Couldn't load customers: ${error}`} /> : !jobs ? <Skeleton className="h-[360px]" /> : !people.length ? <EmptyState icon={Users} title="No customers match" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {people.slice(0, limit).map(p => (
            <button key={p.key} type="button" onClick={() => open(p)} className="cc-btn w-full text-left rounded-xl px-4 py-3 flex items-center gap-4 min-w-0" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
              <span className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-[16px] font-bold" style={{ background: 'rgba(52,214,255,0.12)', color: C.cyan, border: `1px solid ${C.border}` }}>{(p.name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-semibold truncate" style={{ color: C.text }}>{p.name || 'Unnamed'}</span>
                <span className="block text-[13.5px] truncate" style={{ color: C.text2 }}>{p.vehicles.slice(0, 2).join(' · ') || p.phone || '—'}</span>
                <span className="block text-[13px]" style={{ color: C.muted }}>{p.jobs.length} job{p.jobs.length === 1 ? '' : 's'}{p.last ? ` · last ${shortDay(p.last)}` : ''}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[15px] font-semibold tabular-nums" style={{ color: p.collected > 0 ? C.green : C.text2 }}>{money(p.collected, 2)}</span>
                <span className="block text-[12px]" style={{ color: C.muted }}>collected</span>
              </span>
            </button>
          ))}
          {people.length > limit && <div className="md:col-span-2 flex justify-center pt-2"><ActionButton onClick={() => setLimit(l => l + 40)}>Show more</ActionButton></div>}
        </div>
      )}
    </div>
  );
}
