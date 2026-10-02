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

// Same rule the booking widget uses: today's slots are open only after the current Phoenix hour.
export function isBookableSlot(ymd, time, { today, nowHour, taken = [], blackout = [] }) {
  if (!ymd || ymd < today || blackout.includes(ymd)) return false;
  if (!slotsForDate(ymd).includes(time) || taken.includes(time)) return false;
  return ymd > today || slotHour(time) > nowHour;
}

// The current hour (0–23) in Arizona, whatever the device/server timezone.
export const phoenixHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(now));
