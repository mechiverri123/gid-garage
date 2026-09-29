// Types for jarvis-workspace.js (the /jarvis visual workspace state machine).

export type JobTab = 'overview' | 'estimate' | 'payment' | 'inspection' | 'notes' | 'parts';
export type CalendarMode = 'day' | 'week' | 'month';
export const JOB_TABS: JobTab[];
export const CALENDAR_MODES: CalendarMode[];

export type WorkspaceView =
  | { type: 'jobs'; jobIds: string[]; focus: number; expanded: boolean; tab: JobTab; title: string | null; family: boolean }
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
export function jobFamily(list: { id: string; customerId?: string | null; fname?: string; lname?: string; phone?: string; date?: string; status?: string; jobStatus?: string }[], id: string): string[];
export function spokenDate(text: string): { month: string | null; day: string } | null;
export function spokenYmd(text: string, today: string, prefer?: 'future' | 'past'): string | null;
export function parseRevenueRequest(text: string, today: string): Record<string, unknown> | null;
export function parsePanelRequest(text: string): { panel: 'brief' | 'reviews' | 'social' | 'mail' | 'leads' | 'messages' } | null;
export function parseScheduleRequest(text: string, today: string): { when: string; date: string; mode: CalendarMode } | null;
export function parseCustomerJobsRequest(text: string): { customer: string; count: number | null } | null;
