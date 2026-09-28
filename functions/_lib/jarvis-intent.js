// Deterministic intent routing for Jarvis text turns (web + Telegram).
// A focused question only gets the tools for its area, so "revenue this month"
// can't wander into owner-pay math and "who needs follow-up" can't turn into a
// briefing. Tests: tests/jarvis-intent.test.js.

// Owner scratch notes ("Lisa might want an oil change next week") go straight
// to capture_business_note so broad tools can't hijack them.
export function isLikelyNaturalBusinessNote(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 8 || raw.length > 2000) return false;

  // Questions and explicit Jarvis commands are not passive notes.
  if (raw.includes('?')) return false;
  if (/^(brief|show|list|find|search|what|who|when|where|why|how|remind|mark|move|reschedule|email|send|call|text|update|change|set|book|schedule|cancel|delete|undo|check|record|log)\b/i.test(raw)) return false;

  const hasPersonishStart = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(raw);
  const hasOperationalVerb = /\b(called|texted|messaged|said|asked|wants?|wanted|needs?|needed|might want|may want|interested|quoted|quote(?:d)?|coming|available|prefers?|mentioned|reported|has|having|waiting|sent|confirm(?:ed)?|approved|declined|dropped off|picked up|decid(?:ed|ing)|thinking about|checking with)\b/i.test(raw);
  const hasBusinessDetail = /\b(oil change|brakes?|rotors?|pads?|diagnostic|diag|suspension|battery|starter|alternator|water pump|coolant|leak|grind(?:ing)?|noise|repair|service|appointment|estimate|quote|\$?\d{2,5}|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|whenever|morning|afternoon|evening)\b/i.test(raw);
  const hasVehicleish = /\b(19|20)\d{2}\b|\b(f-?150|silverado|ranger|rav4|camry|corolla|accord|civic|tacoma|4runner|wrangler|explorer|edge)\b/i.test(raw);

  return hasPersonishStart && hasOperationalVerb && (hasBusinessDetail || hasVehicleish);
}

const CUSTOMER_HISTORY = new RegExp([
  "\\bjobs? (were|was) about\\b", "\\bwhat (were|was|are|is) [\\w' .-]+ (jobs?|visits?|work) about\\b",
  "\\bwhat did (we|i|you) (actually )?(do|work on|fix|replace|tell|say)\\b", "\\bwhat have we done for\\b",
  "\\b(service|customer|repair|job) history\\b", "\\bhistory (for|with|on)\\b", "\\bsummari[sz]e [\\w' .-]+(history|jobs?|visits?)\\b",
  "\\b(last|latest|previous|most recent) (visit|job|appointment|repair|service)\\b", "\\bwhy did [\\w' .-]+ bring\\b",
  "\\bwhat was (wrong|included|done|the (complaint|diagnosis|scope|problem|issue))\\b", "\\bscope (of work|notes?)\\b",
  "\\btechnician notes?\\b", "\\bwhat did we diagnose\\b", "\\bdiagnos(is|ed)\\b", "\\bcomplaint\\b",
  "\\brecommendations?\\b", "\\bwhat parts\\b", "\\bparts (did|were|for)\\b", "\\bnext action for\\b",
  "\\bwhy was (that|the) (quote|estimate|invoice|bill)\\b", "\\bwhat happened (on|with|at)\\b", "\\bthat (job|visit|repair)\\b",
].join('|'), 'i');

export function classifyFocusedIntent(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  if (/\b(clear|clean|cleanup|remove|finish|complete|close)\b.*\btest reminders?\b/i.test(raw) ||
      /\btest reminders?\b.*\b(clear|clean|cleanup|remove|finish|complete|close)\b/i.test(raw)) return 'test_reminder_cleanup';
  if (/\b(brief me|owner brief|morning brief|what(?:'s| is) going on today|how(?:'s| is) the business today|what does tomorrow look like|what's tomorrow look like)\b/i.test(lower)) return 'briefing';
  if (/\b(what am i waiting on|waiting on|who should i (contact|call|text) next|who do i (contact|call|text) next|blocking tomorrow|tomorrow'?s blockers|blockers)\b/i.test(lower)) return 'waiting_on';
  if (/\b(what needs my attention|what should i handle next|action center|what do i need to handle)\b/i.test(lower)) return 'action_center';
  if (/\b(data health|data (problems|issues)|inconsisten\w*|bad records|anything (look )?(off|wrong) (in|with) the (data|records|books))\b/i.test(lower)) return 'data_health';
  if (/\b(remind me|reminder|reminders|what reminders|mark .*reminder|complete .*reminder)\b/i.test(lower)) return 'reminders';
  if (/\b(lead follow[- ]?up|lead followups|who needs.*follow|which leads.*follow|uncontacted leads?|open leads?|new leads?|lead status)\b/i.test(lower)) return 'leads';
  if (/\b(unpaid|balance owed|outstanding balance|who owes|owes me|invoices? (outstanding|due|unpaid)|unpaid invoices?)\b/i.test(lower)) return 'unpaid';
  if (/\b(revenue|take home|take-home|made this week|made today|made this month|actually make|owner pay|profit|gross|collected)\b/i.test(lower)) return 'money';
  if (/\b(what notes|notes do i have|show .*notes|mark .*note resolved|resolve .*note)\b/i.test(lower)) return 'notes';
  if (CUSTOMER_HISTORY.test(raw)) return 'customer_history';
  if (/\b(find|search|look up|lookup)\b/i.test(lower)) return 'customer_lookup';
  if (/\b(job|jobs|appointment|appointments|schedule|scheduled)\b/i.test(lower) && !/\bremind/.test(lower)) return 'jobs';
  return null;
}

export const INTENT_TOOL_NAMES = {
  test_reminder_cleanup: ['cleanup_test_reminders'],
  briefing: ['get_owner_briefing'],
  action_center: ['get_action_center'],
  waiting_on: ['get_action_center', 'get_customer_context'],
  data_health: ['get_data_health'],
  reminders: ['create_reminder', 'list_reminders', 'complete_reminder', 'cleanup_test_reminders'],
  leads: ['list_lead_followups', 'list_leads', 'analyze_lead', 'set_lead_followup', 'log_lead_contact', 'update_lead_status', 'create_reminder'],
  unpaid: ['get_unpaid_jobs', 'get_customer_context'],
  money: ['get_revenue_summary', 'get_owner_pay_summary', 'list_marketing_spend'],
  notes: ['list_business_notes', 'resolve_business_note', 'capture_business_note'],
  customer_history: ['get_customer_context', 'get_job_detail', 'list_business_notes'],
  customer_lookup: ['search_customers', 'get_customer_context', 'get_job_detail', 'list_jobs', 'pricing_history', 'list_calls', 'list_business_notes'],
  jobs: ['list_jobs', 'get_job_detail', 'get_customer_context', 'search_customers', 'reschedule_job', 'update_job_status', 'mark_job_paid', 'send_customer_email'],
};

const ROUTING_TEXT = {
  test_reminder_cleanup: 'The user explicitly wants old test reminders cleaned up. Use cleanup_test_reminders once and report only how many test reminders were closed.',
  briefing: 'This is a broad owner briefing request. Use get_owner_briefing and summarize the briefing only.',
  action_center: 'This is a broad prioritization request. Use get_action_center and summarize the most important actions only.',
  waiting_on: 'This is about what the owner is waiting on, who to contact next, or what blocks tomorrow. Use get_action_center and answer from waiting_on, top_actions (contact order = queue order), or tomorrow_blockers as asked. Do not invent urgency beyond the queue.',
  data_health: 'The owner wants a data-health check. Use get_data_health and report the issues found. It is read-only; never offer to auto-fix money records.',
  reminders: 'This turn is specifically about owner reminders. Use only reminder tools. Do not mention leads, jobs, revenue, invoices, or notes unless the reminder itself directly references one.',
  leads: 'This turn is specifically about leads/follow-ups. Stay on leads. Do not mention unrelated reminders, jobs, revenue, invoices, or owner notes.',
  unpaid: 'This turn is specifically about unpaid balances. Use get_unpaid_jobs and stay on it; do not append unrelated business status.',
  money: 'This turn is specifically about money. If the user says revenue/gross/sales/collected, use get_revenue_summary. If they say net profit, use get_revenue_summary. Only use get_owner_pay_summary for take-home/owner pay/after-fees-and-reserve. Preserve the requested period exactly: this month is not last 30 days. Do not append unrelated reminders, leads, jobs, or notes.',
  notes: 'This turn is specifically about captured business notes. Stay on notes only; do not append unrelated reminders, jobs, leads, or revenue.',
  customer_history: 'This is a customer/job depth question. Use get_customer_context (or get_job_detail for one specific job) and answer from the job evidence: scope of work, technician notes, line items, booking request, inspection. Do not answer from the service category alone. If a referent like "her" or "that job" is unclear from the conversation, ask which customer/job.',
  customer_lookup: 'This turn is a lookup. Answer only with directly relevant customer/job/history context. Do not append a business-wide status summary.',
  jobs: 'This turn is specifically about jobs/appointments/schedule. Stay on jobs and scheduling. Do not append unrelated reminders, lead queues, notes, or revenue. To explain what a job was about, use get_job_detail or get_customer_context, not the service category.',
};

export function focusedRoutingInstruction(intent) {
  return intent && ROUTING_TEXT[intent] ? `\n\n[FOCUSED ROUTING: ${ROUTING_TEXT[intent]}]` : '';
}
