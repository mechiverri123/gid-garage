// Cloudflare Pages Function — POST /admin-ai-chat
// The real "Ask GID" — a Claude-powered agent with tool access into the live
// Supabase data (leads, bookings, marketing_spend, business_settings). This
// replaces the deterministic keyword-matcher in admin-api-data.js's
// 'ask-gid' action with an actual conversational agent that can chain
// multiple lookups and hold a conversation.
//
// SAFETY: Tools only read or make small, explicit, allowlisted writes (lead
// status, call/spend logs, reminders, notes, reschedule, pipeline status).
// Nothing deletes data. Payments (mark_job_paid) and customer email are
// confirmation-gated; the payment write uses the same append-and-reconcile
// rule as the dashboard (shared/business-rules.js planPayment). Numbers and
// customer/job context come from _lib/business-data.js, never model math.
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

import { createBusinessOps, cleanSearchText, writeResult } from './_lib/business-data.js';
import { planTurn, updateContext, guardFinalText } from './_lib/jarvis-context.js';
import { isLikelyNaturalBusinessNote, classifyFocusedIntent, focusedRoutingInstruction, INTENT_TOOL_NAMES } from './_lib/jarvis-intent.js';
import { ownerPaySettings } from '../shared/business-metrics.js';
import { SETTABLE_JOB_STATUSES, PAYMENT_METHODS, leadStatusUpdate, leadFollowUpReason, isValidYmd, isValidApptTime } from '../shared/business-rules.js';
import { jobEvidence } from '../shared/job-context.js';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_TURNS = 6;


// ---- Lead intelligence ----------------------------------------------------
// Lead forms are noisy human input. These helpers deliberately separate what
// the customer typed from what can actually be inferred safely.
function normalizeLeadText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeVehicle(value) {
  const s = normalizeLeadText(value);
  if (!s) return false;
  if (/\b(?:19|20)\d{2}\b/.test(s)) return true;
  const low = s.toLowerCase();
  return [
    'toyota','honda','ford','chevy','chevrolet','gmc','nissan','subaru','jeep',
    'dodge','ram','kia','hyundai','mazda','lexus','acura','bmw','mercedes','audi',
    'volkswagen','vw','tesla','buick','cadillac','chrysler','lincoln','mitsubishi'
  ].some(make => low.includes(make));
}

function classifyLeadService(...values) {
  const text = values.map(normalizeLeadText).join(' ').toLowerCase();
  const groups = [
    ['brakes', ['brake change','brake job','brakes','brake','pads','rotors']],
    ['oil', ['oil change','oil service']],
    ['diag', ['diagnostics','diagnostic','check engine','check-engine','diagnose']],
    ['suspension', ['suspension','struts','strut','shocks','shock','control arm']],
    ['audio', ['car audio','stereo','speakers','speaker','radio']],
    ['full', ['full service','maintenance','tune up','tune-up']],
  ];
  for (const [canonical, phrases] of groups) {
    const hit = phrases.find(p => text.includes(p));
    if (hit) return { service: canonical, evidence: hit };
  }
  return { service: null, evidence: null };
}

function issueQuality(value) {
  const raw = normalizeLeadText(value);
  const low = raw.toLowerCase();
  const vague = new Set([
    '', 'nothing', 'none', 'n/a', 'na', 'not sure', 'unsure',
    'nothing just going bad', 'just going bad', 'just needs work', 'needs work',
    'idk', "i don't know", 'dont know'
  ]);
  if (vague.has(low) || low.length < 5) return { usable: false, text: raw, reason: 'vague_or_missing' };
  return { usable: true, text: raw, reason: null };
}

function scheduleIntent(value) {
  const raw = normalizeLeadText(value);
  const low = raw.toLowerCase();
  const flexible = ['whenever','anytime','any time','asap','a.s.a.p','soonest','earliest','first available','next available'];
  if (flexible.some(x => low.includes(x))) {
    return { kind: 'earliest_available', customer_text: raw, booked: false };
  }
  if (!raw) return { kind: 'missing', customer_text: '', booked: false };
  return { kind: 'customer_preference', customer_text: raw, booked: false };
}

function parseRawLeadForm(rawInput) {
  const raw = normalizeLeadText(rawInput);
  const labels = [
    ['email', /\bEmail\s*:\s*/i],
    ['full_name', /\bFull\s*name\s*:\s*/i],
    ['issue', /\bWhat\s+issues\s+are\s+you\s+experiencing\s+with\s+your\s+vehicle\?\s*:\s*/i],
    ['phone', /\bPhone\s*number\s*:\s*/i],
    ['vehicle', /\bYear\s*\/\s*Make\s*\/\s*Model\s*\/\s*Engine\s*Size\?\s*:\s*/i],
    ['schedule', /\bWhat\s+Date\s*\/\s*Time\s+works\s+best\s+for\s+you\?\s*:\s*/i],
  ];
  const hits = [];
  for (const [key, pattern] of labels) {
    const m = pattern.exec(raw);
    if (m) hits.push({ key, start: m.index, valueStart: m.index + m[0].length });
  }
  hits.sort((a,b) => a.start - b.start);
  const fields = { email:'', full_name:'', issue:'', phone:'', vehicle:'', schedule:'' };
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const end = hits[i+1]?.start ?? raw.length;
    fields[h.key] = raw.slice(h.valueStart, end).trim().replace(/^[,;.-]+|[,;.-]+$/g, '').trim();
  }
  return fields;
}

function flattenLeadPayload(value, out = []) {
  if (Array.isArray(value)) for (const item of value) flattenLeadPayload(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) flattenLeadPayload(item, out);
  else if (value != null) {
    const s = normalizeLeadText(value);
    if (s) out.push(s);
  }
  return out;
}

function analyzeLeadFields({ fullName='', email='', phone='', vehicle='', issue='', schedule='', requestedService='', rawPayload=null }) {
  const flattened = flattenLeadPayload(rawPayload);
  const svc = classifyLeadService(requestedService, vehicle, issue, ...flattened);
  const vehicleValid = looksLikeVehicle(vehicle);
  const vehicleFieldService = classifyLeadService(vehicle).service;
  const misplacedService = Boolean(vehicle && vehicleFieldService && !vehicleValid);
  let recoveredVehicle = null;
  if (!vehicleValid) recoveredVehicle = flattened.find(looksLikeVehicle) || null;
  const issueInfo = issueQuality(issue);
  const sched = scheduleIntent(schedule);

  const parts = [];
  const who = normalizeLeadText(fullName) || 'This lead';
  if (svc.service) parts.push(`${who} appears to want ${svc.service} service.`);
  else parts.push(`${who} did not provide a clear service request.`);

  if (!(vehicleValid || recoveredVehicle)) {
    if (misplacedService) parts.push(`The vehicle field contains "${normalizeLeadText(vehicle)}", which looks like a service request rather than year/make/model/engine, so the vehicle information is missing.`);
    else parts.push('Vehicle information is missing.');
  }
  if (!issueInfo.usable) parts.push(`The issue answer "${issueInfo.text || 'blank'}" is too vague to treat as a usable symptom.`);
  if (sched.kind === 'earliest_available') parts.push(`The scheduling answer "${sched.customer_text}" means the customer is flexible and wants the earliest real opening; it is not a booked appointment.`);
  else if (sched.kind === 'customer_preference') parts.push(`The customer gave a scheduling preference of "${sched.customer_text}", but no appointment is booked yet.`);

  return {
    owner_analysis: parts.join(' '),
    customer: { name: who === 'This lead' ? null : who, email: email || null, phone: phone || null },
    interpreted: {
      service: svc.service,
      vehicle: vehicleValid ? normalizeLeadText(vehicle) : recoveredVehicle,
      issue: issueInfo,
      schedule: sched,
    },
    flags: [
      ...(misplacedService ? ['service_answer_found_in_vehicle_field'] : []),
      ...(!issueInfo.usable ? ['issue_answer_is_vague'] : []),
      ...(sched.kind === 'earliest_available' ? ['customer_is_schedule_flexible'] : []),
    ],
    missing_or_needs_clarification: [
      ...(!(vehicleValid || recoveredVehicle) ? ['vehicle'] : []),
      ...(!svc.service ? ['service'] : []),
      ...(!issueInfo.usable ? ['usable_issue_description'] : []),
    ],
  };
}

function isPastedLeadForm(text) {
  const low = String(text || '').toLowerCase();
  const markers = ['email:', 'full name:', 'phone number:', 'year/make/model/engine size?:', 'what date/time works best for you?:'];
  return markers.filter(m => low.includes(m)).length >= 3;
}

function ndjsonFinal(text, dataPayload = null) {
  const encoder = new TextEncoder();
  let body = '';
  if (dataPayload) body += JSON.stringify({ type: 'data', tool: 'analyze_lead', payload: dataPayload }) + '\n';
  body += JSON.stringify({ type: 'final', text }) + '\n';
  return new Response(encoder.encode(body), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

// Tools whose results are worth showing as a real card in the UI, not just
// summarized in Claude's prose. Anything not in this set (writes, and
// low-value lookups) only gets the text summary.
const PRESENTABLE_TOOLS = new Set([
  'search_customers', 'list_jobs', 'list_leads', 'list_calls',
  'list_marketing_spend', 'get_revenue_summary', 'get_owner_pay_summary', 'get_business_summary',
  'pricing_history', 'get_tax_rate', 'analyze_lead',
  'get_owner_briefing', 'get_action_center', 'list_reminders', 'list_lead_followups',
  'list_business_notes',
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Intent routing lives in _lib/jarvis-intent.js (tested). A focused intent only
// exposes its own tools for the turn.
function toolsForFocusedIntent(intent) {
  const names = INTENT_TOOL_NAMES[intent];
  if (!names) return null;
  const allowed = new Set(names);
  return TOOLS.filter(t => allowed.has(t.name));
}

const SYSTEM_PROMPT = `You are GID, the business assistant embedded in GID Garage's admin dashboard (a mobile mechanic business in Flagstaff, AZ). You have tools to look up and update real business data: customers, leads, jobs/bookings, marketing spend, calls, and business settings.

RESPONSE STYLE — this is a small chat panel, not a report:
- 1-3 short sentences, plain conversational English. Never format a raw list of records as your answer (no pipe-separated fields, no numbered field dumps, no markdown tables). The interface already shows the detailed data separately — your job is the short human takeaway, e.g. "Found Jill Castle — 3 jobs on file, one tomorrow at 1pm ready to go" not a field-by-field printout.
- If there's genuinely nothing to say beyond the data (a plain lookup), one sentence pointing out what actually matters is enough.
- FOCUS RULE: A specific request gets a specific answer. Never add a mini-briefing, reminder recap, lead recap, job recap, or other unrelated status to a focused request. Only broad requests such as 'brief me' or 'what needs my attention?' should combine multiple business areas.
- FINANCIAL DEFINITIONS: Revenue/gross/sales/collected means actual customer money collected and MUST use get_revenue_summary. Net profit means collected revenue minus sales tax collected minus parts cost and MUST use get_revenue_summary. Take-home/owner pay means net profit minus card fees minus prorated overhead minus the tax reserve (the Hub Owner Pay panel) and MUST use get_owner_pay_summary. Never call owner take-home "revenue" or "net profit". If the owner asks something ambiguous like "what did I actually make", call both tools for the same period and give both: dashboard net profit, and estimated take-home after fees/overhead/reserve.
- PERIOD DEFINITIONS: "this month" means the current Arizona calendar month. "past/last 30 days" means a rolling 30-day window. Do not treat those as the same period.
- NUMBERS COME FROM TOOLS: Never compute revenue, profit, balances, totals, counts, or dates yourself from raw rows. Quote the number a tool returned. If no tool returned it, say you don't have it.
- ESTIMATE/INVOICE AMOUNTS: *_total fields are customer-facing and include tax — quote those by default ("Richard's estimate is $409.11"). *_subtotal is pre-tax: only when the owner asks for the subtotal or the amount before tax.
- PERIOD DIFFERENCES: "which jobs make the difference", "where did that $X come from", "why is this month lower" → compare_revenue_periods and name the exact jobs, amounts and dates. Never say "likely", never estimate, never ask the owner to remember.

FACTS ONLY FROM THIS TURN'S RECORDS:
- Never state a customer, vehicle, VIN, mileage, appointment date/time, payment, diagnosis, scope, or outcome unless it appears in a tool result from THIS turn. Earlier chat messages are not evidence — if a fact isn't in a result above, look it up or say it isn't on file.
- [CONTEXT] notes in the user's message come from the server: they say which record "that", "her", "each one", or "yes" refers to, and usually include a fresh lookup of it. A name or vehicle in the current message always replaces the earlier subject.
- If you can't tell which record the owner means, ask one short question. Never guess.

WRITES — NEVER CLAIM WHAT DIDN'T HAPPEN:
- Only say done/saved/updated/cancelled/recorded/sent/changed after a write tool in THIS turn returned ok:true (verified:true). Report its "changed" values.
- If a write returned an error, or needs_confirmation, say exactly that — nothing was changed yet. The server replaces any unsupported success claim.
- To cancel a job use cancel_job (same as the admin "Mark as Cancelled"); it needs the owner's confirmation. Never "just note" a cancellation as if the job were cancelled.

JOBS & CUSTOMERS — ANSWER FROM THE EVIDENCE, NOT THE CATEGORY:
- The service field is only a category (often "other"). What a job was actually about lives in its evidence: scopeOfWork (the "Scope of Work" on the estimate/invoice), technicianNotes, lineItems, bookingRequest (booking-form selections + the customer's own words), inspection (trouble codes with the tech's plan, tire readings), preExistingDamage, priceAdjustment.
- For "what were X's jobs about", "what did we do", "last visit", "what was wrong", "what did we diagnose", "recommendations", "what did I tell X", or "summarize X's history", call get_customer_context. For one specific job, call get_job_detail. Never describe a job as just its category when evidence exists.
- FACT vs INFERENCE: state stored facts plainly. When you interpret (e.g. calling a job "primarily a front-brake job" from its line items), make the basis clear in natural words ("based on the scope of work…"). Never invent a diagnosis, part, recommendation, vehicle, or outcome that isn't in the evidence.
- GAPS & CONFLICTS: if a job's gaps say evidence is missing, say what's missing rather than filling it in. If sources disagree (see hints), say what each source says; don't silently pick one.
- WHO: if get_customer_context returns status "ambiguous", ask one short question naming the candidates (e.g. "Jill Castle or Jill Moreno?"). If "not_found", say so. Use the conversation only to work out who/which job "her", "that job", or "the Ranger" means; the facts always come from a fresh tool call, never from earlier chat.
- Owner notes carry a match field: full_name/phone are solid; first_name_only means it may be a different person — say so if it matters.
- Customer history answers: say how many jobs, then what each (or the relevant one) was actually about in plain words, oldest to newest or newest first as fits the question, plus anything still open (balance, estimate awaiting approval, open note/reminder). Keep it to a few sentences unless asked for detail. Mention money only if asked.

CONFIRMING BEFORE ACTING — mark_job_paid (records a payment) and send_customer_email are real financial/external actions and are built to require confirmation:
- Call the tool WITHOUT confirmed=true first. It returns a summary instead of executing.
- State that summary to the person in plain language and ask them to confirm (e.g. "Record $762.46 cash on Jill's job — that pays it off and marks it PAID. Sound right?"). If the tool refuses (duplicate, over the balance, no invoice yet, history mismatch), tell the owner why; do not try to work around it.
- Only call the tool again WITH confirmed=true after they clearly say yes in their next message. If they correct a detail instead, use the corrected value.
- Every other write tool (reschedule, status changes other than paid, lead status, logging a call, adding spend) is low-risk and easily fixed if wrong — just do it and confirm what you did afterward in one short sentence, no need to ask first.

LEAD INTELLIGENCE:
- Lead-form fields are noisy human input, not trusted schema. A customer may put a service in the vehicle field or give vague/non-diagnostic text in the issue field.
- When discussing a stored lead, use analyze_lead before drawing conclusions. Never invent missing vehicle details.
- Phrases like whenever/anytime/ASAP mean flexible scheduling or earliest available; they do not mean an appointment is booked.
- Do not claim a pasted lead is in the system, just came through, or will be contacted unless a tool actually confirms or performs that action.

OWNER ASSISTANT BEHAVIOR:
- For "brief me", "what's going on today", or "what does tomorrow look like", use get_owner_briefing.
- For "what needs my attention", "what should I handle next", "action center", or similar prioritization requests, use get_action_center. It returns a deterministic ranked queue from real reminders, lead follow-ups, unpaid balances, jobs, stale job statuses, and captured owner notes, plus waiting_on (estimates awaiting approval, balances owed, quoted leads, tentative owner notes) and tomorrow_blockers (tomorrow's jobs missing time/vehicle/phone/address or with an unapproved estimate). Report its order; don't invent priorities.
- For "what am I waiting on" use waiting_on; for "who should I contact next" use the queue order of lead follow-ups and people owing money; for "what's blocking tomorrow" use tomorrow_blockers. For "next action for <person>", use get_customer_context and its openItems.
- When Michael asks a specific question about one area (for example lead follow-ups, reminders, jobs, customers, or revenue), stay on that area. Do not prepend unrelated reminders, briefing items, or other business status unless they are directly necessary to answer the question.
- NATURAL NOTE CAPTURE: When Michael gives an operational note such as "Jake called, 2013 F150, grinding front brakes, maybe Friday, quoted 350", use capture_business_note. Save only facts explicitly stated. Never invent a last name, phone, email, engine, exact appointment, or diagnostic conclusion. A note is NOT a customer, lead, booking, quote, or completed contact record unless a separate tool confirms/creates that record.
- If a note clearly contains a future owner action (for example "call him Friday"), capture the note and create a reminder only when Michael explicitly asks to be reminded or clearly states that he needs to do that action at a specific time. Do not turn vague timing like "maybe Friday" into a reminder or appointment.
- Use list_business_notes to recall captured operational notes and resolve_business_note only when Michael says the item is handled/resolved.
- Reminders are private owner tasks, not customer appointments. create_reminder may create them without confirmation. Never convert flexible customer scheduling language into a booking.
- For lead follow-up questions, use list_lead_followups. A lead needing attention does not mean the customer was contacted.
- When Michael reports that he called/texted/spoke with a lead, use log_lead_contact so last_contacted_at and notes stay accurate. Only set a future follow-up when he asks for one or clearly states one.
- Times for reminders/follow-ups are Flagstaff/Phoenix local time (America/Phoenix, UTC-07:00).
- CRITICAL: For relative reminders like 'in 2 minutes', 'in 3 hours', or 'in 2 days', NEVER calculate a clock time yourself. Use create_reminder with due_in_minutes (2 minutes = 2, 3 hours = 180, 2 days = 2880). Use due_at_local only when Michael gives a calendar/clock time like 'tomorrow at 9 AM' or 'Friday at 3'.

Today's date context is provided in each request — use it for "today", "this week", "next Tuesday" type questions.`;

const TOOLS = [
  {
    name: 'get_business_summary',
    description: "Broad 'how are we doing' snapshot: today's job count, today's booked value (NOT revenue) and money actually collected today, lead follow-ups, unpaid balances, 30-day lead conversion and marketing spend. For revenue use get_revenue_summary; for attention/prioritizing use get_action_center.",
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
    name: 'analyze_lead',
    description: "Deterministically analyze one stored lead by id. Use this after list_leads when Michael asks what a lead actually means, especially for Meta/Facebook form leads with answers in the wrong fields or vague answers.",
    input_schema: {
      type: 'object',
      properties: { lead_id: { type: 'string' } },
      required: ['lead_id'],
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
    name: 'get_owner_briefing',
    description: "Compact owner briefing: today's and tomorrow's jobs, reminders due, leads needing follow-up, unpaid balances, tomorrow's blockers, and money collected in the last 7 days. Use for 'brief me', 'what's going on today', 'what does tomorrow look like'.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_reminder',
    description: "Create a private owner reminder/task. For relative requests such as 'in 2 minutes' or 'in 3 hours', use due_in_minutes so the server calculates from the real current time. For explicit calendar times, use due_at_local in Flagstaff/Phoenix local time (YYYY-MM-DDTHH:mm). This is not a customer appointment and does not contact anyone.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due_at_local: { type: 'string', description: 'Use only for explicit calendar/clock times. America/Phoenix local time, YYYY-MM-DDTHH:mm' },
        due_in_minutes: { type: 'number', description: 'Use for relative times. Examples: in 2 minutes = 2, in 3 hours = 180, in 2 days = 2880.' },
        notes: { type: 'string' },
        related_lead_id: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_reminders',
    description: "List owner reminders. scope can be today, overdue, upcoming, open, or done. Defaults to open.",
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'today, overdue, upcoming, open, or done' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'complete_reminder',
    description: "Mark an owner reminder complete. Get its id from list_reminders first if needed.",
    input_schema: {
      type: 'object',
      properties: { reminder_id: { type: 'string' } },
      required: ['reminder_id'],
    },
  },
  {
    name: 'cleanup_test_reminders',
    description: "Mark obvious reminder-system test reminders complete so they stop cluttering Jarvis. Only affects open reminders whose titles clearly look like test reminders; never touches normal business reminders.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_lead_followups',
    description: "List leads that need owner attention. scope can be needs_attention, overdue, due_today, uncontacted, or upcoming. Defaults to needs_attention. This reads the real leads table and does not imply contact happened.",
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'needs_attention, overdue, due_today, uncontacted, or upcoming' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'set_lead_followup',
    description: "Set or change a lead's follow-up time. follow_up_at_local is Flagstaff/Phoenix local time in YYYY-MM-DDTHH:mm. Does not mark the lead contacted.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        follow_up_at_local: { type: 'string', description: 'America/Phoenix local time, YYYY-MM-DDTHH:mm' },
      },
      required: ['lead_id', 'follow_up_at_local'],
    },
  },
  {
    name: 'log_lead_contact',
    description: "Record that Michael actually contacted/spoke with a lead. Updates last_contacted_at, can append notes, optionally change status, and optionally set the next follow-up. Use only when Michael says contact really happened.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', description: 'Optional: new, contacted, quoted, booked, lost, or no_response' },
        follow_up_at_local: { type: 'string', description: 'Optional America/Phoenix local time, YYYY-MM-DDTHH:mm' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'get_action_center',
    description: "Deterministic ranked owner queue from real data: due reminders, lead follow-ups, unpaid balances, today's unfinished jobs, past appointments still in a pre-service status, and owner notes with actions. Also returns waiting_on (estimates awaiting approval, balances owed, quoted leads, tentative owner notes) and tomorrow_blockers. Use for 'what needs my attention', 'what am I waiting on', 'who should I contact next', 'what's blocking tomorrow'.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_customer_context',
    description: "Full history for ONE customer: resolves who they are (by name, phone, or customer_id), then returns every job as labeled evidence (scope of work, technician notes, line items, booking request, inspection codes, money, gaps), plus their leads, calls, owner notes, open reminders, open items (balances, estimates awaiting approval) and last interaction. Use for what someone's jobs were about, service history, last visit, what was wrong/diagnosed/recommended, what the owner told them, or next action for them. Returns status 'ambiguous' with candidates when more than one person matches.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Customer name (e.g. 'Jill Castle') or phone number." },
        customer_id: { type: 'string', description: 'Use when you already have it from an earlier result.' },
      },
    },
  },
  {
    name: 'get_job_detail',
    description: "Everything stored on ONE job: scope of work, technician notes, line items, booking request, inspection (trouble codes + plan, tires), pre-existing damage, price adjustment, photo notes, parts receipts, payment history, money and gaps. Use for 'what did we do on that job', 'what parts', 'why was the quote so high', 'what was wrong'.",
    input_schema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
  {
    name: 'get_vehicle_jobs',
    description: "Jobs on a vehicle, newest first, with full evidence (who, date, VIN, mileage, scope, technician/photo notes). Use for 'the last Ranger job', 'the Blazer', 'the 2011 F-150'. Optional customer narrows it.",
    input_schema: {
      type: 'object',
      properties: { vehicle: { type: 'string' }, customer: { type: 'string' } },
      required: ['vehicle'],
    },
  },
  {
    name: 'get_result_set_details',
    description: "Re-read the records from the previous answer's list (leads, jobs, or notes) by id — for 'each one', 'those', 'all of them'. Leads include their follow-up reason.",
    input_schema: {
      type: 'object',
      properties: { type: { type: 'string', description: 'leads, jobs, or notes' }, ids: { type: 'array', items: { type: 'string' } } },
      required: ['type', 'ids'],
    },
  },
  {
    name: 'cancel_job',
    description: "Cancel a job exactly like the admin 'Mark as Cancelled' button (job_status CANCELLED + status cancelled; nothing deleted). Optional reason is saved as a Jarvis note on the job. Requires confirmation: call WITHOUT confirmed=true first, relay the summary, then call WITH confirmed=true only after the owner says yes. Refuses PAID or already-cancelled jobs.",
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        reason: { type: 'string', description: 'e.g. "customer cancelled"' },
        confirmed: { type: 'boolean' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'reopen_job',
    description: "Reopen a cancelled job back to BOOKED, exactly like the admin 'Reopen Job' button. Requires confirmation like cancel_job.",
    input_schema: {
      type: 'object',
      properties: { job_id: { type: 'string' }, confirmed: { type: 'boolean' } },
      required: ['job_id'],
    },
  },
  {
    name: 'get_unpaid_jobs',
    description: "Canonical unpaid list: COMPLETED or INVOICED jobs (not PAID, not cancelled) with a balance, balance = invoice (or estimate if not invoiced yet) + tax − amount paid. Same set as the dashboard's Unpaid / Due. Use for 'who owes me', 'unpaid invoices', 'outstanding balances'.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_data_health',
    description: "Read-only data consistency check: PAID jobs with no paid date or amount, payment history that disagrees with amount paid, overpaid jobs, fully-paid jobs not marked PAID, PAID jobs with a balance, past appointments still BOOKED/ESTIMATE_SENT/SIGNED, booked leads with no booking, reminders never delivered, duplicate customer phones. Changes nothing.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'capture_business_note',
    description: "Capture a messy owner/business note without modifying customers, leads, bookings, or payments. Extract only details Michael explicitly stated. Use for notes like 'Jake called, 2013 F150, grinding front brakes, maybe Friday, quoted 350'.",
    input_schema: {
      type: 'object',
      properties: {
        raw_text: { type: 'string', description: 'The original note/message, preserved as stated.' },
        summary: { type: 'string', description: 'Short factual summary; no invented details.' },
        contact_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        vehicle: { type: 'string' },
        service: { type: 'string' },
        quoted_amount: { type: 'number' },
        preferred_timing: { type: 'string', description: 'Keep vague timing vague, e.g. maybe Friday.' },
        action_needed: { type: 'string', description: 'Explicit next action only; omit if none is stated.' },
        due_at_local: { type: 'string', description: 'Only if Michael explicitly states a concrete owner-action date/time. America/Phoenix YYYY-MM-DDTHH:mm.' },
      },
      required: ['raw_text', 'summary'],
    },
  },
  {
    name: 'list_business_notes',
    description: "List Jarvis-captured owner/business notes. scope can be open, resolved, due, or all. These are scratch/operational notes, not customer or booking records.",
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'open, resolved, due, or all' },
        query: { type: 'string', description: 'Optional text to search across summary, person, vehicle, service, and raw note.' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'resolve_business_note',
    description: "Mark a captured Jarvis business note resolved. This only resolves the scratch note; it does not change a lead, customer, booking, payment, or reminder.",
    input_schema: {
      type: 'object',
      properties: { note_id: { type: 'string' } },
      required: ['note_id'],
    },
  },
  {
    name: 'list_jobs',
    description: 'List jobs/bookings, optionally filtered by customer, date range (YYYY-MM-DD), status, vehicle, or service keyword. Each job includes a short `about` line built from its scope of work / line items / notes. For what a customer\'s jobs were actually about or their history, use get_customer_context; for one job in depth, get_job_detail.',
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
    description: "Find people by name or phone across customers, bookings, leads and owner notes (a customers row is not required — e.g. a job booked under just 'Red'). Returns who matched and where. For what their jobs were about, VINs, mileage etc. use get_customer_context.",
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
    description: "Record a payment the customer actually made, exactly like the dashboard's Record a Payment: it's added to the job's payment history and amount paid, and the job becomes PAID only when invoice + tax is fully covered (otherwise it shows the remaining balance). Refuses duplicates, amounts over the balance, jobs with no invoice yet, and jobs whose payment history disagrees with amount paid. Sends no email. Requires confirmation: call WITHOUT confirmed=true first, relay the summary, and call again WITH confirmed=true only after the owner says yes.",
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        amount: { type: 'number', description: 'The amount actually collected in this payment.' },
        method: { type: 'string', description: `One of: ${PAYMENT_METHODS.join(', ')}. Defaults to Other.` },
        note: { type: 'string', description: 'Optional short note, e.g. "paid at pickup".' },
        stripe_transaction_id: { type: 'string', description: 'Optional — can be left out and added later.' },
        confirmed: { type: 'boolean', description: 'Must be true to actually execute the write. Omit or set false to get a confirmation summary first.' },
      },
      required: ['job_id', 'amount'],
    },
  },
  {
    name: 'get_revenue_summary',
    description: "Get actual collected revenue and dashboard-style net profit for a time period. Use for revenue, gross sales, money collected, sales, or net profit questions. This matches the Schedule dashboard revenue logic, including individual payment entries and the paid-invoice fallback when payment logs are incomplete.",
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: "One of: today, this_month, last_month, this_year, last_7_days, last_30_days, or last_N_days (e.g. last_90_days). this_week means the last 7 days. Use last_30_days for 'past 30 days' and this_month for 'this month' — they are different periods."
        },
        include_contributions: { type: 'boolean', description: 'true to also list each job that contributed (customer, vehicle, payment dates, amounts).' },
      },
      required: ['period'],
    },
  },
  {
    name: 'compare_revenue_periods',
    description: "Exact job-by-job comparison of collected revenue and net profit between two periods. Returns every job whose contribution differs, with customer, vehicle, payment dates and amounts; the differences add up exactly to the total gap. Use for 'which jobs make the difference', 'where did that $X come from', 'why is this month lower than the last 30 days'.",
    input_schema: {
      type: 'object',
      properties: {
        period_a: { type: 'string', description: 'First period, e.g. this_month.' },
        period_b: { type: 'string', description: 'Second period, e.g. last_30_days.' },
      },
      required: ['period_a', 'period_b'],
    },
  },
  {
    name: 'get_owner_pay_summary',
    description: "Estimate owner take-home, same formula as the Hub Owner Pay panel: net profit minus card fees minus prorated overhead, minus the tax reserve. Use ONLY for take-home/owner-pay/after-fees-and-reserve questions, not for revenue or dashboard net profit.",
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: "Same values as get_revenue_summary. Defaults to last_30_days (what the Owner Pay panel shows)." },
        periodDays: { type: 'number', description: 'Legacy: rolling window in days. Prefer period.' },
      },
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
  const internalJarvisSecret = request.headers.get('X-GID-Internal-Jarvis');
  const trustedInternalJarvis = Boolean(
    env.TELEGRAM_WEBHOOK_SECRET &&
    internalJarvisSecret &&
    internalJarvisSecret === env.TELEGRAM_WEBHOOK_SECRET
  );
  if (!accessJwt && !trustedInternalJarvis) return json({ error: 'Unauthorized' }, 401);

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

  // Pasted Meta/Facebook lead forms bypass Claude entirely. This prevents the
  // model from inventing database status, vehicle details, or next actions.
  const latestUserMessage = [...incomingMessages].reverse().find(m => m?.role === 'user');
  const latestUserText = typeof latestUserMessage?.content === 'string' ? latestUserMessage.content : '';
  const forceNaturalNoteCapture = isLikelyNaturalBusinessNote(latestUserText);
  const focusedIntent = forceNaturalNoteCapture ? null : classifyFocusedIntent(latestUserText);
  if (isPastedLeadForm(latestUserText)) {
    const fields = parseRawLeadForm(latestUserText);
    const analysis = analyzeLeadFields({
      fullName: fields.full_name,
      email: fields.email,
      phone: fields.phone,
      vehicle: fields.vehicle,
      issue: fields.issue,
      schedule: fields.schedule,
      rawPayload: fields,
    });
    return ndjsonFinal(analysis.owner_analysis, analysis);
  }

  // ---- Tool implementations (direct Supabase REST, same pattern as admin-api-data.js) ----
  async function sbGet(table, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${base}/${table}?${qs}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  // Returns the updated rows (return=representation) so every write can be
  // verified — a PATCH matching nothing returns [] with HTTP 200.
  async function sbPatch(table, filterParam, fields) {
    const res = await fetch(`${base}/${table}?${filterParam}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  async function sbInsert(table, row) {
    const res = await fetch(`${base}/${table}`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.[0]?.id) throw new Error(`Insert into ${table} was not confirmed by the database.`);
    return rows[0];
  }

  function money(n) { return n == null ? 'unknown' : `$${Number(n).toFixed(2)}`; }

  // Deterministic business operations (shared with the voice endpoint).
  const ops = createBusinessOps({ sbGet, sbPatch, sbInsert });

  function phoenixParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(p => [p.type, p.value]));
  }

  function phoenixDateString(date = new Date()) {
    const p = phoenixParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function addPhoenixDays(yyyyMmDd, days) {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return dt.toISOString().slice(0, 10);
  }

  function phoenixLocalToIso(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
      throw new Error('Time must be YYYY-MM-DDTHH:mm in Flagstaff/Phoenix local time.');
    }
    const dt = new Date(`${raw}:00-07:00`);
    if (Number.isNaN(dt.getTime())) throw new Error('Invalid local date/time.');
    return dt.toISOString();
  }

  function localDayBoundsIso(yyyyMmDd) {
    return {
      start: new Date(`${yyyyMmDd}T00:00:00-07:00`).toISOString(),
      end: new Date(`${addPhoenixDays(yyyyMmDd, 1)}T00:00:00-07:00`).toISOString(),
    };
  }

  async function runTool(name, input) {
    switch (name) {
      case 'get_business_summary':
        return await ops.businessSummary();

      case 'list_leads': {
        const params = { select: '*', order: 'created_at.desc', limit: String(input.limit || 15) };
        if (input.status) params.status = `eq.${input.status}`;
        if (input.source) params.source = `eq.${input.source}`;
        return await sbGet('leads', params);
      }

      case 'analyze_lead': {
        const rows = await sbGet('leads', { select: '*', id: `eq.${input.lead_id}`, limit: '1' });
        const lead = rows[0];
        if (!lead) throw new Error('No lead found with that id.');

        const raw = lead.raw_payload || {};
        const rawFields = raw.field_data && Array.isArray(raw.field_data)
          ? Object.fromEntries(raw.field_data.map(f => [String(f.name || '').toLowerCase(), Array.isArray(f.values) ? f.values[0] : f.values]))
          : raw;
        const values = flattenLeadPayload(rawFields);

        const fullName = `${lead.fname || ''} ${lead.lname || ''}`.trim();
        const issue = lead.notes || values.find(v => /nothing|noise|grind|vibrat|leak|light|problem|issue|going bad/i.test(v)) || '';
        const schedule = values.find(v => /whenever|any\s*time|asap|soonest|earliest|available|\b(?:am|pm)\b/i.test(v)) || '';

        return analyzeLeadFields({
          fullName,
          email: lead.email,
          phone: lead.phone,
          vehicle: lead.vehicle || '',
          issue,
          schedule,
          requestedService: lead.requested_service || '',
          rawPayload: raw,
        });
      }

      case 'update_lead_status': {
        // Only 'contacted'/'quoted' stamp last_contacted_at — marking a lead
        // lost or booked is not a contact.
        const rows = await sbGet('leads', { select: 'id,status,last_contacted_at', id: `eq.${input.lead_id}`, limit: '1' });
        if (!rows[0]) throw new Error('No lead found with that id.');
        const fields = leadStatusUpdate(input.status);
        await ops.patch('leads', input.lead_id, fields);
        return writeResult('lead', input.lead_id, rows[0], fields);
      }

      case 'get_owner_briefing':
        return await ops.ownerBriefing();

      case 'create_reminder': {
        const title = String(input.title || '').trim();
        if (!title) throw new Error('Reminder title is required.');

        let dueAt;
        if (input.due_in_minutes != null) {
          const minutes = Number(input.due_in_minutes);
          if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 525600) {
            throw new Error('due_in_minutes must be between 1 and 525600.');
          }
          // Relative reminders are anchored to the server's real current time,
          // so the model never has to guess the current clock time.
          dueAt = new Date(Date.now() + Math.round(minutes * 60000)).toISOString();
        } else if (input.due_at_local) {
          dueAt = phoenixLocalToIso(input.due_at_local);
        } else {
          throw new Error('Reminder time is required. Use due_in_minutes for relative reminders or due_at_local for a specific calendar time.');
        }

        const reminder = await sbInsert('jarvis_reminders', {
          title: title.slice(0, 240),
          notes: input.notes ? String(input.notes).slice(0, 4000) : null,
          due_at: dueAt,
          status: 'open',
          related_lead_id: input.related_lead_id ? String(input.related_lead_id) : null,
        });
        return { ok: true, verified: true, entity: 'reminder', id: reminder.id, title: reminder.title, due_at: reminder.due_at };
      }

      case 'list_reminders': {
        const scope = String(input.scope || 'open').toLowerCase();
        const limit = Math.min(Math.max(Number(input.limit || 20), 1), 100);
        const today = phoenixDateString();
        const bounds = localDayBoundsIso(today);
        const nowIso = new Date().toISOString();
        const params = { select: 'id,title,notes,due_at,status,completed_at,related_lead_id,created_at', order: 'due_at.asc', limit: String(limit) };
        if (scope === 'done') {
          params.status = 'eq.done';
          params.order = 'completed_at.desc';
        } else {
          params.status = 'eq.open';
        }
        let rows = await sbGet('jarvis_reminders', params);
        if (scope === 'today') rows = rows.filter(r => r.due_at >= bounds.start && r.due_at < bounds.end);
        else if (scope === 'overdue') rows = rows.filter(r => r.due_at < nowIso);
        else if (scope === 'upcoming') rows = rows.filter(r => r.due_at >= nowIso);
        return rows.slice(0, limit);
      }

      case 'complete_reminder': {
        const rows = await sbGet('jarvis_reminders', { select: 'id,title,status', id: `eq.${input.reminder_id}`, limit: '1' });
        const reminder = rows[0];
        if (!reminder) throw new Error('No reminder found with that id.');
        if (reminder.status === 'done') return { ok: true, already_done: true, title: reminder.title };
        const nowIso = new Date().toISOString();
        await ops.patch('jarvis_reminders', input.reminder_id, { status: 'done', completed_at: nowIso, updated_at: nowIso });
        return writeResult('reminder', input.reminder_id, reminder, { status: 'done' }, { title: reminder.title });
      }

      case 'cleanup_test_reminders': {
        const rows = await sbGet('jarvis_reminders', {
          select: 'id,title,status,notified_at,due_at,created_at',
          status: 'eq.open',
          order: 'created_at.desc',
          limit: '200',
        });
        const testPattern = /\b(test proactive reminders?|test automatic(?: delivery| reminders?)?|test jarvis(?: again)?|test reminders?|confirm automatic reminders? work|confirm automatic reminders?|automatic reminders? test)\b/i;
        const matches = rows.filter(r => testPattern.test(String(r.title || '')));
        const nowIso = new Date().toISOString();
        const done = [];
        for (const r of matches) {
          await ops.patch('jarvis_reminders', r.id, { status: 'done', completed_at: nowIso, updated_at: nowIso });
          done.push(r.title);
        }
        return { ok: true, verified: true, completed_count: done.length, titles: done };
      }

      case 'list_lead_followups': {
        const scope = String(input.scope || 'needs_attention').toLowerCase();
        const limit = Math.min(Math.max(Number(input.limit || 20), 1), 100);
        const active = await sbGet('leads', { select: 'id,created_at,fname,lname,phone,email,vehicle,requested_service,status,follow_up_at,last_contacted_at,notes', status: 'not.in.(booked,lost)', order: 'created_at.desc', limit: '500' });
        const now = new Date();
        const nowMs = now.getTime();
        const bounds = localDayBoundsIso(phoenixDateString(now));
        // needs_attention uses the one shared follow-up rule (shared/business-rules.js).
        const filtered = active.filter(l => {
          const followMs = l.follow_up_at ? new Date(l.follow_up_at).getTime() : null;
          if (scope === 'overdue') return followMs != null && followMs < nowMs;
          if (scope === 'due_today') return l.follow_up_at && l.follow_up_at >= bounds.start && l.follow_up_at < bounds.end;
          if (scope === 'uncontacted') return !l.last_contacted_at;
          if (scope === 'upcoming') return followMs != null && followMs >= nowMs;
          return Boolean(leadFollowUpReason(l, now));
        });
        return filtered
          .sort((a, b) => {
            const av = a.follow_up_at ? new Date(a.follow_up_at).getTime() : new Date(a.created_at).getTime();
            const bv = b.follow_up_at ? new Date(b.follow_up_at).getTime() : new Date(b.created_at).getTime();
            return av - bv;
          })
          .slice(0, limit);
      }

      case 'set_lead_followup': {
        const dueAt = phoenixLocalToIso(input.follow_up_at_local);
        const rows = await sbGet('leads', { select: 'id,fname,lname,status,follow_up_at', id: `eq.${input.lead_id}`, limit: '1' });
        if (!rows[0]) throw new Error('No lead found with that id.');
        await ops.patch('leads', input.lead_id, { follow_up_at: dueAt, updated_at: new Date().toISOString() });
        return writeResult('lead', input.lead_id, rows[0], { follow_up_at: dueAt }, { lead: `${rows[0].fname || ''} ${rows[0].lname || ''}`.trim() });
      }

      case 'log_lead_contact': {
        const rows = await sbGet('leads', { select: 'id,fname,lname,status,notes,last_contacted_at,follow_up_at', id: `eq.${input.lead_id}`, limit: '1' });
        const lead = rows[0];
        if (!lead) throw new Error('No lead found with that id.');
        const fields = { last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (input.status) fields.status = leadStatusUpdate(input.status).status;
        if (input.follow_up_at_local) fields.follow_up_at = phoenixLocalToIso(input.follow_up_at_local);
        if (input.notes) {
          const stamp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
          const appended = `[${stamp}] ${String(input.notes).trim()}`;
          fields.notes = lead.notes ? `${lead.notes}\n${appended}`.slice(0, 12000) : appended.slice(0, 12000);
        }
        await ops.patch('leads', input.lead_id, fields);
        const { notes: _n, ...shown } = fields;
        return writeResult('lead', input.lead_id, lead, shown, { lead: `${lead.fname || ''} ${lead.lname || ''}`.trim(), notesAppended: Boolean(input.notes) });
      }


      case 'get_action_center':
        return await ops.actionCenter();

      case 'get_customer_context':
        return await ops.customerContext({ query: input.query, customer_id: input.customer_id });

      case 'get_job_detail':
        return await ops.jobDetail({ job_id: input.job_id });

      case 'get_unpaid_jobs':
        return await ops.unpaidSummary();

      case 'get_data_health':
        return await ops.dataHealth();

      case 'capture_business_note': {
        const rawText = String(input.raw_text || '').trim();
        const summary = String(input.summary || '').trim();
        if (!rawText || !summary) throw new Error('raw_text and summary are required.');
        let dueAt = null;
        if (input.due_at_local) dueAt = phoenixLocalToIso(input.due_at_local);
        const row = await sbInsert('jarvis_business_notes', {
          raw_text: rawText.slice(0, 12000),
          summary: summary.slice(0, 500),
          contact_name: input.contact_name ? String(input.contact_name).trim().slice(0, 200) : null,
          phone: input.phone ? String(input.phone).trim().slice(0, 80) : null,
          email: input.email ? String(input.email).trim().slice(0, 320) : null,
          vehicle: input.vehicle ? String(input.vehicle).trim().slice(0, 300) : null,
          service: input.service ? String(input.service).trim().slice(0, 300) : null,
          quoted_amount: input.quoted_amount != null && Number.isFinite(Number(input.quoted_amount)) ? Number(input.quoted_amount) : null,
          preferred_timing: input.preferred_timing ? String(input.preferred_timing).trim().slice(0, 300) : null,
          action_needed: input.action_needed ? String(input.action_needed).trim().slice(0, 500) : null,
          due_at: dueAt,
          status: 'open',
          source: 'jarvis',
        });
        return { ok: true, verified: true, entity: 'note', id: row.id, note: row };
      }

      case 'list_business_notes': {
        const scope = String(input.scope || 'open').toLowerCase();
        const params = { select: '*', order: 'created_at.desc', limit: String(Math.min(Number(input.limit || 20), 100)) };
        if (scope === 'open') params.status = 'eq.open';
        else if (scope === 'resolved') params.status = 'eq.resolved';
        else if (scope === 'due') {
          params.status = 'eq.open';
          params.due_at = `lte.${new Date().toISOString()}`;
        } else if (scope !== 'all') throw new Error('scope must be open, resolved, due, or all.');
        const rows = await sbGet('jarvis_business_notes', params);
        const q = String(input.query || '').trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(n => [n.summary,n.contact_name,n.phone,n.email,n.vehicle,n.service,n.preferred_timing,n.action_needed,n.raw_text].some(v => String(v || '').toLowerCase().includes(q)));
      }

      case 'resolve_business_note': {
        const rows = await sbGet('jarvis_business_notes', { select: 'id,summary,status', id: `eq.${encodeURIComponent(input.note_id)}`, limit: '1' });
        const note = rows[0];
        if (!note) throw new Error('No business note found with that id.');
        if (note.status === 'resolved') return { ok: true, already_resolved: true, summary: note.summary };
        const nowIso = new Date().toISOString();
        await ops.patch('jarvis_business_notes', input.note_id, { status: 'resolved', resolved_at: nowIso, updated_at: nowIso });
        return writeResult('note', input.note_id, note, { status: 'resolved' }, { summary: note.summary });
      }

      case 'list_jobs': {
        const params = { select: 'id,fname,lname,vehicle,service,date,time,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,notes,estimate_notes,garage_notes,line_items', order: 'date.desc', limit: String(Math.min(Number(input.limit || 15), 50)) };
        if (input.customer_id) params.customer_id = `eq.${input.customer_id}`;
        const name = cleanSearchText(input.customer_name);
        if (name) {
          const words = name.split(' ');
          params.or = words.length >= 2
            ? `(and(fname.ilike."*${words[0]}*",lname.ilike."*${words.slice(1).join(' ')}*"))`
            : `(fname.ilike."*${name}*",lname.ilike."*${name}*")`;
        }
        if (input.date_from) params.date = `gte.${input.date_from}`;
        if (input.date_to) params['date.2'] = `lte.${input.date_to}`;
        if (input.job_status) params.job_status = `eq.${String(input.job_status).toUpperCase()}`;
        if (input.vehicle) params.vehicle = `ilike.*${cleanSearchText(input.vehicle)}*`;
        if (input.service_keyword) params.service = `ilike.*${cleanSearchText(input.service_keyword)}*`;
        const rows = await sbGet('bookings', params);
        // Keep the card's fields, add a one-line `about` from the real evidence.
        return rows.map(r => {
          const ev = jobEvidence(r);
          const about = ev.scopeOfWork || ev.lineItems.map(li => li.label).join(', ') || ev.bookingRequest.text || ev.bookingRequest.selections.join('; ') || null;
          return {
            id: r.id, fname: r.fname, lname: r.lname, vehicle: r.vehicle, service: r.service, date: r.date, time: r.time,
            job_status: r.job_status, ...ev.money, // estimateTotal/invoiceTotal include tax; *_Subtotal are pre-tax
            about: about ? about.slice(0, 240) : null,
          };
        });
      }

      case 'reschedule_job': {
        // Dates are Arizona calendar dates (YYYY-MM-DD); times are stored as
        // shown ("11:00 AM", "13:00" or "TBD"). A real date clears date_tbd,
        // same as saving the job with a date in the dashboard.
        const fields = {};
        if (input.date) {
          if (!isValidYmd(input.date)) throw new Error('Date must be a real YYYY-MM-DD date.');
          fields.date = input.date;
          fields.date_tbd = false;
        }
        if (input.time) {
          if (!isValidApptTime(input.time)) throw new Error('Time must look like "11:00 AM", "13:00", or "TBD".');
          fields.time = String(input.time).trim();
        }
        if (!Object.keys(fields).length) throw new Error('Need a date or time to reschedule to.');
        const rows = await sbGet('bookings', { select: 'id,fname,lname,date,time,date_tbd,job_status,status', id: `eq.${input.job_id}`, limit: '1' });
        const job = rows[0];
        if (!job) throw new Error('No job found with that id.');
        if (['PAID', 'CANCELLED'].includes(job.job_status) || String(job.status || '').toLowerCase() === 'cancelled') {
          throw new Error(`This job is ${job.job_status || job.status}; rescheduling it would rewrite history. Change it in the dashboard if that's really intended.`);
        }
        await ops.patch('bookings', input.job_id, fields);
        return writeResult('booking', input.job_id, job, fields, { customer: `${job.fname || ''} ${job.lname || ''}`.trim() });
      }

      case 'pricing_history': {
        // Match the keyword against the category AND the scope of work, since
        // many real jobs are filed under "other".
        const kw = cleanSearchText(input.service_keyword);
        if (!kw) throw new Error('service_keyword is required.');
        const params = { select: 'vehicle,service,estimate_amount,invoice_amount,job_status,estimate_notes', or: `(service.ilike."*${kw}*",estimate_notes.ilike."*${kw}*")`, job_status: 'neq.CANCELLED', order: 'created_at.desc', limit: '20' };
        if (input.vehicle) params.vehicle = `ilike.*${cleanSearchText(input.vehicle)}*`;
        const jobs = await sbGet('bookings', params);
        const amounts = jobs.map(j => Number(j.invoice_amount ?? j.estimate_amount ?? 0)).filter(n => n > 0);
        return {
          count: jobs.length,
          priceRange: amounts.length ? { min: money(Math.min(...amounts)), max: money(Math.max(...amounts)), avg: money(amounts.reduce((a, b) => a + b, 0) / amounts.length) } : null,
          samples: jobs.slice(0, 5).map(j => ({ vehicle: j.vehicle, price: money(j.invoice_amount ?? j.estimate_amount), scope: j.estimate_notes ? String(j.estimate_notes).slice(0, 160) : null })),
          note: 'Prices are pre-tax invoice amounts (estimate if never invoiced).',
        };
      }

      case 'get_tax_rate': {
        const rows = await sbGet('business_settings', { select: '*', id: 'eq.default', limit: '1' });
        const s = rows[0] || {};
        const pay = ownerPaySettings(s);
        return { taxRatePct: s.tax_rate != null ? Number(s.tax_rate) * 100 : null, monthlyOverhead: money(pay.monthlyOverhead), stripeFeePct: pay.stripeFeePct * 100, ownerTaxReservePct: pay.taxReservePct * 100 };
      }

      case 'add_marketing_spend': {
        const amount = Number(input.amount);
        if (!isValidYmd(input.date)) throw new Error('Date must be YYYY-MM-DD.');
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a non-negative number.');
        const row = await sbInsert('marketing_spend', { date: input.date, channel: String(input.channel || 'other').toLowerCase(), amount });
        return { ok: true, verified: true, entity: 'marketing_spend', id: row.id, date: row.date, channel: row.channel, amount: row.amount };
      }

      case 'log_call': {
        const direction = ['inbound', 'outbound'].includes(input.direction) ? input.direction : 'inbound';
        const row = await sbInsert('calls', { phone: String(input.phone || '').slice(0, 40), direction, outcome: String(input.outcome || 'other').slice(0, 40), notes: input.notes ? String(input.notes).slice(0, 4000) : null });
        return { ok: true, verified: true, entity: 'call', id: row.id, phone: row.phone, outcome: row.outcome };
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
        // Same people resolution as get_customer_context, shaped for the card.
        const found = await ops.findPeople({ query: input.query });
        return found.people.map(p => ({ id: p.key, fname: p.name, lname: '', phone: p.phone, email: p.email, vehicle: p.vehicles[0] || null, vin: p.vin, foundIn: p.sources, jobCount: p.jobCount }));
      }

      case 'update_job_status': {
        const status = String(input.job_status || '').toUpperCase();
        if (status === 'PAID') throw new Error("Don't use update_job_status for PAID — use mark_job_paid so the actual payment gets recorded, not just the label.");
        if (status === 'CANCELLED') throw new Error('Use cancel_job to cancel — it sets both status fields exactly like the admin button.');
        if (!SETTABLE_JOB_STATUSES.includes(status)) throw new Error(`Job status must be one of: ${SETTABLE_JOB_STATUSES.join(', ')}.`);
        const rows = await sbGet('bookings', { select: 'id,job_status,status', id: `eq.${input.job_id}`, limit: '1' });
        if (!rows[0]) throw new Error('No job found with that id.');
        if (rows[0].job_status === 'PAID') throw new Error('This job is PAID; changing its status would pull it out of revenue. Do that in the dashboard if intended.');
        if (rows[0].job_status === 'CANCELLED') throw new Error('This job is cancelled; use reopen_job first.');
        await ops.patch('bookings', input.job_id, { job_status: status });
        return writeResult('booking', input.job_id, rows[0], { job_status: status });
      }

      case 'mark_job_paid':
        // Same append-and-reconcile rule as the dashboard (shared/business-rules.js planPayment).
        return await ops.recordPayment({
          job_id: input.job_id, amount: input.amount, method: input.method || 'Other',
          stripe_transaction_id: input.stripe_transaction_id || '', note: input.note || '', confirmed: input.confirmed === true,
        });

      case 'get_revenue_summary':
        return await ops.revenueSummary({ period: input.period, include_contributions: input.include_contributions === true });

      case 'compare_revenue_periods':
        return await ops.comparePeriods({ period_a: input.period_a, period_b: input.period_b });

      case 'get_vehicle_jobs':
        return await ops.vehicleJobs({ vehicle: input.vehicle, customer: input.customer });

      case 'get_result_set_details':
        return await ops.resultSetDetails({ type: input.type, ids: input.ids });

      case 'cancel_job':
        return await ops.cancelJob({ job_id: input.job_id, reason: input.reason || '', confirmed: input.confirmed === true });

      case 'reopen_job':
        return await ops.reopenJob({ job_id: input.job_id, confirmed: input.confirmed === true });

      case 'get_owner_pay_summary':
        return await ops.ownerPaySummary({ period: input.period, periodDays: input.periodDays });

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
  const nowCtx = new Date();
  const todayCtx = nowCtx.toLocaleString('en-US', {
    timeZone: 'America/Phoenix',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  // Conversation state from the previous turn (record ids, pending
  // confirmation) — see _lib/jarvis-context.js. Web sends it back in the body;
  // Telegram stores it per chat.
  const priorContext = payload.context && typeof payload.context === 'object' ? payload.context : null;
  const plan = forceNaturalNoteCapture ? { mode: 'note', keepHistory: true, instruction: '' } : planTurn(latestUserText, priorContext, focusedIntent);
  // Self-contained questions (revenue, briefing…) get only the current message,
  // so an earlier subject can't leak into the answer.
  const historyForTurn = plan.keepHistory ? incomingMessages : incomingMessages.slice(-1);
  let messages = [
    ...historyForTurn.map(m => ({ role: m.role, content: m.content })),
  ];
  const noteCaptureInstruction = forceNaturalNoteCapture
    ? `\n\n[ROUTING: The latest message is an owner operational note, not a status question. You MUST call capture_business_note exactly once using only facts explicitly stated. Do not call get_action_center, get_owner_briefing, list_reminders, or any unrelated tool. After saving, confirm the note briefly and do not invent an appointment/reminder.]`
    : '';
  const focusInstruction = forceNaturalNoteCapture ? '' : focusedRoutingInstruction(focusedIntent);
  messages[messages.length - 1] = {
    ...messages[messages.length - 1],
    content: `[Today is ${todayCtx}]\n\n${messages[messages.length - 1].content}${noteCaptureInstruction}${focusInstruction}${plan.instruction ? `\n\n[CONTEXT: ${plan.instruction}]` : ''}`,
  };
  const focusedTools = forceNaturalNoteCapture ? null : toolsForFocusedIntent(focusedIntent);
  let toolsForTurn = forceNaturalNoteCapture
    ? TOOLS.filter(t => t.name === 'capture_business_note')
    : (focusedTools && focusedTools.length ? focusedTools : TOOLS);
  if (plan.prefetch && !toolsForTurn.some(t => t.name === plan.prefetch.tool)) {
    toolsForTurn = [...toolsForTurn, ...TOOLS.filter(t => t.name === plan.prefetch.tool)];
  }


  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  function send(obj) {
    return writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
  }

  // Every tool call this turn, with its outcome — drives the success-claim
  // guard and the context handed to the next turn.
  const turnCalls = [];
  async function execTool(name, input) {
    await send({ type: 'tool_call', tool: name, input });
    try {
      const result = await runTool(name, input);
      turnCalls.push({ name, input, ok: true, result });
      await send({ type: 'tool_result', tool: name, ok: true });
      if (PRESENTABLE_TOOLS.has(name) && result && !result.needs_confirmation) {
        await send({ type: 'data', tool: name, payload: result });
      }
      return JSON.stringify(result);
    } catch (e) {
      const error = e.message ?? String(e);
      turnCalls.push({ name, input, ok: false, error, result: { ok: false, error } });
      await send({ type: 'tool_result', tool: name, ok: false, error });
      return JSON.stringify({ ok: false, error });
    }
  }
  async function finish(text) {
    const guarded = guardFinalText(text, turnCalls);
    const nextContext = updateContext(priorContext, turnCalls, { intent: focusedIntent, plan });
    await send({ type: 'context', context: nextContext });
    await send({ type: 'final', text: guarded.text, ...(guarded.overridden ? { guarded: true } : {}) });
  }

  // Run the agent loop in the background; the streamed response is
  // returned to the client immediately below, independent of this promise.
  (async () => {
    try {
      // Deterministic lookup of the record the message refers to (or the
      // confirmed pending action), run before the model answers.
      if (plan.prefetch) {
        const id = 'prefetch_1';
        const content = await execTool(plan.prefetch.tool, plan.prefetch.input);
        messages.push({ role: 'assistant', content: [{ type: 'tool_use', id, name: plan.prefetch.tool, input: plan.prefetch.input }] });
        messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] });
      }
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
            tools: toolsForTurn,
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
          await finish(replyText || "I don't have anything to add.");
          break;
        }

        messages.push({ role: 'assistant', content: data.content });
        const toolResults = [];
        for (const block of toolUseBlocks) {
          const resultContent = await execTool(block.name, block.input || {});
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
        }
        messages.push({ role: 'user', content: toolResults });

        if (turn === MAX_TOOL_TURNS - 1) {
          await finish('That took more steps than I could finish in one go — try breaking it into a smaller question.');
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
