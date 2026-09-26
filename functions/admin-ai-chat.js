// Cloudflare Pages Function — POST /admin-ai-chat
// The real "Ask GID" — a Claude-powered agent with tool access into the live
// Supabase data (leads, bookings, marketing_spend, business_settings). This
// replaces the deterministic keyword-matcher in admin-api-data.js's
// 'ask-gid' action with an actual conversational agent that can chain
// multiple lookups and hold a conversation.
//
// SAFETY: Every tool below only reads or makes small, explicit writes
// (updating a lead's status, logging a call, adding a spend entry, or
// updating a booking's date/time). Nothing deletes data. Nothing touches
// payments, customer identity fields, or signed jobs. If you add tools
// later, keep that boundary.
//
// Requires env var ANTHROPIC_API_KEY (console.anthropic.com). Costs are
// small — Haiku is roughly $1/million input tokens; a typical exchange
// with a handful of tool calls costs a fraction of a cent.
//
// Body: { messages: [{ role: 'user'|'assistant', content: string }], ... }
//   (send the last ~10 turns of conversation; this endpoint is stateless)
// Response: streamed newline-delimited JSON (NDJSON), one event per line:
//   { type: 'tool_call', tool: string, input: object }
//   { type: 'tool_result', tool: string, ok: boolean, error?: string }
//   { type: 'data', tool: string, payload: object }   — structured result, worth a real UI card
//   { type: 'final', text: string }
//   { type: 'error', message: string }
// A conversation with no tool calls just streams a single 'final' line.

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_TURNS = 6;

// Tools whose results are worth showing as a real card in the UI, not just
// summarized in Claude's prose. Anything not in this set (writes, and
// low-value lookups) only gets the text summary.
const PRESENTABLE_TOOLS = new Set([
  'search_customers', 'list_jobs', 'list_leads', 'list_calls',
  'list_marketing_spend', 'get_owner_pay_summary', 'get_business_summary',
  'pricing_history', 'get_tax_rate',
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `You are GID, Michael's personal business AI inside the GID Garage admin dashboard. Michael is the owner/operator of GID Garage, a mobile mechanic business in Flagstaff, Arizona. Speak to him like you know who he is and what he runs — never like a generic anonymous dashboard user. You have tools to look up and update real business data: customers, leads, jobs/bookings, marketing spend, calls, and business settings.

PERSONAL CONTEXT:
- The person using this assistant is Michael, the owner of GID Garage.
- GID Garage is a real mobile automotive repair business in Flagstaff, Arizona.
- Prioritize what helps Michael run the business: today's jobs, leads, missed calls, follow-ups, estimates, payments, marketing performance, take-home, and the next thing needing attention.
- When Michael says things like "catch me up", proactively use get_business_summary and give him the short owner-level briefing, not a generic explanation.
- Do not pretend to remember facts that are not in this prompt, the conversation, or tool results. If a personal/business fact is missing, say so briefly instead of inventing it.

RESPONSE STYLE — this is a small chat panel, not a report:
- 1-3 short sentences, plain conversational English. Never format a raw list of records as your answer (no pipe-separated fields, no numbered field dumps, no markdown tables). The interface already shows the detailed data separately — your job is the short human takeaway, e.g. "Found Jill Castle — 3 jobs on file, one tomorrow at 1pm ready to go" not a field-by-field printout.
- If there's genuinely nothing to say beyond the data (a plain lookup), one sentence pointing out what actually matters is enough.

CONFIRMING BEFORE ACTING — mark_job_paid and send_customer_email are real financial/external actions and are built to require confirmation:
- Call the tool WITHOUT confirmed=true first. It returns a summary instead of executing.
- State that summary to the person in plain language and ask them to confirm (e.g. "Mark Jill's job as paid in full for $762.46, no Stripe id yet — sound right?").
- Only call the tool again WITH confirmed=true after they clearly say yes in their next message. If they correct a detail instead, use the corrected value.
- Every other write tool (reschedule, status changes other than paid, lead status, logging a call, adding spend) is low-risk and easily fixed if wrong — just do it and confirm what you did afterward in one short sentence, no need to ask first.

Today's date context is provided in each request — use it for "today", "this week", "next Tuesday" type questions.`;

const TOOLS = [
  {
    name: 'get_business_summary',
    description: "Get today's stats, what needs attention (overdue follow-ups, unpaid invoices), lead conversion, marketing funnel by channel, and the next 7 days of schedule. Use this for broad questions like 'how are we doing' or 'what needs attention'.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_leads',
    description: "List leads, optionally filtered by status (new, contacted, quoted, booked, lost, no_response) or source (google_ads, meta_ads, facebook_organic, website_form, website_booking, referral, organic, other).",
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        source: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'update_lead_status',
    description: "Update a lead's status. Get the lead's id from list_leads first if you don't already have it.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        status: { type: 'string', description: 'new, contacted, quoted, booked, lost, or no_response' },
      },
      required: ['lead_id', 'status'],
    },
  },
  {
    name: 'list_jobs',
    description: 'List jobs/bookings, optionally filtered by customer, date range (YYYY-MM-DD), status, vehicle, or service keyword. To find a specific customer\'s jobs, use search_customers first to get their id, then pass it as customer_id here (more reliable than customer_name for anyone with a common name).',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: "A customer's id, from search_customers." },
        customer_name: { type: 'string', description: "Fallback if you don't have a customer_id yet — matches against the name on the job record." },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        job_status: { type: 'string', description: 'BOOKED, ESTIMATE_SENT, SIGNED, IN_PROGRESS, COMPLETED, INVOICED, or PAID' },
        vehicle: { type: 'string' },
        service_keyword: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'reschedule_job',
    description: 'Move a job to a new date and/or time. Get the job id from list_jobs first.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'pricing_history',
    description: "Check what's been charged in the past for a type of repair.",
    input_schema: {
      type: 'object',
      properties: {
        service_keyword: { type: 'string' },
        vehicle: { type: 'string' },
      },
      required: ['service_keyword'],
    },
  },
  {
    name: 'get_tax_rate',
    description: 'Get the current tax rate and overhead settings.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_marketing_spend',
    description: 'Log a marketing spend entry for a date/channel.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        channel: { type: 'string', description: 'google_ads, meta_ads, gbp, referral, organic, or other' },
        amount: { type: 'number' },
      },
      required: ['date', 'channel', 'amount'],
    },
  },
  {
    name: 'log_call',
    description: 'Log a phone call and its outcome.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        direction: { type: 'string', description: 'inbound or outbound' },
        outcome: { type: 'string', description: 'booked, quote_requested, price_shopper, no_answer, missed, spam, or other' },
        notes: { type: 'string' },
      },
      required: ['phone', 'outcome'],
    },
  },
  {
    name: 'list_calls',
    description: 'List recently logged calls, most recent first.',
    input_schema: {
      type: 'object',
      properties: {
        outcome: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'list_marketing_spend',
    description: 'List marketing spend entries, optionally filtered by channel, most recent first.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'search_customers',
    description: "Find a customer by name, phone, or VIN — returns their contact info and vehicle on file. For their job history, follow up with list_jobs.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Change a job\'s status in the pipeline (BOOKED, ESTIMATE_SENT, SIGNED, IN_PROGRESS, COMPLETED, or INVOICED). Do NOT use this to mark something paid — use mark_job_paid instead, which records the actual payment amount, not just a label.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        job_status: { type: 'string', description: 'BOOKED, ESTIMATE_SENT, SIGNED, IN_PROGRESS, COMPLETED, or INVOICED. Not PAID.' },
      },
      required: ['job_id', 'job_status'],
    },
  },
  {
    name: 'mark_job_paid',
    description: "Mark a job as paid in full, recording the actual amount collected (and a Stripe transaction id if you have one — optional, can be added later). This is a real financial record, not just a status label, so it requires confirmation: call this WITHOUT confirmed=true first to get a summary of what would happen, describe that summary to the person in plain language and ask them to confirm, then call again WITH confirmed=true only after they say yes.",
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        amount: { type: 'number', description: 'The amount actually collected.' },
        stripe_transaction_id: { type: 'string', description: 'Optional — can be left out and added later.' },
        confirmed: { type: 'boolean', description: 'Must be true to actually execute the write. Omit or set false to get a confirmation summary first.' },
      },
      required: ['job_id', 'amount'],
    },
  },
  {
    name: 'get_owner_pay_summary',
    description: "Estimate actual take-home for a period: collected revenue minus estimated tax reserve, Stripe fees, and prorated monthly overhead. Use for 'what did I actually make' type questions.",
    input_schema: {
      type: 'object',
      properties: { periodDays: { type: 'number', description: 'Defaults to 7 (this week).' } },
    },
  },
  {
    name: 'send_customer_email',
    description: "Send an email to a customer. This goes out for real and can't be unsent, so it requires confirmation: call this WITHOUT confirmed=true first to preview the recipient/subject/body, describe that to the person and ask them to confirm, then call again WITH confirmed=true only after they say yes.",
    input_schema: {
      type: 'object',
      properties: {
        to_email: { type: 'string' },
        to_name: { type: 'string' },
        subject: { type: 'string' },
        body_html: { type: 'string', description: 'Simple HTML — a paragraph or two is fine, e.g. "<p>Hi John, ...</p>"' },
        confirmed: { type: 'boolean', description: 'Must be true to actually send. Omit or set false to preview first.' },
      },
      required: ['to_email', 'subject', 'body_html'],
    },
  },
];

export async function onRequestPost({ request, env }) {
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessJwt) return json({ error: 'Unauthorized' }, 401);

  const anthropicKey = env.ANTHROPIC_API_KEY;
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  const brevoKey = env.BREVO_API_KEY;
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not set on the server' }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server not configured' }, 500);

  async function brevoSend(toEmail, toName, subject, htmlContent) {
    if (!brevoKey) throw new Error('BREVO_API_KEY not set on the server — email was not sent.');
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
        to: [{ email: toEmail, name: toName || toEmail }],
        subject,
        htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/><div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${htmlContent}</div><p style="color:#4b5563;font-size:11px;margin-top:24px;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div>`,
      }),
    });
    if (!r.ok) throw new Error(`Brevo rejected the email (${r.status}): ${await r.text()}`);
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const incomingMessages = Array.isArray(payload.messages) ? payload.messages.slice(-10) : [];
  if (!incomingMessages.length) return json({ error: 'Missing messages' }, 400);

  // ---- Tool implementations (direct Supabase REST, same pattern as admin-api-data.js) ----
  async function sbGet(table, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${base}/${table}?${qs}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async function sbPatch(table, filterParam, fields) {
    const res = await fetch(`${base}/${table}?${filterParam}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(await res.text());
  }
  async function sbInsert(table, row) {
    const res = await fetch(`${base}/${table}`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return rows[0] ?? null;
  }

  function money(n) { return n == null ? 'unknown' : `$${Number(n).toFixed(2)}`; }

  async function runTool(name, input) {
    switch (name) {
      case 'get_business_summary': {
        const now = new Date();
        const phoenixToday = now.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
        const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const nextWeekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
        const windowStart = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

        const [bookings, leads, spend] = await Promise.all([
          sbGet('bookings', { select: 'id,fname,lname,vehicle,date,time,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at', date: `gte.${weekStart}`, 'date.2': `lte.${nextWeekEnd}` }).catch(() => []),
          sbGet('leads', { select: '*', created_at: `gte.${windowStart}` }).catch(() => []),
          sbGet('marketing_spend', { select: '*', date: `gte.${windowStart}` }).catch(() => []),
        ]);
        const todaysJobs = bookings.filter(b => b.date === phoenixToday && b.status !== 'cancelled');
        const jobRev = b => (b.paid_at && b.amount_paid != null) ? Number(b.amount_paid) : Number(b.invoice_amount ?? b.estimate_amount ?? 0) + Number(b.tax_amount ?? 0);
        const todaysRevenue = todaysJobs.reduce((s, b) => s + jobRev(b), 0);
        const overdueLeads = leads.filter(l => {
          if (l.status === 'booked' || l.status === 'lost') return false;
          const ageMs = now.getTime() - new Date(l.created_at).getTime();
          const overdue = l.follow_up_at && new Date(l.follow_up_at).getTime() <= now.getTime();
          const stale = !l.last_contacted_at && ageMs > 2 * 86400000;
          return overdue || stale;
        });
        const unpaid = bookings.filter(b => b.job_status === 'INVOICED' && !b.paid_at && Number(b.invoice_amount || 0) > Number(b.amount_paid || 0));
        const totalSpend = spend.reduce((s, r) => s + Number(r.amount || 0), 0);
        const booked = leads.filter(l => l.status === 'booked').length;

        return {
          today: { date: phoenixToday, jobCount: todaysJobs.length, revenue: todaysRevenue },
          needsAttention: {
            overdueLeadFollowUps: overdueLeads.map(l => `${l.fname || ''} ${l.lname || ''}`.trim() || l.phone),
            unpaidInvoices: unpaid.map(b => ({ customer: `${b.fname || ''} ${b.lname || ''}`.trim(), owed: Number(b.invoice_amount || 0) - Number(b.amount_paid || 0) })),
          },
          leadsLast30Days: { total: leads.length, booked, conversionRatePct: leads.length ? Math.round((booked / leads.length) * 1000) / 10 : 0 },
          marketingLast30Days: { totalSpend, leadCount: leads.length },
        };
      }

      case 'list_leads': {
        const params = { select: '*', order: 'created_at.desc', limit: String(input.limit || 15) };
        if (input.status) params.status = `eq.${input.status}`;
        if (input.source) params.source = `eq.${input.source}`;
        return await sbGet('leads', params);
      }

      case 'update_lead_status': {
        await sbPatch('leads', `id=eq.${encodeURIComponent(input.lead_id)}`, { status: input.status, last_contacted_at: new Date().toISOString() });
        return { ok: true };
      }

      case 'list_jobs': {
        const params = { select: 'id,fname,lname,vehicle,service,date,time,job_status,estimate_amount,invoice_amount', order: 'date.desc', limit: String(input.limit || 15) };
        if (input.customer_id) params.customer_id = `eq.${input.customer_id}`;
        if (input.customer_name) {
          const words = input.customer_name.trim().split(/\s+/).filter(Boolean);
          if (words.length >= 2) {
            const first = words[0];
            const rest = words.slice(1).join(' ');
            params.and = `(fname.ilike.*${first}*,lname.ilike.*${rest}*)`;
          } else {
            params.or = `(fname.ilike.*${input.customer_name}*,lname.ilike.*${input.customer_name}*)`;
          }
        }
        if (input.date_from) params.date = `gte.${input.date_from}`;
        if (input.date_to) params['date.2'] = `lte.${input.date_to}`;
        if (input.job_status) params.job_status = `eq.${input.job_status.toUpperCase()}`;
        if (input.vehicle) params.vehicle = `ilike.*${input.vehicle}*`;
        if (input.service_keyword) params.service = `ilike.*${input.service_keyword}*`;
        return await sbGet('bookings', params);
      }

      case 'reschedule_job': {
        const fields = {};
        if (input.date) fields.date = input.date;
        if (input.time) fields.time = input.time;
        if (!Object.keys(fields).length) throw new Error('Need a date or time to reschedule to.');
        await sbPatch('bookings', `id=eq.${encodeURIComponent(input.job_id)}`, fields);
        return { ok: true };
      }

      case 'pricing_history': {
        const params = { select: 'vehicle,estimate_amount,invoice_amount,job_status', service: `ilike.*${input.service_keyword}*`, order: 'created_at.desc', limit: '20' };
        if (input.vehicle) params.vehicle = `ilike.*${input.vehicle}*`;
        const jobs = await sbGet('bookings', params);
        const amounts = jobs.map(j => Number(j.invoice_amount ?? j.estimate_amount ?? 0)).filter(n => n > 0);
        return {
          count: jobs.length,
          priceRange: amounts.length ? { min: money(Math.min(...amounts)), max: money(Math.max(...amounts)), avg: money(amounts.reduce((a, b) => a + b, 0) / amounts.length) } : null,
          samples: jobs.slice(0, 5).map(j => ({ vehicle: j.vehicle, price: money(j.invoice_amount ?? j.estimate_amount) })),
        };
      }

      case 'get_tax_rate': {
        const rows = await sbGet('business_settings', { select: '*', id: 'eq.default', limit: '1' });
        const s = rows[0] || {};
        return { taxRatePct: s.tax_rate != null ? Number(s.tax_rate) * 100 : null, monthlyOverhead: s.owner_monthly_overhead, stripeFeePct: s.owner_stripe_fee_pct != null ? Number(s.owner_stripe_fee_pct) * 100 : null };
      }

      case 'add_marketing_spend': {
        return await sbInsert('marketing_spend', { date: input.date, channel: input.channel, amount: input.amount });
      }

      case 'log_call': {
        return await sbInsert('calls', { phone: input.phone, direction: input.direction || 'inbound', outcome: input.outcome, notes: input.notes || null });
      }

      case 'list_calls': {
        const params = { select: '*', order: 'created_at.desc', limit: String(input.limit || 15) };
        if (input.outcome) params.outcome = `eq.${input.outcome}`;
        return await sbGet('calls', params);
      }

      case 'list_marketing_spend': {
        const params = { select: '*', order: 'date.desc', limit: String(input.limit || 20) };
        if (input.channel) params.channel = `eq.${input.channel}`;
        return await sbGet('marketing_spend', params);
      }

      case 'search_customers': {
        const q = (input.query || '').trim();
        const words = q.split(/\s+/).filter(Boolean);
        const orParts = [];
        if (words.length >= 2) {
          const first = words[0];
          const rest = words.slice(1).join(' ');
          orParts.push(`and(fname.ilike.*${first}*,lname.ilike.*${rest}*)`);
        }
        orParts.push(`fname.ilike.*${q}*`);
        orParts.push(`lname.ilike.*${q}*`);
        orParts.push(`phone.ilike.*${q}*`);
        orParts.push(`vin.ilike.*${q}*`);
        const params = { select: 'id,fname,lname,phone,email,vehicle,vin,notes', or: `(${orParts.join(',')})`, limit: '10' };
        return await sbGet('customers', params);
      }

      case 'update_job_status': {
        const status = String(input.job_status || '').toUpperCase();
        if (status === 'PAID') throw new Error("Don't use update_job_status for PAID — use mark_job_paid so the actual payment amount gets recorded, not just the label.");
        await sbPatch('bookings', `id=eq.${encodeURIComponent(input.job_id)}`, { job_status: status });
        return { ok: true };
      }

      case 'mark_job_paid': {
        const jobRows = await sbGet('bookings', { select: 'id,fname,lname,vehicle,job_status,invoice_amount,estimate_amount,amount_paid,paid_at', id: `eq.${input.job_id}` });
        const job = jobRows[0];
        if (!job) throw new Error('No job found with that id.');

        if (!input.confirmed) {
          return {
            needs_confirmation: true,
            summary: `Mark ${job.fname || ''} ${job.lname || ''}'s job (${job.vehicle || 'vehicle on file'}) as PAID for ${money(input.amount)}` +
              (input.stripe_transaction_id ? ` with Stripe transaction ${input.stripe_transaction_id} on file.` : ', with no Stripe transaction id yet — can be added later.') +
              (job.paid_at ? ` Note: this job already shows a payment recorded on ${job.paid_at}.` : ''),
          };
        }

        await sbPatch('bookings', `id=eq.${encodeURIComponent(input.job_id)}`, {
          job_status: 'PAID',
          amount_paid: input.amount,
          paid_at: new Date().toISOString(),
          ...(input.stripe_transaction_id ? { stripe_transaction_id: input.stripe_transaction_id } : {}),
        });
        return { ok: true, markedPaid: money(input.amount) };
      }

      case 'get_owner_pay_summary': {
        const days = input.periodDays || 7;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const [bookings, settingsRows] = await Promise.all([
          sbGet('bookings', { select: 'amount_paid,paid_at,invoice_amount,tax_amount', paid_at: `gte.${since}` }).catch(() => []),
          sbGet('business_settings', { select: '*', id: 'eq.default', limit: '1' }).catch(() => []),
        ]);
        const settings = settingsRows[0] || {};
        const grossCollected = bookings.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
        const stripeFeePct = Number(settings.owner_stripe_fee_pct ?? 0.0285);
        const taxReservePct = Number(settings.owner_tax_reserve_pct ?? 0.3);
        const monthlyOverhead = Number(settings.owner_monthly_overhead ?? 0);
        const estStripeFees = grossCollected * stripeFeePct;
        const estTaxReserve = grossCollected * taxReservePct;
        const proratedOverhead = (monthlyOverhead / 30) * days;
        const estimatedTakeHome = grossCollected - estStripeFees - estTaxReserve - proratedOverhead;
        return {
          periodDays: days,
          jobsPaid: bookings.length,
          grossCollected: money(grossCollected),
          estStripeFees: money(estStripeFees),
          estTaxReserve: money(estTaxReserve),
          proratedOverhead: money(proratedOverhead),
          estimatedTakeHome: money(estimatedTakeHome),
        };
      }

      case 'send_customer_email': {
        if (!input.confirmed) {
          return {
            needs_confirmation: true,
            summary: `Send an email to ${input.to_name || input.to_email} <${input.to_email}> with subject "${input.subject}".`,
          };
        }
        await brevoSend(input.to_email, input.to_name, input.subject, input.body_html);
        return { ok: true, sentTo: input.to_email };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ---- Claude agent loop, streamed as NDJSON so the frontend can show
  // ---- live progress (tool_call / tool_result / final) instead of a
  // ---- silent wait followed by one block of text.
  const todayCtx = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let messages = [
    ...incomingMessages.map(m => ({ role: m.role, content: m.content })),
  ];
  messages[messages.length - 1] = {
    ...messages[messages.length - 1],
    content: `[Today is ${todayCtx}]\n\n${messages[messages.length - 1].content}`,
  };

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  function send(obj) {
    return writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
  }

  // Run the agent loop in the background; the streamed response is
  // returned to the client immediately below, independent of this promise.
  (async () => {
    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const res = await fetch(CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          await send({ type: 'error', message: `Claude API error: ${detail}` });
          break;
        }
        const data = await res.json();

        const toolUseBlocks = (data.content || []).filter(b => b.type === 'tool_use');
        const textBlocks = (data.content || []).filter(b => b.type === 'text');

        if (!toolUseBlocks.length || data.stop_reason !== 'tool_use') {
          const replyText = textBlocks.map(b => b.text).join('\n').trim();
          await send({ type: 'final', text: replyText || "I don't have anything to add." });
          break;
        }

        messages.push({ role: 'assistant', content: data.content });
        const toolResults = [];
        for (const block of toolUseBlocks) {
          await send({ type: 'tool_call', tool: block.name, input: block.input || {} });
          let resultContent;
          try {
            const result = await runTool(block.name, block.input || {});
            resultContent = JSON.stringify(result);
            await send({ type: 'tool_result', tool: block.name, ok: true });
            if (PRESENTABLE_TOOLS.has(block.name) && result && !result.needs_confirmation) {
              await send({ type: 'data', tool: block.name, payload: result });
            }
          } catch (e) {
            resultContent = JSON.stringify({ error: e.message ?? String(e) });
            await send({ type: 'tool_result', tool: block.name, ok: false, error: e.message ?? String(e) });
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
        }
        messages.push({ role: 'user', content: toolResults });

        if (turn === MAX_TOOL_TURNS - 1) {
          await send({ type: 'final', text: 'That took more steps than I could finish in one go — try breaking it into a smaller question.' });
        }
      }
    } catch (err) {
      await send({ type: 'error', message: err.message ?? 'Unknown error' });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
