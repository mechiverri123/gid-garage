// Fleet: Fleet → Company → Vehicles → Unit #36 → its service record.
// One component, two looks: the admin Fleet tab (skin "admin") and the Jarvis
// fleet view (skin "jarvis"). All rules are in shared/fleet.js (tested);
// data and writes go through /admin-api-data fleet-* actions. Jobs are normal
// bookings: "View job" / "Add job" open them in the existing job screens.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  vehicleTitle, unitLabel, fleetNumberLabel, vehicleState, fleetSummary, searchVehicles, resolveUnit, findAccounts,
  calendarEntries, nextUnitSuggestion, fmtYmd, shiftMonth, monthEnd, byNewest, isDone, STATUS_LABEL, VEHICLE_STATUSES,
  type FleetAccount, type FleetVehicle, type FleetJob, type VehicleStatus, type CalendarEntry,
} from '../../shared/fleet.js';
import { phoenixToday } from '../../shared/business-rules.js';
import { loadFleet, fleetPost, fleetContext, type FleetData } from './fleetData';

export type Skin = 'admin' | 'jarvis';
type CompanyTab = 'overview' | 'vehicles' | 'history' | 'calendar';
type VehicleTab = 'overview' | 'history' | 'inspections';
type Route =
  | { level: 'home' }
  | { level: 'calendar' }
  | { level: 'company'; fleetId: string; tab: CompanyTab; filter?: 'all' | 'attention' | 'due' }
  | { level: 'vehicle'; fleetId: string; vehicleId: string; tab: VehicleTab }
  | { level: 'choose'; unit: string; ids: string[] };

// What to open (from a click, a Jarvis voice/typed command, or nothing).
export interface FleetTarget { fleetId?: string; company?: string; unit?: string; tab?: string; addJob?: boolean; calendar?: boolean; filter?: 'attention' | 'due' }

const SKINS = {
  admin: {
    page: 'max-w-6xl mx-auto px-3 sm:px-6 py-4 text-white',
    card: 'bg-gray-900 border border-gray-800',
    rowHover: 'hover:bg-gray-800/70',
    divide: 'divide-gray-800 border-gray-800',
    muted: 'text-gray-500', soft: 'text-gray-400', strong: 'text-white', accent: 'text-red-500',
    btn: 'bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold uppercase tracking-wider px-4 py-2 disabled:opacity-40',
    btn2: 'border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 text-[12px] font-bold uppercase tracking-wider px-3 py-2 disabled:opacity-40',
    input: 'bg-gray-950 border border-gray-700 text-white px-3 py-2 text-[14px] w-full outline-none focus:border-red-600',
    tabOn: 'border-red-600 text-white', tabOff: 'border-transparent text-gray-500 hover:text-gray-300',
    dialog: 'bg-gray-900 border border-gray-700',
    label: 'text-[11px] font-bold uppercase tracking-wider text-gray-500',
    unit: 'text-red-500', chipOn: 'bg-gray-700 border-gray-600 text-white', chipOff: 'border-gray-800 text-gray-500 hover:text-white',
  },
  jarvis: {
    page: 'max-w-[1180px] mx-auto text-[#F5F8FA]',
    card: 'jv-glass',
    rowHover: 'hover:bg-[rgba(52,214,255,0.06)]',
    divide: 'divide-[rgba(54,211,255,0.14)] border-[rgba(54,211,255,0.18)]',
    muted: 'text-[#657686]', soft: 'text-[#A7B5C2]', strong: 'text-[#F5F8FA]', accent: 'text-[#34D6FF]',
    btn: 'cc-btn rounded-lg bg-[#34D6FF] text-[#030A11] text-[13px] font-semibold px-4 py-2 disabled:opacity-40',
    btn2: 'cc-btn rounded-lg border border-[rgba(54,211,255,0.42)] bg-[rgba(52,214,255,0.08)] text-[#F5F8FA] text-[13px] font-semibold px-3 py-2 disabled:opacity-40',
    input: 'rounded-lg bg-[rgba(3,10,17,0.85)] border border-[rgba(54,211,255,0.42)] text-[#F5F8FA] px-3 py-2 text-[14px] w-full outline-none focus:border-[#34D6FF]',
    tabOn: 'border-[#34D6FF] text-[#F5F8FA]', tabOff: 'border-transparent text-[#657686] hover:text-[#A7B5C2]',
    dialog: 'rounded-2xl bg-[#08131E] border border-[rgba(54,211,255,0.42)]',
    label: 'text-[11px] font-bold uppercase tracking-[0.14em] text-[#657686]',
    unit: 'text-[#34D6FF]', chipOn: 'bg-[rgba(52,214,255,0.18)] border-[#34D6FF] text-[#F5F8FA] rounded-lg', chipOff: 'border-[rgba(54,211,255,0.18)] text-[#A7B5C2] rounded-lg',
  },
};
type K = typeof SKINS.admin;

const STATUS_COLOR: Record<VehicleStatus, string> = { active: '#20E58B', attention: '#FF4D5F', service_due: '#FFB84D', out_of_service: '#FF4D5F', retired: '#657686' };
const JOB_COLOR: Record<string, string> = { PAID: '#20E58B', INVOICED: '#34D6FF', COMPLETED: '#34D6FF', IN_PROGRESS: '#FFB84D', SIGNED: '#A7B5C2', ESTIMATE_SENT: '#A7B5C2', BOOKED: '#A7B5C2' };
const JOB_LABEL: Record<string, string> = { PAID: 'Paid', INVOICED: 'Invoiced', COMPLETED: 'Completed', IN_PROGRESS: 'In progress', SIGNED: 'Signed', ESTIMATE_SENT: 'Estimate sent', BOOKED: 'Booked' };
const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const miles = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('en-US')} mi`);

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap rounded" style={{ color, background: `${color}1A`, border: `1px solid ${color}55` }}>{children}</span>;
}
const StatusBadge = ({ s }: { s: VehicleStatus }) => <Badge color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Badge>;
const JobBadge = ({ j }: { j: FleetJob }) => <Badge color={j.cancelled ? '#657686' : JOB_COLOR[j.jobStatus] || '#A7B5C2'}>{j.cancelled ? 'Cancelled' : JOB_LABEL[j.jobStatus] || j.jobStatus}</Badge>;

export function FleetApp({ skin, target, onOpenJob, reloadKey = 0 }: { skin: Skin; target?: FleetTarget | null; onOpenJob: (jobId: string) => void; reloadKey?: number }) {
  const k = SKINS[skin];
  const today = phoenixToday();
  const [data, setData] = useState<FleetData | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>({ level: 'home' });
  const [dialog, setDialog] = useState<ReactNode>(null);
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try { setData(await loadFleet()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload, reloadKey]);

  const go = useCallback((r: Route) => {
    setRoute(r); setNotice('');
    fleetContext.fleetId = r.level === 'company' || r.level === 'vehicle' ? r.fleetId : null;
  }, []);

  // Apply a target (voice / typed / deep link) once the data is in.
  const [applied, setApplied] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const key = JSON.stringify(target || {});
    if (applied === key) return;
    setApplied(key);
    const t = target || {};
    let fleetId = t.fleetId || null;
    if (!fleetId && t.company) {
      const m = findAccounts(data.accounts, t.company);
      if (m.length === 1) fleetId = m[0].id;
      else if (!t.unit) { go({ level: 'home' }); setNotice(m.length ? `More than one fleet matches "${t.company}". Pick one.` : `No fleet called "${t.company}".`); return; }
    }
    if (t.unit) {
      let hits = resolveUnit(data.vehicles, t.unit, fleetId);
      if (!fleetId && fleetContext.fleetId) { const inCtx = hits.filter(v => v.fleet_id === fleetContext.fleetId); if (inCtx.length === 1) hits = inCtx; }
      if (hits.length === 1) {
        const v = hits[0];
        go({ level: 'vehicle', fleetId: v.fleet_id, vehicleId: v.id, tab: t.tab === 'history' ? 'history' : t.tab === 'inspections' ? 'inspections' : 'overview' });
        if (t.addJob) openJobDialog(v.fleet_id, v);
      } else if (hits.length > 1) go({ level: 'choose', unit: t.unit, ids: hits.map(v => v.id) });
      else { if (fleetId) go({ level: 'company', fleetId, tab: 'vehicles' }); else go({ level: 'home' }); setNotice(`No unit ${unitLabel(t.unit)}${fleetId ? ' in this fleet' : ' in any fleet'}.`); }
      return;
    }
    if (fleetId) go({ level: 'company', fleetId, tab: t.calendar ? 'calendar' : (['vehicles', 'history', 'calendar'].includes(t.tab || '') ? t.tab as CompanyTab : (t.filter ? 'vehicles' : 'overview')), filter: t.filter });
    else if (t.calendar) go({ level: 'calendar' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, target]);

  const account = (id: string) => data?.accounts.find(a => a.id === id) || null;
  const vehicle = (id: string) => data?.vehicles.find(v => v.id === id) || null;

  // ---- dialogs ----------------------------------------------------------------------------------
  const close = () => setDialog(null);
  const openCompanyDialog = (a?: FleetAccount) => setDialog(<CompanyForm k={k} account={a} onCancel={close} onSaved={async row => { close(); await reload(); go({ level: 'company', fleetId: row.id, tab: 'overview' }); setNotice(a ? 'Saved.' : `Created ${row.name} — ${fleetNumberLabel(row.company_number)}.`); }} />);
  const openVehicleDialog = (fleetId: string, v?: FleetVehicle) => setDialog(<VehicleForm k={k} fleetId={fleetId} vehicle={v} suggestion={nextUnitSuggestion((data?.vehicles || []).filter(x => x.fleet_id === fleetId))} onCancel={close}
    onSaved={async row => { close(); await reload(); go({ level: 'vehicle', fleetId, vehicleId: row.id, tab: 'overview' }); setNotice(v ? 'Saved.' : `Added ${unitLabel(row.unit_number)}.`); }} />);
  function openJobDialog(fleetId: string, v?: FleetVehicle | null) {
    const a = data?.accounts.find(x => x.id === fleetId);
    if (!a) return;
    const st = v && data ? vehicleState(v, data.jobs, today) : null;
    setDialog(<JobForm k={k} account={a} vehicle={v || null} mileage={st?.mileage ?? null} today={today} onCancel={close}
      onSaved={async row => { close(); await reload(); onOpenJob(String(row.id)); }} />);
  }

  // ---- render ------------------------------------------------------------------------------------
  if (error) return (
    <div className={k.page}><div className={`${k.card} p-5`}>
      <div className="text-[15px] font-semibold mb-1">Fleet isn't available</div>
      <div className={`text-[14px] ${k.soft}`}>{error}</div>
      <button type="button" className={`${k.btn2} mt-3`} onClick={reload}>Try again</button>
    </div></div>
  );
  if (!data) return <div className={k.page}><div className={`${k.card} p-5 ${k.muted} text-[14px]`}>Loading fleet…</div></div>;

  const crumbs: { label: string; to?: Route }[] = [{ label: 'Fleet', to: { level: 'home' } }];
  if (route.level === 'calendar') crumbs.push({ label: 'Calendar' });
  if (route.level === 'company' || route.level === 'vehicle') {
    const a = account(route.fleetId);
    crumbs.push({ label: a?.name || 'Fleet', to: { level: 'company', fleetId: route.fleetId, tab: 'overview' } });
    if (route.level === 'company' && route.tab !== 'overview') crumbs.push({ label: { vehicles: 'Vehicles', history: 'Service history', calendar: 'Calendar' }[route.tab] });
    if (route.level === 'vehicle') {
      crumbs.push({ label: 'Vehicles', to: { level: 'company', fleetId: route.fleetId, tab: 'vehicles' } });
      crumbs.push({ label: unitLabel(vehicle(route.vehicleId)?.unit_number) });
    }
  }
  if (route.level === 'choose') crumbs.push({ label: `Unit ${unitLabel(route.unit)}` });

  return (
    <div className={k.page}>
      <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1.5 text-[13px] mb-3 ${k.muted}`}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {c.to && i < crumbs.length - 1 ? <button type="button" className={`hover:underline ${k.soft}`} onClick={() => go(c.to!)}>{c.label}</button> : <span className={k.strong}>{c.label}</span>}
          </span>
        ))}
      </nav>
      {notice && <div role="status" className={`${k.card} px-4 py-2.5 mb-3 text-[14px] ${k.accent}`}>{notice}</div>}

      {route.level === 'home' && <Home k={k} data={data} today={today} go={go} onNew={() => openCompanyDialog()} />}
      {route.level === 'calendar' && <Agenda k={k} data={data} today={today} fleetId={null} onOpenJob={onOpenJob} go={go} />}
      {route.level === 'choose' && (
        <div className={`${k.card} p-4`}>
          <div className="text-[15px] font-semibold mb-3">More than one fleet has unit {unitLabel(route.unit)}. Which one?</div>
          <ul className="flex flex-col gap-2">{route.ids.map(id => { const v = vehicle(id)!; const a = account(v.fleet_id); return (
            <li key={id}><button type="button" className={`w-full text-left px-3 py-2.5 border ${k.divide} ${k.rowHover} flex flex-wrap gap-x-3`} onClick={() => go({ level: 'vehicle', fleetId: v.fleet_id, vehicleId: v.id, tab: 'overview' })}>
              <span className={`font-bold ${k.unit}`}>{unitLabel(v.unit_number)}</span><span>{vehicleTitle(v)}</span><span className={k.muted}>{a?.name} · {a && fleetNumberLabel(a.company_number)}</span>
            </button></li>); })}</ul>
        </div>
      )}
      {route.level === 'company' && account(route.fleetId) && (
        <Company k={k} data={data} today={today} a={account(route.fleetId)!} tab={route.tab} filter={route.filter || 'all'} go={go}
          onAddVehicle={() => openVehicleDialog(route.fleetId)} onAddJob={() => openJobDialog(route.fleetId, null)} onEdit={() => openCompanyDialog(account(route.fleetId)!)} onOpenJob={onOpenJob}
          onPickJobVehicle={() => setDialog(<PickVehicle k={k} vehicles={data.vehicles.filter(v => v.fleet_id === route.fleetId && v.status !== 'retired')} onCancel={close} onPick={v => { close(); openJobDialog(route.fleetId, v); }} />)} />
      )}
      {route.level === 'vehicle' && vehicle(route.vehicleId) && account(route.fleetId) && (
        <Vehicle k={k} data={data} today={today} a={account(route.fleetId)!} v={vehicle(route.vehicleId)!} tab={route.tab} go={go}
          onAddJob={() => openJobDialog(route.fleetId, vehicle(route.vehicleId))} onEdit={() => openVehicleDialog(route.fleetId, vehicle(route.vehicleId)!)} onOpenJob={onOpenJob} />
      )}
      {dialog}
    </div>
  );
}

// ---- home: companies ----------------------------------------------------------------------------------

function Home({ k, data, today, go, onNew }: { k: K; data: FleetData; today: string; go: (r: Route) => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const accounts = data.accounts.filter(a => a.status !== 'archived');
  const shown = q.trim() ? accounts.filter(a => `${a.name} ${a.company_number} ${a.contact_name || ''}`.toLowerCase().includes(q.trim().toLowerCase().replace(/^fleet\s*#?/, ''))) : accounts;
  const vehicleHits = q.trim() ? searchVehicles(data.vehicles, q).slice(0, 8) : [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[24px] font-black tracking-tight mr-auto">Fleet</h2>
        <button type="button" className={k.btn2} onClick={() => go({ level: 'calendar' })}>Fleet calendar</button>
        <button type="button" className={k.btn} onClick={onNew}>+ New fleet</button>
      </div>
      <input className={k.input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search fleets, or a unit / VIN / plate…" aria-label="Search fleets" />
      {vehicleHits.length > 0 && (
        <div className={`${k.card}`}>
          <div className={`${k.label} px-4 pt-3`}>Vehicles</div>
          <ul className={`divide-y ${k.divide}`}>{vehicleHits.map(v => { const a = data.accounts.find(x => x.id === v.fleet_id); return (
            <li key={v.id}><button type="button" className={`w-full text-left px-4 py-2.5 ${k.rowHover} flex flex-wrap gap-x-3 items-baseline`} onClick={() => go({ level: 'vehicle', fleetId: v.fleet_id, vehicleId: v.id, tab: 'overview' })}>
              <span className={`font-black text-[16px] ${k.unit}`}>{unitLabel(v.unit_number)}</span><span>{vehicleTitle(v)}</span><span className={`text-[13px] ${k.muted}`}>{a?.name}</span>
            </button></li>); })}</ul>
        </div>
      )}
      {!accounts.length ? (
        <div className={`${k.card} p-6 text-center`}>
          <div className="text-[16px] font-semibold mb-1">No fleet accounts yet</div>
          <div className={`text-[14px] mb-4 ${k.soft}`}>Add a company that runs several vehicles, then its trucks by unit number.</div>
          <button type="button" className={k.btn} onClick={onNew}>+ New fleet</button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{shown.map(a => {
          const s = fleetSummary(a.id, data.vehicles, data.jobs, today);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => go({ level: 'company', fleetId: a.id, tab: 'overview' })} className={`${k.card} ${k.rowHover} w-full text-left px-4 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)] gap-x-4 gap-y-1 items-center`}>
                <span className="min-w-0"><span className="block text-[16px] font-bold truncate uppercase tracking-wide">{a.name}</span><span className={`block text-[13px] ${k.accent}`}>{fleetNumberLabel(a.company_number)}</span></span>
                <span className="text-[14px] text-right md:text-left"><b>{s.vehicleCount}</b> <span className={k.muted}>vehicle{s.vehicleCount === 1 ? '' : 's'}</span></span>
                <span className="hidden md:block text-[14px]" style={{ color: s.needsAttention ? STATUS_COLOR.attention : undefined }}><b>{s.needsAttention}</b> <span className={k.muted}>need attention</span></span>
                <span className="hidden md:block text-[14px]" style={{ color: s.serviceDue ? STATUS_COLOR.service_due : undefined }}><b>{s.serviceDue}</b> <span className={k.muted}>service due</span></span>
                <span className={`hidden md:block text-[13px] truncate ${k.soft}`}>{a.contact_name ? <>{a.contact_name} <span className={k.muted}>· primary contact</span></> : <span className={k.muted}>No contact</span>}</span>
                <span className={`md:hidden text-[13px] col-span-2 ${k.muted}`}>{s.needsAttention} need attention · {s.serviceDue} service due{a.contact_name ? ` · ${a.contact_name}` : ''}</span>
              </button>
            </li>
          );
        })}</ul>
      )}
    </div>
  );
}

// ---- company -------------------------------------------------------------------------------------------

function Tabs<T extends string>({ k, value, options, onChange }: { k: K; value: T; options: [T, string][]; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className={`flex gap-0 border-b ${k.divide} overflow-x-auto`}>
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} type="button" onClick={() => onChange(v)}
          className={`text-[12px] font-bold uppercase tracking-widest px-4 sm:px-5 py-3 border-b-2 -mb-px whitespace-nowrap ${v === value ? k.tabOn : k.tabOff}`}>{label}</button>
      ))}
    </div>
  );
}

function Company({ k, data, today, a, tab, filter, go, onAddVehicle, onAddJob, onPickJobVehicle, onEdit, onOpenJob }: {
  k: K; data: FleetData; today: string; a: FleetAccount; tab: CompanyTab; filter: 'all' | 'attention' | 'due'; go: (r: Route) => void;
  onAddVehicle: () => void; onAddJob: () => void; onPickJobVehicle: () => void; onEdit: () => void; onOpenJob: (id: string) => void;
}) {
  const vehicles = data.vehicles.filter(v => v.fleet_id === a.id);
  const jobs = data.jobs.filter(j => j.fleetId === a.id);
  const s = fleetSummary(a.id, data.vehicles, data.jobs, today);
  const setTab = (t: CompanyTab) => go({ level: 'company', fleetId: a.id, tab: t });
  return (
    <div className="flex flex-col gap-3">
      <div className={`${k.card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 mr-auto">
            <h2 className="text-[24px] font-black tracking-tight uppercase leading-tight">{a.name}</h2>
            <div className={`text-[14px] font-bold ${k.accent}`}>{fleetNumberLabel(a.company_number)}</div>
            <div className={`text-[14px] mt-1 ${k.soft}`}>
              {[a.contact_name, a.phone, a.email].filter(Boolean).join(' · ') || 'No contact details'}
            </div>
            <div className={`text-[13px] ${k.muted}`}>{s.vehicleCount} vehicle{s.vehicleCount === 1 ? '' : 's'}{a.address ? ` · ${a.address}` : ''}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={k.btn} onClick={onAddVehicle}>+ Add vehicle</button>
            <button type="button" className={k.btn2} onClick={onPickJobVehicle} disabled={!vehicles.length}>+ Add job</button>
            <button type="button" className={k.btn2} onClick={onAddJob}>Schedule fleet day</button>
            <button type="button" className={k.btn2} onClick={onEdit}>Edit company</button>
          </div>
        </div>
      </div>
      <Tabs k={k} value={tab} onChange={setTab} options={[['overview', 'Overview'], ['vehicles', 'Vehicles'], ['history', 'Service history'], ['calendar', 'Calendar']]} />

      {tab === 'overview' && (() => {
        const states = vehicles.map(v => ({ v, s: vehicleState(v, data.jobs, today) }));
        const attention = states.filter(x => x.s.needsAttention || x.s.serviceDue);
        const upcoming = calendarEntries(jobs, vehicles, { from: today }).slice(0, 6);
        const recent = jobs.filter(j => !j.cancelled && !j.serviceDay && isDone(j)).sort(byNewest).slice(0, 6);
        const unitOf = (id: string | null) => vehicles.find(v => v.id === id);
        return (
          <div className="grid gap-3 lg:grid-cols-3">
            <Section k={k} title="Needs attention">
              {attention.length ? attention.map(({ v, s: st }) => (
                <Row key={v.id} k={k} onClick={() => go({ level: 'vehicle', fleetId: a.id, vehicleId: v.id, tab: 'overview' })}>
                  <span className={`font-black ${k.unit}`}>{unitLabel(v.unit_number)}</span><span className="truncate">{vehicleTitle(v)}</span><span className="ml-auto"><StatusBadge s={st.status} /></span>
                </Row>
              )) : <Empty k={k}>Nothing needs attention.</Empty>}
            </Section>
            <Section k={k} title="Upcoming">
              {upcoming.length ? upcoming.map(e => (
                <Row key={e.id} k={k} onClick={() => onOpenJob(e.id)}>
                  <span className={`tabular-nums ${k.soft}`}>{fmtYmd(e.date, { month: 'short', day: 'numeric' })}</span>
                  {e.type === 'day' ? <span className="font-semibold">Fleet service day · {e.units.length} vehicle{e.units.length === 1 ? '' : 's'}</span> : <><span className={`font-black ${k.unit}`}>{e.unit ? unitLabel(e.unit) : ''}</span><span className="truncate">{e.service}</span></>}
                </Row>
              )) : <Empty k={k}>Nothing scheduled.</Empty>}
            </Section>
            <Section k={k} title="Recent service">
              {recent.length ? recent.map(j => (
                <Row key={j.id} k={k} onClick={() => onOpenJob(j.id)}>
                  <span className={`tabular-nums ${k.soft}`}>{fmtYmd(j.date, { month: 'short', day: 'numeric' })}</span>
                  <span className={`font-black ${k.unit}`}>{unitOf(j.vehicleId) ? unitLabel(unitOf(j.vehicleId)!.unit_number) : ''}</span><span className="truncate">{j.service}</span>
                  <span className="ml-auto tabular-nums">{money(j.total)}</span>
                </Row>
              )) : <Empty k={k}>No completed work yet.</Empty>}
            </Section>
          </div>
        );
      })()}
      {tab === 'vehicles' && <VehicleTable k={k} data={data} today={today} fleetId={a.id} initialFilter={filter} go={go} onAdd={onAddVehicle} />}
      {tab === 'history' && <History k={k} jobs={jobs} vehicles={vehicles} showUnit onOpenJob={onOpenJob} onOpenUnit={id => go({ level: 'vehicle', fleetId: a.id, vehicleId: id, tab: 'overview' })} />}
      {tab === 'calendar' && <Agenda k={k} data={data} today={today} fleetId={a.id} onOpenJob={onOpenJob} go={go} />}
    </div>
  );
}

function Section({ k, title, children, right }: { k: K; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className={`${k.card} p-4`}>
      <div className="flex items-center mb-2"><h3 className={`${k.label} mr-auto`}>{title}</h3>{right}</div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
const Row = ({ k, children, onClick }: { k: K; children: ReactNode; onClick?: () => void }) => (
  <button type="button" onClick={onClick} className={`w-full text-left flex items-center gap-2.5 px-2 py-2 text-[14px] min-w-0 ${k.rowHover}`}>{children}</button>
);
const Empty = ({ k, children }: { k: K; children: ReactNode }) => <div className={`text-[14px] px-2 py-2 ${k.muted}`}>{children}</div>;

function VehicleTable({ k, data, today, fleetId, initialFilter, go, onAdd }: { k: K; data: FleetData; today: string; fleetId: string; initialFilter: 'all' | 'attention' | 'due'; go: (r: Route) => void; onAdd: () => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState(initialFilter);
  const [showRetired, setShowRetired] = useState(false);
  const all = data.vehicles.filter(v => v.fleet_id === fleetId);
  const rows = useMemo(() => {
    const list = (q.trim() ? searchVehicles(all, q) : [...all].sort((x, y) => String(x.unit_number).localeCompare(String(y.unit_number), undefined, { numeric: true })))
      .filter(v => showRetired || v.status !== 'retired')
      .map(v => ({ v, s: vehicleState(v, data.jobs, today) }));
    return list.filter(({ s }) => f === 'all' || (f === 'attention' ? s.needsAttention : s.serviceDue));
  }, [all, q, f, showRetired, data.jobs, today]);
  const open = (v: FleetVehicle) => go({ level: 'vehicle', fleetId, vehicleId: v.id, tab: 'overview' });
  const nextText = (s: ReturnType<typeof vehicleState>) => s.next ? `${s.next.label}${s.next.dueMiles != null ? ` · ${Math.round(s.next.dueMiles / 1000)}k` : ''}${s.next.dueDate ? ` · ${fmtYmd(s.next.dueDate, { month: 'short', day: 'numeric' })}` : ''}` : '—';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${k.input} flex-1 min-w-[200px]`} value={q} onChange={e => setQ(e.target.value)} placeholder="Unit #, VIN, plate, make, model…" aria-label="Search vehicles" autoFocus />
        {(['all', 'attention', 'due'] as const).map(x => (
          <button key={x} type="button" onClick={() => setF(x)} className={`text-[12px] font-bold uppercase tracking-wider px-3 py-2 border ${f === x ? k.chipOn : k.chipOff}`}>{x === 'all' ? 'All' : x === 'attention' ? 'Attention' : 'Service due'}</button>
        ))}
        <button type="button" className={k.btn} onClick={onAdd}>+ Add vehicle</button>
      </div>
      {!rows.length ? <div className={`${k.card} p-5 text-[14px] ${k.muted}`}>{all.length ? 'No vehicles match.' : 'No vehicles yet — add the first one by its unit number.'}</div> : (<>
        {/* desktop table */}
        <div className={`${k.card} hidden md:block`}>
          <table className="w-full text-[14px]">
            <thead><tr className={`text-left ${k.label}`}>
              <th className="px-4 py-2.5 w-[90px]">Unit</th><th className="px-4 py-2.5">Vehicle</th><th className="px-4 py-2.5 text-right">Mileage</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Next service</th>
            </tr></thead>
            <tbody className={`divide-y ${k.divide}`}>{rows.map(({ v, s }) => (
              <tr key={v.id} className={`cursor-pointer ${k.rowHover}`} onClick={() => open(v)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(v); }}>
                <td className={`px-4 py-3 text-[18px] font-black ${k.unit}`}>{unitLabel(v.unit_number)}</td>
                <td className="px-4 py-3"><div className="font-semibold">{vehicleTitle(v)}</div><div className={`text-[12px] ${k.muted}`}>{[v.engine, v.plate].filter(Boolean).join(' · ')}</div></td>
                <td className="px-4 py-3 text-right tabular-nums">{s.mileage != null ? s.mileage.toLocaleString('en-US') : '—'}</td>
                <td className="px-4 py-3"><StatusBadge s={s.status} /></td>
                <td className={`px-4 py-3 ${s.next?.due ? '' : k.soft}`} style={s.next?.overdue ? { color: STATUS_COLOR.attention } : s.next?.due ? { color: STATUS_COLOR.service_due } : undefined}>{nextText(s)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {/* mobile cards */}
        <ul className="md:hidden flex flex-col gap-2">{rows.map(({ v, s }) => (
          <li key={v.id}><button type="button" onClick={() => open(v)} className={`${k.card} ${k.rowHover} w-full text-left p-4 flex items-center gap-4`}>
            <span className={`text-[24px] font-black ${k.unit} min-w-[60px]`}>{unitLabel(v.unit_number)}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{vehicleTitle(v)}</span><span className={`block text-[13px] ${k.soft}`}>{miles(s.mileage)}</span><span className="block mt-1"><StatusBadge s={s.status} /></span></span>
          </button></li>
        ))}</ul>
      </>)}
      {all.some(v => v.status === 'retired') && <label className={`text-[13px] flex items-center gap-2 ${k.muted}`}><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired vehicles</label>}
    </div>
  );
}

// ---- vehicle -------------------------------------------------------------------------------------------

function Vehicle({ k, data, today, a, v, tab, go, onAddJob, onEdit, onOpenJob }: {
  k: K; data: FleetData; today: string; a: FleetAccount; v: FleetVehicle; tab: VehicleTab; go: (r: Route) => void; onAddJob: () => void; onEdit: () => void; onOpenJob: (id: string) => void;
}) {
  const s = vehicleState(v, data.jobs, today);
  const setTab = (t: VehicleTab) => go({ level: 'vehicle', fleetId: a.id, vehicleId: v.id, tab: t });
  const fact = (label: string, value: ReactNode) => <div className="min-w-0"><div className={k.label}>{label}</div><div className="text-[15px] font-semibold truncate">{value || '—'}</div></div>;
  return (
    <div className="flex flex-col gap-3">
      <div className={`${k.card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 mr-auto">
            <div className={`text-[36px] sm:text-[44px] font-black leading-none ${k.unit}`}>UNIT {unitLabel(v.unit_number)}</div>
            <div className={`text-[13px] mt-1 font-bold uppercase tracking-wider ${k.muted}`}>{a.name} · {fleetNumberLabel(a.company_number)}</div>
            <div className="text-[20px] font-bold mt-2">{vehicleTitle(v)}</div>
            <div className="flex flex-wrap items-center gap-3 mt-2"><span className="text-[18px] font-bold tabular-nums">{miles(s.mileage)}</span><StatusBadge s={s.status} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={k.btn} onClick={onAddJob}>+ Add job</button>
            <button type="button" className={k.btn2} onClick={() => setTab('history')}>Full history</button>
            <button type="button" className={k.btn2} onClick={onEdit}>Edit vehicle</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
          {fact('VIN', v.vin)}{fact('Plate', v.plate)}{fact('Engine', v.engine)}
          {fact('Last service', s.lastService ? `${fmtYmd(s.lastService.date)}` : null)}
          {fact('Next service', s.next ? `${s.next.label}${s.next.dueMiles != null ? ` · ${s.next.dueMiles.toLocaleString('en-US')} mi` : ''}` : null)}
          {fact('Open jobs', String(s.openJobs.length))}
        </div>
      </div>
      <Tabs k={k} value={tab} onChange={setTab} options={[['overview', 'Overview'], ['history', 'Service history'], ['inspections', 'Inspections']]} />

      {tab === 'overview' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Section k={k} title="Next service">
            {s.next ? (
              <div className="px-2 py-1">
                <div className="text-[18px] font-bold">{s.next.label}</div>
                {s.next.dueMiles != null && <div className={`text-[14px] ${k.soft}`}>Due at {s.next.dueMiles.toLocaleString('en-US')} mi</div>}
                {s.next.dueDate && <div className={`text-[14px] ${k.soft}`}>Due by {fmtYmd(s.next.dueDate)}</div>}
                {s.next.milesLeft != null && <div className="text-[15px] font-semibold mt-1" style={{ color: s.next.overdue ? STATUS_COLOR.attention : s.next.due ? STATUS_COLOR.service_due : STATUS_COLOR.active }}>
                  {s.next.milesLeft < 0 ? `${Math.abs(s.next.milesLeft).toLocaleString('en-US')} mi overdue` : `${s.next.milesLeft.toLocaleString('en-US')} mi remaining`}</div>}
              </div>
            ) : <Empty k={k}>Not set. <button type="button" className="underline" onClick={onEdit}>Set next service</button></Empty>}
          </Section>
          <Section k={k} title="Open items">
            {s.openJobs.map(j => (
              <Row key={j.id} k={k} onClick={() => onOpenJob(j.id)}><span className="truncate">{j.service}</span><span className="ml-auto"><JobBadge j={j} /></span></Row>
            ))}
            {v.notes && <div className={`text-[14px] px-2 py-2 whitespace-pre-line ${k.soft}`}>{v.notes}</div>}
            {!s.openJobs.length && !v.notes && <Empty k={k}>No open items.</Empty>}
          </Section>
          <Section k={k} title="Recent service" right={<button type="button" className={`text-[13px] hover:underline ${k.accent}`} onClick={() => setTab('history')}>All</button>}>
            {s.history.filter(isDone).slice(0, 4).map(j => (
              <Row key={j.id} k={k} onClick={() => onOpenJob(j.id)}><span className={`tabular-nums ${k.soft}`}>{fmtYmd(j.date, { month: 'short', day: 'numeric' })}</span><span className="truncate">{j.service}</span></Row>
            ))}
            {!s.history.some(isDone) && <Empty k={k}>No completed work yet.</Empty>}
          </Section>
        </div>
      )}
      {tab === 'history' && <History k={k} jobs={data.jobs.filter(j => j.vehicleId === v.id)} vehicles={[v]} onOpenJob={onOpenJob} />}
      {tab === 'inspections' && <History k={k} jobs={data.jobs.filter(j => j.vehicleId === v.id && (j.kind === 'inspection' || j.hasInspection))} vehicles={[v]} onOpenJob={onOpenJob} hideFilters empty="No inspections recorded for this unit yet." />}
    </div>
  );
}

// ---- service history (timeline) ------------------------------------------------------------------------

function History({ k, jobs, vehicles, showUnit = false, onOpenJob, onOpenUnit, hideFilters = false, empty = 'No service history yet.' }: {
  k: K; jobs: FleetJob[]; vehicles: FleetVehicle[]; showUnit?: boolean; onOpenJob: (id: string) => void; onOpenUnit?: (vehicleId: string) => void; hideFilters?: boolean; empty?: string;
}) {
  const [kind, setKind] = useState<'all' | 'maintenance' | 'repair' | 'inspection'>('all');
  const [year, setYear] = useState('all');
  const list = jobs.filter(j => !j.cancelled && !j.serviceDay).sort(byNewest);
  const years = [...new Set(list.map(j => j.date.slice(0, 4)))];
  const shown = list.filter(j => (kind === 'all' || j.kind === kind) && (year === 'all' || j.date.startsWith(year)));
  const unit = (id: string | null) => vehicles.find(v => v.id === id);
  const byYear = shown.reduce<Record<string, FleetJob[]>>((acc, j) => { (acc[j.date.slice(0, 4)] ||= []).push(j); return acc; }, {});
  return (
    <div className="flex flex-col gap-3">
      {!hideFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'maintenance', 'repair', 'inspection'] as const).map(x => (
            <button key={x} type="button" onClick={() => setKind(x)} className={`text-[12px] font-bold uppercase tracking-wider px-3 py-2 border ${kind === x ? k.chipOn : k.chipOff}`}>{x === 'all' ? 'All' : x === 'repair' ? 'Repairs' : x === 'inspection' ? 'Inspections' : 'Maintenance'}</button>
          ))}
          {years.length > 1 && (
            <select value={year} onChange={e => setYear(e.target.value)} aria-label="Year" className={`${k.input} !w-auto`}>
              <option value="all">All years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      )}
      {!shown.length ? <div className={`${k.card} p-5 text-[14px] ${k.muted}`}>{empty}</div> : Object.keys(byYear).sort().reverse().map(y => (
        <section key={y}>
          <div className={`${k.label} mb-1.5`}>{y}</div>
          <ol className={`${k.card} divide-y ${k.divide}`}>{byYear[y].map(j => {
            const u = unit(j.vehicleId);
            return (
              <li key={j.id} className="px-4 py-3 grid grid-cols-[64px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-start">
                <div className="leading-tight"><div className="text-[13px] font-bold uppercase">{fmtYmd(j.date, { month: 'short' })}</div><div className="text-[22px] font-black tabular-nums">{fmtYmd(j.date, { day: 'numeric' })}</div></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {showUnit && u && <button type="button" className={`font-black ${k.unit} hover:underline`} onClick={() => onOpenUnit?.(u.id)}>{unitLabel(u.unit_number)}</button>}
                    <button type="button" className="text-[15px] font-bold uppercase tracking-wide text-left hover:underline" onClick={() => onOpenJob(j.id)}>{j.service}</button>
                    <span className={`text-[13px] ${k.muted}`}>{j.mileage != null ? miles(j.mileage) : ''}</span>
                  </div>
                  {j.items.length > 0 && <div className={`text-[13.5px] mt-0.5 ${k.soft}`}>{j.items.slice(0, 5).join(' · ')}{j.items.length > 5 ? ` · +${j.items.length - 5} more` : ''}</div>}
                  <div className="mt-1.5"><JobBadge j={j} /></div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-bold tabular-nums">{money(j.total)}</div>
                  <button type="button" className={`text-[12px] font-bold uppercase tracking-wider mt-1 hover:underline ${k.accent}`} onClick={() => onOpenJob(j.id)}>View job</button>
                </div>
              </li>
            );
          })}</ol>
        </section>
      ))}
    </div>
  );
}

// ---- fleet calendar (agenda) ---------------------------------------------------------------------------

function Agenda({ k, data, today, fleetId, onOpenJob, go }: { k: K; data: FleetData; today: string; fleetId: string | null; onOpenJob: (id: string) => void; go: (r: Route) => void }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const entries: CalendarEntry[] = calendarEntries(data.jobs, data.vehicles, { fleetId, from: `${ym}-01`, to: monthEnd(ym) });
  const byDate = entries.reduce<Record<string, CalendarEntry[]>>((acc, e) => { (acc[e.date] ||= []).push(e); return acc; }, {});
  const acct = (id: string | null) => data.accounts.find(a => a.id === id);
  const tbd = data.jobs.filter(j => j.dateTbd && !j.cancelled && j.jobStatus !== 'PAID' && (!fleetId || j.fleetId === fleetId)).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={k.btn2} onClick={() => setYm(shiftMonth(ym, -1))} aria-label="Previous month">‹</button>
        <div className="text-[18px] font-bold min-w-[170px] text-center">{fmtYmd(`${ym}-01`, { month: 'long', year: 'numeric' })}</div>
        <button type="button" className={k.btn2} onClick={() => setYm(shiftMonth(ym, 1))} aria-label="Next month">›</button>
        {ym !== today.slice(0, 7) && <button type="button" className={k.btn2} onClick={() => setYm(today.slice(0, 7))}>This month</button>}
        <span className={`text-[13px] ml-auto ${k.muted}`}>Fleet work only — retail appointments stay on the main schedule.{tbd ? ` ${tbd} fleet job${tbd === 1 ? '' : 's'} without a date.` : ''}</span>
      </div>
      {!entries.length ? <div className={`${k.card} p-5 text-[14px] ${k.muted}`}>No fleet work scheduled this month.</div> : Object.keys(byDate).sort().map(d => (
        <section key={d} className={`${k.card}`}>
          <div className={`px-4 pt-3 pb-1 text-[13px] font-bold uppercase tracking-wider ${d === today ? k.accent : k.soft}`}>{fmtYmd(d, { weekday: 'long', month: 'long', day: 'numeric' })}{d === today ? ' · Today' : ''}</div>
          <ul className={`divide-y ${k.divide}`}>{byDate[d].map(e => {
            const a = acct(e.fleetId);
            return e.type === 'day' ? (
              <li key={e.id}><button type="button" onClick={() => onOpenJob(e.id)} className={`w-full text-left px-4 py-3 ${k.rowHover} grid grid-cols-[80px_minmax(0,1fr)] gap-3`} style={{ borderLeft: `4px solid ${STATUS_COLOR.service_due}` }}>
                <span className="text-[14px] font-bold tabular-nums">{e.time}</span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold uppercase tracking-wider" style={{ color: STATUS_COLOR.service_due }}>Fleet service day</span>
                  <span className="block font-bold uppercase">{a?.name}</span>
                  <span className={`block text-[13.5px] ${k.soft}`}>{e.units.length ? `Vehicles: ${e.units.map(u => unitLabel(u)).join(' ')} · ${e.units.length} vehicle${e.units.length === 1 ? '' : 's'}` : 'No vehicle jobs booked for this day yet'}</span>
                </span>
              </button></li>
            ) : (
              <li key={e.id} className={`px-4 py-3 ${k.rowHover} grid grid-cols-[80px_minmax(0,1fr)_auto] gap-3 items-center`}>
                <span className={`text-[14px] tabular-nums ${k.soft}`}>{e.time}</span>
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                  {e.unit && e.vehicleId && <button type="button" className={`font-black text-[16px] ${k.unit} hover:underline`} onClick={() => go({ level: 'vehicle', fleetId: e.fleetId!, vehicleId: e.vehicleId!, tab: 'overview' })}>{unitLabel(e.unit)}</button>}
                  <button type="button" className="font-semibold hover:underline text-left" onClick={() => onOpenJob(e.id)}>{e.service}</button>
                  {!fleetId && <span className={`text-[13px] ${k.muted}`}>{a?.name}</span>}
                </span>
                <JobBadge j={e} />
              </li>
            );
          })}</ul>
        </section>
      ))}
    </div>
  );
}

// ---- forms ---------------------------------------------------------------------------------------------

function Dialog({ k, title, children, onCancel }: { k: K; title: string; children: ReactNode; onCancel: () => void }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.65)' }} role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`${k.dialog} w-full max-w-[560px] p-5 flex flex-col gap-3 text-[#F5F8FA]`}>
        <div className="text-[18px] font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
function Field({ k, label, children, hint }: { k: K; label: string; children: ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1 min-w-0"><span className={k.label}>{label}</span>{children}{hint && <span className={`text-[12px] ${k.muted}`}>{hint}</span>}</label>;
}
function useSave<T>(onSaved: (row: T) => void) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const run = async (fn: () => Promise<T>) => { setBusy(true); setErr(''); try { onSaved(await fn()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } setBusy(false); };
  return { busy, err, run };
}
const Buttons = ({ k, busy, label, onCancel, err }: { k: K; busy: boolean; label: string; onCancel: () => void; err: string }) => (<>
  {err && <div role="alert" className="text-[14px]" style={{ color: STATUS_COLOR.attention }}>{err}</div>}
  <div className="flex justify-end gap-2 pt-1"><button type="button" className={k.btn2} onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className={k.btn} disabled={busy}>{busy ? 'Saving…' : label}</button></div>
</>);

function CompanyForm({ k, account, onCancel, onSaved }: { k: K; account?: FleetAccount; onCancel: () => void; onSaved: (a: FleetAccount) => void }) {
  const [f, setF] = useState({ name: account?.name || '', contact_name: account?.contact_name || '', phone: account?.phone || '', email: account?.email || '', address: account?.address || '', notes: account?.notes || '' });
  const { busy, err, run } = useSave(onSaved);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [key]: e.target.value }));
  return (
    <Dialog k={k} title={account ? `Edit ${account.name}` : 'New fleet'} onCancel={onCancel}>
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void run(() => account ? fleetPost<FleetAccount>('fleet-update', { fleetId: account.id, fields: f }) : fleetPost<FleetAccount>('fleet-create', { fields: f })); }}>
        <Field k={k} label="Company name"><input className={k.input} value={f.name} onChange={set('name')} required autoFocus /></Field>
        {account ? <div className={`text-[13px] ${k.muted}`}>{fleetNumberLabel(account.company_number)} — permanent.</div> : <div className={`text-[13px] ${k.muted}`}>A permanent 4-digit Fleet number is assigned automatically.</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field k={k} label="Primary contact"><input className={k.input} value={f.contact_name} onChange={set('contact_name')} /></Field>
          <Field k={k} label="Phone"><input className={k.input} value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
        </div>
        <Field k={k} label="Email (invoices go here)"><input className={k.input} value={f.email} onChange={set('email')} type="email" /></Field>
        <Field k={k} label="Address / yard location"><input className={k.input} value={f.address} onChange={set('address')} /></Field>
        <Field k={k} label="Notes"><textarea className={k.input} rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <Buttons k={k} busy={busy} err={err} onCancel={onCancel} label={account ? 'Save' : 'Create fleet'} />
      </form>
    </Dialog>
  );
}

function VehicleForm({ k, fleetId, vehicle, suggestion, onCancel, onSaved }: { k: K; fleetId: string; vehicle?: FleetVehicle; suggestion: string; onCancel: () => void; onSaved: (v: FleetVehicle) => void }) {
  const s = (x: unknown) => (x == null ? '' : String(x));
  const [f, setF] = useState({
    unit_number: s(vehicle?.unit_number), year: s(vehicle?.year), make: s(vehicle?.make), model: s(vehicle?.model), engine: s(vehicle?.engine), vin: s(vehicle?.vin), plate: s(vehicle?.plate),
    mileage: s(vehicle?.mileage), status: vehicle?.status || 'active', next_service_label: s(vehicle?.next_service_label), next_service_miles: s(vehicle?.next_service_miles), next_service_date: s(vehicle?.next_service_date).slice(0, 10), notes: s(vehicle?.notes),
  });
  const { busy, err, run } = useSave(onSaved);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [key]: e.target.value }));
  return (
    <Dialog k={k} title={vehicle ? `Edit unit ${unitLabel(vehicle.unit_number)}` : 'Add vehicle'} onCancel={onCancel}>
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void run(() => fleetPost<FleetVehicle>('fleet-vehicle-save', { fleetId, vehicleId: vehicle?.id, fields: f })); }}>
        <Field k={k} label="Fleet / unit number" hint={vehicle ? 'Their own number — change it only if theirs changed.' : `Their own number, as painted on the truck. Next free number: ${suggestion}.`}>
          <div className="flex items-center gap-2"><span className="text-[20px] font-black">#</span><input className={k.input} value={f.unit_number.replace(/^#+/, '')} onChange={set('unit_number')} required autoFocus placeholder={suggestion} /></div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field k={k} label="Year"><input className={k.input} value={f.year} onChange={set('year')} inputMode="numeric" /></Field>
          <Field k={k} label="Make"><input className={k.input} value={f.make} onChange={set('make')} /></Field>
          <Field k={k} label="Model"><input className={k.input} value={f.model} onChange={set('model')} /></Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field k={k} label="Engine"><input className={k.input} value={f.engine} onChange={set('engine')} /></Field>
          <Field k={k} label="VIN"><input className={k.input} value={f.vin} onChange={set('vin')} /></Field>
          <Field k={k} label="Plate"><input className={k.input} value={f.plate} onChange={set('plate')} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field k={k} label="Mileage"><input className={k.input} value={f.mileage} onChange={set('mileage')} inputMode="numeric" /></Field>
          <Field k={k} label="Status"><select className={k.input} value={f.status} onChange={set('status')}>{VEHICLE_STATUSES.map(x => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}</select></Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field k={k} label="Next service"><input className={k.input} value={f.next_service_label} onChange={set('next_service_label')} placeholder="Oil change" /></Field>
          <Field k={k} label="Due at (mi)"><input className={k.input} value={f.next_service_miles} onChange={set('next_service_miles')} inputMode="numeric" /></Field>
          <Field k={k} label="Or due by"><input className={k.input} type="date" value={f.next_service_date} onChange={set('next_service_date')} /></Field>
        </div>
        <Field k={k} label="Notes / open items"><textarea className={k.input} rows={2} value={f.notes} onChange={set('notes')} placeholder="Front brakes: monitor" /></Field>
        <Buttons k={k} busy={busy} err={err} onCancel={onCancel} label={vehicle ? 'Save' : 'Add vehicle'} />
      </form>
    </Dialog>
  );
}

function JobForm({ k, account, vehicle, mileage, today, onCancel, onSaved }: { k: K; account: FleetAccount; vehicle: FleetVehicle | null; mileage: number | null; today: string; onCancel: () => void; onSaved: (row: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ date: today, time: vehicle ? '' : '6:00 AM', service: '', notes: '', mileage: mileage != null ? String(mileage) : '' });
  const { busy, err, run } = useSave(onSaved);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [key]: e.target.value }));
  return (
    <Dialog k={k} title={vehicle ? `New job · Unit ${unitLabel(vehicle.unit_number)}` : 'Schedule fleet service day'} onCancel={onCancel}>
      <div className={`text-[13px] ${k.soft}`}>{account.name} · {fleetNumberLabel(account.company_number)}{vehicle ? ` · ${vehicleTitle(vehicle)}${vehicle.vin ? ` · VIN ${vehicle.vin}` : ''}` : ''}</div>
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void run(() => fleetPost<Record<string, unknown>>('fleet-add-job', { fleetId: account.id, vehicleId: vehicle?.id, ...f })); }}>
        {vehicle && <Field k={k} label="Job"><input className={k.input} value={f.service} onChange={set('service')} required autoFocus placeholder="Oil change, front brakes, inspection…" /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field k={k} label="Date"><input className={k.input} type="date" value={f.date} onChange={set('date')} required /></Field>
          <Field k={k} label="Time"><input className={k.input} value={f.time} onChange={set('time')} placeholder="9:00 AM or TBD" /></Field>
        </div>
        {vehicle && <Field k={k} label="Mileage"><input className={k.input} value={f.mileage} onChange={set('mileage')} inputMode="numeric" /></Field>}
        <Field k={k} label="Notes"><textarea className={k.input} rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div className={`text-[12.5px] ${k.muted}`}>{vehicle ? 'Opens in the normal job screen next, already linked to this unit, for the estimate, parts, photos, invoice and payment.' : 'Book each truck\'s work as its own job on the same date — they\'ll be listed under this service day.'}</div>
        <Buttons k={k} busy={busy} err={err} onCancel={onCancel} label={vehicle ? 'Create job' : 'Schedule day'} />
      </form>
    </Dialog>
  );
}

function PickVehicle({ k, vehicles, onCancel, onPick }: { k: K; vehicles: FleetVehicle[]; onCancel: () => void; onPick: (v: FleetVehicle) => void }) {
  const [q, setQ] = useState('');
  const list = (q.trim() ? searchVehicles(vehicles, q) : [...vehicles].sort((a, b) => String(a.unit_number).localeCompare(String(b.unit_number), undefined, { numeric: true }))).slice(0, 40);
  return (
    <Dialog k={k} title="Which unit is the job for?" onCancel={onCancel}>
      <input className={k.input} value={q} onChange={e => setQ(e.target.value)} placeholder="36, VIN, plate…" autoFocus aria-label="Find unit" />
      <ul className={`divide-y ${k.divide} max-h-[50vh] overflow-y-auto`}>{list.map(v => (
        <li key={v.id}><button type="button" className={`w-full text-left px-3 py-2.5 ${k.rowHover} flex gap-3 items-baseline`} onClick={() => onPick(v)}>
          <span className={`font-black ${k.unit}`}>{unitLabel(v.unit_number)}</span><span>{vehicleTitle(v)}</span>
        </button></li>
      ))}</ul>
      <div className="flex justify-end"><button type="button" className={k.btn2} onClick={onCancel}>Cancel</button></div>
    </Dialog>
  );
}
