// Money ledger: Bluevine + Zoho Books reconciled so every expense counts once,
// owner's equity kept out of expenses, customer money kept out of revenue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectKind, parseBluevine, parseZoho, mergeRows, buildLedger, summarize, classifyBank } from '../shared/money.js';
import { handleMoney, MONEY_KEYS } from '../functions/jarvis/money.js';

const BV = `Date,Description,Debit/Credit,Balance,Name,Additional information,IMAD/trace ID,Bill due date,Bill number,Bill notes
2026-09-28,"O'REILLY 2654, FLAGSTAFF, AZUS",-147.66,500.00,,,,,,
2026-09-27,"GIDGARAGE, TRANSFER",788.06,,,,,,,
2026-09-26,"VENMO *KASSIDY ALTOMAR, 8558124430, NY",-550.0,,,,,,,
2026-09-26,"WM SUPERCENTER #4252, FLAGSTAFF, AZ",-64.3,,,,,,,
2026-09-25,"RVA AZ DEPT OF REVENUE, PHOENIX, AZ",-112.25,,,,,,,
2026-09-24,"FACEBK *A1, MENLO PARK, CA",-19.0,,,,,,,
2026-09-22,"FACEBK *A2, MENLO PARK, CA",-30.0,,,,,,,
2026-09-20,"AUTOZONE 2782, FLAGSTAFF, AZ",24.06,,,,,,,
2026-09-19,"Harbor Freight Tools U, Flagstaff, AZUS",-89.63,,,,,,,
2026-09-18,Interest earned in August 2026,0.78,,,,,,,
2026-09-17,miko echiverri - Deposit Account,100.00,,,,,,,
2026-09-16,"HARBOR FREIGHT TOOLS U, Flagstaff, AZUS",-10.00,,,,,,,
2026-09-16,"HARBOR FREIGHT TOOLS U, Flagstaff, AZUS",-10.00,,,,,,,
`;
const ZB = `status,date,transaction_number,vendor_name,account_name,customer_name,amount,amount_with_tax,transaction_type,transaction_id,vendor_id,customer_id,receipt_name
nonbillable,2026-09-01,,,Insurance Business Payment,,80.80,80.80,expense,1,,,a.jpg
nonbillable,2026-09-27,,,Parts,,147.66,147.66,expense,2,,,b.jpg
nonbillable,2026-09-18,,,Tools and Equipment,,89.63,89.63,expense,3,,,c.pdf
nonbillable,2026-09-18,,,Tools and Equipment,,89.63,89.63,expense,4,,,c.jpg
nonbillable,2026-09-24,,,Advertising And Marketing,,49.00,49.00,expense,5,,,meta.jpg
nonbillable,2026-09-20,,,Parts,,40.00,40.00,expense,6,,,cash.jpg
`;

test('CSV parsing and file detection', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2\r\n"say ""hi""",3'), [{ a: 'x, y', b: '2' }, { a: 'say "hi"', b: '3' }]);
  assert.equal(detectKind(BV), 'bluevine');
  assert.equal(detectKind(ZB), 'zoho');
  assert.equal(detectKind('foo,bar\n1,2'), null);
});

test('Bluevine ids are stable and identical same-day charges stay separate', () => {
  const a = parseBluevine(BV); const b = parseBluevine(BV);
  assert.deepEqual(a.map(r => r.id), b.map(r => r.id));
  const hf = a.filter(r => r.amount === -10);
  assert.equal(hf.length, 2);
  assert.notEqual(hf[0].id, hf[1].id);
  const merged = mergeRows(a, b);
  assert.equal(merged.rows.length, a.length);
  assert.equal(merged.added, 0);
});

test('bank classification: customer money, owner equity, tax, refunds, ambiguous stores', () => {
  const c = desc => classifyBank({ desc, amount: -1 });
  assert.equal(classifyBank({ desc: 'GIDGARAGE, TRANSFER', amount: 100 }).kind, 'deposit');
  assert.equal(c('VENMO *KASSIDY').kind, 'owner_out');
  assert.equal(c('Transfer to SoFi (6948)').kind, 'owner_out');
  assert.equal(classifyBank({ desc: 'miko echiverri - Deposit Account', amount: 50 }).kind, 'owner_in');
  assert.equal(c('RVA AZ DEPT OF REVENUE').kind, 'tax_paid');
  assert.equal(c('mucarus, UK, GBR').category, 'Tools and Equipment');
  assert.deepEqual(classifyBank({ desc: 'AUTOZONE 2782', amount: 24 }), { kind: 'expense', category: 'Parts', refund: true });
  assert.ok(c('WM SUPERCENTER #4252').review);
});

test('ledger: every bank row and Zoho expense lands exactly once; totals', () => {
  const bank = parseBluevine(BV); const zoho = parseZoho(ZB);
  const equity = [{ entry_date: '2026-09-26', entry_type: 'draw', amount: 550 }, { entry_date: '2026-09-02', entry_type: 'contribution', amount: 300 }];
  const { entries } = buildLedger({ bank, zoho, equity });
  const bankIds = entries.flatMap(e => [e.bankId, ...(e.bankIds || [])].filter(Boolean));
  assert.equal(new Set(bankIds).size, bankIds.length, 'no bank row twice');
  assert.equal(bankIds.length, bank.length, 'every bank row');
  assert.equal(entries.filter(e => e.zohoId).length, zoho.length, 'every Zoho expense');
  const by = id => entries.find(e => e.id === id);
  assert.equal(by('zb:2').source, 'both');                          // receipt + bank charge = one entry
  assert.equal(by('zb:3').source, 'both');
  assert.equal(by('zb:4').kind, 'excluded');                        // same receipt twice in Zoho
  assert.match(by('zb:4').review, /same receipt twice/);
  assert.equal(by('zb:5').bankIds.length, 2);                       // Meta summary = 2 FACEBK charges
  assert.equal(by('zb:1').funding, 'personal');                     // before the bank export: own money
  assert.equal(by('zb:6').funding, 'outside');                      // cash or personal card?
  assert.ok(by('zb:6').review);

  const s = summarize(entries, '2026-09-01', '2026-09-30', { collected: 1000, salesTax: 80 }, equity);
  // expenses: insurance 80.80 + parts 147.66 + tools 89.63 + meta 49 + cash parts 40 + walmart 64.30 + tools 20 − autozone refund 24.06
  assert.equal(s.expenses, 467.33);
  assert.equal(s.salesTaxPaid, 112.25);
  // Owner's equity totals are the admin ledger's; bank transfers only get matched against it.
  assert.equal(s.ownerPaidBack, 550);
  assert.equal(s.ownerPutIn, 300);
  assert.equal(entries.find(e => /VENMO/.test(e.desc)).inLedger, true);
  assert.equal(s.bankDrawsNotInLedger, 0);
  assert.equal(s.bankContributionsNotInLedger, 100);              // the $100 owner deposit isn't in the ledger
  assert.equal(s.interest, 0.78);
  assert.equal(s.revenue, 1000);                                    // from the jobs, not bank deposits
  assert.equal(s.deposits, 788.06);
  assert.equal(s.net, Math.round((1000 - 80 - 467.33 + 0.78) * 100) / 100);
});

test("the owner's decisions win: personal purchase, include a flagged twin, paid by personal card", () => {
  const bank = parseBluevine(BV); const zoho = parseZoho(ZB);
  const wm = bank.find(r => /WM SUPER/.test(r.desc)).id;
  const { entries } = buildLedger({ bank, zoho, overrides: { [wm]: { kind: 'owner_out' }, 'zb:4': { kind: 'expense' }, 'zb:6': { funding: 'personal' } } });
  const s = summarize(entries, '2026-09-01', '2026-09-30');
  assert.equal(s.bankDrawsNotInLedger, 614.3);                     // no ledger given: Venmo + the Walmart marked Personal
  assert.equal(entries.find(e => e.id === 'zb:6').funding, 'personal');
  assert.equal(s.expenses, Math.round((467.33 - 64.3 + 89.63) * 100) / 100);
  assert.equal(entries.find(e => e.id === wm).category, 'Personal purchase (owner equity)');
});

test('/jarvis/money: Access verified, uploads merge by id, revenue from jobs, decisions validated', async () => {
  const m = new Map();
  const bucket = { get: async k => (m.has(k) ? { json: async () => JSON.parse(m.get(k)) } : null), put: async (k, v) => { m.set(k, v); } };
  const env = { GID_PHOTOS: bucket, SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_KEY: 'k' };
  const ok = async () => ({ ok: true });
  const req = (method, body, qs = '') => new Request(`https://gidgarage.com/jarvis/money${qs}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
  const denied = await handleMoney({ request: req('GET'), env, verify: async () => ({ ok: false, status: 401, error: 'no' }) });
  assert.equal(denied.status, 401);
  let r = await (await handleMoney({ request: req('POST', { action: 'upload', text: BV, name: 'bv.csv' }), env, verify: ok })).json();
  assert.equal(r.kind, 'bluevine'); assert.equal(r.added, 13);
  r = await (await handleMoney({ request: req('POST', { action: 'upload', text: BV }), env, verify: ok })).json();
  assert.equal(r.added, 0, 're-upload adds nothing');
  await handleMoney({ request: req('POST', { action: 'upload', text: ZB }), env, verify: ok });
  assert.equal((await (await handleMoney({ request: req('POST', { action: 'upload', text: 'x,y\n1,2' }), env, verify: ok })).status), 400);
  assert.equal((await handleMoney({ request: req('POST', { action: 'decide', id: 'zb:6', category: 'Nope' }), env, verify: ok })).status, 400);
  await handleMoney({ request: req('POST', { action: 'decide', id: 'zb:6', funding: 'personal' }), env, verify: ok });
  assert.equal(JSON.parse(m.get(MONEY_KEYS.decisions))['zb:6'].funding, 'personal');
  const jobs = [{ id: 'j1', job_status: 'PAID', paid_at: '2026-09-10T18:00:00Z', amount_paid: 108, invoice_amount: 100, tax_amount: 8, payments: [{ amount: 108, at: '2026-09-10T18:00:00Z', method: 'Cash' }] }];
  const fetchImpl = async url => new Response(JSON.stringify(String(url).includes('equity_entries') ? [{ entry_type: 'draw', amount: 550, entry_date: '2026-09-26' }] : jobs));
  const g = await (await handleMoney({ request: req('GET', null, '?from=2026-09-01&to=2026-09-30'), env, verify: ok, fetchImpl })).json();
  assert.equal(g.summary.revenue, 108);
  assert.equal(g.summary.salesTaxCollected, 8);
  assert.equal(g.sources.bluevine.balance, 500);
  assert.equal(g.summary.ownerPaidBack, 550);
  assert.ok(g.entries.every(e => e.date >= '2026-09-01' && e.date <= '2026-09-30'));
});
