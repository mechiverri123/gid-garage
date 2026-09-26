import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import type { HearingState, MicDiagnostics as Diag } from '../hooks/useJarvisListener';
import { COLORS } from '../tokens';

function valueColor(value: string) {
  if (/resolved|live|running|recording|granted/i.test(value)) return COLORS.success;
  if (/failed|timeout|ended|denied|blocked/i.test(value)) return COLORS.warning;
  return COLORS.textMuted;
}

export function MicDiagnostics({
  state,
  diagnostics,
  error,
  onRetry,
}: {
  state: HearingState;
  diagnostics: Diag;
  error?: string | null;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: state === 'error' || state === 'blocked' ? 'rgba(245,185,66,.38)' : COLORS.border,
        background: 'rgba(4,10,18,.72)',
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span className="text-[9px] uppercase tracking-[.18em]" style={{ color: COLORS.textFaint }}>
            Mic diagnostics
          </span>
          <span className="text-[10px] font-semibold" style={{ color: state === 'error' ? COLORS.warning : COLORS.accent }}>
            {state}
          </span>
        </button>

        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 text-[9px] uppercase tracking-[.12em]"
          style={{ color: COLORS.textMuted }}
        >
          <RotateCw size={10} />
          Retry
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 px-3 pb-3 text-[10px]">
          {[
            ['Permission', diagnostics.permission],
            ['getUserMedia', diagnostics.getUserMedia],
            ['Input', diagnostics.deviceLabel || '—'],
            ['Track', diagnostics.trackState || '—'],
            ['Muted', String(diagnostics.trackMuted)],
            ['AudioContext', diagnostics.audioContextState || '—'],
            ['Recorder', diagnostics.recorderState || '—'],
            ['Mic RMS', diagnostics.rms.toFixed(4)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="uppercase tracking-[.12em]" style={{ color: COLORS.textFaint }}>{label}</div>
              <div className="truncate" title={value} style={{ color: valueColor(value) }}>{value}</div>
            </div>
          ))}
          {(error || diagnostics.lastError) && (
            <div className="col-span-2 md:col-span-4 pt-1" style={{ color: COLORS.warning }}>
              {error || diagnostics.lastError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
