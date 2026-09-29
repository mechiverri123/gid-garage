// Types for the parts of business-rules.js the dashboard (TypeScript) imports.
import type { MetricJob } from './business-metrics.js';

export interface RuleJob extends MetricJob {
  id?: string | null;
  date?: string | null;
  estimateAmount?: number | null;
}

export function isCancelled(job: RuleJob): boolean;
export function isAwaitingPayment(job: RuleJob): boolean;
export function jobTotalDue(job: RuleJob): number;
export function jobBalance(job: RuleJob): number;
export function phoenixToday(now?: Date): string;

export interface JobMoney {
  estimateSubtotal: number | null; estimateTax: number | null; estimateTotal: number | null;
  invoiceSubtotal: number | null; invoiceTax: number | null; invoiceTotal: number | null;
  amountPaid: number | null; balanceDue: number | null;
}
export function jobMoney(job: RuleJob): JobMoney;
export function statusChangeFields(currentJobStatus: string | null | undefined, next: string): { job_status: string; status?: string };
