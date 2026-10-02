// Fleet data for the admin Fleet tab and the Jarvis fleet view: one read of
// accounts + vehicles + fleet jobs through /admin-api-data (fleet-* actions,
// functions/_lib/fleet.js). Account names are remembered so Jarvis can open a
// company by name ("open Flagstaff Equipment") without an AI call.
import { fleetJob, type FleetAccount, type FleetVehicle, type FleetJob } from '../../shared/fleet.js';

export interface FleetData { accounts: FleetAccount[]; vehicles: FleetVehicle[]; jobs: FleetJob[] }

export async function fleetPost<T = unknown>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/admin-api-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) });
  const text = await res.text();
  let body: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

let last: FleetData | null = null;
// The fleet the owner is looking at, so "36" means that fleet's #36 (FleetApp sets it).
export const fleetContext: { fleetId: string | null } = { fleetId: null };
export const cachedFleet = () => last;

export async function loadFleet(): Promise<FleetData> {
  const d = await fleetPost<{ accounts: FleetAccount[]; vehicles: FleetVehicle[]; jobs: Record<string, unknown>[] }>('fleet-data');
  last = { accounts: d.accounts || [], vehicles: d.vehicles || [], jobs: (d.jobs || []).map(fleetJob) };
  return last;
}

// Warm the cache once (Jarvis page load), quietly: before the migration it just stays empty.
export function fleetPrefetch() { loadFleet().catch(() => { /* not set up yet */ }); }
