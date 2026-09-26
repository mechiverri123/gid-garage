import { useEffect, useState } from 'react';
import { PANEL, PANEL_PADDING, LABEL, METRIC_VALUE } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function shortDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

// A short, one-time count-up on load — per spec section 13 ("a short
// count-up on initial load is enough," explicitly warning against
// over-animating numbers). Runs once per mount, ~500ms, plain
// requestAnimationFrame — no need to pull motion in just for this.
function useCountUp(target: number, durationMs = 1400): number {
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

function CountTile({ label, target, formatter, warn }: { label: string; target: number; formatter: (n: number) => string; warn?: boolean }) {
  const value = useCountUp(target);
  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className={LABEL}>{label}</div>
      <div className={METRIC_VALUE} style={warn ? { color: '#FF5353' } : undefined}>{formatter(value)}</div>
    </div>
  );
}

export function BusinessMetrics({ today }: { today: CommandCenterSummary['today'] }) {
  return (
    <div className={`grid grid-cols-2 ${today.nextOpenDay ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
      <CountTile label="Jobs Today" target={today.jobCount} formatter={n => String(Math.round(n))} />
      <CountTile label="Today's Revenue" target={today.revenue} formatter={money} />
      <CountTile label="New Leads" target={today.newLeads} formatter={n => String(Math.round(n))} />
      <CountTile label="Missed Calls" target={today.missedCalls} formatter={n => String(Math.round(n))} warn={today.missedCalls > 0} />
      {today.nextOpenDay && (
        <div className={`${PANEL} ${PANEL_PADDING}`}>
          <div className={LABEL}>Next Open Day</div>
          <div className="text-xl sm:text-2xl font-bold text-[#F5F8FA] leading-tight tracking-tight">{shortDate(today.nextOpenDay)}</div>
        </div>
      )}
    </div>
  );
}
