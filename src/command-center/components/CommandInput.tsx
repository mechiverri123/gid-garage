import { useState } from 'react';
import { COLORS } from '../tokens';
import { ActivityFeed } from './ActivityFeed';
import { Workspace } from './Workspace';
import type { ActivityItem, ChatMsg } from '../types';

// The persistent bottom bar (CommandCenterPage) already provides the
// surrounding border/blur — this renders just the input itself as the
// actual "command surface": pill-shaped, centered, glowing on focus,
// rather than a plain boxed form field.
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
    <div className="max-w-3xl mx-auto">
      {(chatMessages.length > 0 || asking) && (
        <div className="mb-3 max-h-64 overflow-y-auto space-y-2.5 px-2">
          <div className="flex justify-end mb-1">
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

      <form onSubmit={submit} className="flex items-center gap-2">
        {/* Decorative flanking marks — subtle, per "waveform-like geometry" */}
        <div className="hidden sm:flex gap-0.5 shrink-0">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused ? 10 + i * 4 : 4, background: focused ? COLORS.accent : COLORS.textFaint, opacity: focused ? 0.8 : 0.3 }} />
          ))}
        </div>

        <div
          className="flex-1 flex items-center rounded-full px-5 py-3 transition-all"
          style={{
            background: 'rgba(11,20,32,0.9)',
            border: `1px solid ${focused ? COLORS.accent : COLORS.border}`,
            boxShadow: focused ? `0 0 24px rgba(79,232,255,0.25)` : 'none',
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest mr-3 shrink-0" style={{ color: COLORS.accent }}>Ask GID</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Who needs follow-up? Move John's brakes to Thursday. How are my ads doing?"
            className="flex-1 bg-transparent text-[#F5F8FA] placeholder-[#52616D] text-sm outline-none"
          />
          <button type="submit" disabled={asking}
            className="shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-40"
            style={{ background: COLORS.accent, color: COLORS.bg0 }}>
            {asking ? '…' : 'Send'}
          </button>
        </div>

        <div className="hidden sm:flex gap-0.5 shrink-0">
          {[2, 1, 0].map(i => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused ? 10 + i * 4 : 4, background: focused ? COLORS.accent : COLORS.textFaint, opacity: focused ? 0.8 : 0.3 }} />
          ))}
        </div>
      </form>
    </div>
  );
}
