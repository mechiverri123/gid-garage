// Screen actions for Jarvis visual answers, shared by the /jarvis chat
// (admin-ai-chat.js UI_TOOLS) and the voice agent (jarvis-business.js), so both
// open exactly the same views for the same request. Returns the facts for the
// spoken/typed reply plus `__ui`: workspace actions (shared/jarvis-workspace.js)
// the caller delivers to the page (NDJSON `ui` events / LiveKit `gid.ui` stream).
import { JOB_TABS, CALENDAR_MODES, resolveCalendarWhen, spokenYmd } from '../../shared/jarvis-workspace.js';

export const SCREEN_TOOL_NAMES = new Set(['show_jobs', 'show_revenue', 'show_calendar', 'show_job_list', 'show_customers', 'control_screen']);

// screen: what the page reported as visible (describeScreen); today: Arizona YYYY-MM-DD.
export async function runScreenTool(name, input = {}, { ops, screen = null, today }) {
  switch (name) {
    case 'show_jobs': {
      const r = await ops.jobsForView({
        customer: input.customer, vehicle: input.vehicle, service: input.service, job_ids: input.job_ids,
        count: input.count, newest_first: input.newest_first === true,
      });
      if (!r.jobs?.length) return r;
      const n = r.jobs.length;
      const newestIdx = r.order === 'newest_first' ? 0 : n - 1;
      // date: "2026-09-26" or as spoken ("September 26th") -> center that job.
      const onDate = input.date ? (/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) ? String(input.date) : spokenYmd(String(input.date), today, 'past')) : null;
      const dateIdx = onDate ? r.jobs.findIndex(j => j.date === onDate) : -1;
      const focus = dateIdx >= 0 ? dateIdx : input.focus === 'newest' ? newestIdx : input.focus === 'oldest' ? n - 1 - newestIdx : undefined;
      const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
      const who = r.subject ? `${r.subject.split(' ')[0]}'s` : 'The';
      const say = input.tab ? `The ${input.tab}, sir.` : n === 1 ? `${who} job, sir.` : `${who} ${words[n] || n} jobs, sir.`;
      return { ...r, onScreen: true, say, ...(onDate && dateIdx < 0 ? { note: `No job on ${onDate} for this customer; showing their jobs.` } : {}), __ui: [{ type: 'open', view: { type: 'jobs', jobIds: r.jobs.map(j => j.id), tab: input.tab, focus, ...(dateIdx >= 0 ? { expanded: true } : {}), title: r.subject } }] };
    }
    case 'show_revenue': {
      const spec = input.from ? { from: input.from, to: input.to } : input.month ? { month: input.month } : input.last_days ? { last_days: input.last_days } : { period: input.period || 'this_month' };
      const r = await ops.revenueRange(spec);
      const { series, ...facts } = r;
      return { ...facts, onScreen: true, __ui: [{ type: 'open', view: { type: 'analytics', range: { from: r.from, to: r.to, key: r.key } }, data: r }] };
    }
    case 'show_calendar': {
      const r = resolveCalendarWhen(input.when || 'this week', today) || { date: today, mode: 'week' };
      const mode = CALENDAR_MODES.includes(input.mode) ? input.mode : r.mode;
      return { date: r.date, mode, onScreen: true, __ui: [{ type: 'open', view: { type: 'calendar', date: r.date, mode } }] };
    }
    case 'show_job_list':
      return { onScreen: true, __ui: [{ type: 'open', view: { type: 'jobList', query: String(input.query || ''), status: String(input.status || 'active') } }] };
    case 'show_customers':
      return { onScreen: true, __ui: [{ type: 'open', view: { type: 'customers', query: String(input.query || '') } }] };
    case 'control_screen': {
      if (!screen) return { ok: false, error: 'Nothing is open on the screen.' };
      const jobs = Array.isArray(screen.jobs) ? screen.jobs : [];
      const idx = input.job_id ? jobs.findIndex(j => j.id === input.job_id) : Number(input.position) - 1;
      const actions = [];
      if (input.action === 'close' || input.action === 'close_all') actions.push({ type: input.action });
      else {
        if (input.job_id || input.position) {
          if (!(idx >= 0 && idx < jobs.length)) return { ok: false, error: 'That job is not on the screen.' };
          actions.push({ type: 'focus', index: idx, expand: true });
        }
        if (input.action === 'tab') {
          if (!JOB_TABS.includes(input.tab)) return { ok: false, error: `tab must be one of ${JOB_TABS.join(', ')}.` };
          actions.push({ type: 'tab', tab: input.tab });
        }
        if (!actions.length) return { ok: false, error: 'Say which job (job_id or position).' };
      }
      return { ok: true, onScreen: true, __ui: actions };
    }
    default:
      throw new Error(`Unknown screen tool: ${name}`);
  }
}
