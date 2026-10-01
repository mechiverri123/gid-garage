import { useState } from 'react';
import { Users, Check } from 'lucide-react';
import { fmtSource, fmtDate } from '../utils/formatters';
import { LEAD_STATUS_OPTIONS } from '../types';
import type { CommandCenterSummary, Lead } from '../types';
import { C } from '../ui/theme';
import { CommandCard, SectionHeader, DataTable, EmptyState, Skeleton, statusTone, type Column } from '../ui/primitives';
import { TONE } from '../ui/theme';

export function LeadPipeline({
  leadsSummary, leads, leadsLoading, leadStatusFilter, onFilterChange, onStatusChange, onSelect,
}: {
  leadsSummary: CommandCenterSummary['leadsSummary'];
  leads: Lead[];
  leadsLoading: boolean;
  leadStatusFilter: string;
  onFilterChange: (status: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onSelect: (lead: Lead) => void;
}) {
  const [justChanged, setJustChanged] = useState<string | null>(null);

  function handleStatusChange(id: string, status: string) {
    onStatusChange(id, status);
    setJustChanged(id);
    setTimeout(() => setJustChanged(current => (current === id ? null : current)), 1400);
  }
  const stageCounts = LEAD_STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length;
    return acc;
  }, {});

  const cols: Column<Lead>[] = [
    { key: 'name', header: 'Name', width: '26%', render: l => <span className="font-semibold">{`${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || '—'}</span> },
    { key: 'source', header: 'Source', width: '18%', hideBelow: 'md', render: l => <span style={{ color: C.text2 }}>{fmtSource(l.source)}</span> },
    { key: 'service', header: 'Service', hideBelow: 'sm', render: l => <span style={{ color: C.text2 }}>{l.requested_service || '—'}</span> },
    {
      key: 'status', header: 'Status', width: '30%', render: l => (
        <span className="inline-flex items-center gap-2 max-w-full" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <select value={l.status} onChange={e => handleStatusChange(l.id, e.target.value)} aria-label={`Status for ${l.fname || 'lead'}`}
            className="rounded-lg px-2 py-1 text-[13.5px] outline-none min-w-0" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${TONE[statusTone(l.status)]}66`, color: TONE[statusTone(l.status)] }}>
            {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ color: C.text, background: C.bg2 }}>{fmtSource(s)}</option>)}
          </select>
          {justChanged === l.id && <span className="inline-flex items-center gap-1 text-[12.5px] cc-fade-up" style={{ color: C.green }}><Check size={14} />Saved</span>}
        </span>
      ),
    },
    { key: 'when', header: 'Received', width: '16%', hideBelow: 'lg', render: l => <span style={{ color: C.text2 }}>{fmtDate(l.created_at)}</span> },
  ];

  return (
    <CommandCard className="p-5 h-full">
      <SectionHeader icon={Users} tone="purple" title="Leads pipeline" subtitle={`${leadsSummary.total} in the last 30 days · ${leadsSummary.conversionRatePct}% booked`}
        right={
          <select value={leadStatusFilter} onChange={e => onFilterChange(e.target.value)} aria-label="Filter leads by status"
            className="rounded-lg px-3 h-9 text-[14px] outline-none" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text }}>
            <option value="">All statuses</option>
            {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtSource(s)}</option>)}
          </select>
        } />

      <div className="flex gap-2 mb-4 flex-wrap">
        {LEAD_STATUS_OPTIONS.map(s => {
          const on = leadStatusFilter === s; const color = TONE[statusTone(s)];
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => onFilterChange(on ? '' : s)}
              className="cc-btn inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium"
              style={{ border: `1px solid ${on ? color : C.border}`, background: on ? `${color}1c` : 'rgba(52,214,255,0.03)', color: on ? C.text : C.text2 }}>
              {fmtSource(s)}<span className="tabular-nums font-semibold" style={{ color }}>{stageCounts[s]}</span>
            </button>
          );
        })}
      </div>

      {leadsLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <DataTable columns={cols} rows={leads.slice(0, 30)} rowKey={l => l.id} onRowClick={onSelect}
          empty={<EmptyState icon={Users} title={leadStatusFilter ? `No ${fmtSource(leadStatusFilter).toLowerCase()} leads` : 'No leads yet'}>{leadStatusFilter ? 'Try another stage.' : 'New quotes and bookings from the website show up here automatically.'}</EmptyState>} />
      )}
    </CommandCard>
  );
}
