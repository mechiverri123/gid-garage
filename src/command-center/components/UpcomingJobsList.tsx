import { PANEL, PANEL_PADDING, LABEL, COLORS } from '../tokens';
import { fmtDate, money } from '../utils/formatters';
import type { UpcomingJob } from '../types';

const STATUS_COLOR: Record<string, string> = {
  BOOKED: '#8899A6', ESTIMATE_SENT: '#F5B942', SIGNED: '#4FE8FF',
  IN_PROGRESS: '#4FE8FF', COMPLETED: '#42D392', INVOICED: '#F5B942', PAID: '#42D392',
};

const DONE_STATUSES = new Set(['COMPLETED', 'PAID']);

export function UpcomingJobsList({ jobs, onSelect }: { jobs: UpcomingJob[]; onSelect: (id: string) => void }) {
  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className={LABEL + ' mb-3'}>Upcoming Jobs</div>
      {jobs.length === 0 ? (
        <div className="text-xs text-[#8899A6] py-4 text-center">Nothing scheduled in the next 7 days.</div>
      ) : (
        <div className="max-h-80 overflow-y-auto pl-1">
          {jobs.map((j, i) => {
            const color = STATUS_COLOR[j.job_status || ''] || COLORS.textMuted;
            const filled = DONE_STATUSES.has(j.job_status || '');
            const isLast = i === jobs.length - 1;
            return (
              <button
                key={j.id}
                onClick={() => onSelect(j.id)}
                className="relative w-full flex items-start gap-3 text-xs text-left pl-4 pb-4 group"
              >
                {/* Timeline rail */}
                {!isLast && (
                  <div className="absolute left-[3px] top-3 bottom-0 w-px" style={{ background: 'rgba(79,232,255,0.15)' }} />
                )}
                <span
                  className="absolute left-0 top-1 w-2 h-2 rounded-full"
                  style={filled ? { backgroundColor: color, boxShadow: `0 0 6px ${color}` } : { border: `1.5px solid ${color}`, background: 'transparent' }}
                />
                <div className="flex-1 min-w-0 rounded transition-colors group-hover:bg-white/5 -my-1 py-1 px-1.5 -mx-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px]" style={{ color: COLORS.accent }}>{fmtDate(j.date)}{j.time ? ` · ${j.time}` : ''}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0" style={{ color }}>{j.job_status || '—'}</span>
                  </div>
                  <div className="text-[#F5F8FA] truncate mt-0.5">{j.service || 'Job'} — {j.vehicle || 'vehicle on file'}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    {j.customer && <span className="text-[#52616D] text-[10px] truncate">{j.customer}</span>}
                    <span className="text-[#8899A6] text-[10px] shrink-0">{money(j.amount)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
