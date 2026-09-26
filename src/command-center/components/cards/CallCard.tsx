import { fmtDate } from '../../utils/formatters';
import { MiniTable } from './shared';

export function CallCard({ payload }: { payload: any[] }) {
  if (!Array.isArray(payload)) return null;
  return (
    <MiniTable
      columns={['Phone', 'Direction', 'Outcome', 'When']}
      rows={payload.map((c: any) => [c.phone || '—', c.direction || '—', (c.outcome || '').replace(/_/g, ' '), fmtDate(c.created_at)])}
    />
  );
}
