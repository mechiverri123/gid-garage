// Cloudflare Pages Function — POST /jarvis-business
// Deterministic business operations for the LiveKit voice agent
// (jarvis-agent/agent.py), so voice gives the same numbers and customer/job
// context as web and Telegram Jarvis instead of re-implementing the rules in
// Python. No LLM here: it runs one allowlisted operation and returns JSON.
//
// Auth: X-GID-Internal-Jarvis must equal TELEGRAM_WEBHOOK_SECRET (the same
// internal secret jarvis-telegram.js uses to call admin-ai-chat).
// Body: { action: string, args?: object }  ->  { ok: true, result } | { ok: false, error }

import { createBusinessOps } from './_lib/business-data.js';

const ACTIONS = {
  get_revenue_summary: (ops, a) => ops.revenueSummary({ period: a.period }),
  get_owner_pay_summary: (ops, a) => ops.ownerPaySummary({ period: a.period, periodDays: a.period_days ?? a.periodDays }),
  get_customer_context: (ops, a) => ops.customerContext({ query: a.query, customer_id: a.customer_id }),
  get_job_detail: (ops, a) => ops.jobDetail({ job_id: a.job_id }),
  get_action_center: ops => ops.actionCenter(),
  get_unpaid_jobs: ops => ops.unpaidSummary(),
  get_data_health: ops => ops.dataHealth(),
  get_business_summary: ops => ops.businessSummary(),
  get_owner_briefing: ops => ops.ownerBriefing(),
  // Confirmation-gated exactly like chat: without confirmed=true it only
  // returns the summary.
  mark_job_paid: (ops, a) => ops.recordPayment({
    job_id: a.job_id, amount: a.amount, method: a.method || 'Other',
    stripe_transaction_id: a.stripe_transaction_id || '', note: a.note || '', confirmed: a.confirmed === true,
  }),
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const secret = request.headers.get('X-GID-Internal-Jarvis');
  if (!env.TELEGRAM_WEBHOOK_SECRET || !secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: 'Server not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const run = ACTIONS[body?.action];
  if (!run) return json({ ok: false, error: `Unsupported action. Use one of: ${Object.keys(ACTIONS).join(', ')}` }, 400);

  const base = `${supabaseUrl}/rest/v1`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const sbGet = async (table, params) => {
    const res = await fetch(`${base}/${table}?${new URLSearchParams(params)}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const sbPatch = async (table, filter, fields) => {
    const res = await fetch(`${base}/${table}?${filter}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
    if (!res.ok) throw new Error(await res.text());
  };

  try {
    const result = await run(createBusinessOps({ sbGet, sbPatch }), body.args && typeof body.args === 'object' ? body.args : {});
    return json({ ok: true, result });
  } catch (e) {
    return json({ ok: false, error: e?.message || String(e) }, 200);
  }
}
