// Jarvis workspace: the one state machine behind every visual answer on
// /jarvis (job cards, calendar, revenue charts, job/customer lists), plus the
// deterministic parser for commands about what is already on screen
// ("close it", "open the middle one", "payment", "53 days").
//
// Pure — no I/O, no clock (callers pass `today`). The React side
// (src/command-center/workspace/) renders the top of the stack; the backend
// (admin-ai-chat.js) emits the same actions as `ui` events.
// Tests: tests/jarvis-workspace.test.js.

export const JOB_TABS = ['overview', 'estimate', 'payment', 'inspection', 'notes', 'parts'];
export const CALENDAR_MODES = ['day', 'week', 'month'];
export const INITIAL_WORKSPACE = { stack: [] };

const MAX_STACK = 4;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const top = state => state.stack[state.stack.length - 1] || null;
const replaceTop = (state, view) => ({ stack: [...state.stack.slice(0, -1), view] });

// Normalize a view from any source (backend event, click) into a safe shape.
export function normalizeView(v) {
  if (!v || typeof v !== 'object') return null;
  switch (v.type) {
    case 'jobs': {
      const jobIds = [...new Set((Array.isArray(v.jobIds) ? v.jobIds : []).map(String).filter(Boolean))].slice(0, 12);
      if (!jobIds.length) return null;
      const tab = JOB_TABS.includes(v.tab) ? v.tab : 'overview';
      const focus = clamp(Number.isInteger(v.focus) ? v.focus : Math.floor((jobIds.length - 1) / 2), 0, jobIds.length - 1);
      return { type: 'jobs', jobIds, focus, expanded: jobIds.length === 1 || !!v.expanded || v.tab != null, tab, title: v.title ? String(v.title).slice(0, 80) : null };
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
      if (t && t.type === view.type) return replaceTop(state, view);
      return { stack: [view] };
    }
    case 'close':
      if (!t) return state;
      if (t.type === 'jobs' && t.expanded && t.jobIds.length > 1) return replaceTop(state, { ...t, expanded: false });
      return { stack: state.stack.slice(0, -1) };
    case 'close_all':
      return INITIAL_WORKSPACE;
    case 'focus':
      if (t?.type !== 'jobs') return state;
      return replaceTop(state, { ...t, focus: clamp(Number(action.index) || 0, 0, t.jobIds.length - 1), expanded: action.expand ?? t.expanded });
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
      if (t?.type !== 'jobList' && t?.type !== 'customers') return state;
      return replaceTop(state, { ...t, ...('query' in action ? { query: String(action.query || '') } : {}), ...('status' in action ? { status: String(action.status) } : {}) });
    default:
      return state;
  }
}

export const workspaceTop = top;

// ---- calendar words -> date + mode ------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const shift = (ymd, days) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10); };
const dow = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay();

// "today", "tomorrow", "friday", "next friday", "this week", "next week",
// "next month", "2026-10-02" -> { date, mode } or null. `today` is the Arizona date.
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
  if (w === 'next month') { const [y, m] = today.split('-').map(Number); return { date: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, mode: 'month' }; }
  if (w === 'last month') { const [y, m] = today.split('-').map(Number); return { date: `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`, mode: 'month' }; }
  const wd = w.match(/^(this |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/);
  if (wd) {
    const target = WEEKDAYS.findIndex(d => d.startsWith(wd[2].slice(0, 3)));
    let ahead = (target - dow(today) + 7) % 7; // "friday" on a Friday = today
    if (wd[1] === 'next ' && ahead === 0) ahead = 7;
    return { date: shift(today, ahead), mode: 'day' };
  }
  return null;
}

// ---- on-screen commands -----------------------------------------------------------

const CLOSE_ONE = /^(?:close|dismiss|hide|collapse|shrink)(?: (?:it|that|this|the job|this job|that job|the (?:estimate|payment|inspection|notes|parts|overview|tab)))?$|^(?:go )?back$|^never ?mind$/;
const CLOSE_ALL = /^(?:close|dismiss|hide|clear|get rid of|exit|close out)(?: (?:all|everything|all jobs|all (?:of )?(?:these|them|those)(?: jobs)?|(?:the )?jobs|these(?: jobs)?|them|those|(?:the )?(?:calendar|chart|graph|analytics|revenue(?: chart)?|customers|customer list|job list|list|screen|overlay|windows?)))?$|^(?:back to|go back to|return to) (?:jarvis|home|the dashboard|dashboard|main|normal)$/;
const TAB_WORDS = {
  overview: 'overview', summary: 'overview', details: 'overview',
  estimate: 'estimate', quote: 'estimate',
  payment: 'payment', payments: 'payment', pay: 'payment', billing: 'payment', invoice: 'payment',
  inspection: 'inspection', diagnostics: 'inspection', diagnostic: 'inspection', dtc: 'inspection', codes: 'inspection', tires: 'inspection',
  notes: 'notes', 'diagnostic notes': 'notes', 'tech notes': 'notes', 'technician notes': 'notes', 'scope': 'notes',
  parts: 'parts',
};
const TAB_RE = new RegExp(`^(?:(?:show|open|go to|switch to|pull up|view|see|let me see|check|flip to|jump to)(?: me)? )?(?:(?:the|its|his|her|their|that|this) )?(${Object.keys(TAB_WORDS).sort((a, b) => b.length - a.length).join('|')})(?: (?:tab|page|info|section|details|screen))?$`);
const ORDINALS = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
const ORD_RE = /^(?:(?:open|show|pull up|expand|select|go to|focus on|focus|zoom in on|look at|bring up)(?: me)? )?(?:the )?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|middle|center|centre|left|right|newest|latest|oldest|most recent|earliest)(?: one| job| card)?$/;
const PICK_RE = /^(?:open|show|pull up|expand|select|go to|look at|bring up)(?: me)? (?:the )?(.+?)(?: one| job)?$|^(?:the |that )(.+?) (?:one|job)$/;
const STOP = new Set(['the', 'one', 'job', 'jobs', 'that', 'this', 'from', 'with', 'for', 'on', 'of', 'a', 'an', 'me', 'up']);
const RANGE_RE = /^(?:(?:show|graph|chart|give me|what about|how about|and|pull up|display|now|try|do|make it|switch to|change to)(?: me)? )*(?:the )?(?:(?:last|past|previous) )?(\d{1,4}) ?days?(?: of revenue| revenue)?$/;
const PERIOD_RE = /^(?:(?:show|graph|chart|what about|how about|and|switch to|change to)(?: me)? )*(?:revenue )?(today|yesterday|this week|this month|last month|this year)(?: revenue)?$/;
const CAL_RE = /^(?:(?:show|open|go to|what about|how about|and|what do i have|jump to)(?: me)? )*(today|tomorrow|yesterday|this week|next week|last week|this month|next month|last month|(?:next |this )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))$/;
const CAL_MODE_RE = /^(?:(?:show|switch to|go to|change to)(?: the)? )?(?:by )?(day|week|month)(?: view)?$/;
const LIST_STATUS = {
  all: 'all', everything: 'all', 'all of them': 'all', every: 'all',
  active: 'active', open: 'active', current: 'active',
  unpaid: 'unpaid', owed: 'unpaid', outstanding: 'unpaid', 'who owes': 'unpaid', due: 'unpaid',
  paid: 'PAID', cancelled: 'CANCELLED', canceled: 'CANCELLED',
  booked: 'BOOKED', 'estimate sent': 'ESTIMATE_SENT', estimates: 'ESTIMATE_SENT', signed: 'SIGNED',
  'in progress': 'IN_PROGRESS', completed: 'COMPLETED', done: 'COMPLETED', invoiced: 'INVOICED',
};

const ORDINAL_WORDS = new Set(['first', '1st', 'second', '2nd', 'third', '3rd', 'fourth', '4th', 'fifth', '5th', 'last', 'middle', 'center', 'centre', 'left', 'right', 'newest', 'latest', 'oldest', 'most recent', 'earliest']);
const SYNONYMS = {
  brake: ['brake', 'rotor', 'pad', 'caliper'], oil: ['oil'], diagnostic: ['diag'], diag: ['diag'],
  transmission: ['transmission', 'trans'], trans: ['transmission', 'trans'], tire: ['tire', 'tread'], battery: ['battery'],
  suspension: ['suspension', 'strut', 'shock', 'control arm'], coolant: ['coolant', 'radiator'], radiator: ['radiator', 'coolant'],
};
// Conversational wrapping around the thing being asked for: "back to overview",
// "take me to the payment tab", "can you pull up the Sep 26 job".
const LEAD_FILLER = /^(?:can you|could you|would you|will you|let's|lets|let me|i want to|i wanna|i'd like to|take me|bring me|go|head|switch|flip|jump|move|pull|bring|open|show|see|view|check|look at|look|give me|back|over|up|to|into|on|at|the|me|us|its|it's|his|her|their|that|this|just|and|then|now)\b\s*/;
const TRAIL_FILLER = /\s*\b(?:tab|page|section|screen|info|again|one|job|jobs|card|please|instead|filter|only|ones)$/;
function core(t) {
  let s = t; let prev;
  do { prev = s; s = s.replace(LEAD_FILLER, ''); } while (s && s !== prev);
  do { prev = s; s = s.replace(TRAIL_FILLER, ''); } while (s && s !== prev);
  return s.trim() || t;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// { month: 'MM' | null, day: 'DD' } from "sep 26", "september 26th", "9/26", "the 26th".
function spokenDate(c) {
  const pad = x => String(x).padStart(2, '0');
  let m = c.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) return { month: pad(MONTHS.indexOf(m[1].slice(0, 3)) + 1), day: pad(m[2]) };
  m = c.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return { month: pad(m[1]), day: pad(m[2]) };
  m = c.match(/^(\d{1,2})(?:st|nd|rd|th)$/);
  if (m) return { month: null, day: pad(m[1]) };
  return null;
}

function clean(text) {
  return String(text || '').toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^(?:(?:ok(?:ay)?|hey|yo|alright|and)[\s,]+)*(?:jarvis\b[\s,]*)?/, '')
    .replace(/\b(?:please|pls|for me|real quick|now)\b/g, ' ')
    .replace(/[.!?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns a workspace action (or { type: 'noop', reply }) when the message is
// clearly about what's on screen, else null (the AI handles it).
// meta: per visible job, in jobIds order: { label, date } for "the brake one" / "newest".
export function parseLocalCommand(text, state, { meta = [], today } = {}) {
  const t = clean(text);
  if (!t || t.split(' ').length > 9) return null;
  const view = top(state);

  if (CLOSE_ALL.test(t) && !CLOSE_ONE.test(t)) return view ? { type: 'close_all' } : { type: 'noop', reply: 'Nothing is open.' };
  if (CLOSE_ONE.test(t)) return view ? { type: 'close' } : { type: 'noop', reply: 'Nothing is open.' };
  if (!view) return null;

  if (view.type === 'jobs') {
    const c = core(t);
    const n = view.jobIds.length;
    // "the diagnostic one" / "the diagnostic job" picks a job; "diagnostic" alone is the tab.
    if (TAB_WORDS[c] && !/\b(?:one|job)$/.test(t)) return { type: 'tab', tab: TAB_WORDS[c] };
    if (/^(?:next|next job|go right|swipe left|forward)$/.test(c)) return { type: 'step', delta: 1 };
    if (/^(?:previous|prev|go left|swipe right|last job before)$/.test(c)) return { type: 'step', delta: -1 };
    if (/^(?:it|zoom in|expand|expand it|zoom in on it)$/.test(c) || /^(?:open|expand|zoom in on|show) (?:it|that|this one|that one)$/.test(t)) return { type: 'focus', index: view.focus, expand: true };
    const num = c.match(/^(?:number|#|job|card)? ?(\d{1,2})$/);
    if (num && Number(num[1]) >= 1 && Number(num[1]) <= n) return { type: 'focus', index: Number(num[1]) - 1, expand: true };
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
    // "the Sep 26 job", "the 26th", "9/26"
    const day = spokenDate(c);
    if (day) {
      const hits = meta.map((m, i) => ({ i, d: String(m?.date || '') })).filter(m => (day.month ? m.d.slice(5) === `${day.month}-${day.day}` : m.d.slice(8) === day.day));
      if (hits.length === 1) return { type: 'focus', index: hits[0].i, expand: true };
      if (day.month || hits.length) return null;
    }
    // "the brake one", "that oil change job" (brake also means rotors/pads)
    const words = c.split(' ').filter(w => w.length >= 3 && !STOP.has(w));
    if (words.length) {
      const labels = meta.map((m, i) => ({ i, l: String(m?.label || '').toLowerCase() }));
      const has = (l, w) => (SYNONYMS[w] || SYNONYMS[w.replace(/s$/, '')] || [w.replace(/s$/, '')]).some(x => l.includes(x));
      const hits = labels.filter(m => words.every(w => has(m.l, w)));
      if (hits.length === 1) return { type: 'focus', index: hits[0].i, expand: true };
    }
    return null;
  }

  // Jobs list: the same chips as the screen (Active / Unpaid / Paid / Cancelled / All),
  // pipeline stages, and search ("find Jill", "search Acura", "clear search").
  if (view.type === 'jobList' || view.type === 'customers') {
    if (/^(?:clear|reset)(?: the)? (?:search|filters?)$/.test(t)) return { type: 'filter', query: '' };
    if (view.type === 'jobList') {
      const status = LIST_STATUS[core(t)];
      if (status) return { type: 'filter', status };
    }
    const find = t.match(/^(?:search|find|look up|lookup|filter|search for|find me|show me|show)(?: for)? (.+)$/);
    if (find && !LIST_STATUS[core(find[1])]) return { type: 'filter', query: find[1].replace(/^(?:the |a )/, '').replace(/'s$/, '') };
    return null;
  }

  if (view.type === 'analytics') {
    const r = t.match(RANGE_RE);
    if (r && Number(r[1]) >= 1) return { type: 'range', range: { last_days: Number(r[1]) } };
    const p = t.match(PERIOD_RE);
    if (p) return { type: 'range', range: p[1] === 'this week' ? { last_days: 7 } : { period: p[1].replace(' ', '_') } };
    return null;
  }

  if (view.type === 'calendar' && today) {
    const mode = t.match(CAL_MODE_RE);
    if (mode) return { type: 'calendar', mode: mode[1] };
    const c = t.match(CAL_RE);
    if (c) { const r = resolveCalendarWhen(c[1], today); if (r) return { type: 'calendar', ...r }; }
  }
  return null;
}

// What's on screen, for the backend prompt, so the model can resolve "the
// brake one" / "its payment" to a real job id. Plain data only.
export function describeScreen(state, meta = []) {
  const v = top(state);
  if (!v) return null;
  if (v.type === 'jobs') {
    return {
      view: 'jobs', expanded: v.expanded, tab: v.tab, focusedJobId: v.jobIds[v.focus],
      jobs: v.jobIds.map((id, i) => ({ position: i + 1, id, ...(meta[i] ? { label: String(meta[i].label || '').slice(0, 120), date: meta[i].date || null } : {}) })),
    };
  }
  if (v.type === 'analytics') return { view: 'analytics', range: v.range };
  if (v.type === 'calendar') return { view: 'calendar', date: v.date, mode: v.mode };
  return { view: v.type, query: v.query || '' };
}

// A spoken sentence the page parser couldn't place but that clearly refers to
// the open job cards ("pull up the one with the rotors", "go to her payment").
// Those go to the text Jarvis with the screen context (silently: the voice
// agent already acknowledged), so voice follow-ups get the same understanding
// as typed ones. Other topics stay with the voice agent.
const SCREEN_REF = /\b(?:one|job|card|tab|overview|estimate|quote|payment|paid|inspection|notes?|parts|summary|details|first|second|third|last|middle|newest|oldest|left|right|next|previous|back|brake|oil|rotor|pads?|diag\w*|transmission|tires?|jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)\b|\b\d{1,2}(?:st|nd|rd|th)\b/;
const OTHER_TOPIC = /\b(?:revenue|money|made|profit|calendar|schedule|tomorrow|today|customers?|leads?|remind|reminder|text|email|call|book|reschedule|cancel|mark)\b/;
export function isScreenFollowUp(text, state) {
  const t = clean(text);
  const v = top(state);
  return !!t && v?.type === 'jobs' && t.split(' ').length <= 12 && SCREEN_REF.test(t) && !OTHER_TOPIC.test(t);
}
