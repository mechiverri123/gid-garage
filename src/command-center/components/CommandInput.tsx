import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { COLORS } from '../tokens';
import { ActivityFeed } from './ActivityFeed';
import { Workspace } from './Workspace';
import type { ActivityItem, ChatMsg } from '../types';
import type { HearingState } from '../hooks/useJarvisListener';

const HEARING_LABEL: Record<HearingState, string> = {
  off: 'Mic off',
  starting: 'Starting mic',
  listening: 'Say “Jarvis…”',
  hearing: 'Hearing you',
  transcribing: 'Understanding',
  armed: 'Listening for command',
  blocked: 'Mic blocked',
  error: 'Mic error',
};

export function CommandInput({
  chatMessages, asking, liveActivity, onAsk, onClear,
  hearingEnabled, hearingState, hearingError, onToggleHearing,
}: {
  chatMessages: ChatMsg[];
  asking: boolean;
  liveActivity: ActivityItem[];
  onAsk: (q: string) => void;
  onClear: () => void;
  hearingEnabled?: boolean;
  hearingState?: HearingState;
  hearingError?: string | null;
  onToggleHearing?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = query.trim();
    if (!clean || asking) return;
    onAsk(clean);
    setQuery('');
  }

  const state = hearingState || 'off';
  const micHot = state === 'listening' || state === 'hearing' || state === 'armed' || state === 'transcribing';
  const stateColor = state === 'blocked' || state === 'error' ? COLORS.warning
    : state === 'hearing' || state === 'armed' ? COLORS.accent
      : hearingEnabled ? COLORS.success : COLORS.textFaint;

  return (
    <div className="max-w-[1320px] mx-auto w-full">
      {(chatMessages.length > 0 || asking) && (
        <div className="mb-4 rounded-[18px] border p-4 max-h-64 overflow-y-auto space-y-2.5" style={{ borderColor: COLORS.border, background: 'rgba(4,10,18,0.78)' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>Michael + GID</div>
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

      <div className="flex items-center justify-center gap-2 mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: stateColor }}>
        <span className={`w-1.5 h-1.5 rounded-full ${state === 'hearing' ? 'animate-pulse' : ''}`} style={{ background: stateColor, boxShadow: micHot ? `0 0 10px ${stateColor}` : 'none' }} />
        {hearingError || HEARING_LABEL[state]}
      </div>

      <form onSubmit={submit} className="flex items-center justify-center gap-3">
        <div
          className="relative flex-1 max-w-[980px] flex items-center rounded-full px-5 py-3 transition-all overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(11,24,39,0.98) 0%, rgba(6,14,24,0.96) 100%)',
            border: `1px solid ${focused || micHot ? COLORS.borderStrong : COLORS.border}`,
            boxShadow: focused || micHot ? '0 0 34px rgba(84,231,255,0.16), inset 0 0 0 1px rgba(84,231,255,0.08)' : 'inset 0 0 0 1px rgba(84,231,255,0.04)',
          }}
        >
          <div className="mr-4 shrink-0 relative z-10">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: COLORS.accent }}>GID</div>
            <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>
              {state === 'hearing' ? 'Michael detected' : state === 'armed' ? 'Awaiting command' : 'Owner Command'}
            </div>
          </div>

          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={'Say “Jarvis, catch me up” or type a command…'}
            className="relative z-10 flex-1 bg-transparent text-[#F5F8FA] placeholder-[#52616D] text-sm outline-none min-w-0"
          />

          {onToggleHearing && (
            <button
              type="button"
              onClick={onToggleHearing}
              title={hearingEnabled ? 'Turn off always-listening Jarvis' : 'Enable always-listening Jarvis'}
              className="relative z-10 shrink-0 w-11 h-11 ml-2 rounded-full border flex items-center justify-center transition-all"
              style={{
                borderColor: micHot ? COLORS.accent : stateColor,
                background: micHot ? 'rgba(84,231,255,0.12)' : 'rgba(255,255,255,0.02)',
                boxShadow: micHot ? '0 0 20px rgba(84,231,255,0.22)' : 'none',
              }}
            >
              {hearingEnabled ? <Mic size={16} color={stateColor} /> : <MicOff size={16} color={COLORS.textMuted} />}
            </button>
          )}

          <button
            type="submit"
            disabled={asking}
            className="relative z-10 shrink-0 rounded-full px-5 py-2 ml-2 text-xs font-bold uppercase tracking-[0.18em] transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-40"
            style={{ background: COLORS.accent, color: COLORS.bg0, boxShadow: '0 0 18px rgba(84,231,255,0.22)' }}
          >
            {asking ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
