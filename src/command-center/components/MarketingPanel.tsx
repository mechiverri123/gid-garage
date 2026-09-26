import { useMemo, useState } from 'react';
import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { money, fmtSource } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

function MiniBar({ pct }: { pct: number }) {
  return <div className="h-1.5 rounded-full" style={{ width: `${Math.max(10, pct)}%`, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentDim})` }} />;
}

export function MarketingPanel({
  marketingFunnel,
  onAddSpend,
}: {
  marketingFunnel: CommandCenterSummary['marketingFunnel'];
  onAddSpend: (row: { date: string; channel: string; amount: number }) => Promise<void>;
}) {
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendChannel, setSpendChannel] = useState('google_ads');
  const [spendAmount, setSpendAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const spend = marketingFunnel.reduce((s, r) => s + r.spend, 0);
    const leads = marketingFunnel.reduce((s, r) => s + r.leads, 0);
    const booked = marketingFunnel.reduce((s, r) => s + r.bookings, 0);
    const revenue = marketingFunnel.reduce((s, r) => s + r.revenue, 0);
    return { spend, leads, booked, revenue };
  }, [marketingFunnel]);

  const maxSpend = Math.max(...marketingFunnel.map(r => r.spend), 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(spendAmount);
    if (!spendDate || !spendChannel || !amt) return;
    setSaving(true);
    try {
      await onAddSpend({ date: spendDate, channel: spendChannel, amount: amt });
      setSpendAmount('');
    } catch (err: any) {
      alert('Failed to save spend: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <HudPanel title="Marketing" status={{ label: '30 Days', color: COLORS.accent }} className="h-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {[
          ['Spend', money(totals.spend), COLORS.warning],
          ['Leads', String(totals.leads), COLORS.text],
          ['Booked', String(totals.booked), COLORS.success],
          ['Revenue', money(totals.revenue), COLORS.success],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>{label}</div>
            <div className="text-lg font-semibold mt-1" style={{ color: color as string }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 mb-4">
        {marketingFunnel.length === 0 ? (
          <div className="text-xs py-4" style={{ color: COLORS.textFaint }}>No spend or leads logged yet.</div>
        ) : marketingFunnel.map(row => (
          <div key={row.channel} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-xs font-medium" style={{ color: COLORS.text }}>{fmtSource(row.channel)}</div>
              <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{money(row.spend)} spend · {row.bookings} booked</div>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-2"><MiniBar pct={(row.spend / maxSpend) * 100} /></div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <div><span style={{ color: COLORS.textFaint }}>Leads</span><div style={{ color: COLORS.text }}>{row.leads}</div></div>
              <div><span style={{ color: COLORS.textFaint }}>Booked</span><div style={{ color: COLORS.text }}>{row.bookings}</div></div>
              <div><span style={{ color: COLORS.textFaint }}>CPL</span><div style={{ color: COLORS.text }}>{money(row.costPerLead)}</div></div>
              <div><span style={{ color: COLORS.textFaint }}>Revenue</span><div style={{ color: COLORS.success }}>{money(row.revenue)}</div></div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="grid md:grid-cols-[auto_auto_auto_auto] gap-2 items-end border-t border-white/5 pt-3">
        <div>
          <div className="text-[10px] mb-1" style={{ color: COLORS.textFaint }}>Date</div>
          <input type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)}
            className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded-lg outline-none" />
        </div>
        <div>
          <div className="text-[10px] mb-1" style={{ color: COLORS.textFaint }}>Channel</div>
          <select value={spendChannel} onChange={e => setSpendChannel(e.target.value)}
            className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded-lg outline-none">
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="gbp">Google Business Profile</option>
            <option value="referral">Referral</option>
            <option value="organic">Organic</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] mb-1" style={{ color: COLORS.textFaint }}>Amount ($)</div>
          <input type="number" step="0.01" value={spendAmount} onChange={e => setSpendAmount(e.target.value)}
            placeholder="0.00" className="w-24 bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded-lg outline-none" />
        </div>
        <button type="submit" disabled={saving}
          className="border text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded-lg transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-50"
          style={{ borderColor: COLORS.border, color: COLORS.accent }}>
          {saving ? 'Saving…' : '+ Add Spend'}
        </button>
      </form>
    </HudPanel>
  );
}
