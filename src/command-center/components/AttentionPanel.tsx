import { AnimatePresence, motion } from 'motion/react';
import { PANEL, PANEL_PADDING, LABEL, SEVERITY_COLOR, COLORS } from '../tokens';
import type { NeedsAttentionItem } from '../types';

function severityFor(item: NeedsAttentionItem): 'info' | 'warning' | 'critical' {
  if (item.type === 'unpaid_invoice') return 'critical';
  if (item.type === 'missed_call') return 'warning';
  return 'info';
}

function stableKey(item: NeedsAttentionItem): string {
  return `${item.type}:${item.leadId ?? item.callId ?? item.bookingId ?? item.label}`;
}

const CHECKLIST_LABELS = [
  { type: 'lead_follow_up', text: 'No missed follow-ups' },
  { type: 'missed_call', text: 'No missed calls' },
  { type: 'unpaid_invoice', text: 'No unpaid completed jobs' },
];

export function AttentionPanel({ items }: { items: NeedsAttentionItem[] }) {
  const worstSeverity = items.some(i => severityFor(i) === 'critical') ? 'critical'
    : items.some(i => severityFor(i) === 'warning') ? 'warning'
    : items.length > 0 ? 'info' : null;
  const badgeColor = worstSeverity ? SEVERITY_COLOR[worstSeverity] : COLORS.success;

  return (
    <div className={`${PANEL} ${PANEL_PADDING} h-full`}>
      <div className="flex items-center justify-between mb-3">
        <div className={LABEL}>Needs Attention</div>
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: badgeColor }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: badgeColor }} />
          {items.length === 0 ? 'Clear' : `${items.length} Item${items.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="space-y-1.5">
          {CHECKLIST_LABELS.map(c => (
            <div key={c.type} className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.textMuted }}>
              <span style={{ color: COLORS.success }}>✓</span> {c.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          <AnimatePresence initial={false}>
            {items.slice(0, 20).map(item => {
              const color = SEVERITY_COLOR[severityFor(item)];
              return (
                <motion.div
                  key={stableKey(item)}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-between gap-2 text-xs border-b border-white/5 pb-1.5 overflow-hidden"
                >
                  <span className="flex items-center gap-1.5 text-[#F5F8FA]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    {item.label}
                  </span>
                  <span className="text-[#8899A6] text-right shrink-0">{item.detail}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
