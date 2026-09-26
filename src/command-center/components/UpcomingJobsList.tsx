import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { fmtDate, money } from '../utils/formatters';
import type { UpcomingJob } from '../types';

const STATUS_COLOR: Record<string, string> = {
  BOOKED: '#8899A6', ESTIMATE_SENT: '#F5B942', SIGNED: '#4FE8FF',
  IN_PROGRESS: '#4FE8FF', COMPLETED: '#42D392', INVOICED: '#F5B942', PAID: '#42D392',
};

const DONE_STATUSES = new Set(['COMPLETED', 'PAID']);

export function UpcomingJobsList({ jobs, onSelect }: { jobs: UpcomingJob[]; onSelect: (id: string) => void }) {
  return (
    <HudPanel title="Upcoming Jobs" status={{ label: `${jobs.length} Scheduled`, color: COLORS.accent }} className="h-full">
      {jobs.length === 0 ? (
        <div className="text-xs py-8 text-center" style={{ color: COLORS.textMuted }}>Nothing scheduled in the next 7 days.</div>
      ) : (
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {jobs.slice(0, 8).map((j, i) => {
            const color = STATUS_COLOR[j.job_status || ''] || COLORS.textMuted;
            const filled = DONE_STATUSES.has(j.job_status || '');
            return (
              <button
                key={j.id}
                onClick={() => onSelect(j.id)}
                className="relative w-full text-left rounded-2xl border px-4 py-3 pl-12 hover:bg-white/[0.03] transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                {i !== jobs.slice(0, 8).length - 1 && (
                  <div className="absolute left-[21px] top-9 bottom-[-14px] w-px" style={{ background: 'linear-gradient(180deg, rgba(84,231,255,0.28), rgba(84,231,255,0.04))' }} />
                )}
                <span
                  className="absolute left-4 top-5 w-3 h-3 rounded-full"
                  style={filled ? { backgroundColor: color, boxShadow: `0 0 8px ${color}` } : { border: `1.5px solid ${color}`, background: 'transparent' }}
                />
                <div className="grid md:grid-cols-[110px_1fr_auto] gap-3 items-start">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>{fmtDate(j.date)}</div>
                    <div className="text-sm font-semibold mt-1" style={{ color: COLORS.accent }}>{j.time || 'TBD'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: COLORS.text }}>{j.vehicle || 'Vehicle on file'}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: COLORS.textMuted }}>{j.service || 'Job'}{j.customer ? ` · ${j.customer}` : ''}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>{j.job_status || '—'}</div>
                    <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>{money(j.amount)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </HudPanel>
  );
}
