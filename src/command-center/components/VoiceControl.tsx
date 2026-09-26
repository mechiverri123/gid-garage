import { Volume2, VolumeX, Square, Play } from 'lucide-react';
import { COLORS } from '../tokens';

export function VoiceControl({
  enabled,
  speaking,
  error,
  needsInteraction,
  onToggle,
  onStop,
  onUnlock,
}: {
  enabled: boolean;
  speaking: boolean;
  error?: string | null;
  needsInteraction?: boolean;
  onToggle: () => void;
  onStop: () => void;
  onUnlock?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:block text-right mr-1">
        <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>AI Voice</div>
        <div className="text-[10px] font-semibold" style={{ color: error ? COLORS.warning : speaking ? COLORS.accent : needsInteraction ? COLORS.warning : enabled ? COLORS.success : COLORS.textMuted }}>
          {error ? 'Voice error' : speaking ? 'Speaking' : needsInteraction ? 'Tap to start' : enabled ? 'Armed' : 'Muted'}
        </div>
      </div>
      {needsInteraction && onUnlock && (
        <button
          onClick={onUnlock}
          title="Start Jarvis voice"
          className="w-9 h-9 rounded-full border flex items-center justify-center transition-all animate-pulse"
          style={{ borderColor: COLORS.warning, background: 'rgba(245,185,66,0.09)', boxShadow: '0 0 16px rgba(245,185,66,0.16)' }}
        >
          <Play size={13} color={COLORS.warning} fill={COLORS.warning} />
        </button>
      )}
      {speaking && (
        <button
          onClick={onStop}
          title="Stop speaking"
          className="w-9 h-9 rounded-full border flex items-center justify-center transition-all"
          style={{ borderColor: COLORS.accent, background: 'rgba(84,231,255,0.1)', boxShadow: '0 0 16px rgba(84,231,255,0.16)' }}
        >
          <Square size={13} color={COLORS.accent} fill={COLORS.accent} />
        </button>
      )}
      <button
        onClick={onToggle}
        title={enabled ? 'Mute AI voice' : 'Enable AI voice'}
        className="w-9 h-9 rounded-full border flex items-center justify-center transition-all"
        style={{ borderColor: enabled ? COLORS.borderStrong : COLORS.border, background: enabled ? 'rgba(84,231,255,0.06)' : 'rgba(255,255,255,0.02)' }}
      >
        {enabled ? <Volume2 size={15} color={COLORS.accent} /> : <VolumeX size={15} color={COLORS.textMuted} />}
      </button>
    </div>
  );
}
