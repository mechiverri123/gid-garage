// Conversation state for Jarvis text turns (web + Telegram). Pure functions,
// tested in tests/jarvis-context.test.js.
//
// Why this exists: chat history only carries prose, so earlier tool results
// (booking ids, vehicles, the lead list just shown) were lost between turns and
// the model "remembered" facts that were never retrieved (e.g. a 2013 Civic).
// Now each turn ends with a structured ACTIVE CONTEXT of record ids, and the
// next turn resolves "that job" / "each one" / "yes" against those ids and
// re-reads the records. Facts always come from a fresh tool result.

const STOP = new Set(`
a about after again all also am an and any anything are as at be because been before being both but by can could
customer customers day days did do does doing done each else estimate estimates every everything for from get go
had has have he her here hers him his how i if in into invoice invoices is it its job jobs just last latest lead
leads let like look made make many me mine month more most much my need needs new next no not note notes now of
off ok okay on once one only or other our out over paid pay payment please previous profit record recent remind
reminder reminders revenue said same say see she should show so some something status still such take tell than
thank thanks that the their them then there these they thing this those through to today tomorrow too total
up us vehicle vehicles vin visit visits was we week were what when where which while who whom whose why will with
would yes yet you your year years car truck mileage miles address actually why cancel cancelled canceled customer
brief attention waiting follow followup follow-up owe owes owed diagnose diagnosed complaint scope recommend
recommendations parts part history happened went came come brought bring in net gross collected sales take-home
oil brake brakes battery alternator starter pump water coolant leak noise diag diagnostics suspension audio
service services repair repairs change check engine light code codes quote quoted appointment schedule scheduled
morning afternoon evening monday tuesday wednesday thursday friday saturday sunday jarvis hey hi hello
summarize summarise summary give list find search explain describe pull get compare update reschedule move send
email text call create add log mark set book open close reopen delete remove confirm verify review report
findings finding evidence details detail info information job's id booking bookings
`.split(/\s+/).filter(Boolean));

// Vehicle words that identify a vehicle, not a person.
const VEHICLE_WORDS = new Set(`
acura audi bmw buick cadillac chevy chevrolet chrysler dodge ford gmc honda hyundai infiniti jeep kia lexus lincoln
mazda mercedes mitsubishi nissan ram subaru tesla toyota volkswagen vw volvo
ranger f150 f-150 f250 f-250 f350 silverado sierra tahoe suburban blazer equinox camry corolla tacoma tundra 4runner
rav4 highlander prius civic accord cr-v crv pilot odyssey rdx mdx tlx wrangler cherokee explorer escape edge bronco
mustang expedition altima sentra rogue frontier titan outback forester impreza crosstown jetta passat tiguan
`.split(/\s+/).filter(Boolean));

const REFERENCE = /\b(that|it|her|his|him|she|he|them|those|these|this one|this job|the job|that job|same one|last visit|the car|the truck|the vehicle)\b/i;
const RESULT_SET = /\b(each( one| of them)?|all of them|every one|those (leads|jobs|people|ones)|these (leads|jobs|people|ones)|the list)\b/i;
const CUSTOMER_LEVEL = /\b(last visit|next visit|history|all (her|his|their) (jobs|visits)|(her|his|their) jobs|visits)\b/i;
const AFFIRMATIVE = /^\s*(yes|yep|yeah|yup|y|confirm(ed)?|correct|do it|go ahead|sounds (right|good)|that'?s right|please do|ok(ay)?( do it)?|sure)\s*[.!]*\s*$/i;
const NEGATIVE = /^\s*(no|nope|nah|don'?t|never ?mind|stop|hold off|wait|not yet)\b/i;

// Intents that never depend on earlier turns: send only the current message so
// an old subject (e.g. "Lisa") can't leak into a revenue answer.
export const SELF_CONTAINED_INTENTS = new Set(['money', 'take_home', 'briefing', 'action_center', 'waiting_on', 'data_health', 'unpaid', 'test_reminder_cleanup']);

export const SEO_TOOLS = new Set(['get_seo_overview', 'get_seo_opportunities', 'get_local_search_demand', 'get_seo_competitors', 'get_seo_seasonality', 'get_customer_geography', 'get_local_authority', 'get_seo_connections', 'check_service_area', 'update_seo_recommendation']);

export const WRITE_TOOLS = new Set([
  'create_reminder', 'complete_reminder', 'cleanup_test_reminders', 'update_lead_status', 'set_lead_followup',
  'log_lead_contact', 'capture_business_note', 'resolve_business_note', 'reschedule_job', 'add_marketing_spend',
  'log_call', 'update_job_status', 'mark_job_paid', 'cancel_job', 'reopen_job', 'send_customer_email', 'update_seo_recommendation',
]);

// Names and vehicles the CURRENT message mentions explicitly.
export function extractExplicitSubjects(text) {
  const raw = String(text || '');
  const tokens = raw.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const vehicles = [];
  const names = [];
  let current = [];
  const flush = () => { if (current.length) names.push(current.join(' ')); current = []; };
  for (const t of tokens) {
    const base = t.replace(/['’]s$/i, '');
    const low = base.toLowerCase();
    if (VEHICLE_WORDS.has(low) || VEHICLE_WORDS.has(low.replace(/-/g, ''))) { flush(); vehicles.push(base); continue; }
    const capitalized = /^[A-Z][a-z]/.test(base);
    if (capitalized && !STOP.has(low)) current.push(base);
    else flush();
  }
  flush();
  // Lowercase names in typical positions ("what did red come in for",
  // "follow up with lisa", "jill's acura").
  const ownedThing = `job|jobs|car|truck|visit|estimate|invoice|appointment|${[...VEHICLE_WORDS].join('|')}`;
  const lowerPatterns = [
    /\b(?:did|about|with|for|on|cancel|reschedule)\s+([a-z][a-z'-]{1,})\b/g,
    /\b([a-z][a-z-]{1,})['’]s\b/g,
    // Phone-typed possessive without an apostrophe: "richards job", "castles acura".
    new RegExp(`\\b([a-z]{3,}?)s\\s+(?:${ownedThing})\\b`, 'g'),
  ];
  for (const re of lowerPatterns) {
    for (const m of raw.matchAll(re)) {
      const w = m[1].replace(/['’]s$/, '');
      if (!STOP.has(w) && !VEHICLE_WORDS.has(w) && !names.some(n => n.toLowerCase().split(' ').includes(w))) names.push(w);
    }
  }
  // "richards" and "richard" from the same phrase are one name.
  for (let i = names.length - 1; i >= 0; i--) {
    if (/s$/.test(names[i]) && names.includes(names[i].slice(0, -1))) names.splice(i, 1);
  }
  // Merge single words that sit next to each other in the message ("jill" + "castle").
  const flat = raw.toLowerCase().replace(/['’]s\b/g, '').replace(/\b([a-z]{3,})s\b/g, (m, w) => (names.includes(w) ? w : m));
  for (let i = 0; i < names.length - 1; i++) {
    const pair = `${names[i]} ${names[i + 1]}`;
    if (!names[i].includes(' ') && !names[i + 1].includes(' ') && flat.includes(pair.toLowerCase())) names.splice(i, 2, pair);
  }
  const years = raw.match(/\b(19|20)\d{2}\b/g) || [];
  return { names, vehicles: [...new Set(vehicles.map(v => v.toLowerCase()))], years };
}

const label = ctx => [ctx?.customer?.name, ctx?.vehicle].filter(Boolean).join(' / ');

// "Cancel job ID fake-test-id", "job GID-1718", "booking #R1".
export function extractJobId(text) {
  const m = String(text || '').match(/\b(?:job|booking)\s+(?:id\s*)?[:#]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})\b/i)
    || String(text || '').match(/\b(?:id|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})\b/i);
  const id = m?.[1];
  // Must look like an id (has a digit or a hyphen), not a word like "about".
  return id && /[\d-]/.test(id) && !/^\d{1,2}$/.test(id) ? id : null;
}

// ---- focused facts ------------------------------------------------------------
// A question about ONE fact of a job gets only that fact's fields, so the
// answer can't wander into mileage when the diagnosis was asked.

const FACETS = [
  ['diagnosis', /\b(diagnos\w*|findings?|what was wrong|what(?:'s| is) wrong|trouble codes?|dtcs?|what did (?:we|you) find)\b/i],
  ['mileage', /\b(mileage|odometer|miles)\b/i],
  ['vin', /\bvin\b/i],
  ['estimate', /\b(estimate|quote)\b[\w' ]*\b(total|amount|price|cost)\b|\bhow much (?:was|is) (?:the|his|her|their)?\s*(?:estimate|quote)\b|\bsubtotal\b|\bbefore tax\b/i],
  ['vehicle', /\bwhat (vehicle|car|truck)\b|\bwhich (vehicle|car|truck)\b/i],
];

export function detectFacet(text) {
  const hits = FACETS.filter(([, re]) => re.test(String(text || ''))).map(([k]) => k);
  return hits.length === 1 ? hits[0] : null;
}

const facetInstruction = facet => (facet ? `The owner asked only about the ${facet === 'estimate' ? 'estimate amount' : facet}. Answer with that fact only — no other job details. ` : '');

const JOB_BASE = ['id', 'customer', 'date', 'time', 'status', 'cancelled', 'vehicle', 'serviceCategory'];
const FACET_JOB_FIELDS = {
  diagnosis: ['bookingRequest', 'scopeOfWork', 'technicianNotes', 'inspection', 'photoNotes', 'scanDocuments', 'lineItems', 'evidenceFields', 'gaps', 'hints'],
  mileage: ['mileage'],
  vin: ['vin'],
  estimate: ['money'],
  vehicle: [],
};
const FACET_VEHICLE_FIELDS = { mileage: ['vehicle', 'bookingIds', 'mileageReadings', 'latestMileage'], vin: ['vehicle', 'bookingIds', 'vin', 'vinStatus', 'vins'], vehicle: ['vehicle', 'bookingIds'] };
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && k in obj).map(k => [k, obj[k]]));
const projectJob = (job, facet) => pick(job, [...JOB_BASE, ...FACET_JOB_FIELDS[facet]]);

// Strip a job/customer result down to the asked fact (identity kept for disambiguation).
export function projectForFacet(tool, result, facet) {
  if (!facet || !result || typeof result !== 'object' || result.ok === false || result.error) return result;
  if (tool === 'get_job_detail') return projectJob(result, facet);
  if (tool === 'get_vehicle_jobs') return { ...pick(result, ['vehicleQuery', 'count', 'latestJobId', 'distinctCustomers', 'note']), jobs: (result.jobs || []).map(j => projectJob(j, facet)) };
  if (tool === 'get_result_set_details' && result.type === 'jobs') return { type: 'jobs', items: (result.items || []).map(j => projectJob(j, facet)) };
  if (tool === 'get_customer_context') {
    if (result.status !== 'resolved') return result;
    return {
      ...pick(result, ['status', 'customer', 'jobCount', 'lastVisitJobId', 'nextVisitJobId', 'note']),
      ...(FACET_VEHICLE_FIELDS[facet] ? { vehicleRecords: (result.vehicleRecords || []).map(v => pick(v, FACET_VEHICLE_FIELDS[facet])) } : {}),
      jobsChronological: (result.jobsChronological || []).map(j => projectJob(j, facet)),
    };
  }
  return result;
}

// Decide how the current message relates to the saved context. Returns
// { mode, prefetch?, instruction, keepHistory }.
export function planTurn(text, ctx, intent) {
  const c = ctx || {};
  // SEO turns: no chat history (no customer context leaks in), but the
  // recommendations shown last are listed by id so "reject the second one" works.
  if (intent === 'seo') {
    const recs = c.seoResultSet?.items || [];
    return {
      mode: 'seo', keepHistory: false,
      instruction: recs.length
        ? `SEO recommendations shown in the previous answer, in order: ${recs.map((r, i) => `${i + 1}) ${r.label} [id ${r.id}]`).join('; ')}. Use these ids for update_seo_recommendation; ask if it's unclear which one is meant.`
        : 'Answer ONLY the current SEO question.',
    };
  }
  if (SELF_CONTAINED_INTENTS.has(intent)) {
    return { mode: 'self_contained', keepHistory: false, instruction: 'Answer ONLY the current message. Do not mention anything from earlier conversation.' };
  }

  if (c.pendingAction && AFFIRMATIVE.test(text)) {
    return {
      mode: 'confirm', keepHistory: true,
      prefetch: { tool: c.pendingAction.tool, input: { ...c.pendingAction.input, confirmed: true } },
      instruction: `The owner confirmed the pending ${c.pendingAction.tool}. It was executed above; report ONLY what its result says. If the result is not ok, say it failed.`,
    };
  }
  if (c.pendingAction && NEGATIVE.test(text)) {
    return { mode: 'declined', keepHistory: true, clearPending: true, instruction: `The owner declined the pending ${c.pendingAction.tool}. Nothing was changed; say so briefly.` };
  }

  const facet = detectFacet(text);
  const jobId = extractJobId(text);
  if (jobId) {
    return {
      mode: 'explicit_id', keepHistory: false, clearEntities: true, facet,
      prefetch: { tool: 'get_job_detail', input: { job_id: jobId } },
      instruction: `The message names job id ${jobId} explicitly. It is the only subject: answer or act on that id only, and if it does not exist say so and nothing else. Do not mention any other customer or job.`,
    };
  }

  const explicit = extractExplicitSubjects(text);
  if (explicit.names.length || explicit.vehicles.length) {
    const named = [...explicit.names, ...explicit.vehicles].join(', ');
    const stale = label(c);
    const base = `${facetInstruction(facet)}The current message explicitly names: ${named}. That is the subject now${stale ? ` — earlier subject (${stale}) no longer applies unless it is the same record` : ''}. Look it up fresh; never reuse facts about a different person or vehicle.`;
    // "Jill's last job" while Jill Castle is active = the same person, by id.
    const active = c.customer?.name ? c.customer.name.toLowerCase().split(' ') : [];
    if (explicit.names.length === 1 && intent !== 'notes' && explicit.names[0].toLowerCase().split(' ').every(w => active.includes(w))) {
      return { mode: 'customer', keepHistory: true, explicit, facet, prefetch: { tool: 'get_customer_context', input: c.customer.customerId ? { customer_id: c.customer.customerId } : { query: c.customer.name } }, instruction: `${facetInstruction(facet)}"${explicit.names[0]}" is ${c.customer.name} from the previous lookup; their records were re-read above.` };
    }
    if (explicit.names.length) {
      const prefetchTool = intent === 'notes' ? 'list_business_notes' : 'get_customer_context';
      const prefetchInput = intent === 'notes' ? { query: explicit.names[0], scope: 'all' } : { query: explicit.names[0] };
      return { mode: 'explicit', keepHistory: true, clearEntities: true, explicit, facet, prefetch: { tool: prefetchTool, input: prefetchInput }, instruction: base };
    }
    // Vehicle only: the active booking if it is that vehicle, else search bookings.
    const activeMatches = c.activeBookingId && c.vehicle && explicit.vehicles.every(v => c.vehicle.toLowerCase().includes(v));
    if (activeMatches && !/\b(last|latest|recent|previous)\b/i.test(text)) {
      return { mode: 'booking', keepHistory: true, explicit, facet, prefetch: { tool: 'get_job_detail', input: { job_id: c.activeBookingId } }, instruction: `${base} It matches the active booking ${c.activeBookingId}.` };
    }
    // "his Ram" / "her Acura": that person's vehicle, not every Ram on file.
    if (c.customer?.name && REFERENCE.test(text)) {
      return { mode: 'booking', keepHistory: true, explicit, facet, prefetch: { tool: 'get_vehicle_jobs', input: { vehicle: explicit.vehicles.join(' '), customer: c.customer.name } }, instruction: `${base} "${text.match(REFERENCE)[0]}" is ${c.customer.name}, so only their ${explicit.vehicles.join(' ')} jobs were read.` };
    }
    return { mode: 'explicit', keepHistory: true, clearEntities: true, explicit, facet, prefetch: { tool: 'get_vehicle_jobs', input: { vehicle: explicit.vehicles.join(' ') } }, instruction: base };
  }

  if (RESULT_SET.test(text) && c.resultSet?.items?.length) {
    return {
      mode: 'result_set', keepHistory: true,
      prefetch: { tool: 'get_result_set_details', input: { type: c.resultSet.type, ids: c.resultSet.items.map(i => i.id) } },
      instruction: `"${text.match(RESULT_SET)[0]}" means the ${c.resultSet.items.length} ${c.resultSet.type} from the previous answer (${c.resultSet.items.map(i => i.label).join('; ')}). Their current records are above — answer for each of them.`,
    };
  }

  if (REFERENCE.test(text)) {
    if (c.customer && (CUSTOMER_LEVEL.test(text) || !c.activeBookingId)) {
      return { mode: 'customer', keepHistory: true, facet, prefetch: { tool: 'get_customer_context', input: c.customer.customerId ? { customer_id: c.customer.customerId } : { query: c.customer.name } }, instruction: `${facetInstruction(facet)}The reference means ${c.customer.name} (from the previous lookup). Their records were re-read above; answer only from them.` };
    }
    if (c.activeBookingId) {
      return { mode: 'booking', keepHistory: true, facet, prefetch: { tool: 'get_job_detail', input: { job_id: c.activeBookingId } }, instruction: `${facetInstruction(facet)}The reference means booking ${c.activeBookingId}${c.vehicle ? ` (${c.vehicle})` : ''} from the previous lookup. It was re-read above; answer only from that record. If the record doesn't contain the fact asked, say it isn't on file.` };
    }
    return { mode: 'unresolved', keepHistory: true, instruction: 'The message refers to something ("that", "her", "it"…) but no record from the previous answer is active. Ask one short question to identify the customer or job. Do not guess.' };
  }

  const anchors = [];
  if (c.customer) anchors.push(`customer ${c.customer.name}${c.customer.customerId ? ` (customer_id ${c.customer.customerId})` : ''}`);
  if (c.activeBookingId) anchors.push(`booking ${c.activeBookingId}${c.vehicle ? ` (${c.vehicle})` : ''}`);
  return {
    mode: 'none', keepHistory: true,
    instruction: anchors.length ? `Active records from the previous answer (identifiers only — re-read before stating facts): ${anchors.join('; ')}.` : '',
  };
}

const okResult = call => call.ok && call.result && call.result.ok !== false && !call.result.error;
export const isSuccessfulWrite = call => WRITE_TOOLS.has(call.name) && okResult(call) && !call.result.needs_confirmation && call.result.changed !== false;

const cap = (items, n = 25) => items.slice(0, n);
const personLabel = r => `${r?.fname || ''} ${r?.lname || ''}`.trim() || r?.customer || r?.phone || r?.id;

// Carry forward record ids from this turn's successful tool results.
export function updateContext(prev, calls, { intent = null, plan = null, now = new Date() } = {}) {
  const ctx = { ...(prev || {}), domain: intent || prev?.domain || null, updatedAt: now.toISOString() };
  delete ctx.pendingAction;
  // Active SEO entity: set by a successful SEO tool call this turn, cleared by
  // any non-SEO turn, so stale SEO context can't capture later business follow-ups.
  const seoCall = calls.filter(c => okResult(c) && SEO_TOOLS.has(c.name)).pop();
  if (seoCall) ctx.activeSeo = { tool: seoCall.name, at: now.toISOString() };
  else if (intent !== 'seo') { delete ctx.activeSeo; delete ctx.seoResultSet; }
  if (plan?.clearEntities) { ctx.customer = null; ctx.activeBookingId = null; ctx.vehicle = null; ctx.resultSet = null; }

  for (const call of calls) {
    if (!okResult(call)) continue;
    const r = call.result;
    switch (call.name) {
      case 'get_customer_context':
        if (r.status === 'resolved') {
          const jobs = r.jobsChronological || [];
          const active = jobs.find(j => j.id === r.lastVisitJobId) || jobs.filter(j => !j.cancelled).slice(-1)[0] || null;
          ctx.customer = { name: r.customer?.name, customerId: r.customer?.customerId || null };
          ctx.activeBookingId = active?.id || null;
          ctx.vehicle = active?.vehicle || null;
          ctx.resultSet = jobs.length ? { type: 'jobs', items: cap(jobs.map(j => ({ id: j.id, label: `${j.date || 'no date'} ${j.vehicle || ''}`.trim() }))) } : null;
        } else if (r.status === 'ambiguous') {
          ctx.customer = null; ctx.activeBookingId = null; ctx.vehicle = null;
          ctx.resultSet = { type: 'people', items: cap((r.candidates || []).map(p => ({ id: p.key, label: p.name }))) };
        }
        break;
      case 'get_job_detail':
        ctx.activeBookingId = r.id;
        ctx.vehicle = r.vehicle || null;
        if (r.customer && r.customer !== ctx.customer?.name) ctx.customer = { name: r.customer, customerId: r.customerId || null };
        break;
      case 'get_vehicle_jobs':
        if (r.jobs?.length) {
          const latest = r.jobs.find(j => j.id === r.latestJobId) || r.jobs[0];
          ctx.activeBookingId = latest.id;
          ctx.vehicle = latest.vehicle || null;
          ctx.customer = latest.customer ? { name: latest.customer, customerId: null } : null;
          ctx.resultSet = { type: 'jobs', items: cap(r.jobs.map(j => ({ id: j.id, label: `${j.customer || ''} ${j.date || ''} ${j.vehicle || ''}`.trim() }))) };
        }
        break;
      case 'list_jobs':
        if (Array.isArray(r) && r.length) {
          ctx.resultSet = { type: 'jobs', items: cap(r.map(j => ({ id: j.id, label: `${personLabel(j)} ${j.date || ''} ${j.vehicle || ''}`.trim() }))) };
          if (r.length === 1) { ctx.activeBookingId = r[0].id; ctx.vehicle = r[0].vehicle || null; ctx.customer = { name: personLabel(r[0]), customerId: null }; }
        }
        break;
      case 'list_lead_followups':
      case 'list_leads':
        if (Array.isArray(r)) ctx.resultSet = { type: 'leads', items: cap(r.map(l => ({ id: l.id, label: personLabel(l) }))) };
        break;
      case 'list_business_notes':
        if (Array.isArray(r)) ctx.resultSet = { type: 'notes', items: cap(r.map(n => ({ id: n.id, label: n.contact_name || n.summary }))) };
        break;
      case 'get_unpaid_jobs':
        if (r.jobs) ctx.resultSet = { type: 'jobs', items: cap(r.jobs.map(j => ({ id: j.id, label: `${j.customer || ''} ${j.vehicle || ''}`.trim() }))) };
        break;
      case 'get_revenue_summary':
        ctx.periods = [...(ctx.periods || []), r.periodKey].filter(Boolean).slice(-2);
        break;
      case 'get_seo_opportunities':
        if (Array.isArray(r)) ctx.seoResultSet = { type: 'seo_recommendations', items: cap(r.map(x => ({ id: x.id, label: x.title }))) };
        break;
      case 'compare_revenue_periods':
        ctx.resultSet = { type: 'jobs', items: cap((r.differences || []).map(d => ({ id: d.bookingId, label: `${d.customer || ''} ${d.vehicle || ''}`.trim() }))) };
        break;
      case 'mark_job_paid':
      case 'cancel_job':
      case 'reopen_job':
        if (r.needs_confirmation) ctx.pendingAction = { tool: call.name, input: { ...call.input, confirmed: false } };
        if (call.input?.job_id) ctx.activeBookingId = call.input.job_id;
        break;
      default:
        break;
    }
  }
  return ctx;
}

// ---- success-claim guard --------------------------------------------------

const CLAIM_PATTERNS = [
  /^\s*(done|saved|all set|updated|recorded|sent|cancell?ed|noted|logged|booked)\b\s*[.!,—–-]/i,
  /\b(i'?ve|i have|i)\s+(just\s+|now\s+|also\s+)?(updated|cancell?ed|recorded|saved|sent|changed|marked|rescheduled|logged|created|noted|moved|emailed|added|resolved|closed|deleted|booked|reopened)\b/i,
  /\b(job )?status (is )?updated\b/i,
  /\b(cancellation|payment|note|reminder|call|spend) (noted|recorded|saved|logged|created|added)\b/i,
  /\boff the books\b/i,
];

export function claimsWriteSuccess(text) {
  return CLAIM_PATTERNS.some(re => re.test(String(text || '')));
}

// The final answer may only claim a write if one actually succeeded this turn.
export function guardFinalText(text, calls) {
  if (!claimsWriteSuccess(text) || calls.some(isSuccessfulWrite)) return { text, overridden: false };
  const failed = calls.filter(c => WRITE_TOOLS.has(c.name) && !okResult(c));
  const pending = calls.filter(c => WRITE_TOOLS.has(c.name) && okResult(c) && c.result.needs_confirmation);
  let msg = 'Nothing was changed — no update actually went through.';
  if (failed.length) msg += ` The attempt failed: ${failed.map(c => c.result?.error || c.error || 'unknown error').join('; ')}.`;
  else if (pending.length) msg += ` ${pending[0].result.summary} Reply yes to confirm.`;
  else msg += ' Tell me exactly what to change and I will do it and confirm the result.';
  return { text: msg, overridden: true };
}
