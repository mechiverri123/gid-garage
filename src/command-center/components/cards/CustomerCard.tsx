import { FieldRow } from './shared';

export function CustomerCard({ payload }: { payload: any[] }) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return <div className="text-[11px] text-[#52616D] py-1">No matching customer.</div>;
  }
  return (
    <div className="space-y-2">
      {payload.map((c: any) => (
        <div key={c.id} className="bg-black/20 border border-white/5 rounded-lg p-3">
          <div className="text-[13px] font-semibold text-[#F5F8FA] mb-1.5">{`${c.fname || ''} ${c.lname || ''}`.trim() || '—'}</div>
          {c.vehicle && <FieldRow label="Vehicle" value={c.vehicle} />}
          {c.phone && <FieldRow label="Phone" value={c.phone} />}
          {c.email && <FieldRow label="Email" value={c.email} />}
          {c.vin && <FieldRow label="VIN" value={c.vin} />}
        </div>
      ))}
    </div>
  );
}
