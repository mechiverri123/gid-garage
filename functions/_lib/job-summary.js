// "AI summary" for one job (admin + Tech app, via /admin-api-data `job-summary`).
// Input is the same labeled fact sheet Jarvis reads (jobEvidence), plus the
// Next-Visit check and this customer's last few jobs. Claude Haiku writes a short
// overview from those facts only. The result is cached in R2 by a hash of the
// facts, so pressing the button again on an unchanged job costs nothing; any
// change to the job makes a fresh summary. Cost goes into the Jarvis AI budget.
// Tests: tests/job-summary.test.js
import { readBudget, addUsage, anthropicUsd, pricing } from './ai-budget.js';
import { jobEvidence } from '../../shared/job-context.js';
import { recommendations } from '../../shared/next-visit.js';

const MODEL = 'claude-haiku-4-5-20251001';
const VERSION = 1; // bump when the prompt or input shape changes, so cached summaries refresh
export const summaryKey = id => `private/job-summaries/${String(id).replace(/[^\w-]/g, '_')}.json`;

const SYSTEM = [
  'You write a quick overview of one mobile-mechanic job for the owner and technician, from the JSON facts given.',
  'Use ONLY those facts. Never invent parts, prices, diagnoses, codes, times or customer statements. If something is missing, leave it out; say "not recorded" only for the work itself.',
  'Format, plain text, under 90 words:',
  'Line 1: vehicle · the work in a few words.',
  'Then 3 to 6 short lines, each starting with "• ": what is being done or was found; parts (receipts, cost); labor hours if given; money (quoted or invoiced total, paid, balance due); anything recommended, approved or declined; the next step.',
  'Money: quote the *_total values (they include tax). No markdown, no headings, no greeting.',
].join('\n');

const firstName = s => String(s || '').trim().split(/\s+/)[0] || null;

// The facts sent to the model: no address, phone or email.
export function summaryInput(row, history = []) {
  const ev = jobEvidence(row, { detail: true });
  const { id, serviceAddress, evidenceFields, customer, ...facts } = ev;
  let nv = null;
  try { nv = (typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data)?.nextVisit || null; } catch { nv = null; }
  const recs = recommendations(nv);
  const nextVisit = recs.length ? {
    items: recs.map(r => ({ service: r.service || r.label, urgency: r.status, note: r.note || null, laborHours: r.laborHours ?? null })),
    customerAnswer: nv.response ? { approved: nv.response.approved, declined: nv.response.declined, rebookedJob: nv.response.jobId || null } : 'not answered yet',
  } : null;
  const past = history.filter(h => h.id !== row.id).slice(0, 5).map(h => {
    const e = jobEvidence(h);
    return { date: e.date, status: e.status, vehicle: e.vehicle, work: e.lineItems.map(li => li.label).join('; ') || e.scopeOfWork || e.serviceCategory.label };
  });
  return JSON.stringify({ customerFirstName: firstName(customer), job: facts, nextVisit, pastJobsForThisCustomer: past });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function readCache(bucket, key) {
  if (!bucket) return null;
  try { const o = await bucket.get(key); return o ? await o.json() : null; } catch { return null; }
}

// cachedOnly: return the saved summary if the job hasn't changed, else { summary: null } (no AI call).
export async function jobSummary({ base, headers, env, bucket, id, cachedOnly = false, fetchImpl = (...a) => fetch(...a), now = new Date() }) {
  if (!id) throw new Error('Which job?');
  const getRows = async q => {
    const res = await fetchImpl(`${base}/bookings?${new URLSearchParams(q)}`, { headers });
    if (!res.ok) throw new Error(`Could not load the job (${res.status}).`);
    return res.json();
  };
  const [row] = await getRows({ select: '*', id: `eq.${id}`, limit: '1' });
  if (!row) throw new Error('No job found with that id.');
  const history = row.customer_id
    ? await getRows({ select: 'id,date,job_status,status,service,vehicle,line_items,estimate_notes,garage_notes,notes', customer_id: `eq.${row.customer_id}`, order: 'date.desc', limit: '6' }).catch(() => [])
    : [];
  const input = summaryInput(row, history);
  const hash = await sha256(`${VERSION}\n${input}`);
  const key = summaryKey(id);
  const hit = await readCache(bucket, key);
  if (hit?.hash === hash && hit.summary) return { summary: hit.summary, at: hit.at, cached: true };
  if (cachedOnly) return { summary: null, stale: !!hit?.summary };
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');

  const budget = await readBudget({ base, headers, env, now, fetchImpl });
  if (budget.state === 'blocked') throw new Error('The monthly AI budget is used up (Settings → Usage).');
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, messages: [{ role: 'user', content: input }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI error: ${body?.error?.message || res.status}`);
  const usd = anthropicUsd(body.usage || {}, pricing(env));
  await addUsage({ base, headers, provider: 'anthropic', units: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0), usd, now, fetchImpl });
  const summary = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!summary) throw new Error('The AI returned an empty summary. Try again.');
  const value = { hash, summary, at: now.toISOString() };
  if (bucket) await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
  return { summary, at: value.at, cached: false };
}
