// src/PromptGenerator.tsx
// Styled to match the main site's design system (dark bg, red-600 accent,
// Barlow font — same as the rest of the internal tools suite).
//
// Purpose: turn "2010 Silverado 5.3 rear brake job" into a fully filled-in
// copy-pasteable research prompt for an AI model with web search.
//
// This page does NOT call any AI model itself.
// It only builds the research prompt.
//
// The generated prompt forces the research model to:
// - identify the exact mechanical configuration
// - search for vehicle/job-specific data
// - cite actual sources
// - expose conflicts
// - distinguish sourced facts from general technician knowledge
// - never silently invent missing specifications

import { useState, useRef } from 'react';

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  drivetrain: string;
}

const Field = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-light placeholder-white/30 text-sm focus:outline-none focus:border-red-600"
  />
);

const MASTER_PROMPT_TEMPLATE = `You are generating a professional automotive repair guide using live web research.

Use web search extensively before answering.

Do NOT rely only on model memory.

The purpose of this request is to produce a Mitchell1 / ALLDATA-style repair guide using whatever reliable information can actually be found publicly online.

This is NOT a licensed OEM service-information database, so never pretend that it is.

======================================================================
VEHICLE
======================================================================

{{VEHICLE}}

======================================================================
REQUESTED JOB
======================================================================

{{JOB}}

======================================================================
PRIMARY OBJECTIVE
======================================================================

Research this exact vehicle and repair operation and return as much of the
actual job-relevant service information as can be reliably established.

The user should NOT have to separately ask for:

- torque specifications
- service limits
- fluid specifications
- capacities
- tools
- special tools
- removal procedure
- installation procedure
- lubrication points
- replacement hardware
- safety procedures
- scan-tool procedures
- bleeding procedures
- adjustments
- post-repair procedures
- part numbers
- technical warnings
- configuration differences

Evaluate all of those automatically.

Only return categories that genuinely apply to this job.

Do not pad the answer with irrelevant information.

======================================================================
RULE 1 — IDENTIFY THE EXACT MECHANICAL CONFIGURATION FIRST
======================================================================

Before researching the procedure itself, determine the SPECIFIC mechanical
sub-configuration used by this exact vehicle.

Do not simply assume the most common configuration for the model.

Examples of configuration differences that can materially change a repair:

BRAKES
- disc vs drum
- rotor diameter
- rotor thickness
- solid vs vented rotor
- single-piston floating caliper
- dual-piston floating caliper
- fixed multi-piston caliper
- rear drum-in-hat parking brake
- parking brake integrated into rear caliper
- separate rear drum brake
- cable-operated parking brake
- electronic parking brake
- trim/package-specific brake systems

SUSPENSION
- MacPherson strut
- double wishbone
- multi-link
- torsion beam
- solid axle
- coil spring
- leaf spring
- air suspension
- electronically controlled suspension

ENGINE
- exact engine code
- port injection
- direct injection
- combined port/direct injection
- naturally aspirated
- turbocharged
- supercharged
- timing belt
- timing chain
- cylinder deactivation
- variable valve timing configuration

TRANSMISSION / DRIVETRAIN
- manual
- conventional automatic
- CVT
- dual-clutch
- transaxle
- transfer case
- FWD
- RWD
- AWD
- selectable 4WD
- full-time 4WD

POWERTRAIN
- conventional ICE
- mild hybrid
- full hybrid
- plug-in hybrid
- EV
- high-voltage components relevant to the repair

OTHER POSSIBLE SPLITS
- trim level
- wheel size
- towing package
- sport package
- third-row seating
- heavy-duty package
- production date
- VIN split
- factory option code
- engine
- drivetrain
- transmission

State the confirmed configuration at the beginning of the guide.

If you cannot confirm the configuration, explicitly say:

"Exact mechanical sub-configuration not confirmed from available source data."

If multiple configurations may apply, list the possibilities and explain how
the technician can identify which one is physically on the vehicle.

Do NOT write the rest of the guide as though one configuration were confirmed
if it is not.

======================================================================
RULE 2 — SOURCES ARE REQUIRED
======================================================================

Every NUMERIC specification must include an actual source.

Every OEM part number must include an actual source.

Every configuration claim that could change parts, procedure, torque,
service limits, or tools must include an actual source.

Every unusual or non-obvious procedural requirement should include an actual
source when one can be found.

Do NOT write vague citations such as:

- "confirmed across several sources"
- "multiple sources agree"
- "per forums"
- "per FSM"
- "according to Toyota data"
- "according to online sources"
- "dealer listing"
- "service manual excerpt"

unless you ALSO identify the actual source.

For each important sourced fact, provide:

SOURCE NAME:
The actual site, publication, manufacturer, dealer, catalog, forum, manual
host, or other identifiable source.

SOURCE DOMAIN:
Example:
toyota.com
parts.toyota.com
charm.li
rockauto.com

SOURCE URL:
Include the direct page URL whenever the search system provides one.

PAGE / DOCUMENT TITLE:
Include when available.

EXAMPLE OF ACCEPTABLE CITATION:

Caliper slide-pin bolt:
34 N·m (25 ft-lb)

Source:
"Toyota RAV4 Repair Manual — Front Disc Brake"
charm.li
https://example.com/actual-page

EXAMPLE OF UNACCEPTABLE CITATION:

Caliper slide-pin bolt:
25 ft-lb
"Confirmed by four sources"

That is NOT sufficient.

======================================================================
RULE 3 — SOURCE QUALITY HIERARCHY
======================================================================

Prefer sources in this general order when available:

TIER 1 — PRIMARY / FACTORY
1. Vehicle manufacturer service information
2. OEM repair manual
3. OEM technical service bulletin
4. OEM parts catalog
5. OEM owner/service documentation

TIER 2 — PROFESSIONAL TECHNICAL DATA
6. Publicly accessible factory-manual mirrors
7. Professional technical databases
8. Major parts manufacturers publishing technical specifications
9. Major service-information publishers

TIER 3 — STRONG SECONDARY SOURCES
10. Dealer parts catalogs
11. Reputable aftermarket catalogs
12. Major repair-information websites
13. Manufacturer-specific technical communities quoting identifiable service
    documentation

TIER 4 — SUPPORTING / LOW AUTHORITY
14. Forums
15. enthusiast sites
16. repair blogs
17. retailer descriptions
18. user-generated content

Do not treat all sources as equally authoritative.

If a lower-quality source conflicts with an OEM or clearly identified
factory-manual source, show the discrepancy but make the source hierarchy
clear.

Never claim that a forum is equivalent to an OEM manual.

======================================================================
RULE 4 — APPLICABILITY MUST BE PROVEN
======================================================================

Do not use a specification just because it came from:

- the same manufacturer
- the same model
- the same generation
- a nearby model year
- the same engine family
- another drivetrain
- another trim
- another rotor size
- another brake package

unless the source provides enough evidence that the specification applies to
the vehicle/configuration being researched.

For every critical specification, ask internally:

"Does this source actually establish that this specification applies to this
vehicle and configuration?"

If not, mark it:

"Applicability not fully confirmed."

Do not silently transfer specifications from one configuration to another.

======================================================================
RULE 5 — NEVER INVENT OR FILL GAPS
======================================================================

Never invent:

- torque specifications
- socket sizes
- wrench sizes
- fluid capacity
- fluid viscosity
- fluid specification
- refrigerant quantity
- service limits
- rotor thickness
- drum diameter
- runout
- clearance
- resistance
- pressure
- part numbers
- fastener sizes
- bolt grades
- tool numbers
- tightening sequences
- torque-angle procedures
- bleeding sequences
- calibration procedures
- scan-tool procedures
- replacement intervals

If you searched and could not verify a value, write:

"Not found in available source data."

This is preferable to guessing.

Do not generate a plausible number just because similar vehicles commonly use
one.

======================================================================
RULE 6 — CONFLICTING INFORMATION
======================================================================

If credible sources disagree, DO NOT silently choose one.

Display the conflict.

Example:

Caliper bracket torque:

Source A:
98 N·m / 72 ft-lb
[source]

Source B:
107 N·m / 79 ft-lb
[source]

Status:
CONFLICT — verify against factory service information before use.

Then briefly explain any identifiable reason for the difference, such as:

- different rotor diameter
- different production year
- different engine
- different trim
- different brake package
- different generation
- aftermarket source error
- unclear applicability

Do not invent an explanation if none is supported.

======================================================================
RULE 7 — PART NUMBERS REQUIRE EXTRA SCRUTINY
======================================================================

OEM part numbers are especially easy to misapply.

For every OEM part number, establish as much of the following as possible:

- exact vehicle
- model year
- engine
- drivetrain
- trim
- side
- axle
- production date
- package
- superseded number
- current replacement number

Never present an OEM part number as confirmed solely because it appears in a
random retailer listing.

Prefer:

- manufacturer parts catalog
- dealer OEM catalog
- identifiable OEM catalog mirror

If a part number cannot be confidently tied to the exact configuration, label:

"Part number applicability not fully confirmed — verify by VIN before ordering."

If the repair has multiple possible parts based on configuration, explain how
to distinguish them.

======================================================================
RULE 8 — DISTINGUISH FACT FROM TECHNICIAN KNOWLEDGE
======================================================================

Separate the following clearly:

A. SOURCED VEHICLE-SPECIFIC FACT

B. SOURCED GENERAL PROCEDURE

C. GENERAL TECHNICIAN KNOWLEDGE

Do not blur these categories together.

For example:

"Toyota specifies 34 N·m for this bolt"
requires a source.

"Support the caliper instead of letting it hang from the brake hose"
may be accepted general professional practice, but should be labeled as such
if no vehicle-specific source was found.

Technician tips may be useful, but they must never masquerade as OEM
instructions.

======================================================================
RULE 9 — EVALUATE EVERY CATEGORY BELOW
======================================================================

Evaluate all categories.

Only display sections that actually apply to this repair, except:

- Applicability
- Torque Specifications
- Final Verification
- Missing / Unverified Information
- Sources

Those should always appear.

======================================================================
1. VEHICLE APPLICABILITY
======================================================================

Determine when available:

- year
- make
- model
- trim
- engine displacement
- engine code
- transmission
- drivetrain
- body style
- production dates
- VIN splits
- factory option/package differences
- brake/suspension/powertrain configuration
- whether any configuration changes the repair

Include the mechanical sub-configuration analysis here.

======================================================================
2. REQUIRED PARTS
======================================================================

List parts directly involved in the repair.

For each, include where available:

- component name
- quantity
- side
- axle
- OEM part number
- superseded OEM part number
- relevant dimensions
- configuration differences

Separate:

REQUIRED REPLACEMENT

from

INSPECT / REPLACE IF NECESSARY

Evaluate relevant items such as:

- gaskets
- O-rings
- seals
- crush washers
- cotter pins
- lock nuts
- clips
- retainers
- shims
- anti-rattle hardware
- snap rings
- one-time-use bolts
- stretch bolts
- axle nuts
- hardware kits

======================================================================
3. TOOLS
======================================================================

Separate:

COMMON TOOLS

from

SPECIAL TOOLS

Look for:

- sockets
- wrenches
- Allen / hex
- Torx
- E-Torx
- triple-square
- line wrenches
- breaker bar
- torque wrench
- torque-angle gauge
- pry tools
- pullers
- presses
- spring compressor
- ball-joint separator
- brake piston tool
- scan tool
- pressure bleeder
- vacuum bleeder
- cooling-system vacuum filler
- transmission fluid adapters
- OEM special tools

For OEM special tools provide:

- tool number
- tool name
- purpose
- generic equivalent if known

Do not invent tool or socket sizes.

======================================================================
4. PREPARATION
======================================================================

Include applicable preparation steps such as:

- vehicle positioning
- parking brake position
- transmission position
- wheel chocking
- battery disconnect
- battery memory concerns
- high-voltage disconnect
- fuel pressure release
- cooling period
- lifting
- support points
- wheel removal
- fluid draining
- reservoir fluid adjustment
- scan-tool service mode
- EPB maintenance mode
- suspension ride-height mode
- steering lock
- alignment marks

======================================================================
5. REMOVAL PROCEDURE
======================================================================

Provide the removal procedure in correct sequence.

Include:

- access components
- covers
- shields
- brackets
- wiring
- connectors
- hoses
- lines
- clips
- fasteners
- alignment marks
- orientation
- support requirements
- component handling precautions

Do not skip intermediate components necessary to perform the repair.

Put known fastener size/tool information next to the step.

Put known torque values next to relevant reassembly steps later.

======================================================================
6. INSPECTION / SERVICE LIMITS
======================================================================

Search for applicable:

- pad thickness
- shoe thickness
- rotor thickness
- rotor discard thickness
- rotor runout
- drum inside diameter
- drum maximum diameter
- bearing end play
- bearing preload
- shaft play
- joint play
- seal condition
- belt wear
- chain wear
- clearance
- free play
- gap
- resistance
- voltage
- pressure
- vacuum
- compression
- leakage
- surface flatness
- warpage
- taper
- out-of-round

For every numeric specification, cite the actual source.

Where applicable, distinguish:

NEW / STANDARD VALUE

from

SERVICE LIMIT / MINIMUM / MAXIMUM

======================================================================
7. TORQUE SPECIFICATIONS
======================================================================

Find every torque specification applicable to fasteners that are:

- loosened
- removed
- installed
- adjusted
- replaced

For each include:

- component
- fastener
- N·m
- ft-lb
- in-lb where appropriate
- kgf·cm only if source uses it and useful
- torque-angle
- sequence
- tightening stages
- one-time-use status
- source

Every torque value must have a citation.

Also place each torque value directly next to the corresponding installation
step.

Do not list irrelevant chassis-wide torque values.

======================================================================
8. FLUIDS / LUBRICANTS / CHEMICALS
======================================================================

Only include items applicable to the repair.

Search for:

- engine oil
- transmission fluid
- gear oil
- differential fluid
- transfer-case fluid
- brake fluid
- power-steering fluid
- coolant
- refrigerant
- compressor oil
- grease
- silicone grease
- brake lubricant
- assembly lubricant
- anti-seize
- threadlocker
- sealant
- RTV
- anaerobic sealant
- penetrating oil
- cleaning solvent

For fluids provide when applicable:

- type
- OEM specification
- viscosity
- capacity
- drain/refill amount
- fill level
- temperature requirement

Do not include total system capacity when only a drain/refill quantity matters
unless both are clearly labeled.

======================================================================
9. INSTALLATION PROCEDURE
======================================================================

Provide installation in correct sequence.

Include:

- cleaning
- mating surface preparation
- rust removal
- lubrication points
- seals
- O-rings
- gasket preparation
- thread preparation
- threadlocker
- component orientation
- alignment marks
- tightening sequence
- staged tightening
- torque specifications
- clearance adjustment
- reassembly order

Place sourced torque values next to each applicable step.

======================================================================
10. ADJUSTMENTS
======================================================================

Determine whether the repair requires:

- parking-brake adjustment
- brake-shoe adjustment
- cable adjustment
- valve adjustment
- bearing preload
- backlash
- end play
- belt tension
- chain tension
- pedal free play
- clutch adjustment
- throttle adjustment
- linkage adjustment
- wheel alignment
- ride height
- fluid-level adjustment

Provide numeric specifications and procedure only when sourced.

======================================================================
11. ELECTRONIC / SCAN TOOL PROCEDURES
======================================================================

Determine whether the repair requires:

- maintenance mode
- service mode
- EPB retract mode
- ABS service bleed
- DTC clearing
- initialization
- calibration
- relearn
- steering-angle reset
- yaw-rate calibration
- throttle relearn
- idle relearn
- transmission relearn
- battery registration
- battery monitoring reset
- TPMS relearn
- ride-height calibration
- ADAS calibration
- headlamp-level calibration
- power-window initialization
- sunroof initialization

If no electronic procedure is required, say so only if you can reasonably
establish that from the researched configuration.

======================================================================
12. BLEEDING / FILLING PROCEDURE
======================================================================

When applicable, provide:

- bleed sequence
- pressure-bleed requirement
- manual bleed procedure
- vacuum bleed procedure
- ABS scan-tool bleed requirement
- fill method
- fluid temperature
- level-setting procedure
- venting
- cooling-system air removal
- transmission fill procedure
- differential fill level
- final level check

======================================================================
13. ADDITIONAL SERVICE SPECIFICATIONS
======================================================================

Include other relevant numeric specifications that did not fit naturally
elsewhere.

Examples:

- pressure
- vacuum
- compression
- leakdown
- resistance
- voltage
- current draw
- ride height
- belt tension
- end play
- backlash
- alignment
- fluid temperature
- clutch clearance
- sensor gap

======================================================================
14. SAFETY WARNINGS
======================================================================

Include job-specific safety warnings only.

Examples:

- vehicle support
- stored spring energy
- brake hydraulic pressure
- fuel pressure
- hot coolant
- hot exhaust
- rotating components
- airbag / SRS
- hybrid / EV high voltage
- pressurized A/C refrigerant
- high-pressure direct injection
- heavy component support
- steering wheel / clockspring precautions
- lithium battery precautions

Avoid generic filler like:

"Wear gloves and safety glasses"

unless there is a repair-specific reason to emphasize it.

======================================================================
15. TECHNICIAN NOTES
======================================================================

Look for genuinely useful repair-specific information such as:

- commonly seized fasteners
- rust-prone interfaces
- stuck rotors
- fragile connectors
- hidden clips
- easy-to-damage seals
- common installation errors
- left/right differences
- orientation errors
- indexing requirements
- access tricks
- interference problems
- special removal techniques

Separate:

SOURCED TECHNICIAN NOTE

from

GENERAL TECHNICIAN PRACTICE

Do not present forum opinion as factory procedure.

======================================================================
16. POST-REPAIR PROCEDURE
======================================================================

Determine whether the job requires:

- brake-pedal pumping
- parking-brake cycling
- brake bedding / burnishing
- fluid level verification
- leak inspection
- wheel torque
- fastener torque recheck
- steering check
- alignment
- DTC scan
- calibration
- relearn
- road test
- charging-system test
- cooling-system temperature cycle
- fluid temperature check
- transmission adaptation

Do not invent arbitrary mileage-based torque rechecks unless supported by a
source or clearly labeled as general practice.

======================================================================
17. FINAL VERIFICATION
======================================================================

Create a short technician-style checklist appropriate to this exact job.

Possible examples:

- critical fasteners torqued
- one-time-use hardware replaced
- fluids filled
- leaks checked
- connectors restored
- clips installed
- hoses routed correctly
- wheels torqued
- pedal firm
- steering operates correctly
- warning lights off
- systems initialized
- scan completed
- road test completed

Only include applicable items.

======================================================================
18. MISSING / UNVERIFIED INFORMATION
======================================================================

This section is mandatory.

List every important piece of information you attempted to establish but
could not confidently verify.

Examples:

- exact rotor configuration not confirmed
- OEM part number not confirmed
- production split not confirmed
- torque specification not found
- service limit not found
- socket size not sourced
- special-tool number not found
- bleed procedure not confirmed
- conflicting values remain unresolved

Do not hide uncertainty elsewhere in the guide.

======================================================================
SOURCE LEDGER
======================================================================

At the end of the guide provide a source ledger.

For every important source actually used, include:

1. Source title
2. Website / publisher
3. Domain
4. Direct URL if available
5. What information came from that source
6. Source tier

Example:

[1] Toyota RAV4 Repair Manual — Front Disc Brake
Publisher/site: Toyota service-manual mirror
Domain: example.com
URL: https://example.com/...
Used for:
- caliper slide-pin torque
- caliper bracket torque
- rotor service limit
Tier: 1/2 depending on provenance

Never include a source in the ledger that you did not actually use.

======================================================================
INLINE SOURCE FORMAT
======================================================================

Use compact source markers throughout the guide:

[Source 1]
[Source 2]

Example:

Caliper guide-pin bolt:
34 N·m (25 ft-lb) [Source 1]

Front rotor minimum thickness:
22.0 mm [Source 2]

Then provide full source details in the Source Ledger.

This keeps the procedure readable while making every specification traceable.

======================================================================
FINAL CONFIDENCE LABELS
======================================================================

For critical specifications, use one of these labels when useful:

CONFIRMED
A strong source clearly applies to the exact vehicle/configuration.

SUPPORTED
Multiple reasonable sources support the value, but a primary factory source
was not available.

UNCERTAIN
Applicability or source quality is incomplete.

CONFLICT
Credible sources disagree.

NOT FOUND
No defensible source was located.

Do not call something CONFIRMED simply because several websites repeat the
same number.

Repeated secondary websites may all originate from the same unsourced value.

======================================================================
OUTPUT FORMAT
======================================================================

# [YEAR MAKE MODEL ENGINE DRIVETRAIN] — [JOB]

## Applicability

State the exact mechanical configuration first.

Include known configuration splits and how to identify them.

## Required Parts

### Required Replacement

### Inspect / Replace If Necessary

## Tools

### Common Tools

### Special Tools

## Preparation

## Removal

## Inspection & Service Limits

Use a table where useful:

| Item | Standard / New | Service Limit | Status | Source |
|---|---:|---:|---|---|

## Torque Specifications

Use:

| Component / Fastener | N·m | ft-lb | Other | Status | Source |
|---|---:|---:|---:|---|---|

## Fluids / Lubricants / Chemicals

Use a table when useful.

## Installation

Place torque specifications directly beside relevant steps.

## Adjustments

Only if applicable.

## Electronic / Scan Tool Procedures

Only if applicable.

## Bleeding / Filling

Only if applicable.

## Safety Warnings

Job-specific only.

## Technician Notes

Clearly distinguish sourced information from general technician practice.

## Post-Repair Procedure

## Final Verification

Use a concise checklist.

## Missing / Unverified Information

Mandatory.

## Sources

Provide the complete Source Ledger with actual domains and URLs.

======================================================================
FINAL RESEARCH CHECK BEFORE ANSWERING
======================================================================

Before producing the final guide, internally verify:

1. Did I identify the exact mechanical configuration?
2. Did I investigate configuration splits?
3. Did I search specifically for torque specifications?
4. Did I search specifically for service limits?
5. Did I search specifically for OEM part numbers?
6. Did I search specifically for fluids/lubricants where relevant?
7. Did I search specifically for special tools?
8. Did I search specifically for electronic/service-mode requirements?
9. Did I search specifically for post-repair procedures?
10. Does every numeric specification have an identifiable source?
11. Does every OEM part number have an identifiable source?
12. Did I accidentally use data from another year/configuration without
    proving applicability?
13. Did I expose conflicting values instead of hiding them?
14. Did I explicitly list anything I could not verify?
15. Does the Source Ledger contain actual source names/domains/URLs rather
    than vague references?

If any answer is NO, fix it before returning the guide.

Accuracy and traceability matter more than completeness.

A shorter guide containing verified data is better than a complete-looking
guide containing guessed specifications.`;

function buildPrompt(vehicle: VehicleInfo, job: string): string {
  const vehicleStr = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.engine,
    vehicle.drivetrain,
  ]
    .filter(Boolean)
    .join(' ');

  return MASTER_PROMPT_TEMPLATE
    .replace('{{VEHICLE}}', vehicleStr || '(vehicle not specified)')
    .replace('{{JOB}}', job.trim() || '(job not specified)');
}

export default function PromptGenerator() {
  const [vin, setVin] = useState('');
  const [vinBusy, setVinBusy] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);

  const [vehicle, setVehicle] = useState<VehicleInfo>({
    year: '',
    make: '',
    model: '',
    trim: '',
    engine: '',
    drivetrain: '',
  });

  const [job, setJob] = useState('');
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function decodeVin() {
    if (vin.trim().length !== 17) {
      setVinError('VIN must be 17 characters');
      return;
    }

    setVinBusy(true);
    setVinError(null);

    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(
          vin.trim()
        )}?format=json`
      );

      const data = await res.json();
      const row = data?.Results?.[0];

      if (!row || !row.ModelYear || !row.Make || !row.Model) {
        throw new Error('VIN did not decode to a valid vehicle');
      }

      setVehicle({
        year: row.ModelYear || '',
        make: row.Make || '',
        model: row.Model || '',
        trim: row.Trim || row.Series || '',
        engine: row.DisplacementL
          ? `${Number(row.DisplacementL).toFixed(1)}L`
          : row.EngineModel || '',
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

        ta.focus();
        ta.select();

        document.execCommand('copy');

        document.body.removeChild(ta);
      }

      setCopied(true);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied — silently ignore.
    }
  }

  const canGenerate =
    !!(vehicle.year && vehicle.make && vehicle.model) &&
    job.trim().length > 0;

  return (
    <div className="min-h-screen bg-dark text-light px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <p className="section-label">Internal Tool</p>

        <h1 className="text-3xl md:text-4xl font-extrabold text-light mb-6">
          Repair Prompt Generator
        </h1>

        <div className="bg-[#101010] border border-white/10 rounded-xl p-5 space-y-4 mb-6">
          <div>
            <div className="text-xs font-bold text-white/50 mb-2 uppercase tracking-widest">
              VIN (optional)
            </div>

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

            {vinError && (
              <p className="text-red-400 text-xs mt-1">{vinError}</p>
            )}
          </div>

          <div className="text-xs text-white/30">
            — or fill in / adjust manually —
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Field
              value={vehicle.year}
              onChange={(v) => setVehicle({ ...vehicle, year: v })}
              placeholder="Year"
            />

            <Field
              value={vehicle.make}
              onChange={(v) => setVehicle({ ...vehicle, make: v })}
              placeholder="Make"
            />

            <Field
              value={vehicle.model}
              onChange={(v) => setVehicle({ ...vehicle, model: v })}
              placeholder="Model"
            />

            <Field
              value={vehicle.trim}
              onChange={(v) => setVehicle({ ...vehicle, trim: v })}
              placeholder="Trim (optional)"
            />

            <Field
              value={vehicle.engine}
              onChange={(v) => setVehicle({ ...vehicle, engine: v })}
              placeholder="Engine (e.g. 5.3L)"
            />

            <Field
              value={vehicle.drivetrain}
              onChange={(v) => setVehicle({ ...vehicle, drivetrain: v })}
              placeholder="Drivetrain (optional)"
            />
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="rear brake job"
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 text-light placeholder-white/30 focus:outline-none focus:border-red-600"
            onKeyDown={(e) =>
              e.key === 'Enter' && canGenerate && handleGenerate()
            }
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
              <h2 className="text-red-600 text-xs font-bold uppercase tracking-widest">
                Generated Prompt
              </h2>

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
              onClick={(e) =>
                (e.target as HTMLTextAreaElement).select()
              }
            />

            <p className="text-xs text-white/40">
              Paste this whole prompt into an AI model with web search enabled.
              The model should research the exact configuration, cite each
              critical specification, expose conflicts, and clearly identify
              anything it could not verify.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}