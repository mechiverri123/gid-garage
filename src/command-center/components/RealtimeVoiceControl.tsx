import { MicOff, Radio, Volume2, Check, Minus } from 'lucide-react';
import type { RealtimeVoiceState, VoiceDiagnostics } from '../hooks/useLiveKitJarvis';
import { C } from '../ui/theme';

// Start/stop realtime voice + connection checklist. The checklist only shows
// while a session is starting or running (or failed), so idle stays quiet.
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
    state === 'connecting' ? 'Connecting…' :
    state === 'listening' ? 'Listening — tap to stop' :
    state === 'speaking' ? 'Speaking' :
    state === 'error' ? 'Retry voice' :
    'Start voice';

  const Icon = state === 'speaking' ? Volume2 : active ? Radio : MicOff;

  const bit = (name: string, ok: boolean, extra = '') => (
    <span key={name} className="inline-flex items-center gap-1" style={{ color: ok ? C.green : C.muted }}>
      {ok ? <Check size={13} /> : <Minus size={13} />}{name}{extra}
    </span>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={active}
          className="cc-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold"
          style={{
            border: `1px solid ${active ? C.borderStrong : C.border}`,
            color: active ? C.cyan : C.text,
            background: active ? 'rgba(52,214,255,0.1)' : 'rgba(255,255,255,0.03)',
            boxShadow: state === 'speaking' ? '0 0 24px rgba(52,214,255,0.2)' : 'none',
          }}
        >
          <Icon size={16} />
          {label}
        </button>

        {diagnostics.agent ? (
          <button type="button" onClick={onTestVoice} className="cc-btn rounded-lg px-3 py-2 text-[13px] font-medium" style={{ border: `1px solid ${C.border}`, color: C.text2 }}>
            Test voice
          </button>
        ) : null}
      </div>

      {(active || state === 'error') && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {bit('Room', diagnostics.room)}
          {bit('Agent', diagnostics.agent)}
          {bit('Mic', diagnostics.mic, diagnostics.mic ? ` ${diagnostics.micLevel}%` : '')}
          {bit('Voice track', diagnostics.remoteAudio)}
          {bit('Audio', diagnostics.audioUnlocked)}
        </div>
      )}

      {active && diagnostics.roomName ? (
        <div className="truncate text-[11px]" style={{ color: C.muted }}>
          {diagnostics.roomName}{diagnostics.dispatchId ? ` · ${diagnostics.dispatchId}` : ''}
        </div>
      ) : null}

      {error ? (
        <div className="text-[13px] leading-snug" style={{ color: C.red }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
