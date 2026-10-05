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
- Do not escape URLs. Output https://example.com, never https\\://example\\.com.
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

// The diagnosis prompt (owner request 2026-10-05): same source rules as the repair
// prompt, but built around proving the root cause before any part is replaced.
// {{VEHICLE}}, {{COMPLAINT}} and {{DETAILS}} get replaced at generate time.
const DIAGNOSIS_PROMPT_TEMPLATE = `You are an expert master automotive diagnostic technician writing a complete,
professional diagnostic guide for a working mobile mechanic. Use web search to
find real, current information for this exact vehicle — do not rely only on
what you already know.

VEHICLE: {{VEHICLE}}
COMPLAINT / SYMPTOM: {{COMPLAINT}}
CODES, CONDITIONS & HISTORY: {{DETAILS}}

GOAL: find the root cause with the fewest, cheapest, least invasive tests, and
PROVE it before any part is replaced. Never recommend replacing a part unless a
specific test result points to it. A trouble code is a starting point, not a
diagnosis — it says which test the computer failed, not which part is bad.

STEP 1 — IDENTIFY THE SYSTEM ARCHITECTURE FIRST
Before diagnosing, identify the SPECIFIC configuration of every system involved
in this complaint on this exact vehicle — do not assume the most common
variant. The tests, specs, pinouts and likely causes differ between them.
Examples:
- Fuel: port vs. direct vs. dual injection; returnless vs. return-style;
  relay-driven vs. module-controlled (fuel pump driver module) pump; low- and
  high-pressure sides on direct injection.
- Ignition: coil-on-plug vs. coil pack vs. distributor; waste spark.
- Air metering: MAF vs. MAP (speed-density) vs. both; electronic throttle
  (drive-by-wire) vs. cable throttle.
- Induction / valvetrain: naturally aspirated vs. turbocharged/supercharged;
  variable valve timing/lift; cylinder deactivation.
- Emissions: EVAP design (leak detection pump, ELC/NVLD, natural vacuum
  monitor), EGR (vacuum, electric, or none), secondary air injection,
  DPF/DEF/SCR on diesels.
- Sensors: narrowband O2 vs. wideband air/fuel ratio sensors; hall-effect vs.
  variable-reluctance (magnetic) crank/cam sensors.
- Charging / starting: conventional vs. computer-controlled ("smart")
  charging; AGM vs. flooded battery; battery monitor sensor; start-stop.
- Electrical / network: which module controls and which module monitors the
  circuit; CAN/LIN/other networks; gateway module; immobilizer/key system.
- Transmission / drivetrain: torque-converter automatic vs. CVT vs.
  dual-clutch vs. manual; TCM location; FWD/RWD/AWD/4WD and transfer case type.
- Brakes / chassis: ABS/ESC generation; electronic parking brake; electric vs.
  hydraulic power steering; air vs. coil suspension.
- Climate: R-134a vs. R-1234yf; orifice tube vs. expansion valve; electronic
  (variable displacement) compressor control.
- Powertrain: conventional vs. hybrid vs. plug-in hybrid vs. full EV — and the
  high-voltage safety procedure that implies.
State which configuration this vehicle actually has, and clearly note anything
you could not confirm. Only cover the systems that relate to this complaint.

ACCURACY RULES:
- Never invent a number, specification, connector, pin number, wire color, part
  number, TSB/recall number, or procedure. If you searched and could not find
  it, write "Not found in available source data" instead of guessing.
- Label every value as SOURCED (with its clickable link) or GENERAL RULE OF
  THUMB (a common industry guideline that must be verified against factory
  data). Never present a rule of thumb as a factory specification.
- If sources disagree, show both values and both sources rather than silently
  picking one.
- Code definitions can be manufacturer-specific: use the definition for this
  make, model and year, not only the generic SAE meaning.
- Be upfront that this is built from public web sources (forums, repair blogs,
  TSB summaries, parts sites), not a licensed OEM service manual or wiring
  diagram. Flag anything — especially pinouts, wire colors and specifications —
  that must be verified against factory information before it is trusted.
- If important information is missing from the input (no codes given, unclear
  conditions, unknown history), do NOT stop and wait for answers: list the
  questions that would change the diagnosis near the top, then write the full
  guide covering the likely branches.
- Evaluate every category below, but only include a category in your output if
  it genuinely applies to this complaint — skip anything irrelevant rather than
  padding the answer.

SOURCE / UI RULES:
- Every source must be a normal clickable Markdown link placed directly beside
  the specification or claim it supports.
- Never use bare references such as [Source 1], [Source 2], etc.
- Never make the user scroll to a source ledger just to open the source.
- Use short link names such as [Toyota](URL), [Toyota TSB](URL), [NHTSA](URL),
  [RAV4World](URL), [RockAuto](URL), [O'Reilly](URL), or [AutoZone](URL).
- Do not escape URLs. Output https://example.com, never https\\://example\\.com.
- Every source cell inside a table must itself contain a clickable Markdown link.
- If multiple sources support one value, put multiple clickable links in the
  same source cell, separated by a middle dot.
- If sources disagree, show each conflicting value on its own row with its own
  clickable source.
- Keep tables compact and technician-friendly. Do not combine multiple column
  names into one header.
- Use these preferred table layouts when applicable:
  Codes: | Code | Definition (this make) | Status | What sets it | Source |
  Causes: | Possible cause | Likelihood | Why | Test that confirms it | Source |
  Live data: | PID | Expected value | Conditions | If abnormal | Source |
  Circuits: | Circuit / Pin | Wire color | Test | Expected | Source |
  Specifications: | Item | Specification | Conditions | Status | Source |
  TSBs / recalls: | Number | Title | Applies to | Source |
  Tools: | Tool | Capability / Specification | Purpose | Source |
- Keep long warnings and conflict explanations below the table instead of
  stuffing paragraphs into table cells.
- Do not include obviously irrelevant specifications from other generations or
  configurations merely to demonstrate that they differ.
- A short Sources section may appear at the end for convenience, but every
  important source must already be clickable where the information appears.

Categories to evaluate:

1. Vehicle applicability & system architecture — year, make, model, engine,
   engine code, transmission, drivetrain, trim, VIN/production splits, and
   whether any of these change the diagnosis. Include the Step 1
   identification here.
2. Quick summary — written last, shown first: the 3 most likely causes (one
   line each on why) and the first 3 tests to run. No conclusion without a test.
3. Questions to ask / information still needed — exactly when it happens
   (cold or hot start, idle, acceleration, cruise, deceleration, turning,
   braking, specific speed, RPM or gear, A/C on, rain/humidity, after a
   fill-up), how often, when it started, warning lights (steady vs. flashing),
   recent work, accidents, battery disconnects, aftermarket accessories, fuel
   quality, maintenance history, and any parts already replaced.
4. Complaint verification — how to safely duplicate the complaint (conditions,
   route, load), what to record with the scan tool while it happens, and
   whether the behavior is a documented normal operating characteristic
   (cite the TSB if so).
5. Safety precautions — test-specific only: fuel pressure relief; high voltage
   (PPE, service disconnect, wait time, verify zero volts — hybrid/EV only);
   SRS/airbag circuits (never probe with a test light or ohmmeter; disable and
   wait per procedure); running-engine tests (ventilation, fans, belts,
   parking brake and wheel chocks); hot components; never use a test light on
   sensor or computer circuits; back-probe rather than pierce insulation;
   ignition secondary voltage. No generic filler.
6. Preliminary checks — do these before deep testing: battery state of charge
   and condition (resting voltage, load or conductance test), charging
   voltage, main power and ground connections (battery cables, engine-to-body,
   body-to-chassis), related fuses and relays, fluid levels and condition, a
   visual inspection of wiring, connectors, vacuum hoses, intake ducting,
   leaks, rodent damage and aftermarket accessories, air filter, and evidence
   of previous repairs.
7. TSBs, recalls, software updates & known pattern failures — only real,
   applicable ones for this exact vehicle and symptom, with numbers and links;
   include calibration/reflash updates that address the symptom.
8. Full scan & code status — scan ALL modules, not just the engine, and record
   every code before clearing anything; code status (current, pending,
   history, permanent); what each code's freeze frame (RPM, load, coolant
   temp, speed, fuel trims at the moment it set) tells you; readiness
   monitors; Mode $06 results (misfire counts, catalyst, EVAP, O2) where
   relevant.
9. Code analysis — for each code: this make's definition, what the module is
   monitoring, enable/set criteria (conditions, thresholds, one- or two-trip
   logic), common causes ranked for this vehicle, and related codes. State
   which code to diagnose FIRST: power/ground, communication (U-codes) and
   reference-voltage codes first, then sensor circuit codes, then
   component/performance codes, then system/rationality codes (lean, misfire,
   catalyst), which are often the result of another fault.
10. Live data — the PIDs relevant to this complaint with expected values (key
    on engine off, idle, 2500 RPM, cruise, wide-open throttle as applicable)
    and what abnormal readings point to. Include, where relevant: fuel trim
    interpretation (short-term, long-term and total; idle vs. 2500 RPM to
    separate vacuum leaks from fuel delivery from MAF faults), O2/air-fuel
    sensor behavior, MAF reading vs. what this engine should flow, coolant and
    intake air temperature agreement after a cold soak, throttle/pedal sensor
    correlation, cam/crank correlation and VVT desired vs. actual, misfire
    counters, and commanded vs. actual for every actuator involved. Suggest
    comparing with a known-good vehicle where useful.
11. Possible causes, ranked — use the Causes table. Likelihood (High, Medium,
    Low) based on this vehicle's known failures and the given symptoms and
    codes. Include less common but serious causes. Note anything that is
    expensive or invasive to test.
12. Step-by-step test plan (decision tree) — number every test. For each test:
    purpose; tools; setup (key on engine off / running, connector and pin,
    wire color, back-probe point); procedure; expected result with its spec and
    source; PASS → go to step X; FAIL → go to step Y or the conclusion. Order:
    least invasive, quickest and most likely first. Never skip a step that
    would rule out a cheaper cause. Every branch must end in a CONFIRMED root
    cause or a referral, not a guess.
13. Electrical circuit testing — for each circuit involved: what it is (power,
    ground, 5 V reference, signal, low reference, high-side or low-side driver
    control), connector, pin number and wire color; voltage at the component
    with the circuit loaded; voltage drop on the power and ground sides under
    load; component resistance at the stated temperature; harness continuity,
    short-to-ground and short-to-voltage tests; signal sweep and wiggle test;
    and the expected lab-scope waveform (crank/cam pattern, injector, ignition
    primary, current ramp) where a scope is the right tool. For network faults:
    module powers and grounds first, CAN terminating resistance with the battery
    disconnected, bus voltages, and isolating modules by unplugging them.
14. Mechanical tests — only those that apply: cranking and running
    compression, relative compression, cylinder leakdown (percentage and where
    the air escapes), vacuum gauge, fuel pressure and volume (prime, idle,
    under load, hold/leak-down), injector balance/contribution, smoke test
    (intake, EVAP, exhaust), cooling system and cap pressure test, combustion
    gas (block) test, thermostat operation, oil pressure with a mechanical
    gauge, exhaust back-pressure, cam/crank timing correlation, belt and
    tensioner, noise isolation (stethoscope, chassis ears), vibration analysis
    (frequency vs. engine RPM, vehicle speed and tire speed), driveline,
    suspension, steering and brake checks, transmission checks (fluid level by
    the correct procedure and temperature, condition, line pressure, adaptive
    values, slip/ratio data; stall test only where the manufacturer allows it),
    A/C pressures vs. ambient temperature, starting/charging (cable voltage
    drop, starter current draw), parasitic draw (after the modules sleep), and
    hybrid/EV checks such as isolation resistance via the scan tool (only for
    HV-trained technicians).
15. Specifications — every number used in the guide in one Specifications
    table, each with its status and source.
16. Tools & equipment — the scan tool capability needed (generic OBD-II vs.
    enhanced/OEM-level, bi-directional controls, data recording), DVOM, lab
    scope, test light (and where it must NOT be used), fused jumpers,
    back-probe pins and breakout leads, fuel pressure gauge and adapters,
    compression and leakdown testers, smoke machine, vacuum gauge, cooling
    system tester, block tester, amp clamp, infrared thermometer,
    stethoscope/chassis ears, and any OEM special tool with a generic
    equivalent.
17. Bi-directional / functional tests — what the scan tool can command for
    this complaint (injector kill/cylinder balance, fuel pump, EVAP purge and
    vent, EGR, cooling fans, throttle, VVT, solenoids, relays, ABS valves) and
    the expected response.
18. Intermittent fault strategy — how to catch it: data recording with
    triggers/snapshots, freeze frame, wiggle and tap tests while watching data,
    heat gun and freeze spray, water spray for moisture faults, flexing the
    harness at known chafe points, terminal tension (pin drag) checks, and
    longer-term data logging.
19. Commonly misdiagnosed — conditions that mimic this symptom, parts that are
    often replaced without fixing it, aftermarket parts known to cause problems
    on this vehicle, and red herrings to ignore.
20. After the repair — relearns, calibrations or programming needed (crank
    variation, idle/throttle, transmission adaptives, steering angle, battery
    registration, key/immobilizer), clearing codes, verifying the fix under the
    same conditions as the original complaint, the drive cycle that completes
    the relevant readiness monitors, rechecking live data and fuel trims, and
    confirming no new codes in any module.
21. Customer explanation & drivability — a short plain-English explanation of
    what was found and why, and whether the vehicle is safe to drive (e.g. a
    flashing check-engine light means stop driving to protect the catalytic
    converter; brake, steering, overheating or fuel-leak faults mean tow it).
22. When to stop or refer out — dealer-only tools or programming,
    immobilizer/key faults, internal engine or transmission teardown
    decisions, high-voltage work without certification, and the point where
    more testing costs more than the likely repair.
23. Missing / unverified information — a plain list of anything you looked for
    and couldn't confirm.

Output as:

# [YEAR MAKE MODEL ENGINE] — Diagnosis: [COMPLAINT]

## Quick Summary
## Applicability & System Architecture
## Questions to Ask / Information Needed
## Verify the Complaint
## Safety Precautions
## Preliminary Checks
## TSBs, Recalls & Known Pattern Failures
## Full Scan & Code Status
## Code Analysis
## Live Data
## Possible Causes (Ranked)
## Step-by-Step Test Plan
## Electrical Circuit Testing
## Mechanical Tests
## Specifications
## Tools & Equipment
## Bi-Directional / Functional Tests
## Intermittent Fault Strategy
## Commonly Misdiagnosed
## After the Repair
## Customer Explanation & Drivability
## When to Stop or Refer Out
## Missing / Unverified Information
## Sources

FINAL CHECK BEFORE ANSWERING:
- No part is recommended for replacement without a test that proves it.
- Every branch of the test plan ends in a confirmed cause or a referral.
- Every important numeric value has a clickable source beside it, or is
  labeled GENERAL RULE OF THUMB.
- No pin number, wire color, spec or TSB number was invented.
- Every source shown in a table is clickable.
- There are no bare [Source 1]-style references.
- All URLs are normal, unescaped URLs.
- Conflicts are easy to compare at a glance.
- Missing values are clearly marked NOT VERIFIED.
- Tables render with clean individual columns.
- The technician never has to scroll to the bottom just to open a source.`;

type Mode = 'repair' | 'diagnosis';
const MODE_KEY = 'gid-prompt-mode';

// Function replacers so a "$" typed in the job or details is kept as typed.
function buildPrompt(mode: Mode, vehicle: VehicleInfo, job: string, details: string): string {
  const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine, vehicle.drivetrain]
    .filter(Boolean).join(' ') || '(vehicle not specified)';
  if (mode === 'diagnosis') {
    return DIAGNOSIS_PROMPT_TEMPLATE
      .replace('{{VEHICLE}}', () => vehicleStr)
      .replace('{{COMPLAINT}}', () => job.trim() || '(complaint not specified)')
      .replace('{{DETAILS}}', () => details.trim() || '(none given — list the questions that would change the diagnosis)');
  }
  return MASTER_PROMPT_TEMPLATE
    .replace('{{VEHICLE}}', () => vehicleStr)
    .replace('{{JOB}}', () => job.trim() || '(job not specified)');
}

export default function PromptGenerator() {
  const [vin, setVin] = useState('');
  const [vinBusy, setVinBusy] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo>({ year: '', make: '', model: '', trim: '', engine: '', drivetrain: '' });
  const [mode, setModeState] = useState<Mode>(() => { try { return localStorage.getItem(MODE_KEY) === 'diagnosis' ? 'diagnosis' : 'repair'; } catch { return 'repair'; } });
  const setMode = (m: Mode) => { setModeState(m); setGenerated(''); try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } };
  const [job, setJob] = useState('');
  const [details, setDetails] = useState('');
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
    setGenerated(buildPrompt(mode, vehicle, job, details));
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
        <h1 className="text-3xl md:text-4xl font-extrabold text-light mb-4">{mode === 'repair' ? 'Repair' : 'Diagnosis'} Prompt Generator</h1>
        <div role="tablist" aria-label="Prompt type" className="inline-flex border border-white/10 rounded-lg overflow-hidden mb-6">
          {(['repair', 'diagnosis'] as Mode[]).map(m => (
            <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
              className={`px-5 py-2 text-sm font-bold uppercase tracking-widest transition-colors ${mode === m ? 'bg-red-600 text-white' : 'bg-[#101010] text-white/50 hover:text-white'}`}>
              {m === 'repair' ? 'Repair' : 'Diagnosis'}
            </button>
          ))}
        </div>

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

        {mode === 'diagnosis' && (
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            aria-label="Codes, conditions and history"
            placeholder="Optional: codes (P0301 pending…), when it happens (cold start, highway, rain…), mileage, recent work, parts already replaced, what you've tested"
            className="w-full mb-3 bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 text-light placeholder-white/30 text-sm focus:outline-none focus:border-red-600"
          />
        )}
        <div className="flex gap-3 mb-6">
          <input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder={mode === 'repair' ? 'rear brake job' : 'rough idle and misfire when cold'}
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
