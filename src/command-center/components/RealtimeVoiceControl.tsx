import { Mic, MicOff, Radio, Volume2 } from 'lucide-react';
import type { RealtimeVoiceState } from '../hooks/useLiveKitJarvis';
import { COLORS } from '../tokens';

export function RealtimeVoiceControl({
  state,
  error,
  onToggle,
}: {
  state: RealtimeVoiceState;
  error: string | null;
  onToggle: () => void;
}) {
  const active = state === 'listening' || state === 'speaking' || state === 'connecting';
  const label =
    state === 'connecting' ? 'CONNECTING' :
    state === 'listening' ? 'LISTENING' :
    state === 'speaking' ? 'SPEAKING' :
    state === 'error' ? 'RETRY VOICE' :
    'START JARVIS';

  const Icon = state === 'speaking' ? Volume2 : state === 'listening' || state === 'connecting' ? Radio : active ? Mic : MicOff;

  return (
    <div className="relative z-10 mt-1 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-all hover:scale-[1.02]"
        style={{
          borderColor: active ? 'rgba(79,232,255,0.46)' : COLORS.border,
          color: active ? COLORS.accent : COLORS.textMuted,
          background: active ? 'rgba(79,232,255,0.07)' : 'rgba(255,255,255,0.025)',
          boxShadow: state === 'speaking' ? '0 0 24px rgba(79,232,255,0.18)' : 'none',
        }}
      >
        <Icon size={13} />
        {label}
      </button>
      <div className="text-[8px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>
        LiveKit realtime · WebRTC
      </div>
      {error ? (
        <div className="max-w-[360px] text-center text-[9px] leading-4" style={{ color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
