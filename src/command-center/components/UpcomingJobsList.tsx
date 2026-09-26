import { PANEL, PANEL_PADDING, LABEL } from '../tokens';
import { fmtDate, money } from '../utils/formatters';
import type { UpcomingJob } from '../types';

const STATUS_COLOR: Record<string, string> = {
  BOOKED: '#8899A6', ESTIMATE_SENT: '#F5B942', SIGNED: '#32D9FF',
  IN_PROGRESS: '#32D9FF', COMPLETED: '#42D392', INVOICED: '#F5B942', PAID: '#42D392',
};

export function UpcomingJobsList({ jobs }: { jobs: UpcomingJob[] }) {
  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className={LABEL + ' mb-3'}>Upcoming Jobs</div>
      {jobs.length === 0 ? (
        <div className="text-xs text-[#8899A6] py-4 text-center">Nothing scheduled in the next 7 days.</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {jobs.map(j => {
            const color = STATUS_COLOR[j.job_status || ''] || '#8899A6';
            return (
              <div key={j.id} className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-[#32D9FF] font-mono text-[10px] shrink-0 w-16">{fmtDate(j.date)}{j.time ? ` ${j.time}` : ''}</div>
                  <div className="min-w-0">
                    <div className="text-[#F5F8FA] truncate">{j.service || 'Job'} — {j.vehicle || 'vehicle on file'}</div>
                    {j.customer && <div className="text-[#52616D] text-[10px] truncate">{j.customer}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[#8899A6]">{money(j.amount)}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{j.job_status || '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
