// Answers Jarvis can give exactly WITHOUT Claude (no AI cost, faster): plain
// "revenue for <period>", "what's on <day/week>", "pull up <name>'s jobs".
// The request is matched by the shared grammar (shared/jarvis-workspace.js),
// the view opens through the same screen tools Claude would call
// (functions/_lib/jarvis-screen.js), and the spoken line is built from the tool
// result — so the number said is the number on the chart. Anything that
// doesn't match (or finds nothing) goes to Claude as before.
// Tests: tests/voice-stack.test.js.

import { parseRevenueRequest, parseScheduleRequest, parseCustomerJobsRequest, parsePanelRequest } from '../../shared/jarvis-workspace.js';

export function matchFastPath(text, today) {
  // "brief me", "show me my reviews", "any new followers", "check my email"
  const panel = parsePanelRequest(text);
  if (panel) return { tool: 'show_panel', input: panel };
  const rev = parseRevenueRequest(text, today);
  if (rev) return { tool: 'show_revenue', input: rev };
  const cal = parseScheduleRequest(text, today);
  if (cal) return { tool: 'show_calendar', input: { when: cal.date, mode: cal.mode } };
  const jobs = parseCustomerJobsRequest(text);
  if (jobs) return { tool: 'show_jobs', input: { customer: jobs.customer, ...(jobs.count ? { count: jobs.count } : {}) } };
  return null;
}

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymdTo = (ymd, opts) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }); };

function revenueLine(r, today) {
  const month = ymdTo(r.from, { month: 'long' });
  const prevMonth = ymdTo(r.previous.from, { month: 'long' });
  const current = r.to === today;
  const label = r.key === 'this_month' || (r.key.startsWith('month:') && current) ? { lead: month, verb: 'stands at', tail: ' so far', prev: prevMonth }
    : r.key === 'last_month' || r.key.startsWith('month:') ? { lead: month, verb: 'came to', tail: '', prev: prevMonth }
    : r.key === 'today' ? { lead: "Today's takings", verb: 'stand at', tail: '', prev: 'yesterday' }
    : r.key === 'yesterday' ? { lead: 'Yesterday', verb: 'came to', tail: '', prev: 'the day before' }
    : r.key === 'this_year' ? { lead: 'The year', verb: 'stands at', tail: ' so far', prev: 'the same stretch before it' }
    : r.key.startsWith('last_') ? { lead: `The last ${r.days} days`, verb: 'come to', tail: '', prev: `the ${r.days} days before` }
    : { lead: `${ymdTo(r.from, { month: 'short', day: 'numeric' })} to ${ymdTo(r.to, { month: 'short', day: 'numeric' })}`, verb: 'comes to', tail: '', prev: 'the period before' };
  if (!(r.collected > 0)) return `Nothing collected${r.key === 'today' ? ' today' : ' in that period'} yet, sir.`;
  const change = r.changePct == null ? '.' : ` — ${r.changePct >= 0 ? 'up' : 'down'} ${Math.abs(r.changePct)}% on ${label.prev}.`;
  return `${label.lead} ${label.verb} ${usd(r.collected)}${label.tail}, sir${change}`;
}

function calendarLine(r, today) {
  if (r.mode === 'month') return `${ymdTo(r.date, { month: 'long' })}, sir.`;
  if (r.mode === 'week') return r.date === today ? "This week's schedule, sir." : `The week of ${ymdTo(r.date, { month: 'long', day: 'numeric' })}, sir.`;
  const tomorrow = new Date(Date.UTC(...today.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)), 12) + 86400000).toISOString().slice(0, 10);
  if (r.date === today) return "Today's schedule, sir.";
  if (r.date === tomorrow) return "Tomorrow's schedule, sir.";
  return `${ymdTo(r.date, { weekday: 'long', month: 'long', day: 'numeric' })}, sir.`;
}

// The spoken/typed reply for a fast-path result, or null (then Claude answers).
export function fastLine(match, result, today) {
  if (!result || result.ok === false || result.error) return null;
  if (match.tool === 'show_revenue') return typeof result.collected === 'number' ? revenueLine(result, today) : null;
  if (match.tool === 'show_calendar') return result.date ? calendarLine(result, today) : null;
  if (match.tool === 'show_jobs') return result.jobs?.length ? result.say || null : null;
  if (match.tool === 'show_panel') return result.say || null;
  return null;
}
