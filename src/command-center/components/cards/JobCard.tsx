import { fmtDate } from '../../utils/formatters';
import { FieldRow } from './shared';

const STATUS_COLOR: Record<string, string> = {
  BOOKED: '#8899A6', ESTIMATE_SENT: '#F5B942', SIGNED: '#32D9FF',
  IN_PROGRESS: '#32D9FF', COMPLETED: '#42D392', INVOICED: '#F5B942', PAID: '#42D392',
};

export function JobCard({ payload }: { payload: any[] }) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return <div className="text-[11px] text-[#52616D] py-1">No matching jobs.</div>;
  }
  return (
    <div className="space-y-2">
      {payload.map((j: any, i: number) => {
        const amount = j.invoice_amount != null ? `$${Number(j.invoice_amount).toFixed(2)}` : j.estimate_amount != null ? `~$${Number(j.estimate_amount).toFixed(2)}` : '—';
        const color = STATUS_COLOR[j.job_status] || '#8899A6';
        return (
          <div key={j.id || i} className="bg-black/20 border border-white/5 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-semibold text-[#32D9FF] uppercase tracking-wide">{fmtDate(j.date)}{j.time ? ` · ${j.time}` : ''}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{j.job_status || '—'}</div>
            </div>
            <div className="text-[13px] text-[#F5F8FA] mb-1">{j.service || 'Job'} — {j.vehicle || 'vehicle on file'}</div>
            {(j.fname || j.lname) && <FieldRow label="Customer" value={`${j.fname || ''} ${j.lname || ''}`.trim()} />}
            <FieldRow label="Amount" value={amount} />
          </div>
        );
      })}
    </div>
  );
}
