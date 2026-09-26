import { COLORS } from '../tokens';
import { money, fmtDate, fmtSource } from '../utils/formatters';
import type { Lead } from '../types';

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between text-xs py-1 border-b border-white/5">
      <span className="text-[#52616D]">{label}</span>
      <span className="text-[#F5F8FA] text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#52616D] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

// No loading/error state here on purpose — unlike JobDetailPanel, this
// never fetches. The full lead row is already sitting in the leads list
// this was clicked from, so displaying it is instant.
export function LeadDetailPanel({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(6,9,13,0.6)', backdropFilter: 'blur(2px)' }} />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto p-5"
        style={{ background: '#0d1218', borderLeft: `1px solid ${COLORS.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[#52616D]">Lead Detail</div>
          <button onClick={onClose} className="text-[#52616D] hover:text-[#8899A6] text-xs">✕ Close</button>
        </div>

        <div className="text-[15px] font-semibold text-[#F5F8FA] mb-0.5">
          {`${lead.fname || ''} ${lead.lname || ''}`.trim() || lead.phone || 'Unknown lead'}
        </div>
        <div className="text-xs text-[#8899A6] mb-4">{fmtSource(lead.status)} · from {fmtSource(lead.source)}</div>

        <Section title="Contact">
          <Row label="Phone" value={lead.phone} />
          <Row label="Email" value={lead.email} />
        </Section>

        <Section title="Request">
          <Row label="Vehicle" value={lead.vehicle} />
          <Row label="Requested service" value={lead.requested_service} />
          <Row label="Quoted amount" value={lead.quote_amount ? money(lead.quote_amount) : undefined} />
        </Section>

        <Section title="Source">
          <Row label="Source" value={fmtSource(lead.source)} />
          <Row label="Campaign" value={lead.campaign} />
        </Section>

        {lead.notes && (
          <Section title="Notes">
            <div className="text-xs text-[#8899A6] whitespace-pre-wrap">{lead.notes}</div>
          </Section>
        )}

        <Section title="Timeline">
          <Row label="Received" value={fmtDate(lead.created_at)} />
          <Row label="Last contacted" value={lead.last_contacted_at ? fmtDate(lead.last_contacted_at) : 'Never'} />
          <Row label="Follow-up due" value={lead.follow_up_at ? fmtDate(lead.follow_up_at) : undefined} />
        </Section>
      </div>
    </div>
  );
}
