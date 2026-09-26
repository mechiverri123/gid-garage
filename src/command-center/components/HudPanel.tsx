import type { ReactNode } from 'react';
import { PANEL, PANEL_PADDING, COLORS } from '../tokens';

export function HudPanel({
  title,
  status,
  children,
  className = '',
  contentClassName = '',
}: {
  title: string;
  status?: { label: string; color: string };
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={`${PANEL} ${PANEL_PADDING} ${className}`}
      style={{
        background: `linear-gradient(180deg, rgba(11,24,39,0.96) 0%, rgba(5,12,21,0.94) 100%)`,
        borderColor: COLORS.border,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -24px 45px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(84,231,255,0.05), 0 26px 60px rgba(0,0,0,0.42)',
        transform: 'translateZ(0)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at top center, rgba(84,231,255,0.06), transparent 34%)' }} />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.borderStrong}, transparent)` }} />
      <div className="pointer-events-none absolute left-0 top-6 h-14 w-px" style={{ background: `linear-gradient(180deg, ${COLORS.accent}, transparent)` }} />
      <div className="pointer-events-none absolute right-0 bottom-6 h-14 w-px" style={{ background: `linear-gradient(180deg, transparent, ${COLORS.accentDim})` }} />
      <div className="pointer-events-none absolute left-4 top-4 w-5 h-5 border-l border-t opacity-40" style={{ borderColor: COLORS.accent }} />
      <div className="pointer-events-none absolute right-4 bottom-4 w-5 h-5 border-r border-b opacity-30" style={{ borderColor: COLORS.accentDim }} />
      <div className="relative flex items-center justify-between mb-3 pb-2 border-b border-white/5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: COLORS.textMuted }}>{title}</span>
        {status && (
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: status.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color, boxShadow: `0 0 10px ${status.color}` }} />
            {status.label}
          </span>
        )}
      </div>
      <div className={`relative ${contentClassName}`}>{children}</div>
    </section>
  );
}
