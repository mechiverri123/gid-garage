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

export interface NeedsAttentionItem {
  type: 'lead_follow_up' | 'missed_call' | 'unpaid_invoice';
  label: string;
  detail: string;
  leadId?: string;
  callId?: string;
  bookingId?: string;
}

export interface CommandCenterSummary {
  today: { date: string; jobCount: number; revenue: number; newLeads: number; missedCalls: number; nextOpenDay: string | null };
  needsAttention: NeedsAttentionItem[];
  leadsSummary: { windowDays: number; total: number; contacted: number; booked: number; conversionRatePct: number };
  marketingFunnel: { channel: string; spend: number; calls: number; leads: number; bookings: number; revenue: number; costPerBooking: number | null; costPerLead: number | null }[];
  scheduleBar: { date: string; jobCount: number; revenue: number }[];
}

export interface Lead {
  id: string;
  created_at: string;
  fname?: string; lname?: string; phone?: string; email?: string;
  source: string; campaign?: string; vehicle?: string; requested_service?: string;
  quote_amount?: number; status: string; follow_up_at?: string | null; last_contacted_at?: string | null;
  notes?: string;
}

export const LEAD_STATUS_OPTIONS = ['new', 'contacted', 'quoted', 'booked', 'lost', 'no_response'] as const;
