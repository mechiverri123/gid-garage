// GID Garage Command Center design tokens (shared by the ops dashboard and
// SEO mode). Cyan is the interface color; green is reserved for positive
// performance, amber for warnings, red for real problems, purple for analytics.

export const C = {
  bg: '#030A11',
  bg2: '#050D15',
  surface1: '#08131E',
  surface2: '#0A1722',
  surface3: '#0D1D29',
  border: 'rgba(54, 211, 255, 0.18)',
  borderStrong: 'rgba(54, 211, 255, 0.42)',
  cyan: '#34D6FF',
  cyan2: '#00AEEF',
  green: '#20E58B',
  amber: '#FFB84D',
  red: '#FF4D5F',
  purple: '#9A65FF',
  text: '#F5F8FA',
  text2: '#A7B5C2',
  muted: '#657686',
} as const;

export type Tone = 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'muted';
export const TONE: Record<Tone, string> = { cyan: C.cyan, green: C.green, amber: C.amber, red: C.red, purple: C.purple, muted: C.muted };

export const money = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const num = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${Number(n).toFixed(digits)}%`);

// 'YYYY-MM-DD' → 'Tue, Sep 29' without timezone drift.
export function shortDay(ymd: string | null | undefined) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
// '14:00' / '2:00 PM' → '2:00 PM'
export function clock(t: string | null | undefined) {
  if (!t) return 'TBD';
  if (/[ap]m/i.test(t)) return t.toUpperCase().replace(/\s+/g, ' ');
  const [h, m = '00'] = t.split(':');
  const hh = Number(h);
  if (!Number.isFinite(hh)) return t;
  return `${((hh + 11) % 12) + 1}:${m.slice(0, 2)} ${hh < 12 ? 'AM' : 'PM'}`;
}
