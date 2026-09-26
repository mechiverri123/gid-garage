import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function shortDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>{label}</div>
      </div>
      <div className="text-[28px] font-bold leading-none tabular-nums" style={{ color: color || COLORS.text }}>{value}</div>
    </div>
  );
}

export function BusinessMetrics({ today }: { today: CommandCenterSummary['today'] }) {
  return (
    <HudPanel title="Today" status={{ label: 'Live', color: COLORS.accent }} className="h-full">
      <div className="grid gap-1">
        <MetricRow label="Jobs" value={String(today.jobCount)} />
        <MetricRow label="Revenue" value={money(today.revenue)} color={today.revenue > 0 ? COLORS.text : COLORS.textMuted} />
        <MetricRow label="New Leads" value={String(today.newLeads)} />
        <MetricRow label="Missed Calls" value={String(today.missedCalls)} color={today.missedCalls > 0 ? COLORS.warning : COLORS.text} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border px-3 py-2" style={{ borderColor: COLORS.border, background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>Next Open</div>
          <div className="mt-1 font-semibold" style={{ color: COLORS.text }}>{today.nextOpenDay ? shortDate(today.nextOpenDay) : '—'}</div>
        </div>
        <div className="rounded-xl border px-3 py-2" style={{ borderColor: COLORS.border, background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>Status</div>
          <div className="mt-1 font-semibold" style={{ color: today.missedCalls > 0 ? COLORS.warning : COLORS.success }}>{today.missedCalls > 0 ? 'Attention' : 'Stable'}</div>
        </div>
      </div>
    </HudPanel>
  );
}
