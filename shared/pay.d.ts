export const PAY_KINDS: { hours: string; job: string; bonus: string };
export const PAYOUT_METHODS: string[];
export const NEC_THRESHOLD: number;
export const ROLES: { owner: string; contractor: string; employee: string };
export function isOwnerDraw(p: { owner_draw?: boolean } | null | undefined): boolean;
export function weekStart(ymd: string): string;
export function weeklySummary(
  personId: string,
  entries: { person_id: string; work_date: string; hours: number | null; amount: number | string }[],
  payouts: { person_id: string; paid_on: string; amount: number | string }[],
  today: string,
  count?: number,
): { start: string; end: string; hours: number; earned: number; paid: number }[];
export function cents(n: unknown): number;
export function entryAmount(e: { kind?: string; hours?: unknown; rate?: unknown; amount?: unknown }): number;
export function cleanEntry(f: Record<string, unknown>): Record<string, unknown>;
export function cleanPayout(f: Record<string, unknown>): Record<string, unknown>;
export function balances<P extends { id: string }>(
  people: P[],
  entries: { person_id: string; amount: number | string }[],
  payouts: { person_id: string; amount: number | string; paid_on: string }[],
  year?: string | number | null,
): { person: P; earned: number; paid: number; owed: number; paidYear: number; entries: number; needs1099: boolean }[];
