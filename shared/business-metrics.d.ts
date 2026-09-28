// Types for business-metrics.js so the dashboard (TypeScript) can import it.

export const BUSINESS_TZ: string;

export interface MetricPayment { amount: number; at: string; method?: string }

export interface MetricJob {
  jobStatus?: string | null;
  status?: string | null;
  paidAt?: string | null;
  amountPaid?: number | null;
  invoiceAmount?: number | null;
  taxAmount?: number | null;
  partsCost?: number | null;
  payments?: MetricPayment[] | string | null;
}

export interface PeriodWindow {
  key: string;
  label: string;
  days: number;
  inWindow: (iso: string | null | undefined) => boolean;
}

export interface OwnerPaySettings { taxReservePct: number; stripeFeePct: number; monthlyOverhead: number }

export function phoenixDateParts(date: Date): { year: number; month: number; day: number };
export function parsePayments(value: unknown): MetricPayment[];
export function jobFromRow(row: Record<string, unknown>): MetricJob;
export function resolvePeriodWindow(period: string, now?: Date): PeriodWindow;
export function collectedRevenue(jobs: MetricJob[], inWindow: PeriodWindow['inWindow']): { total: number; jobCount: number };
export function netProfit(jobs: MetricJob[], inWindow: PeriodWindow['inWindow']): number;
export function cardRevenue(jobs: MetricJob[], inWindow: PeriodWindow['inWindow']): number;
export function ownerPaySettings(row?: Record<string, unknown>): OwnerPaySettings;
export function ownerTakeHome(
  jobs: MetricJob[],
  window: Pick<PeriodWindow, 'inWindow' | 'days'>,
  settings: OwnerPaySettings,
): {
  jobMargin: number; stripeFees: number; overhead: number; businessNet: number;
  inDeficit: boolean; taxReserve: number; takeHome: number;
};
