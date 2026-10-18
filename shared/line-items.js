// Estimate / invoice line quantities. `amount` stays the LINE TOTAL (rate × qty), so
// every total, tax, payment, Money and Jarvis path that sums `amount` is unchanged.
// `qty` = hours on a labor line, count on a parts line; lines saved before
// quantities existed have no qty and count as 1 at their amount.
// Tests: tests/line-items.test.js

const round2 = n => Math.round(Number(n || 0) * 100) / 100;

export const lineQty = i => (Number(i?.qty) > 0 ? Number(i.qty) : 1);
// What the $ box shows: the unit price, or the labor total on a labor line.
export const linePrice = i => (i?.type === 'labor' ? Number(i.amount || 0) : lineRate(i));
export const lineRate = i => (i?.rate != null ? Number(i.rate) : round2(Number(i?.amount || 0) / lineQty(i)));

// Change the quantity or the price typed in the $ box. Parts: $ is the unit price and
// the total follows (rate × qty). Labor: $ is the job's labor total (quoted flat) and
// qty is only the hours worked, so typing hours never changes the price.
export function withLine(i, { qty, rate } = {}) {
  const q = qty != null ? Number(qty) : lineQty(i);
  if (i.type === 'labor') { const amount = round2(rate != null ? rate : i.amount); return { ...i, qty: q, rate: round2(amount / q), amount }; }
  const r = rate != null ? Number(rate) : lineRate(i);
  return { ...i, qty: q, rate: r, amount: round2(q * r) };
}

// What the customer reads: "Brake pads (×2 @ $45.00)". Labor hours are the owner's
// own record (weekly hours, his pay), never shown: labor is quoted as one price.
export function lineText(i) {
  const q = lineQty(i);
  if (q === 1 || i.type === 'labor') return i.label;
  return `${i.label} (×${q} @ $${lineRate(i).toFixed(2)})`;
}

// Hours worked on a job: the qty of its labor lines. Flat-priced labor lines
// (no qty, saved before hours existed) carry no hours.
export function jobLaborHours(items = []) {
  return round2((items || []).filter(i => i?.type === 'labor' && Number(i.qty) > 0).reduce((s, i) => s + Number(i.qty), 0));
}
