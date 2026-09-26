import { useState } from 'react';
import { PANEL, PANEL_PADDING, LABEL } from '../tokens';
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || asking) return;
    onAsk(query);
    setQuery('');
  }

  return (
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={LABEL}>Ask GID</div>
        {chatMessages.length > 0 && (
          <button onClick={onClear} className="text-[10px] text-[#52616D] hover:text-[#8899A6] uppercase tracking-wide">Clear</button>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Who needs follow-up? Move John's brakes to Thursday. How are my ads doing?"
          className="flex-1 bg-black/30 border border-white/10 text-[#F5F8FA] placeholder-[#52616D] px-4 py-2.5 text-sm rounded-lg outline-none focus:border-[#32D9FF]/50 transition-colors"
        />
        <button type="submit" disabled={asking}
          className="bg-[#32D9FF] hover:bg-[#12A8D8] disabled:opacity-40 text-[#06090D] text-xs font-bold uppercase tracking-wide px-5 py-2.5 rounded-lg transition-all hover:-translate-y-px active:scale-[0.98] whitespace-nowrap">
          {asking ? '…' : 'Ask'}
        </button>
      </form>

      {(chatMessages.length > 0 || asking) && (
        <div className="mt-3 space-y-2.5 max-h-80 overflow-y-auto">
          <Workspace messages={chatMessages} />
          {asking && (
            <div className="pl-3 border-l-2 border-[#32D9FF]/40 py-1">
              <ActivityFeed items={liveActivity} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
