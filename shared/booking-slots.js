// Appointment slots: one definition for the public booking widget, the
// next-visit approval page and the server checks. Mon–Fri 1:30–7 PM,
// Sat–Sun 5 AM–7 PM, every 30 minutes. Dates are Phoenix YYYY-MM-DD strings.
// Tests: tests/next-visit.test.js

function genSlots(startH, startM, endH, endM) {
  const out = [];
  let h = startH, m = startM;
  while (h < endH || (h === endH && m <= endM)) {
    out.push(`${h % 12 === 0 ? 12 : h % 12}:${m === 0 ? '00' : m} ${h >= 12 ? 'PM' : 'AM'}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return out;
}
export const WEEKDAY_SLOTS = genSlots(13, 30, 19, 0);
export const WEEKEND_SLOTS = genSlots(5, 0, 19, 0);

// Day of week of a calendar date (0 = Sunday), with no timezone involved.
export const dayOfWeek = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };

export function slotsForDate(ymd) {
  if (!ymd) return WEEKDAY_SLOTS;
  const dow = dayOfWeek(ymd);
  return dow === 0 || dow === 6 ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

export function slotHour(t) {
  const m = String(t).match(/^(\d{1,2}):\d{2} (AM|PM)$/);
  if (!m) return null;
  const h = Number(m[1]);
  return m[2] === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
}

// "1:30 PM" / "13:30" → minutes since midnight, for chronological sorting. Unparseable → end of day.
export function slotMinutes(t) {
  const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}

// Customers book from tomorrow on — no same-day bookings (owner decision
// 2026-11-24). Same rule as the booking widget; `today` is the Phoenix date.
// `nowHour` is kept so callers don't change; it no longer matters.
export function isBookableSlot(ymd, time, { today, taken = [], blackout = [] }) {
  if (!ymd || ymd <= today || blackout.includes(ymd)) return false;
  return slotsForDate(ymd).includes(time) && !taken.includes(time);
}

// The current hour (0–23) in Arizona, whatever the device/server timezone.
export const phoenixHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(now));

// YYYY-MM-DD + n days, as a calendar date (no timezone involved).
export function addDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

// The first open appointment from tomorrow on, by the same rule the booking
// form uses: { date, time } or null if nothing in the next `days` days.
// takenByDate: { 'YYYY-MM-DD': ['1:30 PM', …] } (the booked-slots-range answer).
export function nextOpening({ today, takenByDate = {}, blackout = [], days = 21 }) {
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const taken = takenByDate[date] || [];
    const time = slotsForDate(date).find(t => isBookableSlot(date, t, { today, taken, blackout }));
    if (time) return { date, time };
  }
  return null;
}
