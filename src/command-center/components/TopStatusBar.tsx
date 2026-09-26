import { useEffect, useState } from 'react';
import { Search, RotateCw, Maximize2, Minimize2, Bell, Wifi } from 'lucide-react';
import { COLORS } from '../tokens';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function StatusPill({ label, ok = true }: { label: string; ok?: boolean }) {
  const color = ok ? COLORS.success : COLORS.warning;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: ok ? `${COLORS.success}33` : `${COLORS.warning}33`, background: 'rgba(255,255,255,0.02)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textMuted }}>{label}</span>
    </div>
  );
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
    <header className="relative px-4 sm:px-6 lg:px-8 py-3 border-b" style={{ borderColor: COLORS.border, background: 'rgba(3,8,18,0.82)', backdropFilter: 'blur(18px)' }}>
      <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.borderStrong}, transparent)` }} />
      <div className="max-w-[1880px] mx-auto flex items-center justify-between gap-4">
        <div className="hidden xl:flex items-center gap-2">
          <StatusPill label="System Online" />
          <StatusPill label="AI Online" ok={streamOk} />
          <StatusPill label="DB Connected" />
        </div>

        <div className="flex-1 xl:flex-none text-center">
          <div className="text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.18em]" style={{ color: COLORS.text }}>GID GARAGE COMMAND CENTER</div>
          <div className="flex items-center justify-center gap-3 mt-1">
            <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="text-[11px] font-mono" style={{ color: COLORS.accent }}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onSearch} title="Command palette (Ctrl+K)" className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/5" style={{ borderColor: COLORS.border }}>
            <Search size={14} color={COLORS.textMuted} />
          </button>
          <button onClick={onRefresh} title="Refresh" className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/5" style={{ borderColor: COLORS.border }}>
            <RotateCw size={14} color={COLORS.textMuted} />
          </button>
          <button title="Status" className="hidden sm:flex w-9 h-9 rounded-full border items-center justify-center hover:bg-white/5" style={{ borderColor: COLORS.border }}>
            <Wifi size={14} color={COLORS.textMuted} />
          </button>
          <button title="Alerts" className="hidden sm:flex w-9 h-9 rounded-full border items-center justify-center hover:bg-white/5" style={{ borderColor: COLORS.border }}>
            <Bell size={14} color={COLORS.textMuted} />
          </button>
          <button onClick={toggleFullscreen} title="Fullscreen" className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/5" style={{ borderColor: COLORS.border }}>
            {isFull ? <Minimize2 size={14} color={COLORS.textMuted} /> : <Maximize2 size={14} color={COLORS.textMuted} />}
          </button>
        </div>
      </div>
    </header>
  );
}
