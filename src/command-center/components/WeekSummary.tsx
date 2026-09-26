import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

export function WeekSummary({ leadsSummary, marketingFunnel }: { leadsSummary: CommandCenterSummary['leadsSummary']; marketingFunnel: CommandCenterSummary['marketingFunnel'] }) {
  const totalSpend = marketingFunnel.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = marketingFunnel.reduce((s, r) => s + r.revenue, 0);
  return (
    <HudPanel title="This Month">
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span style={{ color: COLORS.textMuted }}>Leads</span><span style={{ color: COLORS.text }} className="font-semibold">{leadsSummary.total}</span></div>
        <div className="flex justify-between"><span style={{ color: COLORS.textMuted }}>Booked</span><span style={{ color: COLORS.text }} className="font-semibold">{leadsSummary.booked}</span></div>
        <div className="flex justify-between"><span style={{ color: COLORS.textMuted }}>Conversion</span><span style={{ color: COLORS.accent }} className="font-semibold">{leadsSummary.conversionRatePct}%</span></div>
        <div className="flex justify-between"><span style={{ color: COLORS.textMuted }}>Ad Spend</span><span style={{ color: COLORS.text }} className="font-semibold">{money(totalSpend)}</span></div>
        <div className="flex justify-between"><span style={{ color: COLORS.textMuted }}>Ad Revenue</span><span style={{ color: COLORS.success }} className="font-semibold">{money(totalRevenue)}</span></div>
      </div>
    </HudPanel>
  );
}
