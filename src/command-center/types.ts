// ── Shared types for the Command Center ──────────────────────────────────
// Mirrors what admin-api-data.js and admin-ai-chat.js actually return —
// keep in sync with those two files if their response shapes change.

export interface ActivityItem {
  tool: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  startedAt: number;
}

export interface DataCard {
  tool: string;
  payload: any;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  cards?: DataCard[];
}

// Drives JarvisStatus (Phase 1: text/indicator only — the Three.js Jarvis
// Core is Phase 3). Mapped directly from the NDJSON stream events, so this
// always reflects something real, never a fake "thinking" animation.
export type JarvisState = 'idle' | 'processing' | 'tool' | 'success' | 'error';

// Phase 6 groundwork: a normalized event layer between the raw backend
// NDJSON stream and anything that consumes it (the UI now, a future
// realtime voice layer later). Nothing currently subscribes to this as a
// stream of events — useAdminAI still derives state/activity/cards
// directly — but keeping the shape defined here means a future voice
// integration has one clear contract to target instead of needing to
// understand admin-ai-chat.js's raw event names.
export type GidUiEvent =
  | { type: 'ai.processing' }
  | { type: 'tool.started'; tool: string }
  | { type: 'tool.completed'; tool: string }
  | { type: 'tool.failed'; tool: string; error: string }
  | { type: 'data.updated'; tool: string; payload: any }
  | { type: 'ai.responding'; text: string }
  | { type: 'ai.complete' }
  | { type: 'ai.error'; message: string }
  | { type: 'ui.focus'; mode: 'seo'; target: string };

// Converts one raw NDJSON line from admin-ai-chat.js into the semantic
// event above. Pure function, no side effects — safe for anything to call.
export function normalizeStreamEvent(raw: any): GidUiEvent | null {
  switch (raw?.type) {
    case 'tool_call': return { type: 'tool.started', tool: raw.tool };
    case 'tool_result': return raw.ok
      ? { type: 'tool.completed', tool: raw.tool }
      : { type: 'tool.failed', tool: raw.tool, error: raw.error || 'unknown error' };
    case 'data': return { type: 'data.updated', tool: raw.tool, payload: raw.payload };
    case 'final': return { type: 'ai.complete' };
    case 'error': return { type: 'ai.error', message: raw.message || 'unknown error' };
    case 'ui_focus': return { type: 'ui.focus', mode: 'seo', target: raw.target };
    default: return null;
  }
}

export interface NeedsAttentionItem {
  type: 'lead_follow_up' | 'missed_call' | 'unpaid_invoice';
  label: string;
  detail: string;
  leadId?: string;
  callId?: string;
  bookingId?: string;
}

export interface UpcomingJob {
  id: string;
  date: string;
  time: string | null;
  customer: string;
  vehicle: string | null;
  service: string | null;
  job_status: string | null;
  amount: number | null;
}

export interface CommandCenterSummary {
  today: { date: string; jobCount: number; revenue: number; newLeads: number; missedCalls: number; nextOpenDay: string | null };
  needsAttention: NeedsAttentionItem[];
  upcomingJobs: UpcomingJob[];
  leadsSummary: { windowDays: number; total: number; contacted: number; booked: number; conversionRatePct: number };
  marketingFunnel: { channel: string; spend: number; calls: number; leads: number; bookings: number; revenue: number; costPerBooking: number | null; costPerLead: number | null }[];
  scheduleBar: { date: string; jobCount: number; revenue: number }[];
  // Redesign extras (functions/_lib/command-center-extras.js). Optional so an
  // older deployment's response still renders.
  trend?: { date: string; leads: number; booked: number; collected: number }[];
  activity?: FeedEvent[];
  todayRoute?: { start: { name: string; lat: number; lng: number }; stops: RouteStop[] };
  weather?: { today: WeatherDay | null; next: WeatherDay[] } | null;
  monthStats?: { current: MonthPeriod; previous: MonthPeriod };
  collectedTotals?: { d7: number; d30: number; d90: number };
}

export interface FeedEvent { type: 'lead' | 'booking' | 'payment' | 'missed_call' | 'customer'; at: string; title: string; detail: string | null; leadId?: string; jobId?: string; callId?: string; amount?: number }
export interface RouteStop { id: string; time: string | null; customer: string | null; vehicle: string | null; service: string | null; status: string | null; address: string | null; lat: number | null; lng: number | null; place: string | null; precision: 'community' | 'unknown' }
export interface WeatherDay { date: string; highF: number | null; lowF: number | null; summary: string | null }
export interface MonthPeriod { from: string; to: string; leads: number; booked: number; conversionPct: number | null; collected: number }

export interface Lead {
  id: string;
  created_at: string;
  fname?: string; lname?: string; phone?: string; email?: string;
  source: string; campaign?: string; vehicle?: string; requested_service?: string;
  quote_amount?: number; status: string; follow_up_at?: string | null; last_contacted_at?: string | null;
  notes?: string;
}

export const LEAD_STATUS_OPTIONS = ['new', 'contacted', 'quoted', 'booked', 'lost', 'no_response'] as const;
