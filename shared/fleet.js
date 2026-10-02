// Fleet: pure rules shared by the API (functions/_lib/fleet.js), the admin
// Fleet tab and the Jarvis fleet views. Plan: FLEET_PLAN.md. Tests: tests/fleet.test.js
//
// Identity: database ids (uuid) are never shown. A company has a permanent
// 4-digit Fleet number (assigned by the database); a vehicle has the
// customer's own unit number, unique within its fleet, stored without "#".
//
// Time: dates here are Phoenix date-only strings (YYYY-MM-DD) from the existing
// helpers (phoenixToday / addDays) and are only compared as strings. Money:
// a job's total is the existing jobMoney() display total; nothing here does
// period accounting (revenue stays in shared/business-metrics.js).
import { jobMoney, isCancelled, addDays, isValidYmd } from './business-rules.js';

export const VEHICLE_STATUSES = ['active', 'attention', 'service_due', 'out_of_service', 'retired'];
export const STATUS_LABEL = { active: 'Active', attention: 'Attention', service_due: 'Service due', out_of_service: 'Out of service', retired: 'Retired' };
export const SERVICE_DAY = 'Fleet Service Day';
export const SERVICE_DUE_MILES = 1000; // due within this many miles …
export const SERVICE_DUE_DAYS = 14;    // … or this many days

// ---- identity / display -------------------------------------------------------------------------

// "#36", " 36 ", "## a12" -> "36" / "a12"; empty or too long -> null. Never renumbers.
export function normalizeUnit(v) {
  const s = String(v ?? '').trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ');
  return s && s.length <= 20 ? s : null;
}
export const unitLabel = u => `#${normalizeUnit(u) ?? u}`;
export const fleetNumberLabel = n => `Fleet #${n}`;
export const vehicleTitle = v => [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle';

// Next number after the highest purely numeric unit (a suggestion only).
export function nextUnitSuggestion(vehicles = []) {
  const nums = vehicles.map(v => String(v.unit_number ?? '')).filter(u => /^\d+$/.test(u)).map(Number);
  return nums.length ? String(Math.max(...nums) + 1) : '1';
}

// ---- jobs -> service history ---------------------------------------------------------------------

const toItems = li => {
  if (!li) return [];
  try { const a = typeof li === 'string' ? JSON.parse(li) : li; return Array.isArray(a) ? a : []; } catch { return []; }
};
const intOrNull = v => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// "9:30 AM" -> minutes after midnight (wall-clock sort only); TBD / blank last.
export function timeKey(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i);
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m[2]);
}

const INSPECTION_RE = /\binspect|\bpre-?trip|\bdot\b|multi-?point|health scan/i;
const MAINTENANCE_RE = /\boil\b|filter|fluid|flush|rotat|tune.?up|spark plug|\bbelt\b|wiper|coolant|maintenance|\blube\b|grease|service interval|\bpm\b/i;
// Maintenance / repair / inspection from the job's service and line items.
export function jobKind(service, labels = []) {
  const all = [service, ...labels].join(' ');
  const insp = s => INSPECTION_RE.test(s);
  // Only inspection work (an inspection service with no other line items, or every line an inspection).
  if ((insp(service) && labels.every(insp)) || (labels.length && labels.every(insp))) return 'inspection';
  if (MAINTENANCE_RE.test(all) && !/brake|rotor|strut|shock|axle|tie rod|ball joint|alternator|starter|pump|repair|replace (?!oil|filter)/i.test(all)) return 'maintenance';
  return 'repair';
}

// A booking row (snake_case from the API) -> one service-history entry.
export function fleetJob(r) {
  const items = toItems(r.line_items);
  const labels = items.map(i => String(i?.label || i?.description || '').trim()).filter(Boolean);
  const job = { invoiceAmount: r.invoice_amount, estimateAmount: r.estimate_amount, taxAmount: r.tax_amount, amountPaid: r.amount_paid, jobStatus: r.job_status, status: r.status };
  const m = jobMoney(job);
  const serviceDay = !r.fleet_vehicle_id && r.service === SERVICE_DAY;
  return {
    id: r.id, fleetId: r.fleet_id || null, vehicleId: r.fleet_vehicle_id || null,
    date: r.date, time: r.time || 'TBD', dateTbd: !!r.date_tbd,
    service: r.service || '', items: labels, mileage: intOrNull(r.mileage),
    jobStatus: r.job_status || 'BOOKED', cancelled: isCancelled(job),
    total: m.invoiceTotal ?? m.estimateTotal, hasInspection: !!r.has_inspection,
    kind: serviceDay ? 'day' : jobKind(r.service || '', labels), serviceDay,
    notes: r.notes || '',
  };
}

export const byNewest = (a, b) => String(b.date).localeCompare(String(a.date)) || timeKey(b.time) - timeKey(a.time) || String(b.id).localeCompare(String(a.id));
export const byOldest = (a, b) => -byNewest(a, b);

// Done work for history (not cancelled, not a service-day header), newest first.
export function vehicleHistory(jobs, vehicleId) {
  return jobs.filter(j => j.vehicleId === vehicleId && !j.cancelled).sort(byNewest);
}
export const isDone = j => ['COMPLETED', 'INVOICED', 'PAID'].includes(j.jobStatus);
export const isOpen = j => !j.cancelled && !j.serviceDay && j.jobStatus !== 'PAID';

// ---- vehicle state ---------------------------------------------------------------------------------

// Highest known odometer: the vehicle record or any job on it.
export function currentMileage(vehicle, history = []) {
  const all = [intOrNull(vehicle?.mileage), ...history.map(j => j.mileage)].filter(n => n != null);
  return all.length ? Math.max(...all) : null;
}

export function nextService(vehicle, mileage, today) {
  const label = String(vehicle?.next_service_label || '').trim();
  const dueMiles = intOrNull(vehicle?.next_service_miles);
  const dueDate = isValidYmd(String(vehicle?.next_service_date || '').slice(0, 10)) ? String(vehicle.next_service_date).slice(0, 10) : null;
  if (!label && dueMiles == null && !dueDate) return null;
  const milesLeft = dueMiles != null && mileage != null ? dueMiles - mileage : null;
  const due = (milesLeft != null && milesLeft <= SERVICE_DUE_MILES) || (!!dueDate && !!today && dueDate <= addDays(today, SERVICE_DUE_DAYS));
  const overdue = (milesLeft != null && milesLeft < 0) || (!!dueDate && !!today && dueDate < today);
  return { label: label || 'Service', dueMiles, dueDate, milesLeft, due, overdue };
}

export function vehicleState(vehicle, jobs, today) {
  const history = vehicleHistory(jobs, vehicle.id);
  const mileage = currentMileage(vehicle, history);
  const next = nextService(vehicle, mileage, today);
  const lastService = history.find(isDone) || null;
  const openJobs = history.filter(isOpen);
  let status = vehicle.status || 'active';
  if (status === 'active' && next?.due) status = 'service_due';
  return {
    status, mileage, next, lastService, openJobs, history,
    needsAttention: status === 'attention' || status === 'out_of_service',
    serviceDue: status === 'service_due',
  };
}

export function fleetSummary(fleetId, vehicles, jobs, today) {
  const own = vehicles.filter(v => v.fleet_id === fleetId && v.status !== 'retired');
  const states = own.map(v => vehicleState(v, jobs, today));
  return {
    vehicleCount: own.length,
    needsAttention: states.filter(s => s.needsAttention).length,
    serviceDue: states.filter(s => s.serviceDue).length,
  };
}

// ---- search / resolve ------------------------------------------------------------------------------

// "36", "#36", VIN or partial VIN, plate, "Ford", "2021 F-250". Exact unit first.
export function searchVehicles(vehicles, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return vehicles;
  const unitQ = normalizeUnit(q)?.toLowerCase();
  const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = q.replace(/^#/, '').split(/\s+/).filter(Boolean);
  const score = v => {
    const unit = String(v.unit_number || '').toLowerCase();
    if (unitQ && unit === unitQ) return 0;
    if (unitQ && /^[a-z0-9-]+$/.test(unitQ) && unit.startsWith(unitQ)) return 1;
    const sq = squash(q);
    if (sq.length >= 4 && squash(v.vin).includes(sq)) return 2;
    if (sq.length >= 3 && squash(v.plate).includes(sq)) return 2;
    const hay = [v.year, v.make, v.model, v.engine, v.unit_number, v.plate].join(' ').toLowerCase();
    const hayS = squash(hay);
    if (words.every(w => hay.includes(w) || hayS.includes(squash(w)))) return 3;
    return null;
  };
  return vehicles.map(v => [v, score(v)]).filter(([, s]) => s != null)
    .sort((a, b) => a[1] - b[1] || String(a[0].unit_number).localeCompare(String(b[0].unit_number), undefined, { numeric: true }))
    .map(([v]) => v);
}

// Which vehicles "36" means. Inside a known fleet only that fleet; otherwise every
// fleet that has that unit (the caller shows choices when there is more than one).
export function resolveUnit(vehicles, unit, fleetId = null) {
  const u = normalizeUnit(unit)?.toLowerCase();
  if (!u) return [];
  return vehicles.filter(v => String(v.unit_number).toLowerCase() === u && (!fleetId || v.fleet_id === fleetId) && v.status !== 'retired');
}

// Companies whose name contains every word (for "open Flagstaff Equipment").
export function findAccounts(accounts, text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !['the', 'fleet', 'account', 'company'].includes(w));
  if (!words.length) return [];
  const num = words.find(w => /^\d{4}$/.test(w));
  if (num) return accounts.filter(a => String(a.company_number) === num);
  return accounts.filter(a => words.every(w => String(a.name).toLowerCase().includes(w)));
}

// ---- calendar ----------------------------------------------------------------------------------------

// Fleet calendar entries: service days (with the units booked that date) and
// individual vehicle jobs, oldest first. Optional fleetId / date range.
export function calendarEntries(jobs, vehicles, { fleetId = null, from = null, to = null } = {}) {
  const unitOf = new Map(vehicles.map(v => [v.id, v]));
  const keep = j => !j.cancelled && !j.dateTbd && (!fleetId || j.fleetId === fleetId) && (!from || j.date >= from) && (!to || j.date <= to);
  const list = jobs.filter(keep).sort(byOldest);
  return list.map(j => {
    if (j.serviceDay) {
      const units = list.filter(x => !x.serviceDay && x.fleetId === j.fleetId && x.date === j.date && x.vehicleId)
        .map(x => unitOf.get(x.vehicleId)?.unit_number).filter(Boolean);
      return { ...j, type: 'day', units: [...new Set(units)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })) };
    }
    return { ...j, type: 'vehicle', unit: j.vehicleId ? unitOf.get(j.vehicleId)?.unit_number ?? null : null };
  });
}

// Retail views (admin Schedule, Jarvis calendar/customers) leave fleet jobs out.
export const isFleetRow = r => !!(r && (r.fleet_id || r.fleetId));

// ---- the booking row a fleet job is created as -----------------------------------------------------

// A normal booking (same infrastructure as any job), already linked to the fleet
// and vehicle. Invoices go to the company (owner decision). No money fields:
// the estimate is built afterwards in the existing job screens.
export function fleetJobRow({ account, vehicle = null, date, time = 'TBD', service, notes = '', mileage = null, id, createdAt }) {
  if (!account?.id) throw new Error('Fleet account missing.');
  if (!isValidYmd(String(date || ''))) throw new Error('Pick a date (YYYY-MM-DD).');
  if (vehicle && vehicle.fleet_id !== account.id) throw new Error('That vehicle belongs to a different fleet.');
  const serviceDay = !vehicle;
  const svc = serviceDay ? SERVICE_DAY : String(service || '').trim();
  if (!svc) throw new Error('What is the job? (e.g. Oil change)');
  const tag = `[${fleetNumberLabel(account.company_number)}${vehicle ? ` · Unit ${unitLabel(vehicle.unit_number)}` : ''}]`;
  const miles = intOrNull(mileage) ?? (vehicle ? intOrNull(vehicle.mileage) : null);
  return {
    id, service: svc, service_icon: '🚚', date, time: String(time || '').trim() || 'TBD', date_tbd: false,
    fname: account.name, lname: '', phone: account.phone || '', email: account.email || '',
    vehicle: vehicle ? vehicleTitle(vehicle) : `${account.name} fleet`,
    ...(vehicle?.vin ? { vin: vehicle.vin } : {}),
    ...(miles != null ? { mileage: String(miles) } : {}),
    service_address: account.address || '',
    notes: notes ? `${tag} ${String(notes).trim()}` : tag,
    garage_notes: '', status: 'confirmed', job_status: 'BOOKED', created_at: createdAt,
    fleet_id: account.id, fleet_vehicle_id: vehicle ? vehicle.id : null,
  };
}
