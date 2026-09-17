// src/RepairBrowser.tsx
// Browse-only companion to RepairBreakdown.tsx: pick your way down
// Year -> Make -> Model -> Engine -> Category -> Repair Type instead of
// typing a vehicle description and a free-text repair phrase. Every level
// here only ever offers options that already exist in the database --
// nothing on this screen is generated or guessed. The only "write" this
// screen ever does before the final Source step is adding a new engine
// label to generation_engines, and that's a human confirming a real
// engine exists, not an AI inventing one.

import { useState, useEffect, useRef } from 'react';

interface Generation { id: number; make: string; model: string; name: string; year_start: number; year_end: number; }
interface EngineOption { id: number; engine_label: string; }
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
interface BreakdownResult {
  overview: string; caveats?: string | null;
  torque_specs: VerifiedSpec[]; fluid_capacities: VerifiedFluid[]; additional_specs: AdditionalSpec[];
  known_issues: KnownIssue[]; pitfalls: string[]; tools_needed: string[]; parts: PartRaw[];
  steps: string[]; estimated_labor_hours: string; video_source: string | null;
}

const POLL_INTERVAL_MS = 4000;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1979 + 1 }, (_, i) => CURRENT_YEAR - i);

const selectCls = "bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light text-sm focus:outline-none focus:border-red-600 w-full";

function Picker({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">{label}</div>
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
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [generationLoading, setGenerationLoading] = useState(false);

  const [engines, setEngines] = useState<EngineOption[]>([]);
  const [engine, setEngine] = useState('');
  const [addingEngine, setAddingEngine] = useState(false);
  const [newEngineLabel, setNewEngineLabel] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [repairId, setRepairId] = useState('');

  const [guideStatus, setGuideStatus] = useState<'idle' | 'checking' | 'none' | 'pending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<BreakdownResult | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const pollHandle = useRef<number | null>(null);

  function stopPolling() { if (pollHandle.current) { clearInterval(pollHandle.current); pollHandle.current = null; } }

  // Reset everything downstream whenever an upstream pick changes -- this is
  // what makes it feel like navigating into folders rather than a form.
  useEffect(() => { setMake(''); setMakes([]); setModel(''); setModels([]); setGeneration(null); }, [year]);
  useEffect(() => { setModel(''); setModels([]); setGeneration(null); }, [make]);
  useEffect(() => { setGeneration(null); }, [model]);
  useEffect(() => { setEngine(''); setEngines([]); }, [generation]);
  useEffect(() => { setRepairId(''); setRepairTypes([]); }, [categoryId]);
  useEffect(() => { stopPolling(); setGuideStatus('idle'); setResult(null); setGuideError(null); }, [generation, engine, repairId]);

  useEffect(() => {
    if (!year) return;
    fetch(`/taxonomy-browse?level=makes&year=${encodeURIComponent(year)}`).then((r) => r.json()).then((d) => setMakes(d.makes || []));
  }, [year]);

  useEffect(() => {
    if (!year || !make) return;
    fetch(`/taxonomy-browse?level=models&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`).then((r) => r.json()).then((d) => setModels(d.models || []));
  }, [year, make]);

  useEffect(() => {
    if (!year || !make || !model) return;
    setGenerationLoading(true);
    fetch(`/taxonomy-browse?level=generation&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`)
      .then((r) => r.json()).then((d) => setGeneration(d.generation || null)).finally(() => setGenerationLoading(false));
  }, [year, make, model]);

  useEffect(() => {
    if (!generation) return;
    fetch(`/taxonomy-browse?level=engines&generation_id=${generation.id}`).then((r) => r.json()).then((d) => setEngines(d.engines || []));
  }, [generation]);

  useEffect(() => {
    fetch('/taxonomy-browse?level=categories').then((r) => r.json()).then((d) => setCategories(d.categories || []));
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    fetch(`/taxonomy-browse?level=repairs&category_id=${encodeURIComponent(categoryId)}`).then((r) => r.json()).then((d) => setRepairTypes(d.repairs || []));
  }, [categoryId]);

  // Once the full path is picked, check whether a guide already exists.
  useEffect(() => {
    if (!generation || !engine || !repairId) return;
    setGuideStatus('checking');
    fetch(`/repair-guide-direct?generation_id=${generation.id}&engine=${encodeURIComponent(engine)}&repair_id=${repairId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'done') { setResult(d); setGuideStatus('done'); }
        else if (d.status === 'error') { setGuideStatus('error'); setGuideError(d.error || 'Research failed'); }
        else if (d.status === 'pending' || d.status === 'processing') { setGuideStatus('pending'); startPolling(); }
        else setGuideStatus('none');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, engine, repairId]);

  function startPolling() {
    stopPolling();
    pollHandle.current = window.setInterval(() => {
      if (!generation) return;
      fetch(`/repair-guide-direct?generation_id=${generation.id}&engine=${encodeURIComponent(engine)}&repair_id=${repairId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.status === 'done') { stopPolling(); setResult(d); setGuideStatus('done'); }
          else if (d.status === 'error') { stopPolling(); setGuideStatus('error'); setGuideError(d.error || 'Research failed'); }
        });
    }, POLL_INTERVAL_MS);
  }

  async function addEngine() {
    if (!generation || !newEngineLabel.trim()) return;
    const res = await fetch('/generation-engines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation_id: generation.id, engine_label: newEngineLabel.trim() }),
    });
    const data = await res.json();
    if (data.engine) {
      setEngines((prev) => [...prev, data.engine].sort((a, b) => a.engine_label.localeCompare(b.engine_label)));
      setEngine(data.engine.engine_label);
    }
    setNewEngineLabel('');
    setAddingEngine(false);
  }

  async function sourceData() {
    if (!generation || !engine || !repairId) return;
    setGuideStatus('pending');
    const res = await fetch('/repair-guide-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation_id: generation.id, engine, repair_id: Number(repairId), priority: true }),
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
        <h1 className="text-3xl md:text-4xl font-extrabold text-light mb-6">Repair Browser</h1>

        <div className="bg-[#101010] border border-white/10 rounded-xl p-5 space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Picker label="Year" value={year} onChange={setYear} placeholder="Select year"
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
            <Picker label="Make" value={make} onChange={setMake} placeholder={year ? 'Select make' : 'Pick a year first'}
              options={makes.map((m) => ({ value: m, label: m }))} disabled={!year} />
            <Picker label="Model" value={model} onChange={setModel} placeholder={make ? 'Select model' : 'Pick a make first'}
              options={models.map((m) => ({ value: m, label: m }))} disabled={!make} />
          </div>

          {model && generationLoading && <p className="text-white/40 text-sm italic">Looking up generation…</p>}
          {model && !generationLoading && !generation && (
            <p className="text-yellow-500/80 text-sm">No generation on file for {year} {make} {model} yet — this combination hasn't been set up in the database.</p>
          )}

          {generation && (
            <>
              <p className="text-white/40 text-xs">Generation: {generation.name} ({generation.year_start}-{generation.year_end})</p>
              <div>
                <div className="text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">Engine</div>
                {!addingEngine ? (
                  <div className="flex gap-2">
                    <select className={selectCls} value={engine} onChange={(e) => setEngine(e.target.value)}>
                      <option value="">{engines.length ? 'Select engine' : 'No engines on file yet'}</option>
                      {engines.map((e) => <option key={e.id} value={e.engine_label}>{e.engine_label}</option>)}
                    </select>
                    <button onClick={() => setAddingEngine(true)} className="btn-secondary rounded px-3 text-sm whitespace-nowrap">+ Add engine</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input autoFocus value={newEngineLabel} onChange={(e) => setNewEngineLabel(e.target.value)}
                      placeholder="e.g. 5.7L HEMI" className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-sm flex-1 focus:outline-none focus:border-red-600" />
                    <button onClick={addEngine} className="btn-primary rounded px-3 text-sm">Save</button>
                    <button onClick={() => { setAddingEngine(false); setNewEngineLabel(''); }} className="btn-secondary rounded px-3 text-sm">Cancel</button>
                  </div>
                )}
                <p className="text-white/30 text-xs mt-1">Only engines confirmed here appear for everyone going forward — add it once, pick it forever after.</p>
              </div>
            </>
          )}

          {engine && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Picker label="Repair Category" value={categoryId} onChange={setCategoryId} placeholder="Select category"
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))} />
              <Picker label="Repair Type" value={repairId} onChange={setRepairId} placeholder={categoryId ? 'Select repair type' : 'Pick a category first'}
                options={repairTypes.map((r) => ({ value: String(r.id), label: r.name }))} disabled={!categoryId} />
            </div>
          )}
        </div>

        {guideStatus === 'checking' && <p className="text-white/50 text-sm italic mb-6">Checking for an existing guide…</p>}

        {guideStatus === 'none' && (
          <div className="bg-[#101010] border border-white/10 rounded-xl p-5 mb-6 flex items-center justify-between">
            <p className="text-white/60 text-sm">No research on file yet for this exact combination.</p>
            <button onClick={sourceData} className="btn-primary rounded px-4 py-2 text-sm whitespace-nowrap">Source this data</button>
          </div>
        )}

        {guideStatus === 'pending' && (
          <p className="text-white/50 text-sm italic mb-6">Queued — a worker will pick this up shortly and usually finish in a couple minutes.</p>
        )}

        {guideStatus === 'error' && (
          <div className="bg-red-950/40 border border-red-600/40 text-red-300 rounded px-4 py-3 text-sm mb-6">{guideError}</div>
        )}

        {guideStatus === 'done' && result && (
          <div className="bg-[#101010] border border-white/10 rounded-xl p-5 space-y-4">
            <p className="text-white/80">{result.overview}</p>
            {result.caveats && (
              <div className="bg-yellow-950/30 border border-yellow-600/40 text-yellow-300 rounded px-4 py-3 text-sm">
                <span className="font-bold mr-1">⚠</span><span>{result.caveats}</span>
              </div>
            )}
            {result.torque_specs?.length > 0 && (
              <div>
                <h3 className="text-white/70 font-bold text-sm uppercase tracking-widest mb-2">Torque Specs</h3>
                <ul className="space-y-1 text-sm text-white/70">
                  {result.torque_specs.map((s, i) => (
                    <li key={i}>{s.fastener}{s.applies_to ? ` [${s.applies_to}]` : ''}: {s.status === 'verified' ? `✅ ${s.value_ft_lb} ft-lb` : 'Unconfirmed — check sources'}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.steps?.length > 0 && (
              <div>
                <h3 className="text-white/70 font-bold text-sm uppercase tracking-widest mb-2">Step by Step</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-white/70">
                  {result.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
            <p className="text-white/40 text-xs">Estimated Labor: {result.estimated_labor_hours}</p>
          </div>
        )}
      </div>
    </div>
  );
}
