import { Volume2, VolumeX, Square, Play, RotateCw, AlertTriangle } from 'lucide-react';
import { COLORS } from '../tokens';

export function VoiceControl({
  enabled,
  speaking,
  error,
  errorDetail,
  needsInteraction,
  mode,
  onToggle,
  onStop,
  onUnlock,
  onRetry,
}: {
  enabled: boolean;
  speaking: boolean;
  error?: string | null;
  errorDetail?: string | null;
  needsInteraction?: boolean;
  mode?: 'openai' | 'idle';
  onToggle: () => void;
  onStop: () => void;
  onUnlock?: () => void;
  onRetry?: () => void;
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

  return (
    <div className="relative flex items-center gap-2">
      <div className="hidden md:block text-right mr-1 max-w-[220px]">
        <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>
          AI Voice
        </div>
        <div className="text-[10px] font-semibold" style={{ color }}>
          {label}
        </div>
        {error && (
          <div className="mt-0.5 flex items-start justify-end gap-1 text-[9px] leading-tight" style={{ color: COLORS.warning }} title={errorDetail || error}>
            <AlertTriangle size={9} className="shrink-0 mt-[1px]" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {needsInteraction && onUnlock && (
        <button
          onClick={onUnlock}
          title="Play queued AI greeting"
          className="w-9 h-9 rounded-full border flex items-center justify-center animate-pulse"
          style={{ borderColor: COLORS.warning, background: 'rgba(245,185,66,0.09)' }}
        >
          <Play size={13} color={COLORS.warning} fill={COLORS.warning} />
        </button>
      )}

      {error && onRetry && (
        <button
          onClick={onRetry}
          title={errorDetail || 'Retry AI voice'}
          className="w-9 h-9 rounded-full border flex items-center justify-center"
          style={{ borderColor: COLORS.warning, background: 'rgba(245,185,66,0.06)' }}
        >
          <RotateCw size={13} color={COLORS.warning} />
        </button>
      )}

      {speaking && (
        <button
          onClick={onStop}
          title="Stop speaking"
          className="w-9 h-9 rounded-full border flex items-center justify-center"
          style={{ borderColor: COLORS.accent, background: 'rgba(84,231,255,0.1)' }}
        >
          <Square size={13} color={COLORS.accent} fill={COLORS.accent} />
        </button>
      )}

      <button
        onClick={onToggle}
        title={enabled ? 'Mute AI voice' : 'Enable AI voice'}
        className="w-9 h-9 rounded-full border flex items-center justify-center"
        style={{
          borderColor: enabled ? COLORS.borderStrong : COLORS.border,
          background: enabled ? 'rgba(84,231,255,0.06)' : 'rgba(255,255,255,0.02)',
        }}
      >
        {enabled
          ? <Volume2 size={15} color={COLORS.accent} />
          : <VolumeX size={15} color={COLORS.textMuted} />}
      </button>
    </div>
  );
}
