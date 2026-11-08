import { WARRANTY_SHORT } from './warranty-policy.js';

// Terms customers sign on an estimate. A signature only covers the wording shown
// at that moment, so NEVER edit a published version: add a new one with a start
// time, and estimateTermsFor() keeps each signed estimate showing what that
// customer actually agreed to. Set a start time AFTER the deploy lands, so nobody
// is shown as agreeing to wording they did not see.
const V2_FROM = Date.parse('2026-11-04T21:05:00Z'); // adds Terms of Service + Privacy Policy
const V3_FROM = Date.parse('2026-11-07T00:15:00Z'); // adds the photo, video and audio consent
const V4_FROM = Date.parse('2026-11-07T00:50:00Z'); // 30-day limited workmanship warranty rewrite; one cancellation fee rule

const CORE_BASE = [
  'Price is as quoted. Any additional work discovered during service requires your explicit approval before proceeding. We will contact you before performing any work beyond the scope of this estimate.',
  'Payment is due in full at time of completion. Unpaid balances may be subject to a storage or holding fee. Returned checks or disputed charges are subject to a $35 processing fee.',
  'If a card on file was provided at the time of booking, customer authorizes GID Garage to charge the card on file for the full agreed amount upon job completion. Customer will be informed of the final amount before the card is charged. For parts-sourced jobs, a deposit may be charged prior to service to cover parts costs, as discussed and agreed upon during confirmation.',
];

const SIGN_V1 = 'By signing this estimate, you authorize GID Garage to perform the described work, confirm you are 18 years of age or older, and agree to all terms listed herein.';
const SIGN_V2 = 'By signing this estimate, you authorize GID Garage to perform the described work, confirm you are 18 years of age or older and the vehicle owner or authorized by the owner, and agree to all terms listed herein and to the GID Garage Terms of Service (gidgarage.com/terms) and Privacy Policy (gidgarage.com/privacy). If they conflict, the terms on this estimate control.';

const MEDIA_CONSENT = 'PHOTOS, VIDEO, AND AUDIO: GID Garage may photograph, film, and record audio of you, your vehicle, and the work area and visible exterior of the service location (including driveways, garages, and parking areas) before, during, and after service, using phones, body cameras, dash cameras, or similar devices, and may record its conversations and calls with you. These recordings may be kept and used for job records, warranty, safety, training, payment disputes, and legal evidence. You also grant GID Garage a non-exclusive, perpetual, worldwide, royalty-free license to use, edit, and publish them, including your image and voice, in advertising, on our website, and on social media, without payment to you. We will not record inside private living areas, and will not publish your full name, address or house number, phone, email, license plate, or VIN, or images of minors, without separate permission. To opt out of marketing use, tell us in writing before work begins.';

const EXTENDED_V1_TO_V3 = [
  'GID Garage is not responsible for pre-existing conditions, hidden damage, or issues unrelated to the service performed. Vehicle condition may be documented via photo before and during service. Pre-existing damage noted by the customer at time of signing is documented and acknowledged.',
  'On vehicles with high mileage or aged components, the act of performing service may cause adjacent or related components to fail. This is an inherent risk of servicing older vehicles and does not constitute negligence or liability on the part of the technician.',
  'Parts carry manufacturer warranty. Labor is warranted for 30 days from date of service. Warranty is void if the vehicle is serviced by another party for the same issue, or if customer-supplied parts are determined to be the cause of failure. GID Garage assumes no warranty responsibility for customer-supplied parts.',
  'Diagnostic recommendations are based on available data at time of inspection and do not constitute a guarantee of all underlying issues.',
  'GID Garage is a mobile service provider. We are not liable for delays caused by weather, parts availability, or circumstances outside our control. We will notify you promptly of any scheduling changes. GID Garage reserves the right to reschedule service due to unsafe working conditions including extreme weather, insufficient lighting, or unstable ground conditions.',
  'Customer is responsible for ensuring the vehicle is accessible, on a flat stable surface, with sufficient clearance to perform the service safely. If conditions are unsafe upon arrival, GID Garage reserves the right to charge a trip fee and reschedule.',
  'Customer authorizes GID Garage to operate the vehicle as necessary to complete and verify the service performed.',
  'GID Garage disposes of fluids and materials responsibly per local regulations. Customer is responsible for any pre-existing fluid contamination on their property.',
  'If the customer is unreachable for approval of additional work, GID Garage reserves the right to pause or halt service until contact is made.',
  'GID Garage is not liable for service interruptions caused by third parties, property owners, or local ordinances restricting vehicle repair at the service location. Customer is responsible for ensuring repair work is permitted on the premises.',
  'Any disputes arising from services rendered shall be governed by the laws of the State of Arizona. Coconino County shall be the agreed venue for any legal proceedings.',
  'Cancellations or reschedules require at least 24 hours notice. Late cancellations (inside 24 hours) or no-shows may be subject to a trip fee to cover technician time and travel already committed.',
  'If parts have already been ordered or purchased on your behalf prior to cancellation, you are responsible for the cost of those parts, particularly special-order or non-returnable items. Any deposit collected for parts is non-refundable once the parts have been ordered.',
  'Once you have approved and signed this estimate, your appointment slot, parts sourcing, and technician scheduling are reserved on your behalf. Cancelling after approval is subject to a $50 cancellation fee to cover the scheduling and preparation already committed to your job.',
];

// V4 replaces V3 terms that conflicted with the warranty policy, and makes up to 50%
// of the quote the one cancellation rule (it drops the old trip fee and flat $50).
const V4_REPLACEMENTS = [
  ['On vehicles with high mileage', 'Older or high-mileage vehicles can have hidden deterioration, such as brittle plastic, corroded fasteners, and worn wiring, that may fail during normal, careful service. Repairing one component does not guarantee the condition of surrounding components. This does not excuse damage caused by our defective workmanship or negligence.'],
  ['Parts carry manufacturer warranty.', 'GID Garage does not guarantee customer-supplied parts. If a supplied part is incorrect, defective, damaged, or incompatible, additional labor and service charges may apply, and we may decline to install it.'],
  ['Cancellations or reschedules require', 'Cancellations or reschedules require at least 24 hours notice. Late cancellations (inside 24 hours) and no-shows may be subject to a cancellation fee of up to 50% of the quoted service cost, to cover technician time, travel, and the reserved appointment.'],
  ['Diagnostic recommendations are based', 'Diagnostic services are evaluations based on the information available at the time of inspection. They do not guarantee that every problem has been found, that a repair will resolve every symptom, or the future condition of the vehicle.'],
];
export const ESTIMATE_TERMS_EXTENDED = EXTENDED_V1_TO_V3.filter(t => !t.startsWith('Once you have approved')).map(t => V4_REPLACEMENTS.find(([start]) => t.startsWith(start))?.[1] ?? t);

export const ESTIMATE_TERMS_CORE = [...CORE_BASE, WARRANTY_SHORT, MEDIA_CONSENT, SIGN_V2];

// Added on top of the normal terms for a pre-purchase inspection (service 'ppi').
// These are published wording too: version them before changing one.
export const PPI_TERMS = [
  "PRE-PURCHASE INSPECTION: This is a visual and functional inspection of the items listed on this estimate, based on conditions and access at the time of inspection. It does not include disassembly. It is not a guarantee, warranty, or certification of the vehicle's condition, value, title, history, or future reliability, and some problems may not be detectable. The decision to buy the vehicle is yours.",
  "If you do not own this vehicle, you confirm that the owner or seller has given permission for this inspection at the service location, including any test drive, photos, and video. The inspection fee is owed once the inspection is performed, whether or not you buy the vehicle.",
];

// Unsigned jobs get the current terms; a signed job gets the version in force when
// it was signed. A signed job with no timestamp gets the oldest version, so it can
// never claim consent to something added later.
export function estimateTermsFor(job) {
  const terms = termsByDate(job);
  if (job?.service !== 'ppi') return terms;
  const core = [...PPI_TERMS, ...terms.core];
  return { core, extended: terms.extended, all: [...core, ...terms.extended] };
}

function termsByDate(job) {
  const t = job?.customerAgreed ? (Date.parse(job.signedAt) || 0) : Infinity;
  if (t >= V4_FROM) return { core: ESTIMATE_TERMS_CORE, extended: ESTIMATE_TERMS_EXTENDED, all: [...ESTIMATE_TERMS_CORE, ...ESTIMATE_TERMS_EXTENDED] };
  const core = t >= V3_FROM ? [...CORE_BASE, MEDIA_CONSENT, SIGN_V2] : [...CORE_BASE, t >= V2_FROM ? SIGN_V2 : SIGN_V1];
  return { core, extended: EXTENDED_V1_TO_V3, all: [...core, ...EXTENDED_V1_TO_V3] };
}
