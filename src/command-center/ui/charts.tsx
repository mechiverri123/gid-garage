// Lightweight SVG charts (no chart dependency). All size to their container,
// animate in once, and show exact values on hover/focus.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { C } from './theme';

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function Sparkline({ values, color = C.cyan, width = 110, height = 34, fill = true, bars = false }: { values: number[]; color?: string; width?: number; height?: number; fill?: boolean; bars?: boolean }) {
  const id = useId();
  if (!values.length || values.every(v => v === 0)) return <svg width={width} height={height} aria-hidden><line x1="0" x2={width} y1={height - 2} y2={height - 2} stroke={C.muted} strokeOpacity="0.35" strokeDasharray="3 4" /></svg>;
  if (bars) {
    const bmax = Math.max(...values); const bw = width / values.length;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(3, (v / bmax) * (height - 2)) : 2;
          return <rect key={i} x={i * bw + bw * 0.18} y={height - h} width={bw * 0.64} height={h} rx="1.5" fill={v > 0 ? color : C.muted} fillOpacity={v > 0 ? 0.85 : 0.25} className="cc-grow-y" style={{ animationDelay: `${i * 25}ms` }} />;
        })}
      </svg>
    );
  }
  const max = Math.max(...values); const min = Math.min(0, ...values);
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} className="cc-fade-up" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="cc-draw" />
    </svg>
  );
}

export interface Series { key: string; label: string; color: string; values: number[]; format?: (n: number) => string }

// Multi-series area/line chart with its own y-scale per series (so leads and
// dollars can share a chart), toggle chips, and a hover readout.
export function AreaChart({ labels, series, height = 240, formatLabel = (s: string) => s, toggles = true, empty }: {
  labels: string[]; series: Series[]; height?: number; formatLabel?: (s: string) => string; toggles?: boolean; empty?: ReactNode;
}) {
  const id = useId();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000; const H = height; const PAD = 8;
  const shown = series.filter(s => !hidden.has(s.key));
  const scales = useMemo(() => Object.fromEntries(series.map(s => [s.key, niceMax(Math.max(0, ...s.values))])), [series]);
  const n = labels.length;
  const x = (i: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2));
  const y = (v: number, key: string) => H - 4 - (v / scales[key]) * (H - 16);
  const hasData = series.some(s => s.values.some(v => v > 0));
  const ticks = n > 1 ? [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1] : [0];
  return (
    <div className="min-w-0">
      {toggles && (
        <div className="flex flex-wrap gap-2 mb-3">
          {series.map(s => {
            const on = !hidden.has(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={on} onClick={() => setHidden(h => { const nx = new Set(h); if (nx.has(s.key)) nx.delete(s.key); else if (nx.size < series.length - 1) nx.add(s.key); return nx; })}
                className="cc-btn inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium"
                style={{ border: `1px solid ${on ? `${s.color}66` : C.border}`, background: on ? `${s.color}14` : 'transparent', color: on ? C.text : C.muted }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? s.color : C.muted }} />{s.label}
              </button>
            );
          })}
        </div>
      )}
      {!hasData ? (empty ?? <div className="h-[160px] flex items-center justify-center text-[14px]" style={{ color: C.muted }}>No data in this period yet.</div>) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height: H }}
            onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const k = Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, k))); }}
            role="img" aria-label={`Chart of ${shown.map(s => s.label).join(', ')}`}>
            <defs>{series.map(s => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>
            ))}</defs>
            {[0.25, 0.5, 0.75, 1].map(g => <line key={g} x1="0" x2={W} y1={H - 4 - g * (H - 16)} y2={H - 4 - g * (H - 16)} stroke={C.border} strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />)}
            {shown.map((s, si) => {
              const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v, s.key).toFixed(1)}`).join(' ');
              return (
                <g key={s.key}>
                  {si === 0 && <path d={`${d} L${x(n - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${id}-${s.key})`} className="cc-fade-up" />}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pathLength={1} className="cc-draw" />
                </g>
              );
            })}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke={C.cyan} strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hover != null && (
            <div className="absolute top-1 pointer-events-none rounded-lg px-3 py-2 text-[13px] z-10" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 90px), calc(100% - 180px))`, width: 180, background: 'rgba(5,13,21,0.96)', border: `1px solid ${C.borderStrong}` }}>
              <div className="font-semibold mb-1" style={{ color: C.text }}>{formatLabel(labels[hover])}</div>
              {shown.map(s => (
                <div key={s.key} className="flex items-center justify-between gap-2" style={{ color: C.text2 }}>
                  <span className="inline-flex items-center gap-1.5 truncate"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="tabular-nums font-semibold" style={{ color: C.text }}>{(s.format ?? (v => v.toLocaleString('en-US')))(s.values[hover] ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="relative h-5 mt-1 text-[12px]" style={{ color: C.muted }}>
            {ticks.map((t, i) => <span key={i} className="absolute whitespace-nowrap" style={{ left: `${(x(t) / W) * 100}%`, transform: `translateX(${i === 0 ? '0' : i === ticks.length - 1 ? '-100%' : '-50%'})` }}>{formatLabel(labels[t])}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

export function BarChart({ labels, values, color = C.cyan, height = 200, format = (n: number) => n.toLocaleString('en-US'), formatLabel = (s: string) => s }: {
  labels: string[]; values: number[]; color?: string; height?: number; format?: (n: number) => string; formatLabel?: (s: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...values));
  if (!values.some(v => v > 0)) return <div className="flex items-center justify-center text-[14px]" style={{ height, color: C.muted }}>No money collected in this period.</div>;
  const n = values.length;
  const every = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="min-w-0">
      <div className="relative flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="flex-1 min-w-0 h-full flex items-end" onMouseEnter={() => setHover(i)}>
            <div className="w-full rounded-t-[3px] cc-grow-y" style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%`, background: hover === i ? color : `linear-gradient(180deg, ${color}, ${color}55)`, animationDelay: `${Math.min(i * 12, 400)}ms` }} />
          </div>
        ))}
        {hover != null && (
          <div className="absolute -top-2 pointer-events-none rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap z-10" style={{ left: `clamp(0px, calc(${((hover + 0.5) / n) * 100}% - 70px), calc(100% - 140px))`, background: 'rgba(5,13,21,0.96)', border: `1px solid ${C.borderStrong}`, color: C.text }}>
            <span style={{ color: C.text2 }}>{formatLabel(labels[hover])}: </span><b className="tabular-nums">{format(values[hover])}</b>
          </div>
        )}
      </div>
      <div className="flex gap-[3px] mt-1.5 text-[12px]" style={{ color: C.muted }}>
        {labels.map((l, i) => <span key={i} className="flex-1 min-w-0 text-center whitespace-nowrap overflow-visible">{i % every === 0 ? formatLabel(l) : ''}</span>)}
      </div>
    </div>
  );
}

export interface Segment { label: string; value: number; color: string }
export function Donut({ segments, size = 168, thickness = 22, center }: { segments: Segment[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2; const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={segments.map(s => `${s.label} ${s.value}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(52,214,255,0.08)" strokeWidth={thickness} />
        {total > 0 && segments.filter(s => s.value > 0).map(s => {
          const len = (s.value / total) * circ;
          const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-offset} className="cc-fade-up" />;
          offset += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

// Horizontal 100% stacked bar with a legend (e.g. searcher locality).
export function StackedBar({ segments, format = (n: number) => n.toLocaleString('en-US') }: { segments: Segment[]; format?: (n: number) => string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="text-[14px]" style={{ color: C.muted }}>No data yet.</div>;
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden" style={{ background: 'rgba(52,214,255,0.08)' }}>
        {segments.filter(s => s.value > 0).map(s => <div key={s.label} className="cc-fade-up" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${format(s.value)}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
        {segments.map(s => (
          <div key={s.label} className="flex items-center justify-between gap-2 min-w-0 text-[13.5px]">
            <span className="inline-flex items-center gap-2 min-w-0" style={{ color: C.text2 }}><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
            <span className="tabular-nums font-semibold shrink-0" style={{ color: C.text }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
