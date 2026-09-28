// Local seasonality: measure — never assume — whether NAU calendar periods,
// cold snaps, holidays etc. move GID's demand. Tests: tests/seo-seasonality.test.js
//
// A finding is only stated when the data supports it (enough baseline weeks,
// enough volume, a clear ratio). Otherwise the verdict says so.

// Typical NAU calendar PATTERNS, not official dates. approximate: true until the
// owner enters the real dates (seo_calendar_events) — the engine prefers real
// entries and labels anything approximate as approximate.
export const DEFAULT_EVENT_TEMPLATES = [
  { kind: 'nau_fall_move_in', label: 'NAU fall move-in / semester start', month: 8, startDay: 15, days: 14 },
  { kind: 'nau_thanksgiving_break', label: 'Thanksgiving break travel', month: 11, startDay: 22, days: 7 },
  { kind: 'nau_winter_break', label: 'NAU winter break (population drops)', month: 12, startDay: 14, days: 28 },
  { kind: 'nau_spring_start', label: 'NAU spring semester start', month: 1, startDay: 10, days: 10 },
  { kind: 'nau_spring_break', label: 'NAU spring break', month: 3, startDay: 7, days: 10 },
  { kind: 'nau_move_out', label: 'NAU finals / move-out / graduation', month: 5, startDay: 1, days: 14 },
];

export function eventsForYear(year, templates = DEFAULT_EVENT_TEMPLATES) {
  return templates.map(t => {
    const start = new Date(Date.UTC(year, t.month - 1, t.startDay));
    const end = new Date(start.getTime() + (t.days - 1) * 86400000);
    return { kind: t.kind, label: t.label, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), approximate: true, source: 'typical NAU pattern — replace with official dates' };
  });
}

const DAY = 86400000;
const weekStart = ymd => {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
};

// [{date, value}] -> Map(weekStart -> sum)
export function weeklySeries(points) {
  const m = new Map();
  for (const p of points) {
    if (!p.date) continue;
    const w = weekStart(String(p.date).slice(0, 10));
    m.set(w, (m.get(w) || 0) + Number(p.value || 0));
  }
  return m;
}

// Compare the weeks inside a window with the `baselineWeeks` before and after.
export function windowUplift(series, window, { baselineWeeks = 4, minBaselineWeeks = 3, minTotal = 10, upliftRatio = 1.25, minDelta = 3 } = {}) {
  const ws = weekStart(window.start);
  const we = weekStart(window.end);
  const weeks = [...series.keys()].sort();
  const inside = weeks.filter(w => w >= ws && w <= we);
  const before = weeks.filter(w => w < ws).slice(-baselineWeeks);
  const after = weeks.filter(w => w > we).slice(0, baselineWeeks);
  const base = [...before, ...after];
  const avg = ks => (ks.length ? ks.reduce((s, k) => s + series.get(k), 0) / ks.length : 0);
  const windowAvg = avg(inside);
  const baselineAvg = avg(base);
  const total = [...inside, ...base].reduce((s, k) => s + series.get(k), 0);
  const out = { windowWeeks: inside.length, baselineWeeks: base.length, windowAvg: round1(windowAvg), baselineAvg: round1(baselineAvg), ratio: baselineAvg > 0 ? round2(windowAvg / baselineAvg) : null };
  if (!inside.length || base.length < minBaselineWeeks || total < minTotal) return { ...out, verdict: 'insufficient_data' };
  if (baselineAvg > 0 && windowAvg / baselineAvg >= upliftRatio && windowAvg - baselineAvg >= minDelta) return { ...out, verdict: 'uplift' };
  if (baselineAvg > 0 && windowAvg / baselineAvg <= 1 / upliftRatio && baselineAvg - windowAvg >= minDelta) return { ...out, verdict: 'drop' };
  return { ...out, verdict: 'no_clear_change' };
}

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

// Evaluate events against named series ({ 'searches:battery': [...points], 'leads': [...] }).
export function seasonalFindings(seriesByName, events, opts) {
  const findings = [];
  for (const ev of events) {
    for (const [name, points] of Object.entries(seriesByName)) {
      const r = windowUplift(weeklySeries(points), ev, opts);
      findings.push({ event: ev.kind, label: ev.label, approximateDates: !!ev.approximate, window: { start: ev.start, end: ev.end }, series: name, ...r, statement: statement(ev, name, r) });
    }
  }
  return findings;
}

function statement(ev, name, r) {
  const what = name.replace(/:/g, ' ');
  const dates = ev.approximate ? ' (approximate dates)' : '';
  if (r.verdict === 'insufficient_data') return `Not enough data yet to tell whether ${ev.label}${dates} affects ${what}.`;
  if (r.verdict === 'uplift') return `${what} ran ${r.ratio}× the surrounding weeks during ${ev.label}${dates}.`;
  if (r.verdict === 'drop') return `${what} fell to ${r.ratio}× the surrounding weeks during ${ev.label}${dates}.`;
  return `No clear change in ${what} during ${ev.label}${dates}.`;
}

// First sustained cold period in daily weather: ≥ `days` consecutive days with
// a low at or below `thresholdF`, on or after `from` (MM-DD, default Sep 1).
export function firstColdSnap(daily, { thresholdF = 20, days = 3, from = '09-01' } = {}) {
  const sorted = [...daily].filter(d => d.date && Number.isFinite(d.tminF)).sort((a, b) => a.date.localeCompare(b.date));
  let run = [];
  for (const d of sorted) {
    if (d.date.slice(5) < from && d.date.slice(5) >= '06-01') { run = []; continue; }
    if (d.tminF <= thresholdF) {
      run.push(d);
      if (run.length >= days) return { start: run[0].date, end: run[run.length - 1].date, lowestF: Math.min(...run.map(x => x.tminF)) };
    } else run = [];
  }
  return null;
}

// Upcoming cold snap from a forecast (for proactive "get ahead of it" notes).
export function forecastColdSnap(periods, opts = {}) {
  return firstColdSnap(periods.map(p => ({ date: p.date, tminF: p.tminF })), { ...opts, from: '01-01' });
}
