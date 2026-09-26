import { Volume2, VolumeX, Square, Play, RotateCw, AlertTriangle, Mic, MicOff } from 'lucide-react';
import { COLORS } from '../tokens';
import type { HearingState } from '../hooks/useJarvisListener';

export function VoiceControl({
  enabled,
  speaking,
  error,
  errorDetail,
  needsInteraction,
  onToggle,
  onStop,
  onUnlock,
  onRetry,
  hearingEnabled,
  hearingState = 'off',
  hearingError,
  onToggleHearing,
}: {
  enabled: boolean;
  speaking: boolean;
  error?: string | null;
  errorDetail?: string | null;
  needsInteraction?: boolean;
  onToggle: () => void;
  onStop: () => void;
  onUnlock?: () => void;
  onRetry?: () => void;
  hearingEnabled?: boolean;
  hearingState?: HearingState;
  hearingError?: string | null;
  onToggleHearing?: () => void;
}) {
  const label = speaking
    ? 'Speaking'
    : needsInteraction
      ? 'Tap to start'
      : error
        ? 'Voice unavailable'
        : enabled
          ? 'Armed'
          : 'Muted';

  const color = speaking
    ? COLORS.accent
    : needsInteraction || error
      ? COLORS.warning
      : enabled
        ? COLORS.success
        : COLORS.textMuted;

  const hearingColor = hearingState === 'blocked' || hearingState === 'error'
    ? COLORS.warning
    : hearingState === 'hearing' || hearingState === 'armed'
      ? COLORS.accent
      : hearingEnabled
        ? COLORS.success
        : COLORS.textMuted;

  const hearingLabel = hearingState === 'hearing' ? 'Hearing'
    : hearingState === 'transcribing' ? 'Understanding'
      : hearingState === 'armed' ? 'Command ready'
        : hearingState === 'blocked' ? 'Mic blocked'
          : hearingState === 'error' ? 'Mic error'
            : hearingEnabled ? 'Always listening' : 'Mic off';

  return (
    <div className="relative flex items-center gap-2">
      <div className="hidden md:block text-right mr-1 max-w-[230px]">
        <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>AI Voice</div>
        <div className="text-[10px] font-semibold" style={{ color }}>{label}</div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.14em]" style={{ color: hearingColor }}>{hearingLabel}</div>
        {hearingError && <div className="text-[9px] leading-tight mt-0.5" style={{ color: COLORS.warning }}>{hearingError}</div>}
        {error && (
          <div className="mt-0.5 flex items-start justify-end gap-1 text-[9px] leading-tight" style={{ color: COLORS.warning }} title={errorDetail || error}>
            <AlertTriangle size={9} className="shrink-0 mt-[1px]" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {onToggleHearing && (
        <button
          onClick={onToggleHearing}
          title={hearingEnabled ? 'Disable always-listening microphone' : 'Enable always-listening microphone'}
          className="w-9 h-9 rounded-full border flex items-center justify-center"
          style={{
            borderColor: hearingColor,
            background: hearingEnabled ? 'rgba(84,231,255,0.07)' : 'rgba(255,255,255,0.02)',
            boxShadow: hearingState === 'hearing' ? '0 0 16px rgba(84,231,255,0.24)' : 'none',
          }}
        >
          {hearingEnabled ? <Mic size={14} color={hearingColor} /> : <MicOff size={14} color={COLORS.textMuted} />}
        </button>
      )}

      {needsInteraction && onUnlock && (
        <button onClick={onUnlock} title="Play queued AI greeting" className="w-9 h-9 rounded-full border flex items-center justify-center animate-pulse" style={{ borderColor: COLORS.warning, background: 'rgba(245,185,66,0.09)' }}>
          <Play size={13} color={COLORS.warning} fill={COLORS.warning} />
        </button>
      )}

      {error && onRetry && (
        <button onClick={onRetry} title={errorDetail || 'Retry AI voice'} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: COLORS.warning, background: 'rgba(245,185,66,0.06)' }}>
          <RotateCw size={13} color={COLORS.warning} />
        </button>
      )}

      {speaking && (
        <button onClick={onStop} title="Stop speaking" className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: COLORS.accent, background: 'rgba(84,231,255,0.1)' }}>
          <Square size={13} color={COLORS.accent} fill={COLORS.accent} />
        </button>
      )}

      <button
        onClick={onToggle}
        title={enabled ? 'Mute AI voice' : 'Enable AI voice'}
        className="w-9 h-9 rounded-full border flex items-center justify-center"
        style={{ borderColor: enabled ? COLORS.borderStrong : COLORS.border, background: enabled ? 'rgba(84,231,255,0.06)' : 'rgba(255,255,255,0.02)' }}
      >
        {enabled ? <Volume2 size={15} color={COLORS.accent} /> : <VolumeX size={15} color={COLORS.textMuted} />}
      </button>
    </div>
  );
}
