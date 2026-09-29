// Job data for the Jarvis workspace. Same records and same calls as /admin
// (JobOps.tsx: get-booking, list-bookings, patch-booking): Jarvis is another
// view over the bookings table, never a copy. JobOps is loaded on first use so
// the dashboard doesn't pay for it; loaded jobs are cached so reopening is
// instant, and every edit (here or in a reused admin panel) goes through putJob
// so all open views agree.
import { useEffect, useState } from 'react';
import type { Job } from '../../JobOps';
import { jobMeta } from './jobMeta';

type Ops = typeof import('../../JobOps');
let opsPromise: Promise<Ops> | null = null;
// The live tax rate is loaded before any reused estimate/payment panel can run
// its math, exactly like the admin Jobs tab does on mount.
export const jobOps = () => (opsPromise ||= import('../../JobOps').then(async m => {
  try { await m.syncTaxRate(); } catch { /* panels fall back to the default rate, same as admin offline */ }
  return m;
}));

const full = new Map<string, Job>();
const pending = new Map<string, Promise<Job | null>>();
let list: { at: number; jobs: Job[] } | null = null;
let listPending: Promise<Job[]> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());


function remember(job: Job, title?: string) {
  const items = (job.lineItems || []).map(li => li.label).join(' ');
  jobMeta.set(job.id, { label: [title, job.fname, job.lname, job.service, job.vehicle, items, job.estimateNotes].filter(Boolean).join(' ').slice(0, 400), date: job.date });
}

export function cachedJob(id: string): Job | undefined { return full.get(id); }

export function loadJob(id: string, fresh = false): Promise<Job | null> {
  if (!fresh && full.has(id)) return Promise.resolve(full.get(id)!);
  if (!fresh && pending.has(id)) return pending.get(id)!;
  const p = jobOps().then(m => m.getJobById(id)).then(job => {
    pending.delete(id);
    if (job) { full.set(id, job); remember(job); notify(); }
    return job;
  }, e => { pending.delete(id); throw e; });
  pending.set(id, p);
  return p;
}

// The same list the admin Jobs tab and schedule load (list-bookings).
export function loadAllJobs(fresh = false): Promise<Job[]> {
  if (!fresh && list && Date.now() - list.at < 60_000) return Promise.resolve(list.jobs);
  if (!fresh && listPending) return listPending;
  listPending = jobOps().then(m => m.getAllJobs()).then(jobs => {
    list = { at: Date.now(), jobs: jobs.filter(j => j.status !== 'deleted') };
    listPending = null;
    for (const j of list.jobs) if (!jobMeta.has(j.id)) remember(j);
    notify();
    return list.jobs;
  }, e => { listPending = null; throw e; });
  return listPending;
}

// After any write: update every cached copy so all open views agree.
export function putJob(job: Job, title?: string) {
  if ((job as { status?: string }).status === 'deleted') {
    full.delete(job.id);
    if (list) list = { ...list, jobs: list.jobs.filter(j => j.id !== job.id) };
  } else {
    full.set(job.id, job);
    if (list) list = { ...list, jobs: list.jobs.map(j => (j.id === job.id ? { ...j, ...job } : j)) };
    remember(job, title);
  }
  notify();
}

export function useJobs(ids: string[]) {
  const key = ids.join(',');
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    setError(null);
    for (const id of key.split(',').filter(Boolean)) loadJob(id).catch(e => setError(e instanceof Error ? e.message : String(e)));
    return () => { listeners.delete(fn); };
  }, [key]);
  return { jobs: ids.map(id => full.get(id) ?? null), error };
}

export function useAllJobs() {
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    loadAllJobs().catch(e => setError(e instanceof Error ? e.message : String(e)));
    return () => { listeners.delete(fn); };
  }, []);
  return { jobs: list?.jobs ?? null, error, reload: () => loadAllJobs(true).catch(e => setError(e instanceof Error ? e.message : String(e))) };
}

// resolveServiceName lives in JobOps; available once any job view has loaded it.
let serviceName: Ops['resolveServiceName'] | null = null;
jobOps().then(m => { serviceName = m.resolveServiceName; }).catch(() => {});
// A generic booking category ("General Inquiry") says nothing about the work:
// use what was actually billed instead, like the admin line items show.
const GENERIC = /^(general inquiry|other|inquiry|)$/i;
export function jobTitle(job: Pick<Job, 'service' | 'notes'> & Partial<Pick<Job, 'lineItems'>>) {
  const name = serviceName ? serviceName(job.service, job.notes || '') : job.service || '';
  if (!GENERIC.test(name.trim())) return name;
  const items = (job.lineItems || []).filter(li => li.label && li.type !== 'mobile' && li.type !== 'discount' && !/mobile service fee/i.test(li.label));
  return items.slice(0, 2).map(li => li.label).join(' + ') || name || 'Job';
}
