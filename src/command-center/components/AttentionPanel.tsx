import { AnimatePresence, motion } from 'motion/react';
import { HudPanel } from './HudPanel';
import { SEVERITY_COLOR, COLORS } from '../tokens';
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
  'No missed follow-ups',
  'No missed calls',
  'No unpaid completed jobs',
];

export function AttentionPanel({ items }: { items: NeedsAttentionItem[] }) {
  const worstSeverity = items.some(i => severityFor(i) === 'critical') ? 'critical'
    : items.some(i => severityFor(i) === 'warning') ? 'warning'
    : items.length > 0 ? 'info' : null;
  const badgeColor = worstSeverity ? SEVERITY_COLOR[worstSeverity] : COLORS.success;

  return (
    <HudPanel title="Needs Attention" status={{ label: items.length === 0 ? 'Clear' : `${items.length} Active`, color: badgeColor }} className="h-full">
      {items.length === 0 ? (
        <div className="space-y-2">
          {CHECKLIST_LABELS.map(text => (
            <div key={text} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: 'rgba(66,211,146,0.16)', background: 'rgba(66,211,146,0.03)' }}>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>{text}</span>
              <span className="text-sm" style={{ color: COLORS.success }}>✓</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {items.slice(0, 10).map(item => {
              const color = SEVERITY_COLOR[severityFor(item)];
              return (
                <motion.div
                  key={stableKey(item)}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl border px-3 py-2.5"
                  style={{ borderColor: `${color}33`, background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: COLORS.text }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
                      {item.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color }}>{severityFor(item)}</span>
                  </div>
                  <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{item.detail}</div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </HudPanel>
  );
}
