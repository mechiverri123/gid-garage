import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../tokens';

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void;
}

export function useCommandPalette(commands: PaletteCommand[]) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen, commands };
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) { cmd.run(); onClose(); }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(6,9,13,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl overflow-hidden"
        style={{ background: '#0f1620', border: `1px solid ${COLORS.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
          className="w-full bg-transparent text-[#F5F8FA] placeholder-[#52616D] px-4 py-3.5 text-sm outline-none border-b border-white/5"
        />
        <div className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="text-xs text-[#52616D] px-4 py-3">No matching commands.</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => { c.run(); onClose(); }}
                onMouseEnter={() => setSelected(i)}
                className="w-full text-left px-4 py-2 text-sm transition-colors"
                style={{
                  color: i === selected ? COLORS.accent : COLORS.text,
                  background: i === selected ? 'rgba(50,217,255,0.08)' : 'transparent',
                }}
              >
                {c.label}
              </button>
            ))
          )}
        </div>
        <div className="text-[10px] text-[#52616D] px-4 py-2 border-t border-white/5">
          ↑↓ navigate · ↵ select · esc close
        </div>
      </div>
    </div>
  );
}
