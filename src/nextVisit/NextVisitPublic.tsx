// Customer side of the next-visit check, in the invoice's look:
//   NextVisitInvoice: "Recommended for your next visit" on the invoice — approve
//     or decline each item and pick a date/time (screen); a clean list when printed.
//   NextVisitReport: the full checklist, used by the inspection-only page.
// Answers go to /api-customer next-visit-respond (one new job, answered once).
import { useEffect, useMemo, useState } from 'react';
import { recommendations, NV_STATUS, type NextVisit, type NvItem, type NvStatus } from '../../shared/next-visit.js';
import { slotsForDate, isBookableSlot, phoenixHour } from '../../shared/booking-slots.js';
import { phoenixYmd, addDaysYmd } from '../../shared/business-metrics.js';

const DOT: Record<NvStatus, string> = { good: '#10b981', soon: '#f59e0b', now: '#dc2626' };
const fmtDay = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); };

async function api<T>(action: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api-customer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) });
  const text = await res.text();
  let body: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body as T;
}

function Media({ item }: { item: NvItem }) {
  if (!item.media?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {item.media.map(m => m.kind === 'video'
        ? <video key={m.id} src={m.url} controls playsInline className="w-full sm:w-48 max-h-40 bg-black no-print" />
        : <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block page-break-avoid"><img src={m.url} alt={item.label} className="w-28 h-28 sm:w-32 sm:h-32 object-cover border border-white/10 print:w-40 print:h-40" /></a>)}
    </div>
  );
}

function Row({ item, children }: { item: NvItem; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 page-break-avoid">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.status ? DOT[item.status] : '#4b5563' }} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold">{item.service || item.label}</p>
          <p className="text-gray-500 text-xs">{[item.service && item.service !== item.label ? item.label : '', item.status ? NV_STATUS[item.status] : ''].filter(Boolean).join(' · ')}</p>
          {item.note && <p className="text-gray-300 text-sm mt-1 leading-relaxed">{item.note}</p>}
          <Media item={item} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function NextVisitInvoice({ jobId, nextVisit }: { jobId: string; nextVisit?: NextVisit | null }) {
  const recs = useMemo(() => recommendations(nextVisit), [nextVisit]);
  const [response, setResponse] = useState(nextVisit?.response || null);
  const [choice, setChoice] = useState<Record<string, 'yes' | 'no'>>({});
  const today = phoenixYmd(new Date());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [taken, setTaken] = useState<string[]>([]);
  const [blackout, setBlackout] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api<string[]>('blackout-dates', {}).then(b => setBlackout(b || []), () => {}); }, []);
  useEffect(() => {
    setTime(''); setTaken([]);
    if (date) api<string[]>('booked-slots', { date }).then(t => setTaken(t || []), () => {});
  }, [date]);

  if (!recs.length) return null;
  const approved = recs.filter(r => choice[r.id] === 'yes');
  const allAnswered = recs.every(r => choice[r.id]);
  const slots = date ? slotsForDate(date).filter(t => isBookableSlot(date, t, { today, nowHour: phoenixHour(), taken, blackout })) : [];
  const answeredLabel = (id: string) => (response?.approved.includes(id) ? 'Requested' : response?.declined.includes(id) ? 'Not now' : '');

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await api<NonNullable<NextVisit['response']>>('next-visit-respond', {
        id: jobId, approved: approved.map(a => a.id), declined: recs.filter(r => choice[r.id] === 'no').map(d => d.id),
        ...(approved.length ? { date, time } : {}),
      });
      setResponse(r);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); if (date) api<string[]>('booked-slots', { date }).then(t => setTaken(t || []), () => {}); }
    setBusy(false);
  }

  return (
    <div className="mt-4 border border-white/10 bg-white/5 page-break-avoid print:border-0 print:bg-transparent">
      <div className="px-6 pt-5 pb-3 print:px-0">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Recommended for your next visit</p>
        <p className="text-gray-400 text-sm mt-1">From the free next-visit check we did on your vehicle. {response ? '' : "Choose what you'd like us to take care of next time — we'll quote it before any work."}</p>
      </div>
      <div className="divide-y divide-white/5 border-t border-white/10">
        {recs.map(item => (
          <Row key={item.id} item={item}>
            {response ? (
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 border flex-shrink-0 ${response.approved.includes(item.id) ? 'border-emerald-700 text-emerald-400' : 'border-gray-700 text-gray-500'}`}>{answeredLabel(item.id)}</span>
            ) : (
              <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0 no-print">
                <button type="button" onClick={() => setChoice(c => ({ ...c, [item.id]: 'yes' }))} aria-pressed={choice[item.id] === 'yes'}
                  className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 border transition-colors ${choice[item.id] === 'yes' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-600 text-gray-300 hover:border-red-600'}`}>Yes, next time</button>
                <button type="button" onClick={() => setChoice(c => ({ ...c, [item.id]: 'no' }))} aria-pressed={choice[item.id] === 'no'}
                  className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 border transition-colors ${choice[item.id] === 'no' ? 'bg-gray-600 border-gray-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>Not now</button>
              </div>
            )}
          </Row>
        ))}
      </div>

      {response ? (
        <div className="px-6 py-4 border-t border-white/10 text-sm text-gray-300 print:px-0">
          {response.jobId ? <>Thanks! You're booked for <b className="text-white">{fmtDay(response.date!)} at {response.time}</b>. We'll confirm and quote before any work.</> : <>Thanks — we've noted your answers for next time.</>}
        </div>
      ) : (
        <div className="px-6 py-4 border-t border-white/10 space-y-3 no-print">
          {approved.length > 0 && (
            <>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Pick a day and time</p>
              <input type="date" value={date} min={today} max={addDaysYmd(today, 120)} onChange={e => setDate(e.target.value)}
                className="w-full bg-black/40 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-red-600" />
              {date && (slots.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map(t => <button key={t} type="button" onClick={() => setTime(t)} className={`text-sm py-2 border transition-colors ${time === t ? 'bg-red-600 border-red-600 text-white' : 'border-white/15 text-gray-300 hover:border-red-600'}`}>{t}</button>)}
                </div>
              ) : <p className="text-gray-500 text-sm">No open times that day — try another date.</p>)}
            </>
          )}
          {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
          <button type="button" onClick={submit} disabled={busy || !allAnswered || (approved.length > 0 && (!date || !time))}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">
            {busy ? 'Sending…' : approved.length ? 'Book my next visit' : 'Send my answers'}
          </button>
          {!allAnswered && <p className="text-gray-600 text-xs text-center">Choose "Yes, next time" or "Not now" for each item.</p>}
        </div>
      )}
      <div className="px-6 pb-4 print:px-0">
        <a href={`/inspection?id=${encodeURIComponent(jobId)}`} className="text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-widest no-print">View inspection →</a>
        <p className="hidden print:block text-xs text-gray-600">Full inspection: gidgarage.com/inspection?id={jobId}</p>
      </div>
    </div>
  );
}

// The full checklist (inspection-only page): every checked item by category.
export function NextVisitReport({ nextVisit }: { nextVisit?: NextVisit | null }) {
  const items = (nextVisit?.items || []).filter(i => i.status);
  if (!items.length) return <p className="text-gray-500 text-sm px-6 py-5">No checklist items were recorded on this visit.</p>;
  const order: NvStatus[] = ['now', 'soon', 'good'];
  const byCat = items.reduce<Record<string, NvItem[]>>((a, i) => { (a[i.category] ||= []).push(i); return a; }, {});
  const counts = order.map(s => [s, items.filter(i => i.status === s).length] as const);
  return (
    <div>
      <div className="flex flex-wrap gap-4 px-6 py-3 border-b border-white/10 print:px-0">
        {counts.map(([s, n]) => <span key={s} className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DOT[s] }} />{NV_STATUS[s]}: <b className="text-white">{n}</b></span>)}
      </div>
      {Object.entries(byCat).map(([cat, list]) => (
        <div key={cat} className="page-break-avoid">
          <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest px-6 pt-4 pb-1 print:px-0">{cat}</p>
          <div className="divide-y divide-white/5">
            {[...list].sort((a, b) => order.indexOf(a.status!) - order.indexOf(b.status!)).map(i => <Row key={i.id} item={{ ...i, service: i.status === 'good' ? i.label : i.service }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
