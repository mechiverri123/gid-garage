// src/RepairBrowser.tsx
// v2 (configuration-first): Year -> Make -> Model now come from
// vehicle_catalog (NHTSA/vPIC-backed, cached in Supabase) instead of the
// `generations` table, so a valid model-year appears in this browser the
// moment vPIC reports it -- it does NOT need a researched generation first.
// Engine/Powertrain/Drivetrain/Transmission now come from
// vehicle_configurations, keyed to one vehicle_catalog row, instead of
// generation_engines keyed to a generation. `generations` still exists and
// can still be linked for platform-grouping metadata, but nothing on this
// screen requires it anymore.
//
// ============================================================================
// NOTE FOR ANY AI SESSION EDITING THIS FILE
// ============================================================================
// DATA MODEL (post configuration-first migration, see
// sql/001_configuration_first_architecture.sql):
//   vehicle_catalog:        one row per (year, make, model)
//   vehicle_configurations: one row per mechanical identity within a
//                            vehicle_catalog row (engine/drivetrain/
//                            transmission/trim/market)
//   repair_guides:          anchored by configuration_id (new) OR
//                            generation_id (legacy) -- never neither
// Do not reintroduce a hard dependency on `generations` for Year/Make/Model
// to appear here. `generations`/generation_id are optional grouping
// metadata only, attached to a vehicle_catalog or vehicle_configurations
// row, never required for either to exist.
//
// BULK-ADD FORMAT: every bulk-add textarea in this file uses ONE ENTRY PER
// LINE, deliberately, NOT space-separated. Vehicles use commas to separate
// fields within a line (Make, Model, Year). Do not "simplify" this to split
// on whitespace -- real values routinely contain spaces ("5.7L HEMI",
// "Grand Cherokee"), and splitting on space would silently chop a single
// value into multiple wrong entries with no error.
// ============================================================================

import { useState, useEffect, useRef } from 'react';

interface VehicleCatalogEntry { id: number; year: number; make: string; model: string; }
interface ConfigurationOption {
  id: number; engine_label: string; engine_code: string | null; displacement: string | null;
  powertrain_type: string | null; drivetrain: string | null; transmission: string | null;
  fuel_type: string | null; trim_constraint: string | null; emissions_market: string | null;
}
interface Category { id: number; name: string; }
interface RepairType { id: number; slug: string; name: string; }

// Same result shape as RepairBreakdown.tsx -- kept in sync intentionally.
interface SourcedValue { value_ft_lb: number; domain: string; url: string; }
interface VerifiedSpec { fastener: string; applies_to?: string | null; status: 'verified' | 'unconfirmed'; value_ft_lb: number | null; agreeing_sources: SourcedValue[]; all_sources: SourcedValue[]; }
interface FluidSourcedValue { value: number; unit: string; domain: string; url: string; }
interface VerifiedFluid { fluid: string; applies_to?: string | null; status: 'verified' | 'unconfirmed'; value: number | null; unit: string | null; agreeing_sources: FluidSourcedValue[]; all_sources: FluidSourcedValue[]; }
interface PartRaw { name: string; oem_part_number: string | null; source_url: string | null; applies_to?: string | null; }
interface AdditionalSpec { name: string; value: string; source_url: string | null; applies_to?: string | null; }
interface KnownIssue { description: string; tsb_number: string | null; source_url: string | null; }
interface StepWithPhoto { text: string; timestamp_seconds: number; photo_url: string | null; }
interface BreakdownResult {
  overview: string; caveats?: string | null;
  torque_specs: VerifiedSpec[]; fluid_capacities: VerifiedFluid[]; additional_specs: AdditionalSpec[];
  known_issues: KnownIssue[]; pitfalls: string[]; tools_needed: string[]; parts: PartRaw[];
  steps: StepWithPhoto[]; estimated_labor_hours: string; video_source: string | null;
}

const POLL_INTERVAL_MS = 4000;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

const selectCls = "bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light text-base focus:outline-none focus:border-red-600 w-full";

function configLabel(c: ConfigurationOption): string {
  const parts = [c.engine_label];
  if (c.drivetrain) parts.push(c.drivetrain);
  if (c.transmission) parts.push(c.transmission);
  if (c.trim_constraint) parts.push(`[${c.trim_constraint}]`);
  return parts.join(' · ');
}

function Picker({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-sm font-bold text-white/50 mb-2 uppercase tracking-widest">{label}</div>
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function RepairBrowser() {
  const [year, setYear] = useState('');
  const [makes, setMakes] = useState<string[]>([]);
  const [make, setMake] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [vehicle, setVehicle] = useState<VehicleCatalogEntry | null>(null);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ make: '', model: '', year: '' });
  const [addingBulkVehicle, setAddingBulkVehicle] = useState(false);
  const [bulkVehicleText, setBulkVehicleText] = useState('');
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const [configurations, setConfigurations] = useState<ConfigurationOption[]>([]);
  const [configurationId, setConfigurationId] = useState('');
  const [addingConfig, setAddingConfig] = useState(false);
  const [newConfig, setNewConfig] = useState({ engine_label: '', drivetrain: '', transmission: '', trim_constraint: '' });
  const [addingBulkConfig, setAddingBulkConfig] = useState(false);
  const [bulkConfigText, setBulkConfigText] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingBulkCategory, setAddingBulkCategory] = useState(false);
  const [bulkCategoryText, setBulkCategoryText] = useState('');
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [repairId, setRepairId] = useState('');
  const [addingRepairType, setAddingRepairType] = useState(false);
  const [newRepairTypeName, setNewRepairTypeName] = useState('');
  const [addingBulkRepairType, setAddingBulkRepairType] = useState(false);
  const [bulkRepairTypeText, setBulkRepairTypeText] = useState('');

  const [guideStatus, setGuideStatus] = useState<'idle' | 'checking' | 'none' | 'pending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<BreakdownResult | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const pollHandle = useRef<number | null>(null);

  function stopPolling() { if (pollHandle.current) { clearInterval(pollHandle.current); pollHandle.current = null; } }

  // Reset everything downstream whenever an upstream pick changes.
  useEffect(() => { setMake(''); setMakes([]); setModel(''); setModels([]); setVehicle(null); }, [year]);
  useEffect(() => { setModel(''); setModels([]); setVehicle(null); }, [make]);
  useEffect(() => { setVehicle(null); }, [model]);
  useEffect(() => { setConfigurationId(''); setConfigurations([]); }, [vehicle]);
  useEffect(() => { setRepairId(''); setRepairTypes([]); }, [categoryId]);
  useEffect(() => { stopPolling(); setGuideStatus('idle'); setResult(null); setGuideError(null); }, [configurationId, repairId]);

  useEffect(() => {
    if (!year) return;
    fetch(`/vehicle-catalog?level=makes&year=${encodeURIComponent(year)}`).then((r) => r.json()).then((d) => setMakes(d.makes || []));
  }, [year]);

  useEffect(() => {
    if (!year || !make) return;
    fetch(`/vehicle-catalog?level=models&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`).then((r) => r.json()).then((d) => setModels(d.models || []));
  }, [year, make]);

  useEffect(() => {
    if (!year || !make || !model) return;
    setVehicleLoading(true);
    fetch(`/vehicle-catalog?level=vehicle&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`)
      .then((r) => r.json()).then((d) => setVehicle(d.vehicle || null)).finally(() => setVehicleLoading(false));
  }, [year, make, model]);

  useEffect(() => {
    if (!vehicle) return;
    fetch(`/vehicle-catalog?level=configurations&vehicle_catalog_id=${vehicle.id}`).then((r) => r.json()).then((d) => setConfigurations(d.configurations || []));
  }, [vehicle]);

  useEffect(() => {
    fetch('/taxonomy-browse?level=categories').then((r) => r.json()).then((d) => setCategories(d.categories || []));
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    fetch(`/taxonomy-browse?level=repairs&category_id=${encodeURIComponent(categoryId)}`).then((r) => r.json()).then((d) => setRepairTypes(d.repairs || []));
  }, [categoryId]);

  // Once the full path is picked, check whether a guide already exists.
  useEffect(() => {
    if (!configurationId || !repairId) return;
    setGuideStatus('checking');
    fetch(`/repair-guide-direct?configuration_id=${configurationId}&repair_id=${repairId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'done') { setResult(d); setGuideStatus('done'); }
        else if (d.status === 'error') { setGuideStatus('error'); setGuideError(d.error || 'Research failed'); }
        else if (d.status === 'pending' || d.status === 'processing') { setGuideStatus('pending'); startPolling(); }
        else setGuideStatus('none');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationId, repairId]);

  function startPolling() {
    stopPolling();
    pollHandle.current = window.setInterval(() => {
      if (!configurationId || !repairId) return;
      fetch(`/repair-guide-direct?configuration_id=${configurationId}&repair_id=${repairId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.status === 'done') { stopPolling(); setResult(d); setGuideStatus('done'); }
          else if (d.status === 'error') { stopPolling(); setGuideStatus('error'); setGuideError(d.error || 'Research failed'); }
        });
    }, POLL_INTERVAL_MS);
  }

  // One entry per line, deliberately -- see the file-header note above.
  function parseLines(text: string): string[] {
    return text.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  async function createVehicle(m: string, mo: string, y: number): Promise<{ vehicle: VehicleCatalogEntry | null; error: string | null }> {
    if (!m.trim() || !mo.trim() || !Number.isInteger(y)) return { vehicle: null, error: 'make, model and a valid year are required' };
    const res = await fetch('/vehicle-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'vehicle', make: m.trim(), model: mo.trim(), year: y }),
    });
    const data = await res.json();
    return { vehicle: data.vehicle || null, error: res.ok ? null : (data.error || 'Could not add vehicle') };
  }

  async function createConfiguration(vehicleCatalogId: number, engineLabel: string, extra: { drivetrain?: string; transmission?: string; trim_constraint?: string } = {}) {
    if (!engineLabel.trim()) return null;
    const res = await fetch('/vehicle-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'configuration', vehicle_catalog_id: vehicleCatalogId, engine_label: engineLabel.trim(), ...extra }),
    });
    const data = await res.json();
    return data.configuration || null;
  }

  async function createCategory(name: string) {
    if (!name.trim()) return null;
    const res = await fetch('/taxonomy-browse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'category', name: name.trim() }),
    });
    const data = await res.json();
    return data.category || null;
  }

  async function createRepairType(name: string, catId: string) {
    if (!name.trim() || !catId) return null;
    const res = await fetch('/taxonomy-browse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'repair_type', name: name.trim(), category_id: Number(catId) }),
    });
    const data = await res.json();
    return data.repair || null;
  }

  async function addVehicle() {
    const { make: m, model: mo, year: y } = newVehicle;
    const { vehicle: v, error } = await createVehicle(m, mo, Number(y));
    if (v) {
      setYear(String(v.year));
      setMake(v.make);
      setModel(v.model);
      setTimeout(() => setVehicle(v), 0);
      setBulkResult(null);
    } else if (error) {
      setBulkResult(error);
    }
    setNewVehicle({ make: '', model: '', year: '' });
    setAddingVehicle(false);
  }

  async function bulkAddVehicles(text: string) {
    const lines = parseLines(text);
    let added = 0;
    const failures: string[] = [];
    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      const [m, mo, y] = parts;
      const { vehicle: v, error } = await createVehicle(m || '', mo || '', Number(y));
      if (v) added++; else failures.push(`"${line}" — ${error || 'failed'}`);
    }
    setBulkResult(`vehicles: added ${added}${failures.length ? `, ${failures.length} skipped:\n${failures.join('\n')}` : ''}`);
    setBulkVehicleText('');
    setAddingBulkVehicle(false);
    if (year) fetch(`/vehicle-catalog?level=makes&year=${encodeURIComponent(year)}`).then((r) => r.json()).then((d) => setMakes(d.makes || []));
  }

  async function addCategory() {
    const cat = await createCategory(newCategoryName);
    if (cat) {
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(String(cat.id));
    }
    setNewCategoryName('');
    setAddingCategory(false);
  }

  async function bulkAddCategories(text: string) {
    const lines = parseLines(text);
    let added = 0, failed = 0;
    const newOnes: Category[] = [];
    for (const line of lines) {
      const cat = await createCategory(line);
      if (cat) { added++; newOnes.push(cat); } else failed++;
    }
    setCategories((prev) => [...prev, ...newOnes].sort((a, b) => a.name.localeCompare(b.name)));
    setBulkResult(`categories: added ${added}${failed ? `, ${failed} failed` : ''}`);
    setBulkCategoryText('');
    setAddingBulkCategory(false);
  }

  async function addRepairType() {
    const rep = await createRepairType(newRepairTypeName, categoryId);
    if (rep) {
      setRepairTypes((prev) => [...prev, rep].sort((a, b) => a.name.localeCompare(b.name)));
      setRepairId(String(rep.id));
    }
    setNewRepairTypeName('');
    setAddingRepairType(false);
  }

  async function bulkAddRepairTypes(text: string) {
    if (!categoryId) return;
    const lines = parseLines(text);
    let added = 0, failed = 0;
    const newOnes: RepairType[] = [];
    for (const line of lines) {
      const rep = await createRepairType(line, categoryId);
      if (rep) { added++; newOnes.push(rep); } else failed++;
    }
    setRepairTypes((prev) => [...prev, ...newOnes].sort((a, b) => a.name.localeCompare(b.name)));
    setBulkResult(`repair types: added ${added}${failed ? `, ${failed} failed` : ''}`);
    setBulkRepairTypeText('');
    setAddingBulkRepairType(false);
  }

  async function addConfig() {
    if (!vehicle) return;
    const cfg = await createConfiguration(vehicle.id, newConfig.engine_label, {
      drivetrain: newConfig.drivetrain || undefined,
      transmission: newConfig.transmission || undefined,
      trim_constraint: newConfig.trim_constraint || undefined,
    });
    if (cfg) {
      setConfigurations((prev) => [...prev, cfg].sort((a, b) => a.engine_label.localeCompare(b.engine_label)));
      setConfigurationId(String(cfg.id));
    }
    setNewConfig({ engine_label: '', drivetrain: '', transmission: '', trim_constraint: '' });
    setAddingConfig(false);
  }

  // Bulk config lines are just engine labels (the common case) -- drivetrain/
  // transmission/trim variants are rare enough to add one at a time via the
  // regular form when they matter.
  async function bulkAddConfigs(text: string) {
    if (!vehicle) return;
    const lines = parseLines(text);
    let added = 0, failed = 0;
    const newOnes: ConfigurationOption[] = [];
    for (const line of lines) {
      const cfg = await createConfiguration(vehicle.id, line);
      if (cfg) { added++; newOnes.push(cfg); } else failed++;
    }
    setConfigurations((prev) => [...prev, ...newOnes].sort((a, b) => a.engine_label.localeCompare(b.engine_label)));
    setBulkResult(`configurations: added ${added}${failed ? `, ${failed} failed` : ''}`);
    setBulkConfigText('');
    setAddingBulkConfig(false);
  }

  async function sourceData() {
    if (!configurationId || !repairId) return;
    setGuideStatus('pending');
    const res = await fetch('/repair-guide-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuration_id: Number(configurationId), repair_id: Number(repairId), priority: true }),
    });
    const data = await res.json();
    if (data.status === 'done') { setResult(data); setGuideStatus('done'); return; }
    if (data.error) { setGuideStatus('error'); setGuideError(data.error); return; }
    startPolling();
  }

  return (
    <div className="min-h-screen bg-dark text-light px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <p className="section-label">Internal Tool</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-light mb-6">Repair Browser</h1>

        <div className="bg-[#101010] border border-white/10 rounded-xl p-5 space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Picker label="Year" value={year} onChange={setYear} placeholder="Select year"
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
            <Picker label="Make" value={make} onChange={setMake} placeholder={year ? 'Select make' : 'Pick a year first'}
              options={makes.map((m) => ({ value: m, label: m }))} disabled={!year} />
            <Picker label="Model" value={model} onChange={setModel} placeholder={make ? 'Select model' : 'Pick a make first'}
              options={models.map((m) => ({ value: m, label: m }))} disabled={!make} />
          </div>

          {model && vehicleLoading && <p className="text-white/40 text-base italic">Looking up vehicle…</p>}
          {model && !vehicleLoading && !vehicle && (
            <p className="text-yellow-500/80 text-base">{year} {make} {model} isn't in the catalog yet.</p>
          )}

          {!addingVehicle ? (
            <div className="flex gap-3 items-center flex-wrap">
              <button onClick={() => setAddingVehicle(true)} className="btn-secondary rounded px-3 py-1.5 text-base">
                + Add new vehicle{year && make && models.length === 0 ? ` (no models for ${year} ${make}?)` : ''}{year && !make && makes.length === 0 ? ` (no makes for ${year}?)` : ''}
              </button>
              <button onClick={() => setAddingBulkVehicle(true)} className="text-white/40 text-sm underline hover:text-white/70">bulk add vehicles</button>
            </div>
          ) : (
            <div className="bg-[#151515] border border-white/10 rounded-lg p-4 space-y-3">
              <p className="text-white/50 text-sm">This becomes browsable for everyone immediately. Normal vPIC-discovered vehicles are already cached automatically — use this only for something vPIC doesn't have yet.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <input value={newVehicle.make} onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })} placeholder="Make" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                <input value={newVehicle.model} onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })} placeholder="Model" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                <input value={newVehicle.year} onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })} placeholder="Year" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
              </div>
              <div className="flex gap-2">
                <button onClick={addVehicle} className="btn-primary rounded px-3 py-1.5 text-base">Save</button>
                <button onClick={() => { setAddingVehicle(false); setNewVehicle({ make: '', model: '', year: '' }); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
              </div>
            </div>
          )}

          {addingBulkVehicle && (
            <div className="bg-[#151515] border border-white/10 rounded-lg p-4 space-y-3">
              <p className="text-white/50 text-sm">One vehicle per line: <code className="text-white/70">Make, Model, Year</code>.</p>
              <textarea value={bulkVehicleText} onChange={(e) => setBulkVehicleText(e.target.value)} rows={6} placeholder={"Toyota, Camry, 2024\nHonda, Accord, 2022\nFord, F-150, 2020"}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base font-mono focus:outline-none focus:border-red-600" />
              <div className="flex gap-2">
                <button onClick={() => bulkAddVehicles(bulkVehicleText)} className="btn-primary rounded px-3 py-1.5 text-base">Add all</button>
                <button onClick={() => { setAddingBulkVehicle(false); setBulkVehicleText(''); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
              </div>
            </div>
          )}

          {bulkResult && (
            <p className={`text-sm whitespace-pre-wrap ${/skipped|overlap|required|failed/i.test(bulkResult) ? 'text-yellow-500/80' : 'text-green-400/80'}`}>
              {bulkResult} <button onClick={() => setBulkResult(null)} className="underline ml-2">dismiss</button>
            </p>
          )}

          {vehicle && (
            <>
              <p className="text-white/40 text-sm">{vehicle.year} {vehicle.make} {vehicle.model}</p>
              <div>
                <div className="text-sm font-bold text-white/50 mb-2 uppercase tracking-widest">Configuration</div>
                {!addingConfig ? (
                  <div className="flex gap-2">
                    <select className={selectCls} value={configurationId} onChange={(e) => setConfigurationId(e.target.value)}>
                      <option value="">{configurations.length ? 'Select configuration' : 'No configurations on file yet'}</option>
                      {configurations.map((c) => <option key={c.id} value={String(c.id)}>{configLabel(c)}</option>)}
                    </select>
                    <button onClick={() => setAddingConfig(true)} className="btn-secondary rounded px-3 text-base whitespace-nowrap">+ Add configuration</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input autoFocus value={newConfig.engine_label} onChange={(e) => setNewConfig({ ...newConfig, engine_label: e.target.value })}
                      placeholder="Engine, e.g. 5.7L HEMI" className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={newConfig.drivetrain} onChange={(e) => setNewConfig({ ...newConfig, drivetrain: e.target.value })} placeholder="Drivetrain (optional)" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                      <input value={newConfig.transmission} onChange={(e) => setNewConfig({ ...newConfig, transmission: e.target.value })} placeholder="Transmission (optional)" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                      <input value={newConfig.trim_constraint} onChange={(e) => setNewConfig({ ...newConfig, trim_constraint: e.target.value })} placeholder="Trim (optional)" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base focus:outline-none focus:border-red-600" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addConfig} className="btn-primary rounded px-3 py-1.5 text-base">Save</button>
                      <button onClick={() => { setAddingConfig(false); setNewConfig({ engine_label: '', drivetrain: '', transmission: '', trim_constraint: '' }); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
                    </div>
                  </div>
                )}
                <p className="text-white/30 text-sm mt-1">Only configurations confirmed here appear for everyone going forward. <button onClick={() => setAddingBulkConfig(true)} className="underline hover:text-white/60">bulk add (engine labels only)</button></p>
                {addingBulkConfig && (
                  <div className="bg-[#151515] border border-white/10 rounded-lg p-4 space-y-3 mt-2">
                    <p className="text-white/50 text-sm">One engine label per line — for drivetrain/transmission/trim variants, add those one at a time above instead.</p>
                    <textarea value={bulkConfigText} onChange={(e) => setBulkConfigText(e.target.value)} rows={5} placeholder={"3.7L V6\n4.7L V8\n5.7L HEMI"}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base font-mono focus:outline-none focus:border-red-600" />
                    <div className="flex gap-2">
                      <button onClick={() => bulkAddConfigs(bulkConfigText)} className="btn-primary rounded px-3 py-1.5 text-base">Add all</button>
                      <button onClick={() => { setAddingBulkConfig(false); setBulkConfigText(''); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {configurationId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                {!addingCategory ? (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1"><Picker label="Repair Category" value={categoryId} onChange={setCategoryId} placeholder="Select category"
                      options={categories.map((c) => ({ value: String(c.id), label: c.name }))} /></div>
                    <button onClick={() => setAddingCategory(true)} className="btn-secondary rounded px-3 py-2 text-base whitespace-nowrap">+ Add</button>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-bold text-white/50 mb-2 uppercase tracking-widest">New Category</div>
                    <div className="flex gap-2">
                      <input autoFocus value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g. Body/Interior"
                        className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base flex-1 focus:outline-none focus:border-red-600" />
                      <button onClick={addCategory} className="btn-primary rounded px-3 text-base">Save</button>
                      <button onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} className="btn-secondary rounded px-3 text-base">Cancel</button>
                    </div>
                  </div>
                )}
                <button onClick={() => setAddingBulkCategory(true)} className="text-white/40 text-sm underline hover:text-white/70 mt-1">bulk add categories</button>
                {addingBulkCategory && (
                  <div className="bg-[#151515] border border-white/10 rounded-lg p-4 space-y-3 mt-2">
                    <p className="text-white/50 text-sm">One category per line.</p>
                    <textarea value={bulkCategoryText} onChange={(e) => setBulkCategoryText(e.target.value)} rows={5} placeholder={"Body/Interior\nHVAC"}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base font-mono focus:outline-none focus:border-red-600" />
                    <div className="flex gap-2">
                      <button onClick={() => bulkAddCategories(bulkCategoryText)} className="btn-primary rounded px-3 py-1.5 text-base">Add all</button>
                      <button onClick={() => { setAddingBulkCategory(false); setBulkCategoryText(''); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                {!addingRepairType ? (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1"><Picker label="Repair Type" value={repairId} onChange={setRepairId} placeholder={categoryId ? 'Select repair type' : 'Pick a category first'}
                      options={repairTypes.map((r) => ({ value: String(r.id), label: r.name }))} disabled={!categoryId} /></div>
                    <button onClick={() => setAddingRepairType(true)} disabled={!categoryId} className="btn-secondary rounded px-3 py-2 text-base whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">+ Add</button>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-bold text-white/50 mb-2 uppercase tracking-widest">New Repair Type</div>
                    <div className="flex gap-2">
                      <input autoFocus value={newRepairTypeName} onChange={(e) => setNewRepairTypeName(e.target.value)} placeholder="e.g. Water Pump Replacement"
                        className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base flex-1 focus:outline-none focus:border-red-600" />
                      <button onClick={addRepairType} className="btn-primary rounded px-3 text-base">Save</button>
                      <button onClick={() => { setAddingRepairType(false); setNewRepairTypeName(''); }} className="btn-secondary rounded px-3 text-base">Cancel</button>
                    </div>
                  </div>
                )}
                <button onClick={() => setAddingBulkRepairType(true)} disabled={!categoryId} className="text-white/40 text-sm underline hover:text-white/70 mt-1 disabled:opacity-40 disabled:cursor-not-allowed">bulk add repair types</button>
                {addingBulkRepairType && (
                  <div className="bg-[#151515] border border-white/10 rounded-lg p-4 space-y-3 mt-2">
                    <p className="text-white/50 text-sm">One repair type per line — all added under the currently selected category.</p>
                    <textarea value={bulkRepairTypeText} onChange={(e) => setBulkRepairTypeText(e.target.value)} rows={5} placeholder={"Front Rotor Replacement\nBrake Caliper Replacement\nBrake Fluid Service"}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-base font-mono focus:outline-none focus:border-red-600" />
                    <div className="flex gap-2">
                      <button onClick={() => bulkAddRepairTypes(bulkRepairTypeText)} className="btn-primary rounded px-3 py-1.5 text-base">Add all</button>
                      <button onClick={() => { setAddingBulkRepairType(false); setBulkRepairTypeText(''); }} className="btn-secondary rounded px-3 py-1.5 text-base">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {guideStatus === 'checking' && <p className="text-white/50 text-base italic mb-6">Checking for an existing guide…</p>}

        {guideStatus === 'none' && (
          <div className="bg-[#101010] border border-white/10 rounded-xl p-5 mb-6 flex items-center justify-between">
            <p className="text-white/60 text-base">No research on file yet for this exact combination.</p>
            <button onClick={sourceData} className="btn-primary rounded px-4 py-2 text-base whitespace-nowrap">Source this data</button>
          </div>
        )}

        {guideStatus === 'pending' && (
          <p className="text-white/50 text-base italic mb-6">Queued — a worker will pick this up shortly and usually finish in a couple minutes.</p>
        )}

        {guideStatus === 'error' && (
          <div className="bg-red-950/40 border border-red-600/40 text-red-300 rounded px-4 py-3 text-base mb-6">{guideError}</div>
        )}

        {guideStatus === 'done' && result && (
          <div className="bg-[#101010] border border-white/10 rounded-xl p-6 space-y-6">
            <p className="text-white/80 text-lg">{result.overview}</p>
            {result.caveats && (
              <div className="bg-yellow-950/30 border border-yellow-600/40 text-yellow-300 rounded px-4 py-3 text-base">
                <span className="font-bold mr-1">⚠</span><span>{result.caveats}</span>
              </div>
            )}
            {result.torque_specs?.length > 0 && (
              <div>
                <h3 className="text-white/70 font-bold text-base uppercase tracking-widest mb-3">Torque Specs</h3>
                <ul className="space-y-3 text-base text-white/70">
                  {result.torque_specs.map((s, i) => (
                    <li key={i}>
                      <div>
                        <span className="font-semibold text-white/90">{s.fastener}</span>
                        {s.applies_to ? <span className="text-white/50"> [{s.applies_to}]</span> : null}
                        {': '}
                        {s.status === 'verified' ? <span className="text-green-400">✅ {s.value_ft_lb} ft-lb</span> : <span className="text-yellow-500">Unconfirmed</span>}
                      </div>
                      {(s.all_sources?.length ?? 0) > 0 ? (
                        <ul className="ml-4 mt-1 text-sm text-white/40 space-y-0.5">
                          {s.all_sources.map((src, j) => (
                            <li key={j}>
                              {src.url ? (
                                <a href={src.url} target="_blank" rel="noreferrer" className="underline hover:text-white/70">{src.domain}</a>
                              ) : src.domain}
                              {typeof src.value_ft_lb === 'number' ? `: ${src.value_ft_lb} ft-lb` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="ml-4 mt-1 text-sm text-white/30 italic">No source recorded for this fastener.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.steps?.length > 0 && (
              <div>
                <h3 className="text-white/70 font-bold text-base uppercase tracking-widest mb-3">Step by Step</h3>
                <ol className="list-decimal list-inside space-y-2 text-base text-white/70">
                  {result.steps.map((s, i) => <li key={i}>{s.text}</li>)}
                </ol>
              </div>
            )}
            <div>
              <h3 className="text-white/70 font-bold text-base uppercase tracking-widest mb-2">Video</h3>
              {result.video_source ? (
                <a href={result.video_source} target="_blank" rel="noreferrer" className="text-red-500 underline text-base">{result.video_source}</a>
              ) : (
                <p className="text-white/40 text-base italic">No walkthrough video found for this repair.</p>
              )}
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-white/50 text-sm uppercase tracking-widest mb-1">Estimated Labor</p>
              <p className="text-white text-3xl font-extrabold">{result.estimated_labor_hours}</p>
              <p className="text-white/30 text-sm mt-1 italic">Single aggregate estimate only.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
