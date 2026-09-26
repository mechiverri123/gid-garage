import { PANEL, PANEL_PADDING, LABEL, COLORS } from '../tokens';
import { fmtSource } from '../utils/formatters';
import type { Lead } from '../types';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Built entirely from the `leads` list already loaded elsewhere on this
// page — no new backend call. Narrower than a full activity feed (it only
// covers lead creation and status changes visible via updated_at vs
// created_at), but every entry is real. Never fabricates events.
export function LiveFeed({ leads }: { leads: Lead[] }) {
  const recent = [...leads]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={LABEL}>Live Business Feed</div>
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: COLORS.accent }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLORS.accent }} />
          Live
        </span>
      </div>
      {recent.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: COLORS.textFaint }}>No activity yet.</div>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {recent.map(l => (
            <div key={l.id} className="text-xs border-b border-white/5 pb-2">
              <div className="text-[#F5F8FA]">
                Lead from {fmtSource(l.source)}
                {(l.fname || l.lname) && <span style={{ color: COLORS.textMuted }}> — {`${l.fname || ''} ${l.lname || ''}`.trim()}</span>}
              </div>
              <div className="text-[10px]" style={{ color: COLORS.textFaint }}>{timeAgo(l.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
