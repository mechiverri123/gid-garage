import { FieldRow } from './shared';

export function BusinessSummaryCard({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return null;
  const t = payload.today || {};
  const na = payload.needsAttention || {};
  const ls = payload.leadsLast30Days || {};
  const m = payload.marketingLast30Days || {};
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-black/20 border border-white/5 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-[#52616D] mb-1">Today</div>
        <FieldRow label="Jobs" value={String(t.jobCount ?? '—')} />
        <FieldRow label="Revenue" value={t.revenue != null ? `$${Number(t.revenue).toFixed(2)}` : '—'} />
      </div>
      <div className="bg-black/20 border border-white/5 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-[#52616D] mb-1">Needs Attention</div>
        <FieldRow label="Overdue follow-ups" value={String(na.overdueLeadFollowUps?.length ?? 0)} />
        <FieldRow label="Unpaid invoices" value={String(na.unpaidInvoices?.length ?? 0)} />
      </div>
      <div className="bg-black/20 border border-white/5 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-[#52616D] mb-1">Leads (30d)</div>
        <FieldRow label="Total" value={String(ls.total ?? '—')} />
        <FieldRow label="Conversion" value={ls.conversionRatePct != null ? `${ls.conversionRatePct}%` : '—'} />
      </div>
      <div className="bg-black/20 border border-white/5 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-[#52616D] mb-1">Marketing (30d)</div>
        <FieldRow label="Spend" value={m.totalSpend != null ? `$${Number(m.totalSpend).toFixed(2)}` : '—'} />
        <FieldRow label="Leads" value={String(m.leadCount ?? '—')} />
      </div>
    </div>
  );
}
