import type { ReactNode } from 'react';
import { PANEL, PANEL_PADDING, COLORS } from '../tokens';

// Reusable HUD panel: header rail (title + optional status dot/badge) +
// content zone. Corner brackets and top-edge glow already come from the
// PANEL token itself. Building this so panels share one consistent header
// treatment instead of each component inventing its own — the "card
// system vs HUD system" gap.
export function HudPanel({
  title, status, children, className = '', contentClassName = '',
}: {
  title: string;
  status?: { label: string; color: string };
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={`${PANEL} ${PANEL_PADDING} ${className}`}>
      <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: COLORS.textMuted }}>{title}</span>
        {status && (
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: status.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </span>
        )}
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
