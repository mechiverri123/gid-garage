// Admin-only screens split out of BookingWidget.tsx so the public booking form
// (and the homepage) never download admin code: the PIN gate, garage notes,
// blackout dates and the Schedule dashboard.
import { useState, useEffect, useRef } from 'react';
import { JobsTab, BusinessHub, MileageTab, JobDetailPanel, getJobById, getAllJobs, OwnerPayPanel, CustomersTab, type Job } from './JobOps';
import { FleetAdminTab } from './fleet/FleetAdminTab';
import { HelperPay } from './pay/HelperPay';
import { WEEKEND_SLOTS, slotMinutes } from '../shared/booking-slots.js';
import { DAY_LABELS, MONTHS, SERVICES, adminPost, updateSupabaseBooking, deleteLocalBooking, getSupabaseBookings, dateKey, deleteSupabaseBooking, getSlotsForDate, updateLocalBooking, updateLocalGarageNotes, updateSupabaseGarageNotes, type Booking } from './BookingWidget';

const ADMIN_PASSWORD = '0000';

// ── ADMIN PASSWORD GATE ─────────────────────────────────────────────────────
export function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
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
        <div className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">Admin Access</div>
        <h1 className="text-3xl font-black text-white mb-8">Enter PIN</h1>
        <div className="flex justify-center gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < input.length ? 'bg-red-600 border-red-600' : 'bg-transparent border-gray-600'}`} />
          ))}
        </div>
        {error && <div className="text-red-500 text-xs font-bold uppercase tracking-wider mb-4">Incorrect PIN</div>}
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
          {saving && <span className="text-gray-400 text-xs uppercase tracking-wider">Saving…</span>}
          {!saving && saved && text !== '' && <span className="text-gray-400 text-xs uppercase tracking-wider">✓ Saved</span>}
          {!saving && !saved && <span className="text-gray-400 text-xs uppercase tracking-wider">Unsaved</span>}
          <button onClick={handleManualSave} disabled={saving}
            className="text-xs font-bold uppercase tracking-wider px-2 py-1 border border-yellow-800/60 text-yellow-700 hover:border-yellow-600 hover:text-yellow-500 transition-colors disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Shown on the customer's invoice as Technician Notes…"
        rows={2}
        className="w-full bg-black/30 border border-gray-800 focus:border-yellow-700 text-white/80 text-sm px-3 py-2 outline-none resize-none placeholder-gray-700 transition-colors"
      />
    </div>
  );
}

// ── BLACKOUT DATES MODAL ────────────────────────────────────────────────────
// Days the shop is fully closed for booking — later W2 shifts, vacation, etc.
// Stored in a `blackout_dates` table (date text PK, reason text) via
// admin-api-data.js; the public booking widget reads this list read-only.
interface BlackoutDate { date: string; reason: string | null }

function BlackoutDatesModal({ onClose }: { onClose: () => void }) {
  const [dates, setDates] = useState<BlackoutDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await adminPost('list-blackout-dates');
      setDates((rows || []) as BlackoutDate[]);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load blackout dates');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addDate() {
    if (!newDate) return;
    setSaving(true);
    setError(null);
    try {
      await adminPost('add-blackout-date', { date: newDate, reason: newReason || null });
      setNewDate('');
      setNewReason('');
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add date');
    }
    setSaving(false);
  }

  async function removeDate(date: string) {
    setSaving(true);
    try {
      await adminPost('remove-blackout-date', { date });
      setDates(prev => prev.filter(d => d.date !== date));
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove date');
    }
    setSaving(false);
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
  const upcoming = dates.filter(d => d.date >= today);

  function fmt(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div data-lenis-prevent className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-white text-sm font-bold uppercase tracking-widest">🚫 Blackout Dates</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-gray-400 text-xs">Days you're unavailable — later W2 shifts, vacation, etc. These dates disappear entirely from the customer booking calendar.</div>

          {/* Add form */}
          <div className="bg-gray-800/50 border border-gray-700 p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                min={today}
                className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-2 text-sm outline-none focus:border-yellow-700"
              />
            </div>
            <input
              type="text"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              placeholder="Reason (optional — e.g. Mygrant late shift, Vacation)"
              className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-2 text-sm outline-none focus:border-yellow-700 placeholder-gray-500"
            />
            <button
              onClick={addDate}
              disabled={!newDate || saving}
              className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-2 transition-colors"
            >
              {saving ? 'Saving…' : '+ Add Blackout Date'}
            </button>
          </div>

          {error && <div className="text-red-400 text-xs">{error}</div>}

          {/* List */}
          {loading ? (
            <div className="text-gray-400 text-xs text-center py-4">Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className="text-gray-400 text-xs text-center py-4">No upcoming blackout dates</div>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map(d => (
                <div key={d.date} className="flex items-center justify-between bg-gray-800/40 border border-gray-800 px-3 py-2">
                  <div>
                    <div className="text-white text-sm font-bold">{fmt(d.date)}</div>
                    {d.reason && <div className="text-gray-400 text-xs">{d.reason}</div>}
                  </div>
                  <button onClick={() => removeDate(d.date)} disabled={saving} className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors disabled:opacity-40">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ADMIN SCHEDULE VIEW ─────────────────────────────────────────────────────
export function AdminSchedule() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('gg_admin_auth') === '1');
  const [bookings, setBookings] = useState<Booking[]>([]);
  // ?tab= deep links from the Command Center sidebar (/admin?tab=customers …).
  const [adminTab, setAdminTab] = useState<'jobs' | 'schedule' | 'customers' | 'fleet' | 'mileage' | 'hub' | 'pay' | 'helpers'>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'schedule' || t === 'customers' || t === 'fleet' || t === 'mileage' || t === 'hub' || t === 'pay' || t === 'helpers' ? t : 'jobs';
  });
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [view, setView] = useState<'list' | 'month' | 'week' | 'day'>('month');
  const [calDate, setCalDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  // Clicking a booking on the calendar opens the *full* job record (same
  // rich panel the Jobs tab uses — pipeline, estimate, payment, inspection),
  // not just a quick-glance summary. We only have the slim Booking in the
  // calendar's own state, so track the id and fetch the full Job separately.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  // Separate from `bookings` (the calendar's own slim data model, no
  // customer_id). JobDetailPanel needs a real Job[] with customerId on each
  // one to look up "this customer's other jobs" — without it, clicking a
  // customer's name from a job opened off the calendar always said "No jobs
  // found on file for this customer", even though the file existed.
  const [fullJobs, setFullJobs] = useState<Job[]>([]);
  const [jobLoading, setJobLoading] = useState(false);
  const [showBlackoutManager, setShowBlackoutManager] = useState(false);
  // Drag-to-reschedule on the calendar
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
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

      // Save subscription endpoint to Supabase — goes through admin-api-data
      // (service key) since the anon key has no INSERT policy on this table.
      await fetch('/admin-api-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-push-subscription',
          endpoint: subscription.endpoint,
          subscription: JSON.stringify(subscription),
        }),
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text());
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
    getAllJobs().then(setFullJobs).catch(() => { /* customer-file lookup just won't have data this load */ });

    const dataInterval = setInterval(async () => {
      const fresh = await getSupabaseBookings();
      if (seenBookingIds.current) {
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        // Was requiring stripeCustomerId here, which meant any confirmed
        // booking that didn't go through the card-on-file flow (e.g. a
        // returning-customer edge case, or any future no-card booking type)
        // silently never triggered a push alert. What actually matters is
        // whether the booking is confirmed, not which payment path it took.
        const newOnes = fresh.filter(
          b => !seenBookingIds.current!.has(b.id) &&
               b.status === 'confirmed' &&
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

  // Fetch the full job record whenever a calendar entry is opened. Must run
  // unconditionally (before the `if (!unlocked) return` gate below) — a hook
  // placed after an early return executes on some renders but not others,
  // which is exactly the "Rendered more hooks than during the previous
  // render" crash.
  useEffect(() => {
    if (!selectedJobId) { setSelectedJob(null); return; }
    let cancelled = false;
    setJobLoading(true);
    getJobById(selectedJobId).then(j => {
      if (cancelled) return;
      setSelectedJob(j);
      setJobLoading(false);
    }).catch(() => { if (!cancelled) setJobLoading(false); });
    return () => { cancelled = true; };
  }, [selectedJobId]);

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

  function handleJobUpdate(updated: Job) {
    setFullJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setSelectedJob(updated);
    setBookings(prev => prev.map(b => b.id === updated.id ? {
      ...b,
      date: updated.date,
      time: updated.time,
      fname: updated.fname,
      lname: updated.lname,
      phone: updated.phone,
      email: updated.email,
      vehicle: updated.vehicle,
      notes: updated.notes,
      status: (updated.status as Booking['status']) ?? b.status,
    } : b));
  }

  // Formats a date/time for the reschedule confirm prompt, e.g.
  // "Tuesday, August 11th at 11:00 AM".
  function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function fmtConfirmWhen(dateStr: string, time: string) {
    const d = new Date(dateStr + 'T12:00:00');
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    return `${weekday}, ${month} ${ordinal(d.getDate())} at ${time}`;
  }

  // Drag-and-drop reschedule — used by the month/week/day calendar views.
  async function handleDropReschedule(bookingId: string, newDate: string, newTime: string) {
    setDropTargetKey(null);
    setDraggingId(null);
    const b = bookings.find(x => x.id === bookingId);
    if (!b) return;
    if (b.date === newDate && b.time === newTime) return;
    const vehiclePart = b.vehicle ? ` (${b.vehicle})` : '';
    const ok = confirm(`Reschedule ${b.fname} ${b.lname}${vehiclePart} for ${fmtConfirmWhen(newDate, newTime)}?`);
    if (!ok) return;
    const prevDate = b.date, prevTime = b.time;
    setBookings(prev => prev.map(x => x.id === bookingId ? { ...x, date: newDate, time: newTime } : x));
    try {
      await adminPost('patch-booking', { id: bookingId, fields: { date: newDate, time: newTime } });
    } catch (e: any) {
      // Roll back on failure
      setBookings(prev => prev.map(x => x.id === bookingId ? { ...x, date: prevDate, time: prevTime } : x));
      alert('Failed to reschedule: ' + (e?.message ?? String(e)));
    }
  }

  const STATUS_ORDER: Record<string, number> = { confirmed: 0, pending: 1, completed: 2, cancelled: 3 };
  const filtered = bookings.filter(b => filter === 'all' || b.status === filter)
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
      if (statusDiff !== 0) return statusDiff;
      return b.date.localeCompare(a.date) || slotMinutes(b.time) - slotMinutes(a.time);
    });

  // Phoenix is UTC-7 year-round (no DST) — using raw UTC here made "today"
  // flip over at 5pm Phoenix time instead of midnight, which is exactly the
  // "calendar shows tomorrow in the evening" bug.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const total = bookings.length;

  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  function bookingsForDay(dateStr: string) {
    return bookings.filter(b => b.date === dateStr && b.status !== 'cancelled')
      .sort((a, b) => slotMinutes(a.time) - slotMinutes(b.time));
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
  const ALL_SLOTS = WEEKEND_SLOTS;

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
            <div className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</div>
            <h1 className="text-4xl font-black text-white tracking-tight">Schedule</h1>
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:gap-2">
            {notifPerm !== 'unsupported' && notifPerm !== 'granted' && (
              <button onClick={requestNotifications}
                className="border border-yellow-700 text-yellow-600 hover:border-yellow-500 hover:text-yellow-400 text-xs sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">🔔 Alerts</button>
            )}
            {notifPerm === 'granted' && (
              <span className="text-xs sm:text-xs text-green-600 font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">🔔 On</span>
            )}
            <a href="/jarvis"
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">🎯 Jarvis</a>
            <button onClick={() => getSupabaseBookings().then(setBookings)}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">↻ Refresh</button>
            <button onClick={() => { sessionStorage.removeItem('gg_admin_auth'); setUnlocked(false); }}
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">🔒 Lock</button>
            <a href="/"
              className="border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs sm:text-xs font-bold uppercase tracking-wide px-1.5 sm:px-3 py-1.5 sm:py-2 transition-colors whitespace-nowrap">← Site</a>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex flex-wrap gap-0 mb-8 border-b border-gray-800">
          {(['jobs', 'schedule', 'customers', 'fleet', 'mileage', 'hub', 'pay', 'helpers'] as const).map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)}
              className={`text-xs font-bold uppercase tracking-widest px-6 py-3 transition-colors border-b-2 -mb-px ${adminTab === tab ? 'border-red-600 text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
              {tab === 'jobs' ? '💼 Jobs' : tab === 'schedule' ? '📅 Schedule' : tab === 'customers' ? '👥 Customers' : tab === 'fleet' ? '🚚 Fleet' : tab === 'mileage' ? '🚗 Mileage' : tab === 'hub' ? '🏢 Hub' : tab === 'pay' ? '💵 Pay' : '👷 Team'}
            </button>
          ))}
        </div>

        {adminTab === 'schedule' && (<>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[['Upcoming', upcoming, 'text-red-500'], ['Completed', completed, 'text-green-500'], ['Total', total, 'text-white']].map(([label, val, cls]) => (
            <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
              <div className={`text-3xl font-black ${cls} mb-1`}>{val}</div>
              <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">{label}</div>
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
          <div className="flex gap-2 items-center">
            <button onClick={() => setShowBlackoutManager(true)}
              className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 border border-yellow-800/60 text-yellow-700 hover:border-yellow-600 hover:text-yellow-500 transition-colors">
              🚫 Blackout Dates
            </button>
            {(['list','month','week','day'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${view === v ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {showBlackoutManager && <BlackoutDatesModal onClose={() => setShowBlackoutManager(false)} />}

        {loading && <div className="text-center py-16 text-gray-400 font-bold uppercase tracking-wider text-sm">Loading bookings...</div>}

        {/* ── MONTH VIEW ── */}
        {!loading && view === 'month' && (
          <div className="bg-gray-900 border border-gray-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navCalendar(-1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">‹</button>
              <span className="text-white font-black uppercase tracking-wider">{calTitle()}</span>
              <button onClick={() => navCalendar(1)} className="w-8 h-8 border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map(d => <div key={d} className="text-center text-gray-400 text-xs font-bold uppercase py-2">{d}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const k = dateKey(calYear, calMonth, d);
                const dayBookings = bookingsForDay(k);
                const isToday = k === today;
                const isDropTarget = dropTargetKey === k;
                return (
                  <div key={d}
                    className={`min-h-[60px] p-1.5 border text-xs transition-colors ${isDropTarget ? 'border-yellow-500 bg-yellow-900/10' : isToday ? 'border-red-600' : 'border-gray-800'} bg-gray-900`}
                    onDragOver={e => { if (draggingId) { e.preventDefault(); setDropTargetKey(k); } }}
                    onDragLeave={() => { if (dropTargetKey === k) setDropTargetKey(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain') || draggingId;
                      if (id) {
                        const dropped = bookings.find(x => x.id === id);
                        handleDropReschedule(id, k, dropped?.time ?? '');
                      }
                    }}
                  >
                    <div className={`font-bold mb-1 ${isToday ? 'text-red-500' : 'text-gray-400'}`}>{d}</div>
                    {dayBookings.slice(0, 2).map(b => (
                      <button key={b.id} onClick={() => setSelectedJobId(b.id)}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', b.id); setDraggingId(b.id); }}
                        onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
                        className={`w-full text-left bg-red-900/50 hover:bg-red-900/80 text-red-300 text-xs px-1 py-0.5 mb-0.5 truncate transition-colors cursor-grab active:cursor-grabbing ${draggingId === b.id ? 'opacity-40' : ''}`}>
                        {b.time} {b.fname}
                      </button>
                    ))}
                    {dayBookings.length > 2 && <div className="text-gray-400 text-xs">+{dayBookings.length - 2} more</div>}
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
                <div className="text-gray-700 text-xs font-bold uppercase py-1" />
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
                  <div className="text-gray-400 text-xs py-2 pr-2 text-right font-mono">{slot}</div>
                  {weekDates.map(d => {
                    const dKey = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                    const slotBookings = bookings.filter(b => b.date === dKey && b.time === slot && b.status !== 'cancelled');
                    const cellKey = `${dKey}|${slot}`;
                    const isDropTarget = dropTargetKey === cellKey;
                    return (
                      <div key={dKey}
                        className={`py-1 min-h-[32px] transition-colors ${isDropTarget ? 'bg-yellow-900/20 outline outline-1 outline-yellow-500' : ''}`}
                        onDragOver={e => { if (draggingId) { e.preventDefault(); setDropTargetKey(cellKey); } }}
                        onDragLeave={() => { if (dropTargetKey === cellKey) setDropTargetKey(null); }}
                        onDrop={e => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('text/plain') || draggingId;
                          if (id) handleDropReschedule(id, dKey, slot);
                        }}
                      >
                        {slotBookings.map(b => (
                          <button key={b.id} onClick={() => setSelectedJobId(b.id)}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('text/plain', b.id); setDraggingId(b.id); }}
                            onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
                            className={`w-full text-left bg-red-900/50 hover:bg-red-900/80 text-red-300 text-xs px-1 py-0.5 truncate transition-colors cursor-grab active:cursor-grabbing ${draggingId === b.id ? 'opacity-40' : ''}`}>
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
              const dayBookings = bookingsForDay(dKey);
              const slots = getSlotsForDate(dKey);
              return (
                <div className="space-y-2">
                  {dayBookings.length === 0 && (
                    <div className="text-center py-6 text-gray-400 text-sm font-bold uppercase tracking-wider">No appointments</div>
                  )}
                  {slots.map(slot => {
                    const slotBookings = dayBookings.filter(b => b.time === slot);
                    const isDropTarget = dropTargetKey === `${dKey}|${slot}`;
                    return (
                      <div key={slot}
                        className={`grid grid-cols-[80px_1fr] gap-3 border-t border-gray-800 pt-2 transition-colors ${isDropTarget ? 'bg-yellow-900/20' : ''}`}
                        onDragOver={e => { if (draggingId) { e.preventDefault(); setDropTargetKey(`${dKey}|${slot}`); } }}
                        onDragLeave={() => { if (dropTargetKey === `${dKey}|${slot}`) setDropTargetKey(null); }}
                        onDrop={e => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('text/plain') || draggingId;
                          if (id) handleDropReschedule(id, dKey, slot);
                        }}
                      >
                        <div className="text-gray-400 text-xs font-mono pt-1">{slot}</div>
                        <div className="space-y-1">
                          {slotBookings.length === 0
                            ? <div className="h-6" />
                            : slotBookings.map(b => {
                                const si = SERVICES.find(s => s.id === b.service);
                                return (
                                  <button key={b.id} onClick={() => setSelectedJobId(b.id)}
                                    draggable
                                    onDragStart={e => { e.dataTransfer.setData('text/plain', b.id); setDraggingId(b.id); }}
                                    onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
                                    className={`w-full text-left bg-red-900/40 hover:bg-red-900/70 border border-red-900/60 px-3 py-2 transition-colors cursor-grab active:cursor-grabbing ${draggingId === b.id ? 'opacity-40' : ''}`}>
                                    <span className="text-white text-sm font-bold">{b.fname} {b.lname}</span>
                                    <span className="text-gray-400 text-xs ml-2">{si?.icon} {si?.name}</span>
                                    <span className="text-gray-400 text-xs block mt-0.5">{b.vehicle}</span>
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
              <div className="text-center py-16 text-gray-400 font-bold uppercase tracking-wider text-sm">No appointments found</div>
            )}
            {filtered.map(b => {
              const svcInfo = SERVICES.find(s => s.id === b.service);
              const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isPast = b.date < today;
              return (
                <div key={b.id} className={`bg-gray-900 border p-5 flex flex-col gap-3 ${b.status === 'cancelled' ? 'border-gray-800 opacity-50' : b.status === 'completed' ? 'border-green-900' : isPast ? 'border-yellow-900/50' : 'border-gray-800 border-l-4 border-l-red-600'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <button className="flex items-start gap-4 text-left flex-1" onClick={() => setSelectedJobId(b.id)}>
                      <div className="text-2xl mt-0.5">{svcInfo?.icon ?? '🔧'}</div>
                      <div>
                        <div className="text-white font-bold text-base">{b.fname} {b.lname}</div>
                        <div className="text-gray-400 text-sm">{svcInfo?.name} · {dateStr} at {b.time}</div>
                        <div className="text-gray-400 text-xs mt-0.5">{b.vehicle} · {b.phone}</div>
                        {b.notes && <div className="text-gray-400 text-xs mt-1 italic">"{b.notes}"</div>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 ${
                        b.status === 'confirmed' ? 'bg-red-900/40 text-red-400' :
                        b.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                        'bg-gray-800 text-gray-400'}`}>
                        {b.status}
                      </span>
                      {b.status === 'confirmed' && (
                        <button onClick={() => updateStatus(b.id, 'completed')}
                          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-green-800 text-green-600 hover:bg-green-900/30 transition-colors">✓ Done</button>
                      )}
                      {b.status !== 'cancelled' && (
                        <button onClick={() => { if (confirm('Cancel this appointment?')) updateStatus(b.id, 'cancelled'); }}
                          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-500 transition-colors">✕</button>
                      )}
                      <button onClick={() => { if (confirm(`Permanently delete ${b.fname} ${b.lname}'s appointment? This cannot be undone.`)) deleteBooking(b.id); }}
                        title="Delete permanently"
                        className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 border border-gray-800 text-gray-400 hover:border-red-700 hover:text-red-500 transition-colors">🗑</button>
                    </div>
                  </div>
                  <GarageNotesField booking={b} onSave={saveGarageNotes} />
                </div>
              );
            })}
          </div>
        )}
        </>)}

      </div>

      {selectedJobId && jobLoading && !selectedJob && (
        <div data-lenis-prevent className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="text-gray-400 text-sm font-bold uppercase tracking-widest">Loading job…</div>
        </div>
      )}

      {selectedJobId && selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          backLabel="Back to Calendar"
          onClose={() => setSelectedJobId(null)}
          onJobUpdate={handleJobUpdate}
          allJobs={fullJobs}
        />
      )}

      {adminTab === 'jobs' && <JobsTab />}
      {adminTab === 'customers' && <CustomersTab />}
      {adminTab === 'fleet' && <FleetAdminTab />}
      {adminTab === 'mileage' && <div className="max-w-4xl mx-auto py-4 px-3 sm:px-6"><MileageTab /></div>}
      {adminTab === 'hub' && <BusinessHub />}
      {adminTab === 'helpers' && (
        <div className="max-w-3xl mx-auto py-4 px-3 sm:px-6">
          <div className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-5">Team &amp; Pay <a href="/admin/pay" className="text-gray-400 hover:text-white text-xs font-bold tracking-widest align-middle ml-2">/admin/pay ↗</a></h2>
          <HelperPay />
        </div>
      )}
      {adminTab === 'pay' && (
        <div className="max-w-2xl mx-auto py-4 px-3 sm:px-6">
          <div className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-5">Owner Pay</h2>
          <OwnerPayPanel />
        </div>
      )}
    </div>
  );
}
