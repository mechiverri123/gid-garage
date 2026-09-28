// Command Center building blocks. Every piece fits its container (no
// horizontal scrolling), text never drops below 11px, and interactive pieces
// have hover + keyboard focus states.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Car , type LucideIcon } from 'lucide-react';
import { C, TONE, type Tone } from './theme';

// ---- surfaces ----------------------------------------------------------------------

export function CommandCard({ children, className = '', variant = 'default', scan = false, onClick, id, title, as: Tag = 'section' }: {
  children: ReactNode; className?: string; variant?: 'default' | 'primary'; scan?: boolean; onClick?: () => void; id?: string; title?: string; as?: 'section' | 'div' | 'article';
}) {
  const cls = `cc-card ${variant === 'primary' ? 'cc-card--primary' : ''} ${onClick ? 'cc-card--interactive' : ''} ${scan ? 'cc-scan' : ''} ${className}`;
  return onClick
    ? <Tag id={id} className={cls} onClick={onClick} role="button" tabIndex={0} title={title} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>{children}</Tag>
    : <Tag id={id} className={cls} title={title}>{children}</Tag>;
}

export function SectionHeader({ icon: Icon, title, subtitle, right, tone = 'cyan' }: { icon?: LucideIcon; title: string; subtitle?: ReactNode; right?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${TONE[tone]}14`, border: `1px solid ${TONE[tone]}33` }}>
            <Icon size={18} color={TONE[tone]} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-tight truncate" style={{ color: C.text }}>{title}</h2>
          {subtitle && <div className="text-[13px] mt-0.5 truncate" style={{ color: C.text2 }}>{subtitle}</div>}
        </div>
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

// ---- numbers ----------------------------------------------------------------------

// Counts up once when the value first arrives (and on real changes).
export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const start = performance.now(); const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-US') }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format(v)}</>;
}

export function TrendIndicator({ changePct, betterIs = 'higher', label, size = 13 }: { changePct: number | null | undefined; betterIs?: 'higher' | 'lower'; label?: string; size?: number }) {
  if (changePct == null || !Number.isFinite(changePct)) return <span className="text-[12px]" style={{ color: C.muted }}>{label ?? 'no prior data'}</span>;
  const flat = Math.abs(changePct) < 0.5;
  const good = flat ? null : (changePct > 0) === (betterIs === 'higher');
  const color = flat ? C.text2 : good ? C.green : Math.abs(changePct) >= 10 ? C.red : C.amber;
  const Icon = flat ? Minus : changePct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 font-medium" style={{ color, fontSize: size }}>
      <Icon size={size + 2} aria-hidden />{flat ? '0%' : `${changePct > 0 ? '+' : ''}${changePct.toFixed(Math.abs(changePct) < 10 ? 1 : 0)}%`}
      {label && <span className="font-normal" style={{ color: C.muted }}>{label}</span>}
    </span>
  );
}

export function MetricCard({ icon: Icon, label, value, display, caption, tone = 'cyan', trend, accent, loading, onClick }: {
  icon: LucideIcon; label: string; value?: number | null; display?: ReactNode; caption?: ReactNode; tone?: Tone; trend?: ReactNode; accent?: ReactNode; loading?: boolean; onClick?: () => void;
}) {
  const color = TONE[tone];
  return (
    <CommandCard onClick={onClick} className="p-4 sm:p-5 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium leading-tight line-clamp-2" style={{ color: C.text2 }}>{label}</span>
        <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}14`, border: `1px solid ${color}30` }}><Icon size={18} color={color} /></span>
      </div>
      {loading
        ? <Skeleton className="h-9 w-24" />
        : <div className="text-[30px] sm:text-[34px] font-bold leading-none tracking-tight tabular-nums truncate" style={{ color: C.text }}>
            {display ?? (value == null ? '—' : <CountUp value={value} />)}
          </div>}
      <div className="flex items-end justify-between gap-2 min-h-[22px]">
        <div className="text-[13px] leading-snug min-w-0" style={{ color: C.text2 }}>{caption}{trend && <div className="mt-0.5">{trend}</div>}</div>
        {accent && <div className="shrink-0">{accent}</div>}
      </div>
      <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${color}90, transparent)` }} aria-hidden />
    </CommandCard>
  );
}

// ---- labels & buttons ----------------------------------------------------------------

const STATUS_TONE: Record<string, Tone> = {
  PAID: 'green', COMPLETED: 'green', completed: 'green', booked: 'green', connected: 'green', ok: 'green',
  INVOICED: 'amber', ESTIMATE_SENT: 'amber', quoted: 'amber', needs_authorization: 'amber', pending_approval: 'amber', ready_limited: 'amber', accepted: 'amber', applied: 'purple', measured: 'green',
  IN_PROGRESS: 'cyan', BOOKED: 'cyan', SIGNED: 'cyan', contacted: 'cyan', new: 'cyan', open: 'cyan',
  CANCELLED: 'red', cancelled: 'red', lost: 'red', error: 'red', no_response: 'muted', not_configured: 'muted', manual_only: 'muted',
};
export function statusTone(status?: string | null): Tone { return (status && STATUS_TONE[status]) || 'muted'; }
export const statusLabel = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : 'Unknown');

export function StatusBadge({ status, tone, children, dot = false }: { status?: string | null; tone?: Tone; children?: ReactNode; dot?: boolean }) {
  const color = TONE[tone ?? statusTone(status)];
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap" style={{ color, background: `${color}17`, border: `1px solid ${color}40` }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
      <span className="truncate">{children ?? statusLabel(status)}</span>
    </span>
  );
}

export function ActionButton({ children, onClick, href, icon: Icon, variant = 'secondary', disabled, title, type = 'button', size = 'md' }: {
  children: ReactNode; onClick?: () => void; href?: string; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; title?: string; type?: 'button' | 'submit'; size?: 'sm' | 'md';
}) {
  const styles = {
    primary: { background: C.cyan, color: C.bg, border: `1px solid ${C.cyan}` },
    secondary: { background: 'rgba(52,214,255,0.08)', color: C.text, border: `1px solid ${C.borderStrong}` },
    ghost: { background: 'transparent', color: C.text2, border: '1px solid transparent' },
    danger: { background: 'rgba(255,77,95,0.1)', color: C.red, border: '1px solid rgba(255,77,95,0.4)' },
  }[variant];
  const cls = `cc-btn inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${size === 'sm' ? 'text-[13px] px-3 py-1.5' : 'text-[14px] px-4 py-2'}`;
  const inner = <>{Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}{children}</>;
  return href
    ? <a href={href} className={cls} style={styles} title={title}>{inner}</a>
    : <button type={type} onClick={onClick} disabled={disabled} className={cls} style={styles} title={title}>{inner}</button>;
}

// Big command tile (quick commands / hero actions).
export function CommandButton({ icon: Icon, label, hint, onClick, href, tone = 'cyan' }: { icon: LucideIcon; label: string; hint?: string; onClick?: () => void; href?: string; tone?: Tone }) {
  const color = TONE[tone];
  const body = (
    <>
      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}16`, border: `1px solid ${color}38` }}><Icon size={19} color={color} /></span>
      <span className="min-w-0 text-left">
        <span className="block text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: C.text }}>{label}</span>
        {hint && <span className="block text-[12.5px] leading-snug line-clamp-2" style={{ color: C.text2 }}>{hint}</span>}
      </span>
    </>
  );
  const cls = 'cc-card cc-card--interactive flex items-center gap-3 p-3.5 w-full min-w-0';
  return href ? <a href={href} className={cls}>{body}</a> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export function VehicleBadge({ vehicle }: { vehicle?: string | null }) {
  if (!vehicle) return <span className="text-[13px]" style={{ color: C.muted }}>No vehicle on file</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 text-[13px]" style={{ color: C.text2 }}>
      <Car size={14} className="shrink-0" color={C.cyan} aria-hidden /><span className="truncate">{vehicle}</span>
    </span>
  );
}

// ---- states --------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`cc-skeleton ${className}`} aria-hidden />; }

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4">
      {Icon && <span className="w-11 h-11 rounded-full flex items-center justify-center mb-1" style={{ background: 'rgba(52,214,255,0.07)', border: `1px dashed ${C.borderStrong}` }}><Icon size={20} color={C.cyan} /></span>}
      <div className="text-[15px] font-semibold" style={{ color: C.text }}>{title}</div>
      {children && <div className="text-[13.5px] max-w-sm leading-relaxed" style={{ color: C.text2 }}>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg px-4 py-3 text-[14px] flex items-center justify-between gap-3" style={{ background: 'rgba(255,77,95,0.08)', border: '1px solid rgba(255,77,95,0.35)', color: C.red }}>
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && <ActionButton size="sm" variant="danger" onClick={onRetry}>Retry</ActionButton>}
    </div>
  );
}

// ---- rows -----------------------------------------------------------------------------

export function TimelineItem({ time, title, children, tone = 'cyan', last = false, onClick, right }: { time: string; title: ReactNode; children?: ReactNode; tone?: Tone; last?: boolean; onClick?: () => void; right?: ReactNode }) {
  const color = TONE[tone];
  return (
    <div className="flex gap-3 min-w-0">
      <div className="w-[68px] shrink-0 text-right pt-2.5 text-[13px] font-semibold tabular-nums" style={{ color: C.text2 }}>{time}</div>
      <div className="relative flex flex-col items-center shrink-0">
        <span className="mt-3 w-3 h-3 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {!last && <span className="flex-1 w-px mt-1" style={{ background: `linear-gradient(${color}80, ${C.border})` }} />}
      </div>
      <button type="button" onClick={onClick} disabled={!onClick} className={`flex-1 min-w-0 text-left rounded-lg p-2.5 mb-2 ${onClick ? 'cc-card--interactive' : ''}`} style={{ background: 'rgba(52,214,255,0.035)', border: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[15px] font-semibold truncate" style={{ color: C.text }}>{title}</div>
          {right}
        </div>
        {children}
      </button>
    </div>
  );
}

export function ActivityItem({ icon: Icon, tone = 'cyan', title, detail, time }: { icon: LucideIcon; tone?: Tone; title: string; detail?: string | null; time: string }) {
  const color = TONE[tone];
  return (
    <div className="flex items-start gap-3 py-2.5 min-w-0">
      <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}14`, border: `1px solid ${color}30` }}><Icon size={15} color={color} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium truncate" style={{ color: C.text }}>{title}</div>
        {detail && <div className="text-[12.5px] truncate" style={{ color: C.text2 }}>{detail}</div>}
      </div>
      <span className="shrink-0 text-[12px] pt-0.5 tabular-nums" style={{ color: C.muted }}>{time}</span>
    </div>
  );
}

// Fits its container: fixed layout, ellipsis, and low-priority columns hide
// on narrow screens (hideBelow) instead of scrolling sideways.
export interface Column<T> { key: string; header: string; width?: string; align?: 'left' | 'right' | 'center'; hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; render: (row: T) => ReactNode }
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' };
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      <colgroup>{columns.map(c => <col key={c.key} className={c.hideBelow ? HIDE[c.hideBelow] : ''} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
      <thead>
        <tr>{columns.map(c => (
          <th key={c.key} scope="col" className={`text-[12.5px] font-semibold pb-2 px-2 first:pl-0 last:pr-0 border-b ${c.hideBelow ? HIDE[c.hideBelow] : ''}`} style={{ color: C.muted, borderColor: C.border, textAlign: c.align ?? 'left' }}>{c.header}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(r); } : undefined}
            className={onRowClick ? 'cursor-pointer transition-colors hover:bg-[rgba(52,214,255,0.05)] focus-visible:bg-[rgba(52,214,255,0.07)]' : ''}>
            {columns.map(c => (
              <td key={c.key} className={`py-3 px-2 first:pl-0 last:pr-0 border-b text-[14px] truncate ${c.hideBelow ? HIDE[c.hideBelow] : ''}`} style={{ borderColor: 'rgba(54,211,255,0.08)', color: C.text, textAlign: c.align ?? 'left' }}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Segmented toggle (7d / 30d / 90d, Map / List, …)
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg p-0.5" style={{ background: 'rgba(52,214,255,0.06)', border: `1px solid ${C.border}` }}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className="cc-btn text-[13px] font-semibold px-3 py-1 rounded-md"
          style={o.value === value ? { background: 'rgba(52,214,255,0.18)', color: C.text, boxShadow: `inset 0 0 0 1px ${C.borderStrong}` } : { color: C.text2 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
