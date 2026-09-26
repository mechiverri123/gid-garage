import { Activity, CalendarClock } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
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

export function LiveFeed({ leads }: { leads: Lead[] }) {
  const recent = [...leads]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <HudPanel title="Live Business Feed" status={{ label: 'Live', color: COLORS.accent }} className="h-full">
      {recent.length === 0 ? (
        <div className="grid md:grid-cols-2 gap-3 min-h-[180px]">
          <div className="rounded-2xl border p-4" style={{ borderColor: COLORS.border, background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: COLORS.textMuted }}>
              <Activity size={14} />
              <span className="text-[10px] uppercase tracking-[0.18em]">Awaiting Activity</span>
            </div>
            <div className="text-sm" style={{ color: COLORS.text }}>No recent lead events</div>
            <div className="text-xs mt-1" style={{ color: COLORS.textFaint }}>New leads, follow-up updates, and recent contact activity will appear here.</div>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: COLORS.border, background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: COLORS.textMuted }}>
              <CalendarClock size={14} />
              <span className="text-[10px] uppercase tracking-[0.18em]">Queue Status</span>
            </div>
            <div className="text-sm" style={{ color: COLORS.text }}>System ready</div>
            <div className="text-xs mt-1" style={{ color: COLORS.textFaint }}>Once new activity lands, this feed becomes your rolling intelligence strip.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {recent.map((l, index) => (
            <div key={l.id} className="rounded-2xl border px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: index === 0 ? COLORS.accent : COLORS.accentDim }} />
                  <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>Lead Event</span>
                </div>
                <span className="text-[10px]" style={{ color: COLORS.accent }}>{timeAgo(l.created_at)}</span>
              </div>
              <div className="text-sm" style={{ color: COLORS.text }}>
                {`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || 'New lead'}
              </div>
              <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
                {fmtSource(l.source)}{l.requested_service ? ` · ${l.requested_service}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </HudPanel>
  );
}
