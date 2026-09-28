// Shared test fixtures (Supabase snake_case rows) modeled on real Telegram
// test cases. "Today" in every test is Sept 27 2026, noon Arizona.

export const NOW = new Date('2026-09-27T19:00:00Z');
export const JILL_VIN = '5J8TB4H59HL000123';

// Jill Castle: 2017 Acura RDX. Her customer record has NO VIN; all three real
// jobs carry it on the booking. Jobs are filed under vague categories.
export const JILL_JOBS = [
  { id: 'J0', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-01-05', service: 'other', status: 'cancelled', job_status: 'CANCELLED', vehicle: '2017 Acura RDX' },
  {
    id: 'J1', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-03-02', time: '9:00 AM', service: 'other', job_status: 'PAID',
    vehicle: '2017 Acura RDX', vin: JILL_VIN, mileage: '81,200', notes: 'Address: 12 Pine St | Brake service: Pads & rotors (front) | Grinding noise when stopping',
    estimate_notes: 'Replace front pads and rotors, clean and lubricate slide pins, inspect brake hoses',
    line_items: JSON.stringify([{ id: 'a', label: 'Front brake labor', type: 'labor', amount: 180 }, { id: 'b', label: 'Front pads + rotors', type: 'parts', amount: 220 }]),
    invoice_amount: 400, tax_amount: 20, amount_paid: 420, paid_at: '2026-03-02T22:00:00Z', payments: '[]',
  },
  {
    id: 'J2', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-06-10', time: '1:00 PM', service: 'diag', job_status: 'COMPLETED',
    vehicle: '2017 Acura RDX', vin: JILL_VIN, mileage: '84,950', notes: 'Battery light came on',
    garage_notes: 'Battery tested good. Alternator output 12.1V at idle — recommend alternator replacement.',
    inspection_data: { tirePressure: { fl: '', fr: '', rl: '', rr: '' }, tireTread: { fl: '', fr: '', rl: '', rr: '' }, dtcCodes: [{ id: 'd1', code: 'P0562', plan: 'System voltage low — check charging system' }] },
    estimate_amount: 120, invoice_amount: null, tax_amount: 0, amount_paid: null,
  },
  { id: 'J3', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-10-05', time: '10:00 AM', service: 'other', job_status: 'BOOKED', vehicle: '2017 Acura RDX', vin: JILL_VIN },
];

// Richard's Ranger: customer-facing estimate is $409.11 = $392.40 + $16.71 tax.
export const RICHARD_JOB = {
  id: 'R1', customer_id: null, fname: 'Richard', lname: 'Lee', phone: '928-555-0144', date: '2026-09-27', time: '3:00 PM', service: 'other',
  status: 'confirmed', job_status: 'ESTIMATE_SENT', vehicle: '2011 Ford Ranger', estimate_amount: 392.40, tax_amount: 16.71,
  estimate_notes: 'Replace water pump and thermostat, coolant flush', service_address: '88 Elm St',
};

// Sergei: generic "General Inquiry" category; the real work lives in photo
// captions and the pre-scan document.
export const SERGEI_JOB = {
  id: 'S1', customer_id: null, fname: 'Sergei', lname: 'Butaev', phone: '928-555-0190', date: '2026-09-20', time: '10:00 AM', service: 'General Inquiry',
  job_status: 'PAID', vehicle: '2024 Ram 3500 Turbo Diesel', invoice_amount: 250, tax_amount: 0, amount_paid: 250, paid_at: '2026-09-20T20:00:00Z',
  payments: JSON.stringify([{ amount: 250, at: '2026-09-20T20:00:00Z', method: 'Card (Stripe)' }]),
  admin_photos: [
    { key: 'a1', url: 'u', name: 'p1.jpg', note: 'Passenger Side Battery Good.' },
    { key: 'a2', url: 'u', name: 'p2.jpg', note: 'Noted to customer P2509 code. Checked battery terminals, vehicle grounds and PCM wiring — all looked to be in good condition.' },
    { key: 'a3', url: 'u', name: 'p3.jpg', note: 'Driver side Battery Good.' },
    { key: 'a4', url: 'u', name: 'p4.jpg', note: 'Puddle is AC condensation, not leaking coolant/oil.' },
    { key: 'a5', url: 'u', name: 'p5.jpg', note: 'Coolant temp good after idling 30 minutes. Transmission temp good. Oil pressure good.' },
  ],
  pre_scan: { url: 'u', name: 'Ram 3500 pre-scan.pdf' },
};

// Red: exists only as a booking name — no customers row.
export const RED_JOB = {
  id: 'RD1', customer_id: null, fname: 'Red', lname: '', phone: '7857068653', date: '2026-09-14', time: '11:00 AM', service: 'other',
  job_status: 'COMPLETED', vehicle: '2021 Chevrolet Blazer 3.6L V6 RS', vin: '3GNKBKRS1MS564507', estimate_amount: 90, tax_amount: 0,
  notes: '[External lead] c/s after battery replacement steering felt tight, performing SAS Reset.',
};

// Another Ranger today, so "the Ranger" must be resolved from real rows.
export const SEAN_JOB = {
  id: 'SW1', customer_id: null, fname: 'Sean', lname: 'Webb', phone: '928-555-0111', date: '2026-09-27', time: '8:00 AM', service: 'diag',
  job_status: 'IN_PROGRESS', vehicle: '2008 Ford Ranger', notes: 'Alternator light came on',
};

export const LISA_NOTE = {
  id: 'N2', created_at: '2026-09-20T00:00:00Z', status: 'open', contact_name: 'Lisa', summary: 'Lisa might want an oil change sometime next week',
  raw_text: 'Lisa might want an oil change sometime next week', preferred_timing: 'sometime next week', action_needed: null,
};
export const LISA_OLDER_NOTE = {
  id: 'N3', created_at: '2026-09-10T00:00:00Z', status: 'resolved', contact_name: 'Lisa', summary: 'Lisa asked about tire rotation pricing',
  raw_text: 'Lisa asked about tire rotation pricing',
};

// Full seed for end-to-end tests.
export function seed() {
  return {
    bookings: [
      ...JILL_JOBS, RICHARD_JOB, SERGEI_JOB, RED_JOB, SEAN_JOB,
      { id: 'M1', customer_id: 'c-jm', fname: 'Jill', lname: 'Moreno', phone: '928-555-0177', date: '2026-09-15', service: 'oil', job_status: 'INVOICED', vehicle: '2018 Toyota Camry', invoice_amount: 80, tax_amount: 5, amount_paid: 0, payments: '[]', estimate_notes: 'Oil and filter change' },
      // Late-August payment: counts in the last 30 days but not this month.
      { id: 'A1', customer_id: null, fname: 'Tom', lname: 'Reyes', phone: '928-555-0122', date: '2026-08-29', service: 'brakes', job_status: 'PAID', vehicle: '2014 Honda Accord', invoice_amount: 600, tax_amount: 55, amount_paid: 655, paid_at: '2026-08-30T18:00:00Z', parts_cost: 150, payments: JSON.stringify([{ amount: 655, at: '2026-08-30T18:00:00Z', method: 'Cash' }]) },
    ],
    customers: [
      { id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '(928) 555-0100', vehicle: '2017 Acura RDX', vin: '', notes: 'Prefers texts' },
      { id: 'c-jm', fname: 'Jill', lname: 'Moreno', phone: '928-555-0177' },
    ],
    leads: [
      { id: 'L1', created_at: '2026-06-01T00:00:00Z', fname: 'Jill', lname: 'Castle', phone: '9285550100', status: 'booked', booking_id: 'J2', requested_service: 'battery light' },
      { id: 'L3', created_at: '2026-09-25T00:00:00Z', fname: 'Dana', lname: 'Ortiz', phone: '9285550155', status: 'new', requested_service: 'brakes' },
      { id: 'L4', created_at: '2026-09-01T00:00:00Z', fname: 'Mo', lname: 'Khan', phone: '9285550166', status: 'contacted', last_contacted_at: '2026-09-05T00:00:00Z', follow_up_at: '2026-09-26T16:00:00Z' },
    ],
    calls: [{ id: 'C1', created_at: '2026-06-12T17:00:00Z', phone: '928.555.0100', direction: 'outbound', outcome: 'other', notes: 'Quoted alternator $480' }],
    jarvis_business_notes: [
      { id: 'N1', created_at: '2026-06-11T00:00:00Z', status: 'open', contact_name: 'Jill Castle', summary: 'Jill deciding on alternator', action_needed: 'Follow up on alternator quote', raw_text: 'Jill Castle deciding on alternator' },
      LISA_NOTE, LISA_OLDER_NOTE,
    ],
    jarvis_reminders: [],
    business_settings: [{ id: 'default', owner_tax_reserve_pct: 0.3, owner_stripe_fee_pct: 0.03, owner_overhead_items: [{ amount: 300 }] }],
    marketing_spend: [],
    jarvis_proactive_state: [],
  };
}
