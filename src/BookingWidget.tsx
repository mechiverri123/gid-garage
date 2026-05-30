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


function vehicleString(f: FormData): string {
  const parts = [f.vehicleYear, f.vehicleMake, f.vehicleModel, f.vehicleTrim].filter(Boolean);
  return parts.join(' ');
}

// ── VEHICLE API (NHTSA + CarQuery) ───────────────────────────────────────────
// Simple in-memory cache so we don't hammer the APIs
const _cache: Record<string, any> = {};

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (_cache[key] !== undefined) return _cache[key];
  const result = await fetcher();
  _cache[key] = result;
  return result;
}

// NHTSA: get all passenger car/truck makes for a given year
async function fetchMakes(year: string): Promise<string[]> {
  return cachedFetch(`makes-${year}`, async () => {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json`
    );
    // NHTSA doesn't filter makes by year in the car endpoint, so we use
    // GetModelsForMakeYear to get only makes that had models that year.
    // Instead, use the all-makes-for-type and then rely on the model fetch to validate.
    // Better: use GetMakesForVehicleType=Passenger Car
    const data = await res.json();
    const makes: string[] = (data.Results || [])
      .map((m: any) => m.MakeName as string)
      .filter((name: string) => /^[A-Za-z]/.test(name)) // skip numeric/junk
      .sort();
    // deduplicate
    return [...new Set(makes)];
  });
}

// NHTSA: get models for a year + make
async function fetchModels(year: string, make: string): Promise<string[]> {
  return cachedFetch(`models-${year}-${make}`, async () => {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
    );
    const data = await res.json();
    const models: string[] = (data.Results || [])
      .map((m: any) => m.Model_Name as string)
      .sort();
    return [...new Set(models)];
  });
}



// ── VEHICLE SELECTOR COMPONENT ───────────────────────────────────────────────
function VehicleSelector({ form, setForm }: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1980 + 1 }, (_, i) => currentYear - i);

  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  // Load makes when year changes
  useEffect(() => {
    if (!form.vehicleYear) { setMakes([]); return; }
    setLoadingMakes(true);
    fetchMakes(form.vehicleYear)
      .then(setMakes)
      .finally(() => setLoadingMakes(false));
  }, [form.vehicleYear]);

  // Load models when make changes
  useEffect(() => {
    if (!form.vehicleYear || !form.vehicleMake) { setModels([]); return; }
    setLoadingModels(true);
    fetchModels(form.vehicleYear, form.vehicleMake)
      .then(setModels)
      .finally(() => setLoadingModels(false));
  }, [form.vehicleYear, form.vehicleMake]);

  const selectClass = 'w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed appearance-none';
  const inputClass = 'w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed placeholder-gray-600';

  return (
    <div className="col-span-2">
      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Vehicle</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Year */}
        <div>
          <select
            className={selectClass}
            value={form.vehicleYear}
            onChange={e => setForm(p => ({ ...p, vehicleYear: e.target.value, vehicleMake: '', vehicleModel: '', vehicleTrim: '' }))}
          >
            <option value="">Year</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>

        {/* Make */}
        <div>
          <select
            className={selectClass}
            value={form.vehicleMake}
            disabled={!form.vehicleYear || loadingMakes}
            onChange={e => setForm(p => ({ ...p, vehicleMake: e.target.value, vehicleModel: '', vehicleTrim: '' }))}
          >
            <option value="">{loadingMakes ? 'Loading…' : 'Make'}</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Model */}
        <div>
          <select
            className={selectClass}
            value={form.vehicleModel}
            disabled={!form.vehicleMake || loadingModels}
            onChange={e => setForm(p => ({ ...p, vehicleModel: e.target.value, vehicleTrim: '' }))}
          >
            <option value="">{loadingModels ? 'Loading…' : 'Model'}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Trim — plain text input, no broken API needed */}
        <div>
          <input
            type="text"
            className={inputClass}
            placeholder="Trim (optional)"
            value={form.vehicleTrim}
            disabled={!form.vehicleModel}
            onChange={e => setForm(p => ({ ...p, vehicleTrim: e.target.value }))}
          />
        </div>
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
