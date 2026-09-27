import { useEffect, useState } from 'react';
import { Search, RotateCw, Maximize2, Minimize2 } from 'lucide-react';
import { COLORS } from '../tokens';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function TopStatusBar({ onSearch, onRefresh, streamOk }: { onSearch: () => void; onRefresh: () => void; streamOk: boolean }) {
  const now = useClock();
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return (
    <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b" style={{ borderColor: COLORS.border }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: streamOk ? COLORS.success : COLORS.warning }} />
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: COLORS.textMuted }}>
          System {streamOk ? 'Online' : 'Reconnecting'}
        </span>
      </div>

      <div className="text-center">
        <div className="text-[13px] font-bold tracking-tight" style={{ color: COLORS.text }}>GID GARAGE COMMAND CENTER</div>
        <div className="text-[10px] font-mono" style={{ color: COLORS.accent }}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onSearch} title="Command palette (Ctrl+K)" className="hover:opacity-70 transition-opacity">
          <Search size={14} color={COLORS.textMuted} />
        </button>
        <button onClick={onRefresh} title="Refresh" className="hover:opacity-70 transition-opacity">
          <RotateCw size={14} color={COLORS.textMuted} />
        </button>
        <button onClick={toggleFullscreen} title="Fullscreen" className="hover:opacity-70 transition-opacity">
          {isFull ? <Minimize2 size={14} color={COLORS.textMuted} /> : <Maximize2 size={14} color={COLORS.textMuted} />}
        </button>
      </div>
    </div>
  );
}
