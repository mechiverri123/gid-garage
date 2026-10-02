export type NvStatus = 'good' | 'soon' | 'now';
export interface NvMedia { id: string; key: string; url: string; kind: 'photo' | 'video'; takenAt: string }
export interface NvTemplateItem { id: string; category: string; label: string; service: string }
export interface NvItem extends NvTemplateItem { status: NvStatus | null; note: string; laborHours: number | null; media: NvMedia[] }
export interface NvResponse { at: string; approved: string[]; declined: string[]; jobId: string | null; date: string | null; time: string | null }
export interface NextVisit { items: NvItem[]; updatedAt?: string; response?: NvResponse }
export const NV_STATUS: Record<NvStatus, string>;
export const DEFAULT_CHECKLIST: NvTemplateItem[];
export function cleanTemplate(list: unknown): NvTemplateItem[];
export function withTemplate(nextVisit: Partial<NextVisit> | null | undefined, template: NvTemplateItem[]): NextVisit;
export function recommendations(nv: Partial<NextVisit> | null | undefined): NvItem[];
export function hasCheck(nv: Partial<NextVisit> | null | undefined): boolean;
export function declinedSentence(labels: string[]): string;
export function checkResponse(nv: unknown, approvedIds?: string[], declinedIds?: string[]): { approved: NvItem[]; declined: NvItem[] };
export function inspectionUrl(site: string, jobId: string): string;
export function nextVisitJobRow(args: Record<string, unknown>): Record<string, unknown>;
