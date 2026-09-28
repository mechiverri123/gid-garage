// Shapes returned by functions/jarvis/seo-data.js (/jarvis/seo-data) (see functions/_lib/seo/ops.js).
// Kept loose where the backend passes evidence through untouched.

export type SeoView = 'overview' | 'map' | 'opportunities' | 'demand' | 'competitors' | 'seasonality' | 'authority' | 'connections';

export const SEO_VIEWS: { id: SeoView; label: string }[] = [
  { id: 'overview', label: 'Local overview' },
  { id: 'map', label: 'Service area' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'demand', label: 'Local demand' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'seasonality', label: 'Seasonality' },
  { id: 'authority', label: 'Authority & listings' },
  { id: 'connections', label: 'Connections' },
];

export interface Kpi { key: string; label: string; value: number | null; prev: number | null; changePct: number | null; note?: string }
export type Locality = 'confirmed_local' | 'likely_local' | 'unknown' | 'nonlocal';

export interface SeoOverview {
  serviceArea: { center: string; radiusMiles: number };
  primary: Kpi[];
  secondary: Kpi[];
  tertiary: Kpi[];
  localityBreakdown: { clicks: Record<Locality, number>; impressions: Record<Locality, number> };
  funnel: { leads: number; bookings: number; outsideServiceArea: number; confirmedLocalLeads: number; collectedOnThoseJobs: number; attributionLevel: string };
  anonymizedImpressionShare: number | null;
  dataSources: { connected: string[]; notConnected: { id: string; status: string }[] };
  hasSearchData: boolean;
  website: { sessionsByLocality: Record<string, number>; localKeyEvents: number; aiAssistantSessions: Record<string, number> } | null;
  instagram: { followers: number | null; localFollowerSharePct: number | null; note: string } | null;
  series?: { date: string; impressions: number; clicks: number; leads: number; bookings: number }[];
  period: { from: string; to: string; days: number; note: string; comparedTo?: { from: string; to: string } };
}

export interface QueryRow { query: string; locality: Locality; intent: string; impressions: number; clicks: number; ctrPct: number; position: number | null; previousPosition: number | null; movement: number | null }
export interface SeoQueries { period: { from: string; to: string }; comparedTo: { from: string; to: string }; rows: QueryRow[]; note: string }
export interface TechIssue { code: string; severity: string; title: string; detail?: string; url: string }
export interface SeoTechnical {
  measuredAt: string | null; pagesAudited: number;
  pagespeed: { url: string; strategy: string; perfScore: number | null; seoScore: number | null; lcpMs: number | null; cls: number | null; inpMs: number | null; fieldData: boolean; fetchedAt: string }[];
  checks: { key: string; label: string; measured: boolean; issues: TechIssue[] }[];
}
export interface SeoConnections { providers: ProviderStatus[]; recentRuns: unknown[]; lastRun: { status: string; detail: string | null; error: string | null; at: string } | null }

export interface SeoRecommendation {
  id: string; type: string; title: string; detail: string | null; score: number; confidence: string | null;
  status: string; service: string | null; requires_decision: boolean; informational: boolean;
  evidence: Record<string, unknown> | null; outcome: { result: string; baseline: number | null; current: number | null } | null;
  monitor_until: string | null; applied_at?: string | null; metric?: { kind: string } | null;
}

export interface GeoArea { slug: string; name: string; lat: number; lng: number; count: number; zone: string | null }
export interface GeoAggregate { areas: GeoArea[]; otherInArea: number; outsideServiceArea: number; unknownLocation: number; total: number }
export interface SeoGeography extends GeoAggregate { leads?: GeoAggregate; competitors?: { name: string; lat: number; lng: number; tier: string | null }[]; center: { lat: number; lng: number }; radiusMiles: number; privacy: string }

export interface ProviderStatus { id: string; label: string; category: string; status: string; missing: string[]; note: string; lastSyncAt: string | null; lastError: string | null; backfilledFrom: string | null }

export interface UiFocusEvent { type: 'ui_focus'; mode: 'seo'; target: SeoView; tool?: string }
