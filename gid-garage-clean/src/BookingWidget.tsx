import { useState, useEffect } from 'react';

const PHONE = '480-599-0118';

// ── CONFIG ─────────────────────────────────────────────────────────────────
// 1. Deploy the Google Apps Script (see SETUP.md) and paste the URL here
const APPS_SCRIPT_URL = 'https://script.google.com/u/0/home/projects/1PSaSoQyvK4ftj1D-LpeF5E7Rk_kBXb87Oo8cJqu6BCUWZJ_cVMfZJ69S/edit';
// 2. Sign up at emailjs.com, create a service + template, paste IDs here
const EMAILJS_SERVICE_ID = 'service_iqxe9z8';
const EMAILJS_TEMPLATE_ID = 'template_gy3tfmn';
const EMAILJS_PUBLIC_KEY = 'HRHZO34OJFxrK5DE0';
// ───────────────────────────────────────────────────────────────────────────

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
  email: string; vehicle: string; notes: string;
}

// Load EmailJS lazily
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
  const params = {
    to_name: `${booking.fname} ${booking.lname}`,
    to_email: booking.email,
    owner_email: 'gidgarageaz@gmail.com',
    service_name: svc?.name,
    appointment_date: dateStr,
    appointment_time: booking.time,
    vehicle: booking.vehicle,
    phone: booking.phone,
    notes: booking.notes || 'None',
    booking_id: booking.id,
  };
  await (window as any).emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
}

async function saveToSheet(booking: Booking) {
  if (APPS_SCRIPT_URL === 'https://script.google.com/u/0/home/projects/1PSaSoQyvK4ftj1D-LpeF5E7Rk_kBXb87Oo8cJqu6BCUWZJ_cVMfZJ69S/edit') return; // not configured yet
  const svc = SERVICES.find(s => s.id === booking.service);
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: booking.id,
      date: booking.date,
      time: booking.time,
      service: svc?.name,
      name: `${booking.fname} ${booking.lname}`,
      phone: booking.phone,
      email: booking.email,
      vehicle: booking.vehicle,
      notes: booking.notes,
      status: booking.status,
      createdAt: booking.createdAt,
    }),
  });
}

// Local storage helpers
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
const INIT_FORM: FormData = { fname: '', lname: '', phone: '', email: '', vehicle: '', notes: '' };

export default function BookingWidget() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<State>(INIT_STATE);
  const [form, setForm] = useState<FormData>(INIT_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);

  const svc = SERVICES.find(x => x.id === s.service);

  // Load booked times for selected date from local storage
  useEffect(() => {
    if (!s.date) return;
    const existing = getLocalBookings()
      .filter(b => b.date === s.date && b.status !== 'cancelled')
      .map(b => b.time);
    setBookedTimes(existing);
  }, [s.date]);

  function parseSlotHour(t: string) {
    const [time, meridiem] = t.split(' ');
    const h = parseInt(time.split(':')[0]);
    if (meridiem === 'PM' && h !== 12) return h + 12;
    if (meridiem === 'AM' && h === 12) return 0;
    return h;
  }

  function isAvailable(y: number, m: number, d: number) {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(y, m, d) < today) return false;
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
    const k = dateKey(y, m, d);
    const takenTimes = getLocalBookings().filter(b => b.date === k && b.status !== 'cancelled').map(b => b.time);
    const availableSlots = TIME_SLOTS.filter(t => {
      if (takenTimes.includes(t)) return false;
      if (isToday && parseSlotHour(t) <= now.getHours()) return false;
      return true;
    });
    return availableSlots.length > 0;
  }

  function selectService(id: string) { setS(p => ({ ...p, service: id, step: Math.max(p.step, 2) })); }
  function selectDate(k: string) {
    setS(p => ({ ...p, date: k, time: null, step: Math.max(p.step, 3) }));
  }
  function selectTime(t: string) { setS(p => ({ ...p, time: t, step: Math.max(p.step, 4) })); }
  function prevMonth() { setS(p => p.calMonth === 0 ? { ...p, calMonth: 11, calYear: p.calYear - 1 } : { ...p, calMonth: p.calMonth - 1 }); }
  function nextMonth() { setS(p => p.calMonth === 11 ? { ...p, calMonth: 0, calYear: p.calYear + 1 } : { ...p, calMonth: p.calMonth + 1 }); }

  async function handleSubmit() {
    if (!form.fname || !form.phone || !form.vehicle) {
      alert('Please fill in your name, phone, and vehicle info.');
      return;
    }
    if (!s.service || !s.date || !s.time || !svc) return;
    setSubmitting(true);
    const booking: Booking = {
      id: `GG-${Date.now()}`,
      service: s.service, serviceIcon: svc.icon,
      date: s.date, time: s.time,
      ...form,
      notes: [
        s.suspensionPart ? `Suspension part: ${s.suspensionPart.replace(/_/g, ' ')}` : '',
        s.brakeService ? `Brake service: ${s.brakeService.replace(/_/g, ' ')}` : '',
        form.notes,
      ].filter(Boolean).join(' | '),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    saveLocalBooking(booking);
    try { await saveToSheet(booking); } catch (e) { console.warn('Sheet save failed', e); }
    try { await sendEmail(booking); } catch (e) { console.warn('Email send failed', e); }
    setSubmitting(false);
    setSubmitted(true);
  }

  function reset() { setS(INIT_STATE); setForm(INIT_FORM); setSubmitted(false); }
  function closeModal() { setOpen(false); }

  const firstDay = new Date(s.calYear, s.calMonth, 1).getDay();
  const daysInMonth = new Date(s.calYear, s.calMonth + 1, 0).getDate();
  const dateStr = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-xs px-8 py-4">
        Book Now
      </button>

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

                {/* Step 1 */}
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

                {/* Suspension part dropdown */}
                {s.service === 'suspension' && (
                  <div className="mt-3">
                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What are you looking to replace?</label>
                    <select
                      value={s.suspensionPart ?? ''}
                      onChange={e => setS(p => ({ ...p, suspensionPart: e.target.value }))}
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

                {/* Brakes service dropdown */}
                {s.service === 'brakes' && (
                  <div className="mt-3">
                    <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">What brake service do you need?</label>
                    <select
                      value={s.brakeService ?? ''}
                      onChange={e => setS(p => ({ ...p, brakeService: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors">
                      <option value="">Select a service...</option>
                      <option value="pads">Brake Pads Only — Starting at $99</option>
                      <option value="pads_rotors">Brake Pads + Rotors — Starting at $179</option>
                      <option value="full">Full Service: Pads + Rotors + Fluid Flush &amp; Inspection — Starting at $229</option>
                    </select>
                    <p className="text-gray-600 text-xs mt-1">Pricing varies per vehicle — get a free estimate when you book!</p>
                  </div>
                )}

                {/* Oil change note */}
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
                      const avail = isAvailable(s.calYear, s.calMonth, d);
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

                {/* Step 3 */}
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

                {/* Step 4 */}
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
                      { id: 'vehicle', label: 'Vehicle (Year, Make, Model)', placeholder: 'e.g. 2019 Toyota Camry', type: 'text', full: true },
                    ].map(f => (
                      <div key={f.id} className={f.full ? 'col-span-2' : ''}>
                        <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder}
                          value={form[f.id as keyof FormData]}
                          onChange={e => setForm(p => ({ ...p, [f.id]: e.target.value }))}
                          className="w-full bg-gray-900 border border-gray-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors" />
                      </div>
                    ))}
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

// ── ADMIN SCHEDULE VIEW ─────────────────────────────────────────────────────
export function AdminSchedule() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calDate, setCalDate] = useState(new Date());

  useEffect(() => { setBookings(getLocalBookings()); }, []);

  function updateStatus(id: string, status: Booking['status']) {
    updateLocalBooking(id, status);
    setBookings(getLocalBookings());
  }

  const filtered = bookings
    .filter(b => filter === 'all' || b.status === filter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const total = bookings.length;

  // Calendar view helpers
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin</p>
            <h1 className="text-4xl font-black text-white tracking-tight">Schedule</h1>
          </div>
          <a href="/" className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors">← Back to Site</a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[['Upcoming', upcoming, 'text-red-500'], ['Completed', completed, 'text-green-500'], ['Total', total, 'text-white']].map(([label, val, cls]) => (
            <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
              <div className={`text-3xl font-black ${cls} mb-1`}>{val}</div>
              <div className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
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

        {/* Calendar View */}
        {view === 'calendar' && (
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

        {/* List View */}
        {view === 'list' && (
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
