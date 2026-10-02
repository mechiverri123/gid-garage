// Fleet (FLEET_PLAN.md): identity, history, state, search, calendar, the
// booking a fleet job is created as, and the /admin-api-data fleet actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUnit, unitLabel, nextUnitSuggestion, timeKey, jobKind, fleetJob, vehicleHistory, currentMileage,
  nextService, vehicleState, fleetSummary, searchVehicles, resolveUnit, findAccounts, calendarEntries, isFleetRow,
  fleetJobRow, SERVICE_DAY,
} from '../shared/fleet.js';
import { handleFleetAction, accountFields, vehicleFields, NEEDS_MIGRATION } from '../functions/_lib/fleet.js';

const A = { id: 'fa1', company_number: 4827, name: 'Flagstaff Equipment', phone: '928-555-0100', email: 'chris@fe.com', address: '1 Main St' };
const B = { id: 'fa2', company_number: 6153, name: 'Northern Arizona Landscaping' };
const V36 = { id: 'v36', fleet_id: 'fa1', unit_number: '36', year: 2020, make: 'Chevrolet', model: 'Silverado 2500HD', vin: '1GC4YREY0LF123456', plate: 'ABC1234', mileage: 85000, status: 'active', next_service_label: 'Oil change', next_service_miles: 90000 };
const V12 = { id: 'v12', fleet_id: 'fa1', unit_number: '12', year: 2019, make: 'Ford', model: 'F-250', status: 'active' };
const B36 = { id: 'vb36', fleet_id: 'fa2', unit_number: '36', year: 2021, make: 'Ford', model: 'Transit', status: 'active' };
const row = (o) => ({ id: o.id, service: 'Oil Change', date: '2026-09-18', time: '9:00 AM', job_status: 'PAID', status: 'confirmed', fleet_id: 'fa1', fleet_vehicle_id: 'v36', ...o });

test('unit numbers: "#" stripped, letters allowed, never renumbered; suggestion only', () => {
  assert.equal(normalizeUnit(' #36 '), '36');
  assert.equal(normalizeUnit('##A12'), 'A12');
  assert.equal(normalizeUnit('T-4'), 'T-4');
  assert.equal(normalizeUnit(''), null);
  assert.equal(normalizeUnit('x'.repeat(21)), null);
  assert.equal(unitLabel('36'), '#36');
  assert.equal(nextUnitSuggestion([{ unit_number: '36' }, { unit_number: 'A12' }, { unit_number: '108' }]), '109');
  assert.equal(nextUnitSuggestion([]), '1');
});

test('job kind: maintenance / repair / inspection', () => {
  assert.equal(jobKind('Oil Change', ['Full synthetic oil', 'Oil filter']), 'maintenance');
  assert.equal(jobKind('Brakes', ['Front pads', 'Front rotors']), 'repair');
  assert.equal(jobKind('Full Vehicle Inspection', []), 'inspection');
  assert.equal(jobKind('Other', ['DOT inspection']), 'inspection');
  assert.equal(jobKind('Oil Change', ['Oil', 'Front brake pads']), 'repair');
});

test('fleet job: total is the existing jobMoney display total; mileage parsed; wall-clock time sort', () => {
  const j = fleetJob(row({ id: 'j1', line_items: JSON.stringify([{ label: 'Full synthetic oil' }, { label: 'Oil filter' }]), invoice_amount: 110, tax_amount: 9.42, mileage: '87,421' }));
  assert.equal(j.total, 119.42);
  assert.equal(j.mileage, 87421);
  assert.deepEqual(j.items, ['Full synthetic oil', 'Oil filter']);
  assert.equal(j.kind, 'maintenance');
  assert.ok(timeKey('6:00 AM') < timeKey('6:30 AM') && timeKey('11:59 AM') < timeKey('12:00 PM') && timeKey('1:00 PM') < timeKey('TBD'));
});

test('history newest first; cancelled left out; mileage = highest known; next service due', () => {
  const jobs = [
    fleetJob(row({ id: 'a', date: '2026-06-04', service: 'Battery', mileage: '77901' })),
    fleetJob(row({ id: 'b', date: '2026-09-18', mileage: '87421' })),
    fleetJob(row({ id: 'c', date: '2026-08-22', service: 'Brakes', mileage: '83610' })),
    fleetJob(row({ id: 'x', date: '2026-09-20', status: 'cancelled' })),
    fleetJob(row({ id: 'o', date: '2026-10-08', job_status: 'BOOKED', fleet_vehicle_id: 'v12' })),
  ];
  assert.deepEqual(vehicleHistory(jobs, 'v36').map(j => j.id), ['b', 'c', 'a']);
  assert.equal(currentMileage(V36, vehicleHistory(jobs, 'v36')), 87421);
  const n = nextService(V36, 87421, '2026-10-01');
  assert.deepEqual([n.label, n.milesLeft, n.due, n.overdue], ['Oil change', 2579, false, false]);
  assert.equal(nextService(V36, 89100, '2026-10-01').due, true);                     // within 1,000 mi
  assert.equal(nextService({ next_service_date: '2026-10-10' }, null, '2026-10-01').due, true); // within 14 days
  assert.equal(nextService({ next_service_date: '2026-09-30' }, null, '2026-10-01').overdue, true);
  assert.equal(nextService({}, 1, '2026-10-01'), null);
  const s = vehicleState(V36, jobs, '2026-10-01');
  assert.equal(s.lastService.id, 'b');
  assert.equal(s.status, 'active');
  assert.equal(vehicleState({ ...V36, mileage: 89500 }, jobs, '2026-10-01').status, 'service_due');
  assert.equal(vehicleState(V12, jobs, '2026-10-01').openJobs.length, 1);
  assert.deepEqual(fleetSummary('fa1', [V36, V12, { ...V12, id: 'r', status: 'retired' }, { ...V12, id: 'att', status: 'attention' }], jobs, '2026-10-01'), { vehicleCount: 3, needsAttention: 1, serviceDue: 0 });
});

test('search: 36 / #36 / VIN / partial VIN / plate / make / year+model; exact unit first', () => {
  const vs = [V12, V36, { ...V12, id: 'v360', unit_number: '360' }];
  assert.deepEqual(searchVehicles(vs, '36').map(v => v.id), ['v36', 'v360']);
  assert.deepEqual(searchVehicles(vs, '#36').map(v => v.id)[0], 'v36');
  assert.deepEqual(searchVehicles(vs, '1GC4YREY0LF123456').map(v => v.id), ['v36']);
  assert.deepEqual(searchVehicles(vs, 'f123456').map(v => v.id), ['v36']);
  assert.deepEqual(searchVehicles(vs, 'abc1234').map(v => v.id), ['v36']);
  assert.deepEqual(searchVehicles(vs, 'ford').map(v => v.id), ['v12', 'v360']);
  assert.deepEqual(searchVehicles(vs, '2019 F-250').map(v => v.id), ['v12', 'v360']);
  assert.deepEqual(searchVehicles(vs, '2019 f250').map(v => v.id), ['v12', 'v360']);
});

test('resolve "36": inside a fleet only that fleet; otherwise every fleet that has it (caller shows choices)', () => {
  const vs = [V36, V12, B36];
  assert.deepEqual(resolveUnit(vs, 'truck 36'.replace(/^\D+/, ''), 'fa1').map(v => v.id), ['v36']);
  assert.deepEqual(resolveUnit(vs, '#36').map(v => v.id), ['v36', 'vb36']);
  assert.deepEqual(findAccounts([A, B], 'flagstaff equipment').map(a => a.id), ['fa1']);
  assert.deepEqual(findAccounts([A, B], 'fleet 6153').map(a => a.id), ['fa2']);
  assert.deepEqual(findAccounts([A, B], 'the fleet'), []);
});

test('calendar: service days list the units booked that date; vehicle jobs show their unit', () => {
  const jobs = [
    fleetJob(row({ id: 'd', date: '2026-10-08', time: '6:00 AM', service: SERVICE_DAY, fleet_vehicle_id: null, job_status: 'BOOKED' })),
    fleetJob(row({ id: 'j36', date: '2026-10-08', time: '6:30 AM', job_status: 'BOOKED' })),
    fleetJob(row({ id: 'j12', date: '2026-10-08', time: '7:15 AM', fleet_vehicle_id: 'v12', job_status: 'BOOKED' })),
    fleetJob(row({ id: 'other', date: '2026-10-08', fleet_id: 'fa2', fleet_vehicle_id: 'vb36', job_status: 'BOOKED' })),
    fleetJob(row({ id: 'tbd', date: '2026-10-09', date_tbd: true })),
  ];
  const e = calendarEntries(jobs, [V36, V12, B36], { fleetId: 'fa1', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(e.map(x => [x.id, x.type]), [['d', 'day'], ['j36', 'vehicle'], ['j12', 'vehicle']]);
  assert.deepEqual(e[0].units, ['12', '36']);
  assert.equal(e[1].unit, '36');
  assert.equal(isFleetRow({ fleet_id: 'fa1' }), true);
  assert.equal(isFleetRow({ fleet_id: null }), false);
  assert.equal(isFleetRow({ fleetId: 'fa1' }), true);
});

test('a fleet job is a normal booking linked to the fleet and unit; no money fields; invoice to the company', () => {
  const r = fleetJobRow({ account: A, vehicle: V36, date: '2026-10-08', time: '6:30 AM', service: 'Oil Change', notes: 'Bring 10 qt', id: 'GID-1', createdAt: '2026-10-01T15:00:00.000Z' });
  assert.equal(r.fleet_id, 'fa1');
  assert.equal(r.fleet_vehicle_id, 'v36');
  assert.equal(r.fname, 'Flagstaff Equipment');
  assert.equal(r.email, 'chris@fe.com');
  assert.equal(r.vehicle, '2020 Chevrolet Silverado 2500HD');
  assert.equal(r.vin, V36.vin);
  assert.equal(r.mileage, '85000');
  assert.equal(r.job_status, 'BOOKED');
  assert.equal(r.created_at, '2026-10-01T15:00:00.000Z');
  assert.match(r.notes, /^\[Fleet #4827 · Unit #36\] Bring 10 qt$/);
  for (const k of ['invoice_amount', 'estimate_amount', 'tax_amount', 'amount_paid', 'payments', 'paid_at', 'customer_id']) assert.ok(!(k in r), k);
  const day = fleetJobRow({ account: A, date: '2026-10-08', id: 'GID-2', createdAt: 'x' });
  assert.equal(day.service, SERVICE_DAY);
  assert.equal(day.fleet_vehicle_id, null);
  assert.throws(() => fleetJobRow({ account: A, vehicle: B36, date: '2026-10-08', service: 'x', id: 'i' }), /different fleet/);
  assert.throws(() => fleetJobRow({ account: A, vehicle: V36, date: '10/08/2026', service: 'x', id: 'i' }), /date/);
});

test('field validation: company number never accepted from the client; unit required', () => {
  assert.deepEqual(accountFields({ name: ' Acme ', company_number: 1111 }, { creating: true }), { name: 'Acme' });
  assert.throws(() => accountFields({}, { creating: true }), /name is required/);
  assert.throws(() => vehicleFields({ make: 'Ford' }, { creating: true }), /Unit number is required/);
  assert.deepEqual(vehicleFields({ unit_number: '#36', vin: ' 1gc4 ', plate: 'abc', mileage: '87,421', year: '2020' }, { creating: true }),
    { unit_number: '36', vin: '1GC4', plate: 'ABC', mileage: 87421, year: 2020 });
  assert.throws(() => vehicleFields({ next_service_date: '10/1/26' }), /YYYY-MM-DD/);
  assert.throws(() => vehicleFields({ status: 'gone' }), /status/);
});

// ---- the API against a fake PostgREST ----------------------------------------------------------------
function fakeDb({ failNumbers = 0, migrated = true } = {}) {
  const t = { fleet_accounts: [], fleet_vehicles: [], bookings: [] };
  let n = 4826; let fails = failNumbers;
  const res = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const table = u.pathname.split('/').pop(); const method = init.method || 'GET';
    if (!migrated && table.startsWith('fleet')) return res({ code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }, 404);
    const idEq = u.searchParams.get('id')?.replace(/^eq\./, '');
    if (method === 'GET') {
      let rows = t[table];
      if (idEq) rows = rows.filter(r => r.id === idEq);
      if (u.searchParams.get('fleet_id') === 'not.is.null') rows = rows.filter(r => r.fleet_id);
      return res(rows);
    }
    const body = JSON.parse(init.body);
    if (method === 'POST') {
      if (table === 'fleet_accounts') {
        if (fails-- > 0) return res({ code: '23505', message: 'duplicate key', details: 'Key (company_number)=(4827) already exists.' }, 409);
        const r = { id: `fa${t.fleet_accounts.length + 1}`, company_number: ++n, ...body }; t.fleet_accounts.push(r); return res([r], 201);
      }
      if (table === 'fleet_vehicles') {
        if (t.fleet_vehicles.some(v => v.fleet_id === body.fleet_id && v.unit_number.toLowerCase() === body.unit_number.toLowerCase())) return res({ code: '23505', message: 'duplicate key', details: 'fleet_vehicles_fleet_unit_key' }, 409);
        const r = { id: `v${t.fleet_vehicles.length + 1}`, status: 'active', ...body }; t.fleet_vehicles.push(r); return res([r], 201);
      }
      t[table].push(body); return res([body], 201);
    }
    if (method === 'PATCH') { const r = t[table].find(x => x.id === idEq); if (!r) return res([]); Object.assign(r, body); return res([r]); }
    return res({}, 400);
  };
  return { t, ctx: { base: 'https://sb/rest/v1', headers: {}, fetchImpl, now: new Date('2026-10-01T15:00:00Z') } };
}

test('API: create fleet (number from the database, retries a race), vehicles unique per fleet, add job, data', async () => {
  const { t, ctx } = fakeDb({ failNumbers: 2 });
  const acct = await handleFleetAction('fleet-create', { fields: { name: 'Flagstaff Equipment', company_number: 1 } }, ctx);
  assert.equal(acct.company_number, 4827);            // assigned by the database, not the client
  const acct2 = await handleFleetAction('fleet-create', { fields: { name: 'NAZ Landscaping' } }, ctx);
  const v = await handleFleetAction('fleet-vehicle-save', { fleetId: acct.id, fields: { unit_number: '#36', make: 'Chevrolet' } }, ctx);
  assert.equal(v.unit_number, '36');
  await assert.rejects(handleFleetAction('fleet-vehicle-save', { fleetId: acct.id, fields: { unit_number: '36' } }, ctx), /Unit #36 already exists in this fleet/);
  await handleFleetAction('fleet-vehicle-save', { fleetId: acct2.id, fields: { unit_number: '36' } }, ctx);   // another fleet may have #36
  await assert.rejects(handleFleetAction('fleet-vehicle-save', { fleetId: acct2.id, vehicleId: v.id, fields: { notes: 'x' } }, ctx), /not found in this fleet/);
  const job = await handleFleetAction('fleet-add-job', { fleetId: acct.id, vehicleId: v.id, date: '2026-10-08', time: '6:30 AM', service: 'Oil Change' }, ctx);
  assert.equal(job.fleet_vehicle_id, v.id);
  assert.equal(job.created_at, '2026-10-01T15:00:00.000Z');
  await assert.rejects(handleFleetAction('fleet-add-job', { fleetId: acct2.id, vehicleId: v.id, date: '2026-10-08', service: 'x' }, ctx), /different fleet/);
  t.bookings.push({ id: 'retail', fleet_id: null });
  const d = await handleFleetAction('fleet-data', {}, ctx);
  assert.deepEqual([d.accounts.length, d.vehicles.length, d.jobs.map(j => j.id)], [2, 2, [job.id]]);
  await assert.rejects(handleFleetAction('fleet-update', { fleetId: acct.id, fields: { company_number: 1234 } }, ctx), /Nothing to change/);
});

test('API before the migration: a clear "run fleet_migration.sql" message', async () => {
  const { ctx } = fakeDb({ migrated: false });
  await assert.rejects(handleFleetAction('fleet-data', {}, ctx), new RegExp(NEEDS_MIGRATION.slice(0, 30)));
});

test('date-only helpers: no timezone shift, month arithmetic, month ends', async () => {
  const { fmtYmd, shiftMonth, monthEnd } = await import('../shared/fleet.js');
  assert.equal(fmtYmd('2026-09-30'), 'Sep 30, 2026');
  assert.equal(fmtYmd('2026-10-01'), 'Oct 1, 2026');
  assert.equal(fmtYmd('bad'), '—');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(monthEnd('2028-02'), '2028-02-29');
  assert.equal(monthEnd('2026-09'), '2026-09-30');
});
