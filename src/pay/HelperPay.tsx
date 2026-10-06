// Helper pay (/admin/pay and the admin "Helpers" tab): who helps, what they
// earned (hours or a flat amount for a job), what you paid them, what you owe.
// Payouts are the business cost: net profit subtracts them on the day paid
// (shared/business-metrics.js laborPaid). Rules: shared/pay.js. Server:
// functions/_lib/pay.js (pay-* actions in /admin-api-data). Tables: pay_migration.sql.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminPost, getAllJobs, type Job } from '../JobOps';
import { PAY_KINDS, PAYOUT_METHODS, NEC_THRESHOLD, balances, entryAmount, cents } from '../../shared/pay.js';
import { phoenixYmd, addDaysYmd } from '../../shared/business-metrics.js';

type Person = { id: string; name: string; phone: string | null; email: string | null; pay_method: string | null; hourly_rate: number | null; job_rate: number | null; active: boolean; notes: string | null };
type Entry = { id: string; person_id: string; booking_id: string | null; work_date: string; kind: keyof typeof PAY_KINDS; hours: number | null; rate: number | null; amount: number; note: string | null };
type Payout = { id: string; person_id: string; paid_on: string; amount: number; method: string | null; reference: string | null; note: string | null };
type Panel = null | { type: 'person'; person?: Person } | { type: 'work'; personId?: string } | { type: 'payout'; personId?: string };

const $ = (n: number | null | undefined) => `$${Number(n || 0).toFixed(2)}`;
const input = 'w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 min-w-0';
const label = 'block text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-1';
const fmtDay = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const jobLabel = (j: Job) => `${`${j.fname} ${j.lname}`.trim() || 'Job'} · ${j.vehicle || 'vehicle?'}`;

export function HelperPay() {
  const [data, setData] = useState<{ people: Person[]; entries: Entry[]; payouts: Payout[] } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState<string>('all');
  const today = phoenixYmd(new Date());
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);

  const load = useCallback(async () => {
    try { setData(await adminPost('pay-data')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); getAllJobs().then(setJobs, () => {}); }, [load]);

  const people = data?.people || [];
  const rows = useMemo(() => balances(people, data?.entries || [], data?.payouts || [], year), [people, data, year]);
  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const nameOf = (id: string) => people.find(p => p.id === id)?.name || 'Unknown';
  const owedTotal = rows.reduce((s, r) => s + Math.max(0, r.owed), 0);
  const paidMonth = (data?.payouts || []).filter(p => p.paid_on.startsWith(month)).reduce((s, p) => s + Number(p.amount), 0);
  const paidYear = (data?.payouts || []).filter(p => p.paid_on.startsWith(year)).reduce((s, p) => s + Number(p.amount), 0);

  const activity = useMemo(() => {
    const list = [
      ...(data?.entries || []).map(e => ({ kind: 'entry' as const, date: e.work_date, id: e.id, person: e.person_id, amount: Number(e.amount), e })),
      ...(data?.payouts || []).map(p => ({ kind: 'payout' as const, date: p.paid_on, id: p.id, person: p.person_id, amount: -Number(p.amount), p })),
    ].filter(x => filter === 'all' || x.person === filter);
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
  }, [data, filter]);

  async function remove(kind: 'entry' | 'payout', id: string, what: string) {
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return;
    try { await adminPost(kind === 'entry' ? 'pay-entry-delete' : 'pay-payout-delete', { id }); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  if (error && !data) return <div className="border border-amber-800 text-amber-300 text-sm p-4">{error}</div>;
  if (!data) return <p className="text-gray-500 text-sm py-8 text-center">Loading helper pay…</p>;

  return (
    <div className="space-y-6">
      {error && <div className="border border-red-800 text-red-300 text-sm p-3" role="alert">{error}</div>}

      <div className="grid grid-cols-3 gap-3">
        {[['You owe', owedTotal, owedTotal > 0 ? 'text-amber-400' : 'text-white'], ['Paid this month', paidMonth, 'text-white'], [`Paid in ${year}`, paidYear, 'text-white']].map(([l, v, c]) => (
          <div key={l as string} className="bg-gray-900 border border-gray-800 p-3 sm:p-4">
            <div className={`text-lg sm:text-2xl font-black tabular-nums ${c}`}>{$(v as number)}</div>
            <div className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPanel({ type: 'work' })} disabled={!people.length} className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-4 py-3">+ Log work</button>
        <button type="button" onClick={() => setPanel({ type: 'payout' })} disabled={!people.length} className="border border-gray-600 text-gray-200 hover:border-white disabled:opacity-40 text-xs font-bold uppercase tracking-widest px-4 py-3">💸 Record payment</button>
        <button type="button" onClick={() => setPanel({ type: 'person' })} className="border border-gray-700 text-gray-400 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-3 sm:ml-auto">+ Add helper</button>
      </div>

      {panel?.type === 'person' && <PersonForm person={panel.person} onClose={() => setPanel(null)} onSaved={async () => { setPanel(null); await load(); }} />}
      {panel?.type === 'work' && <WorkForm people={people.filter(p => p.active)} personId={panel.personId} jobs={jobs} today={today} onClose={() => setPanel(null)} onSaved={async () => { setPanel(null); await load(); }} />}
      {panel?.type === 'payout' && <PayoutForm people={people} rows={rows} personId={panel.personId} today={today} onClose={() => setPanel(null)} onSaved={async () => { setPanel(null); await load(); }} />}

      {!people.length ? (
        <div className="bg-gray-900 border border-gray-800 p-5 text-sm text-gray-400 space-y-2">
          <p className="text-white font-bold">Add your first helper</p>
          <p>Tap <b className="text-white">+ Add helper</b>, enter their name, how you pay them (e.g. Venmo @name) and their usual rate. Then log work after each job and record each Venmo.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.person.id} className={`bg-gray-900 border p-4 ${r.person.active ? 'border-gray-800' : 'border-gray-900 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-bold truncate">{r.person.name}{!r.person.active && <span className="text-gray-500 font-normal"> · inactive</span>}</p>
                  <p className="text-gray-500 text-xs truncate">{[r.person.hourly_rate != null ? `${$(r.person.hourly_rate)}/hr` : '', r.person.job_rate != null ? `${$(r.person.job_rate)}/job` : '', r.person.pay_method || ''].filter(Boolean).join(' · ') || 'No rates set'}</p>
                </div>
                <button type="button" onClick={() => setPanel({ type: 'person', person: r.person as Person })} className="text-gray-500 hover:text-white text-xs underline flex-shrink-0">Edit</button>
              </div>
              <div className="flex items-end justify-between mt-3">
                <div>
                  <div className={`text-2xl font-black tabular-nums ${r.owed > 0 ? 'text-amber-400' : r.owed < 0 ? 'text-cyan-400' : 'text-white'}`}>{$(Math.abs(r.owed))}</div>
                  <div className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">{r.owed > 0 ? 'You owe' : r.owed < 0 ? 'Paid ahead' : 'All paid up'}</div>
                </div>
                <div className="text-right text-xs text-gray-500">Paid in {year}: <span className="text-gray-300 tabular-nums">{$(r.paidYear)}</span></div>
              </div>
              {r.needs1099 && <p className="text-amber-400 text-xs mt-2">Paid {$(NEC_THRESHOLD)}+ this year: you'll likely need to send them a 1099-NEC (ask your tax preparer).</p>}
              {r.person.active && (
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setPanel({ type: 'work', personId: r.person.id })} className="flex-1 border border-gray-700 text-gray-200 hover:border-red-600 text-[11px] font-bold uppercase tracking-widest py-2">Log work</button>
                  <button type="button" onClick={() => setPanel({ type: 'payout', personId: r.person.id })} className="flex-1 border border-gray-700 text-gray-200 hover:border-red-600 text-[11px] font-bold uppercase tracking-widest py-2">Pay</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activity.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">History</p>
            {people.length > 1 && (
              <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Show history for" className="bg-gray-900 border border-gray-700 text-gray-300 text-xs px-2 py-1.5">
                <option value="all">Everyone</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="divide-y divide-gray-800 border border-gray-800 bg-gray-900">
            {activity.map(a => {
              const job = a.kind === 'entry' && a.e.booking_id ? jobById.get(a.e.booking_id) : null;
              const what = a.kind === 'entry'
                ? `${a.e.kind === 'hours' ? `${a.e.hours} hr × ${$(a.e.rate)}` : PAY_KINDS[a.e.kind]}${job ? ` · ${jobLabel(job)}` : a.e.booking_id ? ' · job' : ''}${a.e.note ? ` · ${a.e.note}` : ''}`
                : `Paid${a.p.method ? ` by ${a.p.method}` : ''}${a.p.reference ? ` · ${a.p.reference}` : ''}${a.p.note ? ` · ${a.p.note}` : ''}`;
              return (
                <div key={`${a.kind}-${a.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="text-gray-500 text-xs w-20 flex-shrink-0">{fmtDay(a.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-white">{nameOf(a.person)}</span>
                    <span className="block text-gray-500 text-xs truncate">{what}</span>
                  </span>
                  <span className={`tabular-nums font-bold ${a.kind === 'entry' ? 'text-amber-400' : 'text-emerald-400'}`}>{a.kind === 'entry' ? `+${$(a.amount)}` : `−${$(-a.amount)}`}</span>
                  <button type="button" onClick={() => remove(a.kind, a.id, a.kind === 'entry' ? 'this work entry' : 'this payment')} aria-label="Delete" className="text-gray-600 hover:text-red-400 px-1">×</button>
                </div>
              );
            })}
          </div>
          <p className="text-gray-600 text-xs mt-2"><span className="text-amber-400">+ amber</span> = earned (you owe it) · <span className="text-emerald-400">− green</span> = paid. Payments lower net profit on the day you paid them.</p>
        </div>
      )}

      <details className="bg-gray-900 border border-gray-800 p-4 text-sm text-gray-400">
        <summary className="cursor-pointer text-white font-bold">How should I pay a helper?</summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p><b className="text-white">Hourly</b> is the simplest and fairest for someone who comes along to help: log the hours after each job and pay the total.</p>
          <p><b className="text-white">Flat per job</b> (e.g. $40 a job) is easier if jobs are similar in length; set a per-job rate and pick the job.</p>
          <p>Someone who helps now and then and isn't on a payroll is usually paid as an <b className="text-white">independent contractor</b>: no tax is withheld, they report it on their own taxes. Have them fill out a W-9 once. If you pay one person {$(NEC_THRESHOLD)} or more in a year (2026 rule), you send them a 1099-NEC by January 31. If you control their schedule and how they work like a regular employee, ask a tax preparer whether they should be on payroll instead.</p>
          <p>Paying by Venmo from Bluevine: record the payment here with the same amount and date, and the Money tab counts that Venmo as helper pay instead of "paid yourself back".</p>
        </div>
      </details>
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-red-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between"><p className="text-white font-bold">{title}</p><button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-sm" aria-label="Close">✕</button></div>
      {children}
    </div>
  );
}

function useSave(onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (action: string, args: Record<string, unknown>) => {
    setBusy(true); setErr('');
    try { await adminPost(action, args); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return { busy, err, run };
}

function PersonForm({ person, onClose, onSaved }: { person?: Person; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: person?.name || '', pay_method: person?.pay_method || '', phone: person?.phone || '', hourly_rate: person?.hourly_rate != null ? String(person.hourly_rate) : '', job_rate: person?.job_rate != null ? String(person.job_rate) : '', notes: person?.notes || '', active: person?.active ?? true });
  const { busy, err, run } = useSave(onSaved);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'active' ? e.target.checked : e.target.value });
  return (
    <Shell title={person ? `Edit ${person.name}` : 'Add a helper'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={label}>Name</span><input className={input} value={f.name} onChange={set('name')} placeholder="First and last name" /></label>
        <label><span className={label}>How you pay them</span><input className={input} value={f.pay_method} onChange={set('pay_method')} placeholder="Venmo @name" /></label>
        <label><span className={label}>Hourly rate (optional)</span><input className={input} inputMode="decimal" value={f.hourly_rate} onChange={set('hourly_rate')} placeholder="20.00" /></label>
        <label><span className={label}>Per-job rate (optional)</span><input className={input} inputMode="decimal" value={f.job_rate} onChange={set('job_rate')} placeholder="40.00" /></label>
        <label><span className={label}>Phone (optional)</span><input className={input} inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
        <label><span className={label}>Notes (optional)</span><input className={input} value={f.notes} onChange={set('notes')} placeholder="W-9 received Oct 2026" /></label>
      </div>
      {person && <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" checked={f.active} onChange={set('active')} /> Still helping (uncheck to hide from new entries)</label>}
      {err && <p className="text-red-400 text-sm" role="alert">{err}</p>}
      <button type="button" disabled={busy || !f.name.trim()} onClick={() => run('pay-person-save', { id: person?.id, fields: f })} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3">{busy ? 'Saving…' : 'Save'}</button>
    </Shell>
  );
}

function WorkForm({ people, personId, jobs, today, onClose, onSaved }: { people: Person[]; personId?: string; jobs: Job[]; today: string; onClose: () => void; onSaved: () => void }) {
  const [pid, setPid] = useState(personId || people[0]?.id || '');
  const person = people.find(p => p.id === pid);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<keyof typeof PAY_KINDS>(person?.hourly_rate != null || person?.job_rate == null ? 'hours' : 'job');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState(person?.hourly_rate != null ? String(person.hourly_rate) : '');
  const [amount, setAmount] = useState(person?.job_rate != null ? String(person.job_rate) : '');
  const [bookingId, setBookingId] = useState('');
  const [note, setNote] = useState('');
  const { busy, err, run } = useSave(onSaved);
  useEffect(() => { setRate(person?.hourly_rate != null ? String(person.hourly_rate) : ''); setAmount(person?.job_rate != null ? String(person.job_rate) : ''); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jobs that day first, then the 3 days either side — the one they helped on is almost always there.
  const nearby = useMemo(() => jobs.filter(j => !j.dateTbd && j.date >= addDaysYmd(date, -3) && j.date <= addDaysYmd(date, 3) && j.jobStatus !== 'CANCELLED')
    .sort((a, b) => Number(b.date === date) - Number(a.date === date) || a.date.localeCompare(b.date)), [jobs, date]);
  useEffect(() => { const same = nearby.filter(j => j.date === date); setBookingId(same.length === 1 ? same[0].id : ''); }, [date, nearby]);
  const total = kind === 'hours' ? entryAmount({ kind, hours: Number(hours), rate: Number(rate) }) : cents(amount);

  return (
    <Shell title="Log work" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={label}>Who</span>
          <select className={input} value={pid} onChange={e => setPid(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label><span className={label}>Day</span><input type="date" className={input} value={date} max={addDaysYmd(today, 1)} onChange={e => setDate(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className={label}>Job they helped on</span>
          <select className={input} value={bookingId} onChange={e => setBookingId(e.target.value)}>
            <option value="">No specific job</option>
            {nearby.map(j => <option key={j.id} value={j.id}>{j.date === date ? '' : `${fmtDay(j.date)} · `}{jobLabel(j)}{j.time ? ` · ${j.time}` : ''}</option>)}
          </select></label>
      </div>
      <div className="grid grid-cols-3 border border-gray-700" role="radiogroup" aria-label="Pay type">
        {(Object.keys(PAY_KINDS) as (keyof typeof PAY_KINDS)[]).map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`py-2.5 text-[11px] font-bold uppercase tracking-wider ${kind === k ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{PAY_KINDS[k]}</button>
        ))}
      </div>
      {kind === 'hours' ? (
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Hours</span><input className={input} inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder="2.5" autoFocus /></label>
          <label><span className={label}>Rate per hour</span><input className={input} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="20.00" /></label>
        </div>
      ) : (
        <label><span className={label}>Amount</span><input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="40.00" autoFocus /></label>
      )}
      <label><span className={label}>Note (optional)</span><input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Held the light, ran for parts…" /></label>
      {err && <p className="text-red-400 text-sm" role="alert">{err}</p>}
      <button type="button" disabled={busy || !pid || !(total > 0)} onClick={() => run('pay-entry-add', { fields: { person_id: pid, work_date: date, kind, hours, rate, amount, booking_id: bookingId || null, note } })}
        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3">{busy ? 'Saving…' : `Save · ${$(total)} earned`}</button>
    </Shell>
  );
}

function PayoutForm({ people, rows, personId, today, onClose, onSaved }: { people: Person[]; rows: ReturnType<typeof balances>; personId?: string; today: string; onClose: () => void; onSaved: () => void }) {
  const owedOf = (id: string) => Math.max(0, rows.find(r => r.person.id === id)?.owed || 0);
  const [pid, setPid] = useState(personId || rows.find(r => r.owed > 0)?.person.id || people[0]?.id || '');
  const [amount, setAmount] = useState(() => { const o = owedOf(personId || rows.find(r => r.owed > 0)?.person.id || ''); return o ? o.toFixed(2) : ''; });
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState(() => (/venmo/i.test(people.find(p => p.id === pid)?.pay_method || 'venmo') ? 'Venmo' : 'Other'));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const { busy, err, run } = useSave(onSaved);
  const choose = (id: string) => { setPid(id); const o = owedOf(id); setAmount(o ? o.toFixed(2) : ''); };
  return (
    <Shell title="Record a payment" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={label}>Paid to</span>
          <select className={input} value={pid} onChange={e => choose(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}{owedOf(p.id) ? ` (owed ${$(owedOf(p.id))})` : ''}</option>)}</select></label>
        <label><span className={label}>Amount</span><input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label><span className={label}>Day you paid</span><input type="date" className={input} value={date} max={today} onChange={e => setDate(e.target.value)} /></label>
        <label><span className={label}>How</span>
          <select className={input} value={method} onChange={e => setMethod(e.target.value)}>{PAYOUT_METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="sm:col-span-2"><span className={label}>Note (optional)</span><input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Week of Oct 6" /></label>
      </div>
      {method === 'Venmo' && <label><span className={label}>Venmo note or ID (optional)</span><input className={input} value={reference} onChange={e => setReference(e.target.value)} /></label>}
      <p className="text-gray-500 text-xs">This lowers net profit on the day you paid. If the Venmo went out from Bluevine, use the same amount and the Money tab will match it.</p>
      {err && <p className="text-red-400 text-sm" role="alert">{err}</p>}
      <button type="button" disabled={busy || !pid || !(Number(amount) > 0)} onClick={() => run('pay-payout-add', { fields: { person_id: pid, paid_on: date, amount, method, reference, note } })}
        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3">{busy ? 'Saving…' : `Record ${$(Number(amount) || 0)} paid`}</button>
    </Shell>
  );
}

// /admin/pay on its own: same PIN as /admin (Cloudflare Access already guards /admin/*).
export default function HelperPayPage({ Gate }: { Gate: React.ComponentType<{ onUnlock: () => void }> }) {
  const [unlocked, setUnlocked] = useState(() => { try { return sessionStorage.getItem('gg_admin_auth') === '1'; } catch { return false; } });
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return (
    <div className="min-h-screen bg-dark text-light px-3 sm:px-6 py-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="max-w-3xl mx-auto">
        <a href="/admin" className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest">← Admin</a>
        <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mt-4 mb-1">Admin · GID Garage</p>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-5">Helper Pay</h1>
        <HelperPay />
      </div>
    </div>
  );
}
