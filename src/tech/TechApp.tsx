// /jarvis/tech — the tech's phone app (save to home screen). Under /jarvis so
// Cloudflare Access protects it (CLAUDE.md §0). Pick a job, then work it:
// call / text / navigate, move the status along, photos & videos, the
// next-visit check, parts cost, and getting paid. Reuses the admin panels and
// the same bookings rows/calls as /admin; admin itself is unchanged.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAllJobs, getJobById, patchJob, syncTaxRate, resolveServiceName, PhotoPanel, VideoPanel, PartsCostPanel, PaymentPanel, type Job } from '../JobOps';
import { NextVisitCheck } from '../nextVisit/NextVisitCheck';
import { recommendations } from '../../shared/next-visit.js';
import { statusChangeFields, isCancelled, jobMoney, phoenixToday } from '../../shared/business-rules.js';
import { addDaysYmd as addDays } from '../../shared/business-metrics.js';

type List = 'today' | 'upcoming' | 'recent' | 'search';
type Tab = 'job' | 'photos' | 'next' | 'parts' | 'pay';

const STATUS_LABEL: Record<string, string> = { BOOKED: 'Booked', ESTIMATE_SENT: 'Estimate sent', SIGNED: 'Signed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', INVOICED: 'Invoiced', PAID: 'Paid', CANCELLED: 'Cancelled' };
const STATUS_TONE: Record<string, string> = { IN_PROGRESS: 'text-amber-400 border-amber-700', COMPLETED: 'text-sky-400 border-sky-700', INVOICED: 'text-sky-400 border-sky-700', PAID: 'text-emerald-400 border-emerald-700', CANCELLED: 'text-gray-500 border-gray-700' };
// The one next step from each status (the rest is done in the job's panels).
const NEXT_STEP: Record<string, { to: string; label: string }> = {
  BOOKED: { to: 'IN_PROGRESS', label: 'Start job' }, ESTIMATE_SENT: { to: 'IN_PROGRESS', label: 'Start job' }, SIGNED: { to: 'IN_PROGRESS', label: 'Start job' },
  IN_PROGRESS: { to: 'COMPLETED', label: 'Mark complete' },
};
const minutes = (t: string) => { const m = String(t).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if (!m) return 9999; return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]); };
const dayLabel = (ymd: string, today: string) => (ymd === today ? 'Today' : ymd === addDays(today, 1) ? 'Tomorrow' : new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
const digits = (p: string) => String(p || '').replace(/\D/g, '');
const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`);

function Chip({ status }: { status: string }) {
  return <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border ${STATUS_TONE[status] || 'text-gray-400 border-gray-700'}`}>{STATUS_LABEL[status] || status}</span>;
}

export default function TechApp() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');
  const [list, setList] = useState<List>('today');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(location.search).get('job'));
  const today = phoenixToday();

  const load = useCallback(async () => {
    setError('');
    try { await syncTaxRate().catch(() => {}); setJobs(await getAllJobs()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Back button / swipe closes the job instead of leaving the app.
  useEffect(() => {
    const onPop = () => setOpenId(new URLSearchParams(location.search).get('job'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = (id: string | null) => { history.pushState(null, '', id ? `?job=${encodeURIComponent(id)}` : location.pathname); setOpenId(id); };

  const shown = useMemo(() => {
    const live = (jobs || []).filter(j => !isCancelled(j));
    const s = q.trim().toLowerCase();
    if (list === 'search') return s ? live.filter(j => `${j.fname} ${j.lname} ${j.phone} ${j.vehicle} ${j.vin} ${j.id}`.toLowerCase().includes(s)).slice(0, 40) : [];
    if (list === 'today') return live.filter(j => j.date === today && !j.dateTbd).sort((a, b) => minutes(a.time) - minutes(b.time));
    if (list === 'upcoming') return live.filter(j => j.date > today && !j.dateTbd).sort((a, b) => a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time)).slice(0, 40);
    return live.filter(j => j.date < today).sort((a, b) => b.date.localeCompare(a.date) || minutes(b.time) - minutes(a.time)).slice(0, 40);
  }, [jobs, list, q, today]);

  if (openId) return <JobScreen id={openId} onBack={() => history.back()} onChanged={load} />;

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white pb-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="sticky top-0 z-10 bg-[#0b0b0b]/95 backdrop-blur border-b border-gray-900 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-black tracking-tight">GID <span className="text-red-500">Tech</span></h1>
          <span className="text-gray-500 text-xs">{dayLabel(today, today)} · {new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="grid grid-cols-4 gap-1 mt-3">
          {(['today', 'upcoming', 'recent', 'search'] as List[]).map(l => (
            <button key={l} type="button" onClick={() => setList(l)} className={`py-2 text-[12px] font-bold uppercase tracking-wider border ${list === l ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400'}`}>{l}</button>
          ))}
        </div>
        {list === 'search' && <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Name, phone, vehicle, VIN…" className="mt-2 w-full bg-gray-900 border border-gray-700 text-white px-3 py-2.5 text-[15px] outline-none focus:border-red-600" />}
      </header>
      <main className="px-4 pt-3 space-y-2">
        {error && <div className="border border-red-800 text-red-300 text-sm p-3">{error} <button type="button" className="underline ml-1" onClick={load}>Retry</button></div>}
        {!jobs && !error && <p className="text-gray-500 text-sm py-6 text-center">Loading jobs…</p>}
        {jobs && !shown.length && <p className="text-gray-500 text-sm py-8 text-center">{list === 'search' ? (q ? 'No jobs match.' : 'Search any job.') : list === 'today' ? 'Nothing scheduled today.' : 'No jobs here.'}</p>}
        {shown.map(j => (
          <button key={j.id} type="button" onClick={() => open(j.id)} className="w-full text-left bg-gray-900 border border-gray-800 active:border-red-600 p-3.5 flex gap-3">
            <div className="w-16 flex-shrink-0">
              <div className="text-red-500 text-[13px] font-black">{list === 'today' ? (j.time || 'TBD') : dayLabel(j.date, today)}</div>
              {list !== 'today' && <div className="text-gray-500 text-[12px]">{j.time}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="text-[16px] font-bold truncate">{`${j.fname} ${j.lname}`.trim() || '—'}</span></div>
              <div className="text-gray-300 text-[14px] truncate">{j.vehicle}</div>
              <div className="text-gray-500 text-[13px] truncate">{resolveServiceName(j.service, j.notes)}{j.serviceAddress ? ` · ${j.serviceAddress}` : ''}</div>
              <div className="mt-1.5"><Chip status={j.jobStatus} /></div>
            </div>
          </button>
        ))}
      </main>
    </div>
  );
}

function JobScreen({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>('job');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getJobById(id).then(j => { if (!j) setError('Job not found.'); else { setJob(j); setNotes(j.garageNotes || ''); } }, e => setError(String(e?.message || e))); }, [id]);
  const update = (j: Job) => { setJob(j); onChanged(); };

  if (error) return <Shell onBack={onBack} title="Job"><p className="text-red-300 text-sm p-4">{error}</p></Shell>;
  if (!job) return <Shell onBack={onBack} title="Job"><p className="text-gray-500 text-sm p-6 text-center">Loading…</p></Shell>;

  const name = `${job.fname} ${job.lname}`.trim();
  const step = NEXT_STEP[job.jobStatus];
  const m = jobMoney(job);
  const due = m.balanceDue ?? 0;
  const recs = recommendations(job.inspectionData?.nextVisit).length;
  const payUrl = `${location.origin}/invoice?id=${encodeURIComponent(job.id)}&action=pay`;
  const mapsUrl = `https://maps.apple.com/?daddr=${encodeURIComponent(job.serviceAddress || '')}`;

  async function advance() {
    if (!step || !job) return;
    setBusy(true);
    try { const f = statusChangeFields(job.jobStatus, step.to); await patchJob(job.id, f); update({ ...job, jobStatus: step.to as Job['jobStatus'] }); } catch (e) { setError(String((e as Error)?.message || e)); }
    setBusy(false);
  }
  async function saveNotes() {
    if (!job) return;
    await patchJob(job.id, { garage_notes: notes }); setNotesSaved(true); update({ ...job, garageNotes: notes });
  }
  async function sharePay() {
    const text = `GID Garage — your balance is ${money(due)}. Pay securely here: ${payUrl}`;
    if (navigator.share) { try { await navigator.share({ title: 'GID Garage payment', text, url: payUrl }); return; } catch { /* cancelled */ } }
    location.href = `sms:${digits(job!.phone)}&body=${encodeURIComponent(text)}`;
  }

  const tabs: [Tab, string][] = [['job', 'Job'], ['photos', 'Photos'], ['next', recs ? `Next (${recs})` : 'Next'], ['parts', 'Parts'], ['pay', 'Pay']];
  const action = (href: string, label: string, icon: string) => <a href={href} className="flex flex-col items-center gap-1 py-2.5 bg-gray-900 border border-gray-800 active:border-red-600 text-[12px] font-bold uppercase tracking-wider text-gray-200"><span className="text-lg leading-none">{icon}</span>{label}</a>;

  return (
    <Shell onBack={onBack} title={name || 'Job'} sub={`${job.vehicle}${job.mileage ? ` · ${Number(String(job.mileage).replace(/\D/g, '')).toLocaleString('en-US')} mi` : ''}`}>
      <div className="px-4 pt-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Chip status={job.jobStatus} />
          <span className="text-gray-400 text-[13px]">{job.dateTbd ? 'Date TBD' : `${new Date(`${job.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${job.time}`}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {job.phone ? action(`tel:${digits(job.phone)}`, 'Call', '📞') : <span />}
          {job.phone ? action(`sms:${digits(job.phone)}`, 'Text', '💬') : <span />}
          {job.serviceAddress ? action(mapsUrl, 'Drive', '🧭') : <span />}
          <button type="button" onClick={() => job.vin && navigator.clipboard?.writeText(job.vin)} disabled={!job.vin} className="flex flex-col items-center gap-1 py-2.5 bg-gray-900 border border-gray-800 text-[12px] font-bold uppercase tracking-wider text-gray-200 disabled:opacity-30"><span className="text-lg leading-none">🔢</span>VIN</button>
        </div>
        {step && <button type="button" onClick={advance} disabled={busy} className="w-full bg-red-600 active:bg-red-700 disabled:opacity-50 text-white text-[14px] font-black uppercase tracking-widest py-3.5">{busy ? 'Saving…' : step.label}</button>}

        <div role="tablist" className="grid grid-cols-5 border-b border-gray-800">
          {tabs.map(([t, label]) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`py-2.5 text-[12px] font-bold uppercase tracking-wider border-b-2 -mb-px ${tab === t ? 'border-red-600 text-white' : 'border-transparent text-gray-500'}`}>{label}</button>)}
        </div>

        <div className="pb-10">
          {tab === 'job' && (
            <div className="space-y-4">
              <Info label="Service">{resolveServiceName(job.service, job.notes)}</Info>
              {job.serviceAddress && <Info label="Address"><a href={mapsUrl} className="underline">{job.serviceAddress}</a></Info>}
              {job.vin && <Info label="VIN"><span className="font-mono">{job.vin}</span></Info>}
              {job.lineItems?.length > 0 && <Info label="Work on this job">{job.lineItems.map(li => <div key={li.id} className="flex justify-between gap-3"><span>{li.label}</span><span className="text-gray-400 tabular-nums">{money(li.amount)}</span></div>)}</Info>}
              {job.notes && <Info label="Booking notes"><span className="whitespace-pre-wrap">{job.notes}</span></Info>}
              <div>
                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-1">Technician notes <span className="normal-case tracking-normal font-normal text-gray-600">(shown on the invoice)</span></p>
                <textarea value={notes} onChange={e => { setNotes(e.target.value); setNotesSaved(false); }} rows={4} className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 text-[15px] outline-none focus:border-red-600" />
                {!notesSaved && <button type="button" onClick={saveNotes} className="mt-2 w-full border border-gray-700 text-gray-200 text-[12px] font-bold uppercase tracking-widest py-2.5">Save notes</button>}
              </div>
            </div>
          )}
          {tab === 'photos' && (
            <div className="space-y-6">
              <div><p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-2">Photos</p><PhotoPanel job={job} onUpdate={update} /></div>
              <div><p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-2">Videos</p><VideoPanel job={job} onUpdate={update} /></div>
            </div>
          )}
          {tab === 'next' && <NextVisitCheck job={job} onSaved={d => update({ ...job, inspectionData: d as unknown as Job['inspectionData'] })} />}
          {tab === 'parts' && <PartsCostPanel job={job} onUpdate={update} />}
          {tab === 'pay' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 p-4 text-center">
                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest">{job.jobStatus === 'PAID' ? 'Paid in full' : 'Balance due'}</p>
                <p className="text-4xl font-black tabular-nums mt-1">{money(job.jobStatus === 'PAID' ? m.amountPaid : due)}</p>
                {m.invoiceTotal != null && <p className="text-gray-500 text-[12px] mt-1">Invoice {money(m.invoiceTotal)} incl. tax{m.amountPaid ? ` · paid ${money(m.amountPaid)}` : ''}</p>}
              </div>
              {job.jobStatus !== 'PAID' && due > 0 && (
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(due.toFixed(2)); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                  className="w-full border border-gray-700 active:border-red-600 text-gray-100 text-[13px] font-bold uppercase tracking-widest py-3">
                  {copied ? `✓ ${due.toFixed(2)} copied — paste it in Bluevine` : `📋 Copy amount (${due.toFixed(2)}) for Bluevine Tap to Pay`}
                </button>
              )}
              {job.jobStatus !== 'PAID' && due > 0 && <>
                <button type="button" onClick={sharePay} className="w-full bg-emerald-600 active:bg-emerald-700 text-white text-[14px] font-black uppercase tracking-widest py-3.5">💳 Send pay link to customer</button>
                <p className="text-gray-500 text-[12px] leading-relaxed">They pay by card on their own phone. For an in-person tap: copy the amount, take the tap in the Bluevine app, then record it below as "Card (Tap to Pay)".</p>
              </>}
              <PaymentPanel job={job} onUpdate={update} />
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ onBack, title, sub, children }: { onBack: () => void; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="sticky top-0 z-10 bg-[#0b0b0b]/95 backdrop-blur border-b border-gray-900 px-2 py-2 flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back to jobs" className="w-11 h-11 flex items-center justify-center text-2xl text-gray-300">‹</button>
        <div className="min-w-0"><div className="text-[17px] font-bold truncate">{title}</div>{sub && <div className="text-gray-400 text-[13px] truncate">{sub}</div>}</div>
      </header>
      {children}
    </div>
  );
}
const Info = ({ label, children }: { label: string; children: ReactNode }) => (
  <div><p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mb-1">{label}</p><div className="text-[15px] text-gray-100 space-y-1">{children}</div></div>
);
