import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PANEL, PANEL_PADDING, LABEL } from '../tokens';
import { fmtSource } from '../utils/formatters';
import { LEAD_STATUS_OPTIONS } from '../types';
import type { CommandCenterSummary, Lead } from '../types';

export function LeadPipeline({
  leadsSummary, leads, leadsLoading, leadStatusFilter, onFilterChange, onStatusChange, onSelect,
}: {
  leadsSummary: CommandCenterSummary['leadsSummary'];
  leads: Lead[];
  leadsLoading: boolean;
  leadStatusFilter: string;
  onFilterChange: (status: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onSelect: (lead: Lead) => void;
}) {
  const [justChanged, setJustChanged] = useState<string | null>(null);

  function handleStatusChange(id: string, status: string) {
    onStatusChange(id, status);
    setJustChanged(id);
    setTimeout(() => setJustChanged(current => (current === id ? null : current)), 900);
  }
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
                <motion.tr
                  key={l.id}
                  onClick={() => onSelect(l)}
                  className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                  animate={justChanged === l.id ? { backgroundColor: 'rgba(66,211,146,0.15)' } : { backgroundColor: 'rgba(0,0,0,0)' }}
                  transition={{ duration: 0.8 }}
                >
                  <td className="py-2 pr-3 text-[#F5F8FA]">{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</td>
                  <td className="py-2 pr-3 text-[#8899A6]">{fmtSource(l.source)}</td>
                  <td className="py-2 pr-3 text-[#8899A6]">{l.requested_service || '—'}</td>
                  <td className="py-2 pr-3" onClick={e => e.stopPropagation()}>
                    <select value={l.status} onChange={e => handleStatusChange(l.id, e.target.value)}
                      className="bg-black/30 border border-white/10 text-[#8899A6] text-[11px] px-1.5 py-0.5 rounded outline-none focus:border-[#32D9FF]">
                      {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
                    </select>
                    <AnimatePresence>
                      {justChanged === l.id && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="ml-1.5 text-[#42D392] text-[10px]"
                        >
                          ✓ saved
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </td>
                  <td className="py-2 text-[#52616D]">{new Date(l.created_at).toLocaleDateString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
