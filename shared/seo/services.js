// Canonical service catalog + eligibility gate for SEO recommendations.
// Tests: tests/seo-services.test.js
//
// offered: true only where the BUSINESS says so, with the source recorded:
//   - the public booking widget's service list (src/BookingWidget.tsx SERVICES:
//     oil, brakes, diag, suspension, audio, full, other)
//   - the site's own business schema / FAQ (index.html)
// offered: false where the FAQ says GID refers the work out.
// offered: 'unknown' for anything not stated — never optimized for until the
// owner confirms it in seo_settings.services (e.g. [{ "id": "battery", "offered": true }]).

export const SERVICE_CATALOG = [
  { id: 'general', label: 'Mobile mechanic (general)', offered: true, source: 'site title/schema: "Flagstaff Mobile Mechanic", "Mobile Auto Repair Services"',
    terms: ['mechanic', 'mobile mechanic', 'auto repair', 'car repair', 'mobile auto', 'car mechanic', 'auto mechanic', 'mechanic near me'] },
  { id: 'brakes', label: 'Brakes', offered: true, source: 'booking widget "Brakes"; schema "Brake Service"',
    terms: ['brake', 'brakes', 'rotor', 'rotors', 'brake pad', 'brake pads', 'caliper', 'squeaky brakes', 'grinding brakes'] },
  { id: 'oil', label: 'Oil change', offered: true, source: 'booking widget "Oil Change"; schema "Oil Change"',
    terms: ['oil change', 'oil service', 'synthetic oil', 'lube'] },
  { id: 'diagnostics', label: 'Diagnostics / check engine', offered: true, source: 'booking widget "Diagnostics"; schema "Diagnostics"',
    terms: ['diagnostic', 'diagnostics', 'check engine', 'engine light', 'code reader', 'scan tool', 'obd'] },
  { id: 'suspension', label: 'Suspension', offered: true, source: 'booking widget "Suspension"; schema "Suspension Repair"',
    terms: ['suspension', 'shocks', 'struts', 'control arm', 'ball joint', 'tie rod', 'sway bar'] },
  { id: 'audio', label: 'Car audio', offered: true, source: 'booking widget "Car Audio"',
    terms: ['car audio', 'stereo', 'speakers', 'subwoofer', 'head unit'] },
  { id: 'maintenance', label: 'Full service / multi-point inspection', offered: true, source: 'booking widget "Full Service — Multi-point inspection"; schema "Full Vehicle Inspection"',
    terms: ['full service', 'maintenance', 'scheduled maintenance', 'tune up', 'tune-up', 'multi point inspection', 'multi-point inspection', 'vehicle inspection'] },
  // Not stated anywhere public — unconfirmed until the owner says so.
  { id: 'battery', label: 'Battery / no-start', offered: 'unknown', source: 'not listed in the booking widget or site; confirm in seo_settings.services',
    terms: ['battery', 'jump start', 'wont start', "won't start", 'no start', 'car won t start', 'dead battery', 'alternator', 'starter'] },
  { id: 'inspection', label: 'Pre-purchase inspection', offered: 'unknown', source: 'admin PPI tool exists but it is not advertised; confirm in seo_settings.services',
    terms: ['pre purchase inspection', 'pre-purchase inspection', 'ppi', 'used car inspection'] },
  { id: 'repairs_other', label: 'Other component repairs', offered: 'unknown', source: '"Something Else" booking option — case by case, not a promoted service',
    terms: ['water pump', 'thermostat', 'serpentine belt', 'radiator', 'coolant', 'hose', 'spark plug', 'spark plugs'] },
  { id: 'tires', label: 'Tires', offered: 'unknown', source: 'not stated', terms: ['tire', 'tires', 'flat tire', 'tire change', 'tire rotation'] },
  { id: 'body', label: 'Body / paint', offered: 'unknown', source: 'not stated', terms: ['body shop', 'dent', 'paint', 'collision'] },
  { id: 'towing', label: 'Towing', offered: 'unknown', source: 'not stated', terms: ['tow', 'towing', 'tow truck'] },
  // Referred out per the site FAQ.
  { id: 'alignment', label: 'Wheel alignment', offered: false, source: 'FAQ: referred to a specialty shop', terms: ['alignment', 'wheel alignment'] },
  { id: 'ac', label: 'A/C system', offered: false, source: 'FAQ: referred to a specialty shop', terms: ['ac repair', 'a c repair', 'air conditioning', 'ac recharge', 'freon'] },
  { id: 'transmission', label: 'Transmission overhaul', offered: false, source: 'FAQ: referred to a specialty shop', terms: ['transmission rebuild', 'transmission overhaul', 'rebuild transmission'] },
  { id: 'welding', label: 'Welding', offered: false, source: 'FAQ: referred to a specialty shop', terms: ['welding', 'welder'] },
];

const VALID = new Set([true, false, 'unknown']);

// Owner overrides (seo_settings.services) only change `offered` for known ids.
export function resolveServices(overrides = null, catalog = SERVICE_CATALOG) {
  const list = Array.isArray(overrides) ? overrides : [];
  return catalog.map(s => {
    const o = list.find(x => x && x.id === s.id && VALID.has(x.offered));
    return o ? { ...s, offered: o.offered, source: `owner setting (was: ${s.source})` } : s;
  });
}

// THE gate. Only explicitly offered services may produce actionable SEO work.
export function serviceEligibility(serviceId, services = SERVICE_CATALOG) {
  if (!serviceId) return { eligible: false, reason: 'no_service', detail: 'No specific service identified.' };
  const s = services.find(x => x.id === serviceId);
  if (!s) return { eligible: false, reason: 'unknown_service', detail: `"${serviceId}" is not in the service catalog.` };
  if (s.offered === true) return { eligible: true, reason: 'offered', detail: s.source };
  if (s.offered === false) return { eligible: false, reason: 'referred_out', detail: `${s.label}: ${s.source}` };
  return { eligible: false, reason: 'unconfirmed', detail: `${s.label}: ${s.source}` };
}
