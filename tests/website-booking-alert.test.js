// Telegram note for website bookings, including ones abandoned at the card step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteBookingAlerts } from '../functions/jarvis-proactive.js';

test('confirmed alerts now, pending only after 10 min, cancelled/already-sent never', () => {
  const now = new Date('2026-10-29T23:30:00Z');
  const b = (id, status, extra = {}) => [id, { id, fname: 'Aaron', lname: 'G', service: 'brakes', date: '2026-10-29', time: '5:00 PM', status, ...extra }];
  const byId = new Map([b('B1', 'pending'), b('B2', 'confirmed'), b('B3', 'pending'), b('B4', 'cancelled', { job_status: 'CANCELLED' }), b('B5', 'confirmed')]);
  const leads = [
    { id: 'L1', booking_id: 'B1', created_at: '2026-10-29T23:08:00Z' }, // pending 22 min -> abandoned
    { id: 'L2', booking_id: 'B2', created_at: '2026-10-29T23:29:00Z' }, // confirmed -> now
    { id: 'L3', booking_id: 'B3', created_at: '2026-10-29T23:25:00Z' }, // pending 5 min -> wait
    { id: 'L4', booking_id: 'B4', created_at: '2026-10-29T23:00:00Z' }, // cancelled
    { id: 'L5', booking_id: 'B5', created_at: '2026-10-29T23:00:00Z' }, // already sent
  ];
  const out = websiteBookingAlerts(leads, byId, ['L5'], now);
  assert.deepEqual(out.map(a => a.id), ['L1', 'L2']);
  assert.match(out[0].text, /didn't finish/);
  assert.match(out[1].text, /^New website booking: Aaron G — brakes, 2026-10-29 at 5:00 PM/);
});
