// Cloudflare Pages Function — /jarvis/money  (owner only)
// Under /jarvis/* so it inherits the Cloudflare Access app (CLAUDE.md §0); the
// Access JWT is verified here too (verifyAccess).
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   ledger + totals for that range (Phoenix days)
// POST { action: 'upload', text, name }   a Bluevine or Zoho Books CSV (detected from the header)
//      { action: 'decide', id, kind?, category?, funding? }   the owner's call on one entry
//      { action: 'undecide', id }
// Bank/Zoho data lives in R2 private/money/ (never served). Revenue and sales tax
// come from the jobs with the canonical rules (shared/business-metrics.js), so
// Money shows the same revenue as the dashboard. Nothing here writes to bookings.
import { verifyAccess } from '../_lib/access-auth.js';
import { readJson, writeJson } from '../_lib/jarvis-feeds.js';
import { detectKind, parseBluevine, parseZoho, mergeRows, buildLedger, summarize, EXPENSE_CATEGORIES, KINDS } from '../../shared/money.js';
import { jobFromRow, collectedRevenue, jobContribution, dayRangeWindow } from '../../shared/business-metrics.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const MONEY_KEYS = { bluevine: 'private/money/bluevine.json', zoho: 'private/money/zoho.json', decisions: 'private/money/decisions.json' };
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const FUNDING = ['bank', 'personal', 'business_cash', 'outside'];

export function revenueFor(jobs, from, to) {
  const w = dayRangeWindow(from, to);
  const { total } = collectedRevenue(jobs, w.inWindow);
  const salesTax = jobs.reduce((s, j) => s + jobContribution(j, w.inWindow).taxAmount, 0);
  return { collected: total, salesTax };
}

export async function handleMoney({ request, env, verify = verifyAccess, fetchImpl = (...a) => fetch(...a) }) {
  const auth = await verify(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const bucket = env.GID_PHOTOS;
  if (!bucket) return json({ error: 'Storage (GID_PHOTOS) is not configured.' }, 500);
  const load = async () => ({
    bv: (await readJson(bucket, MONEY_KEYS.bluevine)) || { rows: [], uploads: [] },
    zb: (await readJson(bucket, MONEY_KEYS.zoho)) || { rows: [], uploads: [] },
    decisions: (await readJson(bucket, MONEY_KEYS.decisions)) || {},
  });

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const from = isYmd(url.searchParams.get('from')) ? url.searchParams.get('from') : '2000-01-01';
    const to = isYmd(url.searchParams.get('to')) ? url.searchParams.get('to') : '2999-12-31';
    const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/bookings?select=*`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    if (!res.ok) return json({ error: `Jobs: ${res.status}` }, 502);
    const jobs = (await res.json()).map(jobFromRow);
    const { bv, zb, decisions } = await load();
    const { entries, bankStart } = buildLedger({ bank: bv.rows, zoho: zb.rows, overrides: decisions });
    const latest = bv.rows.find(r => r.balance != null) || null; // rows are newest first
    return json({
      from, to, categories: EXPENSE_CATEGORIES, kinds: KINDS,
      summary: summarize(entries, from, to, revenueFor(jobs, from, to)),
      allTime: summarize(entries, '2000-01-01', '2999-12-31', revenueFor(jobs, '2000-01-01', '2999-12-31')),
      entries: entries.filter(e => e.date >= from && e.date <= to),
      reviewAll: entries.filter(e => e.review).length,
      sources: {
        bluevine: { rows: bv.rows.length, from: bankStart, to: bv.rows[0]?.date || null, balance: latest?.balance ?? null, balanceDate: latest?.date || null, lastUpload: bv.uploads[0] || null },
        zoho: { rows: zb.rows.length, from: zb.rows.at(-1)?.date || null, to: zb.rows[0]?.date || null, lastUpload: zb.uploads[0] || null },
      },
    });
  }

  const body = await request.json().catch(() => null);
  if (!body?.action) return json({ error: 'Missing action' }, 400);
  if (body.action === 'upload') {
    const text = String(body.text || '');
    if (!text || text.length > 5_000_000) return json({ error: 'Empty or too large (5 MB max).' }, 400);
    const kind = detectKind(text);
    if (!kind) return json({ error: "Not a Bluevine transactions CSV or a Zoho Books 'Expense Details' CSV." }, 400);
    const rows = kind === 'bluevine' ? parseBluevine(text) : parseZoho(text);
    if (!rows.length) return json({ error: 'No transactions found in that file.' }, 400);
    const key = kind === 'bluevine' ? MONEY_KEYS.bluevine : MONEY_KEYS.zoho;
    const cur = (await readJson(bucket, key)) || { rows: [], uploads: [] };
    const { rows: merged, added } = mergeRows(cur.rows, rows);
    const upload = { at: new Date().toISOString(), name: String(body.name || '').slice(0, 120), rows: rows.length, added, from: rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date), to: rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date) };
    await writeJson(bucket, key, { rows: merged, uploads: [upload, ...(cur.uploads || [])].slice(0, 50) });
    return json({ ok: true, kind, ...upload });
  }
  if (body.action === 'decide' || body.action === 'undecide') {
    const id = String(body.id || '').slice(0, 200);
    if (!/^(bv|zb):/.test(id)) return json({ error: 'Bad id' }, 400);
    const decisions = (await readJson(bucket, MONEY_KEYS.decisions)) || {};
    if (body.action === 'undecide') delete decisions[id];
    else {
      const d = {};
      if (body.kind != null) { if (!KINDS.includes(body.kind)) return json({ error: 'Bad kind' }, 400); d.kind = body.kind; }
      if (body.category != null) { if (!EXPENSE_CATEGORIES.includes(body.category)) return json({ error: 'Bad category' }, 400); d.category = body.category; }
      if (body.funding != null) { if (!FUNDING.includes(body.funding)) return json({ error: 'Bad funding' }, 400); d.funding = body.funding; }
      if (!Object.keys(d).length) return json({ error: 'Nothing to change' }, 400);
      decisions[id] = { ...decisions[id], ...d, at: new Date().toISOString() };
    }
    await writeJson(bucket, MONEY_KEYS.decisions, decisions);
    return json({ ok: true, id });
  }
  return json({ error: 'Unknown action' }, 400);
}

export const onRequest = ({ request, env }) => handleMoney({ request, env }).catch(e => json({ error: e.message || String(e) }, 500));
