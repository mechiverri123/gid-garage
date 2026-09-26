import { PANEL, PANEL_PADDING, LABEL, COLORS } from '../tokens';
import { fmtDayLabel, money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

// Quick 7-day visual overview (counts + revenue per day). The real
// per-job list lives in UpcomingJobsList.tsx, rendered right below this —
// this stays as the at-a-glance version.
export function UpcomingJobs({ scheduleBar }: { scheduleBar: CommandCenterSummary['scheduleBar'] }) {
  const maxJobs = Math.max(1, ...scheduleBar.map(d => d.jobCount));
  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className={LABEL + ' mb-4'}>Next 7 Days</div>
      <div className="flex items-end gap-2 h-24">
        {scheduleBar.map(d => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-end" style={{ height: '64px' }}>
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${Math.max(4, (d.jobCount / maxJobs) * 64)}px`,
                  background: d.jobCount > 0 ? `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.accentDim})` : 'rgba(255,255,255,0.06)',
                }}
                title={`${d.jobCount} jobs, ${money(d.revenue)}`}
              />
            </div>
            <div className="text-[9px] text-[#52616D] uppercase tracking-wide">{fmtDayLabel(d.date)}</div>
            <div className="text-[10px] text-[#8899A6] font-medium">{d.jobCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
