import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

const PHONE = '480-599-0118';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY as string;
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
      garageNotes: b.garage_notes || '',
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
      garage_notes: b.garageNotes || '',
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

async function updateSupabaseGarageNotes(id: string, garageNotes: string): Promise<void> {
  await sbFetch(`/bookings?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ garage_notes: garageNotes }),
  });
}

async function deleteSupabaseBooking(id: string): Promise<void> {
  await sbFetch(`/bookings?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' },
  });
}

function deleteLocalBooking(id: string) {
  const all = getLocalBookings().filter(b => b.id !== id);
  localStorage.setItem('gg_bookings', JSON.stringify(all));
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
  { id: 'oil',        icon: '🛢️', name: 'Oil Change',   desc: 'Full synthetic only — your engine deserves it',            duration: '30 min',   startingAt: '$79.99*' },
  { id: 'brakes',     icon: '🔧', name: 'Brakes',        desc: 'Pads, rotors, full brake service',                         duration: '2 hrs',    startingAt: null },
  { id: 'diag',       icon: '💻', name: 'Diagnostics',   desc: 'Check engine & system scan',                               duration: '1 hr',     startingAt: null },
  { id: 'suspension', icon: '🚗', name: 'Suspension',    desc: 'Shocks, struts, control arms & more',                      duration: '2–3 hrs',  startingAt: null },
  { id: 'audio',      icon: '🔊', name: 'Car Audio',     desc: 'Head units, speakers, amps & full system installs',        duration: 'Varies',   startingAt: null, depositNote: true },
  { id: 'full',       icon: '✅', name: 'Full Service',  desc: 'Multi-point inspection',                                   duration: '1.5 hrs',  startingAt: null },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Mon–Fri 1pm–8pm, Sat–Sun 8am–5pm — resolved at selection time
const WEEKDAY_SLOTS = ['1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];
const WEEKEND_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

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

// ── VEHICLE API ─────────────────────────────────────────────────────────────────
const _cache: Record<string, any> = {};

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (_cache[key] !== undefined) return _cache[key];
  const result = await fetcher();
  _cache[key] = result;
  return result;
}

const US_MAKES: { name: string; from: number; to: number }[] = [
  { name: 'Acura',         from: 1986, to: 9999 },
  { name: 'Audi',          from: 1981, to: 9999 },
  { name: 'BMW',           from: 1981, to: 9999 },
  { name: 'Buick',         from: 1981, to: 9999 },
  { name: 'Cadillac',      from: 1981, to: 9999 },
  { name: 'Chevrolet',     from: 1981, to: 9999 },
  { name: 'Chrysler',      from: 1981, to: 9999 },
  { name: 'Dodge',         from: 1981, to: 9999 },
  { name: 'Ford',          from: 1981, to: 9999 },
  { name: 'Genesis',       from: 2016, to: 9999 },
  { name: 'GMC',           from: 1981, to: 9999 },
  { name: 'Honda',         from: 1981, to: 9999 },
  { name: 'Hyundai',       from: 1986, to: 9999 },
  { name: 'Infiniti',      from: 1989, to: 9999 },
  { name: 'Jaguar',        from: 1981, to: 9999 },
  { name: 'Jeep',          from: 1981, to: 9999 },
  { name: 'Kia',           from: 1994, to: 9999 },
  { name: 'Lexus',         from: 1989, to: 9999 },
  { name: 'Lincoln',       from: 1981, to: 9999 },
  { name: 'Lucid',         from: 2021, to: 9999 },
  { name: 'Mazda',         from: 1981, to: 9999 },
  { name: 'Mercedes-Benz', from: 1981, to: 9999 },
  { name: 'Mini',          from: 2002, to: 9999 },
  { name: 'Mitsubishi',    from: 1981, to: 9999 },
  { name: 'Mercury',       from: 1981, to: 2011 },
  { name: 'Nissan',        from: 1981, to: 9999 },
  { name: 'Oldsmobile',    from: 1981, to: 2004 },
  { name: 'Polestar',      from: 2020, to: 9999 },
  { name: 'Porsche',       from: 1981, to: 9999 },
  { name: 'Pontiac',       from: 1981, to: 2010 },
  { name: 'RAM',           from: 2010, to: 9999 },
  { name: 'Rivian',        from: 2021, to: 9999 },
  { name: 'Saturn',        from: 1990, to: 2010 },
  { name: 'Subaru',        from: 1981, to: 9999 },
  { name: 'Tesla',         from: 2008, to: 9999 },
  { name: 'Toyota',        from: 1981, to: 9999 },
  { name: 'Volkswagen',    from: 1981, to: 9999 },
  { name: 'Volvo',         from: 1981, to: 9999 },
];

function fetchMakes(year: string): Promise<string[]> {
  const y = parseInt(year, 10);
  return Promise.resolve(US_MAKES.filter(m => y >= m.from && y <= m.to).map(m => m.name).sort());
}

async function fetchModels(year: string, make: string): Promise<string[]> {
  return cachedFetch(`models-${year}-${make}`, async () => {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
    );
    const data = await res.json();
    const models: string[] = (data.Results || []).map((m: any) => m.Model_Name as string).sort();
    return [...new Set(models)];
  });
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

  useEffect(() => {
    if (!form.vehicleYear) { setMakes([]); return; }
    setLoadingMakes(true);
    fetchMakes(form.vehicleYear).then(setMakes).finally(() => setLoadingMakes(false));
  }, [form.vehicleYear]);

  useEffect(() => {
    if (!form.vehicleYear || !form.vehicleMake) { setModels([]); return; }
    setLoadingModels(true);
    fetchModels(form.vehicleYear, form.vehicleMake).then(setModels).finally(() => setLoadingModels(false));
  }, [form.vehicleYear, form.vehicleMake]);

  const baseSelect = 'w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors disabled:text-gray-600 disabled:cursor-not-allowed appearance-none border';
  const sc = (field: string) => baseSelect + (errors[field] ? ' border-red-500 focus:border-red-400' : ' border-gray-800 focus:border-red-600');
  const baseInput = 'w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none transition-colors disabled:text-gray-600 disabled:cursor-not-allowed placeholder-gray-600 border';
  const ic = (field: string) => baseInput + (errors[field] ? ' border-red-500 focus:border-red-400' : ' border-gray-800 focus:border-red-600');

  return (
    <div className="col-span-2">
      <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${(errors.vehicleYear||errors.vehicleMake||errors.vehicleModel) ? 'text-red-500' : 'text-gray-500'}`}>Vehicle</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          {errors.vehicleYear && <p className="text-red-500 text-xs mb-1">{errors.vehicleYear}</p>}
          <select className={sc('vehicleYear')} value={form.vehicleYear}
            onChange={e => { setForm(p => ({ ...p, vehicleYear: e.target.value, vehicleMake: '', vehicleModel: '', vehicleTrim: '' })); clearError('vehicleYear'); clearError('vehicleMake'); clearError('vehicleModel'); }}>
            <option value="">Year</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div>
          {errors.vehicleMake && <p className="text-red-500 text-xs mb-1">{errors.vehicleMake}</p>}
          <select className={sc('vehicleMake')} value={form.vehicleMake} disabled={!form.vehicleYear || loadingMakes}
            onChange={e => { setForm(p => ({ ...p, vehicleMake: e.target.value, vehicleModel: '', vehicleTrim: '' })); clearError('vehicleMake'); clearError('vehicleModel'); }}>
            <option value="">{loadingMakes ? 'Loading…' : 'Make'}</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          {errors.vehicleModel && <p className="text-red-500 text-xs mb-1">{errors.vehicleModel}</p>}
          <select className={sc('vehicleModel')} value={form.vehicleModel} disabled={!form.vehicleMake || loadingModels}
            onChange={e => { setForm(p => ({ ...p, vehicleModel: e.target.value, vehicleTrim: '' })); clearError('vehicleModel'); }}>
            <option value="">{loadingModels ? 'Loading…' : 'Model'}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <input type="text" className={ic('vehicleTrim')} placeholder="Trim" value={form.vehicleTrim}
            disabled={!form.vehicleModel}
            onChange={e => { setForm(p => ({ ...p, vehicleTrim: e.target.value })); clearError('vehicleTrim'); }} />
        </div>
      </div>
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
// Simple hash so customers can't guess/forge cancel links
async function generateCancelToken(bookingId: string): Promise<string> {
  const secret = 'gid-garage-cancel-secret-2024';
  const data = bookingId + secret;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function verifyCancelToken(bookingId: string, token: string): Promise<boolean> {
  const expected = await generateCancelToken(bookingId);
  return expected === token;
}

async function sendCancellationNotification(booking: Booking) {
  const svc = SERVICES.find(s => s.id === booking.service);
  const dateStr = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const customerName = `${booking.fname} ${booking.lname}`;

  // Notify owner
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GID Garage Bookings', email: 'bookings@gidgarage.com' },
      to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
      subject: `❌ Cancellation: ${customerName} — ${svc?.name} on ${dateStr}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <h2 style="background:#991b1b;color:#fff;padding:16px 20px;margin:0;">Appointment Cancelled — GID Garage</h2>
          <div style="padding:24px 20px;border:1px solid #e5e7eb;">
            <p>The following appointment was cancelled by the customer:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;width:40%;">Customer</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${customerName}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Phone</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">${booking.phone}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Service</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${svc?.name ?? booking.service}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Date</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${dateStr}</td></tr>
              <tr><td style="padding:8px;color:#6b7280;">Time</td><td style="padding:8px;font-weight:600;">${booking.time}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:13px;">This slot is now open again.</p>
          </div>
        </div>
      `,
    }),
  });

  // Confirm to customer
  if (booking.email) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
        to: [{ email: booking.email, name: customerName }],
        subject: 'Your GID Garage appointment has been cancelled',
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <h2 style="background:#991b1b;color:#fff;padding:16px 20px;margin:0;">Appointment Cancelled</h2>
            <div style="padding:24px 20px;border:1px solid #e5e7eb;">
              <p>Hi ${booking.fname},</p>
              <p>Your appointment for <strong>${svc?.name ?? booking.service}</strong> on <strong>${dateStr} at ${booking.time}</strong> has been cancelled.</p>
              <p>If you'd like to reschedule, just visit our site or give us a call.</p>
              <p style="margin-top:24px;">Questions? Call us at <strong>480-599-0118</strong></p>
              <p style="color:#6b7280;font-size:13px;">— GID Garage</p>
            </div>
          </div>
        `,
      }),
    });
  }
}

async function sendEmail(booking: Booking) {
  const svc = SERVICES.find(s => s.id === booking.service);
  const dateStr = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  // Build a detailed service name that includes the selected sub-option
  let serviceName = svc?.name ?? booking.service;
  const notes = booking.notes || '';
  if (booking.service === 'brakes') {
    const match = notes.match(/Brake service: ([^|]+)/);
    if (match) {
      const slug = match[1].trim();
      serviceName = `Brakes — ${BRAKE_LABELS[slug] ?? slug}`;
    }
  } else if (booking.service === 'suspension') {
    const match = notes.match(/Suspension: ([^|]+)/);
    if (match) {
      const slug = match[1].trim();
      serviceName = `Suspension — ${slug}`;
    }
  } else if (booking.service === 'audio') {
    const match = notes.match(/Audio package: ([^|]+)/);
    if (match) {
      const slug = match[1].trim();
      serviceName = `Car Audio — ${AUDIO_LABELS[slug] ?? slug}`;
    }
  }

  const customerName = `${booking.fname} ${booking.lname}`;
  const cancelToken = await generateCancelToken(booking.id);
  const cancelUrl = `${window.location.origin}/?cancel=${booking.id}&token=${cancelToken}`;

  const emailBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <h2 style="background:#b91c1c;color:#fff;padding:16px 20px;margin:0;">GID Garage — Booking Confirmation</h2>
      <div style="padding:24px 20px;border:1px solid #e5e7eb;">
        <p>Hi ${customerName},</p>
        <p>Your appointment has been confirmed. Here are your details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;width:40%;">Service</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${serviceName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Date</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${dateStr}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Time</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${booking.time}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Vehicle</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${booking.vehicle}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Notes</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">${booking.notes || 'None'}</td></tr>
          <tr><td style="padding:8px;color:#6b7280;">Booking ID</td><td style="padding:8px;font-family:monospace;font-size:12px;">${booking.id}</td></tr>
        </table>
        <p style="margin-top:24px;">Questions? Call us at <strong>480-599-0118</strong></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="font-size:13px;color:#6b7280;">Need to cancel? Please do so at least 24 hours in advance.</p>
        <a href="${cancelUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#111;color:#ef4444;border:1px solid #ef4444;font-size:13px;font-weight:600;text-decoration:none;">Cancel My Appointment</a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">— GID Garage</p>
      </div>
    </div>
  `;

  const ownerBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <h2 style="background:#b91c1c;color:#fff;padding:16px 20px;margin:0;">New Booking — GID Garage</h2>
      <div style="padding:24px 20px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;width:40%;">Customer</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${customerName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Phone</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">${booking.phone}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Email</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">${booking.email}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Service</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${serviceName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Date</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${dateStr}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Time</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${booking.time}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">Vehicle</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">${booking.vehicle}</td></tr>
          <tr><td style="padding:8px;color:#6b7280;">Notes</td><td style="padding:8px;">${booking.notes || 'None'}</td></tr>
        </table>
      </div>
    </div>
  `;

  // Send to customer via Brevo template
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
      to: [{ email: booking.email, name: customerName }],
      templateId: 1,
      params: {
        to_name: booking.fname,
        service_name: serviceName,
        appointment_date: dateStr,
        appointment_time: booking.time,
        vehicle: booking.vehicle,
        notes: booking.notes || 'None',
        booking_id: booking.id,
        cancel_url: cancelUrl,
      },
    }),
  });

  // Send to owner (plain HTML — template is customer-facing)
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'GID Garage Bookings', email: 'bookings@gidgarage.com' },
      to: [{ email: 'gidgarageaz@hotmail.com', name: 'GID Garage' }],
      subject: `New Booking: ${customerName} — ${serviceName} on ${dateStr}`,
      htmlContent: ownerBody,
    }),
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
function updateLocalGarageNotes(id: string, garageNotes: string) {
  const all = getLocalBookings().map(b => b.id === id ? { ...b, garageNotes } : b);
  localStorage.setItem('gg_bookings', JSON.stringify(all));
}

// ── BOOKING WIDGET ──────────────────────────────────────────────────────────
interface State {
  step: number; service: string | null; date: string | null;
  time: string | null; calYear: number; calMonth: number;
  suspensionPart: string | null; brakeService: string | null; audioPackage: string | null;
}
const INIT_STATE: State = {
  step: 1, service: null, date: null, time: null,
  calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
  suspensionPart: null, brakeService: null, audioPackage: null,
};
const INIT_FORM: FormData = { fname: '', lname: '', phone: '', email: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleTrim: '', notes: '' };

export { verifyCancelToken, updateSupabaseBooking, deleteLocalBooking, sendCancellationNotification, getSupabaseBookings };

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

  function selectService(id: string) { setS(p => ({ ...p, service: id, step: Math.max(p.step, 2) })); }
  function selectDate(k: string) { setS(p => ({ ...p, date: k, time: null, step: Math.max(p.step, 3) })); }
  function selectTime(t: string) { setS(p => ({ ...p, time: t, step: Math.max(p.step, 4) })); }
  function prevMonth() { setS(p => p.calMonth === 0 ? { ...p, calMonth: 11, calYear: p.calYear - 1 } : { ...p, calMonth: p.calMonth - 1 }); }
  function nextMonth() { setS(p => p.calMonth === 11 ? { ...p, calMonth: 0, calYear: p.calYear + 1 } : { ...p, calMonth: p.calMonth + 1 }); }

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCancelPolicy, setShowCancelPolicy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    const errors: Record<string, string> = {};
    if (!form.fname) errors.fname = 'First name is required';
    if (!form.phone) errors.phone = 'Phone number is required';
    if (!form.vehicleYear) errors.vehicleYear = 'Select a year';
    if (!form.vehicleMake) errors.vehicleMake = 'Select a make';
    if (!form.vehicleModel) errors.vehicleModel = 'Select a model';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSubmitError(null);
    if (!s.service || !s.date || !s.time || !svc) return;
    setSubmitting(true);
    const booking: Booking = {
      id: `GID-${Date.now()}`,
      service: s.service, serviceIcon: svc.icon,
      date: s.date, time: s.time,
      fname: form.fname, lname: form.lname, phone: form.phone, email: form.email,
      vehicle: vehicleString(form),
      notes: [
        s.suspensionPart ? `Suspension: ${SUSPENSION_LABELS[s.suspensionPart] ?? s.suspensionPart.replace(/_/g, ' ')}` : '',
        s.brakeService ? `Brake service: ${BRAKE_LABELS[s.brakeService] ?? s.brakeService.replace(/_/g, ' ')}` : '',
        s.audioPackage ? `Audio package: ${AUDIO_LABELS[s.audioPackage] ?? s.audioPackage}` : '',
        form.notes,
      ].filter(Boolean).join(' | '),
      garageNotes: '',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    saveLocalBooking(booking);
    try {
      await insertSupabaseBooking(booking);
    } catch (e: any) {
      deleteLocalBooking(booking.id);
      setSubmitting(false);
      // Unique constraint violation = slot was just taken
      if (e?.message?.includes('unique') || e?.message?.includes('duplicate') || e?.message?.includes('23505')) {
        setSubmitError('Sorry, that time slot was just booked by someone else. Please go back and choose a different time.');
      } else {
        setSubmitError('Something went wrong. Please try again or call us directly.');
      }
      return;
    }
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
        <button onClick={() => setOpen(true)} className="btn-primary text-xs px-8 py-4">Get a Quote</button>
      )}

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/85 overflow-y-auto flex items-start justify-center p-4 md:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-dark w-full max-w-2xl relative p-8 md:p-10 my-4">
            <button onClick={closeModal} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center text-lg transition-colors" aria-label="Close">✕</button>

            {submitted ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-3xl font-black text-white mb-3">Request Received!</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  We've received your quote request for <span className="text-red-500 font-bold">{svc?.name}</span>.<br />We'll call you to confirm availability and pricing.<br />
                  <span className="text-red-500 font-bold">{dateStr} at {s.time}</span>.<br /><br />
                  A confirmation has been sent to {form.email || 'your email'}.
                </p>
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
                  <p className="text-gray-700 text-[10px] mt-1">Mon–Fri: 1 PM–8 PM · Sat–Sun: 8 AM–5 PM</p>
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
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'fname', label: 'First Name', placeholder: 'John', type: 'text' },
                      { id: 'lname', label: 'Last Name', placeholder: 'Smith', type: 'text' },
                      { id: 'phone', label: 'Phone', placeholder: '928-555-0100', type: 'tel' },
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
                      <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">Notes (optional)</label>
                      <textarea placeholder="Anything we should know? Address, gate code, specific concern..." value={form.notes}
                        onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors resize-y" />
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs mt-3">By booking, you agree to our <button type="button" onClick={() => setShowCancelPolicy(true)} className="text-red-500 hover:text-red-400 underline underline-offset-2 transition-colors">cancellation policy</button>. Please cancel at least 24 hours in advance to avoid a cancellation fee.</p>
                  {submitError && (
                    <div className="mt-4 bg-red-950/50 border border-red-700 text-red-400 text-sm px-4 py-3">
                      {submitError}
                    </div>
                  )}
                  <button onClick={handleSubmit} disabled={submitting}
                    className={`btn-primary w-full mt-4 py-4 text-sm ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
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
function BookingDetailModal({ booking, onClose, onUpdate }: { booking: Booking; onClose: () => void; onUpdate: (id: string, status: Booking['status']) => void }) {
  const svcInfo = SERVICES.find(s => s.id === booking.service);
  const dateStr = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0f0f0f] border border-gray-800 w-full max-w-md p-7 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">✕</button>
        <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Appointment</p>
        <h2 className="text-2xl font-black text-white mb-5">{booking.fname} {booking.lname}</h2>
        <div className="space-y-3 mb-6">
          {[
            ['Service', `${svcInfo?.icon ?? '🔧'} ${svcInfo?.name ?? booking.service}`],
            ['Date', dateStr],
            ['Time', booking.time],
            ['Vehicle', booking.vehicle || '—'],
            ['Phone', booking.phone],
            ['Email', booking.email || '—'],
            ['Booking ID', booking.id],
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
        <div className="flex gap-2">
          {booking.status === 'confirmed' && (
            <button onClick={() => { onUpdate(booking.id, 'completed'); onClose(); }}
              className="flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border border-green-800 text-green-600 hover:bg-green-900/30 transition-colors">✓ Mark Done</button>
          )}
          {booking.status !== 'cancelled' && (
            <button onClick={() => { if (confirm('Cancel this appointment?')) { onUpdate(booking.id, 'cancelled'); onClose(); } }}
              className="flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-500 transition-colors">✕ Cancel</button>
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
  const [adminTab, setAdminTab] = useState<'schedule' | 'history'>('schedule');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [view, setView] = useState<'list' | 'month' | 'week' | 'day'>('list');
  const [calDate, setCalDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    getSupabaseBookings().then(data => { setBookings(data); setLoading(false); });
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(() => { getSupabaseBookings().then(setBookings); }, 30000);
    return () => clearInterval(interval);
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

  const filtered = bookings.filter(b => filter === 'all' || b.status === filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

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
    <div className="min-h-screen bg-dark py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</p>
            <h1 className="text-4xl font-black text-white tracking-tight">Schedule</h1>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={() => getSupabaseBookings().then(setBookings)}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">↻ Refresh</button>
            <button onClick={() => { sessionStorage.removeItem('gg_admin_auth'); setUnlocked(false); }}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">Lock</button>
            <a href="/" className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">← Site</a>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-0 mb-8 border-b border-gray-800">
          {(['schedule', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)}
              className={`text-xs font-bold uppercase tracking-widest px-6 py-3 transition-colors border-b-2 -mb-px ${adminTab === tab ? 'border-red-600 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {tab === 'schedule' ? '📅 Schedule' : '🗂️ History'}
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
        />
      )}
    </div>
  );
}
