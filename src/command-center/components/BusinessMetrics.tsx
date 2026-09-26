import { PANEL, PANEL_PADDING, LABEL, METRIC_VALUE, METRIC_CAPTION } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

export function BusinessMetrics({ today }: { today: CommandCenterSummary['today'] }) {
  const metrics = [
    { label: 'Jobs Today', value: String(today.jobCount) },
    { label: "Today's Revenue", value: money(today.revenue) },
    { label: 'New Leads', value: String(today.newLeads) },
    { label: 'Missed Calls', value: String(today.missedCalls), warn: today.missedCalls > 0 },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map(m => (
        <div key={m.label} className={`${PANEL} ${PANEL_PADDING}`}>
          <div className={LABEL}>{m.label}</div>
          <div className={METRIC_VALUE} style={m.warn ? { color: '#FF5353' } : undefined}>{m.value}</div>
        </div>
      ))}
      {today.nextOpenDay && (
        <div className={`${PANEL} ${PANEL_PADDING} col-span-2 lg:col-span-4 flex items-center justify-between`}>
          <span className={LABEL}>Next Open Day</span>
          <span className={METRIC_CAPTION + ' !mt-0 text-[#F5F8FA]'}>{today.nextOpenDay}</span>
        </div>
      )}
    </div>
  );
}
