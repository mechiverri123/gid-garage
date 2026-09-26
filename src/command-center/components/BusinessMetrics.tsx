import { PANEL, PANEL_PADDING, LABEL, METRIC_VALUE } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function shortDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

export function BusinessMetrics({ today }: { today: CommandCenterSummary['today'] }) {
  const metrics: { label: string; value: string; warn?: boolean; small?: boolean }[] = [
    { label: 'Jobs Today', value: String(today.jobCount) },
    { label: "Today's Revenue", value: money(today.revenue) },
    { label: 'New Leads', value: String(today.newLeads) },
    { label: 'Missed Calls', value: String(today.missedCalls), warn: today.missedCalls > 0 },
  ];
  if (today.nextOpenDay) {
    metrics.push({ label: 'Next Open Day', value: shortDate(today.nextOpenDay), small: true });
  }
  return (
    <div className={`grid grid-cols-2 ${today.nextOpenDay ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
      {metrics.map(m => (
        <div key={m.label} className={`${PANEL} ${PANEL_PADDING}`}>
          <div className={LABEL}>{m.label}</div>
          <div className={m.small ? 'text-xl sm:text-2xl font-bold text-[#F5F8FA] leading-tight tracking-tight' : METRIC_VALUE} style={m.warn ? { color: '#FF5353' } : undefined}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}
