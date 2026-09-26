import { useState } from 'react';
import { PANEL, PANEL_PADDING, LABEL } from '../tokens';
import { money, fmtSource } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

export function MarketingPanel({
  marketingFunnel, onAddSpend,
}: {
  marketingFunnel: CommandCenterSummary['marketingFunnel'];
  onAddSpend: (row: { date: string; channel: string; amount: number }) => Promise<void>;
}) {
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendChannel, setSpendChannel] = useState('google_ads');
  const [spendAmount, setSpendAmount] = useState('');
  const [saving, setSaving] = useState(false);

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
    <div className={`${PANEL} ${PANEL_PADDING}`}>
      <div className={LABEL + ' mb-3'}>Marketing (last 30 days)</div>
      {marketingFunnel.length === 0 ? (
        <div className="text-xs text-[#52616D] py-2 mb-3">No spend or leads logged yet.</div>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#52616D] border-b border-white/5">
                <th className="text-left py-2 pr-3 font-normal">Channel</th>
                <th className="text-right py-2 pr-3 font-normal">Spend</th>
                <th className="text-right py-2 pr-3 font-normal">Leads</th>
                <th className="text-right py-2 pr-3 font-normal">Booked</th>
                <th className="text-right py-2 pr-3 font-normal">Cost/Booking</th>
                <th className="text-right py-2 font-normal">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {marketingFunnel.map(row => (
                <tr key={row.channel} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-[#F5F8FA]">{fmtSource(row.channel)}</td>
                  <td className="py-2 pr-3 text-right text-[#8899A6]">{money(row.spend)}</td>
                  <td className="py-2 pr-3 text-right text-[#8899A6]">{row.leads}</td>
                  <td className="py-2 pr-3 text-right text-[#8899A6]">{row.bookings}</td>
                  <td className="py-2 pr-3 text-right text-[#8899A6]">{money(row.costPerBooking)}</td>
                  <td className="py-2 text-right text-[#42D392]">{money(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-wrap gap-2 items-end border-t border-white/5 pt-3">
        <div>
          <div className="text-[10px] text-[#52616D] mb-1">Date</div>
          <input type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)}
            className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded outline-none" />
        </div>
        <div>
          <div className="text-[10px] text-[#52616D] mb-1">Channel</div>
          <select value={spendChannel} onChange={e => setSpendChannel(e.target.value)}
            className="bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded outline-none">
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="gbp">Google Business Profile</option>
            <option value="referral">Referral</option>
            <option value="organic">Organic</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] text-[#52616D] mb-1">Amount ($)</div>
          <input type="number" step="0.01" value={spendAmount} onChange={e => setSpendAmount(e.target.value)}
            placeholder="0.00" className="w-24 bg-black/30 border border-white/10 text-[#8899A6] text-xs px-2 py-1.5 rounded outline-none" />
        </div>
        <button type="submit" disabled={saving}
          className="border border-white/10 text-[#8899A6] hover:border-[#32D9FF] hover:text-[#32D9FF] disabled:opacity-50 text-xs font-semibold uppercase tracking-wide px-4 py-1.5 rounded transition-colors">
          {saving ? 'Saving…' : '+ Add Spend'}
        </button>
      </form>
    </div>
  );
}
