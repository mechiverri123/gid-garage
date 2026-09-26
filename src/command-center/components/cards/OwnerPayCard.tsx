import { FieldRow } from './shared';

export function OwnerPayCard({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-0.5">
      <div className="text-[13px] font-semibold text-[#42D392] mb-1.5">{payload.estimatedTakeHome} estimated take-home ({payload.periodDays}d)</div>
      <FieldRow label="Jobs paid" value={String(payload.jobsPaid)} />
      <FieldRow label="Gross collected" value={payload.grossCollected} />
      <FieldRow label="Est. Stripe fees" value={payload.estStripeFees} />
      <FieldRow label="Est. tax reserve" value={payload.estTaxReserve} />
      <FieldRow label="Prorated overhead" value={payload.proratedOverhead} />
    </div>
  );
}
