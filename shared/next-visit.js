// Next-visit check: a free "what's next" checklist done on any job. Yellow/red
// items become recommended services; the customer approves or declines them on
// their invoice and picks a date/time, which creates ONE new job for that visit.
// Stored inside bookings.inspection_data.nextVisit (no new table).
// No prices: recommendations are quoted later. Tests: tests/next-visit.test.js

export const NV_STATUS = { good: 'Good', soon: 'Soon', now: 'Needs attention' };

// The default checklist: quick checks any mobile visit can do. Editable in Hub.
export const DEFAULT_CHECKLIST = [
  { id: 'brake-pads-front', category: 'Brakes', label: 'Front brake pads', service: 'Front brake pad replacement' },
  { id: 'brake-pads-rear', category: 'Brakes', label: 'Rear brake pads / shoes', service: 'Rear brake pad / shoe replacement' },
  { id: 'rotors', category: 'Brakes', label: 'Rotors / drums', service: 'Rotor / drum replacement' },
  { id: 'brake-fluid', category: 'Brakes', label: 'Brake fluid condition', service: 'Brake fluid flush' },
  { id: 'tires', category: 'Tires', label: 'Tire tread & wear pattern', service: 'Tire replacement / alignment check' },
  { id: 'tire-pressure', category: 'Tires', label: 'Tire pressure', service: 'Tire pressure / leak check' },
  { id: 'oil', category: 'Fluids', label: 'Engine oil level & condition', service: 'Oil change' },
  { id: 'coolant', category: 'Fluids', label: 'Coolant level & condition', service: 'Coolant flush' },
  { id: 'trans-fluid', category: 'Fluids', label: 'Transmission fluid', service: 'Transmission fluid service' },
  { id: 'washer-fluid', category: 'Fluids', label: 'Washer fluid', service: 'Washer fluid top-off' },
  { id: 'battery', category: 'Under the hood', label: 'Battery & terminals', service: 'Battery test / replacement' },
  { id: 'belt', category: 'Under the hood', label: 'Serpentine belt', service: 'Serpentine belt replacement' },
  { id: 'hoses', category: 'Under the hood', label: 'Radiator & heater hoses', service: 'Hose replacement' },
  { id: 'air-filter', category: 'Under the hood', label: 'Engine air filter', service: 'Engine air filter replacement' },
  { id: 'cabin-filter', category: 'Under the hood', label: 'Cabin air filter', service: 'Cabin air filter replacement' },
  { id: 'shocks', category: 'Steering & suspension', label: 'Shocks / struts', service: 'Shock / strut replacement' },
  { id: 'front-end', category: 'Steering & suspension', label: 'Tie rods & ball joints', service: 'Front-end component replacement' },
  { id: 'cv', category: 'Steering & suspension', label: 'CV axles & boots', service: 'CV axle replacement' },
  { id: 'lights', category: 'Lights & visibility', label: 'Headlights, brake lights & signals', service: 'Bulb replacement' },
  { id: 'wipers', category: 'Lights & visibility', label: 'Wiper blades', service: 'Wiper blade replacement' },
  { id: 'windshield', category: 'Lights & visibility', label: 'Windshield chips / cracks', service: 'Windshield repair referral' },
  { id: 'leaks', category: 'Leaks', label: 'Oil / fluid leaks', service: 'Leak diagnosis' },
];

const str = (v, n) => String(v ?? '').trim().slice(0, n);
const slug = s => str(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A saved checklist template (from Hub), cleaned; falls back to the default.
export function cleanTemplate(list) {
  if (!Array.isArray(list) || !list.length) return DEFAULT_CHECKLIST;
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const label = str(t?.label, 80);
    if (!label) continue;
    let id = str(t?.id, 60) || slug(label);
    while (seen.has(id)) id += '-2';
    seen.add(id);
    out.push({ id, category: str(t?.category, 40) || 'Other', label, service: str(t?.service, 80) || label });
  }
  return out.length ? out.slice(0, 80) : DEFAULT_CHECKLIST;
}

// The job's check, with every template item present (keeps answers already given).
export function withTemplate(nextVisit, template) {
  const items = Array.isArray(nextVisit?.items) ? nextVisit.items : [];
  const byId = new Map(items.map(i => [i.id, i]));
  const merged = cleanTemplate(template).map(t => ({ ...t, status: null, note: '', laborHours: null, media: [], ...(byId.get(t.id) || {}) }));
  const extra = items.filter(i => !merged.some(m => m.id === i.id));
  return { ...(nextVisit || {}), items: [...merged, ...extra] };
}

export const recommendations = nv => (nv?.items || []).filter(i => i.status === 'soon' || i.status === 'now');
export const hasCheck = nv => (nv?.items || []).some(i => i.status);

// "A", "B", and "C" were declined at this time.
export function declinedSentence(labels) {
  const q = labels.map(l => `"${l}"`);
  if (!q.length) return '';
  const list = q.length === 1 ? q[0] : q.length === 2 ? `${q[0]} and ${q[1]}` : `${q.slice(0, -1).join(', ')}, and ${q.at(-1)}`;
  return `${list} ${q.length === 1 ? 'was' : 'were'} declined at this time.`;
}

// Every recommendation must be either approved or declined, once.
export function checkResponse(nv, approvedIds = [], declinedIds = []) {
  const recs = recommendations(nv);
  if (!recs.length) throw new Error('There are no recommendations to respond to.');
  const ids = new Set(recs.map(r => r.id));
  const a = [...new Set(approvedIds.map(String))];
  const d = [...new Set(declinedIds.map(String))];
  if (a.some(x => !ids.has(x)) || d.some(x => !ids.has(x)) || a.some(x => d.includes(x))) throw new Error('Unknown or duplicated item.');
  if (a.length + d.length !== recs.length) throw new Error('Please approve or decline every item.');
  return { approved: recs.filter(r => a.includes(r.id)), declined: recs.filter(r => d.includes(r.id)) };
}

export const inspectionUrl = (site, jobId) => `${site}/inspection?id=${encodeURIComponent(jobId)}`;

// The new job for the next visit: the customer's details, vehicle, chosen
// date/time, what they approved, what they declined, and the inspection link.
// Ordinary booking, no money fields (the estimate is built later as usual).
export function nextVisitJobRow({ orig, approved, declined, date, time, id, createdAt, site }) {
  const services = approved.map(a => a.service);
  const lines = [
    `[Next-visit request from invoice ${orig.id}]`,
    `Customer requested: ${services.join('; ')}.`,
    ...(declined.length ? [declinedSentence(declined.map(d => d.service))] : []),
    `Inspection: ${inspectionUrl(site, orig.id)}`,
  ];
  return {
    id, service: 'other', service_icon: '✅', date, time, date_tbd: false,
    fname: orig.fname || '', lname: orig.lname || '', phone: orig.phone || '', email: orig.email || '',
    vehicle: orig.vehicle || '', ...(orig.vin ? { vin: orig.vin } : {}), ...(orig.mileage ? { mileage: String(orig.mileage) } : {}),
    service_address: orig.service_address || '',
    ...(orig.customer_id ? { customer_id: orig.customer_id } : {}),
    ...(orig.fleet_id ? { fleet_id: orig.fleet_id } : {}), ...(orig.fleet_vehicle_id ? { fleet_vehicle_id: orig.fleet_vehicle_id } : {}),
    notes: lines.join('\n'), garage_notes: '', status: 'confirmed', job_status: 'BOOKED', created_at: createdAt,
  };
}
