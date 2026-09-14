// src/RepairBreakdown.tsx
// Standalone internal tool page, reached only at gidgarage.com/repair-tool.
// POSTs the repair, then polls until the (possibly cached) result is ready.
// Cached repeat lookups return "done" on the very first POST — no polling
// needed. A brand-new repair takes real research time in the background;
// polling just avoids the request itself timing out on that wait.

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
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // give up after 5 min

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
      setError('Timed out waiting for a result — check Cloudflare Functions logs.');
      return;
    }
    try {
      const res = await fetch(`/repair-breakdown?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (data.status === 'done') {
        stopPolling();
        setResult(data);
        setStatus('done');
      } else if (data.status === 'error') {
        stopPolling();
        setStatus('error');
        setError(data.error || 'Research failed');
      }
      // status === 'pending' -> keep polling
    } catch {
      // transient fetch error while polling — just try again next tick
    }
  }

  async function runBreakdown() {
    if (!repair.trim()) return;
    stopPolling();
    setError(null);
    setResult(null);
    setStatus('pending');

    try {
      const res = await fetch('/repair-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repair }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      if (data.status === 'done') {
        // cached — instant
        setResult(data);
        setStatus('done');
        return;
      }

      // pending (new or already-in-progress) — start polling
      const startedAt = Date.now();
      pollHandle.current = window.setInterval(() => pollStatus(data.key, startedAt), POLL_INTERVAL_MS);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <h2>Repair Breakdown</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={repair}
          onChange={(e) => setRepair(e.target.value)}
          placeholder="2014 hyundai tucson lower control arm replacement"
          style={{ flex: 1, padding: 8 }}
          onKeyDown={(e) => e.key === 'Enter' && runBreakdown()}
        />
        <button onClick={runBreakdown} disabled={status === 'pending'}>
          {status === 'pending' ? 'Checking...' : 'Run'}
        </button>
      </div>

      {status === 'pending' && (
        <p style={{ fontStyle: 'italic' }}>
          Not researched yet — queued for the background worker. If it's running
          (laptop on, repair_worker.py started), this'll fill in on its own in a
          minute or two. Otherwise it'll sit queued until you start the worker.
        </p>
      )}

      {error && <div style={{ color: 'red' }}>{error}</div>}

      {status === 'done' && result && (
        <div>
          <p style={{ fontStyle: 'italic' }}>{result.overview}</p>

          <h3>Torque Specs</h3>
          {result.torque_specs.map((spec, i) => (
            <div key={i} style={{ marginBottom: 8, padding: 8, borderRadius: 4, background: spec.status === 'verified' ? '#e6f4ea' : '#fff8e1' }}>
              <strong>{spec.fastener}</strong>
              {spec.status === 'verified' ? (
                <div>
                  ✅ {spec.value_ft_lb} ft-lb ({spec.agreeing_sources.length} sources agree)
                  <div style={{ fontSize: 12 }}>
                    {spec.agreeing_sources.map((s, j) => (
                      <a key={j} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{s.domain}: {s.value_ft_lb}</a>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  ⚠️ Unconfirmed — sources disagree, check yourself:
                  <div style={{ fontSize: 12 }}>
                    {spec.all_sources.map((s, j) => (
                      <a key={j} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{s.domain}: {s.value_ft_lb}</a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <h3>What Can Go Wrong</h3>
          <ul>{result.pitfalls.map((p, i) => <li key={i}>{p}</li>)}</ul>

          <h3>Tools Needed</h3>
          <ul>{result.tools_needed.map((t, i) => <li key={i}>{t}</li>)}</ul>

          <h3>Parts</h3>
          <ul>
            {result.parts.map((p, i) => (
              <li key={i}>
                {p.name}{p.oem_part_number && ` — OEM# ${p.oem_part_number}`}
                {p.source_url && <> <a href={p.source_url} target="_blank" rel="noreferrer">source</a></>}
              </li>
            ))}
          </ul>

          <h3>Step by Step</h3>
          {result.video_source && (
            <p style={{ fontSize: 12 }}>Steps/photos sourced from: <a href={result.video_source} target="_blank" rel="noreferrer">{result.video_source}</a></p>
          )}
          <ol>
            {result.steps.map((s, i) => (
              <li key={i} style={{ marginBottom: 16 }}>
                {s.text}
                {s.photo_base64 && (
                  <div style={{ marginTop: 4 }}>
                    <img src={`data:image/jpeg;base64,${s.photo_base64}`} alt={`Step ${i + 1}`} style={{ maxWidth: 320, borderRadius: 4, display: 'block' }} />
                  </div>
                )}
              </li>
            ))}
          </ol>

          <h3>Estimated Labor</h3>
          <p>{result.estimated_labor_hours}</p>
        </div>
      )}
    </div>
  );
}
