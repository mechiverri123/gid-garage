// Fleet actions for /admin-api-data (already Access-verified there, and used by
// both /admin and /jarvis). Rules live in shared/fleet.js. Writes only the
// fleet_accounts / fleet_vehicles tables and inserts ordinary bookings for
// fleet jobs; it never edits an existing booking's time or money fields.
//   fleet-data            {}                                   -> { accounts, vehicles, jobs }
//   fleet-create          { fields }                           -> account (number assigned by the database)
//   fleet-update          { fleetId, fields }                  -> account
//   fleet-vehicle-save    { fleetId, vehicleId?, fields }      -> vehicle
//   fleet-add-job         { fleetId, vehicleId?, date, time?, service?, notes?, mileage? } -> booking row
// Tests: tests/fleet.test.js
import { normalizeUnit, unitLabel, fleetJobRow, VEHICLE_STATUSES } from '../../shared/fleet.js';
import { isValidYmd } from '../../shared/business-rules.js';

export const NEEDS_MIGRATION = 'The fleet tables are not set up yet: run fleet_migration.sql once in the Supabase SQL editor.';
const MISSING = /42P01|PGRST205|PGRST200|42703|does not exist|Could not find the/i;

export class FleetError extends Error {}

const str = (v, n = 200) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const intIn = (v, lo, hi) => {
  if (v === '' || v == null) return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new FleetError(`Number out of range (${lo}–${hi}).`);
  return n;
};

export function accountFields(f = {}, { creating = false } = {}) {
  const out = {};
  if (creating || 'name' in f) { const n = str(f.name, 120); if (!n) throw new FleetError('Company name is required.'); out.name = n; }
  for (const k of ['contact_name', 'phone', 'email', 'address']) if (k in f) out[k] = str(f[k], 200);
  if ('notes' in f) out.notes = str(f.notes, 2000);
  if ('status' in f) { if (!['active', 'archived'].includes(f.status)) throw new FleetError('Bad status.'); out.status = f.status; }
  return out; // company_number is never accepted from the client
}

export function vehicleFields(f = {}, { creating = false } = {}) {
  const out = {};
  if (creating || 'unit_number' in f) { const u = normalizeUnit(f.unit_number); if (!u) throw new FleetError('Unit number is required (up to 20 characters).'); out.unit_number = u; }
  if ('year' in f) out.year = intIn(f.year, 1900, 2100);
  for (const k of ['make', 'model', 'engine', 'next_service_label']) if (k in f) out[k] = str(f[k], 80);
  if ('vin' in f) { const v = str(f.vin, 30); out.vin = v ? v.toUpperCase().replace(/\s+/g, '') : null; }
  if ('plate' in f) { const p = str(f.plate, 15); out.plate = p ? p.toUpperCase() : null; }
  if ('mileage' in f) out.mileage = intIn(f.mileage, 0, 3_000_000);
  if ('next_service_miles' in f) out.next_service_miles = intIn(f.next_service_miles, 0, 3_000_000);
  if ('next_service_date' in f) {
    const d = str(f.next_service_date, 10);
    if (d && !isValidYmd(d)) throw new FleetError('Next service date must be YYYY-MM-DD.');
    out.next_service_date = d;
  }
  if ('status' in f) { if (!VEHICLE_STATUSES.includes(f.status)) throw new FleetError('Bad vehicle status.'); out.status = f.status; }
  if ('notes' in f) out.notes = str(f.notes, 2000);
  return out;
}

const JOB_COLUMNS = 'id,service,date,time,date_tbd,fname,vehicle,vin,mileage,status,job_status,line_items,estimate_amount,invoice_amount,tax_amount,amount_paid,has_inspection,notes,fleet_id,fleet_vehicle_id';

export async function handleFleetAction(action, p, { base, headers, fetchImpl = (...a) => fetch(...a), now = new Date() }) {
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${base}/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = typeof body === 'object' && body ? `${body.code || ''} ${body.message || ''} ${body.details || ''}` : String(body);
      if (MISSING.test(msg) && /fleet/i.test(msg + path)) throw new FleetError(NEEDS_MIGRATION);
      const err = new FleetError(body?.message || `Database error ${res.status}`); err.code = body?.code; err.detail = msg; throw err;
    }
    return body;
  };
  const one = async (table, id) => (await call(`${table}?id=eq.${encodeURIComponent(id)}&select=*`))?.[0] || null;
  const stamp = () => new Date(now).toISOString();
  const uniqueUnit = (e, unit) => { if (e.code === '23505') throw new FleetError(`Unit ${unitLabel(unit)} already exists in this fleet.`); throw e; };

  switch (action) {
    case 'fleet-data': {
      const [accounts, vehicles, jobs] = await Promise.all([
        call('fleet_accounts?select=*&order=name.asc'),
        call('fleet_vehicles?select=*&order=unit_number.asc'),
        call(`bookings?select=${JOB_COLUMNS}&fleet_id=not.is.null&order=date.desc`),
      ]);
      return { accounts, vehicles, jobs };
    }
    case 'fleet-create': {
      const fields = accountFields(p.fields, { creating: true });
      // The trigger picks a random unused number; UNIQUE guards a race, so retry on that one conflict.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const [row] = await call('fleet_accounts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(fields) });
          return row;
        } catch (e) {
          if (e.code === '23505' && /company_number/.test(e.detail || '')) continue;
          throw e;
        }
      }
      throw new FleetError('Could not assign a fleet number — try again.');
    }
    case 'fleet-update': {
      const fields = accountFields(p.fields);
      if (!Object.keys(fields).length) throw new FleetError('Nothing to change.');
      const rows = await call(`fleet_accounts?id=eq.${encodeURIComponent(p.fleetId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...fields, updated_at: stamp() }) });
      if (!rows?.length) throw new FleetError('Fleet not found.');
      return rows[0];
    }
    case 'fleet-vehicle-save': {
      const account = p.fleetId ? await one('fleet_accounts', p.fleetId) : null;
      if (!account) throw new FleetError('Fleet not found.');
      if (p.vehicleId) {
        const cur = await one('fleet_vehicles', p.vehicleId);
        if (!cur || cur.fleet_id !== account.id) throw new FleetError('Vehicle not found in this fleet.');
        const fields = vehicleFields(p.fields);
        if (!Object.keys(fields).length) throw new FleetError('Nothing to change.');
        try {
          const rows = await call(`fleet_vehicles?id=eq.${encodeURIComponent(p.vehicleId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...fields, updated_at: stamp() }) });
          return rows[0];
        } catch (e) { return uniqueUnit(e, fields.unit_number); }
      }
      const fields = vehicleFields(p.fields, { creating: true });
      try {
        const [row] = await call('fleet_vehicles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...fields, fleet_id: account.id }) });
        return row;
      } catch (e) { return uniqueUnit(e, fields.unit_number); }
    }
    case 'fleet-add-job': {
      const account = p.fleetId ? await one('fleet_accounts', p.fleetId) : null;
      if (!account) throw new FleetError('Fleet not found.');
      const vehicle = p.vehicleId ? await one('fleet_vehicles', p.vehicleId) : null;
      if (p.vehicleId && !vehicle) throw new FleetError('Vehicle not found.');
      let row;
      try {
        row = fleetJobRow({ account, vehicle, date: p.date, time: p.time, service: p.service, notes: str(p.notes, 1000) || '', mileage: p.mileage, id: `GID-${new Date(now).getTime()}`, createdAt: stamp() });
      } catch (e) { throw new FleetError(e.message); }
      const [inserted] = await call('bookings', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      return inserted || row;
    }
    default:
      throw new FleetError('Unknown fleet action.');
  }
}
