import { MicOff, Radio, Volume2 } from 'lucide-react';
import type { RealtimeVoiceState, VoiceDiagnostics } from '../hooks/useLiveKitJarvis';
import { COLORS } from '../tokens';

export function RealtimeVoiceControl({
  state,
  error,
  diagnostics,
  onToggle,
  onTestVoice,
}: {
  state: RealtimeVoiceState;
  error: string | null;
  diagnostics: VoiceDiagnostics;
  onToggle: () => void;
  onTestVoice: () => void;
}) {
  const active = state === 'listening' || state === 'speaking' || state === 'connecting';
  const label =
    state === 'connecting' ? 'CONNECTING' :
    state === 'listening' ? 'LISTENING' :
    state === 'speaking' ? 'SPEAKING' :
    state === 'error' ? 'RETRY VOICE' :
    'START JARVIS';

  const Icon = state === 'speaking' ? Volume2 : active ? Radio : MicOff;

  const bit = (label: string, ok: boolean, extra = '') => (
    <span style={{ color: ok ? COLORS.accent : COLORS.textFaint }}>
      {label} {ok ? '✓' : '—'}{extra}
    </span>
  );

  return (
    <div className="relative z-10 mt-1 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
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

        {diagnostics.agent ? (
          <button
            type="button"
            onClick={onTestVoice}
            className="rounded-full border px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.14em]"
            style={{ borderColor: COLORS.border, color: COLORS.textMuted }}
          >
            Test voice
          </button>
        ) : null}
      </div>

      <div className="text-[8px] uppercase tracking-[0.12em] flex flex-wrap justify-center gap-x-2 gap-y-1" style={{ color: COLORS.textFaint }}>
        {bit('ROOM', diagnostics.room)}
        {bit('AGENT', diagnostics.agent)}
        {bit('MIC', diagnostics.mic, diagnostics.mic ? ` ${diagnostics.micLevel}%` : '')}
        {bit('TTS TRACK', diagnostics.remoteAudio)}
        {bit('AUDIO', diagnostics.audioUnlocked)}
      </div>

      {diagnostics.roomName ? (
        <div className="max-w-[420px] truncate text-[7px] tracking-[0.08em]" style={{ color: COLORS.textFaint }}>
          {diagnostics.roomName}{diagnostics.dispatchId ? ` · ${diagnostics.dispatchId}` : ''}
        </div>
      ) : null}

      {error ? (
        <div className="max-w-[520px] text-center text-[9px] leading-4" style={{ color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
