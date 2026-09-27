import { useEffect, useState } from 'react';
import { PANEL, PANEL_PADDING, LABEL, COLORS } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function shortDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

// One-time count-up on load (spec: "a short count-up is enough" — not a
// looping animation). Runs once per mount/target change.
function useCountUp(target: number, durationMs = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function StatRow({ label, target, formatter, warn, divider = true }: { label: string; target: number; formatter: (n: number) => string; warn?: boolean; divider?: boolean }) {
  const value = useCountUp(target);
  return (
    <div className={`flex items-baseline justify-between py-2 ${divider ? 'border-b border-white/5' : ''}`}>
      <span className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>{label}</span>
      <span className="text-2xl sm:text-[28px] font-bold tabular-nums" style={{ color: warn ? COLORS.critical : COLORS.text }}>{formatter(value)}</span>
    </div>
  );
}

// Replaces the old 5-identical-cards KPI row with one compact status panel
// — the "generic dashboard template" look the visual-correction pass
// specifically called out.
export function BusinessMetrics({ today }: { today: CommandCenterSummary['today'] }) {
  return (
    <div className={`${PANEL} ${PANEL_PADDING} h-full flex flex-col`}>
      <div className={LABEL + ' mb-1'}>Today</div>
      <StatRow label="Jobs" target={today.jobCount} formatter={n => String(Math.round(n))} />
      <StatRow label="Revenue" target={today.revenue} formatter={money} />
      <StatRow label="New Leads" target={today.newLeads} formatter={n => String(Math.round(n))} />
      <StatRow label="Missed Calls" target={today.missedCalls} formatter={n => String(Math.round(n))} warn={today.missedCalls > 0} divider={!!today.nextOpenDay} />
      {today.nextOpenDay && (
        <div className="flex items-baseline justify-between py-2">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>Next Open Day</span>
          <span className="text-sm font-semibold" style={{ color: COLORS.text }}>{shortDate(today.nextOpenDay)}</span>
        </div>
      )}
    </div>
  );
}
