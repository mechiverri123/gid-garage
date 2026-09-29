import { MicOff, Radio, Volume2, Check, Minus, Loader2, AlertTriangle } from 'lucide-react';
import type { RealtimeVoiceState, VoiceDiagnostics } from '../hooks/useLiveKitJarvis';
import { C } from '../ui/theme';

// Start/stop voice + a small connection checklist. The checklist and technical
// detail only show while a session is starting or running (or failed), so the
// idle UI stays quiet. `partial` is the live transcript (display only).
export function RealtimeVoiceControl({
  state,
  error,
  diagnostics,
  onToggle,
  onTestVoice,
  mode = 'livekit',
  partial = '',
  note = null,
}: {
  state: RealtimeVoiceState;
  error: string | null;
  diagnostics: VoiceDiagnostics;
  onToggle: () => void;
  onTestVoice: () => void;
  mode?: 'direct' | 'livekit';
  partial?: string;
  note?: string | null;
}) {
  const active = state === 'listening' || state === 'speaking' || state === 'connecting' || state === 'thinking' || state === 'interrupted';
  const label =
    state === 'connecting' ? 'Connecting…' :
    state === 'listening' ? 'Listening — tap to stop' :
    state === 'thinking' ? 'Thinking…' :
    state === 'speaking' ? 'Speaking — talk to interrupt' :
    state === 'interrupted' ? 'Go ahead…' :
    state === 'unavailable' ? 'Voice unavailable' :
    state === 'error' ? 'Retry voice' :
    'Start voice';

  const Icon = state === 'speaking' ? Volume2 : state === 'thinking' || state === 'connecting' ? Loader2 : state === 'unavailable' ? AlertTriangle : active ? Radio : MicOff;

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
            color: state === 'unavailable' ? C.amber : active ? C.cyan : C.text,
            background: active ? 'rgba(52,214,255,0.1)' : 'rgba(255,255,255,0.03)',
            boxShadow: state === 'speaking' ? '0 0 24px rgba(52,214,255,0.2)' : 'none',
          }}
        >
          <Icon size={16} className={state === 'thinking' || state === 'connecting' ? 'animate-spin' : ''} />
          {label}
        </button>

        {diagnostics.agent && active ? (
          <button type="button" onClick={onTestVoice} className="cc-btn rounded-lg px-3 py-2 text-[13px] font-medium" style={{ border: `1px solid ${C.border}`, color: C.text2 }}>
            Test voice
          </button>
        ) : null}
      </div>

      {partial && active ? (
        <div className="text-[14px] italic leading-snug truncate" style={{ color: C.text2 }} aria-live="polite">“{partial}”</div>
      ) : null}

      {(active || state === 'error') && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {mode === 'direct' ? [
            bit('Mic', diagnostics.mic, diagnostics.mic ? ` ${diagnostics.micLevel}%` : ''),
            bit('Hearing', diagnostics.room),
            bit('Voice', diagnostics.agent),
            bit('Audio', diagnostics.audioUnlocked),
          ] : [
            bit('Room', diagnostics.room),
            bit('Agent', diagnostics.agent),
            bit('Mic', diagnostics.mic, diagnostics.mic ? ` ${diagnostics.micLevel}%` : ''),
            bit('Voice track', diagnostics.remoteAudio),
            bit('Audio', diagnostics.audioUnlocked),
          ]}
        </div>
      )}

      {active && mode === 'livekit' && diagnostics.roomName ? (
        <div className="truncate text-[11px]" style={{ color: C.muted }}>
          {diagnostics.roomName}{diagnostics.dispatchId ? ` · ${diagnostics.dispatchId}` : ''}
        </div>
      ) : null}

      {note ? <div className="text-[12px]" style={{ color: C.muted }}>{note}</div> : null}

      {error ? (
        <div className="text-[13px] leading-snug" style={{ color: state === 'unavailable' ? C.amber : C.red }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
