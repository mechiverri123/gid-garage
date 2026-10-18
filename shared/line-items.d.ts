// Types for line-items.js (estimate / invoice line quantities).
interface Line { label: string; amount: number; type: string; qty?: number; rate?: number }
export function lineQty(i: Line): number;
export function lineRate(i: Line): number;
export function linePrice(i: Line): number;
export function withLine<T extends Line>(i: T, change: { qty?: number; rate?: number }): T;
export function lineText(i: Line): string;
export function jobLaborHours(items?: Line[] | null): number;
