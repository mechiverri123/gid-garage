import { AnimatePresence, motion } from 'motion/react';
import { PANEL, PANEL_PADDING, LABEL, SEVERITY_COLOR } from '../tokens';
import type { NeedsAttentionItem } from '../types';

function severityFor(item: NeedsAttentionItem): 'info' | 'warning' | 'critical' {
  if (item.type === 'unpaid_invoice') return 'critical';
  if (item.type === 'missed_call') return 'warning';
  return 'info';
}

function stableKey(item: NeedsAttentionItem): string {
  return `${item.type}:${item.leadId ?? item.callId ?? item.bookingId ?? item.label}`;
}

export function AttentionPanel({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <div className={`${PANEL} ${PANEL_PADDING} h-full`}>
      <div className={LABEL + ' mb-3'}>Needs Attention</div>
      {items.length === 0 ? (
        <div className="text-xs text-[#8899A6] py-2">Everything is caught up.</div>
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
