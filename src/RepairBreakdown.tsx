import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronRight, Database, Gauge, Loader2, Search, ShieldAlert, Wrench } from 'lucide-react';

type Option = { value: string; label: string };
type KnowledgeRow = {
  id?: string; category: string; field_name: string; value_text: string | null; value_json?: unknown;
  units?: string | null; source_name?: string | null; source_url?: string | null; evidence_text?: string | null;
  confidence?: number | null; verification_status?: string | null; source_record_id?: string | null;
  title?: string; summary?: string; details?: { label: string; value: string }[];
};
type VehicleResponse = { vehicle: { year: number; make: string; model: string; vehicle_key: string }; rows: KnowledgeRow[]; counts: Record<string, number>; raw_count?: number; configurations?: Record<string, unknown>[] };

const GROUPS = [
  ['fluids_capacities', 'Fluids & Capacities', Gauge],
  ['maintenance', 'Maintenance', Wrench],
  ['torque_specs', 'Torque Specs', Wrench],
  ['procedures', 'Procedures', BookOpen],
  ['diagnostics', 'Diagnostics', Search],
  ['tsbs', 'TSBs / Service Info', Database],
  ['safety', 'Safety / Recalls', ShieldAlert],
  ['engine_identity', 'Vehicle / Engine', Gauge],
] as const;

function SelectBox({ value, onChange, disabled, placeholder, options }: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder: string; options: Option[] }) {
  return <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="w-full bg-[#151515] border border-white/10 rounded-lg px-4 py-3.5 text-sm text-white outline-none focus:border-red-600 disabled:opacity-40">
    <option value="">{placeholder}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

export default function RepairBreakdown() {
  const [year, setYear] = useState(''); const [make, setMake] = useState(''); const [model, setModel] = useState('');
  const [years, setYears] = useState<Option[]>([]); const [makes, setMakes] = useState<Option[]>([]); const [models, setModels] = useState<Option[]>([]);
  const [data, setData] = useState<VehicleResponse | null>(null); const [active, setActive] = useState('fluids_capacities');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [filter, setFilter] = useState('');

  async function options(level: 'year'|'make'|'model', params = '') {
    const r = await fetch(`/repair-breakdown?mode=options&level=${level}${params}`); if (!r.ok) throw new Error('Could not load vehicle catalog'); return (await r.json()).options as Option[];
  }
  useEffect(() => { options('year').then(setYears).catch(e => setError(e.message)); }, []);
  useEffect(() => { setMake(''); setModel(''); setData(null); setMakes([]); setModels([]); if (year) options('make', `&year=${encodeURIComponent(year)}`).then(setMakes).catch(e => setError(e.message)); }, [year]);
  useEffect(() => { setModel(''); setData(null); setModels([]); if (year && make) options('model', `&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}`).then(setModels).catch(e => setError(e.message)); }, [make]);

  async function loadVehicle() {
    if (!year || !make || !model) return; setLoading(true); setError(''); setData(null); setFilter('');
    try { const r = await fetch(`/repair-breakdown?mode=knowledge&year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Vehicle lookup failed'); setData(j); const first = GROUPS.find(([k]) => (j.counts?.[k] || 0) > 0); if (first) setActive(first[0]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Vehicle lookup failed'); } finally { setLoading(false); }
  }

  const visible = useMemo(() => (data?.rows || []).filter(r => r.category === active && (!filter || `${r.field_name} ${r.value_text || ''} ${r.evidence_text || ''}`.toLowerCase().includes(filter.toLowerCase()))), [data, active, filter]);
  const total = data?.rows.length || 0;

  return <div className="min-h-screen bg-[#0d0d0d] text-white">
    <header className="border-b border-white/10 bg-[#111]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between gap-4">
        <div><div className="text-red-600 text-[11px] font-bold uppercase tracking-[.22em]">GID Garage • Employee Tool</div><h1 className="text-2xl md:text-3xl font-extrabold mt-1">Repair Intelligence</h1></div>
        <div className="hidden md:flex items-center gap-2 text-xs text-white/40"><Database size={14}/><span>Verified-source knowledge base</span></div>
      </div>
    </header>

    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      <section className="bg-[#121212] border border-white/10 rounded-xl p-4 md:p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-4"><div className="w-1 h-5 bg-red-600 rounded"/><h2 className="font-bold">Select Vehicle</h2><span className="text-xs text-white/35 ml-1">Exact catalog lookup</span></div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1.7fr_auto] gap-3">
          <SelectBox value={year} onChange={setYear} placeholder="Year" options={years}/>
          <SelectBox value={make} onChange={setMake} disabled={!year} placeholder="Make" options={makes}/>
          <SelectBox value={model} onChange={setModel} disabled={!make} placeholder="Model" options={models}/>
          <button onClick={loadVehicle} disabled={!model || loading} className="btn-primary rounded-lg min-w-36 disabled:opacity-40">{loading ? <Loader2 size={17} className="animate-spin"/> : <Search size={17}/>} Lookup</button>
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-red-600/40 bg-red-950/30 px-4 py-3 text-sm text-red-200 flex gap-2"><AlertTriangle size={17} className="shrink-0 mt-0.5"/>{error}</div>}

      {!data && !loading && <section className="mt-6 border border-dashed border-white/10 rounded-xl min-h-[360px] flex items-center justify-center text-center p-8"><div><Wrench className="mx-auto text-white/15" size={46}/><h3 className="font-bold text-lg mt-4">Choose a vehicle to begin</h3><p className="text-sm text-white/40 mt-2 max-w-md">Search the repair knowledge collected by GID's safety, service-intelligence, and OEM research workers.</p></div></section>}

      {data && <div className="mt-6 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-5">
        <aside className="bg-[#121212] border border-white/10 rounded-xl p-3 h-fit lg:sticky lg:top-4">
          <div className="px-3 py-2 mb-2"><div className="text-xs text-white/40 uppercase tracking-wider">Vehicle</div><div className="font-extrabold mt-1">{data.vehicle.year} {data.vehicle.make}</div><div className="text-sm text-white/60">{data.vehicle.model}</div><div className="text-[11px] text-white/25 mt-2 break-all">{data.vehicle.vehicle_key}</div></div>
          <div className="border-t border-white/10 my-2"/>
          {GROUPS.map(([key,label,Icon]) => { const n=data.counts?.[key]||0; return <button key={key} onClick={()=>setActive(key)} className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition ${active===key?'bg-red-600 text-white':'text-white/60 hover:bg-white/5 hover:text-white'}`}><Icon size={15}/><span className="flex-1">{label}</span><span className={`text-[11px] tabular-nums ${active===key?'text-white':'text-white/30'}`}>{n}</span></button>})}
        </aside>

        <section className="min-w-0">
          <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 md:p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div><div className="text-xs uppercase tracking-widest text-red-500 font-bold">{GROUPS.find(g=>g[0]===active)?.[1]}</div><div className="text-sm text-white/40 mt-1">{visible.length} usable record{visible.length===1?'':'s'} • {total} employee-ready records{typeof data.raw_count==='number' && data.raw_count!==total ? ` • ${data.raw_count-total} raw evidence rows hidden` : ''}</div></div>
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter this section..." className="bg-[#0d0d0d] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-red-600 w-full md:w-64"/></div>
            </div>
            {visible.length===0 ? <div className="p-10 text-center"><AlertTriangle size={28} className="mx-auto text-white/15"/><div className="font-bold mt-3">No verified records in this section yet</div><p className="text-sm text-white/35 mt-1">The research workers can continue filling this coverage gap.</p></div> : <div className="divide-y divide-white/[.07]">{visible.map((r,i)=><article key={`${r.id||r.field_name}-${i}`} className="p-4 md:p-5 hover:bg-white/[.02]">
              <div className="flex items-start gap-3"><ChevronRight size={16} className="text-red-600 mt-1 shrink-0"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-[15px]">{r.title || r.field_name.replaceAll('_',' ')}</h3>{r.verification_status && <span className="text-[10px] uppercase tracking-wider border border-white/10 rounded px-1.5 py-0.5 text-white/40">{r.verification_status}</span>}</div>
              {r.summary && <div className="text-white/90 mt-2 leading-relaxed text-[15px]">{r.summary}{r.units ? ` ${r.units}` : ''}</div>}
              {!!r.details?.length && <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-4">{r.details.map((d,j)=><div key={`${d.label}-${j}`} className="flex gap-2 text-xs border-t border-white/[.06] pt-2"><span className="text-white/35 shrink-0">{d.label}</span><span className="text-white/70 break-words">{d.value}</span></div>)}</div>}
              {r.evidence_text && r.evidence_text!==r.summary && <details className="mt-4"><summary className="text-xs text-white/35 cursor-pointer hover:text-white/60">Source evidence</summary><p className="text-xs text-white/40 mt-2 leading-relaxed">{r.evidence_text}</p></details>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[11px] text-white/30">{r.source_name && <span>Source: {r.source_name}</span>}{r.source_record_id && <span>Record: {r.source_record_id}</span>}{typeof r.confidence==='number' && <span>confidence {Math.round(r.confidence*100)}%</span>}{r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="text-red-500/80 hover:text-red-400">View source ↗</a>}</div></div></div>
            </article>)}</div>}
          </div>
        </section>
      </div>}
    </main>
  </div>;
}
