// "AI summary" card for one job: admin job panel (Overview tab) and the Tech
// app (Job tab). Opening a job shows the saved summary if the job hasn't changed
// (no AI call); the button makes a new one. Server: functions/_lib/job-summary.js.
import { useEffect, useState } from 'react';
import { adminPost, type Job } from './JobOps';

type Result = { summary: string | null; at?: string; cached?: boolean; stale?: boolean };

const errText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { return JSON.parse(raw).error || raw; } catch { return raw || 'Something went wrong.'; }
};

// Only the fields the summary is built from (functions/_lib/job-summary.js). Photo
// links and other refresh noise are left out, so an auto-refresh never looks like
// an edit; when this changes, the server decides whether the summary is stale.
function factsKey(j: Job) {
  const captions = [...(j.jobPhotos || []), ...(j.adminPhotos || [])].map((p: { note?: string }) => p?.note || '');
  return JSON.stringify([j.service, j.date, j.time, j.dateTbd, j.vehicle, j.vin, j.mileage, j.notes, j.garageNotes, j.jobStatus, j.status,
    j.estimateAmount, j.estimateNotes, j.lineItems, j.taxAmount, j.preExistingDamage, j.invoiceAmount, j.paidAt, j.adjustmentReason,
    j.adjustmentAmount, j.amountPaid, j.payments, j.partsCost, j.partsReceipts, j.inspectionData, j.signedAt, j.invoiceSentCount, captions]);
}

export function JobAISummary({ job }: { job: Job }) {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [changed, setChanged] = useState(false);
  const facts = factsKey(job);

  // New job: start clean.
  useEffect(() => { setRes(null); setErr(''); setChanged(false); }, [job.id]);

  // Saved summary on open, and again only when the job's facts really change (free: no
  // AI call). `facts` is a string, so a refresh with the same facts doesn't re-run this.
  useEffect(() => {
    let live = true;
    adminPost('job-summary', { id: job.id, cachedOnly: true })
      .then((r: Result) => {
        if (!live) return;
        if (r.summary) { setRes(r); setChanged(false); }
        else if (r.stale) setChanged(true); // keep showing the old one, flagged
        else setRes(r);
      })
      .catch(() => { /* no saved summary is fine */ });
    return () => { live = false; };
  }, [job.id, facts]);

  async function make() {
    setBusy(true); setErr('');
    try {
      const r: Result = await adminPost('job-summary', { id: job.id });
      setRes(r); setChanged(false);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  const when = res?.at ? new Date(res.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }) : '';
  const outdated = changed || (!res?.summary && res?.stale);
  return (
    <div className="no-print bg-gray-900 border border-gray-800 border-l-4 border-l-red-600 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest">✨ AI summary{when && <span className="normal-case tracking-normal font-normal text-gray-600"> · {when}</span>}</p>
        {(!res?.summary || changed) && (
          <button type="button" onClick={make} disabled={busy}
            className="text-[12px] font-bold uppercase tracking-wider px-3 py-1.5 border border-gray-700 text-gray-200 hover:border-red-600 disabled:opacity-50 whitespace-nowrap">
            {busy ? 'Thinking…' : outdated ? 'Update' : 'Summarize'}
          </button>
        )}
      </div>
      {res?.summary && <p className="text-gray-200 text-[14px] leading-relaxed whitespace-pre-wrap mt-2">{res.summary}</p>}
      {outdated && <p className="text-amber-400 text-[12px] mt-2">The job changed since this summary. Tap Update for a fresh one.</p>}
      {!res?.summary && !outdated && !err && !busy && <p className="text-gray-500 text-[12px] mt-1">A quick overview of this job from its notes, parts, inspection and payments (well under 1¢).</p>}
      {err && <p className="text-red-400 text-[12px] mt-2" role="alert">{err}</p>}
    </div>
  );
}
