import { KeyValueGrid, MiniTable } from './shared';

export function PricingCard({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    <div className="space-y-2">
      <KeyValueGrid data={{ jobsFound: payload.count, min: payload.priceRange?.min, max: payload.priceRange?.max, avg: payload.priceRange?.avg }} />
      {Array.isArray(payload.samples) && payload.samples.length > 0 && (
        <MiniTable columns={['Vehicle', 'Price']} rows={payload.samples.map((s: any) => [s.vehicle || '—', s.price || '—'])} />
      )}
    </div>
  );
}
