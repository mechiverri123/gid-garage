// ── Design tokens ─────────────────────────────────────────────────────────
// Phase 1: structure + tokens only. No Motion/Three.js dependency yet —
// everything here is plain CSS via Tailwind arbitrary values + a couple of
// inline-style gradients Tailwind can't express cleanly. Later phases can
// layer animation libraries on top of this without touching the palette.

export const COLORS = {
  bg0: '#050B14',
  bg1: '#081020',
  bg2: '#0B1628',
  panel: 'rgba(10, 20, 36, 0.75)',
  panelAlt: 'rgba(14, 26, 44, 0.6)',
  accent: '#4FE8FF',
  accentDim: '#1FB8E8',
  success: '#42D392',
  warning: '#F5B942',
  critical: '#FF5353',
  text: '#F5F8FA',
  textMuted: '#8899A6',
  textFaint: '#52616D',
  border: 'rgba(79, 232, 255, 0.22)',
} as const;

// A "technical glass" panel — the base surface for every card in the new
// layout. Tailwind arbitrary values so no tailwind.config.js changes are
// needed for Phase 1.
export const PANEL =
  'relative bg-[#0b1420]/85 backdrop-blur-xl border border-[rgba(79,232,255,0.18)] border-t-[rgba(79,232,255,0.45)] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-[rgba(79,232,255,0.5)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_rgba(0,0,0,0.3),0_0_32px_rgba(79,232,255,0.18)] hover:-translate-y-0.5 before:content-[\'\'] before:absolute before:top-0 before:left-0 before:w-3 before:h-3 before:border-t-2 before:border-l-2 before:border-[#4FE8FF]/70 before:rounded-tl-lg after:content-[\'\'] after:absolute after:bottom-0 after:right-0 after:w-3 after:h-3 after:border-b-2 after:border-r-2 after:border-[#4FE8FF]/30 after:rounded-br-lg';

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
