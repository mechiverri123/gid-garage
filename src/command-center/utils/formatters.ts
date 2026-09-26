export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function fmtSource(s: string): string {
  return (s || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function fmtDate(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return s; }
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
