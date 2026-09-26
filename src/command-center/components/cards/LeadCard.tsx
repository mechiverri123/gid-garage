import { fmtDate, fmtSource } from '../../utils/formatters';
import { FieldRow } from './shared';

export function LeadCard({ payload }: { payload: any[] }) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return <div className="text-[11px] text-[#52616D] py-1">No matching leads.</div>;
  }
  return (
    <div className="space-y-2">
      {payload.map((l: any, i: number) => (
        <div key={l.id || i} className="bg-black/20 border border-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[13px] font-semibold text-[#F5F8FA]">{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#32D9FF]">{fmtSource(l.status)}</div>
          </div>
          {l.vehicle && <FieldRow label="Vehicle" value={l.vehicle} />}
          {l.requested_service && <FieldRow label="Service" value={l.requested_service} />}
          <FieldRow label="Source" value={fmtSource(l.source)} />
          <FieldRow label="Received" value={fmtDate(l.created_at)} />
        </div>
      ))}
    </div>
  );
}
