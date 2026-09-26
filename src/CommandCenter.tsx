// The Command Center now lives in src/command-center/ (Phase 1 rebuild —
// new component architecture, design tokens, grid layout; see that folder).
// This file just re-exports under the same name BookingWidget.tsx already
// imports, so nothing else needs to change.
export { CommandCenterPage as CommandCenterTab } from './command-center/CommandCenterPage';
