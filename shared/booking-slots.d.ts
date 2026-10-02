export const WEEKDAY_SLOTS: string[];
export const WEEKEND_SLOTS: string[];
export function dayOfWeek(ymd: string): number;
export function slotsForDate(ymd: string | null | undefined): string[];
export function slotHour(t: string): number | null;
export function isBookableSlot(ymd: string, time: string, ctx: { today: string; nowHour: number; taken?: string[]; blackout?: string[] }): boolean;
export function phoenixHour(now?: Date): number;
