// src/RepairBreakdown.tsx
// Styled to match the main site's design system (dark bg, red-600 accent,
// Barlow font — inherited automatically from index.css/tailwind.config.js).

import { useState, useRef } from 'react';

interface SourcedValue { value_ft_lb: number; domain: string; url: string; }
interface VerifiedSpec {
  fastener: string;
  status: 'verified' | 'unconfirmed';
  value_ft_lb: number | null;
  agreeing_sources: SourcedValue[];
  all_sources: SourcedValue[];
}
interface FluidSourcedValue { value: number; unit: string; domain: string; url: string; }
interface VerifiedFluid {
  fluid: string;
  status: 'verified' | 'unconfirmed';
  value: number | null;
  unit: string | null;
  agreeing_sources: FluidSourcedValue[];
  all_sources: FluidSourcedValue[];
}
interface PartRaw { name: string; oem_part_number: string | null; source_url: string | null; }
interface AdditionalSpec { name: string; value: string; source_url: string | null; }
interface KnownIssue { description: string; tsb_number: string | null; source_url: string | null; }
interface StepWithPhoto { text: string; timestamp_seconds: number; photo_url: string | null; }

interface BreakdownResult {
  overview: string;
  torque_specs: VerifiedSpec[];
  fluid_capacities: VerifiedFluid[];
  additional_specs: AdditionalSpec[];
  known_issues: KnownIssue[];
  pitfalls: string[];
  tools_needed: string[];
  parts: PartRaw[];
  steps: StepWithPhoto[];
  estimated_labor_hours: string;
  video_source: string | null;
  merged?: boolean;
  key?: string;
}

interface VehicleInfo {
  year: string; make: string; model: string; trim: string;
  engine: string; drivetrain: string;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const Field = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-sm focus:outline-none focus:border-red-600"
  />
);

export default function RepairBreakdown() {
  const [vin, setVin] = useState('');
  const [vinBusy, setVinBusy] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo>({ year: '', make: '', model: '', trim: '', engine: '', drivetrain: '' });
  const [repairJob, setRepairJob] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<BreakdownResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollHandle = useRef<number | null>(null);

  function stopPolling() {
    if (pollHandle.current) { clearInterval(pollHandle.current); pollHandle.current = null; }
  }

  // Free NHTSA lookup — no Claude involved, no cost, no queue.
  async function decodeVin() {
    if (vin.trim().length !== 17) { setVinError('VIN must be 17 characters'); return; }
    setVinBusy(true);
    setVinError(null);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin.trim())}?format=json`);
      const data = await res.json();
      const row = data?.Results?.[0];
      if (!row || !row.ModelYear || !row.Make || !row.Model) throw new Error('VIN did not decode to a valid vehicle');
      setVehicle({
        year: row.ModelYear || '',
        make: row.Make || '',
        model: row.Model || '',
        trim: row.Trim || row.Series || '',
        engine: row.DisplacementL ? `${Number(row.DisplacementL).toFixed(1)}L` : (row.EngineModel || ''),
        drivetrain: row.DriveType || '',
      });
    } catch (e) {
      setVinError(e instanceof Error ? e.message : 'VIN decode failed');
    } finally {
      setVinBusy(false);
    }
  }

  function vehicleDescription(): string {
    return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine, vehicle.drivetrain]
      .filter(Boolean).join(' ');
  }

  async function pollStatus(key: string, startedAt: number) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      stopPolling();
      setStatus('error');
      setError('Timed out waiting for a result. Is a repair_worker.py running somewhere?');
      return;
    }
    try {
      const res = await fetch(`/repair-breakdown?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (data.status === 'done') { stopPolling(); setResult(data); setStatus('done'); }
      else if (data.status === 'error') { stopPolling(); setStatus('error'); setError(data.error || 'Research failed'); }
    } catch { /* transient — try again next tick */ }
  }

  async function runBreakdown(force = false) {
    const vehicleDesc = vehicleDescription();
    if (!vehicleDesc || !repairJob.trim()) return;
    const repair = `${vehicleDesc} ${repairJob.trim()}`;
    stopPolling();
    setError(null);
    // Only keep the stale result visible on a Refresh (force=true) of the
    // same entry — a fresh lookup for a different repair should still clear
    // whatever was previously on screen.
    if (!force) setResult(null);
    setStatus('pending');
    try {
      const res = await fetch('/repair-breakdown', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // priority: true — this is a live, on-site lookup, so it jumps ahead
        // of any background/batch jobs already queued.
        body: JSON.stringify({ repair, force, priority: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data.status === 'done') { setResult(data); setStatus('done'); return; }
      const startedAt = Date.now();
      pollHandle.current = window.setInterval(() => pollStatus(data.key, startedAt), POLL_INTERVAL_MS);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  return (
    <div className="min-h-screen bg-dark text-light px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <p className="section-label">Internal Tool</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-light mb-6">Repair Breakdown</h1>

        <div className="bg-[#101010] border border-white/10 rounded-xl p-5 space-y-4 mb-6">
          <div>
            <div className="text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">VIN (optional)</div>
            <div className="flex gap-2">
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="17-character VIN"
                maxLength={17}
                className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-sm focus:outline-none focus:border-red-600"
              />
              <button
                onClick={decodeVin}
                disabled={vinBusy || vin.trim().length !== 17}
                className="btn-primary rounded text-sm disabled:opacity-40 whitespace-nowrap"
              >
                {vinBusy ? 'Decoding...' : 'Decode VIN'}
              </button>
            </div>
            {vinError && <p className="text-red-400 text-xs mt-1">{vinError}</p>}
          </div>

          <div className="text-xs text-white/30">— or fill in / adjust manually —</div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Field value={vehicle.year} onChange={(v) => setVehicle({ ...vehicle, year: v })} placeholder="Year" />
            <Field value={vehicle.make} onChange={(v) => setVehicle({ ...vehicle, make: v })} placeholder="Make" />
            <Field value={vehicle.model} onChange={(v) => setVehicle({ ...vehicle, model: v })} placeholder="Model" />
            <Field value={vehicle.trim} onChange={(v) => setVehicle({ ...vehicle, trim: v })} placeholder="Trim (optional)" />
            <Field value={vehicle.engine} onChange={(v) => setVehicle({ ...vehicle, engine: v })} placeholder="Engine (e.g. 2.5L)" />
            <Field value={vehicle.drivetrain} onChange={(v) => setVehicle({ ...vehicle, drivetrain: v })} placeholder="Drivetrain (optional)" />
          </div>
        </div>

        <div className="flex gap-3 mb-2">
          <input
            value={repairJob}
            onChange={(e) => setRepairJob(e.target.value)}
            placeholder="front wheel bearing"
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 text-light placeholder-white/30 focus:outline-none focus:border-red-600"
            onKeyDown={(e) => e.key === 'Enter' && runBreakdown()}
          />
          <button
            onClick={() => runBreakdown()}
            disabled={status === 'pending' || !vehicle.year || !vehicle.make || !vehicle.model || !repairJob.trim()}
            className="btn-primary rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'pending' ? 'Checking...' : 'Run'}
          </button>
        </div>

        {status === 'pending' && (
          <p className="text-white/50 text-sm italic mb-6">
            {result
              ? 'Refreshing — the info below is the last known-good result while new research runs.'
              : 'Queued as priority — a worker will pick this up within ~30s and usually finish in a couple minutes.'}
          </p>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-600/40 text-red-300 rounded px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-10 mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-white/70 italic">{result.overview}</p>
              <button
                onClick={() => runBreakdown(true)}
                disabled={status === 'pending'}
                className="text-xs text-white/50 hover:text-red-500 underline underline-offset-2 whitespace-nowrap disabled:opacity-40"
              >
                Refresh (re-research)
              </button>
            </div>
            {result.merged && (
              <p className="text-xs text-white/40">
                Matched via shared engine/platform ({result.key}) — worth a gut-check if your exact year/trim might differ on this one.
              </p>
            )}

            <section>
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Torque Specs</h2>
              <div className="space-y-2">
                {result.torque_specs.map((spec, i) => (
                  <div
                    key={i}
                    className={`rounded px-4 py-3 border ${
                      spec.status === 'verified'
                        ? 'bg-green-950/30 border-green-700/40'
                        : 'bg-yellow-950/30 border-yellow-700/40'
                    }`}
                  >
                    <div className="font-bold text-light">{spec.fastener}</div>
                    {spec.status === 'verified' ? (
                      <div className="text-sm mt-1">
                        <span className="text-green-400">✅ {spec.value_ft_lb} ft-lb</span>
                        <span className="text-white/40"> — {spec.agreeing_sources.length} sources agree</span>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {spec.agreeing_sources.map((s, j) => (
                            <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2">
                              {s.domain}: {s.value_ft_lb}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm mt-1">
                        <span className="text-yellow-400">⚠️ Unconfirmed</span>
                        <span className="text-white/40"> — sources disagree, check yourself</span>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {spec.all_sources.map((s, j) => (
                            <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2">
                              {s.domain}: {s.value_ft_lb}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {result.fluid_capacities.length > 0 && (
              <section>
                <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Fluid Capacities</h2>
                <div className="space-y-2">
                  {result.fluid_capacities.map((fluid, i) => (
                    <div
                      key={i}
                      className={`rounded px-4 py-3 border ${
                        fluid.status === 'verified'
                          ? 'bg-green-950/30 border-green-700/40'
                          : 'bg-yellow-950/30 border-yellow-700/40'
                      }`}
                    >
                      <div className="font-bold text-light">{fluid.fluid}</div>
                      {fluid.status === 'verified' ? (
                        <div className="text-sm mt-1">
                          <span className="text-green-400">✅ {fluid.value} {fluid.unit}</span>
                          <span className="text-white/40"> — {fluid.agreeing_sources.length} sources agree</span>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {fluid.agreeing_sources.map((s, j) => (
                              <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2">
                                {s.domain}: {s.value} {s.unit}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm mt-1">
                          <span className="text-yellow-400">⚠️ Unconfirmed</span>
                          <span className="text-white/40"> — sources disagree, check yourself</span>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {fluid.all_sources.map((s, j) => (
                              <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2">
                                {s.domain}: {s.value} {s.unit}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {result.additional_specs.length > 0 && (
              <section>
                <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Additional Specs</h2>
                <ul className="space-y-1.5">
                  {result.additional_specs.map((s, i) => (
                    <li key={i} className="text-white/80 text-sm">
                      <b>{s.name}:</b> {s.value}
                      {s.source_url && (
                        <>
                          {' '}
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2 text-xs">
                            source
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.known_issues.length > 0 && (
              <section>
                <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Known Issues / TSBs</h2>
                <ul className="space-y-1.5">
                  {result.known_issues.map((k, i) => (
                    <li key={i} className="text-white/80 text-sm flex gap-2">
                      <span className="text-red-600">—</span>
                      <span>
                        {k.description}
                        {k.tsb_number && <span className="text-white/40"> (TSB {k.tsb_number})</span>}
                        {k.source_url && (
                          <>
                            {' '}
                            <a href={k.source_url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2 text-xs">
                              source
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">What Can Go Wrong</h2>
              <ul className="space-y-1.5">
                {result.pitfalls.map((p, i) => (
                  <li key={i} className="text-white/80 text-sm flex gap-2">
                    <span className="text-red-600">—</span>{p}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Tools Needed</h2>
              <ul className="space-y-1.5">
                {result.tools_needed.map((t, i) => (
                  <li key={i} className="text-white/80 text-sm flex gap-2">
                    <span className="text-red-600">—</span>{t}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Parts</h2>
              <ul className="space-y-1.5">
                {result.parts.map((p, i) => (
                  <li key={i} className="text-white/80 text-sm">
                    {p.name}
                    {p.oem_part_number && <span className="text-white/40"> — OEM# {p.oem_part_number}</span>}
                    {p.source_url && (
                      <>
                        {' '}
                        <a href={p.source_url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-red-500 underline underline-offset-2 text-xs">
                          source
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-3">Step by Step</h2>
              {result.video_source && (
                <p className="text-xs text-white/40 mb-3">
                  Video walkthrough:{' '}
                  <a href={result.video_source} target="_blank" rel="noreferrer" className="text-white/60 hover:text-red-500 underline underline-offset-2">
                    {result.video_source}
                  </a>
                </p>
              )}
              <ol className="space-y-5">
                {result.steps.map((s, i) => (
                  <li key={i} className="text-white/80 text-sm">
                    <div className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">{i + 1}.</span>
                      <div>
                        {s.text}
                        {s.photo_url && (
                          <img
                            src={s.photo_url}
                            alt={`Step ${i + 1}`}
                            loading="lazy"
                            className="mt-2 max-w-xs rounded border border-white/10"
                          />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="border-t border-white/10 pt-6">
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest mb-2">Estimated Labor</h2>
              <p className="text-white/80 text-sm">{result.estimated_labor_hours}</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
