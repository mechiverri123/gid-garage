import { Volume2, VolumeX, Square } from 'lucide-react';
import { COLORS } from '../tokens';

export function VoiceControl({
  enabled,
  speaking,
  error,
  onToggle,
  onStop,
}: {
  enabled: boolean;
  speaking: boolean;
  error?: string | null;
  onToggle: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:block text-right mr-1">
        <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>AI Voice</div>
        <div className="text-[10px] font-semibold" style={{ color: error ? COLORS.warning : speaking ? COLORS.accent : enabled ? COLORS.success : COLORS.textMuted }}>
          {error ? 'Voice error' : speaking ? 'Speaking' : enabled ? 'Armed' : 'Muted'}
        </div>
      </div>
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
