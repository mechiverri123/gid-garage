import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { JobsTab, BusinessHub } from './JobOps';
import { getEngines } from './engineData';
import { getTrims } from './trimData';

const PHONE = '480-757-0476';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
// Emails sent server-side via workers — BREVO_API_KEY removed from client bundle
const ADMIN_PASSWORD = '0000';
// ───────────────────────────────────────────────────────────────────────────

// ── SUPABASE HELPERS ────────────────────────────────────────────────────────
async function sbFetch(path: string, options: RequestInit = {}) {
  const isPatch = options.method === 'PATCH' || options.method === 'DELETE';
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': isPatch ? 'return=minimal' : 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  if (isPatch) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── SECURE WORKER HELPERS ────────────────────────────────────────────────────
// Admin reads/writes go through /admin-api/data (service key, behind Cloudflare
// Access). Customer reads go through /api/customer (service key, self-validating).
// The public anon key can no longer read the bookings table at all.
async function adminPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/admin-api-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function apiPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/api-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getSupabaseBookings(): Promise<Booking[]> {
  try {
    const data = (await adminPost('list-bookings') || []).filter((b: any) => b.status !== 'pending');
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
      garageNotes: b.garage_notes || '',
      status: b.status,
      createdAt: b.created_at,
      stripeCustomerId: b.stripe_customer_id || undefined,
      adminPhotos: b.admin_photos ? (typeof b.admin_photos === 'string' ? JSON.parse(b.admin_photos) : b.admin_photos) : [],
    }));
  } catch (e) {
    console.warn('Supabase fetch failed, falling back to localStorage', e);
    return getLocalBookings();
  }
}

async function insertSupabaseBooking(b: Booking): Promise<void> {
  await sbFetch('/bookings', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
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
      garage_notes: b.garageNotes || '',
      status: b.status,
      created_at: b.createdAt,
    }),
  });
}

async function updateSupabaseBooking(id: string, status: Booking['status']): Promise<void> {
  const extra = status === 'cancelled' ? { job_status: 'CANCELLED' } : {};
  await adminPost('patch-booking', { id, fields: { status, ...extra } });
}

async function updateSupabaseGarageNotes(id: string, garageNotes: string): Promise<void> {
  await adminPost('patch-booking', { id, fields: { garage_notes: garageNotes } });
}

async function deleteSupabaseBooking(id: string): Promise<void> {
  // Goes through the server-side /delete-booking Worker (uses the Supabase service key).
  // This keeps the admin delete button working after the public DELETE policy is removed.
  const res = await fetch('/admin-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? `Delete failed (${res.status})`);
  }
}

function deleteLocalBooking(id: string) {
  const all = getLocalBookings().filter(b => b.id !== id);
  localStorage.setItem('gg_bookings', JSON.stringify(all));
}

async function getBookedTimesForDate(date: string): Promise<string[]> {
  try {
    const data = await apiPost('booked-slots', { date });
    return (data || []) as string[];
  } catch {
    return getLocalBookings().filter(b => b.date === date && b.status !== 'cancelled' && b.status !== 'pending').map(b => b.time);
  }
}

// ── LOCAL STORAGE FALLBACK ──────────────────────────────────────────────────
const SERVICES = [
  { id: 'oil',        icon: '🛢️', name: 'Oil Change',   desc: 'Full synthetic only — your engine deserves it',            duration: '30 min',   startingAt: '$79.99*' },
  { id: 'brakes',     icon: '🔧', name: 'Brakes',        desc: 'Pads, rotors, full brake service',                         duration: '2 hrs',    startingAt: null },
  { id: 'diag',       icon: '💻', name: 'Diagnostics',   desc: 'Check engine & system scan',                               duration: '1 hr',     startingAt: null },
  { id: 'suspension', icon: '🚗', name: 'Suspension',    desc: 'Shocks, struts, control arms & more',                      duration: '2–3 hrs',  startingAt: null },
  { id: 'audio',      icon: '🔊', name: 'Car Audio',     desc: 'Head units, speakers, amps & full system installs',        duration: 'Varies',   startingAt: null, depositNote: true },
  { id: 'full',       icon: '✅', name: 'Full Service',  desc: 'Multi-point inspection',                                   duration: '1.5 hrs',  startingAt: null },
  { id: 'other',      icon: '💬', name: 'Something Else', desc: "Don't see your problem listed? Tell us what's going on.", duration: '',         startingAt: null, isOther: true },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Mon–Fri 1:30pm–8pm, Sat–Sun 5am–8pm — resolved at selection time
const WEEKDAY_SLOTS = ['1:30 PM','2:30 PM','3:30 PM','4:30 PM','5:30 PM','6:30 PM','7:00 PM'];
const WEEKEND_SLOTS = ['5:00 AM','6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];

function getSlotsForDate(dateStr: string): string[] {
  if (!dateStr) return WEEKDAY_SLOTS;
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return (dow === 0 || dow === 6) ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

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
  garageNotes: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  stripeCustomerId?: string;
  createdAt: string;
  adminPhotos: { key: string; url: string; name: string; note: string }[];
}

interface FormData {
  fname: string; lname: string; phone: string;
  email: string; vehicleYear: string; vehicleMake: string; vehicleModel: string; vehicleEngine: string; vehicleTrim: string; licensePlate: string; notes: string; serviceAddress: string;
}

function vehicleString(f: FormData): string {
  const parts = [f.vehicleYear, f.vehicleMake, f.vehicleModel, f.vehicleEngine, f.vehicleTrim].filter(Boolean);
  return parts.join(' ');
}

// ── VEHICLE API (NHTSA) ──────────────────────────────────────────────────────
// Uses the free NHTSA vPIC API — no key required, real data, updated regularly.
// Falls back to empty arrays on network failure so the form stays usable.

async function nhtsaGetMakes(): Promise<string[]> {
  const PRIORITY = [
    'Chevrolet', 'Ford', 'Toyota', 'Honda', 'Nissan', 'Jeep', 'Dodge', 'Ram',
    'GMC', 'Subaru', 'Hyundai', 'Kia', 'Mazda', 'Volkswagen', 'BMW', 'Mercedes-Benz',
    'Audi', 'Cadillac', 'Buick', 'Lincoln', 'Lexus', 'Acura', 'Infiniti',
    'Mitsubishi', 'Chrysler', 'Pontiac', 'Oldsmobile', 'Saturn', 'Mercury',
    'Scion', 'Isuzu', 'Suzuki', 'Hummer', 'Genesis', 'Volvo', 'Rivian', 'Tesla',
  ];
  try {
    const r = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json');
    const d = await r.json();
    const makes: string[] = (d.Results || []).map((m: any) => m.MakeName as string);
    const r2 = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/truck?format=json');
    const d2 = await r2.json();
    const truckMakes: string[] = (d2.Results || []).map((m: any) => m.MakeName as string);
    const allSet = Array.from(new Set([...makes, ...truckMakes]));
    // Find actual NHTSA casing for priority makes (case-insensitive match)
    const priorityOrdered = PRIORITY
      .map(p => allSet.find(m => m.toLowerCase() === p.toLowerCase()) ?? p)
      .filter(p => allSet.some(m => m.toLowerCase() === p.toLowerCase()));
    const rest = allSet
      .filter(m => !PRIORITY.some(p => p.toLowerCase() === m.toLowerCase()))
      .sort();
    return [...priorityOrdered, ...rest];
  } catch { return PRIORITY; }
}

async function nhtsaGetModels(make: string, year: number): Promise<string[]> {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`);
    const d = await r.json();
    return (d.Results || []).map((m: any) => m.Model_Name as string).sort();
  } catch { return []; }
}

// ── VEHICLE SELECTOR ─────────────────────────────────────────────────────────
function VehicleSelector({ form, setForm, errors, clearError }: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
  errors: Record<string, string>;
  clearError: (key: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1980 + 1 }, (_, i) => currentYear - i);

  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [trimOther, setTrimOther] = useState(false);
  const [engineOther, setEngineOther] = useState(false);

  // Derived trim + engine options from static data
  const trimOptions = (form.vehicleModel && form.vehicleYear)
    ? getTrims(form.vehicleMake, form.vehicleModel, parseInt(form.vehicleYear, 10))
    : [];
  const engineOptions = (form.vehicleModel && form.vehicleYear)
    ? getEngines(form.vehicleMake, form.vehicleModel, parseInt(form.vehicleYear, 10))
    : [];

  // Load makes on mount
  useEffect(() => {
    setLoadingMakes(true);
    nhtsaGetMakes().then(m => { setMakes(m); setLoadingMakes(false); });
  }, []);

  // Load models when make+year change
  useEffect(() => {
    if (!form.vehicleMake || !form.vehicleYear) { setModels([]); return; }
    const y = parseInt(form.vehicleYear, 10);
    setLoadingModels(true);
    nhtsaGetModels(form.vehicleMake, y).then(m => { setModels(m); setLoadingModels(false); });
  }, [form.vehicleMake, form.vehicleYear]);

  // Reset trim/engine other-mode when model changes
  useEffect(() => {
    setTrimOther(false);
    setEngineOther(false);
  }, [form.vehicleModel, form.vehicleYear, form.vehicleMake]);

  const baseSelect = 'w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors disabled:text-gray-600 disabled:cursor-not-allowed appearance-none border';
  const sc = (field: string) => baseSelect + (errors[field] ? ' border-red-500 focus:border-red-400' : ' border-gray-800 focus:border-red-600');
  const baseInput = 'w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors disabled:text-gray-600 disabled:cursor-not-allowed placeholder-gray-600 border';
  const ic = (field: string) => baseInput + (errors[field] ? ' border-red-500 focus:border-red-400' : ' border-gray-800 focus:border-red-600');

  return (
    <div className="col-span-2">
      <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${(errors.vehicleYear||errors.vehicleMake||errors.vehicleModel) ? 'text-red-500' : 'text-gray-500'}`}>Vehicle</label>
      {/* Year / Make / Model — from NHTSA API */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
        <div>
          {errors.vehicleYear && <p className="text-red-500 text-xs mb-1">{errors.vehicleYear}</p>}
          <select className={sc('vehicleYear')} value={form.vehicleYear}
            onChange={e => { setForm(p => ({ ...p, vehicleYear: e.target.value, vehicleMake: '', vehicleModel: '', vehicleEngine: '', vehicleTrim: '' })); setModels([]); setTrimOther(false); setEngineOther(false); clearError('vehicleYear'); clearError('vehicleMake'); clearError('vehicleModel'); }}>
            <option value="">Year</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div>
          {errors.vehicleMake && <p className="text-red-500 text-xs mb-1">{errors.vehicleMake}</p>}
          <select className={sc('vehicleMake')} value={form.vehicleMake} disabled={!form.vehicleYear || loadingMakes}
            onChange={e => { setForm(p => ({ ...p, vehicleMake: e.target.value, vehicleModel: '', vehicleEngine: '', vehicleTrim: '' })); setModels([]); setTrimOther(false); setEngineOther(false); clearError('vehicleMake'); clearError('vehicleModel'); }}>
            <option value="">{loadingMakes ? 'Loading…' : 'Make'}</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          {errors.vehicleModel && <p className="text-red-500 text-xs mb-1">{errors.vehicleModel}</p>}
          <select className={sc('vehicleModel')} value={form.vehicleModel} disabled={!form.vehicleMake || loadingModels}
            onChange={e => { setForm(p => ({ ...p, vehicleModel: e.target.value, vehicleEngine: '', vehicleTrim: '' })); setTrimOther(false); setEngineOther(false); clearError('vehicleModel'); }}>
            <option value="">{loadingModels ? 'Loading…' : 'Model'}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Trim + Engine — dropdown from static data, free-text fallback */}
      {form.vehicleModel && (
        <div className="grid grid-cols-2 gap-2">
          {/* Trim */}
          <div>
            {errors.vehicleTrim && <p className="text-red-500 text-xs mb-1">{errors.vehicleTrim}</p>}
            {trimOptions.length > 0 && !trimOther ? (
              <select
                className={sc('vehicleTrim')}
                value={form.vehicleTrim}
                onChange={e => {
                  if (e.target.value === '__other__') { setTrimOther(true); setForm(p => ({ ...p, vehicleTrim: '' })); }
                  else { setForm(p => ({ ...p, vehicleTrim: e.target.value })); clearError('vehicleTrim'); }
                }}>
                <option value="">Trim</option>
                {trimOptions.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="__other__">Other / not listed</option>
              </select>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Trim (e.g. LE, XLT, Sport)"
                  value={form.vehicleTrim}
                  onChange={e => { setForm(p => ({ ...p, vehicleTrim: e.target.value })); clearError('vehicleTrim'); }}
                  className={ic('vehicleTrim')}
                />
                {trimOptions.length > 0 && (
                  <button type="button" onClick={() => { setTrimOther(false); setForm(p => ({ ...p, vehicleTrim: '' })); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider">
                    ← list
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Engine */}
          <div>
            {errors.vehicleEngine && <p className="text-red-500 text-xs mb-1">{errors.vehicleEngine}</p>}
            {engineOptions.length > 0 && !engineOther ? (
              <select
                className={sc('vehicleEngine')}
                value={form.vehicleEngine}
                onChange={e => {
                  if (e.target.value === '__other__') { setEngineOther(true); setForm(p => ({ ...p, vehicleEngine: '' })); }
                  else { setForm(p => ({ ...p, vehicleEngine: e.target.value })); clearError('vehicleEngine'); }
                }}>
                <option value="">Engine</option>
                {engineOptions.map(e => <option key={e} value={e}>{e}</option>)}
                <option value="__other__">Other / not listed</option>
              </select>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Engine (e.g. 2.4L 4-cyl)"
                  value={form.vehicleEngine}
                  onChange={e => { setForm(p => ({ ...p, vehicleEngine: e.target.value })); clearError('vehicleEngine'); }}
                  className={ic('vehicleEngine')}
                />
                {engineOptions.length > 0 && (
                  <button type="button" onClick={() => { setEngineOther(false); setForm(p => ({ ...p, vehicleEngine: '' })); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider">
                    ← list
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



const AUDIO_LABELS: Record<string, string> = {
  head_unit_replacement: 'Head Unit Replacement',
  speaker_replacement: 'Speaker Replacement',
  head_unit_install: 'Head Unit Install (Customer-Supplied)',
  '4ch_amp_install': '4-Channel Amp Install',
  mono_amp_install: 'Monoblock + Subwoofer Install',
  full_system: 'Full Sound System',
};
const BRAKE_LABELS: Record<string, string> = {
  pads: 'Brake Pads Only',
  pads_rotors: 'Brake Pads + Rotors',
  full: 'Full Brake Service (Pads + Rotors + Fluid Flush)',
};
const SUSPENSION_LABELS: Record<string, string> = {
  shocks: 'Shocks',
  struts: 'Struts',
  control_arms: 'Control Arms',
  tie_rods: 'Tie Rods',
  cv_axles: 'CV Axles',
};

// ── CANCEL TOKEN ────────────────────────────────────────────────────────────
// Cancel-link tokens are now HMACs minted server-side (secret lives only in the
// worker env, never in this bundle). generateCancelToken asks the worker for one.
async function generateCancelToken(bookingId: string): Promise<string> {
  try {
    const data = await apiPost('cancel-token', { id: bookingId });
    return data?.token ?? '';
  } catch {
    // Never let a token failure block the confirmation email from sending.
    return '';
  }
}

// Verification also happens server-side. Returns the booking row when valid.
async function verifyCancelToken(bookingId: string, token: string): Promise<{ valid: boolean; booking?: any }> {
  return await apiPost('cancel-verify', { id: bookingId, token });
}

async function sendCancellationNotification(booking: Booking) {
  try { await apiPost('send-cancellation', { booking }); }
  catch (e) { console.error('Cancellation email failed:', e); }
}

async function sendEmail(booking: Booking) {
  const svc = SERVICES.find(s => s.id === booking.service);
  let serviceName = svc?.name ?? booking.service ?? 'Service';
  const notes = booking.notes || '';
  if (booking.service === 'audio') {
    const match = notes.match(/Audio package: ([^|]+)/);
    if (match) serviceName = `Car Audio — ${match[1].trim()}`;
  }
  const dateStr = booking.date
    ? new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : booking.date;
  let cancelUrl = '';
  try {
    const t = await generateCancelToken(booking.id);
    if (t) cancelUrl = `${window.location.origin}/?cancel=${booking.id}&token=${t}`;
  } catch { /* non-fatal — email still sends without cancel link */ }
  try { await apiPost('send-confirmation', { booking, cancelUrl, serviceName, dateStr }); }
  catch (e) { console.error('Confirmation email failed:', e); }
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
function updateLocalGarageNotes(id: string, garageNotes: string) {
  const all = getLocalBookings().map(b => b.id === id ? { ...b, garageNotes } : b);
  localStorage.setItem('gg_bookings', JSON.stringify(all));
}

// ── BOOKING WIDGET ──────────────────────────────────────────────────────────
// Services that require parts sourcing — these get a deposit step
const PARTS_HEAVY_SERVICES = ['audio', 'suspension'];
// Services where card-on-file makes sense (charged after work)
const CARD_ON_FILE_SERVICES = ['oil', 'brakes', 'diag', 'full'];

function requiresDeposit(service: string | null, audioPackage: string | null): boolean {
  if (service === 'audio') return true;
  if (service === 'suspension') return true;
  return false;
}

interface State {
  step: number; service: string | null; date: string | null;
  time: string | null; calYear: number; calMonth: number;
  suspensionPart: string | null; suspensionPosition: string | null;
  brakeService: string | null; brakePosition: string | null; brakePadType: string | null; audioPackage: string | null;
  cardToken: string | null; cardLast4: string | null; cardSkipped: boolean; bookingId: string | null;
}
const INIT_STATE: State = {
  step: 1, service: null, date: null, time: null,
  calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
  suspensionPart: null, suspensionPosition: null,
  brakeService: null, brakePosition: null, brakePadType: null, audioPackage: null,
  cardToken: null, cardLast4: null, cardSkipped: false, bookingId: null,
};
const INIT_FORM: FormData = { fname: '', lname: '', phone: '', email: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleEngine: '', vehicleTrim: '', licensePlate: '', notes: '', serviceAddress: '' };

export { verifyCancelToken, updateSupabaseBooking, deleteLocalBooking, sendCancellationNotification, getSupabaseBookings };

// ── BRAKE PAD SELECTOR ──────────────────────────────────────────────────────
const PAD_OPTIONS = [
  {
    id: 'Economy (Semi-Metallic)',
    label: 'Economy',
    brand: 'Semi-Metallic',
    price: '$',
    color: 'border-gray-600',
    activeColor: 'border-gray-400 bg-gray-800/60',
    details: {
      material: 'Organic / semi-metallic blend',
      noise: 'Moderate',
      dust: 'Moderate',
      life: 'Good — everyday driving',
      best: 'Budget-conscious drivers, city/stop-and-go use',
      note: 'A solid everyday pad. Does the job well at a lower cost.',
    },
  },
  {
    id: 'Premium (Ceramic)',
    label: 'Premium',
    brand: 'Ceramic',
    price: '$$',
    color: 'border-yellow-700',
    activeColor: 'border-yellow-500 bg-yellow-900/20',
    details: {
      material: 'Ceramic compound',
      noise: 'Very low — quieter stop',
      dust: 'Low — cleaner wheels',
      life: 'Excellent — lasts longer',
      best: 'Daily drivers who want a cleaner, quieter ride',
      note: 'Our most popular choice. Better performance, less dust, longer life — worth the upgrade.',
    },
  },
];

function BrakePadSelector({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [infoOpen, setInfoOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider">Pad Type</label>
        <span className="text-gray-600 text-xs">(optional)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PAD_OPTIONS.map(pad => (
          <div key={pad.id} className={`border-2 transition-all cursor-pointer ${value === pad.id ? pad.activeColor : pad.color + ' bg-gray-900/50'}`}>
            <button
              type="button"
              onClick={() => onChange(value === pad.id ? '' : pad.id)}
              className="w-full text-left p-3"
            >
              <div className="flex items-start justify-between gap-1">
                <div>
                  <div className="text-white text-sm font-bold">{pad.label}</div>
                  <div className="text-gray-500 text-xs">{pad.brand}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-gray-500 text-xs font-mono">{pad.price}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setInfoOpen(infoOpen === pad.id ? null : pad.id); }}
                    className="w-5 h-5 rounded-full border border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400 flex items-center justify-center text-[10px] font-bold transition-colors flex-shrink-0"
                    aria-label={`Info about ${pad.label}`}
                  >i</button>
                </div>
              </div>
            </button>
            {infoOpen === pad.id && (
              <div className="border-t border-gray-700 bg-gray-950 px-3 py-3 space-y-1.5">
                {[
                  ['Material', pad.details.material],
                  ['Noise', pad.details.noise],
                  ['Dust', pad.details.dust],
                  ['Lifespan', pad.details.life],
                  ['Best for', pad.details.best],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wider w-14 flex-shrink-0 pt-px">{k}</span>
                    <span className="text-gray-300 text-xs leading-snug">{v}</span>
                  </div>
                ))}
                <p className="text-red-400/80 text-[10px] leading-snug mt-1 pt-1 border-t border-gray-800">{pad.details.note}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-1.5">Not sure? We'll recommend the right fit for your vehicle when we follow up.</p>
    </div>
  );
}


// ── RETURNING CUSTOMER BANNER ────────────────────────────────────────────────
function ReturningCustomerBanner({
  fname, returningCustomer, onCardUpdated, customerName,
}: {
  fname: string;
  returningCustomer: { stripeCustomerId: string; last4?: string };
  onCardUpdated: (last4: string) => void;
  customerName: string;
}) {
  const [showUpdate, setShowUpdate] = useState(false);
  const [stripe, setStripe] = useState<any>(null);
  const [card, setCard] = useState<any>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUpdate || !STRIPE_PK) return;
    loadStripe(STRIPE_PK).then(setStripe);
  }, [showUpdate]);

  useEffect(() => {
    if (!stripe || !mountRef.current || !showUpdate) return;
    const elements = stripe.elements({
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#dc2626', colorBackground: '#111827',
          colorText: '#ffffff', colorDanger: '#ef4444',
          fontFamily: 'Barlow, system-ui, sans-serif',
          spacingUnit: '4px', borderRadius: '0px',
        },
      },
    });
    const el = elements.create('card', {
      style: { base: { fontSize: '14px', color: '#fff', '::placeholder': { color: '#6b7280' } }, invalid: { color: '#ef4444' } },
    });
    el.mount(mountRef.current);
    el.on('change', (e: any) => { setCardError(e.error?.message ?? null); setCardComplete(e.complete); });
    setCard(el);
    return () => el.destroy();
  }, [stripe, showUpdate]);

  async function handleUpdateCard() {
    if (!stripe || !card) return;
    setSaving(true);
    setCardError(null);
    try {
      const { token, error } = await stripe.createToken(card, { name: customerName || undefined });
      if (error) { setCardError(error.message); setSaving(false); return; }

      // Call update-card worker — attaches new source to existing Stripe Customer
      const res = await fetch('/admin-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.id,
          customerId: returningCustomer.stripeCustomerId,
        }),
      });
      const data = await res.json() as any;
      if (data.error) throw new Error(data.error);

      const newLast4: string = data.last4 ?? token.card?.last4 ?? '????';

      // The update-card worker patches stripe_last4 on the customer's bookings
      // server-side (anon can no longer UPDATE), so nothing to do here.

      onCardUpdated(newLast4);
      setShowUpdate(false);
    } catch (e: any) {
      setCardError(e.message ?? 'Something went wrong. Please try again.');
    }
    setSaving(false);
  }

  return (
    <div className="col-span-2 bg-gradient-to-r from-red-950/60 to-gray-900/60 border border-red-700/60 border-l-4 border-l-red-500 px-4 py-3.5 mb-1">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">👋</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-black mb-0.5">Welcome back, {fname}!</p>
          <p className="text-gray-400 text-xs leading-relaxed">
            We found your account. Your card on file ending in{' '}
            <span className="text-white font-bold">
              {returningCustomer.last4 ? `••••${returningCustomer.last4}` : '••••'}
            </span>{' '}
            will be used for this appointment — no need to re-enter it.
          </p>
          <button
            type="button"
            onClick={() => { setShowUpdate(p => !p); setCardError(null); setCardComplete(false); }}
            className="text-red-400 hover:text-red-300 text-[11px] font-bold underline underline-offset-2 transition-colors mt-1.5 inline-block"
          >
            {showUpdate ? 'Cancel' : 'Update card on file →'}
          </button>
        </div>
      </div>

      {showUpdate && (
        <div className="mt-3 pt-3 border-t border-red-900/50 space-y-3">
          <p className="text-gray-400 text-xs">Enter your updated card details below and we'll have it on file for your appointment.</p>
          <div>
            <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">New Card Details</label>
            <div ref={mountRef} className="bg-gray-900 border border-gray-700 p-3.5 focus-within:border-red-600 transition-colors" />
            {cardError && <p className="text-red-400 text-[11px] mt-1">{cardError}</p>}
          </div>
          <button
            type="button"
            onClick={handleUpdateCard}
            disabled={saving || !cardComplete}
            className={`w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors ${(saving || !cardComplete) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saving ? 'Saving...' : 'Save New Card'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── STRIPE CARD ON FILE STEP ─────────────────────────────────────────────────
// Uses Stripe.js loaded from CDN. We do a $0 SetupIntent auth to verify the card
// is real without charging. The token/payment method ID is saved to the booking.
declare global {
  interface Window { Stripe?: any; }
}

function loadStripe(publishableKey: string): Promise<any> {
  return new Promise((resolve) => {
    if (window.Stripe) { resolve(window.Stripe(publishableKey)); return; }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => resolve(window.Stripe!(publishableKey));
    document.head.appendChild(script);
  });
}

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;

interface CardStepProps {
  serviceId: string | null;
  audioPackage: string | null;
  bookingId: string | null;
  customerName: string;
  customerEmail: string;
  onCardSaved: (customerId: string, last4: string) => void;

}

function CardOnFileStep({ serviceId, audioPackage, bookingId, customerName, customerEmail, onCardSaved }: CardStepProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [card, setCard] = useState<any>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [consented, setConsented] = useState(false);
  const isPartsJob = requiresDeposit(serviceId, audioPackage);

  useEffect(() => {
    if (!STRIPE_PK) return;
    loadStripe(STRIPE_PK).then((stripeInstance) => {
      setStripe(stripeInstance);
    });
  }, []);

  useEffect(() => {
    if (!stripe || !mountRef.current) return;
    const elements = stripe.elements({
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#dc2626',
          colorBackground: '#111827',
          colorText: '#ffffff',
          colorDanger: '#ef4444',
          fontFamily: 'Barlow, system-ui, sans-serif',
          spacingUnit: '4px',
          borderRadius: '0px',
        },
      },
    });
    const cardElement = elements.create('card', {
      style: {
        base: { fontSize: '14px', color: '#fff', '::placeholder': { color: '#6b7280' } },
        invalid: { color: '#ef4444' },
      },
    });
    cardElement.mount(mountRef.current);
    cardElement.on('change', (e: any) => {
      setCardError(e.error?.message ?? null);
      setCardComplete(e.complete);
    });
    setCard(cardElement);
    return () => cardElement.destroy();
  }, [stripe]);

  async function handleSaveCard() {
    if (!stripe || !card) return;
    setSaving(true);
    setCardError(null);
    try {
      const { token, error } = await stripe.createToken(card, {
        name: customerName || undefined,
      });
      if (error) { setCardError(error.message); setSaving(false); return; }

      // Send token to Cloudflare Worker → creates Stripe Customer + saves pm to Supabase
      const res = await fetch('/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.id,
          bookingId,
          name: customerName,
          email: customerEmail,
        }),
      });
      const data = await res.json() as any;
      if (data.error) throw new Error(data.error);

      onCardSaved(data.customerId, data.last4 ?? token.card?.last4 ?? '****');
    } catch (e: any) {
      setCardError(e.message ?? 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div>
      <StepHeader n={5} current={5} label={isPartsJob ? "Secure Your Appointment" : "Card on File"} />

      {isPartsJob ? (
        <div className="mb-5 bg-yellow-950/30 border border-yellow-700/50 border-l-4 border-l-yellow-500 px-4 py-4">
          <p className="text-yellow-300 text-sm font-bold mb-1">Parts Need to Be Sourced</p>
          <p className="text-yellow-200/70 text-xs leading-relaxed">
            This service requires us to order parts for your vehicle. A card on file secures your appointment — <span className="text-yellow-300 font-semibold">you won't be charged until the job is complete.</span> We'll confirm parts availability and final pricing with you before we begin.
          </p>
        </div>
      ) : (
        <div className="mb-5 bg-gray-900/60 border border-gray-700 border-l-4 border-l-red-600 px-4 py-4">
          <p className="text-white text-sm font-bold mb-1">No Charge Until the Job Is Done</p>
          <p className="text-gray-400 text-xs leading-relaxed">
            We save your card to make checkout seamless — <span className="text-gray-300 font-semibold">nothing is charged until your service is complete.</span> You'll know the final price before we ever touch your card.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: '🔒', label: 'Encrypted', sub: 'Stripe-secured' },
          { icon: '💳', label: 'Not Charged', sub: 'Until job is done' },
          { icon: '✓', label: "You're in Control", sub: 'Cancel anytime' },
        ].map(t => (
          <div key={t.label} className="bg-gray-900 border border-gray-800 p-3 text-center">
            <div className="text-xl mb-1">{t.icon}</div>
            <div className="text-white text-xs font-bold">{t.label}</div>
            <div className="text-gray-500 text-[10px]">{t.sub}</div>
          </div>
        ))}
      </div>

      {STRIPE_PK ? (
        <>
          <div className="mb-3">
            <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Card Details</label>
            <div ref={mountRef} className="bg-gray-900 border border-gray-700 p-3.5 focus-within:border-red-600 transition-colors" />
            {cardError && <p className="text-red-400 text-xs mt-1.5">{cardError}</p>}
          </div>

          {/* Stripe trust block */}
          <div className="bg-gray-950 border border-gray-800 px-4 py-3 mb-4 flex items-start gap-3">
            {/* Stripe official hosted badge */}
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg"
              alt="Stripe"
              className="w-12 flex-shrink-0 mt-0.5 opacity-90"
            />
            <div>
              <p className="text-gray-300 text-xs font-semibold mb-0.5">Payment secured by Stripe</p>
              <p className="text-gray-500 text-[10px] leading-relaxed">
                Your card info is encrypted and never stored on GID Garage's servers. Stripe is certified to <span className="text-gray-400">PCI Service Provider Level 1</span> — the highest level of payment security. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">Stripe Privacy Policy ↗</a>
              </p>
            </div>
          </div>

          {/* Explicit consent checkbox */}
          <label className="flex items-start gap-3 mb-4 cursor-pointer group">
            <input
              type="checkbox"
              checked={consented}
              onChange={e => setConsented(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600 flex-shrink-0 cursor-pointer"
            />
            <span className="text-gray-400 text-xs leading-relaxed">
              {isPartsJob
                ? <>I authorize GID Garage to save my card and charge it for the <strong className="text-white">full service amount upon job completion</strong>. I will be contacted to confirm parts availability and final pricing before any work begins.</>
                : <>I authorize GID Garage to charge this card for the <strong className="text-white">agreed service amount upon job completion</strong>. No charge will be made until the work is done and the final price is confirmed.</>
              }
            </span>
          </label>

          <button
            onClick={handleSaveCard}
            disabled={saving || !cardComplete || !consented}
            className={`btn-primary w-full py-4 text-sm mb-3 ${(saving || !cardComplete || !consented) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saving ? 'Saving Card...' : isPartsJob ? 'Save Card & Confirm Appointment' : 'Save Card & Submit Request'}
          </button>
        </>
      ) : (
        // Stripe not configured — show manual notice
        <div className="bg-gray-900 border border-gray-700 px-4 py-4 mb-4">
          <p className="text-gray-400 text-sm">Card collection is not configured yet. You can still submit your request — we'll collect payment info when we follow up.</p>
        </div>
      )}


    </div>
  );
}

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
  const timeSlots = getSlotsForDate(s.date ?? '');

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
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(y, m, d) < today) return false;
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
    const k = dateKey(y, m, d);
    const takenTimes = await getBookedTimesForDate(k);
    const slots = (dow === 0 || dow === 6) ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
    const availableSlots = slots.filter(t => {
      if (takenTimes.includes(t)) return false;
      if (isToday && parseSlotHour(t) <= now.getHours()) return false;
      return true;
    });
    return availableSlots.length > 0;
  }

  function isAvailableSync(y: number, m: number, d: number): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(y, m, d) < today) return false;
    const k = dateKey(y, m, d);
    if (unavailableDates.has(k)) return false;
    return true;
  }

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

  function selectService(id: string) { setS(p => ({ ...p, service: id, step: id === 'other' ? 1 : Math.max(p.step, 2) })); }
  function selectDate(k: string) { setS(p => ({ ...p, date: k, time: null, step: Math.max(p.step, 3) })); }
  function selectTime(t: string) { setS(p => ({ ...p, time: t, step: Math.max(p.step, 4) })); }
  function prevMonth() { setS(p => p.calMonth === 0 ? { ...p, calMonth: 11, calYear: p.calYear - 1 } : { ...p, calMonth: p.calMonth - 1 }); }
  function nextMonth() { setS(p => p.calMonth === 11 ? { ...p, calMonth: 0, calYear: p.calYear + 1 } : { ...p, calMonth: p.calMonth + 1 }); }

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCancelPolicy, setShowCancelPolicy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [returningCustomer, setReturningCustomer] = useState<{ stripeCustomerId: string; last4?: string } | null>(null);
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);

  // Debounced returning-customer lookup: fires when fname+lname+email+phone are all filled
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const { fname, lname, email, phone } = form;
    if (!fname || !lname || !email || !phone) { setReturningCustomer(null); return; }
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(async () => {
      setLookingUpCustomer(true);
      try {
        const data = await apiPost('returning-customer', { fname, lname, email, phone });
        if (data && data.stripeCustomerId) {
          setReturningCustomer({ stripeCustomerId: data.stripeCustomerId, last4: data.last4 ?? undefined });
        } else {
          setReturningCustomer(null);
        }
      } catch { setReturningCustomer(null); }
      setLookingUpCustomer(false);
    }, 800);
    return () => { if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current); };
  }, [form.fname, form.lname, form.email, form.phone]);

  // Validate step 4 and advance to card step
  async function handleAdvanceToCard() {
    if (submitting) return; // prevent double-tap
    const errors: Record<string, string> = {};
    if (!form.fname) errors.fname = 'First name is required';
    if (!form.phone) errors.phone = 'Phone number is required';
    if (!form.serviceAddress) errors.serviceAddress = 'Service address is required';
    if (!form.vehicleYear) errors.vehicleYear = 'Select a year';
    if (!form.vehicleMake) errors.vehicleMake = 'Select a make';
    if (!form.vehicleModel) errors.vehicleModel = 'Select a model';
    if (!form.vehicleTrim) errors.vehicleTrim = 'Enter trim (e.g. LE, Sport, XLT)';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSubmitError(null);
    if (!s.service || !s.date || !s.time || !svc) return;

    // Generate ID and insert booking into Supabase NOW so the card worker can patch it
    const bookingId = s.bookingId ?? `GID-${Date.now()}`;
    const booking: Booking = {
      id: bookingId,
      service: s.service, serviceIcon: svc.icon,
      date: s.date, time: s.time,
      fname: form.fname, lname: form.lname, phone: form.phone, email: form.email,
      vehicle: vehicleString(form),
      notes: [
        `Address: ${form.serviceAddress}`,
        form.licensePlate ? `Plate/VIN: ${form.licensePlate}` : '',
        s.suspensionPart ? `Suspension: ${SUSPENSION_LABELS[s.suspensionPart] ?? s.suspensionPart.replace(/_/g, ' ')}${s.suspensionPosition ? ` (${s.suspensionPosition})` : ''}` : '',
        s.brakeService ? `Brake service: ${BRAKE_LABELS[s.brakeService] ?? s.brakeService.replace(/_/g, ' ')}${s.brakePosition ? ` (${s.brakePosition})` : ''}${s.brakePadType ? ` — ${s.brakePadType}` : ''}` : '',
        s.audioPackage ? `Audio package: ${AUDIO_LABELS[s.audioPackage] ?? s.audioPackage}` : '',
        form.notes,
      ].filter(Boolean).join(' | '),
      garageNotes: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    saveLocalBooking(booking);
    setSubmitting(true);
    try {
      await insertSupabaseBooking(booking);
    } catch (e: any) {
      deleteLocalBooking(bookingId);
      setSubmitting(false);
      if (e?.message?.includes('unique') || e?.message?.includes('duplicate') || e?.message?.includes('23505')) {
        setSubmitError('Sorry, that time slot was just booked by someone else. Please go back and choose a different time.');
      } else {
        setSubmitError('Something went wrong. Please try again or call us directly.');
      }
      return;
    }

    // If returning customer with card on file, skip card step and submit directly
    if (returningCustomer) {
      setS(p => ({ ...p, step: 5, bookingId }));
      await handleFinalSubmit(returningCustomer.stripeCustomerId, returningCustomer.last4 ?? null, bookingId);
      return;
    }
    setS(p => ({ ...p, step: 5, bookingId }));
  }

  function handleCardSaved(customerId: string, last4: string) {
    setS(p => ({ ...p, cardToken: customerId, cardLast4: last4 }));
    handleFinalSubmit(customerId, last4);
  }

  async function handleFinalSubmit(customerId: string | null = null, last4: string | null = null, bookingIdOverride?: string) {
    const resolvedBookingId = bookingIdOverride ?? s.bookingId;
    if (!s.service || !s.date || !s.time || !svc || !resolvedBookingId) return;
    setSubmitting(true);
    // For new cards: save-card worker already patched status='confirmed' server-side.
    // For returning customers: save-card is bypassed, so we must confirm here via the worker.
    if (customerId) {
      try {
        await apiPost('confirm-booking', {
          id: resolvedBookingId,
          stripeCustomerId: customerId,
          stripeLast4: last4,
        });
      } catch (e) { console.warn('Status confirm failed:', e); }
    }
    const booking: Booking = {
      id: resolvedBookingId,
      service: s.service, serviceIcon: svc.icon,
      date: s.date, time: s.time,
      fname: form.fname, lname: form.lname, phone: form.phone, email: form.email,
      vehicle: vehicleString(form),
      notes: '',
      garageNotes: '',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    try { await sendEmail(booking); } catch (e) { console.warn('Email send failed', e); }
    setSubmitting(false);
    setSubmitted(true);
  }

  async function handleOtherSubmit() {
    const errors: Record<string, string> = {};
    if (!form.fname)  errors.fname = 'First name is required';
    if (!form.phone)  errors.phone = 'Phone number is required';
    if (!form.notes || form.notes.trim().length < 10) errors.notes = 'Please describe your problem (at least a few words)';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSubmitting(true);
    setSubmitError(null);
    const bookingId = `GID-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const inquiry = {
      id: bookingId,
      service: 'other',
      service_icon: '💬',
      date: today,
      time: nowTime,
      fname: form.fname,
      lname: form.lname,
      phone: form.phone,
      email: form.email || '',
      vehicle: vehicleString(form) || 'Not specified',
      notes: form.notes,
      garage_notes: '',
      status: 'confirmed',
      job_status: 'BOOKED',
      created_at: new Date().toISOString(),
    };
    try {
      await sbFetch('/bookings', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(inquiry) });
    } catch (e: any) {
      setSubmitError('Something went wrong. Please try again or call us directly.');
      setSubmitting(false);
      return;
    }
    // Notify GID Garage via worker (BREVO_API_KEY no longer in client bundle)
    try {
      await apiPost('send-inquiry', {
        fname: form.fname, lname: form.lname, phone: form.phone,
        email: form.email || '', vehicle: vehicleString(form),
        notes: form.notes, bookingId,
      });
    } catch { /* non-critical */ }
    setSubmitting(false);
    setSubmitted(true);
  }

  function reset() { setS(INIT_STATE); setForm(INIT_FORM); setSubmitted(false); setReturningCustomer(null); setSubmitError(null); }
  function closeModal() { setOpen(false); onClose?.(); }

  const firstDay = new Date(s.calYear, s.calMonth, 1).getDay();
  const daysInMonth = new Date(s.calYear, s.calMonth + 1, 0).getDate();
  const dateStr = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  return (
    <>
      {!autoOpen && (
        <button onClick={() => setOpen(true)} className="btn-primary text-xs px-8 py-4">Get a Quote</button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/85 overflow-y-auto flex items-start justify-center p-4 md:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-dark w-full max-w-2xl relative p-8 md:p-10 my-4">
            <button onClick={closeModal} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center text-lg transition-colors" aria-label="Close">✕</button>

            {submitted ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4">{s.service === 'other' ? '💬' : '✅'}</div>
                <h2 className="text-3xl font-black text-white mb-3">{s.service === 'other' ? 'Message Sent!' : 'Request Received!'}</h2>
                {s.service === 'other' ? (
                  <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                    Got it, {form.fname}! We've received your message and will reach out shortly — usually same day — with a quote and next steps.<br /><br />
                    In the meantime, feel free to call or text us at <a href={`tel:${PHONE.replace(/-/g,'')}`} className="text-red-500 font-bold">{PHONE}</a>.
                  </p>
                ) : (
                  <p className="text-gray-400 text-sm leading-relaxed">
                    We've received your quote request for <span className="text-red-500 font-bold">{svc?.name}</span> on <span className="text-red-500 font-bold">{dateStr} at {s.time}</span>. We'll call you to confirm availability and finalize pricing.<br /><br />
                    A confirmation has been sent to {form.email || 'your email'}.<br />
                    <span className="text-gray-500 text-xs">If you don't see it, check your junk or spam folder.</span>
                  </p>
                )}
                {s.service === 'audio' && (
                  <p className="text-yellow-500/80 text-xs mt-4 max-w-xs mx-auto">Note: If parts need to be sourced, we'll reach out to confirm a deposit and lead time before your appointment.</p>
                )}
                <p className="text-gray-600 text-xs mt-4">Questions? Call <a href={`tel:${PHONE.replace(/-/g,'')}`} className="text-red-600 font-bold">{PHONE}</a></p>
                <button onClick={reset} className="mt-6 border border-red-600 text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 transition-colors">New Request</button>
              </div>
            ) : (
              <>
                <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Get a Quote</p>
                <h2 className="text-3xl font-black text-white tracking-tight mb-6">Request a Quote</h2>

                {s.service !== 'other' && (
                  <div className="flex gap-1 mb-8">
                    {[1,2,3,4,5].map(n => <div key={n} className={`h-0.5 flex-1 transition-colors duration-300 ${n <= s.step ? 'bg-red-600' : 'bg-gray-800'}`} />)}
                  </div>
                )}
                {s.service === 'other' && <div className="h-0.5 bg-red-600 mb-8" />}

                <StepHeader n={1} current={s.step} label="Select a Service" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-2">
                  {SERVICES.filter(sv => !sv.isOther).map(sv => (
                    <button key={sv.id} onClick={() => selectService(sv.id)}
                      className={`text-left p-3.5 border transition-all ${s.service === sv.id ? 'border-l-4 border-red-600 bg-red-950/30' : 'border-gray-800 bg-gray-900 hover:border-red-600'}`}>
                      <div className="text-xl mb-2">{sv.icon}</div>
                      <div className="text-white text-sm font-bold mb-0.5">{sv.name}</div>
                      <div className="text-gray-500 text-xs leading-snug">{sv.desc}</div>
                      <div className="text-red-500 text-xs font-bold mt-1">{sv.startingAt ? `Starting at ${sv.startingAt}` : sv.duration}</div>
                    </button>
                  ))}
                </div>

                {/* ── OTHER / Something Else card ── */}
                <button onClick={() => selectService('other')}
                  className={`w-full text-left border-2 transition-all mt-1 mb-2 ${s.service === 'other' ? 'border-red-600 bg-red-950/20' : 'border-dashed border-gray-700 bg-gray-900/50 hover:border-red-600'}`}>
                  <div className="flex items-start gap-4 p-4">
                    <div className="text-3xl flex-shrink-0 mt-0.5">💬</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white text-sm font-black tracking-tight">Don't See Your Problem Listed?</span>
                        {s.service === 'other' && <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-950/60 px-2 py-0.5">Selected</span>}
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">No worries — we handle all kinds of jobs. Tell us what's going on and we'll point you in the right direction with a custom quote.</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2.5">
                        <a href={`tel:${PHONE.replace(/-/g,'')}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-red-500 hover:text-red-400 text-xs font-bold transition-colors whitespace-nowrap">
                          <span>📞</span> {PHONE}
                        </a>
                        <a href="mailto:gidgarageaz@hotmail.com" onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-300 text-xs font-bold transition-colors whitespace-nowrap">
                          <span>✉️</span> gidgarageaz@hotmail.com
                        </a>
                      </div>
                    </div>
                  </div>
                </button>

                {/* ── Other: describe your problem ── */}
                {s.service === 'other' && (
                  <div className="mt-3 space-y-4">
                    <div className="bg-gray-900/80 border border-gray-800 border-l-4 border-l-red-600 px-4 py-3">
                      <p className="text-gray-300 text-xs leading-relaxed">We'll review your message and get back to you with a quote — usually same day. You can also call or text us directly at <a href={`tel:${PHONE.replace(/-/g,'')}`} className="text-red-500 font-bold">{PHONE}</a> or email <a href="mailto:gidgarageaz@hotmail.com" className="text-red-500 font-bold">gidgarageaz@hotmail.com</a>.</p>
                    </div>

                    {/* Contact fields */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'fname', label: 'First Name *', placeholder: 'John', type: 'text' },
                        { id: 'lname', label: 'Last Name', placeholder: 'Smith', type: 'text' },
                        { id: 'phone', label: 'Phone *', placeholder: '928-555-0100', type: 'tel' },
                        { id: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email' },
                      ].map(f => (
                        <div key={f.id}>
                          <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${fieldErrors[f.id] ? 'text-red-500' : 'text-gray-500'}`}>{f.label}</label>
                          <input type={f.type} placeholder={f.placeholder}
                            value={form[f.id as keyof FormData] as string}
                            onChange={e => { setForm(p => ({ ...p, [f.id]: e.target.value })); setFieldErrors(p => ({ ...p, [f.id]: '' })); }}
                            className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors border ${fieldErrors[f.id] ? 'border-red-500 focus:border-red-400' : 'border-gray-800 focus:border-red-600'}`} />
                          {fieldErrors[f.id] && <p className="text-red-500 text-xs mt-1">{fieldErrors[f.id]}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Vehicle (optional for inquiries) */}
                    <VehicleSelector form={form} setForm={setForm} errors={fieldErrors} clearError={k => setFieldErrors(p => ({ ...p, [k]: '' }))} />

                    {/* Problem description */}
                    <div>
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${fieldErrors.notes ? 'text-red-500' : 'text-gray-500'}`}>
                        Describe Your Problem <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        placeholder="Example: My car makes a grinding noise when I brake, mostly at highway speeds. Started about a week ago and seems to be getting worse..."
                        value={form.notes}
                        onChange={e => { setForm(p => ({ ...p, notes: e.target.value })); setFieldErrors(p => ({ ...p, notes: '' })); }}
                        rows={5}
                        className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors resize-y placeholder:text-gray-600 leading-relaxed border ${fieldErrors.notes ? 'border-red-500 focus:border-red-400' : 'border-gray-800 focus:border-red-600'}`}
                      />
                      {fieldErrors.notes && <p className="text-red-500 text-xs mt-1">{fieldErrors.notes}</p>}
                      <p className="text-gray-600 text-[10px] mt-1">Be as specific as you can — sounds, when it happens, how long it's been going on. The more detail, the faster we can help.</p>
                    </div>

                    {submitError && <div className="bg-red-950/50 border border-red-700 text-red-400 text-sm px-4 py-3">{submitError}</div>}

                    <button
                      onClick={handleOtherSubmit}
                      disabled={submitting}
                      className={`btn-primary w-full py-4 text-sm ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {submitting ? 'Sending...' : 'Send Inquiry & Request a Quote →'}
                    </button>
                  </div>
                )}

                {s.service === 'suspension' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What are you looking to replace?</label>
                      <select value={s.suspensionPart ?? ''} onChange={e => setS(p => ({ ...p, suspensionPart: e.target.value, suspensionPosition: null }))}
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                        <option value="">Select a part...</option>
                        <option value="shocks">Shocks</option>
                        <option value="struts">Struts</option>
                        <option value="control_arms">Control Arms</option>
                        <option value="tie_rods">Tie Rods</option>
                        <option value="cv_axles">CV Axles</option>
                      </select>
                    </div>
                    {s.suspensionPart && (
                      <div>
                        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Which ones?</label>
                        <select value={s.suspensionPosition ?? ''} onChange={e => setS(p => ({ ...p, suspensionPosition: e.target.value }))}
                          className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                          <option value="">Select position...</option>
                          <option value="Both Fronts">Both Fronts</option>
                          <option value="Both Rears">Both Rears</option>
                          <option value="Front Left">Front Left</option>
                          <option value="Front Right">Front Right</option>
                          <option value="Rear Left">Rear Left</option>
                          <option value="Rear Right">Rear Right</option>
                        </select>
                        <div className="mt-2 bg-blue-950/40 border border-blue-800/40 px-3 py-2 text-blue-300/80 text-xs leading-relaxed">
                          💡 We recommend replacing in pairs (both fronts or both rears) for optimal performance and even wear.
                        </div>
                      </div>
                    )}
                    {/* Alignment disclaimer for parts that affect alignment */}
                    {s.suspensionPart && ['struts', 'control_arms', 'tie_rods'].includes(s.suspensionPart) && (
                      <div className="bg-yellow-950/40 border border-yellow-800/50 px-3 py-2.5 text-xs leading-relaxed space-y-1">
                        <p className="text-yellow-400 font-bold">⚠️ Alignment Recommended After This Service</p>
                        <p className="text-yellow-200/70">Replacing {s.suspensionPart === 'struts' ? 'struts' : s.suspensionPart === 'control_arms' ? 'control arms' : 'tie rods'} affects your vehicle's alignment. We do not perform alignments — you'll need to visit an alignment shop after this service to ensure proper tire wear and handling.</p>
                      </div>
                    )}
                    <p className="text-gray-600 text-xs">Pricing varies per vehicle — get a free estimate when you book!</p>
                  </div>
                )}

                {s.service === 'brakes' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What brake service do you need?</label>
                      <select value={s.brakeService ?? ''} onChange={e => setS(p => ({ ...p, brakeService: e.target.value, brakePosition: null, brakePadType: null }))}
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                        <option value="">Select a service...</option>
                        <option value="pads">Brake Pads Only — Starting at $139.99</option>
                        <option value="pads_rotors">Brake Pads + Rotors — Starting at $549.99</option>
                        <option value="full">Full Service: Pads + Rotors + Fluid Flush &amp; Inspection — Starting at $649.99</option>
                      </select>
                    </div>
                    {s.brakeService && (
                      <div>
                        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Which ones?</label>
                        <select value={s.brakePosition ?? ''} onChange={e => setS(p => ({ ...p, brakePosition: e.target.value }))}
                          className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                          <option value="">Select position...</option>
                          <option value="Both Fronts">Both Fronts</option>
                          <option value="Both Rears">Both Rears</option>
                          <option value="Front Left">Front Left</option>
                          <option value="Front Right">Front Right</option>
                          <option value="Rear Left">Rear Left</option>
                          <option value="Rear Right">Rear Right</option>
                        </select>
                        <div className="mt-2 bg-blue-950/40 border border-blue-800/40 px-3 py-2 text-blue-300/80 text-xs leading-relaxed">
                          💡 We recommend replacing brakes in pairs (both fronts or both rears) for optimal performance and even wear.
                        </div>
                      </div>
                    )}
                    {s.brakePosition && (
                      <BrakePadSelector
                        value={s.brakePadType}
                        onChange={v => setS(p => ({ ...p, brakePadType: v }))}
                      />
                    )}
                    <p className="text-gray-600 text-xs">Pricing varies per vehicle — get a free estimate when you book!</p>
                  </div>
                )}

                {s.service === 'audio' && (
                  <div className="mt-3">
                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What audio service do you need?</label>
                    <select value={s.audioPackage ?? ''} onChange={e => setS(p => ({ ...p, audioPackage: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                      <option value="">Select a package...</option>
                      <option value="head_unit_replacement">Head Unit Replacement — Starting at $149.99 + parts</option>
                      <option value="speaker_replacement">Speaker Replacement — Starting at $99.99 + parts (pair)</option>
                      <option value="head_unit_install">Head Unit Install (Customer-Supplied) — Starting at $79.99 labor</option>
                      <option value="4ch_amp_install">4-Channel Amp Install — Starting at $129.99 + parts</option>
                      <option value="mono_amp_install">Monoblock Amp Install — Starting at $99.99 + parts</option>
                      <option value="full_system">Full Sound System (Head Unit + Speakers + 4ch Amp + Mono Amp + Sub) — Starting at $549.99 + parts</option>
                    </select>
                    <div className="mt-2 bg-yellow-950/40 border border-yellow-800/40 px-3 py-2 text-yellow-400/80 text-xs leading-relaxed">
                      ⚠️ Parts may need to be sourced with lead times of several days. A deposit is required for full system builds or sourced equipment. You're also welcome to supply your own parts.
                    </div>
                  </div>
                )}

                {s.service === 'oil' && (
                  <p className="text-gray-600 text-xs mt-2">*Mobile service fee included. Price may vary by vehicle. Full synthetic only.</p>
                )}

                {s.step >= 2 && s.service !== 'other' && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <StepHeader n={2} current={s.step} label="Choose a Preferred Date" />
                  <div className="bg-gray-900/60 border border-gray-700 border-l-4 border-l-yellow-600 px-4 py-2.5 mb-4 flex items-center gap-2">
                    <span className="text-yellow-500 text-sm">📅</span>
                    <p className="text-yellow-400/90 text-xs font-semibold">Preferred date &amp; time — we'll confirm availability when we follow up.</p>
                  </div>
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
                  <p className="text-gray-700 text-[10px] mt-1">Mon–Fri: 1:30 PM–8 PM · Sat–Sun: 5 AM–8 PM</p>
                </>)}

                {s.step >= 3 && s.date && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <StepHeader n={3} current={s.step} label="Pick a Time" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                    {timeSlots.filter(t => {
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
                    {[['Service', `${svc?.icon} ${svc?.name}`], ['Date', dateStr], ['Time', s.time], ['Est. Duration', svc?.duration ?? '']].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">{k}</span>
                        <span className="text-white text-xs font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Returning customer banner */}
                  {lookingUpCustomer && (
                    <div className="col-span-2 flex items-center gap-2 text-gray-500 text-xs animate-pulse mb-1">
                      <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                      Checking for your account...
                    </div>
                  )}
                  {!lookingUpCustomer && returningCustomer && (
                    <ReturningCustomerBanner
                      fname={form.fname}
                      returningCustomer={returningCustomer}
                      onCardUpdated={(last4) => setReturningCustomer(p => p ? { ...p, last4 } : p)}
                      customerName={`${form.fname} ${form.lname}`.trim()}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'fname', label: 'First Name *', placeholder: 'John', type: 'text' },
                      { id: 'lname', label: 'Last Name', placeholder: 'Smith', type: 'text' },
                      { id: 'phone', label: 'Phone *', placeholder: '928-555-0100', type: 'tel' },
                      { id: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email' },
                    ].map(f => (
                      <div key={f.id}>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${fieldErrors[f.id] ? 'text-red-500' : 'text-gray-500'}`}>{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder}
                          value={form[f.id as keyof FormData] as string}
                          onChange={e => { setForm(p => ({ ...p, [f.id]: e.target.value })); setFieldErrors(p => ({ ...p, [f.id]: '' })); }}
                          className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors border ${fieldErrors[f.id] ? 'border-red-500 focus:border-red-400' : 'border-gray-800 focus:border-red-600'}`} />
                        {fieldErrors[f.id] && <p className="text-red-500 text-xs mt-1">{fieldErrors[f.id]}</p>}
                      </div>
                    ))}
                    <VehicleSelector form={form} setForm={setForm} errors={fieldErrors} clearError={(k) => setFieldErrors(p => ({ ...p, [k]: '' }))} />
                    <div className="col-span-2">
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">
                        License Plate or VIN <span className="normal-case font-normal text-gray-600">(optional — helps us get the exact fit for your vehicle)</span>
                      </label>
                      <input type="text" placeholder="e.g. AZ ABC1234 or 1HGCM82633A123456"
                        value={form.licensePlate}
                        onChange={e => setForm(p => ({ ...p, licensePlate: e.target.value }))}
                        className="w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors border border-gray-800 focus:border-red-600" />
                    </div>
                    <div className="col-span-2">
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${fieldErrors.serviceAddress ? 'text-red-500' : 'text-gray-500'}`}>Service Address <span className="text-red-500">*</span> <span className="normal-case font-normal text-gray-600">(where we service your vehicle)</span></label>
                      <input type="text" placeholder="123 Main St, Flagstaff, AZ 86001"
                        value={form.serviceAddress}
                        onChange={e => { setForm(p => ({ ...p, serviceAddress: e.target.value })); setFieldErrors(p => ({ ...p, serviceAddress: '' })); }}
                        className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors border ${fieldErrors.serviceAddress ? 'border-red-500 focus:border-red-400' : 'border-gray-800 focus:border-red-600'}`} />
                      {fieldErrors.serviceAddress && <p className="text-red-500 text-xs mt-1">{fieldErrors.serviceAddress}</p>}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Notes (optional)</label>
                      <textarea placeholder="Gate code, building/unit #, parking notes, preferred date/time, specific concern..." value={form.notes}
                        onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors resize-y" />
                      <p className="text-gray-600 text-xs mt-1">💡 Include a preferred date &amp; time — we'll confirm availability. Note: we may need to assess your vehicle first before finalizing the scope of work.</p>
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs mt-3">By booking, you agree to our <button type="button" onClick={() => setShowCancelPolicy(true)} className="text-red-500 hover:text-red-400 underline underline-offset-2 transition-colors">cancellation policy</button>. Please cancel at least 24 hours in advance to avoid a cancellation fee.</p>
                  {submitError && (
                    <div className="mt-4 bg-red-950/50 border border-red-700 text-red-400 text-sm px-4 py-3">
                      {submitError}
                    </div>
                  )}
                  <button onClick={handleAdvanceToCard}
                    disabled={submitting}
                    className={`btn-primary w-full mt-4 py-4 text-sm ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {submitting ? 'Please wait…' : 'Continue →'}
                  </button>
                </>)}

                {s.step >= 5 && s.time && !returningCustomer && (<>
                  <div className="border-t border-gray-800 my-6" />
                  <CardOnFileStep
                    serviceId={s.service}
                    audioPackage={s.audioPackage}
                    bookingId={s.bookingId}
                    customerName={`${form.fname} ${form.lname}`.trim()}
                    customerEmail={form.email}
                    onCardSaved={handleCardSaved}
                  />
                  {submitError && (
                    <div className="mt-4 bg-red-950/50 border border-red-700 text-red-400 text-sm px-4 py-3">
                      {submitError}
                    </div>
                  )}
                  {submitting && (
                    <div className="mt-3 text-center text-gray-500 text-sm animate-pulse">Submitting your request...</div>
                  )}
                </>)}
              </>
            )}
          </div>
        </div>
      )}

      {showCancelPolicy && (
        <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowCancelPolicy(false)}>
          <div className="bg-[#1a1a1a] border border-gray-700 w-full max-w-md p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowCancelPolicy(false)} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center text-lg transition-colors" aria-label="Close">✕</button>
            <div className="w-8 h-1 bg-red-600 mb-5" />
            <h3 className="text-white text-xl font-extrabold tracking-tight mb-4">Cancellation Policy</h3>
            <div className="space-y-3 text-gray-400 text-sm leading-relaxed">
              <p><span className="text-white font-semibold">24-Hour Notice Required.</span> To avoid a cancellation fee, please cancel or reschedule your appointment at least <span className="text-red-400 font-semibold">24 hours before</span> your scheduled time.</p>
              <p><span className="text-white font-semibold">Late Cancellations.</span> Cancellations made less than 24 hours in advance may be subject to a cancellation fee of up to 50% of the quoted service cost.</p>
              <p><span className="text-white font-semibold">No-Shows.</span> Failure to be present at the scheduled time and location without prior notice may result in a no-show fee and may affect future booking eligibility.</p>
              <p><span className="text-white font-semibold">How to Cancel.</span> Cancel by calling or texting <a href="tel:4807570476" className="text-red-400 hover:text-red-300 transition-colors">480-757-0476</a> or by replying to your confirmation email. Cancellations are not considered confirmed until acknowledged by GID Garage.</p>
              <p><span className="text-white font-semibold">Emergency Exceptions.</span> We understand that emergencies happen. Contact us as soon as possible and we'll do our best to accommodate your situation.</p>
            </div>
            <button onClick={() => setShowCancelPolicy(false)} className="mt-6 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">Got It</button>
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
        <div className="flex justify-center gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < input.length ? 'bg-red-600 border-red-600' : 'bg-transparent border-gray-600'}`} />
          ))}
        </div>
        {error && <p className="text-red-500 text-xs font-bold uppercase tracking-wider mb-4">Incorrect PIN</p>}
        <div className="grid grid-cols-3 gap-3">
          {digits.slice(0, 9).map(d => (
            <button key={d} onClick={() => handleKey(d)}
              className="h-14 bg-gray-900 border border-gray-700 text-white text-xl font-bold hover:border-red-600 hover:bg-gray-800 active:bg-gray-700 transition-colors">{d}</button>
          ))}
          <div />
          <button onClick={() => handleKey('0')}
            className="h-14 bg-gray-900 border border-gray-700 text-white text-xl font-bold hover:border-red-600 hover:bg-gray-800 active:bg-gray-700 transition-colors">0</button>
          <button onClick={handleBackspace}
            className="h-14 bg-gray-900 border border-gray-700 text-gray-400 text-xl font-bold hover:border-red-600 hover:text-white active:bg-gray-700 transition-colors">⌫</button>
        </div>
      </div>
    </div>
  );
}

// ── BOOKING DETAIL MODAL ────────────────────────────────────────────────────
function BookingDetailModal({ booking, onClose, onUpdate, onBookingPatched }: {
  booking: Booking;
  onClose: () => void;
  onUpdate: (id: string, status: Booking['status']) => void;
  onBookingPatched?: (updated: Partial<Booking> & { id: string }) => void;
}) {
  const svcInfo = SERVICES.find(s => s.id === booking.service);
  const dateStr = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editDate, setEditDate] = useState(booking.date);
  const [editTime, setEditTime] = useState(booking.time);
  const [editPhone, setEditPhone] = useState(booking.phone);
  const [editEmail, setEditEmail] = useState(booking.email || '');
  const [editVehicle, setEditVehicle] = useState(booking.vehicle || '');
  const [editNotes, setEditNotes] = useState(booking.notes || '');

  // Photo upload state
  const [photos, setPhotos] = useState<{ key: string; url: string; name: string; note: string }[]>(booking.adminPhotos || []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [noteTimers, setNoteTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function savePhotosToDb(updated: typeof photos) {
    try {
      await adminPost('patch-booking', { id: booking.id, fields: { admin_photos: JSON.stringify(updated) } });
    } catch {}
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const fields: Record<string, string> = {
        date: editDate,
        time: editTime,
        phone: editPhone,
        email: editEmail,
        vehicle: editVehicle,
        notes: editNotes,
      };
      await adminPost('patch-booking', { id: booking.id, fields });
      onBookingPatched?.({ id: booking.id, date: editDate, time: editTime, phone: editPhone, email: editEmail, vehicle: editVehicle, notes: editNotes });
      setEditMode(false);
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed');
    }
    setSaving(false);
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bookingId', booking.id);
      const res = await fetch('/admin-upload-photo', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as any;
      const newPhoto = { key: data.key, url: data.url, name: file.name, note: '' };
      const updated = [...photos, newPhoto];
      setPhotos(updated);
      await savePhotosToDb(updated);
    } catch (e: any) {
      setPhotoError(e.message ?? 'Upload failed');
    }
    setUploadingPhoto(false);
  }

  function updatePhotoNote(key: string, note: string) {
    const updated = photos.map(p => p.key === key ? { ...p, note } : p);
    setPhotos(updated);
    if (noteTimers[key]) clearTimeout(noteTimers[key]);
    setSavingNotes(prev => ({ ...prev, [key]: false }));
    const timer = setTimeout(async () => {
      setSavingNotes(prev => ({ ...prev, [key]: true }));
      await savePhotosToDb(updated);
      setSavingNotes(prev => ({ ...prev, [key]: false }));
    }, 3000);
    setNoteTimers(prev => ({ ...prev, [key]: timer }));
  }

  async function deletePhoto(key: string) {
    const updated = photos.filter(p => p.key !== key);
    setPhotos(updated);
    await savePhotosToDb(updated);
  }

  const timeSlots = getSlotsForDate(editDate);

  const inputCls = 'w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors';
  const labelCls = 'block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0f0f0f] border border-gray-800 w-full max-w-lg p-7 relative my-4">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">✕</button>
        <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Appointment</p>
        <h2 className="text-2xl font-black text-white mb-1">{booking.fname} {booking.lname}</h2>
        <p className="text-gray-500 text-xs mb-5 font-mono">{booking.id}</p>

        {!editMode ? (
          <>
            <div className="space-y-2.5 mb-5">
              {[
                ['Service', `${svcInfo?.icon ?? '🔧'} ${svcInfo?.name ?? booking.service}`],
                ['Date', dateStr],
                ['Time', booking.time],
                ['Vehicle', booking.vehicle || '—'],
                ['Phone', booking.phone],
                ['Email', booking.email || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-gray-900 pb-2">
                  <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">{k}</span>
                  <span className="text-white text-sm font-medium text-right max-w-[60%]">{v}</span>
                </div>
              ))}
              {booking.notes && (
                <div className="border-b border-gray-900 pb-2">
                  <span className="text-gray-500 text-xs font-bold uppercase tracking-wider block mb-1">Notes</span>
                  <span className="text-white/70 text-sm italic">"{booking.notes}"</span>
                </div>
              )}
            </div>

            <button onClick={() => setEditMode(true)}
              className="w-full border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-wider py-2.5 mb-4 transition-colors">
              ✏️ Edit Appointment
            </button>

            <div className="flex gap-2 mb-4">
              {booking.status === 'confirmed' && (
                <button onClick={() => { onUpdate(booking.id, 'completed'); onClose(); }}
                  className="flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border border-green-800 text-green-600 hover:bg-green-900/30 transition-colors">✓ Mark Done</button>
              )}
              {booking.status !== 'cancelled' && (
                <button onClick={() => { if (confirm('Cancel this appointment?')) { onUpdate(booking.id, 'cancelled'); onClose(); } }}
                  className="flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-500 transition-colors">✕ Cancel</button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <select value={editTime} onChange={e => setEditTime(e.target.value)} className={inputCls}>
                    {(getSlotsForDate(editDate).length > 0 ? getSlotsForDate(editDate) : timeSlots).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    {!timeSlots.includes(editTime) && <option value={editTime}>{editTime} (current)</option>}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Vehicle</label>
                <input type="text" value={editVehicle} onChange={e => setEditVehicle(e.target.value)} className={inputCls} placeholder="Year Make Model Trim Engine" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} />
              </div>
            </div>
            {saveError && <p className="text-red-400 text-xs mb-3">{saveError}</p>}
            <div className="flex gap-2 mb-4">
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider py-2.5 transition-colors ${saving ? 'opacity-50' : ''}`}>
                {saving ? 'Saving…' : '✓ Save Changes'}
              </button>
              <button onClick={() => { setEditMode(false); setSaveError(null); }}
                className="flex-1 border border-gray-700 text-gray-400 text-xs font-bold uppercase tracking-wider py-2.5 hover:border-gray-500 transition-colors">
                Cancel
              </button>
            </div>
            <p className="text-yellow-600/70 text-[10px] mb-4">⚠️ Changing date/time frees the old slot and blocks the new one — customer will not be auto-notified. Call or text them manually.</p>
          </>
        )}

        {/* ── Admin-only photo uploads ── */}
        <div className="border-t border-gray-800 pt-4 mt-2">
          <p className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-1">🔒 Admin Photos</p>
          <p className="text-gray-600 text-[10px] mb-3">Internal records only — VIN plate, license plate, damage, documentation. Not visible to customer.</p>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={async e => {
              const files = Array.from(e.target.files || []);
              for (const f of files) await handlePhotoUpload(f);
              e.target.value = '';
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
            className={`w-full border border-dashed border-gray-700 text-gray-500 hover:border-yellow-700 hover:text-yellow-600 text-xs font-bold uppercase tracking-wider py-3 transition-colors ${uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {uploadingPhoto ? '⏳ Uploading…' : '+ Upload Photos'}
          </button>
          {photoError && <p className="text-red-400 text-xs mt-2">{photoError}</p>}

          {photos.length > 0 && (
            <div className="mt-3 space-y-3">
              {photos.map(p => (
                <div key={p.key} className="bg-gray-900 border border-gray-800">
                  <div className="relative">
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      <img src={p.url} alt={p.name} className="w-full max-h-48 object-cover" />
                    </a>
                    <button onClick={() => deletePhoto(p.key)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-red-500 hover:bg-red-900/80 flex items-center justify-center text-sm transition-colors">×</button>
                    <span className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/60 px-1.5 py-0.5">{p.name}</span>
                  </div>
                  <div className="p-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={p.note}
                        onChange={e => updatePhotoNote(p.key, e.target.value)}
                        placeholder="Add a note (autosaves in 3s)…"
                        className="w-full bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 outline-none focus:border-yellow-700 placeholder-gray-600 transition-colors pr-14"
                      />
                      {savingNotes[p.key] !== undefined && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">
                          {savingNotes[p.key] ? 'saving…' : 'saved ✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── GARAGE NOTES FIELD ──────────────────────────────────────────────────────
function GarageNotesField({ booking, onSave }: { booking: Booking; onSave: (id: string, notes: string) => Promise<void> }) {
  const [text, setText] = useState(booking.garageNotes || '');
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if booking changes (e.g. refresh)
  useEffect(() => {
    setText(booking.garageNotes || '');
    setSaved(true);
  }, [booking.id]);

  function handleChange(val: string) {
    setText(val);
    setSaved(false);
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      setSaving(true);
      await onSave(booking.id, val);
      setSaving(false);
      setSaved(true);
    }, 1500);
  }

  async function handleManualSave() {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    setSaving(true);
    await onSave(booking.id, text);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="border-t border-gray-800 pt-3 mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-yellow-600">🔧 Garage Notes</label>
        <div className="flex items-center gap-2">
          {saving && <span className="text-gray-600 text-[10px] uppercase tracking-wider">Saving…</span>}
          {!saving && saved && text !== '' && <span className="text-gray-600 text-[10px] uppercase tracking-wider">✓ Saved</span>}
          {!saving && !saved && <span className="text-gray-600 text-[10px] uppercase tracking-wider">Unsaved</span>}
          <button onClick={handleManualSave} disabled={saving}
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-yellow-800/60 text-yellow-700 hover:border-yellow-600 hover:text-yellow-500 transition-colors disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Internal notes about this visit — not visible to the customer…"
        rows={2}
        className="w-full bg-black/30 border border-gray-800 focus:border-yellow-700 text-white/80 text-sm px-3 py-2 outline-none resize-none placeholder-gray-700 transition-colors"
      />
    </div>
  );
}

// ── ADMIN SCHEDULE VIEW ─────────────────────────────────────────────────────
export function AdminSchedule() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('gg_admin_auth') === '1');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adminTab, setAdminTab] = useState<'jobs' | 'schedule' | 'history' | 'hub'>('jobs');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [view, setView] = useState<'list' | 'month' | 'week' | 'day'>('list');
  const [calDate, setCalDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  // Re-sync permission when user returns to the app (iOS doesn't push state updates)
  useEffect(() => {
    if (!('Notification' in window)) return;
    const sync = () => setNotifPerm(Notification.permission);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    // Must wait for SW to be active before requesting on iOS
    const reg = await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm !== 'granted') return;

    // Subscribe to Web Push so notifications work when app is closed
    try {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      if (!vapidKey) { alert('Push setup error: VAPID key missing. Check .env file.'); return; }

      const existing = await reg.pushManager.getSubscription();
      const isNew = !existing;
      const subscription = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      if (!subscription) { alert('Push subscription failed — browser returned null.'); return; }

      // Save subscription endpoint to Supabase
      await sbFetch('/push_subscriptions', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          subscription: JSON.stringify(subscription),
        }),
      });

      // Only show confirmation notification the first time (new subscription)
      if (isNew) {
        reg.showNotification('GID Garage Alerts On ✓', {
          body: "You'll get notified of new bookings even when the app is closed.",
          icon: '/favicon-192.png',
          tag: 'gid-notif-test',
        });
      }
    } catch (err: any) {
      alert('Push error: ' + (err?.message ?? String(err)));
    }
  }

  const seenBookingIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);

    // Seed seenBookingIds on initial load — existing bookings never trigger notifications
    getSupabaseBookings().then(data => {
      seenBookingIds.current = new Set(data.map(b => b.id));
      setBookings(data);
      setLoading(false);
    });

    const dataInterval = setInterval(async () => {
      const fresh = await getSupabaseBookings();
      if (seenBookingIds.current) {
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const newOnes = fresh.filter(
          b => !seenBookingIds.current!.has(b.id) &&
               !!b.stripeCustomerId &&
               new Date(b.createdAt).getTime() > tenMinutesAgo
        );
        // Always add all fresh IDs to seen so we don't re-notify on next poll
        fresh.forEach(b => seenBookingIds.current!.add(b.id));
        if (newOnes.length > 0 && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(reg => {
            newOnes.forEach(b => {
              reg.showNotification(`New Booking — ${b.fname} ${b.lname}`, {
                body: `${b.vehicle} · ${b.service} · ${b.date} at ${b.time}`,
                icon: '/favicon-192.png',
                tag: b.id,
                data: { url: '/bookings' },
              });
            });
          });
        }
      }
      setBookings(fresh);
    }, 5 * 60 * 1000);

    return () => clearInterval(dataInterval);
  }, [unlocked]);

  if (!unlocked) return <AdminPasswordGate onUnlock={() => setUnlocked(true)} />;

  async function updateStatus(id: string, status: Booking['status']) {
    updateLocalBooking(id, status);
    try { await updateSupabaseBooking(id, status); } catch (e) { console.warn('Supabase update failed', e); }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  }

  async function saveGarageNotes(id: string, garageNotes: string) {
    updateLocalGarageNotes(id, garageNotes);
    try { await updateSupabaseGarageNotes(id, garageNotes); } catch (e) { console.warn('Supabase garage_notes update failed', e); }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, garageNotes } : b));
  }

  async function deleteBooking(id: string) {
    deleteLocalBooking(id);
    try { await deleteSupabaseBooking(id); } catch (e) { console.warn('Supabase delete failed', e); }
    setBookings(prev => prev.filter(b => b.id !== id));
  }

  const STATUS_ORDER: Record<string, number> = { confirmed: 0, pending: 1, completed: 2, cancelled: 3 };
  const filtered = bookings.filter(b => filter === 'all' || b.status === filter)
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
      if (statusDiff !== 0) return statusDiff;
      return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
    });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const total = bookings.length;

  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  function bookingsForDay(dateStr: string) {
    return bookings.filter(b => b.date === dateStr && b.status !== 'cancelled');
  }

  // ── WEEK VIEW helpers ──
  function getWeekDates(base: Date): Date[] {
    const dow = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }

  const weekDates = getWeekDates(calDate);

  // All possible slots across both weekday/weekend schedules for reference
  const ALL_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];

  function navCalendar(dir: number) {
    if (view === 'month') {
      setCalDate(new Date(calYear, calMonth + dir, 1));
    } else if (view === 'week') {
      const d = new Date(calDate);
      d.setDate(d.getDate() + dir * 7);
      setCalDate(d);
    } else if (view === 'day') {
      const d = new Date(calDate);
      d.setDate(d.getDate() + dir);
      setCalDate(d);
    }
  }

  function calTitle() {
    if (view === 'month') return `${MONTHS[calMonth]} ${calYear}`;
    if (view === 'week') {
      const first = weekDates[0];
      const last = weekDates[6];
      return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${first.getMonth() !== last.getMonth() ? MONTHS[last.getMonth()] + ' ' : ''}${last.getDate()}, ${last.getFullYear()}`;
    }
    if (view === 'day') return calDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return '';
  }

  return (
    <div className="min-h-screen bg-dark py-12 px-4 md:px-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <div>
            <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</p>
            <h1 className="text-4xl font-black text-white tracking-tight">Schedule</h1>
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:gap-2">
            {notifPerm !== 'unsupported' && notifPerm !== 'granted' && (
              <button onClick={requestNotifications}
                className="border border-yellow-700 text-yellow-600 hover:border-yellow-500 hover:text-yellow-400 text-[9px] sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">🔔 Alerts</button>
            )}
            {notifPerm === 'granted' && (
              <span className="text-[9px] sm:text-xs text-green-600 font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">🔔 On</span>
            )}
            <button onClick={() => getSupabaseBookings().then(setBookings)}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-[9px] sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">↻ Refresh</button>
            <button onClick={() => { sessionStorage.removeItem('gg_admin_auth'); setUnlocked(false); }}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-[9px] sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">🔒 Lock</button>
            <a href="/"
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-[9px] sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">← Site</a>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-0 mb-8 border-b border-gray-800">
          {(['jobs', 'schedule', 'history', 'hub'] as const).map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)}
              className={`text-xs font-bold uppercase tracking-widest px-6 py-3 transition-colors border-b-2 -mb-px ${adminTab === tab ? 'border-red-600 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {tab === 'jobs' ? '💼 Jobs' : tab === 'schedule' ? '📅 Schedule' : tab === 'history' ? '🗂️ History' : '🏢 Hub'}
            </button>
          ))}
        </div>

        {adminTab === 'schedule' && (<>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[['Upcoming', upcoming, 'text-red-500'], ['Completed', completed, 'text-green-500'], ['Total', total, 'text-white']].map(([label, val, cls]) => (
            <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
              <div className={`text-3xl font-black ${cls} mb-1`}>{val}</div>
              <div className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + View toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {(['all','confirmed','completed','cancelled'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${filter === f ? 'bg-red-600 border-red-600 text-white' : 'border-gray-700 text-gray-400 hover:border-red-600 hover:text-white'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['list','month','week','day'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${view === v ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-600 font-bold uppercase tracking-wider text-sm">Loading bookings...</div>}

        {/* ── MONTH VIEW ── */}
        {!loading && view === 'month' && (
          <div className="bg-gray-900 border border-gray-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navCalendar(-1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
              <span className="text-white font-black uppercase tracking-wider">{calTitle()}</span>
              <button onClick={() => navCalendar(1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map(d => <div key={d} className="text-center text-gray-600 text-xs font-bold uppercase py-2">{d}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const k = dateKey(calYear, calMonth, d);
                const dayBookings = bookingsForDay(k);
                const isToday = k === today;
                return (
                  <div key={d} className={`min-h-[60px] p-1.5 border text-xs ${isToday ? 'border-red-600' : 'border-gray-800'} bg-gray-900`}>
                    <div className={`font-bold mb-1 ${isToday ? 'text-red-500' : 'text-gray-400'}`}>{d}</div>
                    {dayBookings.slice(0, 2).map(b => (
                      <button key={b.id} onClick={() => setSelectedBooking(b)}
                        className="w-full text-left bg-red-900/50 hover:bg-red-900/80 text-red-300 text-[10px] px-1 py-0.5 mb-0.5 truncate transition-colors cursor-pointer">
                        {b.time} {b.fname}
                      </button>
                    ))}
                    {dayBookings.length > 2 && <div className="text-gray-500 text-[10px]">+{dayBookings.length - 2} more</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ── */}
        {!loading && view === 'week' && (
          <div className="bg-gray-900 border border-gray-800 p-4 mb-6 overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navCalendar(-1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
              <span className="text-white font-black uppercase tracking-wider text-sm">{calTitle()}</span>
              <button onClick={() => navCalendar(1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
            </div>
            <div className="min-w-[600px]">
              {/* Day headers */}
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div className="text-gray-700 text-[10px] font-bold uppercase py-1" />
                {weekDates.map(d => {
                  const dKey = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                  const isToday = dKey === today;
                  return (
                    <div key={dKey} className={`text-center text-xs font-bold uppercase py-1 ${isToday ? 'text-red-500' : 'text-gray-400'}`}>
                      {DAY_LABELS[d.getDay()]} {d.getDate()}
                    </div>
                  );
                })}
              </div>
              {/* Time rows */}
              {ALL_SLOTS.map(slot => (
                <div key={slot} className="grid grid-cols-8 gap-1 border-t border-gray-800">
                  <div className="text-gray-600 text-[10px] py-2 pr-2 text-right font-mono">{slot}</div>
                  {weekDates.map(d => {
                    const dKey = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                    const slotBookings = bookings.filter(b => b.date === dKey && b.time === slot && b.status !== 'cancelled');
                    return (
                      <div key={dKey} className="py-1 min-h-[32px]">
                        {slotBookings.map(b => (
                          <button key={b.id} onClick={() => setSelectedBooking(b)}
                            className="w-full text-left bg-red-900/50 hover:bg-red-900/80 text-red-300 text-[10px] px-1 py-0.5 truncate transition-colors">
                            {b.fname} {b.lname[0]}.
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DAY VIEW ── */}
        {!loading && view === 'day' && (
          <div className="bg-gray-900 border border-gray-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navCalendar(-1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
              <span className="text-white font-black uppercase tracking-wider text-sm">{calTitle()}</span>
              <button onClick={() => navCalendar(1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
            </div>
            {(() => {
              const dKey = dateKey(calDate.getFullYear(), calDate.getMonth(), calDate.getDate());
              const dayBookings = bookingsForDay(dKey).sort((a,b) => a.time.localeCompare(b.time));
              const slots = getSlotsForDate(dKey);
              if (dayBookings.length === 0) {
                return <div className="text-center py-10 text-gray-600 text-sm font-bold uppercase tracking-wider">No appointments</div>;
              }
              return (
                <div className="space-y-2">
                  {slots.map(slot => {
                    const slotBookings = dayBookings.filter(b => b.time === slot);
                    return (
                      <div key={slot} className="grid grid-cols-[80px_1fr] gap-3 border-t border-gray-800 pt-2">
                        <div className="text-gray-600 text-xs font-mono pt-1">{slot}</div>
                        <div className="space-y-1">
                          {slotBookings.length === 0
                            ? <div className="h-6" />
                            : slotBookings.map(b => {
                                const si = SERVICES.find(s => s.id === b.service);
                                return (
                                  <button key={b.id} onClick={() => setSelectedBooking(b)}
                                    className="w-full text-left bg-red-900/40 hover:bg-red-900/70 border border-red-900/60 px-3 py-2 transition-colors">
                                    <span className="text-white text-sm font-bold">{b.fname} {b.lname}</span>
                                    <span className="text-gray-400 text-xs ml-2">{si?.icon} {si?.name}</span>
                                    <span className="text-gray-500 text-xs block mt-0.5">{b.vehicle}</span>
                                  </button>
                                );
                              })
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── LIST VIEW ── */}
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
                <div key={b.id} className={`bg-gray-900 border p-5 flex flex-col gap-3 ${b.status === 'cancelled' ? 'border-gray-800 opacity-50' : b.status === 'completed' ? 'border-green-900' : isPast ? 'border-yellow-900/50' : 'border-gray-800 border-l-4 border-l-red-600'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <button className="flex items-start gap-4 text-left flex-1" onClick={() => setSelectedBooking(b)}>
                      <div className="text-2xl mt-0.5">{svcInfo?.icon ?? '🔧'}</div>
                      <div>
                        <div className="text-white font-bold text-base">{b.fname} {b.lname}</div>
                        <div className="text-gray-400 text-sm">{svcInfo?.name} · {dateStr} at {b.time}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{b.vehicle} · {b.phone}</div>
                        {b.notes && <div className="text-gray-600 text-xs mt-1 italic">"{b.notes}"</div>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 ${
                        b.status === 'confirmed' ? 'bg-red-900/40 text-red-400' :
                        b.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                        'bg-gray-800 text-gray-500'}`}>
                        {b.status}
                      </span>
                      {b.status === 'confirmed' && (
                        <button onClick={() => updateStatus(b.id, 'completed')}
                          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-green-800 text-green-600 hover:bg-green-900/30 transition-colors">✓ Done</button>
                      )}
                      {b.status !== 'cancelled' && (
                        <button onClick={() => { if (confirm('Cancel this appointment?')) updateStatus(b.id, 'cancelled'); }}
                          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-500 transition-colors">✕</button>
                      )}
                      <button onClick={() => { if (confirm(`Permanently delete ${b.fname} ${b.lname}'s appointment? This cannot be undone.`)) deleteBooking(b.id); }}
                        title="Delete permanently"
                        className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-800 text-gray-600 hover:border-red-700 hover:text-red-500 transition-colors">🗑</button>
                    </div>
                  </div>
                  <GarageNotesField booking={b} onSave={saveGarageNotes} />
                </div>
              );
            })}
          </div>
        )}
        </>)}

        {/* ── HISTORY TAB ── */}
        {adminTab === 'history' && (() => {
          const completed = bookings.filter(b => b.status === 'completed')
            .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
          return (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white">Completed Appointments</h2>
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mt-1">{completed.length} total</p>
                </div>
              </div>
              {completed.length === 0 && (
                <div className="text-center py-20 text-gray-600 font-bold uppercase tracking-wider text-sm">No completed appointments yet</div>
              )}
              <div className="space-y-3">
                {completed.map(b => {
                  const svcInfo = SERVICES.find(s => s.id === b.service);
                  const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <div key={b.id} className="bg-gray-900 border border-green-900/50 p-5 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="text-2xl mt-0.5">{svcInfo?.icon ?? '🔧'}</div>
                          <div>
                            <div className="text-white font-bold text-base">{b.fname} {b.lname}</div>
                            <div className="text-gray-400 text-sm">{svcInfo?.name} · {dateStr} at {b.time}</div>
                            <div className="text-gray-500 text-xs mt-0.5">{b.vehicle} · {b.phone}</div>
                            {b.notes && <div className="text-gray-600 text-xs mt-1 italic">"{b.notes}"</div>}
                            <div className="text-gray-700 text-xs mt-1 font-mono">{b.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-green-900/40 text-green-400">Completed</span>
                          <button
                            onClick={() => { if (confirm('Move this back to confirmed? (Marked complete by accident)')) updateStatus(b.id, 'confirmed'); }}
                            title="Undo — move back to confirmed"
                            className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-700 text-gray-500 hover:border-yellow-600 hover:text-yellow-400 transition-colors">
                            ↩ Undo
                          </button>
                          <button
                            onClick={() => { if (confirm(`Permanently delete ${b.fname} ${b.lname}'s appointment? This cannot be undone.`)) deleteBooking(b.id); }}
                            title="Delete permanently"
                            className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-800 text-gray-600 hover:border-red-700 hover:text-red-500 transition-colors">
                            🗑
                          </button>
                        </div>
                      </div>
                      <GarageNotesField booking={b} onSave={saveGarageNotes} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdate={updateStatus}
          onBookingPatched={(updated) => {
            setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
            setSelectedBooking(prev => prev ? { ...prev, ...updated } : prev);
          }}
        />
      )}

      {adminTab === 'jobs' && <JobsTab />}
      {adminTab === 'hub' && <BusinessHub />}
    </div>
  );
}
