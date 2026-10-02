// Admin → Fleet tab. Jobs open in the existing admin job panel (JobDetailPanel),
// so estimates, parts, inspection, photos, invoice and payment are the same as
// for any job; closing it refreshes the fleet record.
import { useState } from 'react';
import { JobDetailPanel, getJobById, type Job } from '../JobOps';
import { FleetApp } from './FleetApp';

export function FleetAdminTab() {
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const open = async (id: string) => {
    setErr('');
    try { const j = await getJobById(id); if (j) setJob(j); else setErr('That job could not be found.'); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      {err && <div role="alert" className="max-w-6xl mx-auto px-3 sm:px-6 text-red-400 text-sm">{err}</div>}
      <FleetApp skin="admin" onOpenJob={open} reloadKey={reloadKey} />
      {job && <JobDetailPanel job={job} backLabel="Back to Fleet" onClose={() => { setJob(null); setReloadKey(n => n + 1); }} onJobUpdate={j => setJob(j)} />}
    </>
  );
}
