// Types for mileage.js (IRS rates, automatic job mileage).
export const MILEAGE_RATE_BRACKETS: { from: string; cents: number }[];
export function ratesForDate(dateStr: string): number;
export const AUTO_MILEAGE_SINCE: string;
