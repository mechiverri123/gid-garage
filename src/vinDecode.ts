// src/vinDecode.ts
// VIN -> vehicle string, using the free NHTSA vPIC API (no key, same API the
// booking widget and Prompt Generator already call).
//
// Output string order matches BookingWidget.vehicleString():
//   "{year} {make} {model} {engine} {trim}"   e.g. "2019 Toyota RAV4 2.5L 4-cyl XLE"
// The engine text follows the engineData.ts style ("5.3L V8", "2.0L 4-cyl",
// "6.7L V8 Diesel") so classifyVehicle() in JobOps.tsx tiers it correctly.

export interface DecodedVehicle {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  drivetrain: string;
  /** Full string: year make model engine trim */
  full: string;
  /** Short string: year make model */
  short: string;
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function cleanVin(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function isVinShapeValid(vin: string): boolean {
  return VIN_RE.test(vin);
}

// Standard North American check digit (position 9). Non-NA VINs (some
// European/Asian imports) legitimately fail this, so callers should treat a
// failure as a warning, not a hard block.
export function vinCheckDigitOk(vin: string): boolean {
  if (!VIN_RE.test(vin)) return false;
  const map: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? parseInt(c, 10) : map[c];
    sum += v * weights[i];
  }
  const rem = sum % 11;
  return vin[8] === (rem === 10 ? 'X' : String(rem));
}

// NHTSA returns most makes in ALL CAPS. Restore the casing the rest of the
// app uses (engineData.ts / BookingWidget PRIORITY list).
const MAKE_CASING: string[] = [
  'Chevrolet', 'Ford', 'Toyota', 'Honda', 'Nissan', 'Jeep', 'Dodge', 'Ram', 'GMC',
  'Subaru', 'Hyundai', 'Kia', 'Mazda', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Audi',
  'Cadillac', 'Buick', 'Lincoln', 'Lexus', 'Acura', 'Infiniti', 'Mitsubishi', 'Chrysler',
  'Pontiac', 'Oldsmobile', 'Saturn', 'Mercury', 'Scion', 'Isuzu', 'Suzuki', 'Hummer',
  'Genesis', 'Volvo', 'Rivian', 'Tesla', 'Alfa Romeo', 'Aston Martin', 'Bentley',
  'Fiat', 'Jaguar', 'Land Rover', 'Lucid', 'MINI', 'Maserati', 'Plymouth', 'Polestar',
  'Porsche', 'Rolls-Royce', 'SRT', 'Saab', 'Lamborghini', 'Ferrari', 'McLaren',
];

function normalizeMake(raw: string): string {
  const hit = MAKE_CASING.find(m => m.toLowerCase() === raw.toLowerCase());
  if (hit) return hit;
  // Unknown make: Title Case it, keep short acronyms upper.
  return raw
    .split(' ')
    .map(w => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function buildEngine(row: Record<string, string>): string {
  const disp = parseFloat(row.DisplacementL);
  const cyl = parseInt(row.EngineCylinders, 10);
  const config = (row.EngineConfiguration || '').toLowerCase();
  const fuel = (row.FuelTypePrimary || '').toLowerCase();

  if (!disp || isNaN(disp)) {
    return fuel.includes('electric') && !row.FuelTypeSecondary ? 'Electric' : '';
  }
  const parts: string[] = [`${disp.toFixed(1)}L`];
  if (cyl) {
    if (config.includes('v-shaped') || config.startsWith('v')) parts.push(`V${cyl}`);
    else if (cyl >= 6 && config.includes('in-line')) parts.push(`I${cyl}`);
    else parts.push(`${cyl}-cyl`);
  }
  if (fuel.includes('diesel')) parts.push('Diesel');
  return parts.join(' ');
}

export async function decodeVin(rawVin: string, signal?: AbortSignal): Promise<DecodedVehicle> {
  const vin = cleanVin(rawVin);
  if (!isVinShapeValid(vin)) throw new Error('VIN must be 17 characters (no I, O, or Q).');

  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
    { signal },
  );
  if (!res.ok) throw new Error(`VIN lookup failed (${res.status}).`);
  const data = await res.json();
  const row = data?.Results?.[0] as Record<string, string> | undefined;
  if (!row || !row.ModelYear || !row.Make || !row.Model) {
    throw new Error('VIN did not decode to a vehicle. Check for a typo.');
  }

  const year = row.ModelYear;
  const make = normalizeMake(row.Make);
  const model = row.Model;
  const trim = row.Trim || row.Series || '';
  const engine = buildEngine(row);
  const short = [year, make, model].join(' ');
  const full = [year, make, model, engine, trim].filter(Boolean).join(' ');
  return { year, make, model, trim, engine, drivetrain: row.DriveType || '', full, short };
}
