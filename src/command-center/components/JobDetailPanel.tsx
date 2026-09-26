import { useEffect, useState } from 'react';
import { adminPost } from '../api';
import { COLORS } from '../tokens';
import { money, fmtDate } from '../utils/formatters';

interface FullJob {
  id: string; fname?: string; lname?: string; phone?: string; email?: string;
  vehicle?: string; vin?: string; mileage?: string; service_address?: string;
  service?: string; date?: string; time?: string; job_status?: string; status?: string;
  notes?: string; garage_notes?: string;
  estimate_amount?: number; tax_amount?: number; invoice_amount?: number;
  amount_paid?: number; adjustment_amount?: number; parts_cost?: number;
  stripe_transaction_id?: string; stripe_last4?: string; paid_at?: string;
  signed_at?: string; customer_agreed?: boolean; created_at?: string;
  line_items?: any;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between text-xs py-1 border-b border-white/5">
      <span className="text-[#52616D]">{label}</span>
      <span className="text-[#F5F8FA] text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#52616D] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function JobDetailPanel({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  const [job, setJob] = useState<FullJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    setLoading(true);
    setError(null);
    adminPost('get-booking', { id: jobId })
      .then(setJob)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (!jobId) return null;

  let lineItems: { label?: string; amount?: number }[] = [];
  try {
    if (job?.line_items) lineItems = typeof job.line_items === 'string' ? JSON.parse(job.line_items) : job.line_items;
  } catch { /* leave empty if unparsable */ }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(6,9,13,0.6)', backdropFilter: 'blur(2px)' }} />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto p-5"
        style={{ background: '#0d1218', borderLeft: `1px solid ${COLORS.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[#52616D]">Job Detail</div>
          <button onClick={onClose} className="text-[#52616D] hover:text-[#8899A6] text-xs">✕ Close</button>
        </div>

        {loading && <div className="text-xs text-[#52616D] animate-pulse py-4">Loading…</div>}
        {error && <div className="text-xs text-[#FF5353] py-4">Failed to load: {error}</div>}

        {job && !loading && (
          <>
            <div className="text-[15px] font-semibold text-[#F5F8FA] mb-0.5">{job.service || 'Job'}</div>
            <div className="text-xs text-[#8899A6] mb-4">{fmtDate(job.date)}{job.time ? ` · ${job.time}` : ''} · {job.job_status || job.status || '—'}</div>

            <Section title="Customer">
              <Row label="Name" value={`${job.fname || ''} ${job.lname || ''}`.trim() || '—'} />
              <Row label="Phone" value={job.phone} />
              <Row label="Email" value={job.email} />
            </Section>

            <Section title="Vehicle">
              <Row label="Vehicle" value={job.vehicle} />
              <Row label="VIN" value={job.vin} />
              <Row label="Mileage" value={job.mileage} />
              <Row label="Service Address" value={job.service_address} />
            </Section>

            {(job.notes || job.garage_notes) && (
              <Section title="Notes">
                {job.notes && <div className="text-xs text-[#8899A6] mb-2 whitespace-pre-wrap">{job.notes}</div>}
                {job.garage_notes && (
                  <div className="text-xs text-[#F5B942] whitespace-pre-wrap border-l-2 border-[#F5B942]/40 pl-2">{job.garage_notes}</div>
                )}
              </Section>
            )}

            {lineItems.length > 0 && (
              <Section title="Line Items">
                {lineItems.map((li, i) => (
                  <Row key={i} label={li.label || `Item ${i + 1}`} value={money(li.amount)} />
                ))}
              </Section>
            )}

            <Section title="Pricing & Payment">
              <Row label="Estimate" value={money(job.estimate_amount)} />
              <Row label="Parts cost" value={money(job.parts_cost)} />
              <Row label="Tax" value={money(job.tax_amount)} />
              <Row label="Invoice total" value={money(job.invoice_amount)} />
              <Row label="Amount paid" value={money(job.amount_paid)} />
              <Row label="Adjustment" value={job.adjustment_amount ? money(job.adjustment_amount) : undefined} />
              <Row label="Paid on" value={fmtDate(job.paid_at)} />
              <Row label="Stripe card" value={job.stripe_last4 ? `•••• ${job.stripe_last4}` : undefined} />
              <Row label="Stripe transaction" value={job.stripe_transaction_id} />
            </Section>

            <Section title="Signing">
              <Row label="Customer agreed" value={job.customer_agreed ? 'Yes' : job.signed_at ? 'Yes' : 'Not yet'} />
              <Row label="Signed on" value={fmtDate(job.signed_at)} />
              <Row label="Created" value={fmtDate(job.created_at)} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
