import { COLORS, toolLabel } from '../tokens';
import { fmtClock } from '../utils/formatters';
import type { ActivityItem } from '../types';

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <div className="text-xs text-[#52616D] animate-pulse">Thinking…</div>;
  }
  return (
    <div className="space-y-1">
      {items.map((a, i) => {
        const color = a.status === 'running' ? COLORS.warning : a.status === 'error' ? COLORS.critical : COLORS.success;
        const icon = a.status === 'running' ? '●' : a.status === 'error' ? '✕' : '✓';
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="text-[#52616D] font-mono shrink-0">{fmtClock(a.startedAt)}</span>
            <span className={a.status === 'running' ? 'animate-pulse' : ''} style={{ color }}>{icon}</span>
            <span className={a.status === 'error' ? 'text-[#FF5353]' : 'text-[#8899A6]'}>
              {toolLabel(a.tool)}{a.status === 'error' && a.error ? ` — ${a.error}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
