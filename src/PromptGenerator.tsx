// src/PromptGenerator.tsx
// Styled to match the main site's design system (dark bg, red-600 accent,
// Barlow font — same as the rest of the internal tools suite).
//
// Purpose: turn "2010 Silverado 5.3 rear brake job" into a fully filled-in
// copy-pasteable prompt for Claude. This page does NOT call any AI model —
// it's pure text templating, so it costs nothing to run and has no API key
// to manage. The generated prompt itself is what does the work once you
// paste it into Claude, where it uses web search to actually find current
// info and build the guide.

import { useState, useRef } from 'react';

interface VehicleInfo {
  year: string; make: string; model: string; trim: string;
  engine: string; drivetrain: string;
}

const Field = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-sm focus:outline-none focus:border-red-600"
  />
);

// The master prompt. {{VEHICLE}} and {{JOB}} get replaced at generate time.
// Expanded per Michael's request to explicitly force sub-architecture
// identification before answering — e.g. "rear brakes" means something
// mechanically different on a car with a separate rear drum parking brake
// vs. an integrated-caliper electronic parking brake vs. a drum-in-hat
// design behind a disc, and the torque specs/procedure/tools genuinely
// differ between them. Same logic generalized to suspension, engine, and
// transmission architecture so the guide doesn't quietly assume the most
// common variant when this specific vehicle might not be it.
const MASTER_PROMPT_TEMPLATE = `You are generating a professional automotive repair guide. Use web search to
find real, current information — do not rely only on what you already know.

VEHICLE: {{VEHICLE}}
JOB: {{JOB}}

Before answering, identify the SPECIFIC mechanical sub-configuration this job
actually involves for this exact vehicle — do not assume the most common
variant. This matters because the procedure, torque specs, and tools can
differ meaningfully between sub-types even for the "same" job. Examples:
- Brakes: disc vs. drum; floating single-piston vs. fixed multi-piston
  caliper; rear parking brake design (drum-in-hat behind a rotor, an
  integrated caliper-mounted parking brake, a separate rear drum brake, a
  cable-actuated system, or an electronic parking brake actuator).
- Suspension: strut vs. double wishbone vs. multi-link vs. solid axle vs.
  air suspension.
- Engine: port injection vs. direct injection, naturally aspirated vs.
  turbo/supercharged, timing belt vs. timing chain.
- Transmission/drivetrain: torque-converter automatic vs. CVT vs.
  dual-clutch vs. manual; FWD/RWD/AWD/4WD differences in the procedure.
- Powertrain: conventional vs. hybrid vs. plug-in hybrid vs. full EV, and
  any high-voltage safety procedure that implies.
State which sub-configuration this vehicle actually has before proceeding,
and note it clearly if you can't confirm it from available sources.

Evaluate every category below. Only include a category in your output if it
genuinely applies to this exact job — skip anything irrelevant rather than
padding the answer.

Never invent a number, part number, or procedure. If you searched and could
not find a specific value, write "Not found in available source data" for
that item instead of guessing. If two sources disagree, show both values and
both sources rather than silently picking one. Attach a source/citation to
every specification you state.

SOURCE / UI RULES:
- Every source must be a normal clickable Markdown link placed directly beside
  the specification or claim it supports.
- Never use bare references such as [Source 1], [Source 2], etc.
- Never make the user scroll to a source ledger just to open the source.
- Use short link names such as [Toyota](URL), [Toyota Parts](URL),
  [RAV4World](URL), [RockAuto](URL), [O'Reilly](URL), or [AutoZone](URL).
- Do not escape URLs. Output https://example.com, never https\://example\.com.
- Every source cell inside a table must itself contain a clickable Markdown link.
- If multiple sources support one value, put multiple clickable links in the
  same source cell, separated by a middle dot.
- If sources disagree, show each conflicting value on its own row with its own
  clickable source.
- Keep tables compact and technician-friendly. Do not combine multiple column
  names into one header.
- Use these preferred table layouts when applicable:
  Torque: | Component / Fastener | Torque | Status | Source |
  Parts: | Part | Qty | OEM Part Number | Applicability | Source |
  Service limits: | Item | New / Standard | Service Limit | Status | Source |
  Fluids: | Fluid / Chemical | Specification | Quantity / Use | Source |
  Tools: | Tool | Size / Specification | Purpose | Source |
- Keep long warnings and conflict explanations below the table instead of
  stuffing paragraphs into table cells.
- Do not include obviously irrelevant specifications from other generations or
  configurations merely to demonstrate that they differ.
- A short Sources section may appear at the end for convenience, but every
  important source must already be clickable where the information appears.

Be upfront that this is built from whatever is publicly findable on the web
(forums, repair blogs, parts sites), not a licensed OEM service manual — flag
anything that seems like it should be verified against a factory manual
before it's trusted on the job.

Categories to evaluate:

1. Vehicle applicability — year, make, model, engine, engine code,
   drivetrain, transmission, trim, VIN/production splits, and whether any of
   these change the procedure or specs for this job. Include the
   sub-configuration identification from above here.
2. Required parts — component, quantity, OEM part number if known,
   left/right or engine-specific differences. Separate REQUIRED REPLACEMENT
   from INSPECT/REPLACE IF NECESSARY (gaskets, seals, clips, cotter pins,
   crush washers, one-time-use fasteners).
3. Tools — common tools vs. special tools, socket/wrench sizes, OEM
   special tool numbers and generic equivalents where known.
4. Preparation — lifting/support points, battery disconnect, fluid
   drain/pressure release, service mode, anything needed before starting.
5. Removal procedure — in correct sequence, including fasteners,
   connectors, alignment marks, anything needed to access the target part.
6. Inspection / service limits — wear limits, min/max thickness,
   runout, clearance, with numeric limits when available.
7. Torque specifications — every fastener touched. Component, ft-lb,
   N·m, in-lb where relevant, torque-angle or sequence if applicable,
   one-time-use status if known. Place each value next to its install step.
8. Fluids / lubricants / chemicals — type, OEM spec, viscosity,
   capacity, only the ones relevant to this job.
9. Installation procedure — cleaning, lubrication points, alignment,
   fastener sequence, torque values, reassembly order.
10. Adjustments — parking brake, valve, cable, preload, backlash,
    alignment, pedal free play, whatever applies.
11. Electronic / scan tool procedures — service mode, EPB retract,
    calibration, relearn, TPMS/ADAS/steering angle reset, battery
    registration, whatever applies.
12. Bleeding / filling procedure — sequence, pressure, fill method,
    air removal, final level check.
13. Additional service limits/specifications — anything numeric
    directly relevant that didn't fit above (pressure, resistance,
    compression, ride height, belt tension, etc.).
14. Safety warnings — job-specific only (spring tension, brake/fuel
    pressure, high voltage, airbag/SRS, hot components). No generic filler.
15. Technician notes — commonly seized bolts, fragile connectors,
    known mistakes, access tricks — only if genuinely supported by what
    you found, clearly marked as general knowledge vs. sourced fact.
16. Post-repair procedure — bedding, leak check, torque recheck,
    road test, DTC scan, calibration, whatever applies.
17. Final verification checklist — short confirm-before-it-leaves-the-bay
    list.
18. Missing / unverified information — a plain list of anything you
    looked for and couldn't confirm.

Output as:

# [YEAR MAKE MODEL ENGINE] — [JOB]

## Applicability
## Required Parts
## Tools
## Preparation
## Removal
## Inspection & Service Limits
## Torque Specifications
## Fluids / Lubricants / Chemicals
## Installation
## Adjustments
## Electronic / Scan Tool Procedures
## Bleeding / Filling
## Safety Warnings
## Technician Notes
## Post-Repair Procedure
## Final Verification
## Missing / Unverified Information
## Sources

FINAL UI CHECK BEFORE ANSWERING:
- Every important numeric value has a clickable source beside it.
- Every source shown in a table is clickable.
- There are no bare [Source 1]-style references.
- All URLs are normal, unescaped URLs.
- Conflicts are easy to compare at a glance.
- Missing values are clearly marked NOT VERIFIED.
- Tables render with clean individual columns.
- The technician never has to scroll to the bottom just to open a source.`;

function buildPrompt(vehicle: VehicleInfo, job: string): string {
  const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine, vehicle.drivetrain]
    .filter(Boolean).join(' ');
  return MASTER_PROMPT_TEMPLATE
    .replace('{{VEHICLE}}', vehicleStr || '(vehicle not specified)')
    .replace('{{JOB}}', job.trim() || '(job not specified)');
}

export default function PromptGenerator() {
  const [vin, setVin] = useState('');
  const [vinBusy, setVinBusy] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo>({ year: '', make: '', model: '', trim: '', engine: '', drivetrain: '' });
  const [job, setJob] = useState('');
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleGenerate() {
    setGenerated(buildPrompt(vehicle, job));
  }

  async function handleCopy() {
    if (!generated) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(generated);
      } else {
        const ta = document.createElement('textarea');
        ta.value = generated;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard denied — silently ignore */ }
  }

  const canGenerate = !!(vehicle.year && vehicle.make && vehicle.model) && job.trim().length > 0;

  return (
    <div className="min-h-screen bg-dark text-light px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <p className="section-label">Internal Tool</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-light mb-6">Repair Prompt Generator</h1>

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
            <Field value={vehicle.engine} onChange={(v) => setVehicle({ ...vehicle, engine: v })} placeholder="Engine (e.g. 5.3L)" />
            <Field value={vehicle.drivetrain} onChange={(v) => setVehicle({ ...vehicle, drivetrain: v })} placeholder="Drivetrain (optional)" />
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="rear brake job"
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 text-light placeholder-white/30 focus:outline-none focus:border-red-600"
            onKeyDown={(e) => e.key === 'Enter' && canGenerate && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="btn-primary rounded disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Generate
          </button>
        </div>

        {generated && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest">Generated Prompt</h2>
              <button
                onClick={handleCopy}
                className="text-xs text-white/50 hover:text-red-500 underline underline-offset-2"
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
            <textarea
              readOnly
              value={generated}
              rows={20}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-4 text-white/80 text-xs font-mono leading-relaxed focus:outline-none focus:border-red-600"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <p className="text-xs text-white/40">
              Paste this whole prompt into a web-enabled AI. Sources should return as clickable links directly beside the specs they support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
