// Shared test fixtures (bookings rows in Supabase snake_case).

// Jill Castle: three real jobs + one cancelled, all filed under vague categories.
export const JILL_JOBS = [
  { id: 'J0', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-01-05', service: 'other', status: 'cancelled', job_status: 'CANCELLED', vehicle: '2015 Honda CR-V' },
  {
    id: 'J1', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-03-02', time: '9:00 AM', service: 'other', job_status: 'PAID',
    vehicle: '2015 Honda CR-V', notes: 'Address: 12 Pine St | Brake service: Pads & rotors (front) | Grinding noise when stopping',
    estimate_notes: 'Replace front pads and rotors, clean and lubricate slide pins, inspect brake hoses',
    line_items: JSON.stringify([{ id: 'a', label: 'Front brake labor', type: 'labor', amount: 180 }, { id: 'b', label: 'Front pads + rotors', type: 'parts', amount: 220 }]),
    invoice_amount: 400, tax_amount: 20, amount_paid: 420, paid_at: '2026-03-02T22:00:00Z', payments: '[]',
  },
  {
    id: 'J2', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-06-10', time: '1:00 PM', service: 'diag', job_status: 'COMPLETED',
    vehicle: '2015 Honda CR-V', notes: 'Battery light came on',
    garage_notes: 'Battery tested good. Alternator output 12.1V at idle — recommend alternator replacement.',
    inspection_data: { tirePressure: { fl: '', fr: '', rl: '', rr: '' }, tireTread: { fl: '', fr: '', rl: '', rr: '' }, dtcCodes: [{ id: 'd1', code: 'P0562', plan: 'System voltage low — check charging system' }] },
    estimate_amount: 120, invoice_amount: null, tax_amount: 0, amount_paid: null,
  },
  { id: 'J3', customer_id: 'c-jill', fname: 'Jill', lname: 'Castle', phone: '928-555-0100', date: '2026-10-05', time: '10:00 AM', service: 'other', job_status: 'BOOKED', vehicle: '2015 Honda CR-V' },
];
