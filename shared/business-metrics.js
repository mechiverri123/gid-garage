// Canonical GID Garage money math. The Schedule dashboard (src/JobOps.tsx),
// Jarvis (admin-ai-chat.js) and the proactive worker all import this file so
// the same bookings + the same period always produce the same numbers.
// Lives outside functions/ so Pages never treats it as a route; both sides
// import it by relative path. Pure functions only, no I/O.
// Tests: tests/business-metrics.test.js (npm test).
//
// Jobs are the dashboard's camelCase shape; backend code converts Supabase
// rows with jobFromRow() first.

export const BUSINESS_TZ = 'America/Phoenix';
const DAY_MS = 86400000;

const phxFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

// { year, month (1-12), day } of an instant, on the Arizona calendar.
export function phoenixDateParts(date) {
  const parts = phxFmt.formatToParts(date);
  const get = t => Number(parts.find(p => p.type === t)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function parsePayments(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// Supabase bookings row -> the dashboard's camelCase Job shape (the fields the
// shared rules use). Only keys present in the row are meaningful.
export function jobFromRow(r) {
  return {
    id: r.id ?? null,
    date: r.date ?? null,
    time: r.time ?? null,
    dateTbd: !!r.date_tbd,
    fname: r.fname ?? '',
    lname: r.lname ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    vehicle: r.vehicle ?? '',
    service: r.service ?? '',
    customerId: r.customer_id ?? null,
    serviceAddress: r.service_address ?? '',
    createdAt: r.created_at ?? null,
    estimateAmount: r.estimate_amount ?? null,
    stripeTransactionId: r.stripe_transaction_id ?? '',
    jobStatus: r.job_status ?? null,
    status: r.status ?? null,
    paidAt: r.paid_at || null,
    amountPaid: r.amount_paid ?? null,
    invoiceAmount: r.invoice_amount ?? null,
    taxAmount: r.tax_amount ?? null,
    partsCost: r.parts_cost ?? null,
    payments: parsePayments(r.payments),
  };
}

// Period keys: today, this_month, last_month, this_year, this_week (= last 7
// days), last_N_days. Anything unrecognized falls back to last_30_days and is
// labeled as such, so an answer never claims a period it didn't compute.
// `days` is the period length used to prorate monthly overhead.
export function resolvePeriodWindow(period, now = new Date()) {
  const key = String(period || 'this_month').toLowerCase().trim();
  const nowP = phoenixDateParts(now);
  const nowMs = now.getTime();
  const calendar = (label, days, match) => ({
    key, label, days,
    inWindow: iso => {
      if (!iso) return false;
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && match(phoenixDateParts(d));
    },
  });

  if (key === 'today') return calendar('today', 1, p => p.year === nowP.year && p.month === nowP.month && p.day === nowP.day);
  if (key === 'this_month') return calendar('this month', nowP.day, p => p.year === nowP.year && p.month === nowP.month);
  if (key === 'this_year') {
    const dayOfYear = Math.round((Date.UTC(nowP.year, nowP.month - 1, nowP.day) - Date.UTC(nowP.year, 0, 1)) / DAY_MS) + 1;
    return calendar('this year', dayOfYear, p => p.year === nowP.year);
  }
  if (key === 'last_month') {
    const year = nowP.month === 1 ? nowP.year - 1 : nowP.year;
    const month = nowP.month === 1 ? 12 : nowP.month - 1;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return calendar('last month', days, p => p.year === year && p.month === month);
  }

  const m = key === 'this_week' ? ['', '7'] : key.match(/^last_(\d+)_days$/);
  const days = m ? Math.max(1, Math.min(Number(m[1]), 365)) : 30;
  const startMs = nowMs - days * DAY_MS;
  return {
    key: m ? key : 'last_30_days',
    label: `the last ${days} days`,
    days,
    inWindow: iso => {
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      return Number.isFinite(ms) && ms >= startMs && ms <= nowMs;
    },
  };
}

const num = v => Number(v || 0);
const invoiceTotal = j => num(j.invoiceAmount) + num(j.taxAmount);

// Money actually collected in the window. Two payment paths that don't overlap:
// individual payments[] entries dated in-window, OR, for a PAID job closed
// in-window whose payment log doesn't cover the invoice (Stripe idempotent
// retry closed it without appending), the full invoice + tax.
// Cancelled jobs are NOT excluded: money collected on them was still collected.
// One job's share of a period, with the evidence behind it. collectedRevenue
// and netProfit are sums of these, so a breakdown always adds up to its total.
export function jobContribution(j, inWindow) {
  const payments = parsePayments(j.payments);
  const loggedTotal = payments.reduce((s, p) => s + num(p?.amount), 0);
  const inWindowPayments = payments.filter(p => p?.at && inWindow(p.at));
  let collected = inWindowPayments.reduce((s, p) => s + num(p.amount), 0);
  let basis = inWindowPayments.length ? 'payment_entries' : null;
  let paymentDates = inWindowPayments.map(p => p.at);
  if (j.jobStatus === 'PAID' && j.paidAt && inWindow(j.paidAt) && loggedTotal < invoiceTotal(j) - 0.01) {
    collected = invoiceTotal(j);
    basis = 'paid_invoice_fallback';
    paymentDates = [j.paidAt];
  }
  const closedInWindow = j.jobStatus === 'PAID' && !!j.paidAt && inWindow(j.paidAt);
  const net = closedInWindow
    ? (j.amountPaid != null ? num(j.amountPaid) : invoiceTotal(j)) - num(j.taxAmount) - num(j.partsCost)
    : 0;
  return {
    id: j.id ?? null,
    collected,
    basis,
    paymentDates,
    closedInWindow,
    netProfit: net,
    taxAmount: closedInWindow ? num(j.taxAmount) : 0,
    partsCost: closedInWindow ? num(j.partsCost) : 0,
  };
}

// Per-job contributions for a window (only jobs that contribute anything).
export function revenueContributions(jobs, inWindow) {
  return jobs.map(j => ({ job: j, c: jobContribution(j, inWindow) }))
    .filter(({ c }) => c.collected !== 0 || c.closedInWindow);
}

export function collectedRevenue(jobs, inWindow) {
  let total = 0;
  let jobCount = 0;
  for (const j of jobs) {
    const { collected } = jobContribution(j, inWindow);
    if (collected > 0) jobCount += 1;
    total += collected;
  }
  return { total, jobCount };
}

// Collected revenue per day in one pass (for trend charts). Same two paths as
// jobContribution, so each day's value equals collectedRevenue(jobs, <that
// single day>). dayOf(iso) -> 'YYYY-MM-DD' in the business timezone.
// Multi-day totals must still use collectedRevenue (the invoice fallback
// replaces a window's payments, so summing days can differ slightly).
export function collectedByDay(jobs, dayOf) {
  const out = new Map();
  const add = (day, amount) => { if (day) out.set(day, (out.get(day) || 0) + amount); };
  for (const j of jobs) {
    const payments = parsePayments(j.payments);
    const loggedTotal = payments.reduce((s, p) => s + num(p?.amount), 0);
    const fallbackDay = j.jobStatus === 'PAID' && j.paidAt && loggedTotal < invoiceTotal(j) - 0.01 ? dayOf(j.paidAt) : null;
    for (const p of payments) {
      const day = p?.at ? dayOf(p.at) : null;
      if (day && day !== fallbackDay) add(day, num(p.amount));
    }
    if (fallbackDay) add(fallbackDay, invoiceTotal(j));
  }
  return out;
}

// Dashboard net profit: for PAID jobs closed (paidAt) in-window,
// amount paid − sales tax collected − parts cost.
export function netProfit(jobs, inWindow) {
  return jobs.reduce((sum, j) => sum + jobContribution(j, inWindow).netProfit, 0);
}

const cents = n => Math.round(n * 100) / 100;

// Exact job-by-job explanation of why two periods differ. Every job whose
// collected or net-profit contribution differs between A and B is listed;
// the listed differences sum exactly to the total differences.
export function compareRevenuePeriods(jobs, windowA, windowB) {
  const rows = [];
  let totalA = 0; let totalB = 0; let netA = 0; let netB = 0; let shared = 0;
  for (const j of jobs) {
    const a = jobContribution(j, windowA.inWindow);
    const b = jobContribution(j, windowB.inWindow);
    totalA += a.collected; totalB += b.collected; netA += a.netProfit; netB += b.netProfit;
    const inA = a.collected !== 0 || a.closedInWindow;
    const inB = b.collected !== 0 || b.closedInWindow;
    if (inA && inB && Math.abs(a.collected - b.collected) < 0.005 && Math.abs(a.netProfit - b.netProfit) < 0.005) { shared += 1; continue; }
    if (!inA && !inB) continue;
    rows.push({
      job: j,
      where: inA && inB ? 'both_different_amounts' : inA ? 'only_in_a' : 'only_in_b',
      a, b,
      collectedDifference: cents(b.collected - a.collected),
      netProfitDifference: cents(b.netProfit - a.netProfit),
    });
  }
  rows.sort((x, y) => Math.abs(y.collectedDifference) - Math.abs(x.collectedDifference));
  return {
    a: { key: windowA.key, label: windowA.label, collected: cents(totalA), netProfit: cents(netA) },
    b: { key: windowB.key, label: windowB.label, collected: cents(totalB), netProfit: cents(netB) },
    collectedDifference: cents(totalB - totalA),
    netProfitDifference: cents(netB - netA),
    sharedJobCount: shared,
    differences: rows,
  };
}

// Card payments logged through Stripe in-window, the base for the fee estimate.
export function cardRevenue(jobs, inWindow) {
  let total = 0;
  for (const j of jobs) {
    for (const p of parsePayments(j.payments)) {
      if (p?.method === 'Card (Stripe)' && p.at && inWindow(p.at)) total += num(p.amount);
    }
  }
  return total;
}

// business_settings row -> owner-pay settings, same defaults as the dashboard.
export function ownerPaySettings(row = {}) {
  const items = Array.isArray(row.owner_overhead_items) ? row.owner_overhead_items : [];
  return {
    taxReservePct: row.owner_tax_reserve_pct != null ? Number(row.owner_tax_reserve_pct) : 0.3,
    stripeFeePct: row.owner_stripe_fee_pct != null ? Number(row.owner_stripe_fee_pct) : 0.02928,
    monthlyOverhead: items.reduce((s, i) => s + num(i?.amount), 0),
  };
}

// Owner take-home, identical to the Hub → Owner Pay panel:
// job margin (net profit) − Stripe fees on card revenue − overhead
// (monthly total prorated to window.days / 30), then the tax reserve comes out
// of whatever is left. A deficit leaves nothing to take home.
export function ownerTakeHome(jobs, window, settings) {
  const jobMargin = netProfit(jobs, window.inWindow);
  const stripeFees = cardRevenue(jobs, window.inWindow) * settings.stripeFeePct;
  const overhead = (settings.monthlyOverhead / 30) * window.days;
  const businessNet = jobMargin - overhead - stripeFees;
  const inDeficit = businessNet <= 0;
  const taxReserve = inDeficit ? 0 : businessNet * settings.taxReservePct;
  return {
    jobMargin, stripeFees, overhead, businessNet, inDeficit, taxReserve,
    takeHome: inDeficit ? 0 : businessNet - taxReserve,
  };
}

// ---- inclusive Arizona calendar-day ranges (Jarvis analytics overlay) ------
// Same semantics as the admin Revenue panel's Custom Range: every day from
// `from` through `to`, inclusive, on the Arizona calendar. "Last 13 days" is
// today and the 12 days before it. The server resolves these; the model never
// computes dates.

const ymdOf = date => { const p = phoenixDateParts(date); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
const shiftYmd = (ymd, days) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10); };
const validYmd = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false; const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const spanDays = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS) + 1;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MAX_RANGE_DAYS = 1100;

export function dayRangeWindow(from, to) {
  return {
    key: 'range', from, to, days: spanDays(from, to),
    inWindow: iso => {
      if (!iso) return false;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return false;
      const day = ymdOf(d);
      return day >= from && day <= to;
    },
  };
}

function monthRange(spec, today) {
  const s = String(spec).trim().toLowerCase();
  let y; let m;
  const iso = s.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); }
  else {
    const idx = MONTH_NAMES.findIndex(n => s.startsWith(n.slice(0, 3)));
    if (idx < 0) return null;
    m = idx + 1;
    const yr = s.match(/\b(\d{4})\b/);
    const [ty, tm] = today.split('-').map(Number);
    y = yr ? Number(yr[1]) : (m > tm ? ty - 1 : ty); // "September" = the most recent September
  }
  if (!(m >= 1 && m <= 12)) return null;
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = shiftYmd(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  return { from, to: last < today ? last : today };
}

// spec: { period } | { last_days } | { month } | { from, to? } (or a period string).
// period: today, yesterday, this_week (= last 7 days), last_7_days, last_30_days,
// last_90_days, last_N_days, this_month, last_month, this_year.
// Returns { from, to, days, key } or throws on an invalid range.
export function resolveDayRange(spec = {}, now = new Date()) {
  const s = typeof spec === 'string' ? { period: spec } : (spec || {});
  const today = ymdOf(now);
  const [ty, tm] = today.split('-').map(Number);
  let from; let to = today; let key;
  const period = String(s.period || '').toLowerCase().trim();
  const lastN = Number(s.last_days) || Number((period.match(/^last_(\d+)_days$/) || [])[1]) || (period === 'this_week' ? 7 : 0);
  if (s.from) {
    from = String(s.from); to = s.to ? String(s.to) : today; key = 'custom';
  } else if (s.month) {
    const r = monthRange(s.month, today);
    if (!r) throw new Error(`Unknown month "${s.month}".`);
    ({ from, to } = r); key = `month:${from.slice(0, 7)}`;
  } else if (lastN >= 1) {
    const n = Math.min(Math.round(lastN), MAX_RANGE_DAYS);
    from = shiftYmd(today, -(n - 1)); key = `last_${n}_days`;
  } else if (period === 'today') {
    from = today; key = 'today';
  } else if (period === 'yesterday') {
    from = to = shiftYmd(today, -1); key = 'yesterday';
  } else if (period === 'last_month') {
    ({ from, to } = monthRange(`${tm === 1 ? ty - 1 : ty}-${tm === 1 ? 12 : tm - 1}`, today)); key = 'last_month';
  } else if (period === 'this_year') {
    from = `${ty}-01-01`; key = 'this_year';
  } else {
    from = `${today.slice(0, 7)}-01`; key = 'this_month';
  }
  if (!validYmd(from) || !validYmd(to)) throw new Error('Dates must be YYYY-MM-DD.');
  if (to > today) to = today; // no revenue exists in the future
  if (from > to) throw new Error('The start date is after the end date.');
  if (spanDays(from, to) > MAX_RANGE_DAYS) throw new Error('That range is too long (3 years max).');
  return { from, to, days: spanDays(from, to), key };
}

export const addDaysYmd = shiftYmd;
export const phoenixYmd = ymdOf;
