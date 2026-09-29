// Types for jarvis-workspace.js (the /jarvis visual workspace state machine).

export type JobTab = 'overview' | 'estimate' | 'payment' | 'inspection' | 'notes' | 'parts';
export type CalendarMode = 'day' | 'week' | 'month';
export const JOB_TABS: JobTab[];
export const CALENDAR_MODES: CalendarMode[];

export type WorkspaceView =
  | { type: 'jobs'; jobIds: string[]; focus: number; expanded: boolean; tab: JobTab; title: string | null }
  | { type: 'analytics'; range: Record<string, unknown> }
  | { type: 'calendar'; date: string | null; mode: CalendarMode }
  | { type: 'jobList'; query: string; status: string }
  | { type: 'customers'; query: string }
  | { type: 'newJob' }
  | { type: 'settings' };

export interface WorkspaceState { stack: WorkspaceView[] }
export type WorkspaceAction = { type: string; [k: string]: unknown };
export interface JobMetaEntry { label: string; date: string }

export const INITIAL_WORKSPACE: WorkspaceState;
export function normalizeView(v: unknown): WorkspaceView | null;
export function workspaceReduce(state: WorkspaceState, action: WorkspaceAction): WorkspaceState;
export function workspaceTop(state: WorkspaceState): WorkspaceView | null;
export function resolveCalendarWhen(when: string, today: string): { date: string; mode: CalendarMode } | null;
export function parseLocalCommand(text: string, state: WorkspaceState, opts?: { meta?: JobMetaEntry[]; today?: string }): (WorkspaceAction & { reply?: string }) | null;
export function describeScreen(state: WorkspaceState, meta?: JobMetaEntry[]): Record<string, unknown> | null;
export function isScreenFollowUp(text: string, state: WorkspaceState): boolean;
