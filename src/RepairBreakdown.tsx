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
interface PartRaw { name: string; oem_part_number: string | null; source_url: string | null; }
interface StepWithPhoto { text: string; timestamp_seconds: number; photo_base64: string | null; }

interface BreakdownResult {
  overview: string;
  torque_specs: VerifiedSpec[];
  pitfalls: string[];
  tools_needed: string[];
  parts: PartRaw[];
  steps: StepWithPhoto[];
  estimated_labor_hours: string;
  video_source: string | null;
  merged?: boolean;
  key?: string;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function RepairBreakdown() {
  const [repair, setRepair] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<BreakdownResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollHandle = useRef<number | null>(null);

  function stopPolling() {
    if (pollHandle.current) { clearInterval(pollHandle.current); pollHandle.current = null; }
  }

  async function pollStatus(key: string, startedAt: number) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      stopPolling();
      setStatus('error');
      setError('Timed out waiting for a result. Is repair_worker.py running?');
      return;
    }
    try {
      const res = await fetch(`/repair-breakdown?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (data.status === 'done') { stopPolling(); setResult(data); setStatus('done'); }
      else if (data.status === 'error') { stopPolling(); setStatus('error'); setError(data.error || 'Research failed'); }
    } catch { /* transient — try again next tick */ }
  }

  async function runBreakdown() {
    if (!repair.trim()) return;
    stopPolling();
    setError(null);
    setResult(null);
    setStatus('pending');
    try {
      const res = await fetch('/repair-breakdown', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repair }),
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

        <div className="flex gap-3 mb-2">
          <input
            value={repair}
            onChange={(e) => setRepair(e.target.value)}
            placeholder="2014 hyundai tucson lower control arm replacement"
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 text-light placeholder-white/30 focus:outline-none focus:border-red-600"
            onKeyDown={(e) => e.key === 'Enter' && runBreakdown()}
          />
          <button
            onClick={runBreakdown}
            disabled={status === 'pending'}
            className="btn-primary rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'pending' ? 'Checking...' : 'Run'}
          </button>
        </div>

        {status === 'pending' && (
          <p className="text-white/50 text-sm italic mb-6">
            Not researched yet — queued for the background worker. If repair_worker.py
            is running on your laptop, this fills in on its own within a minute or two.
          </p>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-600/40 text-red-300 rounded px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {status === 'done' && result && (
          <div className="space-y-10 mt-6">
            <p className="text-white/70 italic">{result.overview}</p>
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
                  Steps/photos sourced from:{' '}
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
                        {s.photo_base64 && (
                          <img
                            src={`data:image/jpeg;base64,${s.photo_base64}`}
                            alt={`Step ${i + 1}`}
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
