import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max <= 0 ? 4 : Math.max(8, Math.round((value / max) * 100));
  return <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />;
}

export function WeekSummary({ leadsSummary, marketingFunnel }: { leadsSummary: CommandCenterSummary['leadsSummary']; marketingFunnel: CommandCenterSummary['marketingFunnel'] }) {
  const totalSpend = marketingFunnel.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = marketingFunnel.reduce((s, r) => s + r.revenue, 0);
  const totalBookings = marketingFunnel.reduce((s, r) => s + r.bookings, 0);
  const maxBar = Math.max(totalSpend, totalRevenue, leadsSummary.total, totalBookings, 1);
  const rows = [
    { label: 'Leads', value: leadsSummary.total, display: String(leadsSummary.total), color: COLORS.accent },
    { label: 'Booked', value: totalBookings || leadsSummary.booked, display: String(totalBookings || leadsSummary.booked), color: COLORS.success },
    { label: 'Conversion', value: leadsSummary.conversionRatePct, display: `${leadsSummary.conversionRatePct}%`, color: COLORS.warning },
    { label: 'Ad Spend', value: totalSpend, display: money(totalSpend), color: COLORS.warning },
    { label: 'Ad Revenue', value: totalRevenue, display: money(totalRevenue), color: COLORS.success },
  ];

  return (
    <HudPanel title="Performance Snapshot" status={{ label: '30 Days', color: COLORS.textMuted }}>
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span style={{ color: COLORS.textMuted }}>{r.label}</span>
              <span className="font-semibold" style={{ color: r.color }}>{r.display}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <SparkBar value={r.value} max={maxBar} color={r.color} />
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  );
}
