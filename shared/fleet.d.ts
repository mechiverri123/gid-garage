// Types for fleet.js (FLEET_PLAN.md).
export type VehicleStatus = 'active' | 'attention' | 'service_due' | 'out_of_service' | 'retired';
export interface FleetAccount { id: string; company_number: number; name: string; contact_name?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; status: 'active' | 'archived'; created_at?: string }
export interface FleetVehicle { id: string; fleet_id: string; unit_number: string; year?: number | null; make?: string | null; model?: string | null; engine?: string | null; vin?: string | null; plate?: string | null; mileage?: number | null; status: VehicleStatus; next_service_label?: string | null; next_service_miles?: number | null; next_service_date?: string | null; notes?: string | null }
export interface FleetJob { id: string; fleetId: string | null; vehicleId: string | null; date: string; time: string; dateTbd: boolean; service: string; items: string[]; mileage: number | null; jobStatus: string; cancelled: boolean; total: number | null; hasInspection: boolean; kind: 'maintenance' | 'repair' | 'inspection' | 'day'; serviceDay: boolean; notes: string }
export interface NextService { label: string; dueMiles: number | null; dueDate: string | null; milesLeft: number | null; due: boolean; overdue: boolean }
export interface VehicleState { status: VehicleStatus; mileage: number | null; next: NextService | null; lastService: FleetJob | null; openJobs: FleetJob[]; history: FleetJob[]; needsAttention: boolean; serviceDue: boolean }
export type CalendarEntry = FleetJob & ({ type: 'day'; units: string[] } | { type: 'vehicle'; unit: string | null });

export const VEHICLE_STATUSES: VehicleStatus[];
export const STATUS_LABEL: Record<VehicleStatus, string>;
export const SERVICE_DAY: string;
export const SERVICE_DUE_MILES: number;
export const SERVICE_DUE_DAYS: number;
export function normalizeUnit(v: unknown): string | null;
export function unitLabel(u: unknown): string;
export function fleetNumberLabel(n: number | string): string;
export function vehicleTitle(v: Partial<FleetVehicle> | null | undefined): string;
export function nextUnitSuggestion(vehicles: { unit_number?: string }[]): string;
export function timeKey(t: string | null | undefined): number;
export function jobKind(service: string, labels?: string[]): 'maintenance' | 'repair' | 'inspection';
export function fleetJob(row: Record<string, unknown>): FleetJob;
export function byNewest(a: FleetJob, b: FleetJob): number;
export function byOldest(a: FleetJob, b: FleetJob): number;
export function vehicleHistory(jobs: FleetJob[], vehicleId: string): FleetJob[];
export function isDone(j: FleetJob): boolean;
export function isOpen(j: FleetJob): boolean;
export function currentMileage(vehicle: Partial<FleetVehicle>, history?: FleetJob[]): number | null;
export function nextService(vehicle: Partial<FleetVehicle>, mileage: number | null, today: string): NextService | null;
export function vehicleState(vehicle: FleetVehicle, jobs: FleetJob[], today: string): VehicleState;
export function fleetSummary(fleetId: string, vehicles: FleetVehicle[], jobs: FleetJob[], today: string): { vehicleCount: number; needsAttention: number; serviceDue: number };
export function searchVehicles(vehicles: FleetVehicle[], query: string): FleetVehicle[];
export function resolveUnit(vehicles: FleetVehicle[], unit: string, fleetId?: string | null): FleetVehicle[];
export function findAccounts(accounts: FleetAccount[], text: string): FleetAccount[];
export function calendarEntries(jobs: FleetJob[], vehicles: FleetVehicle[], opts?: { fleetId?: string | null; from?: string | null; to?: string | null }): CalendarEntry[];
export function isFleetRow(r: unknown): boolean;
export function fleetJobRow(args: Record<string, unknown>): Record<string, unknown>;
export function fmtYmd(ymd: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string;
export function shiftMonth(ym: string, k: number): string;
export function monthEnd(ym: string): string;
