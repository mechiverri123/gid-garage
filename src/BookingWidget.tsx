import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

const PHONE = '480-599-0118';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://axnjaqtsqocfmxhmenbh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bmphcXRzcW9jZm14aG1lbmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTMwMDUsImV4cCI6MjA5NTU4OTAwNX0.8FSqJfYRzeVV9zqXUmnDTCYzjb4obRYNnf5WtM2oLNk';
const EMAILJS_SERVICE_ID = 'service_oiv0apk';
const EMAILJS_TEMPLATE_ID = 'template_gy3tfmn';
const EMAILJS_PUBLIC_KEY = 'HRHZO34OJFxrK5DE0';
const ADMIN_PASSWORD = '0000';
// ───────────────────────────────────────────────────────────────────────────

// ── SUPABASE HELPERS ────────────────────────────────────────────────────────
async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getSupabaseBookings(): Promise<Booking[]> {
  try {
    const data = await sbFetch('/bookings?select=*&order=date.asc,time.asc');
    return (data || []).map((b: any) => ({
      id: b.id,
      service: b.service,
      serviceIcon: b.service_icon,
      date: b.date,
      time: b.time,
      fname: b.fname,
      lname: b.lname,
      phone: b.phone,
      email: b.email,
      vehicle: b.vehicle,
      notes: b.notes || '',
      status: b.status,
      createdAt: b.created_at,
    }));
  } catch (e) {
    console.warn('Supabase fetch failed, falling back to localStorage', e);
    return getLocalBookings();
  }
}

async function insertSupabaseBooking(b: Booking): Promise<void> {
  await sbFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      id: b.id,
      service: b.service,
      service_icon: b.serviceIcon,
      date: b.date,
      time: b.time,
      fname: b.fname,
      lname: b.lname,
      phone: b.phone,
      email: b.email,
      vehicle: b.vehicle,
      notes: b.notes,
      status: b.status,
      created_at: b.createdAt,
    }),
  });
}

async function updateSupabaseBooking(id: string, status: Booking['status']): Promise<void> {
  await sbFetch(`/bookings?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

async function getBookedTimesForDate(date: string): Promise<string[]> {
  try {
    const data = await sbFetch(`/bookings?select=time&date=eq.${date}&status=neq.cancelled`);
    return (data || []).map((b: any) => b.time);
  } catch {
    return getLocalBookings().filter(b => b.date === date && b.status !== 'cancelled').map(b => b.time);
  }
}

// ── LOCAL STORAGE FALLBACK ──────────────────────────────────────────────────
const SERVICES = [
  { id: 'oil',        icon: '🛢️', name: 'Oil Change',  desc: 'Full synthetic only — your engine deserves it', duration: '30 min', startingAt: '$79.99*' },
  { id: 'brakes',     icon: '🔧', name: 'Brakes',       desc: 'Pads, rotors, full brake service',              duration: '2 hrs',   startingAt: null },
  { id: 'diag',       icon: '💻', name: 'Diagnostics',  desc: 'Check engine & system scan',                    duration: '1 hr',    startingAt: null },
  { id: 'suspension', icon: '🚗', name: 'Suspension',   desc: 'Shocks, struts, control arms & more',           duration: '2–3 hrs', startingAt: null },
  { id: 'full',       icon: '✅', name: 'Full Service', desc: 'Multi-point inspection',                        duration: '1.5 hrs', startingAt: null },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TIME_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateKey(y: number, m: number, d: number) { return `${y}-${pad(m+1)}-${pad(d)}`; }

interface Booking {
  id: string;
  service: string;
  serviceIcon: string;
  date: string;
  time: string;
  fname: string;
  lname: string;
  phone: string;
  email: string;
  vehicle: string;
  notes: string;
  status: 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

interface FormData {
  fname: string; lname: string; phone: string;
  email: string; vehicleYear: string; vehicleMake: string; vehicleModel: string; vehicleTrim: string; notes: string;
}

// ── VEHICLE DATABASE ─────────────────────────────────────────────────────────
// year → make → model → trims[]
type VehicleDB = Record<number, Record<string, Record<string, string[]>>>;

function buildVehicleDB(): VehicleDB {
  const years = Array.from({ length: 36 }, (_, i) => 1990 + i); // 1990–2025
  const data: VehicleDB = {};

  const makes: Record<string, Record<string, string[]>> = {
    'Acura': {
      'ILX': ['Base', 'Premium', 'Technology', 'A-Spec'],
      'MDX': ['Base', 'Technology', 'Advance', 'Type S'],
      'RDX': ['Base', 'Technology', 'Advance', 'A-Spec'],
      'TLX': ['Base', 'Technology', 'Advance', 'Type S'],
      'NSX': ['Base', 'Type S'],
    },
    'BMW': {
      '3 Series': ['330i', '330e', 'M340i', 'M3'],
      '5 Series': ['530i', '540i', '550e', 'M5'],
      '7 Series': ['740i', '760i', 'M760i'],
      'X3': ['sDrive30i', 'xDrive30i', 'xDrive30e', 'M40i'],
      'X5': ['sDrive40i', 'xDrive40i', 'xDrive50e', 'M50i'],
      'X7': ['xDrive40i', 'xDrive50i', 'M60i'],
    },
    'Buick': {
      'Enclave': ['Preferred', 'Essence', 'Avenir'],
      'Encore': ['Preferred', 'Sport Touring', 'Essence'],
      'Encore GX': ['Preferred', 'Sport Touring', 'Essence'],
      'Envision': ['Preferred', 'Essence', 'Avenir'],
    },
    'Cadillac': {
      'CT4': ['Luxury', 'Premium Luxury', 'V-Series', 'Blackwing'],
      'CT5': ['Luxury', 'Premium Luxury', 'Sport', 'Blackwing'],
      'Escalade': ['Luxury', 'Premium Luxury', 'Platinum', 'Sport Platinum'],
      'XT4': ['Luxury', 'Premium Luxury', 'Sport'],
      'XT5': ['Luxury', 'Premium Luxury', 'Sport'],
      'XT6': ['Luxury', 'Premium Luxury', 'Sport'],
    },
    'Chevrolet': {
      'Blazer': ['LT', 'RS', 'Premier'],
      'Colorado': ['WT', 'LT', 'Z71', 'ZR2'],
      'Corvette': ['1LT', '2LT', '3LT', 'Z06', 'Grand Sport'],
      'Equinox': ['LS', 'LT', 'RS', 'Premier'],
      'Malibu': ['LS', 'RS', 'LT', 'Premier'],
      'Silverado 1500': ['WT', 'Custom', 'LT', 'RST', 'LTZ', 'High Country', 'ZR2'],
      'Silverado 2500HD': ['WT', 'Custom', 'LT', 'LTZ', 'High Country'],
      'Suburban': ['LS', 'LT', 'RST', 'LTZ', 'Premier', 'Z71'],
      'Tahoe': ['LS', 'LT', 'RST', 'LTZ', 'Premier', 'Z71'],
      'Trailblazer': ['LS', 'LT', 'ACTIV', 'RS'],
      'Traverse': ['LS', 'LT', 'RS', 'Premier', 'High Country'],
    },
    'Chrysler': {
      '300': ['Touring', 'Touring L', '300S', '300C'],
      'Pacifica': ['Touring', 'Touring L', 'Touring Plus', 'Limited', 'Pinnacle'],
      'Voyager': ['LX', 'LXI'],
    },
    'Dodge': {
      'Challenger': ['SXT', 'GT', 'R/T', 'Scat Pack', 'SRT Hellcat', 'Demon'],
      'Charger': ['SXT', 'GT', 'R/T', 'Scat Pack', 'SRT Hellcat'],
      'Durango': ['SXT', 'GT', 'Citadel', 'R/T', 'SRT 392'],
      'Journey': ['SE', 'SXT', 'Crossroad', 'GT'],
    },
    'Ford': {
      'Bronco': ['Base', 'Big Bend', 'Black Diamond', 'Outer Banks', 'Badlands', 'Wildtrak', 'Raptor'],
      'Edge': ['SE', 'SEL', 'ST', 'Titanium'],
      'Escape': ['S', 'SE', 'SEL', 'Titanium', 'ST-Line'],
      'Explorer': ['Base', 'XLT', 'ST', 'Limited', 'Platinum', 'King Ranch', 'Timberline'],
      'F-150': ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Raptor'],
      'F-250 Super Duty': ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Tremor'],
      'Maverick': ['XL', 'XLT', 'Lariat'],
      'Mustang': ['EcoBoost', 'EcoBoost Premium', 'GT', 'GT Premium', 'Mach 1', 'Shelby GT500'],
      'Ranger': ['XL', 'XLT', 'Lariat', 'Tremor'],
    },
    'GMC': {
      'Acadia': ['SLE', 'SLT', 'AT4', 'Denali'],
      'Canyon': ['Elevation', 'AT4', 'Denali'],
      'Sierra 1500': ['Regular', 'SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate'],
      'Sierra 2500HD': ['Regular', 'SLE', 'SLT', 'AT4', 'Denali'],
      'Terrain': ['SLE', 'SLT', 'AT4', 'Denali'],
      'Yukon': ['SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate'],
      'Yukon XL': ['SLE', 'SLT', 'AT4', 'Denali'],
    },
    'Honda': {
      'Accord': ['LX', 'Sport', 'EX', 'EX-L', 'Touring'],
      'CR-V': ['LX', 'Sport', 'EX', 'EX-L', 'Touring'],
      'HR-V': ['LX', 'Sport', 'EX', 'EX-L'],
      'Odyssey': ['LX', 'EX', 'EX-L', 'Sport', 'Elite'],
      'Passport': ['Sport', 'EX-L', 'TrailSport', 'Elite'],
      'Pilot': ['Sport', 'EX-L', 'TrailSport', 'Black Edition', 'Elite'],
      'Ridgeline': ['Sport', 'RTL', 'RTL-E', 'Black Edition'],
    },
    'Hyundai': {
      'Elantra': ['SE', 'SEL', 'N Line', 'Limited', 'N'],
      'Kona': ['SE', 'SEL', 'N Line', 'Limited'],
      'Palisade': ['SE', 'SEL', 'XRT', 'Limited', 'Calligraphy'],
      'Santa Cruz': ['SE', 'SEL', 'XRT', 'Limited'],
      'Santa Fe': ['SE', 'SEL', 'XRT', 'Limited', 'Calligraphy'],
      'Sonata': ['SE', 'SEL', 'N Line', 'Limited'],
      'Tucson': ['SE', 'SEL', 'N Line', 'XRT', 'Limited'],
    },
    'Jeep': {
      'Cherokee': ['Sport', 'Latitude', 'Latitude Lux', 'Altitude', 'Limited', 'Trailhawk', 'Overland'],
      'Compass': ['Sport', 'Latitude', 'Altitude', 'Limited', 'Trailhawk'],
      'Gladiator': ['Sport', 'Willys', 'Sport S', 'Altitude', 'Overland', 'Mojave', 'Rubicon'],
      'Grand Cherokee': ['Laredo', 'Altitude', 'Limited', 'Overland', 'Trailhawk', 'Summit', 'SRT'],
      'Grand Cherokee L': ['Laredo', 'Altitude', 'Limited', 'Overland', 'Summit', 'Summit Reserve'],
      'Renegade': ['Sport', 'Latitude', 'Altitude', 'Limited', 'Trailhawk'],
      'Wrangler': ['Sport', 'Sport S', 'Willys', 'Altitude', 'Sahara', 'Rubicon', '4xe', 'Rubicon 392'],
    },
    'Kia': {
      'Carnival': ['LX', 'EX', 'SX', 'SX Prestige'],
      'Forte': ['FE', 'LXS', 'GT-Line', 'GT'],
      'K5': ['LXS', 'GT-Line', 'EX', 'GT'],
      'Seltos': ['LX', 'S', 'EX', 'SX'],
      'Sorento': ['LX', 'S', 'EX', 'SX', 'SX Prestige', 'X-Line'],
      'Soul': ['LX', 'S', 'GT-Line', 'Turbo'],
      'Sportage': ['LX', 'EX', 'SX Prestige', 'X-Pro'],
      'Telluride': ['LX', 'S', 'EX', 'SX', 'SX-Prestige', 'X-Pro'],
    },
    'Land Rover': {
      'Defender': ['90 S', '90 SE', '110 S', '110 SE', '110 HSE', '110 X'],
      'Discovery': ['S', 'SE', 'R-Dynamic SE', 'HSE', 'R-Dynamic HSE'],
      'Discovery Sport': ['S', 'SE', 'R-Dynamic SE', 'HSE', 'R-Dynamic HSE'],
      'Range Rover': ['SE', 'HSE', 'Autobiography', 'SV'],
      'Range Rover Sport': ['SE', 'HSE', 'Dynamic SE', 'Dynamic HSE', 'Autobiography'],
      'Range Rover Velar': ['S', 'SE', 'R-Dynamic SE', 'HSE', 'R-Dynamic HSE'],
    },
    'Lexus': {
      'ES': ['ES 250', 'ES 300h', 'ES 350', 'F Sport'],
      'GX': ['460 Base', '460 Premium', '460 Luxury'],
      'IS': ['IS 300', 'IS 350', 'IS 500', 'F Sport'],
      'LX': ['LX 600 Base', 'LX 600 Premium', 'LX 600 Luxury', 'F Sport'],
      'NX': ['NX 250', 'NX 350', 'NX 350h', 'NX 450h+', 'F Sport'],
      'RX': ['RX 350', 'RX 350h', 'RX 500h', 'F Sport'],
    },
    'Lincoln': {
      'Aviator': ['Standard', 'Reserve', 'Grand Touring', 'Black Label'],
      'Corsair': ['Standard', 'Reserve', 'Grand Touring', 'Black Label'],
      'Nautilus': ['Standard', 'Reserve', 'Black Label'],
      'Navigator': ['Standard', 'Reserve', 'Black Label'],
    },
    'Mazda': {
      'CX-30': ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Premium', 'Turbo'],
      'CX-5': ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Premium', 'Turbo'],
      'CX-9': ['Sport', 'Touring', 'Grand Touring', 'Carbon Edition', 'Signature'],
      'Mazda3': ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Premium', 'Turbo'],
      'MX-5 Miata': ['Sport', 'Club', 'Grand Touring'],
    },
    'Mercedes-Benz': {
      'C-Class': ['C 300', 'C 300 4MATIC', 'AMG C 43', 'AMG C 63'],
      'E-Class': ['E 350', 'E 450', 'E 450 4MATIC', 'AMG E 53'],
      'GLC': ['GLC 300', 'GLC 300 4MATIC', 'AMG GLC 43', 'AMG GLC 63'],
      'GLE': ['GLE 350', 'GLE 450', 'GLE 580', 'AMG GLE 53', 'AMG GLE 63 S'],
      'S-Class': ['S 500', 'S 580', 'S 680', 'AMG S 63'],
      'Sprinter': ['1500', '2500', '3500'],
    },
    'Mitsubishi': {
      'Eclipse Cross': ['ES', 'LE', 'SE', 'SEL'],
      'Outlander': ['ES', 'LE', 'SE', 'SEL', 'PHEV'],
      'Outlander Sport': ['ES', 'LE', 'BE', 'SE', 'SEL'],
    },
    'Nissan': {
      'Altima': ['S', 'SR', 'SV', 'SL', 'Platinum'],
      'Armada': ['S', 'SV', 'SL', 'Platinum'],
      'Frontier': ['S', 'SV', 'Pro-4X', 'PRO-X', 'SL'],
      'Murano': ['S', 'SV', 'SL', 'Platinum'],
      'Pathfinder': ['S', 'SV', 'SL', 'Platinum', 'Rock Creek'],
      'Rogue': ['S', 'SV', 'SL', 'Platinum'],
      'Sentra': ['S', 'SR', 'SV'],
      'Titan': ['S', 'SV', 'Pro-4X', 'SL', 'Platinum Reserve'],
      'Versa': ['S', 'SR', 'SV'],
    },
    'Porsche': {
      '911': ['Carrera', 'Carrera S', 'Carrera 4', 'Carrera 4S', 'Targa', 'GT3', 'Turbo S'],
      'Cayenne': ['Base', 'S', 'GTS', 'Turbo', 'Turbo GT'],
      'Macan': ['Base', 'S', 'GTS'],
      'Panamera': ['Base', '4', 'S', '4S', 'GTS', 'Turbo', 'Turbo S'],
    },
    'Ram': {
      '1500': ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Rebel', 'Laramie Longhorn', 'Limited', 'TRX'],
      '2500': ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Power Wagon', 'Laramie Longhorn', 'Limited'],
      '3500': ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Laramie Longhorn', 'Limited'],
      'ProMaster': ['1500 Low Roof', '2500 Low Roof', '2500 High Roof', '3500 High Roof'],
    },
    'Subaru': {
      'Ascent': ['Base', 'Premium', 'Limited', 'Touring'],
      'Crosstrek': ['Base', 'Premium', 'Sport', 'Limited'],
      'Forester': ['Base', 'Premium', 'Sport', 'Limited', 'Touring'],
      'Impreza': ['Base', 'Premium', 'Sport', 'Limited'],
      'Legacy': ['Base', 'Premium', 'Sport', 'Limited', 'Touring XT'],
      'Outback': ['Base', 'Premium', 'Onyx Edition', 'Sport', 'Limited', 'Touring XT', 'Wilderness'],
      'WRX': ['Base', 'Premium', 'Sport', 'Limited', 'GT'],
    },
    'Tesla': {
      'Model 3': ['Standard Range', 'Long Range', 'Performance'],
      'Model S': ['Long Range', 'Plaid'],
      'Model X': ['Long Range', 'Plaid'],
      'Model Y': ['Standard Range', 'Long Range', 'Performance'],
      'Cybertruck': ['Standard', 'All-Wheel Drive', 'Cyberbeast'],
    },
    'Toyota': {
      '4Runner': ['SR5', 'TRD Sport', 'TRD Off-Road', 'Limited', 'TRD Pro', 'Venture'],
      'Camry': ['LE', 'SE', 'XSE', 'XLE', 'TRD', 'Nightshade'],
      'Corolla': ['L', 'LE', 'SE', 'XLE', 'XSE', 'Hatchback'],
      'FJ Cruiser': ['Base'],
      'Highlander': ['LE', 'XLE', 'XSE', 'Limited', 'Platinum'],
      'Land Cruiser': ['Base', 'Heritage Edition', '1958'],
      'RAV4': ['LE', 'XLE', 'XLE Premium', 'Adventure', 'TRD Off-Road', 'Limited', 'Prime SE', 'Prime XSE'],
      'Sequoia': ['SR5', 'TRD Sport', 'Limited', 'Platinum', 'TRD Pro', 'Capstone'],
      'Sienna': ['LE', 'XSE', 'XLE', 'Limited', 'Platinum'],
      'Tacoma': ['SR', 'SR5', 'TRD Sport', 'TRD Off-Road', 'Limited', 'TRD Pro', 'Trailhunter'],
      'Tundra': ['SR', 'SR5', 'Limited', 'Platinum', '1794 Edition', 'Capstone', 'TRD Pro'],
    },
    'Volkswagen': {
      'Atlas': ['S', 'SE', 'SE with Technology', 'SEL', 'SEL Premium'],
      'Atlas Cross Sport': ['S', 'SE', 'SE with Technology', 'SEL', 'SEL Premium'],
      'Golf GTI': ['S', 'SE', 'Autobahn'],
      'Jetta': ['S', 'Sport', 'SE', 'SEL', 'GLI'],
      'Passat': ['S', 'SE', 'SEL'],
      'Taos': ['S', 'SE', 'SEL'],
      'Tiguan': ['S', 'SE', 'SE R-Line Black', 'SEL', 'SEL R-Line Black', 'SEL Premium'],
    },
    'Volvo': {
      'S60': ['B5 Momentum', 'B5 R-Design', 'B6 R-Design', 'Recharge T8'],
      'S90': ['B6 Momentum', 'B6 R-Design', 'Inscription', 'Recharge T8'],
      'XC40': ['Momentum', 'R-Design', 'Inscription', 'Recharge'],
      'XC60': ['Momentum', 'R-Design', 'Inscription', 'Recharge T8'],
      'XC90': ['Momentum', 'R-Design', 'Inscription', 'Recharge T8'],
    },
  };

  // Vintage / older makes with limited years
  const vintageMakes: Record<string, { startYear: number; endYear: number; models: Record<string, string[]> }> = {
    'Datsun': {
      startYear: 1990, endYear: 1986, // effectively only old cars
      models: {
        '210': ['Base'],
        '280Z': ['Base'],
        '310': ['Base'],
        '510': ['Base'],
        '720': ['Standard', 'Deluxe', 'King Cab'],
      },
    },
    'Oldsmobile': {
      startYear: 1990, endYear: 2004,
      models: {
        'Alero': ['GL', 'GLS', 'GX'],
        'Aurora': ['Base'],
        'Bravada': ['Base'],
        'Cutlass': ['GL', 'GLS'],
        'Intrigue': ['GL', 'GLS', 'GX'],
        'Silhouette': ['GL', 'GLS'],
      },
    },
    'Pontiac': {
      startYear: 1990, endYear: 2010,
      models: {
        'Aztek': ['Base', 'GT', 'GTX'],
        'Bonneville': ['SE', 'SLE', 'SSEi'],
        'Firebird': ['Base', 'Formula', 'Trans Am'],
        'G6': ['Base', 'GT', 'GTP'],
        'GTO': ['Base'],
        'Grand Am': ['SE', 'GT'],
        'Grand Prix': ['GT', 'GTP', 'GXP'],
        'Montana': ['Base', 'Luxury'],
        'Solstice': ['Base', 'GXP'],
        'Vibe': ['Base', 'GT'],
      },
    },
    'Saturn': {
      startYear: 1991, endYear: 2010,
      models: {
        'Aura': ['XE', 'XR'],
        'Ion': ['1', '2', '3'],
        'Outlook': ['XE', 'XR'],
        'Sky': ['Base', 'Red Line'],
        'SL': ['SL', 'SL1', 'SL2'],
        'Vue': ['Base', 'V6'],
      },
    },
    'Plymouth': {
      startYear: 1990, endYear: 2001,
      models: {
        'Breeze': ['Base'],
        'Grand Voyager': ['SE', 'LE'],
        'Neon': ['Highline', 'Expresso', 'Sport'],
        'Prowler': ['Base'],
        'Voyager': ['Base', 'SE', 'LE'],
      },
    },
    'Mercury': {
      startYear: 1990, endYear: 2011,
      models: {
        'Grand Marquis': ['GS', 'LS'],
        'Mariner': ['Convenience', 'Premier'],
        'Milan': ['I4', 'V6', 'Premier'],
        'Monterey': ['Convenience', 'Premier', 'Luxury'],
        'Mountaineer': ['Base', 'Convenience', 'Premier'],
        'Mystique': ['GS', 'LS'],
        'Sable': ['GS', 'LS'],
        'Tracer': ['Base', 'LS'],
        'Villager': ['GS', 'Estate'],
      },
    },
    'Isuzu': {
      startYear: 1990, endYear: 2008,
      models: {
        'Amigo': ['S', 'XS'],
        'Ascender': ['S', 'LS'],
        'Axiom': ['S', 'XS'],
        'i-280': ['Standard'],
        'i-350': ['Standard'],
        'Rodeo': ['S', 'LS', 'LSE'],
        'Trooper': ['S', 'LS'],
        'VehiCROSS': ['Base'],
      },
    },
    'Saab': {
      startYear: 1990, endYear: 2011,
      models: {
        '9-3': ['Linear', 'Arc', 'Vector', 'Aero'],
        '9-5': ['Linear', 'Arc', 'Vector', 'Aero'],
        '9-7X': ['Linear', 'Arc', 'Aero'],
      },
    },
    'Hummer': {
      startYear: 1992, endYear: 2010,
      models: {
        'H1': ['Open Top', 'Wagon', 'Hard Top', 'Alpha'],
        'H2': ['Base', 'SUT'],
        'H3': ['Base', 'Adventure', 'Luxury', 'Alpha'],
        'H3T': ['Base', 'Adventure', 'Alpha'],
      },
    },
    'Scion': {
      startYear: 2003, endYear: 2016,
      models: {
        'FR-S': ['Base', 'Series 1.0', 'Series 2.0'],
        'iA': ['Base'],
        'iM': ['Base'],
        'iQ': ['Base'],
        'tC': ['Base', 'RS'],
        'xA': ['Base'],
        'xB': ['Base', 'RS'],
        'xD': ['Base', 'RS'],
      },
    },
  };

  for (const year of years) {
    data[year] = {};
    // Add mainstream makes for all years
    for (const [make, models] of Object.entries(makes)) {
      // Tesla only from 2008+
      if (make === 'Tesla' && year < 2008) continue;
      // Cybertruck only from 2023+
      if (make === 'Tesla' && year < 2023) {
        const { Cybertruck: _ct, ...rest } = models as Record<string, string[]>;
        data[year][make] = rest;
        continue;
      }
      // FJ Cruiser only 2006-2014
      if (make === 'Toyota') {
        const filtered: Record<string, string[]> = {};
        for (const [model, trims] of Object.entries(models)) {
          if (model === 'FJ Cruiser' && (year < 2006 || year > 2014)) continue;
          filtered[model] = trims;
        }
        data[year][make] = filtered;
        continue;
      }
      data[year][make] = models;
    }
    // Add vintage makes with year ranges
    for (const [make, info] of Object.entries(vintageMakes)) {
      if (year >= info.startYear && year <= info.endYear) {
        data[year][make] = info.models;
      }
    }
  }

  return data;
}

const VEHICLE_DB = buildVehicleDB();

function getYears(): number[] {
  return Object.keys(VEHICLE_DB).map(Number).sort((a, b) => b - a);
}
function getMakes(year: number): string[] {
  return Object.keys(VEHICLE_DB[year] ?? {}).sort();
}
function getModels(year: number, make: string): string[] {
  return Object.keys(VEHICLE_DB[year]?.[make] ?? {}).sort();
}
function getTrims(year: number, make: string, model: string): string[] {
  return VEHICLE_DB[year]?.[make]?.[model] ?? [];
}
function vehicleString(f: FormData): string {
  const parts = [f.vehicleYear, f.vehicleMake, f.vehicleModel, f.vehicleTrim].filter(Boolean);
  return parts.join(' ');
}

// ── VEHICLE SELECTOR COMPONENT ───────────────────────────────────────────────
function VehicleSelector({ form, setForm }: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
}) {
  const years = getYears();
  const makes = form.vehicleYear ? getMakes(Number(form.vehicleYear)) : [];
  const models = form.vehicleYear && form.vehicleMake ? getModels(Number(form.vehicleYear), form.vehicleMake) : [];
  const trims = form.vehicleYear && form.vehicleMake && form.vehicleModel
    ? getTrims(Number(form.vehicleYear), form.vehicleMake, form.vehicleModel)
    : [];

  const selectClass = 'w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed';

  return (
    <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Year</label>
        <select
          className={selectClass}
          value={form.vehicleYear}
          onChange={e => setForm(p => ({ ...p, vehicleYear: e.target.value, vehicleMake: '', vehicleModel: '', vehicleTrim: '' }))}
        >
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Make</label>
        <select
          className={selectClass}
          value={form.vehicleMake}
          disabled={!form.vehicleYear}
          onChange={e => setForm(p => ({ ...p, vehicleMake: e.target.value, vehicleModel: '', vehicleTrim: '' }))}
        >
          <option value="">Make</option>
          {makes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Model</label>
        <select
          className={selectClass}
          value={form.vehicleModel}
          disabled={!form.vehicleMake}
          onChange={e => setForm(p => ({ ...p, vehicleModel: e.target.value, vehicleTrim: '' }))}
        >
          <option value="">Model</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Trim</label>
        <select
          className={selectClass}
          value={form.vehicleTrim}
          disabled={!form.vehicleModel || trims.length === 0}
          onChange={e => setForm(p => ({ ...p, vehicleTrim: e.target.value }))}
        >
          <option value="">Trim</option>
          {trims.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

function loadEmailJS(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).emailjs) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = () => {
      (window as any).emailjs.init(EMAILJS_PUBLIC_KEY);
      resolve();
    };
    document.head.appendChild(script);
  });
}

async function sendEmail(booking: Booking) {
  await loadEmailJS();
  const svc = SERVICES.find(s => s.id === booking.service);
  const dateStr = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  await (window as any).emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_name: `${booking.fname} ${booking.lname}`,
    to_email: booking.email,
    owner_email: 'gidgarageaz@hotmail.com',
    service_name: svc?.name,
    appointment_date: dateStr,
    appointment_time: booking.time,
    vehicle: booking.vehicle,
    phone: booking.phone,
    notes: booking.notes || 'None',
    booking_id: booking.id,
  });
}

function getLocalBookings(): Booking[] {
  try { return JSON.parse(localStorage.getItem('gg_bookings') || '[]'); } catch { return []; }
}
function saveLocalBooking(b: Booking) {
  const all = getLocalBookings();
  localStorage.setItem('gg_bookings', JSON.stringify([...all, b]));
}
function updateLocalBooking(id: string, status: Booking['status']) {
  const all = getLocalBookings().map(b => b.id === id ? { ...b, status } : b);
  localStorage.setItem('gg_bookings', JSON.stringify(all));
}

// ── BOOKING WIDGET ──────────────────────────────────────────────────────────
interface State {
  step: number; service: string | null; date: string | null;
  time: string | null; calYear: number; calMonth: number;
  suspensionPart: string | null; brakeService: string | null;
}
const INIT_STATE: State = {
  step: 1, service: null, date: null, time: null,
  calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
  suspensionPart: null, brakeService: null,
};
const INIT_FORM: FormData = { fname: '', lname: '', phone: '', email: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleTrim: '', notes: '' };

export default function BookingWidget({ autoOpen, preselectedService, onClose }: { autoOpen?: boolean; preselectedService?: string; onClose?: () => void } = {}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [s, setS] = useState<State>({
    ...INIT_STATE,
    service: preselectedService || INIT_STATE.service,
    step: preselectedService ? 2 : INIT_STATE.step,
  });
  const [form, setForm] = useState<FormData>(INIT_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());

  const svc = SERVICES.find(x => x.id === s.service);

  useEffect(() => {
    if (!s.date) return;
    getBookedTimesForDate(s.date).then(setBookedTimes);
  }, [s.date]);

  function parseSlotHour(t: string) {
    const [time, meridiem] = t.split(' ');
    const h = parseInt(time.split(':')[0]);
    if (meridiem === 'PM' && h !== 12) return h + 12;
    if (meridiem === 'AM' && h === 12) return 0;
    return h;
  }

  async function isAvailable(y: number, m: number, d: number): Promise<boolean> {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(y, m, d) < today) return false;
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
    const k = dateKey(y, m, d);
    const takenTimes = await getBookedTimesForDate(k);
    const availableSlots = TIME_SLOTS.filter(t => {
      if (takenTimes.includes(t)) return false;
      if (isToday && parseSlotHour(t) <= now.getHours()) return false;
      return true;
    });
    return availableSlots.length > 0;
  }

  // Sync-friendly availability check using cached bookedTimes for calendar render
  function isAvailableSync(y: number, m: number, d: number): boolean {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(y, m, d) < today) return false;
    const k = dateKey(y, m, d);
    if (unavailableDates.has(k)) return false;
    return true;
  }

  // Prefetch unavailable dates for current month
  useEffect(() => {
    const year = s.calYear;
    const month = s.calMonth;
    const days = new Date(year, month + 1, 0).getDate();
    const checks = Array.from({ length: days }, (_, i) => i + 1).map(async d => {
      const avail = await isAvailable(year, month, d);
      if (!avail) return dateKey(year, month, d);
      return null;
    });
    Promise.all(checks).then(results => {
      setUnavailableDates(new Set(results.filter(Boolean) as string[]));
    });
  }, [s.calYear, s.calMonth]);

  function selectService(id: string) { setS(p => ({ ...p, service: id, step: Math.max(p.step, 2) })); }
  function selectDate(k: string) { setS(p => ({ ...p, date: k, time: null, step: Math.max(p.step, 3) })); }
  function selectTime(t: string) { setS(p => ({ ...p, time: t, step: Math.max(p.step, 4) })); }
  function prevMonth() { setS(p => p.calMonth === 0 ? { ...p, calMonth: 11, calYear: p.calYear - 1 } : { ...p, calMonth: p.calMonth - 1 }); }
  function nextMonth() { setS(p => p.calMonth === 11 ? { ...p, calMonth: 0, calYear: p.calYear + 1 } : { ...p, calMonth: p.calMonth + 1 }); }

  async function handleSubmit() {
    if (!form.fname || !form.phone || !form.vehicleYear || !form.vehicleMake || !form.vehicleModel) {
      alert('Please fill in your name, phone, and vehicle info.');
      return;
    }
    if (!s.service || !s.date || !s.time || !svc) return;
    setSubmitting(true);
    const booking: Booking = {
      id: `GG-${Date.now()}`,
      service: s.service, serviceIcon: svc.icon,
      date: s.date, time: s.time,
      fname: form.fname, lname: form.lname, phone: form.phone, email: form.email,
      vehicle: vehicleString(form),
      notes: [
        s.suspensionPart ? `Suspension part: ${s.suspensionPart.replace(/_/g, ' ')}` : '',
        s.brakeService ? `Brake service: ${s.brakeService.replace(/_/g, ' ')}` : '',
        form.notes,
      ].filter(Boolean).join(' | '),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    // Save to both Supabase (primary) and localStorage (fallback)
    saveLocalBooking(booking);
    try { await insertSupabaseBooking(booking); } catch (e) { console.warn('Supabase insert failed', e); }
    try { await sendEmail(booking); } catch (e) { console.warn('Email send failed', e); }
    setSubmitting(false);
    setSubmitted(true);
  }

  function reset() { setS(INIT_STATE); setForm(INIT_FORM); setSubmitted(false); }
  function closeModal() { setOpen(false); onClose?.(); }

  const firstDay = new Date(s.calYear, s.calMonth, 1).getDay();
  const daysInMonth = new Date(s.calYear, s.calMonth + 1, 0).getDate();
  const dateStr = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  return (
    <>
      {!autoOpen && (
        <button onClick={() => setOpen(true)} className="btn-primary text-xs px-8 py-4">
          Book Now
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 overflow-y-auto flex items-start justify-center p-4 md:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-dark w-full max-w-2xl relative p-8 md:p-10 my-4">
            <button onClick={closeModal} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center text-lg transition-colors" aria-label="Close">✕</button>

            {submitted ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-3xl font-black text-white mb-3">You're Booked!</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Your <span className="text-red-500 font-bold">{svc?.name}</span> appointment is confirmed for<br />
                  <span className="text-red-500 font-bold">{dateStr} at {s.time}</span>.<br /><br />
                  A confirmation has been sent to {form.email || 'your email'}.
                </p>
                <p className="text-gray-600 text-xs mt-4">Questions? Call <a href={`tel:${PHONE.replace(/-/g,'')}`} className="text-red-600 font-bold">{PHONE}</a></p>
                <button onClick={reset} className="mt-6 border border-red-600 text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 transition-colors">Book Another</button>
              </div>
            ) : (
              <>
                <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Schedule Online</p>
                <h2 className="text-3xl font-black text-white tracking-tight mb-6">Book Your Appointment</h2>

                <div className="flex gap-1 mb-8">
                  {[1,2,3,4].map(n => <div key={n} className={`h-0.5 flex-1 transition-colors duration-300 ${n <= s.step ? 'bg-red-600' : 'bg-gray-800'}`} />)}
                </div>

                <StepHeader n={1} current={s.step} label="Select a Service" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-2">
                  {SERVICES.map(sv => (
                    <button key={sv.id} onClick={() => selectService(sv.id)}
                      className={`text-left p-3.5 border transition-all ${s.service === sv.id ? 'border-l-4 border-red-600 bg-red-950/30' : 'border-gray-800 bg-gray-900 hover:border-red-600'}`}>
                      <div className="text-xl mb-2">{sv.icon}</div>
                      <div className="text-white text-sm font-bold mb-0.5">{sv.name}</div>
                      <div className="text-gray-500 text-xs leading-snug">{sv.desc}</div>
                      <div className="text-red-500 text-xs font-bold mt-1">{sv.startingAt ? `Starting at ${sv.startingAt}` : sv.duration}</div>
                      {sv.startingAt && <div className="text-gray-600 text-xs">{sv.duration}</div>}
                    </button>
                  ))}
                </div>

                {s.service === 'suspension' && (
                  <div className="mt-3">
                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What are you looking to replace?</label>
                    <select value={s.suspensionPart ?? ''} onChange={e => setS(p => ({ ...p, suspensionPart: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                      <option value="">Select a part...</option>
                      <option value="shocks">Shocks</option>
                      <option value="struts">Struts</option>
                      <option value="control_arms">Control Arms</option>
                      <option value="tie_rods">Tie Rods</option>
                      <option value="cv_axles">CV Axles</option>
                    </select>
                    <p className="text-gray-600 text-xs mt-1">Pricing varies per vehicle — get a free estimate when you book!</p>
                  </div>
                )}

                {s.service === 'brakes' && (
                  <div className="mt-3">
                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What brake service do you need?</label>
                    <select value={s.brakeService ?? ''} onChange={e => setS(p => ({ ...p, brakeService: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                      <option value="">Select a service...</option>
                      <option value="pads">Brake Pads Only — Starting at $139.99</option>
                      <option value="pads_rotors">Brake Pads + Rotors — Starting at $549.99</option>
                      <option value="full">Full Service: Pads + Rotors + Fluid Flush &amp; Inspection — Starting at $649.99</option>
                    </select>
                    <p className="text-gray-600 text-xs mt-1">Pricing varies per vehicle — get a free estimate when you book!</p>
                  </div>
                )}

                {s.service === 'oil' && (
                  <p className="text-gray-600 text-xs mt-2">*Mobile service fee included. Price may vary by vehicle. Full synthetic only.</p>
                )}

                {s.step >= 2 && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <StepHeader n={2} current={s.step} label="Choose a Date" />
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="w-7 h-7 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
                    <span className="text-white text-sm font-black uppercase tracking-wider">{MONTHS[s.calMonth]} {s.calYear}</span>
                    <button onClick={nextMonth} className="w-7 h-7 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {DAY_LABELS.map(d => <div key={d} className="text-center text-gray-600 text-xs font-bold uppercase py-1">{d}</div>)}
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const k = dateKey(s.calYear, s.calMonth, d);
                      const avail = isAvailableSync(s.calYear, s.calMonth, d);
                      const sel = s.date === k;
                      return (
                        <button key={d} disabled={!avail} onClick={() => selectDate(k)}
                          className={`text-xs font-bold py-2 transition-all ${sel ? 'bg-red-600 text-white border border-red-600' : avail ? 'bg-gray-900 text-white border border-gray-800 hover:border-red-600' : 'text-gray-700 cursor-default'}`}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </>)}

                {s.step >= 3 && s.date && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <StepHeader n={3} current={s.step} label="Pick a Time" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                    {TIME_SLOTS.filter(t => {
                      const now = new Date();
                      const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
                      if (s.date !== todayKey) return true;
                      return parseSlotHour(t) > now.getHours();
                    }).map(t => {
                      const isTaken = bookedTimes.includes(t);
                      return (
                        <button key={t} disabled={isTaken} onClick={() => selectTime(t)}
                          className={`text-xs font-bold py-2.5 border transition-all ${s.time === t ? 'bg-red-600 border-red-600 text-white' : isTaken ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-default' : 'bg-gray-900 border-gray-800 text-white hover:border-red-600'}`}>
                          {isTaken ? '—' : t}
                        </button>
                      );
                    })}
                  </div>
                </>)}

                {s.step >= 4 && s.time && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <StepHeader n={4} current={s.step} label="Your Details" />
                  <div className="border-l-4 border-red-600 bg-gray-900 px-4 py-3 mb-5 grid grid-cols-2 gap-x-6 gap-y-1">
                    {[['Service', `${svc?.icon} ${svc?.name}`], ['Date', dateStr], ['Time', s.time], ['Duration', svc?.duration ?? '']].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">{k}</span>
                        <span className="text-white text-xs font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'fname', label: 'First Name', placeholder: 'John', type: 'text', full: false },
                      { id: 'lname', label: 'Last Name', placeholder: 'Smith', type: 'text', full: false },
                      { id: 'phone', label: 'Phone', placeholder: '480-555-0100', type: 'tel', full: false },
                      { id: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email', full: false },
                    ].map(f => (
                      <div key={f.id} className={f.full ? 'col-span-2' : ''}>
                        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder}
                          value={form[f.id as keyof FormData] as string}
                          onChange={e => setForm(p => ({ ...p, [f.id]: e.target.value }))}
                          className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors" />
                      </div>
                    ))}
                    <VehicleSelector form={form} setForm={setForm} />
                    <div className="col-span-2">
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Notes (optional)</label>
                      <textarea placeholder="Any additional details..." value={form.notes}
                        onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors resize-y" />
                    </div>
                  </div>
                  <button onClick={handleSubmit} disabled={submitting}
                    className={`btn-primary w-full mt-4 py-4 text-sm ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {submitting ? 'Confirming...' : 'Confirm Appointment'}
                  </button>
                </>)}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StepHeader({ n, current, label }: { n: number; current: number; label: string }) {
  const done = n < current;
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-6 h-6 flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${done ? 'bg-green-600' : n === current ? 'bg-red-600' : 'bg-gray-800'}`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-xs font-bold uppercase tracking-widest ${done || n === current ? 'text-white' : 'text-gray-600'}`}>{label}</span>
    </div>
  );
}

// ── ADMIN PASSWORD GATE ─────────────────────────────────────────────────────
function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  function handleKey(digit: string) {
    if (input.length >= 4) return;
    const next = input + digit;
    setInput(next);
    setError(false);
    if (next.length === 4) {
      if (next === ADMIN_PASSWORD) {
        sessionStorage.setItem('gg_admin_auth', '1');
        onUnlock();
      } else {
        setTimeout(() => { setInput(''); setError(true); }, 300);
      }
    }
  }

  function handleBackspace() { setInput(p => p.slice(0, -1)); setError(false); }

  const digits = ['1','2','3','4','5','6','7','8','9','0'];

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-xs text-center">
        <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-2">Admin Access</p>
        <h1 className="text-3xl font-black text-white mb-8">Enter PIN</h1>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < input.length
                ? error ? 'bg-red-600 border-red-600' : 'bg-red-600 border-red-600'
                : 'bg-transparent border-gray-600'
            }`} />
          ))}
        </div>

        {error && <p className="text-red-500 text-xs font-bold uppercase tracking-wider mb-4">Incorrect PIN</p>}

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-3">
          {digits.slice(0, 9).map(d => (
            <button key={d} onClick={() => handleKey(d)}
              className="h-14 bg-gray-900 border border-gray-700 text-white text-xl font-bold hover:border-red-600 hover:bg-gray-800 active:bg-gray-700 transition-colors">
              {d}
            </button>
          ))}
          <div /> {/* empty cell */}
          <button onClick={() => handleKey('0')}
            className="h-14 bg-gray-900 border border-gray-700 text-white text-xl font-bold hover:border-red-600 hover:bg-gray-800 active:bg-gray-700 transition-colors">
            0
          </button>
          <button onClick={handleBackspace}
            className="h-14 bg-gray-900 border border-gray-700 text-gray-400 text-xl font-bold hover:border-red-600 hover:text-white active:bg-gray-700 transition-colors">
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ADMIN SCHEDULE VIEW ─────────────────────────────────────────────────────
export function AdminSchedule() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('gg_admin_auth') === '1');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calDate, setCalDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    getSupabaseBookings().then(data => { setBookings(data); setLoading(false); });
  }, [unlocked]);

  // Poll every 30s for new bookings
  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(() => {
      getSupabaseBookings().then(setBookings);
    }, 30000);
    return () => clearInterval(interval);
  }, [unlocked]);

  if (!unlocked) return <AdminPasswordGate onUnlock={() => setUnlocked(true)} />;

  async function updateStatus(id: string, status: Booking['status']) {
    updateLocalBooking(id, status);
    try { await updateSupabaseBooking(id, status); } catch (e) { console.warn('Supabase update failed', e); }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  }

  const filtered = bookings
    .filter(b => filter === 'all' || b.status === filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const total = bookings.length;

  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  function bookingsForDay(d: number) {
    const k = dateKey(calYear, calMonth, d);
    return bookings.filter(b => b.date === k && b.status !== 'cancelled');
  }

  return (
    <div className="min-h-screen bg-dark py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin</p>
            <h1 className="text-4xl font-black text-white tracking-tight">Schedule</h1>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={() => getSupabaseBookings().then(setBookings)}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">
              ↻ Refresh
            </button>
            <button onClick={() => { sessionStorage.removeItem('gg_admin_auth'); setUnlocked(false); }}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">
              Lock
            </button>
            <a href="/" className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">← Site</a>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[['Upcoming', upcoming, 'text-red-500'], ['Completed', completed, 'text-green-500'], ['Total', total, 'text-white']].map(([label, val, cls]) => (
            <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
              <div className={`text-3xl font-black ${cls} mb-1`}>{val}</div>
              <div className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-2">
            {(['all','confirmed','completed','cancelled'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${filter === f ? 'bg-red-600 border-red-600 text-white' : 'border-gray-700 text-gray-400 hover:border-red-600 hover:text-white'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['list','calendar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${view === v ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-600 font-bold uppercase tracking-wider text-sm">Loading bookings...</div>}

        {!loading && view === 'calendar' && (
          <div className="bg-gray-900 border border-gray-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
              <span className="text-white font-black uppercase tracking-wider">{MONTHS[calMonth]} {calYear}</span>
              <button onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map(d => <div key={d} className="text-center text-gray-600 text-xs font-bold uppercase py-2">{d}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dayBookings = bookingsForDay(d);
                const k = dateKey(calYear, calMonth, d);
                const isToday = k === today;
                return (
                  <div key={d} className={`min-h-[60px] p-1.5 border text-xs ${isToday ? 'border-red-600' : 'border-gray-800'} bg-gray-900`}>
                    <div className={`font-bold mb-1 ${isToday ? 'text-red-500' : 'text-gray-400'}`}>{d}</div>
                    {dayBookings.slice(0, 2).map(b => (
                      <div key={b.id} className="bg-red-900/50 text-red-300 text-[10px] px-1 py-0.5 mb-0.5 truncate">{b.time} {b.fname}</div>
                    ))}
                    {dayBookings.length > 2 && <div className="text-gray-500 text-[10px]">+{dayBookings.length - 2} more</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && view === 'list' && (
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-600 font-bold uppercase tracking-wider text-sm">No appointments found</div>
            )}
            {filtered.map(b => {
              const svcInfo = SERVICES.find(s => s.id === b.service);
              const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isPast = b.date < today;
              return (
                <div key={b.id} className={`bg-gray-900 border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${b.status === 'cancelled' ? 'border-gray-800 opacity-50' : b.status === 'completed' ? 'border-green-900' : isPast ? 'border-yellow-900/50' : 'border-gray-800 border-l-4 border-l-red-600'}`}>
                  <div className="flex items-start gap-4">
                    <div className="text-2xl mt-0.5">{svcInfo?.icon ?? '🔧'}</div>
                    <div>
                      <div className="text-white font-bold text-base">{b.fname} {b.lname}</div>
                      <div className="text-gray-400 text-sm">{svcInfo?.name} · {dateStr} at {b.time}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{b.vehicle} · {b.phone}</div>
                      {b.notes && <div className="text-gray-600 text-xs mt-1 italic">"{b.notes}"</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 ${
                      b.status === 'confirmed' ? 'bg-red-900/40 text-red-400' :
                      b.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                      'bg-gray-800 text-gray-500'}`}>
                      {b.status}
                    </span>
                    {b.status === 'confirmed' && (
                      <button onClick={() => updateStatus(b.id, 'completed')}
                        className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-green-800 text-green-600 hover:bg-green-900/30 transition-colors">
                        ✓ Done
                      </button>
                    )}
                    {b.status !== 'cancelled' && (
                      <button onClick={() => { if (confirm('Cancel this appointment?')) updateStatus(b.id, 'cancelled'); }}
                        className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-500 transition-colors">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
