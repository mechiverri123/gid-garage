import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { money, fmtSource } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';
import { C } from '../ui/theme';
import { CommandCard, SectionHeader, DataTable, EmptyState, ActionButton, ErrorState, type Column } from '../ui/primitives';

type Row = CommandCenterSummary['marketingFunnel'][number];

export function MarketingPanel({
  marketingFunnel, onAddSpend,
}: {
  marketingFunnel: CommandCenterSummary['marketingFunnel'];
  onAddSpend: (row: { date: string; channel: string; amount: number }) => Promise<void>;
}) {
  const [spendDate, setSpendDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }));
  const [spendChannel, setSpendChannel] = useState('google_ads');
  const [spendAmount, setSpendAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(spendAmount);
    if (!spendDate || !spendChannel || !amt) { setErr('Enter a date, channel and amount.'); return; }
    setSaving(true); setErr(null); setSaved(false);
    try {
      await onAddSpend({ date: spendDate, channel: spendChannel, amount: amt });
      setSpendAmount(''); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (x) {
      setErr(`Couldn't save spend: ${x instanceof Error ? x.message : String(x)}`);
    } finally {
      setSaving(false);
    }
  }

  const cols: Column<Row>[] = [
    { key: 'ch', header: 'Channel', render: r => <span className="font-semibold">{fmtSource(r.channel)}</span> },
    { key: 'spend', header: 'Spend', width: '13%', align: 'right', render: r => <span className="tabular-nums" style={{ color: C.text2 }}>{money(r.spend)}</span> },
    { key: 'leads', header: 'Leads', width: '11%', align: 'right', render: r => <span className="tabular-nums">{r.leads}</span> },
    { key: 'booked', header: 'Booked', width: '12%', align: 'right', render: r => <span className="tabular-nums">{r.bookings}</span> },
    { key: 'cpb', header: 'Per booking', width: '16%', align: 'right', hideBelow: '2xl', render: r => <span className="tabular-nums" style={{ color: C.text2 }}>{money(r.costPerBooking)}</span> },
    { key: 'rev', header: 'Revenue', width: '14%', align: 'right', render: r => <span className="tabular-nums font-semibold" style={{ color: r.revenue > 0 ? C.green : C.text2 }}>{money(r.revenue)}</span> },
  ];
  const field = 'rounded-lg px-3 h-10 text-[14px] outline-none w-full';
  const fieldStyle = { background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text, colorScheme: 'dark' as const };

  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Megaphone} tone="amber" title="Marketing" subtitle="Last 30 days · spend vs leads, bookings and revenue" />
      <div className="mb-5">
        <DataTable columns={cols} rows={marketingFunnel} rowKey={r => r.channel} empty={<EmptyState icon={Megaphone} title="No spend or leads yet">Log ad spend below to see cost per booking.</EmptyState>} />
      </div>
      <form onSubmit={submit} className="pt-4 border-t" style={{ borderColor: C.border }}>
        <div className="text-[14px] font-semibold mb-2" style={{ color: C.text }}>Log ad spend</div>
        <div className="grid grid-cols-2 gap-2.5 items-end">
          <label className="text-[13px]" style={{ color: C.text2 }}>Date<input type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)} className={`${field} mt-1`} style={fieldStyle} /></label>
          <label className="text-[13px]" style={{ color: C.text2 }}>Channel
            <select value={spendChannel} onChange={e => setSpendChannel(e.target.value)} className={`${field} mt-1`} style={fieldStyle}>
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
              <option value="gbp">Google Business Profile</option>
              <option value="referral">Referral</option>
              <option value="organic">Organic</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-[13px]" style={{ color: C.text2 }}>Amount ($)<input type="number" step="0.01" min="0" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} placeholder="0.00" className={`${field} mt-1`} style={fieldStyle} /></label>
          <div className="flex"><ActionButton type="submit" variant="primary" icon={Plus} disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved' : 'Add spend'}</ActionButton></div>
        </div>
        {err && <div className="mt-3"><ErrorState message={err} /></div>}
      </form>
    </CommandCard>
  );
}
