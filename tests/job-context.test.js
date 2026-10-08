import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobEvidence, parseBookingNotes, resolvePerson, buildCustomerHistory, noteMatch, belongsToPerson } from '../shared/job-context.js';
import { JILL_JOBS } from './fixtures.js';

const NOW = new Date('2026-09-27T19:00:00Z');

test('booking-form notes split into address, selections and the customer\'s own words', () => {
  assert.deepEqual(parseBookingNotes(JILL_JOBS[1].notes), {
    address: '12 Pine St', plateOrVin: null, selections: ['Brake service: Pads & rotors (front)'], text: 'Grinding noise when stopping',
  });
  assert.deepEqual(parseBookingNotes('Customer called, wants a quote').text, 'Customer called, wants a quote');
});

test('generic "other" job is described from its scope of work, line items and booking request', () => {
  const ev = jobEvidence(JILL_JOBS[1]);
  assert.equal(ev.serviceCategory.generic, true);
  assert.match(ev.scopeOfWork, /front pads and rotors/);
  assert.deepEqual(ev.lineItems.map(li => li.label), ['Front brake labor', 'Front pads + rotors']);
  assert.equal(ev.bookingRequest.text, 'Grinding noise when stopping');
  assert.deepEqual(ev.evidenceFields, ['scopeOfWork', 'bookingText', 'bookingSelections', 'lineItems']);
  assert.ok(ev.hints.some(h => h.includes('Describe the job from scopeOfWork') && h.includes('never as "Other / Custom"')));
  assert.deepEqual(ev.gaps, ['no technician notes']);
});

test('diagnostic job exposes technician notes and trouble codes; tire blanks are dropped', () => {
  const ev = jobEvidence(JILL_JOBS[2]);
  assert.match(ev.technicianNotes, /recommend alternator replacement/);
  assert.deepEqual(ev.inspection, { tirePressure: null, tireTread: null, dtcCodes: [{ code: 'P0562', plan: 'System voltage low — check charging system' }] });
  assert.equal(ev.money.balanceDue, 120); // completed, not invoiced: estimate + tax
});

test('a job with no descriptive fields says so instead of implying detail', () => {
  const ev = jobEvidence(JILL_JOBS[3]);
  assert.deepEqual(ev.evidenceFields, []);
  assert.ok(ev.gaps.includes('nothing describes the work beyond the service category'));
});

test('category that contradicts the notes is flagged, not silently trusted', () => {
  const ev = jobEvidence({ id: 'X', service: 'brakes', estimate_notes: 'Replace serpentine belt and tensioner' });
  assert.ok(ev.hints.some(h => h.includes('may disagree')));
  assert.equal(jobEvidence({ id: 'Y', service: 'brakes', estimate_notes: 'Rear brake pads' }).hints.length, 0);
});

test('detail view adds photo notes, receipts and payments, and skips photo blobs', () => {
  const ev = jobEvidence({ ...JILL_JOBS[1], job_photos: [{ id: 'p', dataUrl: 'data:image/png;base64,AAAA', note: 'Rotor scored' }], parts_receipts: [{ name: 'autozone.pdf' }], payments: [{ amount: 420, method: 'Card (Stripe)', at: '2026-03-02T22:00:00Z' }] }, { detail: true });
  assert.deepEqual(ev.photoNotes, ['Rotor scored']);
  assert.deepEqual(ev.partsReceipts, ['autozone.pdf']);
  assert.equal(ev.payments.length, 1);
  assert.ok(!JSON.stringify(ev).includes('base64'));
});

// ---- entity resolution -----------------------------------------------------------

const CUSTOMERS = [
  { id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '(928) 555-0100', vehicle: '2017 Acura RDX' },
  { id: 'c-jm', fname: 'Jill', lname: 'Moreno', phone: '928-555-0177' },
];
const LEGACY = [{ id: 'L1', customer_id: null, fname: 'Jill', lname: 'Castle', phone: '9285550100', vehicle: '2009 Ford F-150', date: '2025-11-01' }];

test('full name resolves to one person and merges legacy bookings by phone', () => {
  const r = resolvePerson("Jill Castle's", CUSTOMERS, [...JILL_JOBS, ...LEGACY]);
  assert.equal(r.status, 'resolved');
  assert.equal(r.person.customerId, 'c-jill');
  assert.equal(r.person.jobCount, 5);
  assert.deepEqual(r.person.vehicles.sort(), ['2009 Ford F-150', '2017 Acura RDX']);
});

test('first name alone with two matches is ambiguous; unknown is not_found; phone resolves', () => {
  const amb = resolvePerson('Jill', CUSTOMERS, JILL_JOBS);
  assert.equal(amb.status, 'ambiguous');
  assert.deepEqual(amb.candidates.map(c => c.name).sort(), ['Jill Castle', 'Jill Moreno']);
  assert.equal(resolvePerson('Bob Smith', CUSTOMERS, JILL_JOBS).status, 'not_found');
  assert.equal(resolvePerson('928 555 0177', CUSTOMERS, []).person.name, 'Jill Moreno');
});

test('rows and notes are attributed to the right person with an honest match quality', () => {
  const person = resolvePerson('Jill Castle', CUSTOMERS, JILL_JOBS).person;
  assert.equal(belongsToPerson(JILL_JOBS[1], person), true);
  assert.equal(belongsToPerson({ customer_id: 'c-jm', fname: 'Jill', lname: 'Castle' }, person), false);
  assert.equal(belongsToPerson(LEGACY[0], person), true);
  assert.equal(noteMatch({ contact_name: 'Jill Castle' }, person), 'full_name');
  assert.equal(noteMatch({ contact_name: 'Jill' }, person), 'first_name_only');
  assert.equal(noteMatch({ phone: '928.555.0100' }, person), 'phone');
  assert.equal(noteMatch({ contact_name: 'Lisa' }, person), null);
});

test('customer history: chronological, last/next visit, open items, cancelled counted but not a visit', () => {
  const person = resolvePerson('Jill Castle', CUSTOMERS, JILL_JOBS).person;
  const h = buildCustomerHistory({
    person, jobRows: [JILL_JOBS[3], JILL_JOBS[1], JILL_JOBS[0], JILL_JOBS[2]],
    calls: [{ created_at: '2026-06-12T17:00:00Z', direction: 'outbound', outcome: 'other', notes: 'Told her the alternator quote is $480' }],
    notes: [{ id: 'n1', status: 'open', match: 'full_name', created_at: '2026-06-11T00:00:00Z', summary: 'Jill thinking about alternator', action_needed: 'Follow up on alternator quote' }],
  }, NOW);
  assert.deepEqual(h.jobsChronological.map(j => j.id), ['J0', 'J1', 'J2', 'J3']);
  assert.equal(h.jobCount, 4);
  assert.equal(h.cancelledJobCount, 1);
  assert.equal(h.lastVisitJobId, 'J2');
  assert.equal(h.nextVisitJobId, 'J3');
  assert.deepEqual(h.vehicleRecords.map(v => v.vehicle), ['2017 Acura RDX']);
  assert.deepEqual(h.openItems.map(o => o.type), ['balance_owed', 'owner_note_action']);
  assert.equal(h.openItems[0].jobId, 'J2');
  assert.equal(h.lastInteraction.kind, 'call');
  assert.match(h.lastInteraction.detail, /alternator quote/);
});

// ---- Bug 3: VIN reconciliation across bookings ----

import { vehicleRecords } from '../shared/job-context.js';

test('3: customer VIN blank + bookings carry the VIN -> booking VIN; conflicts are reported, not chosen', () => {
  const recs = vehicleRecords(JILL_JOBS, { vin: '', vehicle: '2017 Acura RDX' });
  assert.equal(recs[0].vin, JILL_JOBS[1].vin);
  assert.equal(recs[0].vinStatus, 'consistent');
  assert.deepEqual(recs[0].mileageReadings.map(m => m.mileage), ['81,200', '84,950']);
  const conflict = vehicleRecords([{ id: 'x1', vehicle: '2017 Acura RDX', vin: '5J8TB4H59HL000123' }, { id: 'x2', vehicle: '2017 Acura RDX', vin: '5J8TB4H59HL000999' }]);
  assert.equal(conflict[0].vinStatus, 'conflicting');
  assert.equal(conflict[0].vin, null);
  assert.equal(conflict[0].vins.length, 2);
});

test('4: a first-name note subject never hides a real customer, but resolves when nothing else matches', () => {
  const notes = [{ contact_name: 'Jill' }, { contact_name: 'Lisa' }];
  assert.equal(resolvePerson('Jill Castle', CUSTOMERS, JILL_JOBS, { notes }).person.customerId, 'c-jill');
  assert.equal(resolvePerson('Jill', CUSTOMERS, JILL_JOBS, { notes }).status, 'ambiguous');
  const lisa = resolvePerson('Lisa', CUSTOMERS, JILL_JOBS, { notes });
  assert.deepEqual([lisa.status, lisa.person.name, lisa.person.sources], ['resolved', 'Lisa', ['note']]);
});

test('6/14: booking-only name resolves; "General Inquiry" counts as generic', () => {
  const red = resolvePerson('Red', [], [{ id: 'RD1', fname: 'Red', lname: '', phone: '7857068653', vehicle: '2021 Chevrolet Blazer' }]);
  assert.deepEqual([red.status, red.person.sources], ['resolved', ['booking']]);
  const ev = jobEvidence({ id: 'G', service: 'General Inquiry', garage_notes: 'Checked grounds' });
  assert.equal(ev.serviceCategory.generic, true);
  assert.ok(ev.hints[0].includes('never as "General Inquiry"'));
});

test('P1: command words in front of a name never break resolution', () => {
  const rows = [{ id: 'S1', fname: 'Sergei', lname: 'Butaev', phone: '928-555-0190' }];
  const cust = [{ id: 'c-sergei', fname: 'Sergei', lname: 'Butaev', phone: null }];
  for (const q of ['Sergei', 'Sergei Butaev', 'Summarize Sergei Butaev', "sergei butaev's job history"]) {
    const r = resolvePerson(q, cust, rows);
    assert.equal(r.status, 'resolved', q);
    assert.deepEqual(r.person.jobIds, ['S1'], q);
  }
  assert.equal(resolvePerson('Summarize Nobody', cust, rows).status, 'not_found');
});

test('leadOrigin: where a lead came from and where to find it, from the stored source only', async () => {
  const { leadOrigin, buildCustomerHistory } = await import('../shared/job-context.js');
  const meta = leadOrigin({ source: 'meta_ads', campaign: 'New Leads Campaign', created_at: '2026-10-05T14:45:01Z' });
  assert.match(meta.label, /Facebook\/Instagram ad lead form, campaign "New Leads Campaign"/);
  assert.match(meta.findIt, /Leads Center/); assert.match(meta.findIt, /not show up in Messenger/);
  assert.equal(meta.received, '2026-10-05T14:45:01Z');
  assert.match(leadOrigin({ source: 'website_form' }).label, /gidgarage\.com quote form/);
  assert.equal(leadOrigin({}).label, 'Not recorded');
  assert.equal(leadOrigin({ source: 'tiktok' }).label, 'Other (tiktok)');
  const h = buildCustomerHistory({ person: { name: 'Lakisha Chee', jobIds: [], sources: ['lead'] }, leads: [{ id: 'l1', created_at: '2026-10-05T14:45:01Z', source: 'meta_ads', campaign: 'New Leads Campaign', status: 'new' }] });
  assert.equal(h.leads[0].origin.source, 'meta_ads');
});
