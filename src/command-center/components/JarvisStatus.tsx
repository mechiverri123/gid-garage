import { COLORS } from '../tokens';
import type { JarvisState } from '../types';

const STATE_LABEL: Record<JarvisState, string> = {
  idle: 'IDLE',
  processing: 'ANALYZING',
  tool: 'WORKING',
  success: 'DONE',
  error: 'ERROR',
};

const STATE_COLOR: Record<JarvisState, string> = {
  idle: COLORS.textFaint,
  processing: COLORS.accent,
  tool: COLORS.accent,
  success: COLORS.success,
  error: COLORS.critical,
};

// Phase 1 stand-in for the eventual React Three Fiber Jarvis Core (Phase 3).
// Deliberately simple — a state dot + label — but wired to the same real
// JarvisState the eventual 3D version will consume, so nothing here needs
// to change when that lands, just what renders around this state.
export function JarvisStatus({ state }: { state: JarvisState }) {
  const color = STATE_COLOR[state];
  const pulsing = state === 'processing' || state === 'tool';
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6">
      <div
        className={`w-3 h-3 rounded-full ${pulsing ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
      />
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color }}>
        {STATE_LABEL[state]}
      </div>
    </div>
  );
}
