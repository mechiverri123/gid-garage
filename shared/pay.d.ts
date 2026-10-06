export const PAY_KINDS: { hours: string; job: string; bonus: string };
export const PAYOUT_METHODS: string[];
export const NEC_THRESHOLD: number;
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
