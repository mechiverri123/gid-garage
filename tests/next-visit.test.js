// Next-visit check: checklist template, recommendations, the customer's answer,
// the new job it creates, and the slot rules shared with the booking widget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHECKLIST, cleanTemplate, withTemplate, recommendations, declinedSentence, checkResponse, nextVisitJobRow } from '../shared/next-visit.js';
import { WEEKDAY_SLOTS, WEEKEND_SLOTS, slotsForDate, slotHour, isBookableSlot, dayOfWeek, phoenixHour } from '../shared/booking-slots.js';

test('slots: same hours as the booking page; weekday/weekend by calendar date; Phoenix hour', () => {
  assert.equal(WEEKDAY_SLOTS[0], '1:30 PM');
  assert.equal(WEEKDAY_SLOTS.at(-1), '7:00 PM');
  assert.equal(WEEKEND_SLOTS[0], '5:00 AM');
  assert.equal(dayOfWeek('2026-10-03'), 6); // Saturday
  assert.equal(slotsForDate('2026-10-03'), WEEKEND_SLOTS);
  assert.equal(slotsForDate('2026-10-05'), WEEKDAY_SLOTS);
  assert.equal(slotHour('12:00 PM'), 12);
  assert.equal(slotHour('12:30 AM'), 0);
  assert.equal(phoenixHour(new Date('2026-10-01T00:30:00Z')), 17); // Sep 30 5:30 PM in Arizona
  const ctx = { today: '2026-10-01', nowHour: 15, taken: ['4:00 PM'], blackout: ['2026-10-09'] };
  assert.equal(isBookableSlot('2026-10-01', '3:30 PM', ctx), false); // this hour already started
  assert.equal(isBookableSlot('2026-10-01', '5:00 PM', ctx), true);
  assert.equal(isBookableSlot('2026-10-01', '4:00 PM', ctx), false); // taken
  assert.equal(isBookableSlot('2026-09-30', '5:00 PM', ctx), false); // past
  assert.equal(isBookableSlot('2026-10-09', '5:00 PM', ctx), false); // blackout
  assert.equal(isBookableSlot('2026-10-05', '9:00 AM', ctx), false); // not a weekday slot
  assert.equal(isBookableSlot('2026-10-03', '9:00 AM', ctx), true);
});

test('checklist: default list; Hub template cleaned; answers kept when the template changes', () => {
  assert.ok(DEFAULT_CHECKLIST.length >= 20);
  assert.equal(cleanTemplate([]), DEFAULT_CHECKLIST);
  assert.deepEqual(cleanTemplate([{ label: ' Spare tire ', category: '' }]), [{ id: 'spare-tire', category: 'Other', label: 'Spare tire', service: 'Spare tire' }]);
  const nv = withTemplate({ items: [{ id: 'oil', status: 'soon', note: 'dark' }, { id: 'old-item', label: 'Removed later', status: 'now' }] }, DEFAULT_CHECKLIST);
  assert.equal(nv.items.find(i => i.id === 'oil').status, 'soon');
  assert.equal(nv.items.find(i => i.id === 'oil').label, 'Engine oil level & condition');
  assert.ok(nv.items.some(i => i.id === 'old-item'), 'answered items survive a template change');
  assert.deepEqual(recommendations(nv).map(i => i.id), ['oil', 'old-item']);
});

test('answer: every recommendation approved or declined once; declined wording', () => {
  const nv = { items: [{ id: 'a', status: 'now', service: 'Front pads' }, { id: 'b', status: 'soon', service: 'Cabin filter' }, { id: 'c', status: 'soon', service: 'Coolant flush' }, { id: 'g', status: 'good' }] };
  const r = checkResponse(nv, ['a'], ['b', 'c']);
  assert.deepEqual([r.approved.map(x => x.id), r.declined.map(x => x.id)], [['a'], ['b', 'c']]);
  assert.throws(() => checkResponse(nv, ['a'], ['b']), /every item/);
  assert.throws(() => checkResponse(nv, ['a', 'g'], ['b', 'c']), /Unknown/);
  assert.throws(() => checkResponse(nv, ['a'], ['a', 'b', 'c']), /Unknown or duplicated/);
  assert.throws(() => checkResponse({ items: [{ id: 'g', status: 'good' }] }, [], []), /no recommendations/);
  assert.equal(declinedSentence(['A']), '"A" was declined at this time.');
  assert.equal(declinedSentence(['A', 'B']), '"A" and "B" were declined at this time.');
  assert.equal(declinedSentence(['A', 'B', 'C']), '"A", "B", and "C" were declined at this time.');
});

test('new job: customer details, vehicle, chosen slot, requested + declined, inspection link; no money fields', () => {
  const orig = { id: 'GID-1', fname: 'Jill', lname: 'Smith', phone: '928-555-0100', email: 'j@x.com', vehicle: '2015 Acura TLX', vin: '19UUB1F5XFA000000', mileage: '98000', service_address: '1 Main', customer_id: 'c1', invoice_amount: 300, tax_amount: 20, payments: '[]' };
  const row = nextVisitJobRow({ orig, approved: [{ service: 'Front brake pad replacement' }], declined: [{ service: 'Cabin air filter replacement' }, { service: 'Coolant flush' }], date: '2026-10-10', time: '9:00 AM', id: 'GID-2', createdAt: '2026-10-01T20:00:00.000Z', site: 'https://gidgarage.com' });
  assert.deepEqual([row.fname, row.lname, row.phone, row.email, row.vehicle, row.vin, row.mileage, row.customer_id, row.date, row.time, row.job_status], ['Jill', 'Smith', '928-555-0100', 'j@x.com', '2015 Acura TLX', '19UUB1F5XFA000000', '98000', 'c1', '2026-10-10', '9:00 AM', 'BOOKED']);
  assert.match(row.notes, /Customer requested: Front brake pad replacement\./);
  assert.match(row.notes, /"Cabin air filter replacement" and "Coolant flush" were declined at this time\./);
  assert.match(row.notes, /Inspection: https:\/\/gidgarage\.com\/inspection\?id=GID-1/);
  for (const k of ['invoice_amount', 'estimate_amount', 'tax_amount', 'amount_paid', 'payments', 'paid_at']) assert.ok(!(k in row), k);
});

test('server: answer once, slot re-checked, job + reminder created, original job marked', async () => {
  const { onRequestPost } = await import('../functions/api-customer.js');
  const insp = { tirePressure: {}, tireTread: {}, dtcCodes: [], nextVisit: { items: [{ id: 'a', status: 'now', service: 'Front pads' }, { id: 'b', status: 'soon', service: 'Cabin filter' }] } };
  let orig = { id: 'GID-1', fname: 'Jill', lname: 'Smith', vehicle: 'TLX', inspection_data: JSON.stringify(insp) };
  const writes = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if ((init.method || 'GET') !== 'GET') {
      writes.push([u.split('/rest/v1/')[1], init.method, JSON.parse(init.body)]);
      if (u.includes('bookings?id=eq.GID-1')) orig = { ...orig, ...JSON.parse(init.body) };
      return new Response(null, { status: 201 });
    }
    if (u.includes('blackout_dates')) return new Response('[]');
    if (u.includes('select=time')) return new Response(JSON.stringify([{ time: '9:00 AM' }]));
    return new Response(JSON.stringify([orig]));
  };
  const call = body => onRequestPost({ request: new Request('https://x/api-customer', { method: 'POST', body: JSON.stringify({ action: 'next-visit-respond', id: 'GID-1', ...body }) }), env: { SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_KEY: 'k' } });
  try {
    assert.equal((await call({ approved: ['a'], declined: [] })).status, 400);                                  // must answer every item
    assert.equal((await call({ approved: ['a'], declined: ['b'], date: '2030-01-07', time: '9:00 AM' })).status, 409); // taken (and not a weekday slot)
    const ok = await call({ approved: ['a'], declined: ['b'], date: '2030-01-07', time: '2:00 PM' });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.match(body.jobId, /^GID-/);
    const job = writes.find(w => w[0] === 'bookings' && w[1] === 'POST')[2];
    assert.equal(job.date, '2030-01-07');
    assert.match(job.notes, /"Cabin filter" was declined at this time/);
    assert.ok(writes.some(w => w[0] === 'jarvis_reminders'));
    assert.equal(JSON.parse(orig.inspection_data).nextVisit.response.jobId, body.jobId);
    const again = await (await call({ approved: ['a'], declined: ['b'], date: '2030-01-07', time: '2:30 PM' })).json();
    assert.equal(again.already, true);                                                                         // answered once
    assert.equal(writes.filter(w => w[0] === 'bookings' && w[1] === 'POST').length, 1);
  } finally { globalThis.fetch = saved; }
});
