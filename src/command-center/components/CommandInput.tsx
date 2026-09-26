import { useState } from 'react';
import { COLORS } from '../tokens';
import { ActivityFeed } from './ActivityFeed';
import { Workspace } from './Workspace';
import type { ActivityItem, ChatMsg } from '../types';

export function CommandInput({
  chatMessages, asking, liveActivity, onAsk, onClear,
}: {
  chatMessages: ChatMsg[];
  asking: boolean;
  liveActivity: ActivityItem[];
  onAsk: (q: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || asking) return;
    onAsk(query);
    setQuery('');
  }

  return (
    <div className="max-w-[1180px] mx-auto w-full">
      {(chatMessages.length > 0 || asking) && (
        <div className="mb-4 rounded-[18px] border p-4 max-h-64 overflow-y-auto space-y-2.5" style={{ borderColor: COLORS.border, background: 'rgba(4,10,18,0.78)' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>Workspace</div>
            {chatMessages.length > 0 && (
              <button onClick={onClear} className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textFaint }}>Clear</button>
            )}
          </div>
          <Workspace messages={chatMessages} />
          {asking && (
            <div className="pl-3 border-l-2 py-1" style={{ borderColor: `${COLORS.accent}40` }}>
              <ActivityFeed items={liveActivity} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center justify-center gap-3">
        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused ? 6 + h * 5 : 4, background: focused ? COLORS.accent : COLORS.textFaint, opacity: focused ? 0.8 : 0.35 }} />
          ))}
        </div>

        <div
          className="flex-1 max-w-[860px] flex items-center rounded-full px-6 py-3.5 transition-all"
          style={{
            background: 'linear-gradient(180deg, rgba(10,22,38,0.94) 0%, rgba(5,13,24,0.92) 100%)',
            border: `1px solid ${focused ? COLORS.borderStrong : COLORS.border}`,
            boxShadow: focused ? '0 0 30px rgba(84,231,255,0.18), inset 0 0 0 1px rgba(84,231,255,0.08)' : 'inset 0 0 0 1px rgba(84,231,255,0.04)',
          }}
        >
          <div className="mr-4 shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: COLORS.accent }}>Ask GID</div>
            <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>Command Surface</div>
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Who needs follow-up? Move John's brakes to Thursday. How are my ads doing?"
            className="flex-1 bg-transparent text-[#F5F8FA] placeholder-[#52616D] text-sm outline-none"
          />
          <button
            type="submit"
            disabled={asking}
            className="shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-40"
            style={{ background: COLORS.accent, color: COLORS.bg0 }}
          >
            {asking ? '…' : 'Send'}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused ? 6 + h * 5 : 4, background: focused ? COLORS.accent : COLORS.textFaint, opacity: focused ? 0.8 : 0.35 }} />
          ))}
        </div>
      </form>
    </div>
  );
}
