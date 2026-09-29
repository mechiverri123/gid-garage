// One job, full size, inside Jarvis: the admin Job Overview rebuilt for this
// screen. Read views are Jarvis-native; editing reuses the admin panels
// themselves (EstimatePanel, PaymentPanel, InspectionPanel, PartsCostPanel and
// the full job editor), re-themed, so every write is the exact admin code path
// on the same booking row. Nothing here keeps its own copy of a job.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Mail, MapPin, Car, CalendarClock, Pencil, CheckCircle2, Circle, FileText, CreditCard, ClipboardCheck, StickyNote, Package, LayoutGrid, ExternalLink, X, AlertTriangle, type LucideIcon } from 'lucide-react';
import { EstimatePanel, PaymentPanel, InspectionPanel, PartsCostPanel, JobDetailPanel as AdminJobEditor, JOB_PIPELINE, patchJob, type Job, type JobStatus } from '../../JobOps';
import { jobMoney, statusChangeFields } from '../../../shared/business-rules.js';
import { JOB_TABS } from '../../../shared/jarvis-workspace.js';
import { C, money, clock, shortDay } from '../ui/theme';
import { StatusBadge, ActionButton, EmptyState } from '../ui/primitives';
import { putJob, jobTitle } from './jobStore';

type Tab = typeof JOB_TABS[number];
const TAB_META: Record<Tab, { label: string; icon: LucideIcon }> = {
  overview: { label: 'Overview', icon: LayoutGrid }, estimate: { label: 'Estimate', icon: FileText }, payment: { label: 'Payment', icon: CreditCard },
  inspection: { label: 'Inspection', icon: ClipboardCheck }, notes: { label: 'Notes', icon: StickyNote }, parts: { label: 'Parts', icon: Package },
};
const PIPE_LABEL: Record<string, string> = { BOOKED: 'Booked', ESTIMATE_SENT: 'Estimate sent', SIGNED: 'Signed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', INVOICED: 'Invoiced', PAID: 'Paid', CANCELLED: 'Cancelled' };
const money2 = (n: number | null | undefined) => money(n, 2);

export function customerName(job: Job) { return `${job.fname || ''} ${job.lname || ''}`.trim() || 'Customer'; }
export function whenLabel(job: Job) { return job.dateTbd ? 'Date TBD' : `${shortDay(job.date)}${job.time && job.time !== 'TBD' ? ` · ${clock(job.time)}` : ''}`; }
export function jobTotal(job: Job) { const m = jobMoney(job); return m.invoiceTotal ?? m.estimateTotal; }

function Section({ title, icon: Icon, children, right }: { title: string; icon?: LucideIcon; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 min-w-0" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: C.text2 }}>{Icon && <Icon size={16} color={C.cyan} />}{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b last:border-b-0" style={{ borderColor: 'rgba(54,211,255,0.08)' }}>
      <span className="text-[14px] shrink-0" style={{ color: C.text2 }}>{label}</span>
      <span className={`text-right min-w-0 break-words tabular-nums ${strong ? 'text-[20px] font-bold' : 'text-[15px] font-medium'}`} style={{ color: C.text }}>{value ?? '—'}</span>
    </div>
  );
}
function Prose({ text, empty }: { text?: string | null; empty: string }) {
  return text?.trim()
    ? <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: C.text }}>{text}</p>
    : <p className="text-[14px]" style={{ color: C.muted }}>{empty}</p>;
}

// Reused admin panel, re-themed; same props and writes as in /admin.
function AdminEdit({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  return (
    <div className="jv-skin rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(3,10,17,0.55)', border: `1px solid ${C.borderStrong}` }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: C.cyan }}>Editing — same record as /admin</span>
        <ActionButton size="sm" variant="ghost" icon={X} onClick={onDone}>Done</ActionButton>
      </div>
      {children}
    </div>
  );
}

function Pipeline({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const idx = JOB_PIPELINE.indexOf(job.jobStatus);
  async function go(s: JobStatus) {
    if (s === job.jobStatus || busy) return;
    // Paid is a money state: require an explicit yes (payments themselves are recorded on the Payment tab).
    if ((s === 'PAID' || job.jobStatus === 'PAID') && !window.confirm(s === 'PAID' ? `Mark ${customerName(job)}'s job as PAID without recording a payment? Use the Payment tab to record money received.` : `Move this PAID job back to ${PIPE_LABEL[s]}?`)) return;
    setBusy(s); setErr(null);
    try {
      await patchJob(job.id, statusChangeFields(job.jobStatus, s));
      onUpdate({ ...job, jobStatus: s });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  if (job.jobStatus === 'CANCELLED') return <div className="flex items-center gap-2 text-[14px]" style={{ color: C.red }}><AlertTriangle size={16} />Cancelled — reopen it from the full editor.</div>;
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {JOB_PIPELINE.map((s, i) => {
          const active = i === idx; const done = i < idx;
          return (
            <button key={s} type="button" onClick={() => go(s)} disabled={!!busy} aria-pressed={active}
              className="cc-btn rounded-lg px-1.5 py-2 text-[12px] font-semibold leading-tight text-center"
              style={active ? { background: 'rgba(52,214,255,0.18)', color: C.text, border: `1px solid ${C.cyan}` } : { background: 'rgba(3,10,17,0.4)', color: done ? C.text2 : C.muted, border: `1px solid ${C.border}` }}>
              <span className="flex items-center justify-center gap-1">{done ? <CheckCircle2 size={12} className="shrink-0" color={C.green} /> : active ? <Circle size={12} className="shrink-0" color={C.cyan} fill={C.cyan} /> : null}{busy === s ? '…' : PIPE_LABEL[s]}</span>
            </button>
          );
        })}
      </div>
      {err && <div className="text-[13px] mt-2" style={{ color: C.red }}>Status not changed: {err}</div>}
    </div>
  );
}

function OverviewTab({ job, onUpdate, openEditor }: { job: Job; onUpdate: (j: Job) => void; openEditor: () => void }) {
  const m = jobMoney(job);
  const items = job.lineItems || [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 min-w-0">
        <Section title="Status" icon={CalendarClock}><Pipeline job={job} onUpdate={onUpdate} /></Section>
        <Section title="Services" icon={CheckCircle2}>
          {items.length ? (
            <ul className="flex flex-col gap-2">
              {items.map(li => (
                <li key={li.id} className="flex items-start gap-3 text-[15px]">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0" color={li.type === 'discount' ? C.amber : C.green} />
                  <span className="flex-1 min-w-0 break-words" style={{ color: C.text }}>{li.label}</span>
                  <span className="tabular-nums shrink-0" style={{ color: C.text2 }}>{li.amount === 0 ? 'Free' : money2(li.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <Prose text={job.estimateNotes || job.notes} empty="No services written up yet." />}
        </Section>
        {(job.garageNotes || job.notes) && (
          <Section title="Notes" icon={StickyNote}>
            {job.garageNotes && <div className="mb-3"><div className="text-[13px] font-semibold mb-1" style={{ color: C.text2 }}>Technician</div><Prose text={job.garageNotes} empty="" /></div>}
            {job.notes && <div><div className="text-[13px] font-semibold mb-1" style={{ color: C.text2 }}>Customer</div><Prose text={job.notes} empty="" /></div>}
          </Section>
        )}
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <Section title="Totals" icon={CreditCard}>
          <Row label="Subtotal" value={money2(m.invoiceSubtotal ?? m.estimateSubtotal)} />
          <Row label="Tax" value={money2(m.invoiceTax ?? m.estimateTax)} />
          <Row label="Total" value={money2(m.invoiceTotal ?? m.estimateTotal)} strong />
          <Row label="Paid" value={money2(m.amountPaid)} />
          {m.balanceDue != null && <Row label="Balance" value={<span style={{ color: m.balanceDue > 0.01 ? C.amber : C.green }}>{money2(m.balanceDue)}</span>} />}
        </Section>
        <Section title="Customer & vehicle" icon={Car}>
          <Row label="Customer" value={customerName(job)} />
          <Row label="Phone" value={job.phone ? <a className="hover:underline" href={`tel:${job.phone}`}>{job.phone}</a> : null} />
          <Row label="Email" value={job.email ? <a className="hover:underline break-all" href={`mailto:${job.email}`}>{job.email}</a> : null} />
          <Row label="Vehicle" value={job.vehicle} />
          <Row label="VIN" value={job.vin ? <span className="font-mono text-[14px]">{job.vin}</span> : null} />
          <Row label="Mileage" value={job.mileage ? `${Number(String(job.mileage).replace(/\D/g, '')).toLocaleString('en-US')} mi` : null} />
          <Row label="Address" value={job.serviceAddress} />
        </Section>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={Pencil} onClick={openEditor}>Full editor</ActionButton>
          {job.phone && <ActionButton icon={Phone} href={`tel:${job.phone}`}>Call</ActionButton>}
          {job.email && <ActionButton icon={Mail} href={`mailto:${job.email}`}>Email</ActionButton>}
          {job.serviceAddress && <ActionButton icon={MapPin} href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.serviceAddress)}`}>Directions</ActionButton>}
        </div>
      </div>
    </div>
  );
}

function EstimateTab({ job }: { job: Job }) {
  const m = jobMoney(job);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Section title="Line items" icon={FileText}>
        {job.lineItems?.length ? job.lineItems.map(li => (
          <Row key={li.id} label={li.label} value={<span style={{ color: li.amount < 0 ? C.amber : C.text }}>{li.amount === 0 ? 'Free' : money2(li.amount)}</span>} />
        )) : <EmptyState icon={FileText} title="No estimate yet">Use Edit to write it — same estimate builder as /admin.</EmptyState>}
      </Section>
      <div className="flex flex-col gap-4 min-w-0">
        <Section title="Estimate total" icon={CreditCard}>
          <Row label="Subtotal" value={money2(m.estimateSubtotal)} />
          <Row label="Tax" value={money2(m.estimateTax)} />
          <Row label="Total" value={money2(m.estimateTotal)} strong />
          <Row label="Customer approval" value={job.customerAgreed ? <span style={{ color: C.green }}>Signed {job.signedAt ? shortDay(job.signedAt.slice(0, 10)) : ''}</span> : <span style={{ color: C.text2 }}>Not signed</span>} />
        </Section>
        <Section title="Scope of work" icon={StickyNote}><Prose text={job.estimateNotes} empty="No scope written." /></Section>
        {job.preExistingDamage && <Section title="Pre-existing damage" icon={AlertTriangle}><Prose text={job.preExistingDamage} empty="" /></Section>}
      </div>
    </div>
  );
}

function PaymentTab({ job }: { job: Job }) {
  const m = jobMoney(job);
  const payments = job.payments || [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Invoice" icon={CreditCard} right={<StatusBadge status={job.jobStatus} />}>
        <Row label="Invoice total" value={money2(m.invoiceTotal)} strong />
        <Row label="Paid so far" value={money2(m.amountPaid)} />
        <Row label="Balance" value={m.balanceDue == null ? '—' : <span style={{ color: m.balanceDue > 0.01 ? C.amber : C.green }}>{money2(m.balanceDue)}</span>} />
        <Row label="Paid on" value={job.paidAt ? shortDay(job.paidAt.slice(0, 10)) : null} />
        <Row label="Card" value={job.stripeLast4 ? `•••• ${job.stripeLast4}` : null} />
        <Row label="Invoice emailed" value={job.invoiceSentCount ? `${job.invoiceSentCount}× · last ${job.invoiceLastSentAt ? shortDay(job.invoiceLastSentAt.slice(0, 10)) : ''}` : 'Not sent'} />
        {job.adjustmentAmount != null && <Row label="Adjustment" value={`${money2(job.adjustmentAmount)}${job.adjustmentReason ? ` — ${job.adjustmentReason}` : ''}`} />}
        {job.paymentLink && <div className="mt-3"><ActionButton size="sm" icon={ExternalLink} href={job.paymentLink}>Payment link</ActionButton></div>}
      </Section>
      <Section title="Payments received" icon={CheckCircle2}>
        {payments.length ? payments.map(p => (
          <Row key={p.id} label={`${shortDay(String(p.at).slice(0, 10))} · ${p.method}${p.note ? ` — ${p.note}` : ''}`} value={<span style={{ color: C.green }}>{money2(p.amount)}</span>} />
        )) : <p className="text-[14px]" style={{ color: C.muted }}>{job.jobStatus === 'PAID' ? 'Paid in one charge (no itemized entries).' : 'No payments recorded.'}</p>}
      </Section>
    </div>
  );
}

const TIRES = [['fl', 'Front left'], ['fr', 'Front right'], ['rl', 'Rear left'], ['rr', 'Rear right']] as const;
function InspectionTab({ job }: { job: Job }) {
  const ins = job.inspectionData as null | { tirePressure?: Record<string, string>; tireTread?: Record<string, string>; dtcCodes?: { id: string; code: string; plan: string }[] };
  const scans = [['Pre-service scan', job.preScan], ['Post-service scan', job.postScan]] as const;
  const hasTires = !!ins && TIRES.some(([k]) => ins.tirePressure?.[k] || ins.tireTread?.[k]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Tires" icon={Car}>
        {hasTires ? (
          <div className="grid grid-cols-2 gap-3">
            {TIRES.map(([k, label]) => (
              <div key={k} className="rounded-xl p-3" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }}>
                <div className="text-[13px]" style={{ color: C.text2 }}>{label}</div>
                <div className="text-[20px] font-bold tabular-nums" style={{ color: C.text }}>{ins?.tirePressure?.[k] || '—'}<span className="text-[13px] font-medium ml-1" style={{ color: C.muted }}>psi</span></div>
                <div className="text-[14px] tabular-nums" style={{ color: C.text2 }}>Tread {ins?.tireTread?.[k] || '—'}/32″</div>
              </div>
            ))}
          </div>
        ) : <p className="text-[14px]" style={{ color: C.muted }}>No tire readings recorded.</p>}
      </Section>
      <Section title="Diagnostic codes" icon={ClipboardCheck}>
        {ins?.dtcCodes?.length ? ins.dtcCodes.map(c => (
          <div key={c.id} className="py-2.5 border-b last:border-b-0" style={{ borderColor: 'rgba(54,211,255,0.08)' }}>
            <div className="font-mono text-[16px] font-bold" style={{ color: C.amber }}>{c.code || '—'}</div>
            <Prose text={c.plan} empty="No plan written." />
          </div>
        )) : <p className="text-[14px]" style={{ color: C.muted }}>No codes logged.</p>}
      </Section>
      <Section title="Scan reports" icon={FileText}>
        {scans.map(([label, doc]) => (
          <Row key={label} label={label} value={doc?.url ? <a className="inline-flex items-center gap-1 hover:underline" href={doc.url} target="_blank" rel="noreferrer">{doc.name || 'Open'}<ExternalLink size={13} /></a> : <span style={{ color: C.muted }}>None</span>} />
        ))}
      </Section>
    </div>
  );
}

function NotesTab({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const photoNotes = [...(job.jobPhotos || []).map(p => p.note), ...(job.adminPhotos || []).map(p => p.note)].filter(Boolean);
  async function save() {
    if (draft == null) return;
    setSaving(true); setErr(null);
    try {
      await patchJob(job.id, { garage_notes: draft }); // same column the admin schedule's garage notes write
      onUpdate({ ...job, garageNotes: draft });
      setDraft(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Technician notes" icon={StickyNote} right={draft == null ? <ActionButton size="sm" icon={Pencil} onClick={() => setDraft(job.garageNotes || '')}>Edit</ActionButton> : null}>
        {draft == null ? <Prose text={job.garageNotes} empty="No technician notes." /> : (
          <div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={7} autoFocus
              className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none resize-y" style={{ background: 'rgba(3,10,17,0.8)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
            <div className="flex gap-2 mt-2">
              <ActionButton variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
              <ActionButton variant="ghost" onClick={() => setDraft(null)}>Cancel</ActionButton>
            </div>
            {err && <div className="text-[13px] mt-2" style={{ color: C.red }}>Not saved: {err}</div>}
          </div>
        )}
      </Section>
      <Section title="Scope of work" icon={FileText}><Prose text={job.estimateNotes} empty="No scope written." /></Section>
      <Section title="Customer notes" icon={StickyNote}><Prose text={job.notes} empty="No customer notes." /></Section>
      <Section title="Photo notes" icon={ClipboardCheck}>
        {photoNotes.length ? <ul className="flex flex-col gap-2">{photoNotes.map((n, i) => <li key={i} className="text-[15px]" style={{ color: C.text }}>• {n}</li>)}</ul> : <p className="text-[14px]" style={{ color: C.muted }}>No photo notes.</p>}
      </Section>
    </div>
  );
}

function PartsTab({ job }: { job: Job }) {
  const parts = (job.lineItems || []).filter(li => li.type === 'parts');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Parts billed" icon={Package}>
        {parts.length ? parts.map(li => <Row key={li.id} label={li.label} value={money2(li.amount)} />) : <p className="text-[14px]" style={{ color: C.muted }}>No parts line items.</p>}
      </Section>
      <Section title="Parts cost" icon={CreditCard}>
        <Row label="What the parts cost you" value={money2(job.partsCost)} strong />
        {(job.partsReceipts || []).map(r => <Row key={r.key || r.url} label="Receipt" value={<a className="inline-flex items-center gap-1 hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.name}<ExternalLink size={13} /></a>} />)}
      </Section>
    </div>
  );
}

export function JobFocus({ job, tab, onTab, nav }: { job: Job; tab: Tab; onTab: (t: Tab) => void; nav?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => { setEditing(false); }, [job.id, tab]);
  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditorOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen]);
  const update = (j: Job) => putJob(j, jobTitle(j));
  const total = jobTotal(job);
  const editable = tab === 'estimate' || tab === 'payment' || tab === 'inspection' || tab === 'parts';

  const body = () => {
    if (editing) {
      const done = () => setEditing(false);
      if (tab === 'estimate') return <AdminEdit onDone={done}><EstimatePanel job={job} onUpdate={update} /></AdminEdit>;
      if (tab === 'payment') return <AdminEdit onDone={done}><PaymentPanel job={job} onUpdate={update} onRequote={() => onTab('estimate')} /></AdminEdit>;
      if (tab === 'inspection') return <AdminEdit onDone={done}><InspectionPanel job={job} onUpdate={update} /></AdminEdit>;
      if (tab === 'parts') return <AdminEdit onDone={done}><PartsCostPanel job={job} onUpdate={update} /></AdminEdit>;
    }
    switch (tab) {
      case 'estimate': return <EstimateTab job={job} />;
      case 'payment': return <PaymentTab job={job} />;
      case 'inspection': return <InspectionTab job={job} />;
      case 'notes': return <NotesTab job={job} onUpdate={update} />;
      case 'parts': return <PartsTab job={job} />;
      default: return <OverviewTab job={job} onUpdate={update} openEditor={() => setEditorOpen(true)} />;
    }
  };

  return (
    <article className="jv-glass jv-pop flex flex-col min-h-0 h-full" aria-label={`Job for ${customerName(job)}`}>
      <header className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b" style={{ borderColor: C.border }}>
        {nav}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-[26px] sm:text-[32px] font-bold leading-tight break-words" style={{ color: C.text }}>{customerName(job)}</h2>
            <div className="text-[16px] sm:text-[18px] mt-0.5" style={{ color: C.text2 }}>{job.vehicle || 'Vehicle not recorded'}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[15px]" style={{ color: C.cyan }}>
              <span className="font-semibold uppercase tracking-wider">{whenLabel(job)}</span>
              <span style={{ color: C.text }}>{jobTitle(job)}</span>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <StatusBadge status={job.jobStatus} />
            <div className="text-[28px] sm:text-[34px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{money2(total)}</div>
          </div>
        </div>
        <nav className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-4" role="tablist" aria-label="Job sections">
          {JOB_TABS.map(t => {
            const Icon = TAB_META[t].icon; const on = t === tab;
            return (
              <button key={t} role="tab" aria-selected={on} type="button" onClick={() => onTab(t)}
                className="cc-btn flex items-center justify-center gap-2 h-10 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em]"
                style={on ? { background: 'rgba(52,214,255,0.16)', color: C.text, boxShadow: `inset 0 -2px 0 ${C.cyan}, inset 0 0 0 1px ${C.borderStrong}` } : { color: C.text2, background: 'rgba(3,10,17,0.35)', border: `1px solid ${C.border}` }}>
                <Icon size={15} aria-hidden />{TAB_META[t].label}
              </button>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-7 py-5">
        {editable && !editing && (
          <div className="flex justify-end mb-3"><ActionButton size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit {TAB_META[tab].label.toLowerCase()}</ActionButton></div>
        )}
        <div key={`${tab}-${editing}`} className="cc-fade-up">{body()}</div>
      </div>
      {/* Portaled: the card's entrance transform would otherwise trap the admin drawer's position:fixed inside it. */}
      {editorOpen && createPortal(
        <div className="jv-skin jv-skin--drawer jv-editor">
          <AdminJobEditor job={job} onClose={() => setEditorOpen(false)} onJobUpdate={update} backLabel="Back to Jarvis" />
        </div>,
        document.body,
      )}
    </article>
  );
}
