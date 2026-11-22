import test from 'node:test';
import assert from 'node:assert/strict';
import { routesToLog, mileageRows, timeMinutes, ratesForDate } from '../shared/mileage.js';
import { autoMileage } from '../functions/_lib/auto-mileage.js';

const job = (id, date, time, status = 'PAID', extra = {}) => ({ id, date, time, dateTbd: false, jobStatus: status, serviceAddress: `${id} St, Flagstaff, AZ`, ...extra });

test('times sort in appointment order', () => {
  assert.ok(timeMinutes('9:30 AM') < timeMinutes('1:00 PM'));
  assert.equal(timeMinutes('12:15 PM'), 12 * 60 + 15);
  assert.equal(timeMinutes('12:15 AM'), 15);
  assert.equal(timeMinutes('14:00'), 14 * 60);
  assert.equal(timeMinutes('TBD'), 24 * 60);
});

test('one route per finished day, in order; never a day with a hand entry or still in progress', () => {
  const jobs = [
    job('b', '2026-11-22', '1:00 PM'), job('a', '2026-11-22', '9:00 AM', 'COMPLETED'),
    job('c', '2026-11-23', '9:00 AM'), job('d', '2026-11-23', '11:00 AM', 'IN_PROGRESS'), // today, not done
    job('e', '2026-11-20', '9:00 AM'), // before the start date
    job('f', '2026-11-21', '9:00 AM'), job('g', '2026-11-21', '10:00 AM'), // g logged by hand
    job('h', '2026-11-22', '3:00 PM', 'CANCELLED'),
    job('i', '2026-11-22', '4:00 PM', 'PAID', { serviceAddress: '' }),
  ];
  const r = routesToLog(jobs, new Set(['g']), '2026-11-23');
  assert.deepEqual(r.map(d => [d.date, d.stops.map(s => s.id)]), [['2026-11-22', ['a', 'b']]]);
});

test('a past day logs its finished jobs even if one never got finished', () => {
  const r = routesToLog([job('a', '2026-11-22', '9:00 AM'), job('b', '2026-11-22', '1:00 PM', 'BOOKED')], new Set(), '2026-11-23');
  assert.deepEqual(r[0].stops.map(s => s.id), ['a']);
});

test('rows add up to the whole route; the last job carries the drive home', () => {
  const rows = mileageRows({ date: '2026-11-22', stops: [job('a', '2026-11-22', '9:00 AM'), job('b', '2026-11-22', '1:00 PM')] }, [5.04, 3.21, 6.66]);
  assert.deepEqual(rows.map(r => [r.job_id, r.miles]), [['a', 5], ['b', 9.9]]);
  assert.equal(rows[0].rate_cents_per_mile, 76);
  assert.match(rows[1].notes, /Home → a St → b St → Home/);
  assert.equal(ratesForDate('2026-03-01'), 72.5);
});

test('autoMileage routes home -> jobs -> home and writes one row per job', async () => {
  const posted = []; const routed = [];
  const fake = async (url, opts = {}) => {
    if (url.includes('business_settings')) return { ok: true, json: async () => [{ home_address: 'Home Rd, Flagstaff, AZ' }] };
    if (url.includes('/bookings')) return { ok: true, json: async () => [
      { id: 'a', date: '2026-11-22', time: '9:00 AM', job_status: 'PAID', service_address: 'A St, Flagstaff, AZ' },
      { id: 'b', date: '2026-11-22', time: '1:00 PM', job_status: 'PAID', service_address: 'B St, Flagstaff, AZ' },
    ] };
    if (url.includes('mileage_logs') && opts.method === 'POST') { posted.push(...JSON.parse(opts.body)); return { ok: true }; }
    if (url.includes('mileage_logs')) return { ok: true, json: async () => [] };
    if (url.includes('routes.googleapis.com')) { routed.push(JSON.parse(opts.body)); return { ok: true, json: async () => [{ distanceMeters: 8046.72, condition: 'ROUTE_EXISTS' }] }; }
    throw new Error(`unexpected ${url}`);
  };
  const out = await autoMileage({ GOOGLE_DISTANCE_API_KEY: 'k' }, { base: 'https://db/rest/v1', headers: {} }, { fetchImpl: fake, now: new Date('2026-11-23T18:00:00Z') });
  assert.equal(routed.length, 3);
  assert.deepEqual(posted.map(r => [r.job_id, r.miles]), [['a', 5], ['b', 10]]);
  assert.deepEqual(out.logged, [{ date: '2026-11-22', jobs: 2, miles: 15 }]);
});

test('parts run: from the job on its day, from home otherwise; one trip per store per day', async () => {
  const { partsRunPlan, partsRunLogged } = await import('../shared/mileage.js');
  const receipt = { key: 'r1', readTotal: 35.43, readStore: 'AutoZone', readAddress: '2138 E Route 66, Flagstaff, AZ', readDate: '2026-11-22' };
  const job = { date: '2026-11-22', serviceAddress: '12 Pine St, Flagstaff, AZ' };
  assert.deepEqual(partsRunPlan({ receipt, job, home: 'Home Rd', today: '2026-11-23' }),
    { date: '2026-11-22', origin: '12 Pine St, Flagstaff, AZ', from: 'the job', address: '2138 E Route 66, Flagstaff, AZ', store: 'AutoZone', key: 'r1' });
  assert.equal(partsRunPlan({ receipt: { ...receipt, readDate: '2026-11-21' }, job, home: 'Home Rd', today: '2026-11-23' }).origin, 'Home Rd');
  assert.equal(partsRunPlan({ receipt: { ...receipt, readAddress: '' }, job, home: 'Home Rd', today: '2026-11-23' }), null, 'no address, no guess');
  assert.equal(partsRunPlan({ receipt: { ...receipt, readDate: '2026-10-01' }, job, home: 'Home Rd', today: '2026-11-23' }), null, 'before the start date');
  const plan = partsRunPlan({ receipt, job, home: 'Home Rd', today: '2026-11-23' });
  assert.equal(partsRunLogged([{ date: '2026-11-22', notes: 'Auto-logged from a receipt: the job → 2138 E Route 66, Flagstaff, AZ → back. receipt:r0' }], plan), true);
  assert.equal(partsRunLogged([{ date: '2026-11-21', notes: '… 2138 E Route 66, Flagstaff, AZ …' }], plan), false);
});
