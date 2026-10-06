// Money: one ledger from the Bluevine bank export and the Zoho Books expense
// export, so every business expense is counted exactly once.
//   - A Zoho expense and the bank charge it records are ONE entry (matched by
//     exact amount, bank date 3 days before to 7 days after the Zoho date).
//   - Zoho-only expenses were paid outside Bluevine (cash, personal card, or
//     before the account existed). Bank-only charges get a category from the
//     merchant, or go to review when the merchant is ambiguous (Walmart, Amazon…).
//   - Owner's equity (owner decision, CLAUDE.md §9): transfers to the owner
//     (Venmo, SoFi) are REPAYMENT of owner's equity, never expense or pay.
//     The TOTALS come from the owner's own Owner's Equity ledger in admin
//     (equity_entries: contribution / draw); bank transfers are only matched
//     against it so ones missing from the ledger are pointed out.
//   - Customer money (Stripe payouts, cash/check deposits) is NOT revenue here:
//     revenue is the canonical collected figure from the jobs (business-metrics.js);
//     deposits are only used to reconcile.
//   - Sales tax paid to AZ (TPT) is remitting tax collected, not an expense.
// Nothing here guesses silently: unclear rows get `review` and a reason.
// Tests: tests/money.test.js

export const EXPENSE_CATEGORIES = [
  'Parts', 'Tools and Equipment', 'Shop Supplies', 'Advertising and Marketing', 'Software and Subscriptions',
  'Insurance', 'Repair Info', 'Fuel', 'Bank and Payment Fees', 'Customer Refunds', 'Other Business Expense',
];
// Kinds: expense | tax_paid | owner_out (equity repayment) | owner_in (contribution)
//   | helper_pay (paying a helper, /admin/pay — a business cost, owner decision 2026-10-06)
//        | deposit (customer money into the bank) | income (interest) | excluded (duplicate / not business)
export const KINDS = ['expense', 'tax_paid', 'owner_out', 'owner_in', 'deposit', 'income', 'excluded', 'helper_pay'];

// ---- CSV ---------------------------------------------------------------------------------------

export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some(c => c !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const cents = n => Math.round(Number(n) * 100);
const ymd = s => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
function hash(s) { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); }

export function detectKind(text) {
  const head = String(text || '').replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase();
  if (head.includes('debit/credit') && head.includes('description')) return 'bluevine';
  if (head.includes('account_name') && head.includes('transaction_id')) return 'zoho';
  return null;
}

// Bluevine "Transactions" CSV. The id is stable across re-uploads: identical
// date+amount+description rows are numbered in file order.
export function parseBluevine(text) {
  const seen = new Map();
  return parseCsv(text).map(r => {
    const date = ymd(r.date); const amount = Number(r['debit/credit']);
    const desc = String(r.description || '').replace(/\s+/g, ' ').trim();
    if (!date || !Number.isFinite(amount) || !desc) return null;
    const key = `${date}|${cents(amount)}|${hash(desc.toLowerCase())}`;
    const n = (seen.get(key) || 0) + 1; seen.set(key, n);
    return { id: `bv:${key}:${n}`, date, desc, amount, balance: r.balance === '' ? null : Number(r.balance) };
  }).filter(Boolean);
}

// Zoho Books "Expense Details" CSV.
export function parseZoho(text) {
  return parseCsv(text).map(r => {
    const date = ymd(r.date); const amount = Number(r.amount_with_tax || r.amount);
    if (!date || !Number.isFinite(amount) || !r.transaction_id) return null;
    return { id: `zb:${r.transaction_id}`, date, amount, account: r.account_name || '', vendor: r.vendor_name || '', customer: r.customer_name || '', receipt: r.receipt_name || '', status: r.status || '' };
  }).filter(Boolean);
}

// Merge a new upload into what's stored (by id; newer copy wins).
export function mergeRows(stored = [], fresh = []) {
  const by = new Map(stored.map(r => [r.id, r]));
  let added = 0;
  for (const r of fresh) { if (!by.has(r.id)) added++; by.set(r.id, r); }
  return { rows: [...by.values()].sort((a, b) => b.date.localeCompare(a.date)), added };
}

// ---- classification ------------------------------------------------------------------------------

const ZOHO_ACCOUNT = [
  [/insurance/i, 'Insurance'], [/tool|equipment/i, 'Tools and Equipment'], [/shop suppl|suppl/i, 'Shop Supplies'],
  [/advertis|marketing/i, 'Advertising and Marketing'], [/part|job expense|material/i, 'Parts'], [/refund/i, 'Customer Refunds'],
  [/software|subscription/i, 'Software and Subscriptions'], [/fuel|gas|mileage/i, 'Fuel'], [/bank|fee/i, 'Bank and Payment Fees'],
];
export const zohoCategory = account => ZOHO_ACCOUNT.find(([re]) => re.test(account))?.[1] || 'Other Business Expense';

// Bank merchants. Order matters.
const BANK_RULES = [
  [/gidgarage/i, 'deposit', 'Card payouts (Stripe)'],
  [/poscash|swipe reload|mobile deposit|cash deposit|check deposit/i, 'deposit', 'Cash / check deposit'],
  [/interest earned/i, 'income', 'Interest'],
  [/echiverri/i, 'owner_in', 'Owner deposit'],
  [/venmo|transfer to sofi|sofi/i, 'owner_out', 'Owner equity repayment'],
  [/dept of revenue/i, 'tax_paid', 'AZ sales tax (TPT)'],
  [/svc chain|service fee|monthly fee|wire fee/i, 'expense', 'Bank and Payment Fees'],
  [/o'?reilly|autozone|napa|findlay|sp motive|arnold machinery|rockauto|advance auto|carquest|dealer parts/i, 'expense', 'Parts'],
  [/harbor freight|home depot|lowe'?s|mucarus|snap.?on|matco|mac tools/i, 'expense', 'Tools and Equipment'],
  [/facebk|facebook|meta ads|google ads|yelp|thumbtack|nextdoor|wave .*print|flg print|vistaprint/i, 'expense', 'Advertising and Marketing'],
  [/anthropic|openai|supabase|zoho|cloudflare|github|google \*?workspace|livekit|deepgram|cartesia|brevo/i, 'expense', 'Software and Subscriptions'],
  [/liberty mutual|progressive|state farm|geico|insuran/i, 'expense', 'Insurance'],
  [/toyota tis|alldata|mitchell|identifix|techinfo/i, 'expense', 'Repair Info'],
  [/speedway|shell oil|chevron|circle k|maverik|conoco|fuel/i, 'expense', 'Fuel'],
];
const AMBIGUOUS = /amazon|walmart|wal-mart|wm supercenter|target|best buy|walgreens|costco|ebay|paypal/i;

export function classifyBank(tx) {
  for (const [re, kind, category] of BANK_RULES) {
    if (re.test(tx.desc)) {
      // Money back from a merchant is a refund against that category.
      if (kind === 'expense' && tx.amount > 0) return { kind: 'expense', category, refund: true };
      return { kind, category };
    }
  }
  if (tx.amount > 0) return { kind: 'deposit', category: 'Other deposit', review: 'Money in from an unknown source: customer payment, refund, or your own money?' };
  if (AMBIGUOUS.test(tx.desc)) return { kind: 'expense', category: 'Other Business Expense', review: 'Store that sells business and personal items: pick a category, or Personal.' };
  return { kind: 'expense', category: 'Other Business Expense', review: 'Unknown merchant: pick a category.' };
}

const dayNum = s => Math.round(Date.parse(`${s}T12:00:00Z`) / 86400000);

// ---- the ledger ---------------------------------------------------------------------------------

// overrides: { [entryId]: { kind?, category?, funding? } }  (the owner's decisions)
// equity: rows of the admin Owner's Equity ledger { entry_date, entry_type: contribution|draw, amount }.
// payouts: helper payouts from /admin/pay { paid_on, amount } (the helper-pay source of truth).
export function buildLedger({ bank = [], zoho = [], overrides = {}, equity = [], payouts: allPayouts = [] }) {
  const payouts = allPayouts.filter(p => p?.owner_draw !== true); // the owner's own pay is equity (its equity_entries row)
  const bankStart = bank.length ? bank.reduce((m, r) => (r.date < m ? r.date : m), bank[0].date) : null;
  const debits = bank.filter(r => r.amount < 0);
  const used = new Set();
  const entries = [];

  // Zoho first (it carries the precise category and the receipt), oldest first.
  const zSorted = [...zoho].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const baseOf = z => ({ id: z.id, date: z.date, amount: z.amount, category: zohoCategory(z.account), kind: 'expense', desc: z.vendor || z.account, vendor: z.vendor, zohoAccount: z.account, receipt: z.receipt, zohoId: z.id, customer: z.customer });
  // Pass 1: one Zoho expense = one bank charge (exact amount, close date).
  const exact = new Map();
  for (const z of zSorted) {
    const zc = cents(z.amount); const zd = dayNum(z.date);
    let best = null;
    for (const b of debits) {
      if (used.has(b.id) || cents(-b.amount) !== zc) continue;
      const lag = dayNum(b.date) - zd;
      if (lag < -3 || lag > 7) continue;
      if (!best || Math.abs(lag) < Math.abs(dayNum(best.date) - zd)) best = b;
    }
    if (best) { used.add(best.id); exact.set(z.id, best); }
  }
  // Pass 2: one Zoho receipt = several bank charges from one merchant (a Meta ads
  // billing summary): consecutive same-merchant charges in the 45 days up to 3 days
  // after the Zoho date whose sum is exactly the Zoho amount.
  const groups = new Map();
  const merchant = d => String(d).toUpperCase().replace(/[^A-Z ]/g, ' ').trim().split(/\s+/)[0] || '';
  for (const z of zSorted) {
    if (exact.has(z.id)) continue;
    const zc = cents(z.amount); const zd = dayNum(z.date); const cat = zohoCategory(z.account);
    const pool = debits.filter(b => !used.has(b.id) && classifyBank(b).category === cat && dayNum(b.date) <= zd + 3 && dayNum(b.date) >= zd - 45)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const byMerchant = new Map();
    for (const b of pool) { const k = merchant(b.desc); byMerchant.set(k, [...(byMerchant.get(k) || []), b]); }
    let found = null;
    for (const list of byMerchant.values()) {
      for (let i = 0; i < list.length && !found; i++) {
        let sum = 0;
        for (let j = i; j < list.length; j++) {
          sum += cents(-list[j].amount);
          if (sum === zc && j > i) { found = list.slice(i, j + 1); break; }
          if (sum > zc) break;
        }
      }
      if (found) break;
    }
    if (found) { for (const b of found) used.add(b.id); groups.set(z.id, found); }
  }
  for (const z of zSorted) {
    const zc = cents(z.amount); const zd = dayNum(z.date);
    const refund = /refund/i.test(z.account);
    const base = baseOf(z);
    const best = exact.get(z.id);
    if (best) {
      entries.push({ ...base, source: 'both', bankId: best.id, bankDate: best.date, bankDesc: best.desc, funding: 'bank' });
      continue;
    }
    const group = groups.get(z.id);
    if (group) {
      entries.push({ ...base, source: 'both', bankIds: group.map(b => b.id), bankDate: group.at(-1).date, bankDesc: `${group.length} charges: ${group[0].desc.split(',')[0]} ${group[0].date} … ${group.at(-1).date}`, funding: 'bank' });
      continue;
    }
    // Not in the bank. Same amount already recorded in Zoho within 3 days and matched → likely the same receipt twice.
    const twin = entries.find(e => e.zohoId && e.zohoId !== z.id && cents(e.amount) === zc && Math.abs(dayNum(e.date) - zd) <= 3);
    if (twin && !refund) {
      entries.push({ ...base, source: 'zoho', kind: 'excluded', funding: 'n/a', review: `Looks like the same receipt twice in Zoho (also ${twin.date}, $${twin.amount.toFixed(2)}). Not counted — include it if it was a separate purchase.`, twinId: twin.id });
      continue;
    }
    if (bankStart && z.date < bankStart) {
      entries.push({ ...base, source: 'zoho', funding: 'personal', note: 'Before the Bluevine account existed: paid with your own money (counts as money you put in).' });
    } else {
      entries.push({ ...base, source: 'zoho', funding: 'outside', review: 'In Zoho but not in Bluevine: paid with cash or your personal card? (Personal card = money you put in.)' });
    }
  }

  for (const b of bank) {
    if (used.has(b.id)) continue;
    const c = classifyBank(b);
    const e = { id: b.id, date: b.date, amount: -b.amount, category: c.category, kind: c.kind, desc: b.desc, source: 'bank', bankId: b.id, funding: 'bank' };
    if (c.refund) { e.amount = -b.amount; e.note = 'Refund from the merchant'; } // negative expense
    if (c.review) e.review = c.review;
    // A bank charge with no Zoho receipt is still counted (receipt missing is flagged, not hidden).
    if (c.kind === 'expense' && !c.review && !c.refund && b.amount < 0) e.noReceipt = true;
    entries.push(e);
  }

  // Apply the owner's decisions.
  for (const e of entries) {
    const o = overrides[e.id];
    if (!o) continue;
    if (o.kind && KINDS.includes(o.kind)) e.kind = o.kind;
    if (o.category && (EXPENSE_CATEGORIES.includes(o.category) || e.kind !== 'expense')) e.category = o.category;
    if (o.funding) e.funding = o.funding;
    if (o.kind === 'owner_out' && !o.category) e.category = 'Personal purchase (owner equity)';
    e.reviewed = true; delete e.review;
  }

  // Helper pay: a bank transfer out (e.g. a Venmo) with the same amount as a
  // logged payout, within 5 days, is that payout — not owner's equity. The
  // owner's explicit decision on an entry always wins over this match.
  const usedPay = new Set();
  for (const e of entries.filter(x => x.source === 'bank' && (x.kind === 'helper_pay' || (x.kind === 'owner_out' && !overrides[x.id]?.kind))).sort((a, b) => a.date.localeCompare(b.date))) {
    const want = cents(e.amount); const d = dayNum(e.date);
    const hit = payouts.find((q, i) => !usedPay.has(i) && cents(q.amount) === want && Math.abs(dayNum(String(q.paid_on).slice(0, 10)) - d) <= 5);
    if (hit) { usedPay.add(payouts.indexOf(hit)); e.kind = 'helper_pay'; e.category = 'Helper pay'; e.inPayLedger = true; }
    else if (e.kind === 'helper_pay') { e.category = 'Helper pay'; e.notInPayLedger = true; }
  }

  // Owner transfers vs the Owner's Equity ledger: same amount, within 5 days.
  const usedEq = new Set();
  for (const e of entries.filter(x => x.kind === 'owner_out' || x.kind === 'owner_in').sort((a, b) => a.date.localeCompare(b.date))) {
    const type = e.kind === 'owner_out' ? 'draw' : 'contribution';
    const want = cents(Math.abs(e.amount)); const d = dayNum(e.date);
    const hit = equity.find((q, i) => !usedEq.has(i) && q.entry_type === type && cents(q.amount) === want && Math.abs(dayNum(String(q.entry_date).slice(0, 10)) - d) <= 5);
    if (hit) { usedEq.add(equity.indexOf(hit)); e.inLedger = true; } else e.notInLedger = true;
  }
  return { entries: entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)), bankStart };
}

// ---- totals for a period -------------------------------------------------------------------------

const r2 = n => Math.round(n * 100) / 100;
// revenue: { collected, salesTax } for the same window (canonical, from the jobs).
export function summarize(entries, from, to, revenue = { collected: 0, salesTax: 0 }, equity = [], payouts = []) {
  const inR = e => e.date >= from && e.date <= to;
  const list = entries.filter(inR);
  const byCat = {};
  let expenses = 0, taxPaid = 0, ownerOut = 0, ownerIn = 0, deposits = 0, income = 0, review = 0, outside = 0, helperBankOnly = 0;
  for (const e of list) {
    if (e.review) review++;
    if (e.kind === 'expense') {
      expenses += e.amount; byCat[e.category] = (byCat[e.category] || 0) + e.amount;
      if (e.funding === 'outside') outside += e.amount;
    } else if (e.kind === 'tax_paid') taxPaid += e.amount;
    else if (e.kind === 'owner_out') { if (e.notInLedger) ownerOut += e.amount; }
    else if (e.kind === 'helper_pay') { if (e.notInPayLedger) helperBankOnly += e.amount; }
    else if (e.kind === 'owner_in') { if (e.notInLedger) ownerIn += -e.amount; } // deposits are negative outflows
    else if (e.kind === 'deposit') deposits += -e.amount;
    else if (e.kind === 'income') income += -e.amount;
  }
  // Owner's equity totals come from the admin ledger; bank transfers missing from it are reported separately.
  let putIn = 0, paidBack = 0;
  for (const q of equity) {
    const day = String(q.entry_date).slice(0, 10);
    if (day < from || day > to) continue;
    if (q.entry_type === 'contribution') putIn += Number(q.amount) || 0; else if (q.entry_type === 'draw') paidBack += Number(q.amount) || 0;
  }
  // Helper pay: the /admin/pay payouts in the period (cash, Venmo, anything),
  // plus bank transfers marked helper pay that were never logged there. Each once.
  let helperLogged = 0;
  for (const q of payouts) { if (q?.owner_draw === true) continue; const day = String(q.paid_on).slice(0, 10); if (day >= from && day <= to) helperLogged += Number(q.amount) || 0; }
  const helperPay = helperLogged + helperBankOnly;
  const collected = r2(revenue.collected || 0); const salesTax = r2(revenue.salesTax || 0);
  const net = r2(collected - salesTax - expenses - helperPay + income);
  return {
    from, to, revenue: collected, salesTaxCollected: salesTax, salesTaxPaid: r2(taxPaid), salesTaxOwed: r2(salesTax - taxPaid),
    expenses: r2(expenses), byCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, r2(v)]).sort((a, b) => b[1] - a[1])),
    interest: r2(income), net, helperPay: r2(helperPay), helperPayNotInLedger: r2(helperBankOnly),
    ownerPaidBack: r2(paidBack), ownerPutIn: r2(putIn), ownerEquityNet: r2(putIn - paidBack),
    bankDrawsNotInLedger: r2(ownerOut), bankContributionsNotInLedger: r2(ownerIn),
    deposits: r2(deposits), paidOutsideBank: r2(outside), needsReview: review, count: list.length,
  };
}
