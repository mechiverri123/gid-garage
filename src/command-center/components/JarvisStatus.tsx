import { JarvisCore } from './JarvisCore';
import type { ActivityItem, JarvisState } from '../types';

const STATE_LABEL: Record<JarvisState, string> = {
  idle: 'IDLE',
  processing: 'ANALYZING',
  tool: 'WORKING',
  success: 'DONE',
  error: 'ERROR',
};

// Phase 3: the real orb. Progress is real, not decorative — it's the
// fraction of in-flight tool calls that have finished, so the outer ring's
// partial sweep during "tool" state reflects actual work happening, not a
// fake loading animation.
export function JarvisStatus({ state, liveActivity = [] }: { state: JarvisState; liveActivity?: ActivityItem[] }) {
  const total = liveActivity.length;
  const done = liveActivity.filter(a => a.status !== 'running').length;
  const progress = total > 0 ? done / total : 0;

  return <JarvisCore state={state} progress={progress} label={STATE_LABEL[state]} />;
}
