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
export function collectedRevenue(jobs, inWindow) {
  let total = 0;
  let jobCount = 0;
  for (const j of jobs) {
    const payments = parsePayments(j.payments);
    const loggedTotal = payments.reduce((s, p) => s + num(p?.amount), 0);
    let amount = payments.filter(p => p?.at && inWindow(p.at)).reduce((s, p) => s + num(p.amount), 0);
    if (j.jobStatus === 'PAID' && j.paidAt && inWindow(j.paidAt) && loggedTotal < invoiceTotal(j) - 0.01) {
      amount = invoiceTotal(j);
    }
    if (amount > 0) jobCount += 1;
    total += amount;
  }
  return { total, jobCount };
}

// Dashboard net profit: for PAID jobs closed (paidAt) in-window,
// amount paid − sales tax collected − parts cost.
export function netProfit(jobs, inWindow) {
  return jobs.reduce((sum, j) => {
    if (j.jobStatus !== 'PAID' || !j.paidAt || !inWindow(j.paidAt)) return sum;
    const paid = j.amountPaid != null ? num(j.amountPaid) : invoiceTotal(j);
    return sum + (paid - num(j.taxAmount) - num(j.partsCost));
  }, 0);
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
