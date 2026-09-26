import { fmtDate } from '../../utils/formatters';
import { MiniTable } from './shared';

export function MarketingCard({ payload }: { payload: any[] }) {
  if (!Array.isArray(payload)) return null;
  return (
    <MiniTable
      columns={['Date', 'Channel', 'Amount']}
      rows={payload.map((s: any) => [fmtDate(s.date), (s.channel || '').replace(/_/g, ' '), `$${Number(s.amount || 0).toFixed(2)}`])}
    />
  );
}
