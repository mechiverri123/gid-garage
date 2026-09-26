// ── Design tokens ─────────────────────────────────────────────────────────
// Phase 1: structure + tokens only. No Motion/Three.js dependency yet —
// everything here is plain CSS via Tailwind arbitrary values + a couple of
// inline-style gradients Tailwind can't express cleanly. Later phases can
// layer animation libraries on top of this without touching the palette.

export const COLORS = {
  bg0: '#06090D',
  bg1: '#090D12',
  bg2: '#0D1218',
  panel: 'rgba(15, 22, 29, 0.72)',
  panelAlt: 'rgba(20, 28, 36, 0.55)',
  accent: '#32D9FF',
  accentDim: '#12A8D8',
  success: '#42D392',
  warning: '#F5B942',
  critical: '#FF5353',
  text: '#F5F8FA',
  textMuted: '#8899A6',
  textFaint: '#52616D',
  border: 'rgba(80, 210, 255, 0.12)',
} as const;

// A "technical glass" panel — the base surface for every card in the new
// layout. Tailwind arbitrary values so no tailwind.config.js changes are
// needed for Phase 1.
export const PANEL =
  'bg-[#0f1620]/80 backdrop-blur-xl border border-[rgba(80,210,255,0.12)] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_12px_40px_rgba(0,0,0,0.25)] transition-all duration-300 hover:border-[rgba(50,217,255,0.4)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.25),0_0_24px_rgba(50,217,255,0.12)] hover:-translate-y-0.5';

export const PANEL_PADDING = 'p-4 sm:p-5';

export const LABEL = 'text-[10px] font-semibold uppercase tracking-widest text-[#52616D]';
export const METRIC_VALUE = 'text-[28px] sm:text-[32px] font-bold text-[#F5F8FA] leading-none tracking-tight';
export const METRIC_CAPTION = 'text-[11px] text-[#8899A6] mt-1';

export const SEVERITY_COLOR: Record<'info' | 'warning' | 'critical', string> = {
  info: COLORS.accent,
  warning: COLORS.warning,
  critical: COLORS.critical,
};

// Present-tense labels for tool activity — same mapping as before, just
// relocated into the shared design layer so every component can use it.
export const TOOL_LABELS: Record<string, string> = {
  get_business_summary: "Pulling today's business summary",
  list_leads: 'Looking up leads',
  update_lead_status: 'Updating lead status',
  list_jobs: 'Searching jobs',
  reschedule_job: 'Rescheduling job',
  pricing_history: 'Checking pricing history',
  get_tax_rate: 'Checking tax rate',
  add_marketing_spend: 'Logging marketing spend',
  log_call: 'Logging call',
  list_calls: 'Looking up calls',
  list_marketing_spend: 'Checking marketing spend',
  search_customers: 'Searching customers',
  update_job_status: 'Updating job status',
  mark_job_paid: 'Recording payment',
  get_owner_pay_summary: 'Calculating take-home pay',
  send_customer_email: 'Sending email',
};
export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] || tool.replace(/_/g, ' ');
}
