// Jarvis workspace: the one state machine behind every visual answer on
// /jarvis (job cards, calendar, revenue charts, job/customer lists), plus the
// deterministic parser for commands about what is already on screen
// ("close it", "open the middle one", "payment", "53 days").
//
// Pure — no I/O, no clock (callers pass `today`). The React side
// (src/command-center/workspace/) renders the top of the stack; the backend
// (admin-ai-chat.js, jarvis-business.js) emits the same actions as `ui` events.
// Tests: tests/jarvis-workspace.test.js.

export const JOB_TABS = ['overview', 'estimate', 'payment', 'inspection', 'notes', 'parts'];
export const CALENDAR_MODES = ['day', 'week', 'month'];
export const INITIAL_WORKSPACE = { stack: [] };

const MAX_STACK = 4;
const MAX_JOBS = 12;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const top = state => state.stack[state.stack.length - 1] || null;
const replaceTop = (state, view) => ({ stack: [...state.stack.slice(0, -1), view] });

// Normalize a view from any source (backend event, click) into a safe shape.
export function normalizeView(v) {
  if (!v || typeof v !== 'object') return null;
  switch (v.type) {
    case 'jobs': {
      const jobIds = [...new Set((Array.isArray(v.jobIds) ? v.jobIds : []).map(String).filter(Boolean))].slice(0, MAX_JOBS);
      if (!jobIds.length) return null;
      const tab = JOB_TABS.includes(v.tab) ? v.tab : 'overview';
      const focus = clamp(Number.isInteger(v.focus) ? v.focus : Math.floor((jobIds.length - 1) / 2), 0, jobIds.length - 1);
      return {
        type: 'jobs', jobIds, focus, expanded: jobIds.length === 1 || !!v.expanded || v.tab != null, tab,
        title: v.title ? String(v.title).slice(0, 80) : null,
        // family: already widened to the customer's other jobs (see 'context').
        family: !!v.family,
      };
    }
    case 'analytics':
      return { type: 'analytics', range: v.range && typeof v.range === 'object' ? v.range : { period: 'this_month' } };
    case 'calendar':
      return { type: 'calendar', date: /^\d{4}-\d{2}-\d{2}$/.test(String(v.date || '')) ? v.date : null, mode: CALENDAR_MODES.includes(v.mode) ? v.mode : 'week' };
    case 'jobList':
      return { type: 'jobList', query: String(v.query || '').slice(0, 80), status: String(v.status || 'active') };
    case 'customers':
      return { type: 'customers', query: String(v.query || '').slice(0, 80) };
    case 'newJob':
      return { type: 'newJob' };
    case 'settings':
      return { type: 'settings' };
    // Feed panels (functions/_lib/jarvis-feeds.js): the daily brief, Google
    // reviews, Facebook/Instagram, email. `open` picks one email in the mail panel.
    case 'brief': case 'reviews': case 'social': case 'mail': case 'messages':
      return { type: v.type, ...((v.type === 'mail' || v.type === 'messages') && v.open ? { open: String(v.open).slice(0, 80) } : {}) };
    case 'leads':
      return { type: 'leads', query: String(v.query || '').slice(0, 80), status: String(v.status || 'open'), ...(v.open ? { open: String(v.open).slice(0, 80) } : {}) };
    default:
      return null;
  }
}

// Drill-down views (a list or calendar opening a job) stack so "close it"
// returns to where you were; anything else replaces what's open.
const BROWSERS = new Set(['calendar', 'jobList', 'customers']);

export function workspaceReduce(state, action) {
  const t = top(state);
  switch (action?.type) {
    case 'open': {
      const view = normalizeView(action.view);
      if (!view) return state;
      if (t && view.type === 'jobs' && BROWSERS.has(t.type)) return { stack: [...state.stack, view].slice(-MAX_STACK) };
      // The brief is a hub: whatever it opens stacks, so "close" returns to the brief.
      if (t?.type === 'brief' && view.type !== 'brief') return { stack: [...state.stack, view].slice(-MAX_STACK) };
      if (state.stack[0]?.type === 'brief' && view.type !== 'brief' && t.type !== 'jobs') return replaceTop(state, view);
      if (t && t.type === view.type) return replaceTop(state, view);
      return { stack: [view] };
    }
    // A single job was opened (from a list, the calendar, the dashboard or one
    // Jarvis match): widen it to the customer's jobs so "job 3", "Sep 26",
    // "next" and "the brake one" work the same everywhere. Applies only while
    // that same single job is still what's on screen.
    case 'context': {
      if (t?.type !== 'jobs' || t.family || t.jobIds.length !== 1 || t.jobIds[0] !== action.forId) return state;
      const jobIds = [...new Set((action.jobIds || []).map(String))].slice(0, MAX_JOBS);
      const focus = jobIds.indexOf(action.forId);
      if (focus < 0) return replaceTop(state, { ...t, family: true });
      return replaceTop(state, { ...t, jobIds, focus, family: true, title: t.title || (action.title ? String(action.title).slice(0, 80) : null) });
    }
    case 'close':
      if (!t) return state;
      if (t.type === 'jobs' && t.expanded && t.jobIds.length > 1) return replaceTop(state, { ...t, expanded: false });
      return { stack: state.stack.slice(0, -1) };
    case 'close_all':
      return INITIAL_WORKSPACE;
    case 'focus':
      if (t?.type !== 'jobs') return state;
      return replaceTop(state, { ...t, focus: clamp(Number(action.index) || 0, 0, t.jobIds.length - 1), expanded: action.expand ?? t.expanded, ...(JOB_TABS.includes(action.tab) ? { tab: action.tab, expanded: true } : {}) });
    case 'step':
      if (t?.type !== 'jobs') return state;
      return replaceTop(state, { ...t, focus: clamp(t.focus + (Number(action.delta) || 0), 0, t.jobIds.length - 1) });
    case 'tab':
      if (t?.type !== 'jobs' || !JOB_TABS.includes(action.tab)) return state;
      return replaceTop(state, { ...t, tab: action.tab, expanded: true });
    case 'range':
      if (t?.type !== 'analytics' || !action.range) return state;
      return replaceTop(state, { ...t, range: action.range });
    case 'calendar':
      if (t?.type !== 'calendar') return state;
      return replaceTop(state, { ...t, ...(action.date ? { date: action.date } : {}), ...(CALENDAR_MODES.includes(action.mode) ? { mode: action.mode } : {}) });
    case 'filter':
      if (t?.type !== 'jobList' && t?.type !== 'customers' && t?.type !== 'leads') return state;
      return replaceTop(state, { ...t, ...('query' in action ? { query: String(action.query || '') } : {}), ...('status' in action ? { status: String(action.status) } : {}) });
    default:
      return state;
  }
}

export const workspaceTop = top;

// ---- a customer's jobs ---------------------------------------------------------------

const digits10 = s => String(s || '').replace(/\D/g, '').slice(-10);
const fullName = j => `${j?.fname || ''} ${j?.lname || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
const cancelled = j => String(j?.status || '').toLowerCase() === 'cancelled' || j?.jobStatus === 'CANCELLED';

// The jobs that belong to the same customer as `id`, oldest -> newest, at most
// 12 around it. Same person = same customer file; for older jobs without one,
// the same full name and phone. Never guesses on a first name alone.
// list: the admin job list (camelCase Job rows).
export function jobFamily(list, id) {
  const target = (list || []).find(j => j.id === id);
  if (!target) return [id];
  const name = fullName(target);
  const phone = digits10(target.phone);
  const same = j => {
    if (j.id === id) return true;
    if (target.customerId && j.customerId) return j.customerId === target.customerId;
    return !!name && name.includes(' ') && fullName(j) === name && (!phone || !digits10(j.phone) || digits10(j.phone) === phone);
  };
  const fam = list.filter(j => same(j) && j.status !== 'deleted' && (j.id === id || !cancelled(j) || cancelled(target)))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));
  const at = fam.findIndex(j => j.id === id);
  const start = clamp(at - Math.floor(MAX_JOBS / 2), 0, Math.max(0, fam.length - MAX_JOBS));
  return fam.slice(start, start + MAX_JOBS).map(j => j.id);
}

// ---- spoken numbers and dates -------------------------------------------------------

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
const CARD = `(?:(?:${Object.keys(TENS).join('|')})(?:[ -](?:${UNITS.slice(1, 10).join('|')}))?|${UNITS.join('|')})`;
const ORD = `(?:(?:twenty|thirty)[ -](?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|${Object.keys(ORD_UNITS).join('|')})`;
function cardinal(w) {
  const [a, b] = w.split(/[ -]/);
  if (a in TENS) return TENS[a] + (b ? UNITS.indexOf(b) : 0);
  return UNITS.indexOf(a);
}
function ordinal(w) {
  const [a, b] = w.split(/[ -]/);
  return b ? TENS[a] + ORD_UNITS[b] : ORD_UNITS[a];
}
const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';

// Speech-to-text often spells numbers out. Turn them into digits only where a
// number is clearly meant (dates, counts of days/weeks, "job three"), so
// "the brake one" stays a word.
function spokenNumbers(t) {
  return t
    .replace(new RegExp(`\\b(${MONTH_RE}) (?:the )?(${ORD})\\b`, 'g'), (_, m, o) => `${m} ${ordinal(o)}th`)
    .replace(new RegExp(`\\b(${MONTH_RE}) (${CARD})\\b`, 'g'), (_, m, c) => `${m} ${cardinal(c)}`)
    .replace(new RegExp(`\\b(${CARD}) (days?|weeks?|months?)\\b`, 'g'), (_, c, u) => `${cardinal(c)} ${u}`)
    .replace(/\b(?:a|one) (?:couple|couple of) (days?|weeks?|months?)\b/g, '2 $1')
    .replace(/\ba (day|week|month)\b/g, '1 $1')
    .replace(new RegExp(`\\b(job|card|number) (?:number )?(${CARD})\\b`, 'g'), (_, k, c) => `${k} ${cardinal(c)}`)
    // "the twenty sixth" (6th and up; "the third" stays a card position)
    .replace(new RegExp(`\\bthe (${ORD})\\b`, 'g'), (all, o) => (ordinal(o) >= 6 ? `the ${ordinal(o)}th` : all));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad2 = x => String(x).padStart(2, '0');
// { month: 'MM' | null, day: 'DD' } from "sep 26", "september 26th", "9/26", "the 26th".
export function spokenDate(c) {
  const s = spokenNumbers(String(c || '').toLowerCase());
  let m = s.match(new RegExp(`\\b(${MONTH_RE}) (\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (m) return { month: pad2(MONTHS.indexOf(m[1].slice(0, 3)) + 1), day: pad2(m[2]) };
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return { month: pad2(m[1]), day: pad2(m[2]) };
  m = s.match(/(?:^|\bthe )(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) return { month: null, day: pad2(m[1]) };
  return null;
}
// A spoken date as YYYY-MM-DD relative to today: prefer 'future' (calendar) or
// 'past' (revenue). "the 3rd" uses this month, moved a month if needed.
export function spokenYmd(c, today, prefer = 'future') {
  const d = spokenDate(c);
  if (!d || !today) return null;
  let [y, m] = today.split('-').map(Number);
  if (d.month) m = Number(d.month);
  const make = () => `${y}-${pad2(m)}-${d.day}`;
  let ymd = make();
  if (prefer === 'future' && ymd < today) { if (d.month) y += 1; else { m += 1; if (m > 12) { m = 1; y += 1; } } ymd = make(); }
  if (prefer === 'past' && ymd > today) { if (d.month) y -= 1; else { m -= 1; if (m < 1) { m = 12; y -= 1; } } ymd = make(); }
  const [yy, mm, dd] = ymd.split('-').map(Number);
  const probe = new Date(Date.UTC(yy, mm - 1, dd));
  return probe.getUTCMonth() === mm - 1 && probe.getUTCDate() === dd ? ymd : null;
}

// ---- calendar words -> date + mode ------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const shift = (ymd, days) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10); };
const shiftMonth = (ymd, k) => { const [y, m] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1, 12)).toISOString().slice(0, 10); };
const dow = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay();

// "today", "tomorrow", "friday", "next friday", "this week", "next week",
// "next month", "october 3rd", "the 3rd", "2026-10-02" -> { date, mode } or null.
// `today` is the Arizona date.
export function resolveCalendarWhen(when, today) {
  const w = String(when || '').toLowerCase().trim().replace(/^(on|for)\s+/, '');
  if (!w) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return { date: w, mode: 'day' };
  if (w === 'today' || w === 'tonight') return { date: today, mode: 'day' };
  if (w === 'tomorrow') return { date: shift(today, 1), mode: 'day' };
  if (w === 'yesterday') return { date: shift(today, -1), mode: 'day' };
  if (/^(this )?week$/.test(w)) return { date: today, mode: 'week' };
  if (w === 'next week') return { date: shift(today, 7), mode: 'week' };
  if (w === 'last week') return { date: shift(today, -7), mode: 'week' };
  if (/^(this )?month$/.test(w)) return { date: today, mode: 'month' };
  if (w === 'next month') return { date: shiftMonth(today, 1), mode: 'month' };
  if (w === 'last month') return { date: shiftMonth(today, -1), mode: 'month' };
  const wd = w.match(/^(this |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/);
  if (wd) {
    const target = WEEKDAYS.findIndex(d => d.startsWith(wd[2].slice(0, 3)));
    let ahead = (target - dow(today) + 7) % 7; // "friday" on a Friday = today
    if (wd[1] === 'next ' && ahead === 0) ahead = 7;
    return { date: shift(today, ahead), mode: 'day' };
  }
  const month = w.match(new RegExp(`^(${MONTH_RE})$`));
  if (month) { const m = MONTHS.indexOf(month[1].slice(0, 3)) + 1; const [y, tm] = today.split('-').map(Number); return { date: `${m < tm ? y + 1 : y}-${pad2(m)}-01`, mode: 'month' }; }
  const date = spokenYmd(w, today, 'future');
  return date ? { date, mode: 'day' } : null;
}

// ---- on-screen commands -----------------------------------------------------------

const CLOSE_ONE = /^(?:close|dismiss|hide|collapse|shrink)(?: (?:it|that|this|the job|this job|that job|the (?:estimate|payment|inspection|notes|parts|overview|tab)))?$|^(?:go )?back$|^never ?mind$|^(?:go )?back (?:one|a step|up)$/;
const CLOSE_ALL = /^(?:close|dismiss|hide|clear|get rid of|exit|close out)(?: (?:all|everything|all jobs|all (?:of )?(?:these|them|those)(?: jobs)?|(?:the )?jobs|these(?: jobs)?|them|those|(?:the )?(?:calendar|chart|graph|analytics|revenue(?: chart)?|customers|customer list|job list|list|screen|overlay|windows?)))?$|^(?:(?:go )?back to|return to|take me) (?:jarvis|home|the dashboard|dashboard|main|normal|the main screen)$|^(?:i'm done|im done|i am done|that's all|thats all|all done|go home|home|dashboard|main screen)$/;
const TAB_WORDS = {
  overview: 'overview', summary: 'overview', details: 'overview', services: 'overview', status: 'overview', totals: 'overview', customer: 'overview', vehicle: 'overview',
  estimate: 'estimate', quote: 'estimate', 'line items': 'estimate', 'scope of work': 'estimate',
  payment: 'payment', payments: 'payment', pay: 'payment', billing: 'payment', invoice: 'payment', balance: 'payment', receipt: 'payment',
  inspection: 'inspection', diagnostics: 'inspection', diagnostic: 'inspection', dtc: 'inspection', codes: 'inspection', 'trouble codes': 'inspection',
  tires: 'inspection', 'tire pressure': 'inspection', 'tread depth': 'inspection', scan: 'inspection', scans: 'inspection', 'scan report': 'inspection', 'scan reports': 'inspection',
  notes: 'notes', 'diagnostic notes': 'notes', 'tech notes': 'notes', 'technician notes': 'notes', 'customer notes': 'notes', photos: 'notes', 'photo notes': 'notes', pictures: 'notes',
  parts: 'parts', 'parts cost': 'parts', receipts: 'parts', 'parts receipts': 'parts',
};
const ORDINALS = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
const ORDINAL_WORDS = new Set([...Object.keys(ORDINALS), 'last', 'middle', 'center', 'centre', 'left', 'right', 'newest', 'latest', 'oldest', 'most recent', 'earliest', 'recent']);
const STOP = new Set(['the', 'one', 'job', 'jobs', 'that', 'this', 'from', 'with', 'for', 'on', 'of', 'a', 'an', 'me', 'up', 'did', 'was', 'where', 'we', 'had', 'her', 'his', 'their']);
const SYNONYMS = {
  brake: ['brake', 'rotor', 'pad', 'caliper'], oil: ['oil'], diagnostic: ['diag'], diag: ['diag'],
  transmission: ['transmission', 'trans'], trans: ['transmission', 'trans'], tire: ['tire', 'tread'], battery: ['battery'],
  suspension: ['suspension', 'strut', 'shock', 'control arm'], coolant: ['coolant', 'radiator'], radiator: ['radiator', 'coolant'],
  alternator: ['alternator'], starter: ['starter'], spark: ['spark plug', 'ignition'], audio: ['audio', 'speaker', 'stereo'],
};
const PERIODS = {
  today: { period: 'today' }, yesterday: { period: 'yesterday' }, 'this week': { last_days: 7 }, 'last week': { last_days: 7 }, 'past week': { last_days: 7 },
  'this month': { period: 'this_month' }, 'last month': { period: 'last_month' }, 'this year': { period: 'this_year' }, 'year to date': { period: 'this_year' }, ytd: { period: 'this_year' },
};
const LIST_STATUS = {
  all: 'all', everything: 'all', 'all of them': 'all', every: 'all', 'all jobs': 'all',
  active: 'active', open: 'active', current: 'active',
  unpaid: 'unpaid', owed: 'unpaid', outstanding: 'unpaid', 'who owes': 'unpaid', due: 'unpaid', 'owes me': 'unpaid',
  paid: 'PAID', cancelled: 'CANCELLED', canceled: 'CANCELLED',
  booked: 'BOOKED', 'estimate sent': 'ESTIMATE_SENT', estimates: 'ESTIMATE_SENT', signed: 'SIGNED',
  'in progress': 'IN_PROGRESS', completed: 'COMPLETED', done: 'COMPLETED', invoiced: 'INVOICED',
  'parts missing': 'noParts', 'missing parts': 'noParts', 'missing parts cost': 'noParts', 'no parts cost': 'noParts', 'parts checklist': 'noParts', 'parts cost missing': 'noParts',
};

// Global, deterministic commands (no AI tokens): modes and the main screens.
const HOME_RE = /^(?:(?:go |switch |take me |head )?back (?:to )?|return to |go to |switch to |take me to |take me |open )?(?:jarvis|home|the dashboard|dashboard|the main screen|main screen|main|normal|ops|ops mode|operations)$|^(?:go home|home)$/;
const SEO_RE = /^(?:(?:switch|go|jump|flip|change|head) (?:over )?(?:back )?to |open |show (?:me )?|enter |take me to |pull up )?(?:the )?(?:seo|local seo|local search|search console)(?: mode| page| dashboard| center| command center| screen| view| tab)?$/;
const OPEN_VERB = '(?:open|show|pull up|go to|bring up|take me to|switch to|view)(?: me)?(?: the| my)?';
const GLOBAL_OPENS = [
  [new RegExp(`^${OPEN_VERB} (?:calendar|schedule)$|^(?:calendar|schedule)$`), { type: 'calendar', mode: 'week' }],
  [new RegExp(`^${OPEN_VERB} all(?: the| of the| my)? jobs$|^all jobs$`), { type: 'jobList', status: 'all' }],
  [new RegExp(`^${OPEN_VERB} (?:jobs|job list|jobs list|work orders)$`), { type: 'jobList', status: 'active' }],
  [new RegExp(`^${OPEN_VERB} (?:customers|customer list|clients)$|^customers$`), { type: 'customers' }],
  // Done jobs whose parts cost was never entered (needsPartsCost).
  [new RegExp(`^(?:${OPEN_VERB} )?(?:(?:the )?parts(?: cost)? checklist|(?:jobs |which jobs (?:are |have )?)?(?:missing|without|with no|with missing|need(?:ing)?) parts(?: costs?)?|unrecorded parts(?: costs?)?)$`), { type: 'jobList', status: 'noParts' }],
  [new RegExp(`^${OPEN_VERB} settings$|^settings$`), { type: 'settings' }],
  [/^(?:new job|create a (?:new )?job|add a (?:new )?job|start a new job|new customer|add a customer)$/, { type: 'newJob' }],
];

// Conversational wrapping around the thing being asked for: "back to overview",
// "take me to the payment tab", "can you pull up the Sep 26 job".
const LEAD_FILLER = /^(?:can you|could you|would you|will you|let's|lets|let me|i want to|i wanna|i'd like to|i need to|i need|take me|bring me|what about|how about|graph|chart|plot|go|head|switch|flip|jump|move|pull|bring|open|show|see|view|check|look at|look|give me|display|back|over|up|to|into|on|at|the|me|us|its|it's|his|her|their|that|this|just|and|then|now|also|instead|for|of)\b\s*/;
const TRAIL_FILLER = /\s*\b(?:tab|page|section|screen|info|again|one|job|jobs|card|please|instead|filter|only|ones|view|then|too|instead)$/;
function core(t) {
  let s = t; let prev;
  do { prev = s; s = s.replace(LEAD_FILLER, ''); } while (s && s !== prev);
  do { prev = s; s = s.replace(TRAIL_FILLER, ''); } while (s && s !== prev);
  return s.trim() || t;
}

function clean(text) {
  return spokenNumbers(String(text || '').toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^(?:(?:ok(?:ay)?|hey|yo|alright|all right|and|so|um|uh)[\s,]+)*(?:jarvis\b[\s,]*)?/, '')
    .replace(/\b(?:please|pls|for me|real quick|right now)\b/g, ' ')
    .replace(/[.!?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

// Revenue period words: "13 days", "two weeks", "3 months", "since sep 10",
// "from sep 1 to sep 15", "september", "this month".
function revenueRange(c, t, today) {
  const n = c.match(/^(?:last |past |previous )?(\d{1,4}) (day|week|month)s?(?: of revenue| revenue)?$/);
  if (n && Number(n[1]) >= 1) {
    const k = Number(n[1]);
    return n[2] === 'month' ? { last_months: k } : { last_days: n[2] === 'week' ? k * 7 : k };
  }
  const p = PERIODS[c.replace(/^revenue (?:for )?/, '').replace(/ revenue$/, '')];
  if (p) return p;
  const between = t.match(/\bfrom (.+?) (?:to|through|thru|until) (.+)$/);
  if (between && today) {
    const from = spokenYmd(between[1], today, 'past'); const to = spokenYmd(between[2], today, 'past');
    if (from && to) return { from, to };
  }
  const since = t.match(/\b(?:since|starting|from) (.+)$/);
  if (since && today) { const from = spokenYmd(since[1], today, 'past'); if (from) return { from }; }
  const month = c.match(new RegExp(`^(?:revenue (?:for |in )?)?(${MONTH_RE})(?: revenue)?$`));
  if (month) return { month: month[1] };
  return null;
}

// Returns a workspace action (or { type: 'noop', reply }) when the message is
// clearly about what's on screen, else null (the AI handles it).
// meta: per visible job, in jobIds order: { label, date } for "the brake one" / "newest".
export function parseLocalCommand(text, state, { meta = [], today } = {}) {
  const t = clean(text);
  if (!t || t.split(' ').length > 12) return null;
  const view = top(state);

  if (HOME_RE.test(t)) return { type: 'home' };
  if (SEO_RE.test(t)) return { type: 'mode', mode: 'seo' };
  for (const [re, target] of GLOBAL_OPENS) if (re.test(t) && view?.type !== target.type) return { type: 'open', view: { ...target } };

  if (CLOSE_ALL.test(t) && !CLOSE_ONE.test(t)) return view ? { type: 'close_all' } : { type: 'noop', reply: 'Nothing is open.' };
  if (CLOSE_ONE.test(t)) return view ? { type: 'close' } : { type: 'noop', reply: 'Nothing is open.' };
  if (!view) return null;
  const c = core(t);

  if (view.type === 'jobs') {
    const n = view.jobIds.length;
    // "the diagnostic one" / "the diagnostic job" picks a job; "diagnostic" alone is the tab.
    if (TAB_WORDS[c] && !/\b(?:one|job)$/.test(t)) return { type: 'tab', tab: TAB_WORDS[c] };
    if (/^(?:next|next job|go right|swipe left|forward|the next|one after|after that)$/.test(c)) return { type: 'step', delta: 1 };
    if (/^(?:previous|prev|go left|swipe right|the previous|one before|before that|last job before)$/.test(c)) return { type: 'step', delta: -1 };
    if (/^(?:it|zoom in|expand|expand it|zoom in on it|full screen|bigger)$/.test(c) || /^(?:open|expand|zoom in on|show) (?:it|that|this one|that one)$/.test(t)) return { type: 'focus', index: view.focus, expand: true };
    const num = c.match(/^(?:(?:job|card) )?(?:number |# ?|no\.? )?(\d{1,2})$/);
    if (num && !/(?:st|nd|rd|th)$/.test(c) && Number(num[1]) >= 1 && Number(num[1]) <= n) return { type: 'focus', index: Number(num[1]) - 1, expand: true };
    if (ORDINAL_WORDS.has(c)) {
      const dated = meta.map((m, i) => ({ i, d: String(m?.date || '') }));
      let index;
      if (c in ORDINALS) index = ORDINALS[c];
      else if (c === 'last') index = n - 1;
      else if (c === 'middle' || c === 'center' || c === 'centre') index = Math.floor((n - 1) / 2);
      else if (c === 'left') index = view.focus - 1;
      else if (c === 'right') index = view.focus + 1;
      else if (dated.length === n) {
        const sorted = [...dated].sort((a, b) => a.d.localeCompare(b.d));
        index = (c === 'oldest' || c === 'earliest' ? sorted[0] : sorted[sorted.length - 1]).i;
      }
      return index != null && index >= 0 && index < n ? { type: 'focus', index, expand: true } : null;
    }
    if (meta.length !== n) return null;
    // "the Sep 26 job", "September twenty sixth", "the 26th", "9/26"
    const day = spokenDate(c);
    if (day) {
      const hits = meta.map((m, i) => ({ i, d: String(m?.date || '') })).filter(m => (day.month ? m.d.slice(5) === `${day.month}-${day.day}` : m.d.slice(8) === day.day));
      if (hits.length === 1) { const tab = tabIn(c); return { type: 'focus', index: hits[0].i, expand: true, ...(tab ? { tab } : {}) }; }
      return null; // none or several on that date: Jarvis decides with the screen context
    }
    // "the brake one", "that oil change job", "the brake job's payment" (brake also means rotors/pads)
    // First read tab words as a tab ("the brake job's payment"); if that leaves
    // no unique job, read them as part of the job ("the diagnostic one").
    const all = c.replace(/'s\b/g, '').split(' ').filter(w => w.length >= 3 && !STOP.has(w));
    const labels = meta.map((m, i) => ({ i, l: String(m?.label || '').toLowerCase() }));
    const has = (l, w) => (SYNONYMS[w] || SYNONYMS[w.replace(/s$/, '')] || [w.replace(/s$/, '')]).some(x => l.includes(x));
    const match = words => (words.length ? labels.filter(m => words.every(w => has(m.l, w))) : []);
    const tab = tabIn(c);
    const withTab = match(all.filter(w => !TAB_WORDS[w]));
    if (withTab.length === 1) return { type: 'focus', index: withTab[0].i, expand: true, ...(tab ? { tab } : {}) };
    const asJob = match(all);
    if (asJob.length === 1) return { type: 'focus', index: asJob[0].i, expand: true };
    return null;
  }

  // Jobs list: the same chips as the screen (Active / Unpaid / Paid / Cancelled / All),
  // pipeline stages, and search ("find Jill", "search Acura", "clear search").
  if (view.type === 'jobList' || view.type === 'customers' || view.type === 'leads') {
    if (/^(?:clear|reset)(?: the)? (?:search|filters?)$|^(?:show )?(?:everyone|everybody)$/.test(t)) return { type: 'filter', query: '' };
    if (view.type === 'jobList') {
      const status = LIST_STATUS[c];
      if (status) return { type: 'filter', status };
    }
    const find = t.match(/^(?:search|find|look up|lookup|filter|search for|find me|show me|show|filter by|filter for)(?: for| by)? (.+)$/);
    if (find && !LIST_STATUS[core(find[1])]) return { type: 'filter', query: find[1].replace(/^(?:the |a )/, '').replace(/'s(?: jobs?)?$/, '').replace(/ jobs?$/, '') };
    return null;
  }

  if (view.type === 'analytics') {
    const range = revenueRange(c, t, today);
    return range ? { type: 'range', range } : null;
  }

  if (view.type === 'calendar' && today) {
    const mode = c.match(/^(?:by )?(day|week|month)(?: view)?$/);
    if (mode) return { type: 'calendar', mode: mode[1] };
    const base = view.date || today;
    const step = view.mode === 'month' ? (k => shiftMonth(base, k)) : (k => shift(base, (view.mode === 'week' ? 7 : 1) * k));
    if (/^(?:next|forward|next one|after that)$/.test(c)) return { type: 'calendar', date: step(1) };
    if (/^(?:previous|prev|before that|earlier|previous one)$/.test(c)) return { type: 'calendar', date: step(-1) };
    const r = resolveCalendarWhen(c.replace(/^(?:what do i have|what's on|whats on|what is on|what have i got)(?: on)? /, ''), today);
    if (r) return { type: 'calendar', ...r };
  }
  return null;
}

function tabIn(c) {
  const hit = Object.keys(TAB_WORDS).sort((a, b) => b.length - a.length).find(k => new RegExp(`\\b${k}\\b`).test(c));
  return hit ? TAB_WORDS[hit] : null;
}

// What's on screen, for the backend prompt, so the model can resolve "the
// brake one" / "its payment" to a real job id. Plain data only.
export function describeScreen(state, meta = []) {
  const v = top(state);
  if (!v) return null;
  if (v.type === 'jobs') {
    return {
      view: 'jobs', expanded: v.expanded, tab: v.tab, focusedJobId: v.jobIds[v.focus], customer: v.title || null,
      jobs: v.jobIds.map((id, i) => ({ position: i + 1, id, ...(meta[i] ? { label: String(meta[i].label || '').slice(0, 120), date: meta[i].date || null } : {}) })),
    };
  }
  if (v.type === 'analytics') return { view: 'analytics', range: v.range };
  if (v.type === 'calendar') return { view: 'calendar', date: v.date, mode: v.mode };
  return { view: v.type, query: v.query || '', ...(v.status ? { status: v.status } : {}) };
}

// A spoken sentence the page parser couldn't place but that is clearly about
// the open view ("pull up the one with the new rotors", "revenue since the
// tenth", "what about the week after"). Those go to the text Jarvis with the
// screen context (silently: the voice agent already acknowledged), so voice
// follow-ups get the same understanding as typed ones. Anything that starts a
// new topic stays with the voice agent.
const REFERS = {
  jobs: /\b(?:one|job|card|tab|overview|estimate|quote|payment|paid|inspection|notes?|parts|summary|details|first|second|third|last|middle|newest|oldest|left|right|next|previous|back|brake|oil|rotor|pads?|diag\w*|transmission|tires?|photos?|invoice|receipts?)\b|\b\d{1,2}(?:st|nd|rd|th)?\b/,
  analytics: /\b(?:days?|weeks?|months?|year|since|from|through|until|today|yesterday|chart|graph|compare|previous|before)\b|\b\d/,
  calendar: /\b(?:day|week|month|today|tomorrow|yesterday|next|previous|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|appointment|slot)\b|\b\d{1,2}(?:st|nd|rd|th)?\b/,
  jobList: /\b(?:all|active|unpaid|paid|cancel+ed|booked|signed|completed|invoiced|estimates?|progress|search|find|filter|show|only|ones)\b/,
  customers: /\b(?:search|find|filter|show|customer|everyone)\b/,
};
const NEW_TOPIC = /\b(?:remind|reminder|text|email|call|book|reschedule|cancel|mark|note that|log|lead|leads|seo|rankings?|take[- ]?home|owner pay)\b/;
export function isScreenFollowUp(text, state) {
  const t = clean(text);
  const v = top(state);
  const refers = v && REFERS[v.type];
  return !!t && !!refers && t.split(' ').length <= 14 && refers.test(t) && !NEW_TOPIC.test(t);
}

// ---- requests the server can answer exactly WITHOUT Claude ------------------------
// (functions/_lib/jarvis-fastpath.js). Narrow on purpose: anything that isn't a
// plain "show me revenue / the schedule / someone's jobs" returns null and goes
// to Claude as before.

const REVENUE_ASK = /\b(?:revenue|sales|takings|collected|how much (?:money )?(?:have we|did we|did i|have i|we've|i've) (?:made|make|done|do|brought in|collect(?:ed)?|take in|taken in))\b/;
const NOT_SIMPLE = /\b(?:why|difference|differ|compare|versus|vs|take[- ]?home|owner pay|profit|by (?:source|channel|customer|service)|which|breakdown|lower|higher|per job|average|forecast|projected|goal|target|if|should|could|would|how many)\b/;
export function parseRevenueRequest(text, today) {
  const t = clean(text);
  if (!REVENUE_ASK.test(t) || NOT_SIMPLE.test(t) || t.split(' ').length > 14) return null;
  const rest = t
    .replace(/^(?:what(?:'s| is| was| are)|show(?: me)?|give me|pull up|bring up|how(?:'s| is| are)|tell me|graph|chart|open|display)\s+/, '')
    .replace(/\b(?:my|our|the|total|gross|revenue|sales|takings|collected|so far|how much|money|have we|did we|did i|have i|we've|i've|made|make|done|do|brought in|take in|taken in|collect|been|looking|look like|like|numbers?|chart|graph|for|in|over|during|of)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!rest) return { period: 'this_month' };
  // The leftover is the period ("this month", "last 13 days", "august", "since sep 10").
  return revenueRange(rest, rest, today);
}

const WHEN_RE = new RegExp(String.raw`\b(today|tonight|tomorrow|yesterday|this week|next week|last week|this month|next month|(?:next |this )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|${MONTH_RE} \d{1,2}(?:st|nd|rd|th)?|the \d{1,2}(?:st|nd|rd|th))\b`);
const SCHEDULE_ASK = /\b(?:bookings?|appointments?|schedule|calendar|agenda|what do i have|what's on|whats on|what have i got|what am i doing|jobs)\b/;
const NOT_SCHEDULE = /\b(?:how many|who|unpaid|owe|paid|cancel|move|reschedule|book (?:a|an|her|him)|revenue|money|lead|leads|remind|note|email|text|call)\b/;
export function parseScheduleRequest(text, today) {
  const t = clean(text);
  if (!SCHEDULE_ASK.test(t) || NOT_SCHEDULE.test(t) || t.split(' ').length > 12) return null;
  const w = t.match(WHEN_RE);
  if (!w) return null;
  const r = resolveCalendarWhen(w[1].replace(/^the /, ''), today);
  return r ? { when: w[1], ...r } : null;
}

const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`(\d{1,2}|${Object.keys(COUNT_WORDS).join('|')})`;
// "pull up Jill's jobs", "pull all three of Jill's jobs side by side",
// "show me Jill Castle's last 3 jobs", "pull up Jill Castle".
export function parseCustomerJobsRequest(text) {
  const t = clean(text).replace(/\s+side by side$/, '').replace(/\s+(?:on (?:the )?screen|up)$/, '');
  const count = s => (s ? Number(s) || COUNT_WORDS[s] || null : null);
  let m = t.match(new RegExp(String.raw`^(?:pull up|pull|show(?: me)?|open(?: up)?|bring up|get|let me see|display)\s+(?:all\s+)?(?:${NUM}\s+(?:of\s+)?)?([a-z][a-z.'-]*(?: [a-z][a-z.'-]*)?)'s\s+(?:(?:last|recent|latest|most recent|previous)\s+)?(?:${NUM}\s+)?(?:(?:most )?recent\s+)?(?:jobs?|job history|history|work|visits?)$`));
  if (m) {
    const name = m[2];
    if (/^(?:the|my|our|this|that|his|her|their)\b/.test(name)) return null;
    return { customer: name, count: count(m[1] || m[3]) };
  }
  m = t.match(/^(?:pull up|bring up|open up|open)\s+([a-z][a-z.'-]+ [a-z][a-z.'-]+)$/);
  if (m && !/\b(?:calendar|schedule|revenue|jobs?|customers?|settings|seo|chart|graph|dashboard|jarvis|payment|estimate|inspection|notes|parts|overview|month|week|today|tomorrow)\b/.test(m[1])) return { customer: m[1], count: null };
  return null;
}

// ---- feed panels: brief / reviews / social / email ------------------------------------

const PANEL_VERB = String.raw`(?:(?:can you |could you )?(?:show|pull up|open|bring up|let me see|check|see|read|go to|take me to|display|give me)(?: me)? )?`;
const PANEL_ASKS = [
  ['brief', new RegExp(String.raw`^(?:brief me|(?:give me |show me |pull up |what's )?(?:the |my |a |today's )?(?:daily |morning |evening )?(?:brief|briefing|rundown|run down)(?: for today)?|good (?:morning|afternoon|evening)|what's (?:going on|happening|the plan) today|catch me up|morning report|daily report)$`)],
  ['reviews', new RegExp(String.raw`^${PANEL_VERB}(?:my |our |the )?(?:google )?reviews?$|^(?:any|do i have any|did i get any|did we get any|have i (?:gotten|got) any|have we (?:gotten|got) any) new (?:google )?reviews$|^how (?:are|is) (?:my|our) (?:google )?(?:reviews|rating)$|^(?:what's|what is) (?:my|our) (?:google )?rating$`)],
  ['social', new RegExp(String.raw`^${PANEL_VERB}(?:my |our |the )?(?:facebook|instagram|insta|ig|social media|socials|social|fb)(?: page| account| stats| insights)?(?: and (?:my |our )?(?:facebook|instagram|insta))?$|^(?:any|do i have any|did i get any|how many) new (?:followers|likes|follows)(?: on (?:facebook|instagram|insta|social media))?(?: overnight| today| this week)?$|^how(?:'s| is| are) (?:my|our) (?:facebook|instagram|social media|socials|page) doing$`)],
  ['leads', new RegExp(String.raw`^${PANEL_VERB}(?:my |our |the |all )?(?:new |recent |latest |facebook |fb |meta )?leads$|^(?:any|do i have any|did i get any|have i (?:gotten|got) any) new leads$`)],
  ['messages', new RegExp(String.raw`^${PANEL_VERB}(?:my |our |the )?(?:new |unread )?(?:facebook |fb |page )?(?:messages|messenger|dms|inbox messages)$|^(?:any|do i have any|did i get any) (?:new |unread )?(?:facebook |fb |messenger |page )(?:messages|dms)$|^(?:open|check) messenger$`)],
  ['mail', new RegExp(String.raw`^${PANEL_VERB}(?:my |our |the )?(?:new )?(?:e-?mails?|inbox|mail)$|^(?:any|do i have any|did i get any|have i (?:gotten|got) any) new (?:e-?mails?|mail)$|^check (?:my )?(?:e-?mail|inbox|mail)$|^(?:any|did i get an?|is there an?) (?:o'?reilly(?:'s)?|parts) (?:order|receipt|email)s?$`)],
];

// "Brief me", "show me my reviews", "any new followers", "check my email" ->
// { panel }, else null. Short, plain requests only; anything richer goes to Jarvis.
export function parsePanelRequest(text) {
  const t = clean(text).replace(/\s+(?:jarvis|sir)$/, '');
  if (!t || t.split(' ').length > 12) return null;
  for (const [panel, re] of PANEL_ASKS) if (re.test(t)) return { panel };
  return null;
}
