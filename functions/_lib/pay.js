// Helper pay actions for /admin-api-data (already Access-verified there).
// Rules: shared/pay.js. Tables: pay_migration.sql. Writes only the pay_* tables.
//   pay-data           {}                         -> { people, entries, payouts }
//   pay-payouts        {}                         -> payout rows incl. owner_draw ([] before the migration)
//   pay-person-save    { id?, fields }            -> person
//   pay-entry-add      { fields }                 -> entry
//   pay-entry-delete   { id }                     -> { ok }
//   pay-payout-add     { fields }                 -> payout
//   pay-payout-delete  { id }                     -> { ok }
// loadPayouts(): the payouts for net profit / Money ([] before the migration).
// Tests: tests/pay.test.js
// The owner's own pay (role 'owner') is OWNER PAY for his work: the payout is
// marked owner_draw, never an expense, and kept apart from the Owner's Equity
// ledger (that ledger is only money he put in and got back). Owner decision 2026-10-06.
import { cleanEntry, cleanPayout, ROLES } from '../../shared/pay.js';

export const NEEDS_MIGRATION = 'Helper pay is not set up yet: run pay_migration.sql once in the Supabase SQL editor.';
const MISSING = /42P01|PGRST205|PGRST200|42703|does not exist|Could not find the/i;

export class PayError extends Error {}

const str = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const rate = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!(n >= 0 && n <= 10000)) throw new PayError('Rates must be between $0 and $10,000.');
  return Math.round(n * 100) / 100;
};

export function personFields(f = {}, { creating = false } = {}) {
  const out = {};
  if (creating || 'name' in f) { const n = str(f.name, 80); if (!n) throw new PayError('Name is required.'); out.name = n; }
  for (const k of ['phone', 'email', 'pay_method']) if (k in f) out[k] = str(f[k], 120);
  if ('notes' in f) out.notes = str(f.notes, 1000);
  if ('hourly_rate' in f) out.hourly_rate = rate(f.hourly_rate);
  if ('job_rate' in f) out.job_rate = rate(f.job_rate);
  if ('active' in f) out.active = !!f.active;
  if (creating || 'role' in f) { const r = f.role || 'contractor'; if (!ROLES[r]) throw new PayError('Pick owner, contractor or employee.'); out.role = r; }
  return out;
}

function caller({ base, headers, fetchImpl }) {
  return async (path, init = {}) => {
    const res = await fetchImpl(`${base}/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = typeof body === 'object' && body ? `${body.code || ''} ${body.message || ''} ${body.details || ''}` : String(body);
      if (MISSING.test(msg) && /role|owner_draw|equity_entry_id/i.test(msg)) throw new PayError('Run pay_migration.sql again (it adds roles and owner pay; safe to re-run).');
      if (MISSING.test(msg) && /pay_/i.test(msg + path)) throw new PayError(NEEDS_MIGRATION);
      if (body?.code === '23505' && /owner/i.test(msg)) throw new PayError('Only one person can be the owner.');
      throw new PayError(body?.message || `Database error ${res.status}`);
    }
    return body;
  };
}

// Payouts for the money math. Never throws: before the migration (or on any
// read error) net profit simply has no helper pay to subtract.
export async function loadPayouts({ base, headers, fetchImpl = (...a) => fetch(...a) }) {
  try {
    // select=* so this keeps working whether or not the v2 columns exist yet.
    const res = await fetchImpl(`${base}/pay_payouts?select=*&order=paid_on.asc`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export async function handlePayAction(action, p, { base, headers, fetchImpl = (...a) => fetch(...a) }) {
  const call = caller({ base, headers, fetchImpl });
  const id = () => { const v = str(p.id, 64); if (!v) throw new PayError('Missing id.'); return encodeURIComponent(v); };
  const insert = async (table, row) => (await call(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0];
  const guard = fn => { try { return fn(); } catch (e) { throw new PayError(e.message); } };

  switch (action) {
    case 'pay-data': {
      const [people, entries, payouts] = await Promise.all([
        call('pay_people?select=*&order=active.desc,name.asc'),
        call('pay_entries?select=*&order=work_date.desc,created_at.desc&limit=2000'),
        call('pay_payouts?select=*&order=paid_on.desc,created_at.desc&limit=2000'),
      ]);
      return { people, entries, payouts };
    }
    case 'pay-person-save': {
      if (p.id) {
        const fields = personFields(p.fields);
        const rows = await call(`pay_people?id=eq.${id()}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(fields) });
        if (!rows?.length) throw new PayError('Person not found.');
        return rows[0];
      }
      return insert('pay_people', personFields(p.fields, { creating: true }));
    }
    case 'pay-payouts':
      return loadPayouts({ base, headers, fetchImpl });
    case 'pay-entry-add':
      return insert('pay_entries', guard(() => cleanEntry(p.fields)));
    case 'pay-payout-add': {
      const row = guard(() => cleanPayout(p.fields));
      const [person] = await call(`pay_people?id=eq.${encodeURIComponent(row.person_id)}&select=id,name,role`);
      if (!person) throw new PayError('Person not found.');
      return insert('pay_payouts', person.role === 'owner' ? { ...row, owner_draw: true } : row);
    }
    case 'pay-entry-delete': {
      const rows = await call(`pay_entries?id=eq.${id()}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (!rows?.length) throw new PayError('Already deleted.');
      return { ok: true };
    }
    case 'pay-payout-delete': {
      const rows = await call(`pay_payouts?id=eq.${id()}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (!rows?.length) throw new PayError('Already deleted.');
      // Rows saved before owner pay was split from equity had a linked ledger row; remove it too.
      if (rows[0].equity_entry_id) await call(`equity_entries?id=eq.${encodeURIComponent(rows[0].equity_entry_id)}`, { method: 'DELETE' });
      return { ok: true };
    }
    default:
      throw new PayError(`Unknown pay action: ${action}`);
  }
}
