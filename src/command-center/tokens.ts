export const COLORS = {
  bg0: '#030812',
  bg1: '#07111f',
  bg2: '#0b1828',
  panel: 'rgba(7, 18, 31, 0.9)',
  panelAlt: 'rgba(10, 22, 38, 0.76)',
  accent: '#54e7ff',
  accentDim: '#1fb8e8',
  success: '#42D392',
  warning: '#F5B942',
  critical: '#FF5353',
  text: '#F5F8FA',
  textMuted: '#9EB2C4',
  textFaint: '#5E7183',
  border: 'rgba(84,231,255,0.2)',
  borderStrong: 'rgba(84,231,255,0.42)',
} as const;

export const PANEL =
  'relative overflow-hidden bg-[#08121e]/90 backdrop-blur-xl border border-[rgba(84,231,255,0.16)] rounded-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_50px_rgba(0,0,0,0.3)]';

export const PANEL_PADDING = 'p-4 sm:p-5';

export const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5E7183]';
export const METRIC_VALUE = 'text-[30px] sm:text-[34px] font-bold text-[#F5F8FA] leading-none tracking-tight';
export const METRIC_CAPTION = 'text-[11px] text-[#9EB2C4] mt-1';

export const SEVERITY_COLOR: Record<'info' | 'warning' | 'critical', string> = {
  info: COLORS.accent,
  warning: COLORS.warning,
  critical: COLORS.critical,
};

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
