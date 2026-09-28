import { FieldRow } from './shared';

// Mirrors get_owner_pay_summary (functions/_lib/business-data.js), which uses
// the same formula as the Hub Owner Pay panel.
export function OwnerPayCard({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-0.5">
      <div className="text-[13px] font-semibold text-[#42D392] mb-1.5">{payload.estimatedTakeHome} estimated take-home ({payload.period})</div>
      <FieldRow label="Job margin (net profit)" value={payload.jobMargin} />
      <FieldRow label="Est. card fees" value={payload.estStripeFees} />
      <FieldRow label="Overhead" value={payload.overhead} />
      <FieldRow label="Est. tax reserve" value={payload.estTaxReserve} />
    </div>
  );
}
