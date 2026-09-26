import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
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
  }, {} as Record<string, number>);

  return (
    <HudPanel title="Lead Pipeline" status={{ label: `${leadsSummary.total} Total`, color: COLORS.accent }} className="h-full">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
        {LEAD_STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => onFilterChange(s === leadStatusFilter ? '' : s)}
            className="rounded-xl border px-3 py-2 text-left transition-colors"
            style={leadStatusFilter === s
              ? { borderColor: COLORS.accent, background: 'rgba(84,231,255,0.08)' }
              : { borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: leadStatusFilter === s ? COLORS.accent : COLORS.textFaint }}>{fmtSource(s)}</div>
            <div className="text-lg font-semibold mt-1" style={{ color: COLORS.text }}>{stageCounts[s]}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[11px]" style={{ color: COLORS.textMuted }}>30-day conversion: <span style={{ color: COLORS.success }}>{leadsSummary.conversionRatePct}% booked</span></div>
        <select value={leadStatusFilter} onChange={e => onFilterChange(e.target.value)}
          className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1 rounded outline-none">
          <option value="">All statuses</option>
          {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
        </select>
      </div>

      {leadsLoading ? (
        <div className="text-xs py-8 text-center" style={{ color: COLORS.textFaint }}>Loading…</div>
      ) : leads.length === 0 ? (
        <div className="text-xs py-8 text-center" style={{ color: COLORS.textFaint }}>
          {leadStatusFilter ? `No ${leadStatusFilter.replace('_', ' ')} leads.` : 'No leads yet — new quotes and bookings will show up here automatically.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
          {leads.slice(0, 8).map(l => (
            <motion.div
              key={l.id}
              onClick={() => onSelect(l)}
              className="rounded-2xl border px-4 py-3 cursor-pointer"
              style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
              animate={justChanged === l.id ? { backgroundColor: 'rgba(66,211,146,0.12)' } : { backgroundColor: 'rgba(255,255,255,0.02)' }}
              transition={{ duration: 0.7 }}
            >
              <div className="grid md:grid-cols-[1.4fr_1fr_1.1fr_auto] gap-3 items-center">
                <div>
                  <div className="text-sm font-semibold" style={{ color: COLORS.text }}>{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</div>
                  <div className="text-[11px] mt-1" style={{ color: COLORS.textMuted }}>{l.requested_service || 'No service listed'}</div>
                </div>
                <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{fmtSource(l.source)}</div>
                <div onClick={e => e.stopPropagation()}>
                  <select value={l.status} onChange={e => handleStatusChange(l.id, e.target.value)}
                    className="w-full bg-black/30 border border-white/10 text-[#8899A6] text-[11px] px-2 py-1.5 rounded-lg outline-none focus:border-[#32D9FF]">
                    {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
                  </select>
                  <AnimatePresence>
                    {justChanged === l.id && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-1 inline-block text-[10px]"
                        style={{ color: COLORS.success }}
                      >
                        ✓ saved
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-[11px] md:text-right" style={{ color: COLORS.textFaint }}>{new Date(l.created_at).toLocaleDateString()}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </HudPanel>
  );
}
