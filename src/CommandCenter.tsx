// ── GID COMMAND CENTER ───────────────────────────────────────────────────
// New admin tab: "How is the business doing, who needs attention, what
// should I do next." Talks to the new admin-api-data.js actions:
//   get-command-center-summary, list-leads, patch-lead, list-marketing-spend,
//   add-marketing-spend, ask-gid
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';

async function adminPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/admin-api-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Types (mirror the shapes returned by admin-api-data.js) ─────────────
interface NeedsAttentionItem {
  type: 'lead_follow_up' | 'missed_call' | 'unpaid_invoice';
  label: string;
  detail: string;
  leadId?: string;
  callId?: string;
  bookingId?: string;
}
interface CommandCenterSummary {
  today: { date: string; jobCount: number; revenue: number; newLeads: number; missedCalls: number; nextOpenDay: string | null };
  needsAttention: NeedsAttentionItem[];
  leadsSummary: { windowDays: number; total: number; contacted: number; booked: number; conversionRatePct: number };
  marketingFunnel: { channel: string; spend: number; calls: number; leads: number; bookings: number; revenue: number; costPerBooking: number | null; costPerLead: number | null }[];
  scheduleBar: { date: string; jobCount: number; revenue: number }[];
}
interface Lead {
  id: string;
  created_at: string;
  fname?: string; lname?: string; phone?: string; email?: string;
  source: string; campaign?: string; vehicle?: string; requested_service?: string;
  quote_amount?: number; status: string; follow_up_at?: string | null; last_contacted_at?: string | null;
  notes?: string;
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtSource(s: string): string {
  return (s || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

const STATUS_OPTIONS = ['new', 'contacted', 'quoted', 'booked', 'lost', 'no_response'] as const;

const CARD = 'bg-black/40 border border-gray-800 p-4';
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-gray-500';

export function CommandCenterTab() {
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('');

  const [askQuery, setAskQuery] = useState('');
  const [askHistory, setAskHistory] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);

  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [spendChannel, setSpendChannel] = useState('google_ads');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendSaving, setSpendSaving] = useState(false);

  const loadSummary = useCallback(() => {
    setLoading(true);
    setError(null);
    adminPost('get-command-center-summary', { windowDays: 30 })
      .then(setSummary)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadLeads = useCallback((status?: string) => {
    setLeadsLoading(true);
    adminPost('list-leads', status ? { status } : {})
      .then(setLeads)
      .catch(() => {})
      .finally(() => setLeadsLoading(false));
  }, []);

  useEffect(() => { loadSummary(); loadLeads(); }, [loadSummary, loadLeads]);

  async function updateLeadStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, status } : l)));
    try {
      await adminPost('patch-lead', { id, fields: { status, last_contacted_at: new Date().toISOString() } });
      loadSummary();
    } catch {
      loadLeads(leadStatusFilter || undefined); // revert to server truth on failure
    }
  }

  async function submitAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = askQuery.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const res = await adminPost('ask-gid', { query: q });
      setAskHistory(prev => [{ q, a: res?.text || 'No answer.' }, ...prev].slice(0, 8));
      setAskQuery('');
    } catch (err: any) {
      setAskHistory(prev => [{ q, a: `Error: ${err.message}` }, ...prev].slice(0, 8));
    } finally {
      setAsking(false);
    }
  }

  async function submitSpend(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(spendAmount);
    if (!spendDate || !spendChannel || !amt) return;
    setSpendSaving(true);
    try {
      await adminPost('add-marketing-spend', { row: { date: spendDate, channel: spendChannel, amount: amt } });
      setSpendAmount('');
      loadSummary();
    } catch (err: any) {
      alert('Failed to save spend: ' + err.message);
    } finally {
      setSpendSaving(false);
    }
  }

  if (loading && !summary) {
    return <div className="max-w-6xl mx-auto py-12 px-4 text-center text-gray-500 text-sm">Loading command center…</div>;
  }
  if (error && !summary) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-center">
        <p className="text-red-500 text-sm mb-3">Failed to load: {error}</p>
        <p className="text-gray-500 text-xs mb-4">
          If this is the first time loading this tab, make sure you've run <code className="text-gray-300">gid_command_center_migration.sql</code> in the Supabase SQL editor.
        </p>
        <button onClick={loadSummary} className="border border-gray-700 text-gray-300 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-wide px-4 py-2">Retry</button>
      </div>
    );
  }
  if (!summary) return null;

  const maxJobs = Math.max(1, ...summary.scheduleBar.map(d => d.jobCount));

  return (
    <div className="max-w-6xl mx-auto py-4 px-3 sm:px-6 space-y-6">

      {/* ── Ask GID ─────────────────────────────────────────────────── */}
      <div className={CARD}>
        <div className={LABEL + ' mb-2'}>Ask GID</div>
        <form onSubmit={submitAsk} className="flex gap-2">
          <input
            type="text"
            value={askQuery}
            onChange={e => setAskQuery(e.target.value)}
            placeholder="Who needs follow-up? How are my ads doing? What's unpaid?"
            className="flex-1 bg-black/30 border border-white/15 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-red-600 transition-colors"
          />
          <button type="submit" disabled={asking}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide px-5 py-2.5 transition-colors whitespace-nowrap">
            {asking ? '…' : 'Ask'}
          </button>
        </form>
        {askHistory.length > 0 && (
          <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
            {askHistory.map((h, i) => (
              <div key={i} className="text-xs border-l-2 border-gray-800 pl-3 py-1">
                <div className="text-gray-500">{h.q}</div>
                <div className="text-gray-200 mt-0.5">{h.a}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Today + Needs Attention ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={CARD}>
          <div className={LABEL + ' mb-3'}>Today · {summary.today.date}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-2xl font-extrabold text-white">{summary.today.jobCount}</div><div className="text-[11px] text-gray-500">jobs</div></div>
            <div><div className="text-2xl font-extrabold text-white">{money(summary.today.revenue)}</div><div className="text-[11px] text-gray-500">scheduled</div></div>
            <div><div className="text-2xl font-extrabold text-white">{summary.today.newLeads}</div><div className="text-[11px] text-gray-500">new leads</div></div>
            <div><div className={`text-2xl font-extrabold ${summary.today.missedCalls > 0 ? 'text-red-500' : 'text-white'}`}>{summary.today.missedCalls}</div><div className="text-[11px] text-gray-500">missed calls</div></div>
          </div>
          {summary.today.nextOpenDay && (
            <div className="mt-3 text-[11px] text-gray-500">Next open day: <span className="text-gray-300">{summary.today.nextOpenDay}</span></div>
          )}
        </div>

        <div className={CARD}>
          <div className={LABEL + ' mb-3'}>Needs Attention</div>
          {summary.needsAttention.length === 0 ? (
            <div className="text-xs text-gray-500 py-2">Nothing needs attention right now.</div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {summary.needsAttention.slice(0, 12).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-gray-900 pb-1.5">
                  <span className="text-gray-200">⚠ {item.label}</span>
                  <span className="text-gray-500">{item.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Schedule bar (next 7 days) ─────────────────────────────── */}
      <div className={CARD}>
        <div className={LABEL + ' mb-3'}>Next 7 Days</div>
        <div className="flex items-end gap-2 h-20">
          {summary.scheduleBar.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-gray-900 flex items-end" style={{ height: '56px' }}>
                <div className="w-full bg-red-600" style={{ height: `${Math.max(4, (d.jobCount / maxJobs) * 56)}px` }} title={`${d.jobCount} jobs, ${money(d.revenue)}`} />
              </div>
              <div className="text-[9px] text-gray-500">{fmtDayLabel(d.date)}</div>
              <div className="text-[9px] text-gray-400">{d.jobCount}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Leads ───────────────────────────────────────────────────── */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-3">
          <div className={LABEL}>
            Leads · {summary.leadsSummary.total} (30d) · {summary.leadsSummary.conversionRatePct}% booked
          </div>
          <select value={leadStatusFilter} onChange={e => { setLeadStatusFilter(e.target.value); loadLeads(e.target.value || undefined); }}
            className="bg-black/30 border border-gray-700 text-gray-300 text-xs px-2 py-1 outline-none">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
          </select>
        </div>
        {leadsLoading ? (
          <div className="text-xs text-gray-500 py-4 text-center">Loading…</div>
        ) : leads.length === 0 ? (
          <div className="text-xs text-gray-500 py-4 text-center">No leads found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3 font-normal">Name</th>
                  <th className="text-left py-2 pr-3 font-normal">Source</th>
                  <th className="text-left py-2 pr-3 font-normal">Service</th>
                  <th className="text-left py-2 pr-3 font-normal">Status</th>
                  <th className="text-left py-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 30).map(l => (
                  <tr key={l.id} className="border-b border-gray-900">
                    <td className="py-2 pr-3 text-gray-200">{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</td>
                    <td className="py-2 pr-3 text-gray-400">{fmtSource(l.source)}</td>
                    <td className="py-2 pr-3 text-gray-400">{l.requested_service || '—'}</td>
                    <td className="py-2 pr-3">
                      <select value={l.status} onChange={e => updateLeadStatus(l.id, e.target.value)}
                        className="bg-black/30 border border-gray-700 text-gray-300 text-[11px] px-1.5 py-0.5 outline-none focus:border-red-600">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
                      </select>
                    </td>
                    <td className="py-2 text-gray-500">{new Date(l.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Marketing funnel ────────────────────────────────────────── */}
      <div className={CARD}>
        <div className={LABEL + ' mb-3'}>Marketing (last 30 days)</div>
        {summary.marketingFunnel.length === 0 ? (
          <div className="text-xs text-gray-500 py-2 mb-3">No spend or leads logged yet.</div>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3 font-normal">Channel</th>
                  <th className="text-right py-2 pr-3 font-normal">Spend</th>
                  <th className="text-right py-2 pr-3 font-normal">Leads</th>
                  <th className="text-right py-2 pr-3 font-normal">Booked</th>
                  <th className="text-right py-2 pr-3 font-normal">Cost/Booking</th>
                  <th className="text-right py-2 font-normal">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary.marketingFunnel.map(row => (
                  <tr key={row.channel} className="border-b border-gray-900">
                    <td className="py-2 pr-3 text-gray-200">{fmtSource(row.channel)}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{money(row.spend)}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{row.leads}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{row.bookings}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{money(row.costPerBooking)}</td>
                    <td className="py-2 text-right text-green-500">{money(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={submitSpend} className="flex flex-wrap gap-2 items-end border-t border-gray-800 pt-3">
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Date</div>
            <input type="date" value={spendDate} onChange={e => setSpendDate(e.target.value)}
              className="bg-black/30 border border-gray-700 text-gray-300 text-xs px-2 py-1.5 outline-none" />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Channel</div>
            <select value={spendChannel} onChange={e => setSpendChannel(e.target.value)}
              className="bg-black/30 border border-gray-700 text-gray-300 text-xs px-2 py-1.5 outline-none">
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
              <option value="gbp">Google Business Profile</option>
              <option value="referral">Referral</option>
              <option value="organic">Organic</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Amount ($)</div>
            <input type="number" step="0.01" value={spendAmount} onChange={e => setSpendAmount(e.target.value)}
              placeholder="0.00" className="w-24 bg-black/30 border border-gray-700 text-gray-300 text-xs px-2 py-1.5 outline-none" />
          </div>
          <button type="submit" disabled={spendSaving}
            className="border border-gray-700 text-gray-300 hover:border-red-600 hover:text-white disabled:opacity-50 text-xs font-bold uppercase tracking-wide px-4 py-1.5 transition-colors">
            {spendSaving ? 'Saving…' : '+ Add Spend'}
          </button>
        </form>
      </div>

      <div className="text-center">
        <button onClick={loadSummary} className="text-gray-500 hover:text-gray-300 text-[11px] uppercase tracking-wide">↻ Refresh</button>
      </div>
    </div>
  );
}
