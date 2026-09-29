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
const CAL_MODE_RE = /^(?:(?:show|switch to|go to)(?: the)? )?(day|week|month) view$/;

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
    const tab = t.match(TAB_RE);
    if (tab) return { type: 'tab', tab: TAB_WORDS[tab[1]] };
    if (/^(?:next|next one|go right|swipe left)$/.test(t)) return { type: 'step', delta: 1 };
    if (/^(?:previous|prev|previous one|go left|swipe right)$/.test(t)) return { type: 'step', delta: -1 };
    if (/^(?:open|expand|zoom in on|show) (?:it|that|this one|that one)$|^zoom in$/.test(t)) return { type: 'focus', index: view.focus, expand: true };
    const n = view.jobIds.length;
    const num = t.match(/^(?:open |show )?(?:number|#|job) ?(\d{1,2})$/);
    if (num && Number(num[1]) >= 1 && Number(num[1]) <= n) return { type: 'focus', index: Number(num[1]) - 1, expand: true };
    const ord = t.match(ORD_RE);
    if (ord) {
      const w = ord[1];
      const dated = meta.map((m, i) => ({ i, d: String(m?.date || '') }));
      let index;
      if (w in ORDINALS) index = ORDINALS[w];
      else if (w === 'last') index = n - 1;
      else if (w === 'middle' || w === 'center' || w === 'centre') index = Math.floor((n - 1) / 2);
      else if (w === 'left') index = view.focus - 1;
      else if (w === 'right') index = view.focus + 1;
      else if (dated.length === n) {
        const sorted = [...dated].sort((a, b) => a.d.localeCompare(b.d));
        index = (w === 'oldest' || w === 'earliest' ? sorted[0] : sorted[sorted.length - 1]).i;
      }
      if (index != null && index >= 0 && index < n) return { type: 'focus', index, expand: true };
      return null;
    }
    const pick = t.match(PICK_RE);
    if (pick && meta.length === n) {
      const words = (pick[1] || pick[2]).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
      if (words.length) {
        const hits = meta.map((m, i) => ({ i, l: String(m?.label || '').toLowerCase() })).filter(m => words.every(w => m.l.includes(w)));
        if (hits.length === 1) return { type: 'focus', index: hits[0].i, expand: true };
      }
    }
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
