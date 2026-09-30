// Command Center mode state, driven only by trusted backend events
// (admin-ai-chat.js emits `ui_mode` every turn and `ui_focus` for SEO panels).
// No keyword guessing here. Pure — tested in tests/seo-ui-mode.test.js.
import type { SeoView } from './seoTypes';

export type AppMode = 'ops' | 'seo' | 'money';
export interface UiModeState { mode: AppMode; seoFocus: SeoView }
export type UiModeEvent =
  | { type: 'ui_mode'; mode: 'ops' | 'seo' }
  | { type: 'ui_focus'; mode: 'seo'; target: SeoView }
  | { type: 'manual'; mode: AppMode };

export const INITIAL_UI_MODE: UiModeState = { mode: 'ops', seoFocus: 'overview' };

export function applyUiEvent(state: UiModeState, event: UiModeEvent): UiModeState {
  switch (event.type) {
    case 'ui_focus':
      return { mode: 'seo', seoFocus: event.target };
    case 'ui_mode':
      // Every chat turn reports 'ops' unless it was about SEO: that must not pull the
      // owner off the Money page while he asks Jarvis something.
      if (event.mode === 'ops' && state.mode === 'money') return state;
      return event.mode === 'ops' ? { mode: 'ops', seoFocus: 'overview' } : { ...state, mode: 'seo' };
    case 'manual':
      // Leaving SEO clears its focus so the next visit starts at the overview.
      if (event.mode === 'ops') return { mode: 'ops', seoFocus: 'overview' };
      if (event.mode === 'money') return { mode: 'money', seoFocus: 'overview' };
      return { ...state, mode: 'seo' };
    default:
      return state;
  }
}
