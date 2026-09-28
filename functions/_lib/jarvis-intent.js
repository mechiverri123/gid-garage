// Deterministic intent routing for Jarvis text turns (web + Telegram).
// A focused question only gets the tools for its area, so "revenue this month"
// can't wander into owner-pay math and "who needs follow-up" can't turn into a
// briefing. Tests: tests/jarvis-intent.test.js.

import { extractExplicitSubjects } from './jarvis-context.js';

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
  "\\b(come|came) in for\\b", "\\b(bring|brought) (it |the \\w+ )?in\\b", "\\bvin\\b", "\\b(mileage|odometer|miles)\\b",
  "\\b(what|which) (vehicle|car|truck)\\b", "\\bservice address\\b", "\\bwhat did [\\w' .-]+ pay\\b",
  "\\bestimate (total|amount|subtotal)?\\b", "\\bsubtotal\\b", "\\bbefore tax\\b", "\\bwhat status is\\b", "\\bstatus of\\b",
  "\\bwhat was [\\w' .-]+ about\\b", "\\bactually about\\b",
].join('|'), 'i');

// SEO / local growth questions. Checked early: phrases like "what changed
// this week" must reach SEO tools, not money. Job-level "recommendations"
// (technician recommendations) stay with customer history.
export const SEO_PATTERN = /\b(seo|search console|google business profile|business profile|gbp|google maps|maps (listing|visibility|ranking)|local (search|visibility|pack|seo|rank\w*|demand|competitors?)|rankings?|ranked|organic|impressions|keywords?|search (traffic|terms|demand|visibility|results)|competitors?|competition|backlinks?|citations?|pagespeed|page speed|core web vitals|site speed|website speed|review (velocity|count)|instagram|followers|apple (maps|business)|bing|where do (my )?customers come from|customers? come from|service area|seasonal\w*|seasonality|nau (move|semester|season|students?)|cold snap|google ads|meta ads|ad spend|seo (opportunit|recommend|idea)\w*|growth (mode|opportunit)\w*|visibility|traffic|visitors|outside (the|my|our) (service )?area|nonlocal|non-local)\b/i;
// Genuine SEO follow-ups ("why?", "show me the last 90 days", "apply that
// recommendation", "reject the second one").
// A bare "why?" is a follow-up; "why does each one need follow-up?" has its own subject.
const SEO_FOLLOWUP = /^\s*(why|how come|why is that|why not|explain( that| it)?|more detail|tell me more|what does that mean)\s*[?.!]*\s*$|\b(last|past) \d+ days\b|\b(reject|dismiss|accept|snooze|reopen|apply|applied)\b|\bmark (it|that|this) (as )?(applied|done)\b|\bthe (first|second|third|fourth|fifth|top|last|\d+(st|nd|rd|th)) one\b|\b(number|#) ?\d+\b|\bthat (recommendation|one|opportunity|idea)\b/i;

// Explicit business commands and business entities keep their normal routing
// no matter what SEO words appear ("Remind me to check competitors", "Log a
// call — they asked about rankings", "Send Jill the Google Maps link").
export const OPERATIONAL_COMMAND = /^\s*(?:(?:please|pls|can you|could you|go ahead and|jarvis,?|hey jarvis,?|ok(?:ay)?,?)\s+)*(remind|log|record|send|email|e-mail|text|call|book|schedule|reschedule|cancel|reopen|mark|update|set|create|add|note|save|capture|charge|bill|invoice|move|assign|delete|remove|follow[- ]?up|message|draft|confirm)\b/i;
export const BUSINESS_ENTITY = /\b(lead form|lead|leads|estimate|estimates|invoice|invoices|payment|payments|paid|reminder|reminders|appointment|appointments|booking|bookings|job|jobs|contacted|called|texted)\b|\b\w+'s (car|truck|vehicle|job|estimate|invoice|lead|appointment|acura|ranger|ram)\b|\b(his|her|their) (car|truck|vehicle|job|estimate|invoice|lead|appointment|form)\b/i;

// Business follow-up vocabulary: these refer to leads/customers/jobs, never to an SEO item.
const BUSINESS_FOLLOWUP = /\b(follow[- ]?ups?|each one|all of them|contact(ed)?|call(ed)?|owe[sd]?|booked|customer|customers)\b/i;

export function isExplicitBusinessAction(text) {
  const t = String(text || '');
  return OPERATIONAL_COMMAND.test(t) || BUSINESS_ENTITY.test(t) || BUSINESS_FOLLOWUP.test(t) || extractExplicitSubjects(t).names.length > 0;
}

// Context-aware wrapper. A follow-up only stays SEO when the previous turn left
// an ACTIVE SEO entity (view/recommendations) in structured context AND the
// message isn't an explicit business action about someone/something else.
export function classifyWithContext(text, ctx) {
  const t = String(text || '');
  if (ctx?.activeSeo && SEO_FOLLOWUP.test(t) && !isExplicitBusinessAction(t)) return 'seo';
  return classifyFocusedIntent(t);
}

// "What jobs make the difference between last 30 days and this month?\"
const MONEY_COMPARE = /\b(difference|differ|gap|account for|caused|come from|what made|what changed|why is (it|revenue|this month|that) (lower|higher|less|more|different))\b/i;
const MONEY_WORDS = /\b(revenue|profit|collected|money|sales|month|30 days|days|week|year|period)\b|\$\s?\d/i;

export function classifyFocusedIntent(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  if (/\b(clear|clean|cleanup|remove|finish|complete|close)\b.*\btest reminders?\b/i.test(raw) ||
      /\btest reminders?\b.*\b(clear|clean|cleanup|remove|finish|complete|close)\b/i.test(raw)) return 'test_reminder_cleanup';
  if (/\b(brief me|owner brief|morning brief|what(?:'s| is) going on today|how(?:'s| is) the business today|what does tomorrow look like|what's tomorrow look like)\b/i.test(lower)) return 'briefing';
  if (SEO_PATTERN.test(lower) && !/\b(unresolved|technician|diagnos\w*) recommendations?\b/i.test(lower) && !OPERATIONAL_COMMAND.test(raw) && !BUSINESS_ENTITY.test(raw)) return 'seo';
  if (MONEY_COMPARE.test(lower) && MONEY_WORDS.test(lower)) return 'money_compare';
  if (/\bwhat did i (last |just |most recently )?(say|write|note|jot|mention) (about|on|regarding)\b|\b(my )?(last|latest) note (on|about|for)\b/i.test(lower)) return 'notes';
  if (/\b(anything|something|what) (do |else )?i (need|have|should|got) (to )?(follow[- ]?up|do|handle|check|get back) (with|on|about|for|to)\b|\bfollow[- ]?up with (?!leads?\b)[a-z]+/i.test(lower)) return 'person_followup';
  if (/\b(what am i waiting on|waiting on|who should i (contact|call|text) next|who do i (contact|call|text) next|blocking tomorrow|tomorrow'?s blockers|blockers)\b/i.test(lower)) return 'waiting_on';
  if (/\b(what needs my attention|what should i handle next|action center|what do i need to handle)\b/i.test(lower)) return 'action_center';
  if (/\b(data health|data (problems|issues)|inconsisten\w*|bad records|anything (look )?(off|wrong) (in|with) the (data|records|books))\b/i.test(lower)) return 'data_health';
  if (/\b(remind me|reminder|reminders|what reminders|mark .*reminder|complete .*reminder)\b/i.test(lower)) return 'reminders';
  if (/\b(lead follow[- ]?up|lead followups|who needs.*follow|which leads.*follow|uncontacted leads?|open leads?|new leads?|lead status)\b/i.test(lower)) return 'leads';
  if (/\b(unpaid|balance owed|outstanding balance|who owes|owes me|invoices? (outstanding|due|unpaid)|unpaid invoices?)\b/i.test(lower)) return 'unpaid';
  // Take-home alone gets only the owner-pay tool — no revenue/net-profit preamble.
  if (/\b(take[- ]?home|owner pay|pay myself|owner draw)\b|\bhow much can i (realistically )?(take|pay myself|draw)\b/i.test(lower)
      && !/\b(revenue|profit|gross|collected|sales|compare|versus|vs\.?|actually make)\b/i.test(lower)) return 'take_home';
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
  money_compare: ['compare_revenue_periods', 'get_revenue_summary'],
  take_home: ['get_owner_pay_summary'],
  seo: ['get_seo_overview', 'get_seo_opportunities', 'get_local_search_demand', 'get_seo_competitors', 'get_seo_seasonality', 'get_customer_geography', 'get_local_authority', 'get_seo_connections', 'check_service_area', 'update_seo_recommendation'],
  person_followup: ['get_customer_context', 'list_business_notes', 'list_reminders', 'list_lead_followups'],
  notes: ['list_business_notes', 'resolve_business_note', 'capture_business_note'],
  customer_history: ['get_customer_context', 'get_job_detail', 'get_vehicle_jobs', 'list_business_notes'],
  customer_lookup: ['search_customers', 'get_customer_context', 'get_job_detail', 'get_vehicle_jobs', 'list_jobs', 'pricing_history', 'list_calls', 'list_business_notes'],
  jobs: ['list_jobs', 'get_job_detail', 'get_customer_context', 'get_vehicle_jobs', 'search_customers', 'reschedule_job', 'update_job_status', 'cancel_job', 'reopen_job', 'mark_job_paid', 'send_customer_email'],
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
  notes: 'This turn is specifically about captured owner notes. Search the notes (list_business_notes with the person\'s name as query, scope all). A person in a note does NOT need a customer record — never say they are "not a customer" or ask for their phone when a note exists. For "what did I last say", give the most recent note. Stay on notes only.',
  seo: 'This is an SEO / local-growth question. Use the SEO tools only. Lead with LOCAL business impact (local visibility, GBP actions, local leads, bookings), never raw traffic. Use the locality labels exactly as returned (likely_local is not confirmed). Anything outside the 30-mile service area is an expansion decision, not a recommendation. If a data source is not connected, say so plainly instead of guessing.',
  take_home: 'The owner asked only for take-home. Call get_owner_pay_summary for exactly the requested period and answer with that period\'s take-home (and its breakdown if useful). Do not lead with or add revenue or net profit for any other period.',
  money_compare: 'The owner wants to know exactly which jobs make the difference between two periods. Call compare_revenue_periods with both periods (e.g. last_30_days vs this_month) and list the jobs in `differences` with their amounts and dates. Never say "likely" or ask the owner to remember; the rows are authoritative.',
  person_followup: 'The owner asks what is outstanding with one person. Use get_customer_context with their name (it covers customers, bookings, leads AND owner notes/reminders — a customers row is not required) and answer only from its openItems, owner notes and reminders. If nothing is open, say so.',
  customer_history: 'This is a customer/job depth question. Use get_customer_context (a person), get_job_detail (one job) or get_vehicle_jobs (a vehicle like "the Ranger") and answer from the job evidence: scope of work, technician notes, photo notes, inspection codes, line items, booking request. The service category ("other", "General Inquiry") is never a description. VIN/mileage/address: use vehicleRecords and the per-job fields. Money: quote *_total (includes tax) unless the subtotal is asked for.',
  customer_lookup: 'This turn is a lookup. Answer only with directly relevant customer/job/history context. Do not append a business-wide status summary.',
  jobs: 'This turn is specifically about jobs/appointments/schedule. Stay on jobs and scheduling. Do not append unrelated reminders, lead queues, notes, or revenue. To explain what a job was about, use get_job_detail or get_customer_context, not the service category. To cancel a job use cancel_job (confirmation required).',
};

export function focusedRoutingInstruction(intent) {
  return intent && ROUTING_TEXT[intent] ? `\n\n[FOCUSED ROUTING: ${ROUTING_TEXT[intent]}]` : '';
}
