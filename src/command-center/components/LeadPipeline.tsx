import { PANEL, PANEL_PADDING, LABEL } from '../tokens';
import { fmtSource } from '../utils/formatters';
import { LEAD_STATUS_OPTIONS } from '../types';
import type { CommandCenterSummary, Lead } from '../types';

export function LeadPipeline({
  leadsSummary, leads, leadsLoading, leadStatusFilter, onFilterChange, onStatusChange,
}: {
  leadsSummary: CommandCenterSummary['leadsSummary'];
  leads: Lead[];
  leadsLoading: boolean;
  leadStatusFilter: string;
  onFilterChange: (status: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const stageCounts = LEAD_STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length;
    return acc;
  }, {});

  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={LABEL}>
          Leads · {leadsSummary.total} (30d) · {leadsSummary.conversionRatePct}% booked
        </div>
        <select value={leadStatusFilter} onChange={e => onFilterChange(e.target.value)}
          className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1 rounded outline-none">
          <option value="">All statuses</option>
          {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
        </select>
      </div>

      {/* Compact pipeline strip */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {LEAD_STATUS_OPTIONS.map(s => (
          <button key={s} onClick={() => onFilterChange(s === leadStatusFilter ? '' : s)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${leadStatusFilter === s ? 'border-[#32D9FF] text-[#32D9FF] bg-[#32D9FF]/10' : 'border-white/10 text-[#8899A6] hover:border-white/20'}`}>
            {fmtSource(s)} <span className="opacity-60">{stageCounts[s]}</span>
          </button>
        ))}
      </div>

      {leadsLoading ? (
        <div className="text-xs text-[#52616D] py-4 text-center">Loading…</div>
      ) : leads.length === 0 ? (
        <div className="text-xs text-[#52616D] py-4 text-center">
          {leadStatusFilter ? `No ${leadStatusFilter.replace('_', ' ')} leads.` : 'No leads yet — new quotes and bookings will show up here automatically.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#52616D] border-b border-white/5">
                <th className="text-left py-2 pr-3 font-normal">Name</th>
                <th className="text-left py-2 pr-3 font-normal">Source</th>
                <th className="text-left py-2 pr-3 font-normal">Service</th>
                <th className="text-left py-2 pr-3 font-normal">Status</th>
                <th className="text-left py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 30).map(l => (
                <tr key={l.id} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-[#F5F8FA]">{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</td>
                  <td className="py-2 pr-3 text-[#8899A6]">{fmtSource(l.source)}</td>
                  <td className="py-2 pr-3 text-[#8899A6]">{l.requested_service || '—'}</td>
                  <td className="py-2 pr-3">
                    <select value={l.status} onChange={e => onStatusChange(l.id, e.target.value)}
                      className="bg-black/30 border border-white/10 text-[#8899A6] text-[11px] px-1.5 py-0.5 rounded outline-none focus:border-[#32D9FF]">
                      {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-[#52616D]">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
