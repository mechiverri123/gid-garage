// ── GID GARAGE JOB OPS ──────────────────────────────────────────────────────
// Drop this file into src/ alongside BookingWidget.tsx
// In App.tsx, add the EstimatePage route and Jobs tab to AdminSchedule
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

// Emails now sent server-side — BREVO_API_KEY removed from client bundle
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;

const R2 = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? '';
function img(filename: string) { return R2 ? `${R2}/${filename}` : `/${filename}`; }

function loadStripe(publishableKey: string): Promise<any> {
  return new Promise((resolve) => {
    if ((window as any).Stripe) { resolve((window as any).Stripe(publishableKey)); return; }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => resolve((window as any).Stripe!(publishableKey));
    document.head.appendChild(script);
  });
}

// ── AZ TPT — Flagstaff combined rate. Default below is used until the saved
// rate loads from Supabase (see initTaxRate()); editable in Hub → Taxes.
let TAX_RATE = 0.09386; // 9.386%
function setTaxRate(rate: number) { if (rate > 0 && rate < 1) TAX_RATE = rate; }
function taxRatePercentLabel(): string { return (TAX_RATE * 100).toFixed(3); }
// AZ TPT does NOT apply to labor or the mobile service/travel fee. Everything else
// (parts, flat service charges, misc add-on lines) is taxable. calcTax(subtotal) is a
// legacy fallback that taxes the whole amount; prefer taxFromItems() with line items.
const TAX_EXEMPT_TYPES: LineItem['type'][] = ['labor', 'mobile', 'discount'];
function calcTax(subtotal: number) { return Math.round(subtotal * TAX_RATE * 100) / 100; }

// Convert "14:30" (native <input type="time"> value) → "2:30 PM" (display format used everywhere else)
function to12h(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}
// Convert "2:30 PM" → "14:30" so the native time input can show the current value
function from12h(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '12:00';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

// Sum of taxable line items — everything except labor and the mobile fee.
function taxableAmount(items?: LineItem[] | null): number {
  if (!items || items.length === 0) return 0;
  return items.filter(i => !TAX_EXEMPT_TYPES.includes(i.type)).reduce((s, i) => s + (i.amount || 0), 0);
}
// Tax computed from line items — labor and mobile fee are exempt.
function taxFromItems(items?: LineItem[] | null): number {
  return Math.round(taxableAmount(items) * TAX_RATE * 100) / 100;
}
// Total = full subtotal (all line items) + tax on the taxable portion.
function totalFromItems(subtotal: number, items?: LineItem[] | null): number {
  return Math.round((subtotal + taxFromItems(items)) * 100) / 100;
}

// ── TYPES ────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'BOOKED'
  | 'ESTIMATE_SENT'
  | 'SIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'INVOICED'
  | 'PAID'
  | 'CANCELLED';

export interface LineItem {
  id: string;
  label: string;
  amount: number;
  type: 'mobile' | 'labor' | 'parts' | 'fixed' | 'other' | 'discount';
}

export interface JobPhoto {
  id: string;
  key?: string;
  url?: string;
  /** @deprecated legacy base64 photos saved before the R2 upload fix — kept only for backward-compat rendering of old records */
  dataUrl?: string;
  note: string;
  takenAt: string;
}

export interface JobVideo {
  id: string;
  key?: string;
  url?: string;
  note: string;
  takenAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  note: string;
  at: string;
  stripeId?: string;
}

export interface PartsReceipt {
  key: string;
  url: string;
  name: string;
  type: string;
  uploadedAt: string;
}

export interface Job {
  id: string;
  service: string;
  date: string;
  time: string;
  fname: string;
  lname: string;
  phone: string;
  email: string;
  vehicle: string;
  notes: string;
  garageNotes: string;
  status: string;
  jobStatus: JobStatus;
  createdAt: string;
  // estimate
  estimateAmount: number | null;
  estimateNotes: string;
  lineItems: LineItem[];
  taxAmount: number | null;
  // signing
  preExistingDamage: string;
  customerAgreed: boolean;
  customerSignature: string;
  signedAt: string | null;
  signedIp: string;
  // payment
  invoiceAmount: number | null;
  stripeTransactionId: string;
  stripeCustomerId: string;
  stripeLast4: string;
  paidAt: string | null;
  adjustmentReason: string;
  adjustmentAmount: number | null;
  // review tracking — when the customer is confirmed to have left a Google
  // review (marked manually, since there's no automated GBP review API
  // wired up). Excludes them from future review-request follow-up emails —
  // for this job, and for any other job under the same email, since asking
  // an already-reviewed repeat customer again is just annoying.
  reviewLeftAt: string | null;
  // how many times the invoice email has been sent, and when last — surfaced
  // on the Payment tab so it's obvious whether a customer was ever notified
  invoiceSentCount: number;
  invoiceLastSentAt: string | null;
  // partial / manual payments — running total + history, separate from the
  // full Stripe-charge flow so cash/check/Zelle/family-discount payments can
  // be recorded against an invoice without marking the whole job PAID.
  amountPaid: number | null;
  payments: Payment[];
  // parts cost + receipts — admin-only, used for the net profit calculator
  partsCost: number | null;
  partsReceipts: PartsReceipt[];
  // photos
  jobPhotos: JobPhoto[];
  jobVideos: JobVideo[];
  adminPhotos: { key: string; url: string; name: string; note: string }[];
  // pre/post health scan documents (optional links shown on the invoice)
  preScan: ScanDoc | null;
  postScan: ScanDoc | null;
  // optional external payment link (e.g. pay.bluevine.com/...) shown on the
  // customer invoice as a "Pay Now" button, instead of/alongside card-on-file
  paymentLink: string | null;
  // inspection
  inspectionData: InspectionData | null;
}

export interface ScanDoc {
  key?: string;
  url: string;
  name: string;
}

interface TireReading {
  fl: string; fr: string; rl: string; rr: string;
}
interface DtcCode {
  id: string;
  code: string;
  plan: string;
}
interface InspectionData {
  tirePressure: TireReading;
  tireTread: TireReading;
  dtcCodes: DtcCode[];
}

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────


// ── ERROR MONITORING ─────────────────────────────────────────────────────────
// Minimal Sentry reporter — raw envelope POST, no @sentry/* SDK dependency
// (keeps bundle size down). Mirrors functions/_lib/sentry.js on the server
// side. Set VITE_SENTRY_DSN (Cloudflare Pages → env vars, build-time) to a
// Sentry project DSN to turn this on; no-ops silently if unset.
const SENTRY_DSN = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;

async function reportError(error: unknown, extra: Record<string, any> = {}) {
  try {
    if (!SENTRY_DSN) return;
    const m = SENTRY_DSN.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      exception: { values: [{ type: err.name || 'Error', value: err.message, stacktrace: err.stack ? { frames: [{ filename: 'client', function: 'unknown', context_line: err.stack }] } : undefined }] },
      extra: { ...extra, url: typeof location !== 'undefined' ? location.href : '', ua: typeof navigator !== 'undefined' ? navigator.userAgent : '' },
    };
    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
    const itemHeader = JSON.stringify({ type: 'event' });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}`;
    await fetch(`https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body,
    });
  } catch { /* error reporting must never itself break the UI */ }
}

// Catches anything that slips past a local try/catch — installed once per
// page (admin dashboard + the public invoice/pay page).
function useGlobalErrorReporting(context: Record<string, any> = {}) {
  useEffect(() => {
    if (!SENTRY_DSN) return;
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, { source: 'window.onerror', ...context });
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, { source: 'unhandledrejection', ...context });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
}

// ── SECURE WORKER HELPERS ────────────────────────────────────────────────────
// Admin ops -> /admin-api/data (service key, behind Cloudflare Access).
// Customer ops (estimate/invoice view + e-sign) -> /api/customer (self-validating).
async function adminPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/admin-api-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function apiPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/api-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function mapJob(b: any): Job {
  return {
    id: b.id,
    service: b.service,
    date: b.date,
    time: b.time,
    fname: b.fname,
    lname: b.lname,
    phone: b.phone,
    email: b.email,
    vehicle: b.vehicle,
    notes: b.notes || '',
    garageNotes: b.garage_notes || '',
    status: b.status,
    jobStatus: (b.job_status as JobStatus) || 'BOOKED',
    createdAt: b.created_at,
    estimateAmount: b.estimate_amount ?? null,
    estimateNotes: b.estimate_notes || '',
    lineItems: b.line_items ? (typeof b.line_items === 'string' ? JSON.parse(b.line_items) : b.line_items) : [],
    taxAmount: b.tax_amount ?? null,
    preExistingDamage: b.pre_existing_damage || '',
    customerAgreed: b.customer_agreed || false,
    customerSignature: b.customer_signature || '',
    signedAt: b.signed_at || null,
    signedIp: b.signed_ip || '',
    invoiceAmount: b.invoice_amount ?? null,
    stripeTransactionId: b.stripe_transaction_id || '',
    stripeCustomerId: b.stripe_customer_id || '',
    stripeLast4: b.stripe_last4 || '',
    paidAt: b.paid_at || null,
    adjustmentReason: b.adjustment_reason || '',
    adjustmentAmount: b.adjustment_amount ?? null,
    reviewLeftAt: b.review_left_at || null,
    invoiceSentCount: b.invoice_sent_count ?? 0,
    invoiceLastSentAt: b.invoice_last_sent_at ?? null,
    amountPaid: b.amount_paid ?? null,
    payments: b.payments ? (typeof b.payments === 'string' ? JSON.parse(b.payments) : b.payments) : [],
    partsCost: b.parts_cost ?? null,
    partsReceipts: b.parts_receipts ? (typeof b.parts_receipts === 'string' ? JSON.parse(b.parts_receipts) : b.parts_receipts) : [],
    jobPhotos: b.job_photos ? (typeof b.job_photos === 'string' ? JSON.parse(b.job_photos) : b.job_photos) : [],
    jobVideos: b.job_videos ? (typeof b.job_videos === 'string' ? JSON.parse(b.job_videos) : b.job_videos) : [],
    adminPhotos: b.admin_photos ? (typeof b.admin_photos === 'string' ? JSON.parse(b.admin_photos) : b.admin_photos) : [],
    preScan: b.pre_scan ? (typeof b.pre_scan === 'string' ? JSON.parse(b.pre_scan) : b.pre_scan) : null,
    postScan: b.post_scan ? (typeof b.post_scan === 'string' ? JSON.parse(b.post_scan) : b.post_scan) : null,
    paymentLink: b.payment_link || null,
    inspectionData: b.inspection_data ? (typeof b.inspection_data === 'string' ? JSON.parse(b.inspection_data) : b.inspection_data) : null,
  };
}

async function writePaymentEvent(
  bookingId: string,
  eventType: 'paid' | 'declined',
  amount?: number,
  errorMessage?: string
) {
  try {
    await adminPost('write-payment-event', {
      booking_id: bookingId,
      event_type: eventType,
      amount: amount ?? null,
      error_message: errorMessage ?? null,
    });
  } catch { /* non-critical */ }
}

export async function getAllJobs(): Promise<Job[]> {
  const data = (await adminPost('list-bookings') || []).filter((b: any) => b.status !== 'pending' && b.status !== 'cancelled');
  return data.map(mapJob);
}

// ADMIN read (behind Cloudflare Access)
export async function getJobById(id: string): Promise<Job | null> {
  const row = await adminPost('get-booking', { id });
  return row ? mapJob(row) : null;
}

// PUBLIC read for the customer-facing estimate / invoice pages
export async function getJobByIdPublic(id: string): Promise<Job | null> {
  const row = await apiPost('get-job', { id });
  if (!row) return null;
  if (row.currentTaxRate) setTaxRate(Number(row.currentTaxRate));
  return mapJob(row);
}

// ADMIN mutations (behind Cloudflare Access)
async function patchJob(id: string, fields: Record<string, any>) {
  await adminPost('patch-booking', { id, fields });
}

// ── BREVO: SEND ESTIMATE EMAIL ────────────────────────────────────────────────

async function sendEstimateEmail(job: Job, shopAvg: number = 0) {
  try { await adminPost('send-estimate', { job, shopAvg }); }
  catch (e) { console.error('Estimate email failed:', e); }
}


// ── BREVO: SEND INVOICE EMAIL ─────────────────────────────────────────────────
// Single chokepoint for every "send invoice" call site (Mark Invoiced, Mark
// Paid, Charge Card on File, Record Payment-fully-paid) — also bumps and
// persists invoice_sent_count / invoice_last_sent_at so the Payment tab can
// show whether (and how many times) the customer was actually notified.
async function sendInvoiceEmail(job: Job): Promise<{ count: number; lastSentAt: string } | null> {
  const count = (job.invoiceSentCount || 0) + 1;
  const lastSentAt = new Date().toISOString();
  try {
    await adminPost('send-invoice', { job });
    await patchJob(job.id, { invoice_sent_count: count, invoice_last_sent_at: lastSentAt });
    return { count, lastSentAt };
  } catch (e) {
    console.error('Invoice email failed:', e);
    return null;
  }
}

// ── BREVO: SEND RECEIPT EMAIL ─────────────────────────────────────────────────

async function sendReceiptEmail(job: Job, adjustmentReason?: string, adjustmentAmount?: number) {
  try { await adminPost('send-receipt', { job, adjustmentReason, adjustmentAmount }); }
  catch (e) { console.error('Receipt email failed:', e); }
}

// ── BREVO: SEND DECLINE EMAIL ─────────────────────────────────────────────────

async function sendDeclineEmail(job: Job, declineReason?: string) {
  try { await adminPost('send-decline', { job, reason: declineReason }); }
  catch (e) { console.error('Decline email failed:', e); }
}

// ── CYA TERMS ────────────────────────────────────────────────────────────────

const CYA_TERMS_CORE = [
  'Price is as quoted. Any additional work discovered during service requires your explicit approval before proceeding. We will contact you before performing any work beyond the scope of this estimate.',
  'Payment is due in full at time of completion. Unpaid balances may be subject to a storage or holding fee. Returned checks or disputed charges are subject to a $35 processing fee.',
  'If a card on file was provided at the time of booking, customer authorizes GID Garage to charge the card on file for the full agreed amount upon job completion. Customer will be informed of the final amount before the card is charged. For parts-sourced jobs, a deposit may be charged prior to service to cover parts costs, as discussed and agreed upon during confirmation.',
  'By signing this estimate, you authorize GID Garage to perform the described work, confirm you are 18 years of age or older, and agree to all terms listed herein.',
];

const CYA_TERMS_EXTENDED = [
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
];

// Combined for admin display
const CYA_TERMS = [...CYA_TERMS_CORE, ...CYA_TERMS_EXTENDED];

// ── SERVICE NAME RESOLUTION ───────────────────────────────────────────────────

const SERVICE_NAMES: Record<string, string> = {
  oil:        'Oil Change',
  brakes:     'Brakes',
  diag:       'Diagnostics',
  suspension: 'Suspension',
  audio:      'Car Audio',
  full:       'Full Service',
  other:      'General Inquiry',
};

const BRAKE_LABELS: Record<string, string> = {
  pads:        'Brake Pads Only',
  pads_rotors: 'Brake Pads + Rotors',
  full:        'Full Brake Service (Pads + Rotors + Fluid Flush)',
};

const AUDIO_LABELS: Record<string, string> = {
  head_unit_replacement: 'Head Unit Replacement',
  speaker_replacement:   'Speaker Replacement (pair)',
  head_unit_install:     'Head Unit Install (Customer-Supplied)',
  '4ch_amp_install':     '4-Channel Amp Install',
  mono_amp_install:      'Monoblock + Subwoofer Install',
  full_system:           'Full Sound System',
};

function resolveServiceName(service: string, notes: string): string {
  const base = SERVICE_NAMES[service] ?? service;
  if (service === 'brakes') {
    const match = notes.match(/Brake service: ([^|]+)/);
    if (match) return `Brakes — ${BRAKE_LABELS[match[1].trim()] ?? match[1].trim()}`;
  }
  if (service === 'suspension') {
    const match = notes.match(/Suspension: ([^|]+)/);
    if (match) return `Suspension — ${match[1].trim()}`;
  }
  if (service === 'audio') {
    const match = notes.match(/Audio package: ([^|]+)/);
    if (match) return `Car Audio — ${AUDIO_LABELS[match[1].trim()] ?? match[1].trim()}`;
  }
  return base;
}

// ── JOB STATUS CONFIG ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; bg: string }> = {
  BOOKED:         { label: 'Booked',          color: 'text-blue-400',   bg: 'bg-blue-900/30' },
  ESTIMATE_SENT:  { label: 'Estimate Sent',   color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  SIGNED:         { label: 'Signed',          color: 'text-purple-400', bg: 'bg-purple-900/30' },
  IN_PROGRESS:    { label: 'In Progress',     color: 'text-orange-400', bg: 'bg-orange-900/30' },
  COMPLETED:      { label: 'Completed',       color: 'text-green-400',  bg: 'bg-green-900/30' },
  INVOICED:       { label: 'Invoiced',        color: 'text-teal-400',   bg: 'bg-teal-900/30' },
  PAID:           { label: 'Paid',            color: 'text-emerald-400',bg: 'bg-emerald-900/30' },
  CANCELLED:      { label: 'Cancelled',       color: 'text-gray-500',   bg: 'bg-gray-800/30' },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.BOOKED;
  return (
    <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── PRICING CONSTANTS ─────────────────────────────────────────────────────────

const LABOR_RATE = 75;
const MOBILE_FEE = 25;
const PARTS_MARKUP = 0.20;

// ── VEHICLE TIERS ─────────────────────────────────────────────────────────────
// Tier 1: Small car     — Civic, Corolla, Sentra, Fit, Elantra, Focus
// Tier 2: Mid / CUV     — Camry, RAV4, CR-V, Accord, Altima, Rogue, Escape
// Tier 3: Large SUV / half-ton truck — F-150, Silverado, Tahoe, 4Runner, Tundra, Expedition
// Tier 4: HD truck      — F-250/350, Ram 2500/3500, Silverado/Sierra 2500/3500

type VehicleTier = 1 | 2 | 3 | 4;

// Small car models (subset of mid makes that are small)
const SMALL_MODELS = ['civic','corolla','sentra','fit','elantra','accent','rio','yaris','versa','mirage','spark','sonic','aveo','focus','fiesta','impreza','juke','mini','fiat','smart','200','dart'];

// Large/HD engine displacement thresholds
const HD_ENGINES   = ['6.6l','6.7l','7.3l','6.6 duramax','6.7 powerstroke','6.7 cummins','diesel_6.6','diesel_6.7_powerstroke','diesel_6.7_cummins','diesel_7.3'];
const LARGE_ENGINES = ['5.3l','5.0l v8','5.7l','6.2l','6.4l','4.6l v8','5.4l','5.6l','4.7l'];

function classifyVehicle(vehicleStr: string): VehicleTier {
  if (!vehicleStr) return 2;
  const v = vehicleStr.toLowerCase();

  // HD truck — engine or known HD models
  if (HD_ENGINES.some(e => v.includes(e))) return 4;
  if (/\b(f[- ]?250|f[- ]?350|f[- ]?450|ram\s*25|ram\s*35|silverado\s*25|silverado\s*35|sierra\s*25|sierra\s*35|2500|3500)\b/.test(v)) return 4;

  // Large SUV / half-ton
  if (LARGE_ENGINES.some(e => v.includes(e))) return 3;
  if (/\b(f[- ]?150|silverado|sierra|tahoe|suburban|yukon|expedition|navigator|sequoia|tundra|4runner|4-runner|armada|titan|durango|commander|wagoneer|grand wagoneer|ram\s*15|ram 1500|bronco)\b/.test(v)) return 3;
  if (/\b(v8|8cyl)\b/.test(v)) return 3;

  // Small car — check model name
  if (SMALL_MODELS.some(m => v.includes(m))) return 1;

  // Default mid
  return 2;
}

// Flagstaff shop averages by tier — per corner/axle for brakes/suspension
const SHOP_AVERAGES_TIERED: Record<string, [number, number, number, number]> = {
  //                                           T1    T2    T3    T4
  oil:                     [79,   89,   99,   110],
  diag:                    [100,  110,  120,  130],
  full:                    [0,    0,    0,    0  ],
  brakes_pads:             [160,  200,  240,  300],   // per axle
  brakes_pads_rotors:      [320,  400,  480,  600],   // per axle
  brakes_full:             [380,  475,  560,  700],   // per axle
  suspension_struts_front: [420,  550,  650,  750],   // pair
  suspension_struts_rear:  [320,  400,  480,  560],   // pair
  suspension_control_arms: [280,  375,  450,  550],   // each
  suspension_tie_rods:     [220,  300,  360,  440],   // each
  suspension_cv_axles:     [280,  375,  450,  540],   // each
  audio_head_unit:         [250,  250,  250,  250],
  audio_speakers:          [300,  300,  300,  300],
  audio_head_unit_supplied:[150,  150,  150,  150],
  audio_4ch_amp:           [350,  350,  350,  350],
  audio_mono_amp:          [400,  400,  400,  400],
  audio_full_system:       [1400, 1400, 1400, 1400],
};

function getShopAvg(serviceKey: string, vehicleStr: string): number {
  const tier = classifyVehicle(vehicleStr);
  const row = SHOP_AVERAGES_TIERED[serviceKey];
  if (!row) return 0;
  return row[tier - 1];
}

const LABOR_HOURS: Record<string, number> = {
  oil:                    0.5,
  diag:                   1.0,
  full:                   0.5,
  brakes_pads:            1.0,   // per axle
  brakes_pads_rotors:     1.5,   // per axle
  brakes_full:            2.0,   // per axle
  suspension_struts_front: 2.5,  // pair
  suspension_struts_rear:  1.5,  // pair
  suspension_control_arms: 1.5,  // each
  suspension_tie_rods:     1.0,  // each
  suspension_cv_axles:     1.5,  // each
  audio_head_unit:         1.0,
  audio_speakers:          1.5,
  audio_head_unit_supplied: 1.0,
  audio_4ch_amp:           2.0,
  audio_mono_amp:          2.0,
  audio_full_system:       6.0,
};

// ── AXLE SCHEMATIC ────────────────────────────────────────────────────────────

export interface AxleConfig {
  lf: { enabled: boolean; parts: string; hours: number };
  rf: { enabled: boolean; parts: string; hours: number };
  lr: { enabled: boolean; parts: string; hours: number };
  rr: { enabled: boolean; parts: string; hours: number };
  shopAvg: number;
}

function AxleSchematic({ config, onChange, defaultHours }: {
  config: AxleConfig;
  onChange: (c: AxleConfig) => void;
  defaultHours: number;
}) {
  const corners = [
    { key: 'lf' as const, label: 'LF', color: 'red' },
    { key: 'rf' as const, label: 'RF', color: 'red' },
    { key: 'lr' as const, label: 'LR', color: 'blue' },
    { key: 'rr' as const, label: 'RR', color: 'blue' },
  ];

  function toggle(key: 'lf' | 'rf' | 'lr' | 'rr') {
    const cur = config[key];
    onChange({
      ...config,
      [key]: { ...cur, enabled: !cur.enabled, hours: cur.hours || defaultHours },
    });
  }

  function update(key: 'lf' | 'rf' | 'lr' | 'rr', field: 'parts' | 'hours', val: string) {
    onChange({
      ...config,
      [key]: { ...config[key], [field]: field === 'hours' ? parseFloat(val) || 0 : val },
    });
  }

  return (
    <div className="bg-gray-900 border border-gray-700 p-4 space-y-3">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Corner Selection — tap to enable</p>

      {/* 2x2 grid matching car layout */}
      <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
        {corners.map(({ key, label, color }) => {
          const c = config[key];
          const isRed = color === 'red';
          const price = (parseFloat(c.parts) || 0) * (1 + PARTS_MARKUP) + c.hours * LABOR_RATE;
          return (
            <div key={key} className={`border-2 transition-all ${c.enabled
              ? isRed ? 'border-red-500 bg-red-900/20' : 'border-blue-500 bg-blue-900/20'
              : 'border-gray-700 bg-gray-800/50'}`}>
              {/* Corner header — tap to toggle */}
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-3 py-2"
              >
                <span className={`text-sm font-black ${c.enabled ? isRed ? 'text-red-400' : 'text-blue-400' : 'text-gray-600'}`}>
                  {label}
                </span>
                {c.enabled && price > 0 && (
                  <span className="text-white text-xs font-mono font-bold">${price.toFixed(2)}</span>
                )}
                {!c.enabled && <span className="text-gray-700 text-xs">off</span>}
              </button>

              {/* Inputs — only shown when enabled */}
              {c.enabled && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-gray-700 pt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 text-[10px] w-10 flex-shrink-0">Parts $</span>
                    <input
                      type="number"
                      value={c.parts}
                      onChange={e => update(key, 'parts', e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 text-[10px] w-10 flex-shrink-0">Hrs</span>
                    <input
                      type="number"
                      step="0.5"
                      value={c.hours}
                      onChange={e => update(key, 'hours', e.target.value)}
                      className="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                    />
                  </div>
                  {c.parts && (
                    <p className="text-gray-600 text-[10px]">
                      Parts w/ markup: ${((parseFloat(c.parts) || 0) * (1 + PARTS_MARKUP)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Vehicle body center */}
      <div className="flex justify-center">
        <div className="text-gray-700 text-xs font-bold uppercase tracking-widest">
          {[config.lf, config.rf, config.lr, config.rr].filter(c => c.enabled).length} corner(s) selected
        </div>
      </div>
    </div>
  );
}

// ── QUOTE CALCULATOR ──────────────────────────────────────────────────────────

function QuoteCalculator({ job, onApply }: { job: Job; onApply: (items: LineItem[], total: number, shopTotal: number) => void }) {
  const [serviceType, setServiceType] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [extraQuarts, setExtraQuarts] = useState(0);
  const [shopTotalOverride, setShopTotalOverride] = useState<string>('');
  const [showShopComparison, setShowShopComparison] = useState(true);
  const [axle, setAxle] = useState<AxleConfig>({
    lf: { enabled: false, parts: '', hours: 0 },
    rf: { enabled: false, parts: '', hours: 0 },
    lr: { enabled: false, parts: '', hours: 0 },
    rr: { enabled: false, parts: '', hours: 0 },
    shopAvg: 0,
  });

  const isAxleService = serviceType.startsWith('brakes_') || serviceType.startsWith('suspension_');
  const isOil = serviceType === 'oil';
  const isDiag = serviceType === 'diag';
  const isFull = serviceType === 'full';
  const isFixed = isOil || isDiag || isFull;

  function handleServiceChange(svc: string) {
    setServiceType(svc);
    const avg = getShopAvg(svc, job.vehicle);
    setShopTotalOverride(avg > 0 ? avg.toFixed(2) : '');
    if (LABOR_HOURS[svc]) setLaborHours(LABOR_HOURS[svc].toString());
    const defaultHrs = LABOR_HOURS[svc] || 1.0;
    // Reset axle with new default hours and shop avg
    setAxle({
      lf: { enabled: false, parts: '', hours: defaultHrs },
      rf: { enabled: false, parts: '', hours: defaultHrs },
      lr: { enabled: false, parts: '', hours: defaultHrs },
      rr: { enabled: false, parts: '', hours: defaultHrs },
      shopAvg: avg,
    });
  }

  function buildLineItems(): { items: LineItem[]; total: number; shopTotal: number } {
    const items: LineItem[] = [];
    let shopTotal = getShopAvg(serviceType, job.vehicle);

    items.push({ id: 'mobile', label: 'Mobile Service Fee', amount: MOBILE_FEE, type: 'mobile' });

    if (isOil) {
      items.push({ id: 'oil_labor', label: `Oil Change — Full Synthetic (up to 5qt)`, amount: 79.99, type: 'fixed' });
      if (extraQuarts > 0) {
        items.push({ id: 'oil_extra', label: `Extra Oil (${extraQuarts}qt @ $10.99/qt)`, amount: extraQuarts * 10.99, type: 'other' });
      }
      shopTotal = getShopAvg('oil', job.vehicle) + (extraQuarts * 15);
    } else if (isDiag) {
      items.push({ id: 'diag_labor', label: 'Diagnostics — OBD2 Scan & Repair Recommendation', amount: 75, type: 'fixed' });
      shopTotal = getShopAvg('diag', job.vehicle);
    } else if (isFull) {
      items.push({ id: 'full_labor', label: 'Multi-Point Inspection (Complimentary)', amount: 0, type: 'fixed' });
      shopTotal = 0;
    } else if (isAxleService) {
      const corners = [
        { key: 'lf' as const, label: 'LF' },
        { key: 'rf' as const, label: 'RF' },
        { key: 'lr' as const, label: 'LR' },
        { key: 'rr' as const, label: 'RR' },
      ];
      const svcLabel = serviceType.startsWith('brakes_') ? 'Brakes'
        : serviceType.includes('strut') ? 'Strut'
        : serviceType.includes('control') ? 'Control Arm'
        : serviceType.includes('tie') ? 'Tie Rod'
        : serviceType.includes('cv') ? 'CV Axle'
        : 'Suspension';

      let enabledCount = 0;
      corners.forEach(({ key, label }) => {
        const c = axle[key];
        if (!c.enabled) return;
        enabledCount++;
        const parts = (parseFloat(c.parts) || 0) * (1 + PARTS_MARKUP);
        const labor = c.hours * LABOR_RATE;
        if (parts > 0) items.push({ id: `${key}_parts`, label: `${label} ${svcLabel} — Parts`, amount: parts, type: 'parts' });
        if (labor > 0) items.push({ id: `${key}_labor`, label: `${label} ${svcLabel} — Labor (${c.hours}hr @ $${LABOR_RATE}/hr)`, amount: labor, type: 'labor' });
      });

      // Shop avg scales per corner enabled
      shopTotal = axle.shopAvg * enabledCount;
    } else if (serviceType) {
      const parts = (parseFloat(partsCost) || 0) * (1 + PARTS_MARKUP);
      const hrs = parseFloat(laborHours) || LABOR_HOURS[serviceType] || 1;
      const labor = hrs * LABOR_RATE;
      if (parts > 0) items.push({ id: 'parts', label: `Parts — ${serviceType.replace(/_/g, ' ')}`, amount: parts, type: 'parts' });
      items.push({ id: 'labor', label: `Labor — ${hrs}hr @ $${LABOR_RATE}/hr`, amount: labor, type: 'labor' });
    }

    const total = items.reduce((s, i) => s + i.amount, 0);
    return { items, total, shopTotal };
  }

  const { items, total, shopTotal } = buildLineItems();
  const canApply = items.length > 1 && total > 0;

  const SERVICE_OPTIONS = [
    { group: 'Fixed Price', options: [
      { value: 'oil', label: 'Oil Change — $79.99' },
      { value: 'diag', label: 'Diagnostics — $75 flat' },
      { value: 'full', label: 'Full Service — Free' },
    ]},
    { group: 'Brakes', options: [
      { value: 'brakes_pads', label: 'Brake Pads Only' },
      { value: 'brakes_pads_rotors', label: 'Brake Pads + Rotors' },
      { value: 'brakes_full', label: 'Full Brake Service (Pads + Rotors + Fluid)' },
    ]},
    { group: 'Suspension', options: [
      { value: 'suspension_struts_front', label: 'Front Struts (pair)' },
      { value: 'suspension_struts_rear', label: 'Rear Shocks (pair)' },
      { value: 'suspension_control_arms', label: 'Control Arms' },
      { value: 'suspension_tie_rods', label: 'Tie Rods' },
      { value: 'suspension_cv_axles', label: 'CV Axles' },
    ]},
    { group: 'Car Audio', options: [
      { value: 'audio_head_unit', label: 'Head Unit Replacement' },
      { value: 'audio_speakers', label: 'Speaker Replacement (pair)' },
      { value: 'audio_head_unit_supplied', label: 'Head Unit Install (Customer Parts)' },
      { value: 'audio_4ch_amp', label: '4-Channel Amp Install' },
      { value: 'audio_mono_amp', label: 'Monoblock + Sub Install' },
      { value: 'audio_full_system', label: 'Full Sound System' },
    ]},
  ];

  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Quote Calculator</p>

      {/* Service selector */}
      <div>
        <label className="text-gray-600 text-xs font-bold uppercase tracking-wider block mb-1">Service Type</label>
        <select
          value={serviceType}
          onChange={e => handleServiceChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm w-full focus:border-red-600 outline-none"
        >
          <option value="">— Select service —</option>
          {SERVICE_OPTIONS.map(group => (
            <optgroup key={group.group} label={group.group}>
              {group.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Oil extra quarts */}
      {isOil && (
        <div>
          <label className="text-gray-600 text-xs font-bold uppercase tracking-wider block mb-1">Extra Quarts (over 5)</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setExtraQuarts(Math.max(0, extraQuarts - 1))} className="w-8 h-8 bg-gray-800 border border-gray-700 text-white font-bold hover:border-red-600 transition-colors">−</button>
            <span className="text-white font-mono w-4 text-center">{extraQuarts}</span>
            <button onClick={() => setExtraQuarts(extraQuarts + 1)} className="w-8 h-8 bg-gray-800 border border-gray-700 text-white font-bold hover:border-red-600 transition-colors">+</button>
            {extraQuarts > 0 && <span className="text-gray-500 text-xs">+${(extraQuarts * 10.99).toFixed(2)}</span>}
          </div>
        </div>
      )}

      {/* Axle schematic for brakes/struts */}
      {isAxleService && (
        <AxleSchematic config={axle} onChange={setAxle} defaultHours={LABOR_HOURS[serviceType] || 1} />
      )}

      {/* Parts + labor for non-fixed, non-axle services */}
      {!isFixed && !isAxleService && serviceType && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-600 text-xs font-bold uppercase tracking-wider block mb-1">Your Parts Cost</label>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-sm">$</span>
              <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
                placeholder="0.00" className="bg-gray-800 border border-gray-700 text-white px-2 py-2 text-sm font-mono w-full focus:border-red-600 outline-none" />
            </div>
            {partsCost && <p className="text-gray-600 text-[10px] mt-0.5">Customer sees: ${((parseFloat(partsCost) || 0) * (1 + PARTS_MARKUP)).toFixed(2)}</p>}
          </div>
          <div>
            <label className="text-gray-600 text-xs font-bold uppercase tracking-wider block mb-1">Labor Hours</label>
            <input type="number" step="0.5" value={laborHours} onChange={e => setLaborHours(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white px-2 py-2 text-sm font-mono w-full focus:border-red-600 outline-none" />
          </div>
        </div>
      )}

      {/* Line items preview */}
      {items.length > 1 && (
        <div className="bg-gray-900 border border-gray-700 divide-y divide-gray-800">
          <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest px-3 py-2">Itemized Quote</p>
          {items.map(item => (
            <div key={item.id} className="flex justify-between px-3 py-2">
              <span className="text-gray-400 text-xs">{item.label}</span>
              <span className={`text-xs font-mono font-bold ${item.amount === 0 ? 'text-gray-600' : 'text-white'}`}>
                {item.amount === 0 ? 'FREE' : (item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`)}
              </span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2.5 bg-gray-800/50">
            <span className="text-white text-xs font-bold uppercase tracking-wider">Total</span>
            <span className="text-white text-sm font-black">${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Savings callout */}
      {items.length > 1 && serviceType && (() => {
        const effectiveShopTotal = shopTotalOverride !== '' ? (parseFloat(shopTotalOverride) || 0) : shopTotal;
        const effectiveSavings = effectiveShopTotal > 0 ? effectiveShopTotal - total : 0;
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-gray-600 text-xs font-bold uppercase tracking-widest whitespace-nowrap">Shop charges ~</label>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={shopTotalOverride}
                  onChange={e => setShopTotalOverride(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-sm font-mono w-full focus:border-red-600 outline-none"
                />
              </div>
              {shopTotalOverride !== '' && (
                <button onClick={() => setShopTotalOverride('')} className="text-gray-600 hover:text-gray-400 text-xs whitespace-nowrap">reset</button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0 ml-1">
                <input type="checkbox" checked={showShopComparison} onChange={e => setShowShopComparison(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5" />
                <span className="text-gray-600 text-[10px] uppercase tracking-wider whitespace-nowrap">Show in email</span>
              </label>
            </div>
            {effectiveSavings > 0 && showShopComparison && (
              <div className="bg-emerald-900/20 border border-emerald-700 p-4 flex items-center justify-between">
                <div>
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">vs. Flagstaff Shops</p>
                  <p className="text-gray-400 text-xs mt-0.5">They'd charge ~${effectiveShopTotal.toFixed(2)}</p>
                  <p className="text-emerald-500 text-xs mt-0.5 font-semibold">and we come to you!</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-400 text-2xl font-black">-${effectiveSavings.toFixed(2)}</p>
                  <p className="text-emerald-600 text-[10px] font-bold uppercase">Customer Saves</p>
                </div>
              </div>
            )}
            {effectiveSavings > 0 && !showShopComparison && (
              <p className="text-gray-700 text-xs italic">Savings comparison hidden from customer email</p>
            )}
          </div>
        );
      })()}

      {canApply && (
        <button
          onClick={() => {
            const effectiveShopTotal = shopTotalOverride !== '' ? (parseFloat(shopTotalOverride) || 0) : shopTotal;
            onApply(items, total, showShopComparison ? effectiveShopTotal : 0);
          }}
          className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
        >
          Apply to Estimate →
        </button>
      )}
    </div>
  );
}

// ── PHOTO PANEL ───────────────────────────────────────────────────────────────

function AdminPhotoPanel({ entityId, onSave, initialPhotos, onPhotosChange }: {
  entityId: string;
  onSave: (id: string, photos: { key: string; url: string; name: string; note: string }[]) => Promise<void>;
  initialPhotos: { key: string; url: string; name: string; note: string }[];
  onPhotosChange?: (photos: { key: string; url: string; name: string; note: string }[]) => void;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [hasNoteChanges, setHasNoteChanges] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevEntityId = useRef(entityId);

  // The job list is now slim (no photos, for load speed) — a job panel can
  // mount with an empty initialPhotos before the full record arrives a beat
  // later. useState only reads its initial value once, so without this the
  // panel would stay stuck showing no photos even after the real data lands.
  // Re-sync on a job switch, or when we mounted empty and data has now caught up.
  useEffect(() => {
    if (entityId !== prevEntityId.current) {
      prevEntityId.current = entityId;
      setPhotos(initialPhotos);
    } else if (photos.length === 0 && initialPhotos.length > 0) {
      setPhotos(initialPhotos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, initialPhotos]);

  async function savePhotosToDb(updated: typeof photos) {
    try {
      await onSave(entityId, updated);
      onPhotosChange?.(updated);
    } catch {}
  }

  // Resize + re-encode in the browser before upload, same as the customer
  // photo panel. Phone camera photos are often 3-8MB uploaded full-res over
  // cell signal in a driveway, which is why admin uploads felt much slower
  // than the customer-facing panel. Caps the longest edge at 2000px (higher
  // than the customer panel's 1600px, since VIN/plate photos need to stay
  // legible) and re-encodes as JPEG q0.85. Skips HEIC/non-standard types the
  // canvas can't decode — those still upload full-size.
  function compressPhoto(file: File, maxDim = 2000, quality = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
            else { width = Math.round((width * maxDim) / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Image failed to load'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
      const isImage = /^image\//.test(file.type) && !isHeic;
      let uploadBody: Blob = file;
      let uploadName = file.name;
      if (isImage) {
        try {
          uploadBody = await compressPhoto(file);
          uploadName = file.name.replace(/\.\w+$/, '') + '.jpg';
        } catch {
          // Fall back to the original file if compression fails for any reason.
        }
      }
      const formData = new FormData();
      formData.append('file', uploadBody, uploadName);
      formData.append('bookingId', entityId);
      const res = await fetch('/admin-upload-photo', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as any;
      const newPhoto = { key: data.key, url: data.url, name: uploadName, note: '' };
      const updated = [...photos, newPhoto];
      setPhotos(updated);
      await savePhotosToDb(updated);
    } catch (e: any) {
      setUploadError(e.message ?? 'Upload failed');
    }
    setUploading(false);
  }

  function updateNote(key: string, note: string) {
    setPhotos(prev => prev.map(p => p.key === key ? { ...p, note } : p));
    setHasNoteChanges(true);
    setNotesSaved(false);
  }

  async function saveAllNotes() {
    setSavingNotes(true);
    await savePhotosToDb(photos);
    setSavingNotes(false);
    setNotesSaved(true);
    setHasNoteChanges(false);
  }

  async function deletePhoto(key: string) {
    const updated = photos.filter(p => p.key !== key);
    setPhotos(updated);
    await savePhotosToDb(updated);
  }

  return (
    <div className="border-t border-gray-800 pt-4 mt-2">
      <p className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-1">🔒 Admin Photos</p>
      <p className="text-gray-600 text-[10px] mb-3">Internal records only — VIN plate, license plate, damage, documentation. Not visible to customer.</p>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={async e => {
          const files = Array.from(e.target.files || []);
          for (const f of files) await handleUpload(f);
          e.target.value = '';
        }}
      />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className={`w-full border border-dashed border-gray-700 text-gray-500 hover:border-yellow-700 hover:text-yellow-600 text-xs font-bold uppercase tracking-wider py-3 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {uploading ? '⏳ Uploading…' : '+ Upload Photos'}
      </button>
      {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}

      {photos.length > 0 && (
        <div className="mt-3 space-y-3">
          {photos.map(p => (
            <div key={p.key} className="bg-gray-900 border border-gray-800">
              <div className="relative">
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  <img src={p.url} alt={p.name} className="w-full max-h-48 object-cover" />
                </a>
                <button onClick={() => deletePhoto(p.key)}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-red-500 hover:bg-red-900/80 flex items-center justify-center text-sm transition-colors">×</button>
                <span className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/60 px-1.5 py-0.5">{p.name}</span>
              </div>
              <div className="p-2">
                <input
                  type="text"
                  value={p.note}
                  onChange={e => updateNote(p.key, e.target.value)}
                  placeholder="Add a note…"
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 outline-none focus:border-yellow-700 placeholder-gray-600 transition-colors"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <button
          onClick={saveAllNotes}
          disabled={savingNotes || !hasNoteChanges}
          className={`mt-3 w-full border text-xs font-bold uppercase tracking-wider py-2.5 transition-colors ${
            notesSaved ? 'border-emerald-800 text-emerald-600' :
            hasNoteChanges ? 'border-yellow-700 text-yellow-600 hover:bg-yellow-900/20' :
            'border-gray-800 text-gray-700 cursor-default'
          }`}
        >
          {savingNotes ? 'Saving…' : notesSaved ? '✓ Notes Saved' : hasNoteChanges ? 'Save Notes' : '✓ Saved'}
        </button>
      )}
    </div>
  );
}

function PartsCostPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [costInput, setCostInput] = useState(job.partsCost != null ? String(job.partsCost) : '');
  const [savingCost, setSavingCost] = useState(false);
  const [costSaved, setCostSaved] = useState(false);
  const [receipts, setReceipts] = useState(job.partsReceipts || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevJobId = useRef(job.id);

  // Re-sync local state when switching to a different job's panel.
  useEffect(() => {
    if (job.id !== prevJobId.current) {
      prevJobId.current = job.id;
      setCostInput(job.partsCost != null ? String(job.partsCost) : '');
      setReceipts(job.partsReceipts || []);
      setCostSaved(false);
    } else if (receipts.length === 0 && (job.partsReceipts || []).length > 0) {
      setReceipts(job.partsReceipts || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.partsReceipts]);

  async function saveCost() {
    const amt = costInput.trim() === '' ? null : Math.round(parseFloat(costInput) * 100) / 100;
    if (costInput.trim() !== '' && (amt === null || isNaN(amt) || amt < 0)) return;
    setSavingCost(true);
    try {
      await patchJob(job.id, { parts_cost: amt });
      onUpdate({ ...job, partsCost: amt });
      setCostSaved(true);
    } finally {
      setSavingCost(false);
    }
  }

  async function saveReceiptsToDb(updated: PartsReceipt[]) {
    await patchJob(job.id, { parts_receipts: JSON.stringify(updated) });
    onUpdate({ ...job, partsReceipts: updated });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bookingId', job.id);
      const res = await fetch('/admin-upload-photo', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as any;
      const newReceipt: PartsReceipt = {
        key: data.key,
        url: data.url,
        name: file.name,
        type: file.type || '',
        uploadedAt: new Date().toISOString(),
      };
      const updated = [...receipts, newReceipt];
      setReceipts(updated);
      await saveReceiptsToDb(updated);
    } catch (e: any) {
      setUploadError(e.message ?? 'Upload failed');
    }
    setUploading(false);
  }

  async function deleteReceipt(key: string) {
    const updated = receipts.filter(r => r.key !== key);
    setReceipts(updated);
    await saveReceiptsToDb(updated);
  }

  function isViewableImage(r: PartsReceipt) {
    const isImg = /^image\//.test(r.type) || /\.(jpe?g|png|gif|webp)$/i.test(r.name);
    const isHeic = /heic|heif/i.test(r.type) || /\.hei[cf]$/i.test(r.name);
    return isImg && !isHeic;
  }
  function fileIcon(r: PartsReceipt) {
    if (/\.pdf$/i.test(r.name) || /pdf/i.test(r.type)) return '📄';
    if (/heic|heif/i.test(r.type) || /\.hei[cf]$/i.test(r.name)) return '🖼️';
    return '📎';
  }

  const totalPaid = job.amountPaid || (job.jobStatus === 'PAID' ? (job.invoiceAmount || 0) + (job.taxAmount || 0) : 0);
  const partsCostVal = job.partsCost || 0;
  const netProfit = Math.round((totalPaid - partsCostVal) * 100) / 100;

  return (
    <div className="border-t border-gray-800 pt-4 mt-2">
      <p className="text-yellow-600 text-xs font-bold uppercase tracking-widest mb-1">🔒 Parts Cost & Profit</p>
      <p className="text-gray-600 text-[10px] mb-3">Admin only — never shown to the customer.</p>

      <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Amount Paid for Parts</label>
      <div className="flex gap-2 mb-1">
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 px-2.5 flex-1">
          <span className="text-gray-500 text-xs font-bold">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={costInput}
            onChange={e => { setCostInput(e.target.value); setCostSaved(false); }}
            placeholder="0.00"
            className="bg-transparent text-white py-2 text-sm font-mono w-full outline-none placeholder-gray-700"
          />
        </div>
        <button
          onClick={saveCost}
          disabled={savingCost}
          className={`px-4 text-xs font-bold uppercase tracking-wider border transition-colors ${
            costSaved ? 'border-emerald-800 text-emerald-600' : 'border-yellow-700 text-yellow-600 hover:bg-yellow-900/20'
          }`}
        >
          {savingCost ? 'Saving…' : costSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Receipt upload */}
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif,application/pdf,.pdf" multiple className="hidden"
        onChange={async e => {
          const files = Array.from(e.target.files || []);
          for (const f of files) await handleUpload(f);
          e.target.value = '';
        }}
      />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className={`w-full mt-3 border border-dashed border-gray-700 text-gray-500 hover:border-yellow-700 hover:text-yellow-600 text-xs font-bold uppercase tracking-wider py-3 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {uploading ? '⏳ Uploading…' : '+ Upload Parts Receipt (HEIC, JPG, PDF)'}
      </button>
      {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}

      {receipts.length > 0 && (
        <div className="mt-3 space-y-2">
          {receipts.map(r => (
            <div key={r.key} className="flex items-center gap-2 bg-gray-900 border border-gray-800 p-2">
              {isViewableImage(r) ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                  <img src={r.url} alt={r.name} className="w-10 h-10 object-cover" />
                </a>
              ) : (
                <span className="w-10 h-10 flex items-center justify-center text-lg flex-shrink-0 bg-gray-800">{fileIcon(r)}</span>
              )}
              <span className="flex-1 min-w-0 text-gray-400 text-xs truncate">{r.name}</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-yellow-500 flex-shrink-0 transition-colors">View</a>
              <button onClick={() => deleteReceipt(r.key)}
                className="text-gray-600 hover:text-red-500 transition-colors flex-shrink-0" title="Delete">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Net profit calculator */}
      <div className="mt-4 border border-gray-800 bg-gray-900/40 p-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Total Paid (by customer)</span>
          <span className="text-emerald-400 font-mono">${totalPaid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Parts Cost</span>
          <span className="text-red-400 font-mono">-${partsCostVal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm pt-1.5 border-t border-gray-800">
          <span className="text-gray-300 font-bold uppercase tracking-wider text-xs">Net Profit</span>
          <span className={`font-mono font-black ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>${netProfit.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function PhotoPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [photos, setPhotos] = useState<JobPhoto[]>(job.jobPhotos || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const migratingRef = useRef(false);
  const prevJobId = useRef(job.id);

  // Same fix as AdminPhotoPanel: the job list is slim (no photos) for load
  // speed, so this panel can mount before the full record (with real photos)
  // arrives. Catch up once it does, without clobbering in-progress local edits.
  useEffect(() => {
    if (job.id !== prevJobId.current) {
      prevJobId.current = job.id;
      setPhotos(job.jobPhotos || []);
      migratingRef.current = false;
    } else if (photos.length === 0 && (job.jobPhotos || []).length > 0) {
      setPhotos(job.jobPhotos || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.jobPhotos]);

  async function persist(updated: JobPhoto[]) {
    await patchJob(job.id, { job_photos: JSON.stringify(updated) });
    onUpdate({ ...job, jobPhotos: updated });
  }

  async function uploadBlob(blob: Blob, filename: string): Promise<{ key: string; url: string }> {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('bookingId', job.id);
    const res = await fetch('/customer-upload-photo', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // One-time cleanup for older jobs: photos saved before the R2 fix have the
  // full-resolution image base64-encoded directly into this DB row. Resending
  // that bloat on every save (e.g. clicking "Save Notes") is what caused saves
  // to hang/502 — even after this fix, *existing* jobs still had that old data
  // sitting in job_photos. Migrate any legacy base64 photo to R2 in the
  // background, replacing the inline base64 with a small {key,url} reference
  // so future saves stay small. Runs whenever `photos` changes (not just on
  // mount) since this panel can mount empty before the full job record — the
  // one with the actual legacy photos — arrives a beat later.
  useEffect(() => {
    const legacy = photos.filter(p => p.dataUrl && !p.url);
    if (!legacy.length || migratingRef.current) return;
    migratingRef.current = true;

    (async () => {
      setMigrating(true);
      let current = photos;
      for (const photo of legacy) {
        try {
          const blob = await (await fetch(photo.dataUrl as string)).blob();
          const { key, url } = await uploadBlob(blob, `${photo.id}.jpg`);
          current = current.map(p => p.id === photo.id ? { id: p.id, key, url, note: p.note, takenAt: p.takenAt } : p);
          setPhotos(current);
          await persist(current);
        } catch {
          // Leave this one as legacy base64 if migration fails (e.g. offline) —
          // it'll just be retried next time the panel loads.
        }
      }
      setMigrating(false);
      migratingRef.current = false;
    })();
  }, [photos]);

  // Resize + re-encode in the browser before upload. Phone camera photos are
  // often 3-8MB each — uploading them full-res (and previously, as base64 text
  // crammed into one DB column) is what made multi-photo saves hang. Capping
  // the longest edge at 1600px and re-encoding as JPEG q0.8 keeps each upload
  // small and fast while still looking sharp on the estimate/invoice page.
  function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
            else { width = Math.round((width * maxDim) / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Image failed to load'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setUploading(true);
    setUploadError(null);
    let current = photos;

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const safeName = file.name.replace(/\.\w+$/, '') + '.jpg';
        const { key, url } = await uploadBlob(compressed, safeName);
        const newPhoto: JobPhoto = {
          id: Math.random().toString(36).slice(2),
          key,
          url,
          note: '',
          takenAt: new Date().toISOString(),
        };
        current = [...current, newPhoto];
        setPhotos(current);
        await persist(current); // save after each photo so progress is never lost mid-batch
      } catch (err: any) {
        setUploadError(err.message ?? 'Upload failed — try again');
      }
    }

    setUploading(false);
  }

  function updateNote(id: string, note: string) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, note } : p));
    setNotesSaved(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await persist(photos);
    setSavingNotes(false);
    setNotesSaved(true);
  }

  async function deletePhoto(id: string) {
    const updated = photos.filter(p => p.id !== id);
    setPhotos(updated);
    await persist(updated);
  }

  const hasNoteChanges = JSON.stringify(photos) !== JSON.stringify(job.jobPhotos || []);

  return (
    <div className="space-y-4">
      {/* Capture buttons — two separate so library is always accessible */}
      <div className="grid grid-cols-2 gap-2">
        <label className={`flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 transition-colors ${uploading || migrating ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          <span className="text-xl">📷</span>
          <span className="text-xs font-bold uppercase tracking-widest">Camera</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={uploading || migrating}
            className="hidden"
            onChange={handleCapture}
          />
        </label>
        <label className={`flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 transition-colors ${uploading || migrating ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          <span className="text-xl">🖼️</span>
          <span className="text-xs font-bold uppercase tracking-widest">Library</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || migrating}
            className="hidden"
            onChange={handleCapture}
          />
        </label>
      </div>
      <p className="text-gray-700 text-xs text-center">
        {migrating ? '⏳ Optimizing older photos…' : uploading ? '⏳ Uploading…' : 'Add notes per photo after uploading'}
      </p>
      {uploadError && <p className="text-red-400 text-xs text-center">{uploadError}</p>}

      {/* Photo grid */}
      {photos.length === 0 && (
        <div className="text-center py-8 text-gray-700 text-sm">No photos yet</div>
      )}

      <div className="space-y-3">
        {photos.map((photo) => (
          <div key={photo.id} className="bg-gray-900 border border-gray-800">
            <div className="relative">
              <img src={photo.url || photo.dataUrl} alt="Job photo" className="w-full max-h-48 object-cover" />
              <button
                onClick={() => deletePhoto(photo.id)}
                className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-red-500 hover:bg-red-900/80 flex items-center justify-center text-sm transition-colors"
              >×</button>
              <span className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/60 px-1.5 py-0.5">
                {new Date(photo.takenAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="p-3">
              {editingNote === photo.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={photo.note}
                    onChange={e => updateNote(photo.id, e.target.value)}
                    onBlur={() => setEditingNote(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingNote(null)}
                    placeholder="Add a note…"
                    className="flex-1 bg-gray-800 border border-gray-600 text-white px-2 py-1.5 text-xs focus:border-red-600 outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingNote(photo.id)}
                  className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {photo.note || <span className="italic">+ Add note…</span>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <button
          onClick={saveNotes}
          disabled={savingNotes || !hasNoteChanges}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
        >
          {savingNotes ? 'Saving…' : notesSaved ? '✓ Notes Saved' : hasNoteChanges ? 'Save Notes' : '✓ Saved'}
        </button>
      )}
    </div>
  );
}

// ── VIDEO PANEL (customer-facing — shown on the invoice page) ───────────────
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80MB safety cap — matches customer-upload-video.js

function VideoPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [videos, setVideos] = useState<JobVideo[]>(job.jobVideos || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const prevJobId = useRef(job.id);

  // Same slim/full record sync fix used by PhotoPanel — job list is slim
  // (no videos, for load speed), so this panel can mount before the full
  // record arrives a beat later.
  useEffect(() => {
    if (job.id !== prevJobId.current) {
      prevJobId.current = job.id;
      setVideos(job.jobVideos || []);
    } else if (videos.length === 0 && (job.jobVideos || []).length > 0) {
      setVideos(job.jobVideos || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.jobVideos]);

  async function persist(updated: JobVideo[]) {
    await patchJob(job.id, { job_videos: JSON.stringify(updated) });
    onUpdate({ ...job, jobVideos: updated });
  }

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setUploading(true);
    setUploadError(null);
    let current = videos;

    for (const file of files) {
      if (file.size > MAX_VIDEO_BYTES) {
        setUploadError(`${file.name} is too large (80MB max)`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bookingId', job.id);
        const res = await fetch('/customer-upload-video', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        const { key, url } = await res.json() as any;
        const newVideo: JobVideo = {
          id: Math.random().toString(36).slice(2),
          key,
          url,
          note: '',
          takenAt: new Date().toISOString(),
        };
        current = [...current, newVideo];
        setVideos(current);
        await persist(current); // save after each video so progress is never lost mid-batch
      } catch (err: any) {
        setUploadError(err.message ?? 'Upload failed — try again');
      }
    }

    setUploading(false);
  }

  function updateNote(id: string, note: string) {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, note } : v));
    setNotesSaved(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await persist(videos);
    setSavingNotes(false);
    setNotesSaved(true);
  }

  async function deleteVideo(id: string) {
    const updated = videos.filter(v => v.id !== id);
    setVideos(updated);
    await persist(updated);
  }

  const hasNoteChanges = JSON.stringify(videos) !== JSON.stringify(job.jobVideos || []);

  return (
    <div className="space-y-4">
      {/* Capture buttons — two separate so library is always accessible */}
      <div className="grid grid-cols-2 gap-2">
        <label className={`flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          <span className="text-xl">🎥</span>
          <span className="text-xs font-bold uppercase tracking-widest">Camera</span>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            multiple
            disabled={uploading}
            className="hidden"
            onChange={handleCapture}
          />
        </label>
        <label className={`flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          <span className="text-xl">📁</span>
          <span className="text-xs font-bold uppercase tracking-widest">Library</span>
          <input
            type="file"
            accept="video/*"
            multiple
            disabled={uploading}
            className="hidden"
            onChange={handleCapture}
          />
        </label>
      </div>
      <p className="text-gray-700 text-xs text-center">
        {uploading ? '⏳ Uploading…' : 'Up to 80MB per video — add notes after uploading'}
      </p>
      {uploadError && <p className="text-red-400 text-xs text-center">{uploadError}</p>}

      {/* Video list */}
      {videos.length === 0 && (
        <div className="text-center py-8 text-gray-700 text-sm">No videos yet</div>
      )}

      <div className="space-y-3">
        {videos.map((video) => (
          <div key={video.id} className="bg-gray-900 border border-gray-800">
            <div className="relative">
              <video src={video.url} controls className="w-full max-h-48 bg-black" />
              <button
                onClick={() => deleteVideo(video.id)}
                className="absolute top-2 right-2 w-7 h-7 bg-black/70 text-red-500 hover:bg-red-900/80 flex items-center justify-center text-sm transition-colors"
              >×</button>
              <span className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/60 px-1.5 py-0.5">
                {new Date(video.takenAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="p-3">
              {editingNote === video.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={video.note}
                    onChange={e => updateNote(video.id, e.target.value)}
                    onBlur={() => setEditingNote(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingNote(null)}
                    placeholder="Add a note…"
                    className="flex-1 bg-gray-800 border border-gray-600 text-white px-2 py-1.5 text-xs focus:border-red-600 outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingNote(video.id)}
                  className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {video.note || <span className="italic">+ Add note…</span>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {videos.length > 0 && (
        <button
          onClick={saveNotes}
          disabled={savingNotes || !hasNoteChanges}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
        >
          {savingNotes ? 'Saving…' : notesSaved ? '✓ Notes Saved' : hasNoteChanges ? 'Save Notes' : '✓ Saved'}
        </button>
      )}
    </div>
  );
}



// ── INSPECTION PANEL (admin — tire pressure, tread, DTC codes) ───────────────

const EMPTY_TIRES: TireReading = { fl: '', fr: '', rl: '', rr: '' };
const TIRE_POSITIONS = [
  { key: 'fl', label: 'FL' },
  { key: 'fr', label: 'FR' },
  { key: 'rl', label: 'RL' },
  { key: 'rr', label: 'RR' },
] as const;

function InspectionPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const init = job.inspectionData ?? { tirePressure: { ...EMPTY_TIRES }, tireTread: { ...EMPTY_TIRES }, dtcCodes: [] };
  const [pressure, setPressure] = useState<TireReading>({ ...init.tirePressure });
  const [tread, setTread] = useState<TireReading>({ ...init.tireTread });
  const [codes, setCodes] = useState<DtcCode[]>(init.dtcCodes.length ? init.dtcCodes : []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const prevJobId = useRef(job.id);

  // The job list is slim (no inspection data, for load speed), so this panel
  // can mount before the full record arrives a beat later. Catch up once it
  // does — but only while `saved` is still true, i.e. the admin hasn't
  // started entering readings yet, so we never clobber unsaved local edits.
  useEffect(() => {
    const isNewJob = job.id !== prevJobId.current;
    if (isNewJob) prevJobId.current = job.id;
    if (isNewJob || saved) {
      const data = job.inspectionData ?? { tirePressure: { ...EMPTY_TIRES }, tireTread: { ...EMPTY_TIRES }, dtcCodes: [] };
      setPressure({ ...data.tirePressure });
      setTread({ ...data.tireTread });
      setCodes(data.dtcCodes.length ? data.dtcCodes : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.inspectionData]);

  function markDirty() { setSaved(false); }

  function addCode() {
    setCodes(prev => [...prev, { id: Math.random().toString(36).slice(2), code: '', plan: '' }]);
    markDirty();
  }
  function removeCode(id: string) { setCodes(prev => prev.filter(c => c.id !== id)); markDirty(); }
  function updateCode(id: string, field: 'code' | 'plan', val: string) {
    setCodes(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c));
    markDirty();
  }

  async function save() {
    setSaving(true);
    const inspectionData: InspectionData = { tirePressure: pressure, tireTread: tread, dtcCodes: codes };
    await patchJob(job.id, { inspection_data: JSON.stringify(inspectionData) });
    onUpdate({ ...job, inspectionData });
    setSaving(false);
    setSaved(true);
  }

  const TireGrid = ({ label, values, onChange }: { label: string; values: TireReading; onChange: (k: keyof TireReading, v: string) => void }) => (
    <div>
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {TIRE_POSITIONS.map(({ key, label: pos }) => (
          <div key={key} className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-2">
            <span className="text-gray-600 text-xs font-bold w-6 flex-shrink-0">{pos}</span>
            <input
              type="text"
              inputMode="decimal"
              value={values[key]}
              onChange={e => { onChange(key, e.target.value); markDirty(); }}
              placeholder="—"
              className="flex-1 bg-transparent text-white text-sm font-mono outline-none min-w-0"
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <TireGrid
        label="Tire Pressure (PSI)"
        values={pressure}
        onChange={(k, v) => setPressure(prev => ({ ...prev, [k]: v }))}
      />
      <TireGrid
        label="Tire Tread Depth (32nds)"
        values={tread}
        onChange={(k, v) => setTread(prev => ({ ...prev, [k]: v }))}
      />

      {/* DTC Codes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Diagnostic Codes (DTC)</p>
          <button onClick={addCode} className="text-xs font-bold text-red-500 hover:text-red-400 uppercase tracking-widest">+ Add Code</button>
        </div>
        {codes.length === 0 && (
          <p className="text-gray-700 text-xs italic py-3 text-center">No codes — tap + Add Code to log one</p>
        )}
        <div className="space-y-3">
          {codes.map(c => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={c.code}
                  onChange={e => updateCode(c.id, 'code', e.target.value.toUpperCase())}
                  placeholder="e.g. P0420"
                  className="bg-gray-800 border border-gray-700 text-white text-sm font-mono px-3 py-1.5 w-32 outline-none focus:border-red-600"
                />
                <button onClick={() => removeCode(c.id)} className="ml-auto text-gray-700 hover:text-red-500 text-lg leading-none transition-colors">×</button>
              </div>
              <textarea
                value={c.plan}
                onChange={e => updateCode(c.id, 'plan', e.target.value)}
                placeholder="Plan to fix / replace — explain what this code means and how you'll address it…"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 outline-none focus:border-red-600 resize-none"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving || saved}
        className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Inspection Data'}
      </button>
    </div>
  );
}

// ── ESTIMATE PANEL (inside admin job detail) ──────────────────────────────────

function EstimatePanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [lineItems, setLineItems] = useState<LineItem[]>(job.lineItems?.length ? job.lineItems : [
    { id: 'mobile', label: 'Mobile Service Fee', amount: MOBILE_FEE, type: 'mobile' },
  ]);
  const [notes, setNotes] = useState(job.estimateNotes);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const alreadySent = job.jobStatus === 'ESTIMATE_SENT' || job.jobStatus === 'SIGNED' || job.jobStatus === 'IN_PROGRESS' || job.jobStatus === 'COMPLETED' || job.jobStatus === 'INVOICED' || job.jobStatus === 'PAID';
  const estimateUrl = `https://gidgarage.com/estimate?id=${job.id}`;
  function copyEstimateLink() {
    navigator.clipboard.writeText(estimateUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }
  const [showCalc, setShowCalc] = useState(!job.lineItems?.length);
  const [shopAvg, setShopAvg] = useState(0);
  const [showShopComparison, setShowShopComparison] = useState(true);
  const prevJobId = useRef(job.id);
  const hasLocalEdits = useRef(false);

  // The job list is slim (no line items, for load speed), so this panel can
  // mount before the full record arrives a beat later. Catch up once it does,
  // unless the admin has already started editing the estimate themselves.
  useEffect(() => {
    if (job.id !== prevJobId.current) {
      prevJobId.current = job.id;
      hasLocalEdits.current = false;
      setLineItems(job.lineItems?.length ? job.lineItems : [{ id: 'mobile', label: 'Mobile Service Fee', amount: MOBILE_FEE, type: 'mobile' }]);
      setNotes(job.estimateNotes);
      setShowCalc(!job.lineItems?.length);
    } else if (!hasLocalEdits.current && job.lineItems?.length) {
      setLineItems(job.lineItems);
      setNotes(job.estimateNotes);
      setShowCalc(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.lineItems, job.estimateNotes]);


  const total = lineItems.reduce((s, i) => s + i.amount, 0);
  const [rawAmounts, setRawAmounts] = useState<Record<string, string>>({});

  function handleApplyCalc(items: LineItem[], _total: number, calcShopAvg: number) {
    hasLocalEdits.current = true;
    setLineItems(items);
    setShopAvg(calcShopAvg);
    setShowCalc(false);
  }

  function updateLineItemLabel(id: string, label: string) {
    hasLocalEdits.current = true;
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, label } : i));
  }

  function updateLineItemAmount(id: string, amountStr: string) {
    hasLocalEdits.current = true;
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, amount: parseFloat(amountStr) || 0 } : i));
  }

  function updateLineItemTaxable(id: string, taxable: boolean) {
    hasLocalEdits.current = true;
    setLineItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      // Toggle type between taxable (parts/other/fixed) and exempt (labor/mobile)
      const newType = taxable
        ? (i.type === 'labor' || i.type === 'mobile' ? 'parts' : i.type)
        : (i.id === 'mobile' ? 'mobile' : 'labor');
      return { ...i, type: newType };
    }));
  }

  function removeLineItem(id: string) {
    hasLocalEdits.current = true;
    setLineItems(prev => prev.filter(i => i.id !== id));
  }

  function addLineItem() {
    hasLocalEdits.current = true;
    setLineItems(prev => [...prev, { id: Math.random().toString(36).slice(2), label: '', amount: 0, type: 'other' }]);
  }

  async function saveEstimate() {
    setSaving(true);
    await patchJob(job.id, {
      estimate_amount: total,
      estimate_notes: notes,
      line_items: JSON.stringify(lineItems),
      tax_amount: taxFromItems(lineItems),
    });
    onUpdate({ ...job, estimateAmount: total, estimateNotes: notes, lineItems, taxAmount: taxFromItems(lineItems) });
    setSaving(false);
  }

  async function sendEstimate() {
    if (!total || !job.email) return;
    setSending(true);
    await patchJob(job.id, {
      estimate_amount: total,
      estimate_notes: notes,
      line_items: JSON.stringify(lineItems),
      job_status: 'ESTIMATE_SENT',
      tax_amount: taxFromItems(lineItems),
    });
    const updated = { ...job, estimateAmount: total, estimateNotes: notes, lineItems, jobStatus: 'ESTIMATE_SENT' as JobStatus, taxAmount: taxFromItems(lineItems) };
    await sendEstimateEmail(updated, showShopComparison ? shopAvg : 0);
    onUpdate(updated);
    setSending(false);
    setSent(true);
  }

  const canSend = total > 0 && !!job.email;
  const savings = shopAvg > 0 ? shopAvg - total : 0;

  return (
    <div className="space-y-5">
      {/* Estimate link — always accessible regardless of how job was created */}
      <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 px-3 py-2">
        <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">Link</span>
        <code className="text-gray-400 text-xs flex-1 truncate">{estimateUrl}</code>
        <button
          onClick={copyEstimateLink}
          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 flex-shrink-0 transition-colors border border-gray-600 text-gray-300 hover:border-white hover:text-white"
        >
          {linkCopied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Calculator toggle */}
      <button
        onClick={() => setShowCalc(v => !v)}
        className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors flex items-center gap-2"
      >
        🧮 {showCalc ? 'Hide Calculator' : 'Open Quote Calculator'}
      </button>

      {showCalc && <QuoteCalculator job={job} onApply={handleApplyCalc} />}

      {/* Line items editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-500 text-xs font-bold uppercase tracking-widest">Line Items</label>
          <button onClick={addLineItem} className="text-xs text-gray-500 hover:text-white transition-colors">+ Add Line</button>
        </div>
        <div className="space-y-1.5">
          {lineItems.map(item => {
            const isTaxable = !['labor', 'mobile'].includes(item.type);
            return (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={e => updateLineItemLabel(item.id, e.target.value)}
                  placeholder="Description"
                  className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs focus:border-red-600 outline-none disabled:opacity-50"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-gray-600 text-xs">$</span>
                  <input
                    type="number"
                    value={rawAmounts[item.id] ?? item.amount}
                    onChange={e => {
                      setRawAmounts(prev => ({ ...prev, [item.id]: e.target.value }));
                      const n = parseFloat(e.target.value);
                      if (!isNaN(n)) updateLineItemAmount(item.id, e.target.value);
                    }}
                    onBlur={e => {
                      if (e.target.value === '') {
                        setRawAmounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                        return;
                      }
                      const n = parseFloat(e.target.value) || 0;
                      updateLineItemAmount(item.id, String(n));
                      setRawAmounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                    }}
                    className="w-20 bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs font-mono focus:border-red-600 outline-none disabled:opacity-50"
                  />
                </div>
                {/* Taxable checkbox */}
                <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer" title={isTaxable ? 'Taxable' : 'Tax exempt'}>
                  <input
                    type="checkbox"
                    checked={isTaxable}
                    onChange={e => updateLineItemTaxable(item.id, e.target.checked)}
                    className="accent-yellow-500 w-3 h-3 disabled:opacity-30"
                  />
                  <span className={`text-[10px] font-bold ${isTaxable ? 'text-yellow-600' : 'text-gray-700'}`}>Tax</span>
                </label>
                <button onClick={() => removeLineItem(item.id)} className="text-gray-700 hover:text-red-500 text-sm transition-colors w-5">×</button>
              </div>
            );
          })}
        </div>

        {/* Subtotal + Tax + Total */}
        <div className="border-t border-gray-700 mt-3 pt-3 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs uppercase tracking-wider">Subtotal</span>
            <span className="text-gray-300 text-xs font-mono">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs uppercase tracking-wider">AZ TPT ({taxRatePercentLabel()}%)</span>
            <span className="text-yellow-500 text-xs font-mono">${taxFromItems(lineItems).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-1.5">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total</span>
            <span className="text-white text-sm font-black">${totalFromItems(total, lineItems).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Savings callout if shop avg set */}
      {savings > 0 && (
        <div className="space-y-1">
          <div className="bg-emerald-900/20 border border-emerald-700 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Customer saves vs shops</p>
              <p className="text-emerald-500 text-xs mt-0.5 font-semibold">and we come to you!</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-emerald-400 font-black text-lg">-${savings.toFixed(2)}</p>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showShopComparison} onChange={e => setShowShopComparison(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5" />
                <span className="text-gray-500 text-[10px] uppercase tracking-wider">Show in email</span>
              </label>
            </div>
          </div>
          {!showShopComparison && <p className="text-gray-700 text-xs italic">Hidden from customer email</p>}
        </div>
      )}

      {/* Alignment clause — shown for suspension jobs */}
      {(job.service === 'suspension' || job.notes?.toLowerCase().includes('strut') || job.notes?.toLowerCase().includes('tie rod') || job.notes?.toLowerCase().includes('control arm')) && (
        <div className="bg-yellow-950/30 border border-yellow-800/50 px-3 py-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notes.includes('GID Garage does not perform alignments')}
              onChange={e => {
                const clause = 'Note: GID Garage does not perform alignments. After this suspension service, an alignment is recommended to ensure proper tire wear and vehicle handling. Please plan to visit an alignment shop following your appointment.';
                setNotes(prev => e.target.checked
                  ? (prev ? prev + '\n\n' + clause : clause)
                  : prev.replace(/\n\nNote: GID Garage does not perform alignments.*$/s, '').replace(/^Note: GID Garage does not perform alignments.*$/s, '').trim()
                );
              }}
              className="accent-yellow-500 mt-0.5 flex-shrink-0"
            />
            <div>
              <p className="text-yellow-400 text-xs font-bold">⚠️ Add Alignment Disclaimer</p>
              <p className="text-yellow-200/60 text-xs mt-0.5">Adds to scope notes that you don't do alignments and one is recommended after this service.</p>
            </div>
          </label>
        </div>
      )}

      {/* Scope notes */}
      <div>
        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Scope Notes <span className="text-gray-700 normal-case font-normal">(shown to customer)</span></label>
        <textarea
          value={notes}
          onChange={e => { hasLocalEdits.current = true; setNotes(e.target.value); }}
          rows={2}
          placeholder="e.g. Full synthetic oil change, inspect brakes while on site…"
          className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm w-full focus:border-red-600 outline-none resize-none"
        />
      </div>

      {/* CYA terms */}
      <div className="bg-gray-800/50 border border-gray-700 p-3">
        <p className="text-gray-600 text-xs font-bold uppercase tracking-widest mb-2">Terms included</p>
        <ul className="space-y-1">
          {CYA_TERMS.map((t, i) => (
            <li key={i} className="text-gray-500 text-xs flex gap-2">
              <span className="text-red-700 font-bold flex-shrink-0">✓</span> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button onClick={saveEstimate} disabled={saving}
          className="border border-gray-600 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button onClick={sendEstimate} disabled={!canSend || sending}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors">
          {sending ? 'Sending…' : sent ? '✓ Sent!' : alreadySent ? `↺ Resend to ${job.email}` : `Send to ${job.email}`}
        </button>
        {alreadySent && (
          <button
            onClick={async () => {
              await patchJob(job.id, { customer_agreed: false, customer_signature: '', signed_at: null, job_status: 'BOOKED' });
              onUpdate({ ...job, customerAgreed: false, customerSignature: '', signedAt: null, jobStatus: 'BOOKED', lineItems, estimateAmount: total, estimateNotes: notes });
            }}
            className="border border-yellow-700 text-yellow-600 hover:border-yellow-500 hover:text-yellow-400 text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors"
          >
            ✏️ Revise Quote
          </button>
        )}
      </div>
    </div>
  );
}


// ── PAYMENT PANEL ─────────────────────────────────────────────────────────────

// Marks whether this customer has actually left a Google review — no GBP
// review API is wired up, so this is a manual toggle Michael flips when he
// sees one come in. Excludes the job (and, via email match, this customer's
// other jobs) from future review-request follow-up emails.
function ReviewStatusToggle({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [saving, setSaving] = useState(false);
  const reviewed = !!job.reviewLeftAt;

  async function toggle() {
    setSaving(true);
    const value = reviewed ? null : new Date().toISOString();
    try {
      await patchJob(job.id, { review_left_at: value });
      onUpdate({ ...job, reviewLeftAt: value });
    } catch (e: any) {
      await reportError(e, { source: 'ReviewStatusToggle', jobId: job.id });
    }
    setSaving(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={`w-full flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider py-2 mt-1 border transition-colors disabled:opacity-40 ${
        reviewed
          ? 'border-emerald-700 text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/10'
          : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
      }`}
      title={reviewed ? 'Customer confirmed to have left a review — click to undo' : 'Mark that this customer left a Google review'}
    >
      {saving ? 'Saving…' : reviewed
        ? `⭐ Review Left${job.reviewLeftAt ? ' — ' + new Date(job.reviewLeftAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`
        : '☆ Mark Review Left'}
    </button>
  );
}

function PaymentPanel({ job, onUpdate, onRequote }: { job: Job; onUpdate: (j: Job) => void; onRequote?: () => void }) {
  const [invoiceAmt, setInvoiceAmt] = useState(job.invoiceAmount?.toString() ?? job.estimateAmount?.toString() ?? '');
  const [stripeId, setStripeId] = useState(job.stripeTransactionId);
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeConfirm, setChargeConfirm] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [paymentAmt, setPaymentAmt] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentStripeId, setPaymentStripeId] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState('');
  const [editMethod, setEditMethod] = useState('Cash');
  const [editNote, setEditNote] = useState('');
  const [editStripeId, setEditStripeId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [invoiceLinkCopied, setInvoiceLinkCopied] = useState(false);
  const invoiceUrl = `https://gidgarage.com/invoice?id=${job.id}`;
  function copyInvoiceLink() {
    navigator.clipboard.writeText(invoiceUrl).then(() => {
      setInvoiceLinkCopied(true);
      setTimeout(() => setInvoiceLinkCopied(false), 2000);
    });
  }

  const hasCardOnFile = !!job.stripeCustomerId;
  const finalAmount = parseFloat(invoiceAmt) || job.estimateAmount || 0;

  // Tax is always the original tax from line items — price adjustments are
  // pre-tax discounts, they do NOT change what tax was calculated on.
  const originalTax = job.taxAmount ?? (job.lineItems?.length ? taxFromItems(job.lineItems) : calcTax(job.estimateAmount || 0));
  function taxForAmount(_amount: number): number {
    return originalTax;
  }
  function totalForAmount(amount: number): number {
    return Math.round((amount + originalTax) * 100) / 100;
  }

  const amountPaidSoFar = job.amountPaid || 0;
  const totalDue = totalForAmount(finalAmount);
  const balanceDue = Math.max(0, Math.round((totalDue - amountPaidSoFar) * 100) / 100);

  // Record a manual/partial payment (cash, check, Zelle, family-friend discount,
  // etc.) without going through the full Stripe charge flow. Multiple payments
  // can be recorded against the same invoice; once they sum to the total due,
  // the job is automatically marked PAID.
  async function recordPayment() {
    const amt = parseFloat(paymentAmt);
    if (!amt || amt <= 0) return;
    setRecordingPayment(true);
    setRecordError(null);
    try {
      const newPayment: Payment = {
        id: Math.random().toString(36).slice(2),
        amount: Math.round(amt * 100) / 100,
        method: paymentMethod,
        note: paymentNote,
        at: new Date().toISOString(),
        ...(paymentStripeId.trim() ? { stripeId: paymentStripeId.trim() } : {}),
      };
      const updatedPayments = [...(job.payments || []), newPayment];
      const newAmountPaid = Math.round(((job.amountPaid || 0) + newPayment.amount) * 100) / 100;
      const isNowFullyPaid = newAmountPaid >= totalDue - 0.01;

      const fields: Record<string, any> = {
        payments: JSON.stringify(updatedPayments),
        amount_paid: newAmountPaid,
        invoice_amount: finalAmount,
        tax_amount: taxForAmount(finalAmount),
      };
      if (isNowFullyPaid) {
        fields.job_status = 'PAID';
        fields.status = 'completed';
        fields.paid_at = new Date().toISOString();
        if (!job.stripeTransactionId) fields.stripe_transaction_id = newPayment.stripeId || `Manual — ${paymentMethod}`;
      } else if (job.jobStatus !== 'INVOICED' && job.jobStatus !== 'COMPLETED') {
        fields.job_status = 'INVOICED';
      }

      await patchJob(job.id, fields);

      const updated: Job = {
        ...job,
        payments: updatedPayments,
        amountPaid: newAmountPaid,
        invoiceAmount: finalAmount,
        taxAmount: taxForAmount(finalAmount),
        jobStatus: (fields.job_status as JobStatus) ?? job.jobStatus,
        status: fields.status ?? job.status,
        paidAt: fields.paid_at ?? job.paidAt,
        stripeTransactionId: fields.stripe_transaction_id ?? job.stripeTransactionId,
      };

      if (isNowFullyPaid) {
        if (job.jobStatus !== 'INVOICED' && job.jobStatus !== 'COMPLETED') {
          const inv = await sendInvoiceEmail(updated);
          if (inv) { updated.invoiceSentCount = inv.count; updated.invoiceLastSentAt = inv.lastSentAt; }
        }
        await sendReceiptEmail(updated);
      }

      onUpdate(updated);
      setPaymentAmt('');
      setPaymentNote('');
      setPaymentStripeId('');
    } catch (e: any) {
      await reportError(e, { source: 'recordPayment', jobId: job.id, amount: paymentAmt });
      setRecordError(e.message ?? 'Failed to record payment');
    }
    setRecordingPayment(false);
  }

  // Shared by edit + delete: recompute amount_paid from the full payments
  // array and reconcile job status both directions — an edit can push a job
  // to fully paid, or pull a previously-PAID job back under the total if the
  // amount was corrected downward.
  async function applyPaymentsUpdate(updatedPayments: Payment[]) {
    const newAmountPaid = Math.round(updatedPayments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const wasFullyPaid = job.jobStatus === 'PAID';
    const isNowFullyPaid = newAmountPaid > 0 && newAmountPaid >= totalDue - 0.01;

    const fields: Record<string, any> = {
      payments: JSON.stringify(updatedPayments),
      amount_paid: newAmountPaid,
    };
    if (isNowFullyPaid && !wasFullyPaid) {
      fields.job_status = 'PAID';
      fields.status = 'completed';
      fields.paid_at = job.paidAt ?? new Date().toISOString();
    } else if (!isNowFullyPaid && wasFullyPaid) {
      // Correction dropped the total below what's owed — revert so the balance shows correctly
      fields.job_status = 'INVOICED';
      fields.paid_at = null;
    }

    await patchJob(job.id, fields);

    const updated: Job = {
      ...job,
      payments: updatedPayments,
      amountPaid: newAmountPaid,
      jobStatus: (fields.job_status as JobStatus) ?? job.jobStatus,
      status: fields.status ?? job.status,
      paidAt: fields.paid_at !== undefined ? fields.paid_at : job.paidAt,
    };
    onUpdate(updated);
    return updated;
  }

  function startEditPayment(p: Payment) {
    setEditingPaymentId(p.id);
    setEditAmt(p.amount.toString());
    setEditMethod(p.method);
    setEditNote(p.note);
    setEditStripeId(p.stripeId || '');
    setEditError(null);
  }

  async function saveEditPayment() {
    const amt = parseFloat(editAmt);
    if (!amt || amt <= 0 || !editingPaymentId) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updatedPayments = (job.payments || []).map(p => p.id !== editingPaymentId ? p : {
        id: p.id,
        amount: Math.round(amt * 100) / 100,
        method: editMethod,
        note: editNote,
        at: p.at,
        ...(editStripeId.trim() ? { stripeId: editStripeId.trim() } : {}),
      });
      await applyPaymentsUpdate(updatedPayments);
      setEditingPaymentId(null);
    } catch (e: any) {
      setEditError(e.message ?? 'Failed to save changes');
    }
    setSavingEdit(false);
  }

  async function deletePayment(id: string) {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return;
    setEditError(null);
    try {
      const updatedPayments = (job.payments || []).filter(p => p.id !== id);
      await applyPaymentsUpdate(updatedPayments);
    } catch (e: any) {
      setEditError(e.message ?? 'Failed to delete payment');
    }
  }

  // Single payment line — read view, or an inline edit form when this row is
  // the one currently being edited. Shared by both the "Balance Due" summary
  // and the fully-paid "Payments Received" history below.
  function renderPaymentRow(p: Payment, amountColorClass: string) {
    if (editingPaymentId === p.id) {
      return (
        <div key={p.id} className="bg-gray-900 border border-gray-700 p-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 px-2">
              <span className="text-gray-500 text-xs font-bold">$</span>
              <input
                type="number"
                value={editAmt}
                onChange={e => setEditAmt(e.target.value)}
                className="bg-transparent text-white py-1.5 text-xs font-mono w-20 outline-none"
              />
            </div>
            <select
              value={editMethod}
              onChange={e => setEditMethod(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white px-1.5 text-xs outline-none focus:border-yellow-700 flex-1"
            >
              <option>Cash</option>
              <option>Check</option>
              <option>Zelle</option>
              <option>Venmo</option>
              <option>CashApp</option>
              <option>Card (Tap to Pay)</option>
              <option>Other</option>
            </select>
          </div>
          <input
            type="text"
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            placeholder="Note"
            className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs outline-none focus:border-yellow-700 placeholder-gray-600"
          />
          <input
            type="text"
            value={editStripeId}
            onChange={e => setEditStripeId(e.target.value)}
            placeholder="Stripe Transaction ID (optional)"
            className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs font-mono outline-none focus:border-yellow-700 placeholder-gray-600"
          />
          {editError && <p className="text-red-400 text-xs">{editError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setEditingPaymentId(null)} className="flex-1 border border-gray-600 text-gray-400 text-xs font-bold py-1.5 hover:border-white hover:text-white transition-colors">Cancel</button>
            <button onClick={saveEditPayment} disabled={savingEdit || !editAmt || parseFloat(editAmt) <= 0} className="flex-1 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-xs font-bold py-1.5 transition-colors">
              {savingEdit ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div key={p.id} className="flex justify-between items-start text-xs gap-3 group">
        <span className="text-gray-400">
          {p.method}{p.note ? ` — ${p.note}` : ''}
          {p.stripeId && <span className="block text-gray-600 font-mono text-[10px]">{p.stripeId}</span>}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`${amountColorClass} font-mono`}>${p.amount.toFixed(2)}</span>
          <button onClick={() => startEditPayment(p)} className="text-gray-600 hover:text-yellow-500 transition-colors" title="Edit">✎</button>
          <button onClick={() => deletePayment(p.id)} className="text-gray-600 hover:text-red-500 transition-colors" title="Delete">×</button>
        </div>
      </div>
    );
  }

  const CHARGEABLE_STATUSES: JobStatus[] = ['COMPLETED', 'INVOICED', 'IN_PROGRESS', 'SIGNED'];

  async function chargeCardOnFile() {
    if (!hasCardOnFile || !finalAmount) return;
    if (!CHARGEABLE_STATUSES.includes(job.jobStatus)) return;
    const chargedAmount = finalAmount; // snapshot before any await — prevents mid-flight edits
    const amountToCharge = amountPaidSoFar > 0 ? balanceDue : totalForAmount(chargedAmount);
    setCharging(true);
    setChargeError(null);
    try {
      const res = await fetch('/admin-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: job.stripeCustomerId,
          amountCents: Math.round(amountToCharge * 100),
          subtotal: chargedAmount,
          taxAmount: taxForAmount(chargedAmount),
          description: `GID Garage — ${job.service} — ${job.vehicle}`,
          bookingId: job.id,
        }),
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as any;
      // already_paid = idempotent success — treat it as paid
      if ((!res.ok || data.error) && data.error !== 'already_paid') throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.error === 'already_paid') {
        const alreadyPaidAmount = data.amount ?? chargedAmount;
        const paidAt = job.paidAt ?? new Date().toISOString();
        // The server-side charge already succeeded on a prior attempt (that's
        // why we're in this branch), but that first attempt's response never
        // made it back to append this charge to job.payments — so revenue-by-
        // month tracking (which sums job.payments) would silently miss it for
        // any job that already had a prior partial payment. Log it now so the
        // record matches what actually got charged.
        const alreadyLogged = (job.payments || []).some(p => p.stripeId === data.chargeId);
        const updatedPayments = alreadyLogged ? (job.payments || []) : [...(job.payments || []), {
          id: Math.random().toString(36).slice(2),
          amount: amountToCharge,
          method: 'Card (Stripe)',
          note: amountPaidSoFar > 0 ? 'Remaining balance' : '',
          at: paidAt,
          stripeId: data.chargeId,
        } as Payment];
        const updated = {
          ...job,
          invoiceAmount: alreadyPaidAmount,
          taxAmount: taxForAmount(chargedAmount),
          stripeTransactionId: data.chargeId,
          paidAt,
          jobStatus: 'PAID' as JobStatus,
          status: 'completed',
          amountPaid: totalForAmount(alreadyPaidAmount),
          payments: updatedPayments,
        };
        if (!alreadyLogged) {
          await adminPost('patch-booking', { id: job.id, fields: {
            amount_paid: updated.amountPaid,
            payments: JSON.stringify(updatedPayments),
          }});
        }
        onUpdate(updated);
        setCharging(false);
        setChargeConfirm(false);
        return;
      }

      // Re-fetch from Supabase to confirm the Worker's DB write actually landed (fix #3)
      const confirmedJob = await getJobById(job.id);
      const paidAt = confirmedJob?.paidAt ?? new Date().toISOString();
      const confirmedAmount = confirmedJob?.invoiceAmount ?? chargedAmount;

      // Send receipt email
      const adjustmentAmt = job.estimateAmount ? (chargedAmount - job.estimateAmount) : 0;
      const hasAdjustment = Math.abs(adjustmentAmt) > 0.01;
      // If this job already had partial payments recorded, this charge is only
      // covering the remainder — log it as its own payment entry so revenue-by-
      // month tracking (which sums job.payments, not just paidAt) actually sees
      // this charge instead of only the earlier partial entries.
      const updatedPayments = [...(job.payments || []), {
            id: Math.random().toString(36).slice(2),
            amount: amountToCharge,
            method: 'Card (Stripe)',
            note: amountPaidSoFar > 0 ? 'Remaining balance' : '',
            at: paidAt,
            stripeId: data.chargeId,
          } as Payment];
      const updated = {
        ...job,
        invoiceAmount: confirmedAmount,
        taxAmount: taxForAmount(chargedAmount),
        stripeTransactionId: data.chargeId,
        paidAt,
        jobStatus: 'PAID' as JobStatus,
        status: 'completed',
        adjustmentReason: hasAdjustment && adjustmentReason ? adjustmentReason : '',
        adjustmentAmount: hasAdjustment ? adjustmentAmt : null,
        amountPaid: totalForAmount(confirmedAmount), // card charge covers whatever balance remained — invoice is now fully reconciled
        payments: updatedPayments,
      };
      // Persist adjustment + reconciled amount_paid to Supabase so InvoicePage can show it
      await adminPost('patch-booking', { id: job.id, fields: {
        ...(hasAdjustment ? { adjustment_reason: adjustmentReason || '', adjustment_amount: adjustmentAmt } : {}),
        amount_paid: updated.amountPaid,
        payments: JSON.stringify(updatedPayments),
      }});
      await writePaymentEvent(job.id, 'paid', confirmedAmount);
      await sendReceiptEmail(updated, adjustmentReason || undefined, hasAdjustment ? adjustmentAmt : undefined);
      const inv = await sendInvoiceEmail(updated); // formal invoice document
      if (inv) { updated.invoiceSentCount = inv.count; updated.invoiceLastSentAt = inv.lastSentAt; }
      onUpdate(updated);
    } catch (e: any) {
      await writePaymentEvent(job.id, 'declined', chargedAmount, e.message ?? 'Charge failed');
      await reportError(e, { source: 'chargeCardOnFile', jobId: job.id, amount: chargedAmount });
      setChargeError(e.message ?? 'Charge failed. Try again or use manual entry.');
      // Send decline email to customer
      try {
        await sendDeclineEmail({ ...job, invoiceAmount: chargedAmount }, e.message);
      } catch (_) { /* don't block UI on email failure */ }
    }
    setCharging(false);
    setChargeConfirm(false);
  }

  async function markPaid() {
    if (!stripeId) return;
    setSaving(true);
    setChargeError(null);
    const paidAt = new Date().toISOString();
    const reconciledAmountPaid = totalForAmount(finalAmount); // manual entry covers whatever balance remained
    try {
      let invoiceBump: { count: number; lastSentAt: string } | null = null;
      if (job.jobStatus !== 'INVOICED') {
        await patchJob(job.id, { job_status: 'INVOICED', invoice_amount: finalAmount, tax_amount: taxForAmount(finalAmount) });
        invoiceBump = await sendInvoiceEmail({ ...job, jobStatus: 'INVOICED' as JobStatus, invoiceAmount: finalAmount, taxAmount: taxForAmount(finalAmount) });
      }
      // Same reasoning as chargeCardOnFile — if there were prior partial
      // payments, log this manual entry's remaining-balance amount so
      // revenue-by-month tracking actually sees it.
      const updatedPayments = [...(job.payments || []), {
            id: Math.random().toString(36).slice(2),
            amount: balanceDue,
            method: 'Manual Entry',
            note: amountPaidSoFar > 0 ? 'Remaining balance' : '',
            at: paidAt,
            stripeId,
          } as Payment];
      await patchJob(job.id, {
        invoice_amount: finalAmount,
        tax_amount: taxForAmount(finalAmount),
        stripe_transaction_id: stripeId,
        paid_at: paidAt,
        job_status: 'PAID',
        status: 'completed',
        amount_paid: reconciledAmountPaid,
        payments: JSON.stringify(updatedPayments),
      });
      const paidJob = {
        ...job, invoiceAmount: finalAmount, taxAmount: taxForAmount(finalAmount), stripeTransactionId: stripeId, paidAt, jobStatus: 'PAID' as JobStatus, status: 'completed', amountPaid: reconciledAmountPaid, payments: updatedPayments,
        ...(invoiceBump ? { invoiceSentCount: invoiceBump.count, invoiceLastSentAt: invoiceBump.lastSentAt } : {}),
      };
      onUpdate(paidJob);
      // Send receipt email so customer gets confirmation even when paid manually
      await sendReceiptEmail(paidJob);
    } catch (e: any) {
      // This is the Tap to Pay / payment-link close-out path — previously any
      // failure here (bad network, Supabase hiccup, etc.) threw unhandled
      // with no feedback at all, silently leaving the job un-closed.
      await reportError(e, { source: 'markPaid', jobId: job.id, amount: finalAmount, stripeId });
      setChargeError(e.message ?? 'Failed to mark paid. Try again.');
    }
    setSaving(false);
  }

  // Fallback for jobs marked PAID before per-row payment tracking existed (or
  // any PAID job whose payments array is empty for another reason) — lets a
  // refund or mistaken "mark paid" be reversed even without a granular
  // payment record to edit/delete individually via renderPaymentRow.
  const [undoingPayment, setUndoingPayment] = useState(false);
  async function undoFullPayment() {
    if (!window.confirm('Remove this payment and revert the job to Invoiced? Use this for a refund or a mistaken "mark paid". This cannot be undone.')) return;
    setUndoingPayment(true);
    try {
      await patchJob(job.id, {
        job_status: 'INVOICED',
        paid_at: null,
        amount_paid: 0,
        stripe_transaction_id: '',
      });
      onUpdate({
        ...job,
        jobStatus: 'INVOICED' as JobStatus,
        paidAt: null,
        amountPaid: 0,
        stripeTransactionId: '',
      });
    } finally {
      setUndoingPayment(false);
    }
  }

  async function markInvoiced() {
    setSaving(true);
    await patchJob(job.id, { job_status: 'INVOICED', invoice_amount: finalAmount, tax_amount: taxForAmount(finalAmount) });
    let updated = { ...job, jobStatus: 'INVOICED' as JobStatus, invoiceAmount: finalAmount, taxAmount: taxForAmount(finalAmount) };
    const inv = await sendInvoiceEmail(updated);
    if (inv) updated = { ...updated, invoiceSentCount: inv.count, invoiceLastSentAt: inv.lastSentAt };
    onUpdate(updated);
    setSaving(false);
  }

  const [resending, setResending] = useState(false);
  // Manual resend — covers the "marked paid before invoice ever went out" gap,
  // and any other case where the customer needs the invoice re-emailed.
  async function resendInvoice() {
    setResending(true);
    const inv = await sendInvoiceEmail(job);
    if (inv) onUpdate({ ...job, invoiceSentCount: inv.count, invoiceLastSentAt: inv.lastSentAt });
    setResending(false);
  }

  if (job.jobStatus === 'PAID') {
    return (
      <div className="bg-emerald-900/20 border border-emerald-800 p-5 space-y-2">
        <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">✓ Paid</p>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Total Charged</p>
        <p className="text-white text-3xl font-black">${((job.invoiceAmount || 0) + (job.taxAmount || 0)).toFixed(2)}</p>
        <div className="flex justify-between text-xs mt-3">
          <span className="text-gray-600">Subtotal</span>
          <span className="text-gray-400 font-mono">${(job.invoiceAmount || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">AZ TPT ({taxRatePercentLabel()}%)</span>
          <span className="text-yellow-600 font-mono">${(job.taxAmount || 0).toFixed(2)}</span>
        </div>
        {job.payments?.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-emerald-800/50 space-y-1.5">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Payments Received</p>
            {job.payments.map(p => renderPaymentRow(p, 'text-emerald-400'))}
          </div>
        ) : (
          <button onClick={undoFullPayment} disabled={undoingPayment}
            className="mt-3 w-full border border-red-900 text-red-700 hover:border-red-600 hover:text-red-400 text-xs font-bold uppercase tracking-wider py-2 transition-colors disabled:opacity-40">
            {undoingPayment ? 'Reverting…' : '↩ Remove Payment / Refund'}
          </button>
        )}
        <p className="text-gray-500 text-xs font-mono">{job.stripeTransactionId}</p>
        <p className="text-gray-600 text-xs">{job.paidAt ? new Date(job.paidAt).toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) : ''}</p>
        <a
          href={invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center border border-emerald-700 text-emerald-400 hover:bg-emerald-900/40 text-xs font-bold uppercase tracking-widest py-2 transition-colors mt-2"
        >
          🧾 View / Print Invoice
        </a>
        <div className="flex items-center gap-2 bg-black/20 border border-emerald-800/50 px-3 py-2 mt-2">
          <span className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">Link</span>
          <code className="text-emerald-300/70 text-xs flex-1 truncate">{invoiceUrl}</code>
          <button
            onClick={copyInvoiceLink}
            className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 flex-shrink-0 transition-colors border border-emerald-700 text-emerald-400 hover:bg-emerald-900/40"
          >
            {invoiceLinkCopied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs ${job.invoiceSentCount ? 'text-emerald-700' : 'text-yellow-600'}`}>
            {job.invoiceSentCount
              ? `📧 Invoice emailed ${job.invoiceSentCount}× — last sent ${job.invoiceLastSentAt ? new Date(job.invoiceLastSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}`
              : '⚠️ Invoice email never sent to this customer'}
          </p>
          {!!job.email && (
            <button
              onClick={resendInvoice}
              disabled={resending}
              className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-300 underline flex-shrink-0 disabled:opacity-40"
            >
              {resending ? 'Sending…' : job.invoiceSentCount ? 'Resend' : 'Send Now'}
            </button>
          )}
        </div>
        <ReviewStatusToggle job={job} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Invoice link — always accessible regardless of how job was created */}
      <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 px-3 py-2">
        <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">Link</span>
        <code className="text-gray-400 text-xs flex-1 truncate">{invoiceUrl}</code>
        <button
          onClick={copyInvoiceLink}
          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 flex-shrink-0 transition-colors border border-gray-600 text-gray-300 hover:border-white hover:text-white"
        >
          {invoiceLinkCopied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 -mt-1">
        <p className={`text-xs ${job.invoiceSentCount ? 'text-gray-600' : 'text-yellow-600'}`}>
          {job.invoiceSentCount
            ? `📧 Invoice emailed ${job.invoiceSentCount}× — last sent ${job.invoiceLastSentAt ? new Date(job.invoiceLastSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}`
            : '⚠️ Invoice email never sent to this customer'}
        </p>
        {!!job.email && (
          <button
            onClick={resendInvoice}
            disabled={resending}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white underline flex-shrink-0 disabled:opacity-40"
          >
            {resending ? 'Sending…' : job.invoiceSentCount ? 'Resend' : 'Send Now'}
          </button>
        )}
      </div>

      <div>
        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Final Invoice Amount</label>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-lg font-bold">$</span>
          <input
            type="number"
            value={invoiceAmt}
            onChange={e => setInvoiceAmt(e.target.value)}
            placeholder={job.estimateAmount?.toString() ?? '0.00'}
            className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono w-36 focus:border-red-600 outline-none"
          />
          {job.estimateAmount && <span className="text-gray-600 text-xs">Estimate was ${job.estimateAmount.toFixed(2)} + tax (${totalForAmount(job.estimateAmount).toFixed(2)} total)</span>}
        </div>
        {finalAmount > 0 && (
          <div className="mt-2 space-y-0.5">
            {job.estimateAmount && Math.abs(finalAmount - job.estimateAmount) > 0.01 && (
              <div className="flex justify-between text-xs text-indigo-400">
                <span>Price adjustment</span>
                <span className="font-mono">{finalAmount < job.estimateAmount ? '-' : '+'}${Math.abs(finalAmount - job.estimateAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">AZ TPT ({taxRatePercentLabel()}%)</span>
              <span className="text-yellow-600 font-mono">+${taxForAmount(finalAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-gray-800 pt-1">
              <span className="text-gray-400 font-bold uppercase tracking-wider">Customer total</span>
              <span className="text-white font-black font-mono">${totalForAmount(finalAmount).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Adjustment reason — shown when amount differs from estimate */}
      {job.estimateAmount && Math.abs(finalAmount - (job.estimateAmount || 0)) > 0.01 && (
        <div>
          <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Adjustment Reason</label>
          <input
            type="text"
            value={adjustmentReason}
            onChange={e => setAdjustmentReason(e.target.value)}
            placeholder="e.g. Waived mobile fee, Reduced labor, Loyalty discount"
            className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm w-full focus:border-indigo-500 outline-none"
          />
          <p className="text-gray-700 text-xs mt-1">Shown on the customer receipt as a line item</p>
        </div>
      )}

      {/* Partial payment summary + history — shown once any manual payment has been recorded */}
      {amountPaidSoFar > 0 && (
        <div className="bg-yellow-900/10 border border-yellow-800/50 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-xs">Amount Paid</span>
            <span className="text-emerald-400 font-mono font-bold">${amountPaidSoFar.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-xs">Balance Due</span>
            <span className="text-yellow-400 font-mono font-bold">${balanceDue.toFixed(2)}</span>
          </div>
          {job.payments?.length > 0 && (
            <div className="pt-2 border-t border-yellow-800/30 space-y-1">
              {job.payments.map(p => renderPaymentRow(p, 'text-gray-400'))}
            </div>
          )}
        </div>
      )}

      {/* Record a Payment — cash, check, Zelle, family-friend discount, etc.
          Use this for any payment that didn't come through Stripe, full or partial. */}
      <div className="bg-gray-900 border border-gray-700 p-4 space-y-3">
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Record a Payment</p>
        <p className="text-gray-600 text-[11px]">For cash, check, Zelle, Venmo, or any payment not run through Stripe. Can be partial — balance carries forward.</p>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 px-3">
            <span className="text-gray-500 text-sm font-bold">$</span>
            <input
              type="number"
              value={paymentAmt}
              onChange={e => setPaymentAmt(e.target.value)}
              placeholder={balanceDue ? balanceDue.toFixed(2) : '0.00'}
              className="bg-transparent text-white py-2 text-sm font-mono w-24 outline-none"
            />
          </div>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white px-2 text-sm outline-none focus:border-yellow-700"
          >
            <option>Cash</option>
            <option>Check</option>
            <option>Zelle</option>
            <option>Venmo</option>
            <option>CashApp</option>
            <option>Card (Tap to Pay)</option>
            <option>Other</option>
          </select>
        </div>
        <input
          type="text"
          value={paymentNote}
          onChange={e => setPaymentNote(e.target.value)}
          placeholder="Note (e.g. Family friend — partial payment)"
          className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm outline-none focus:border-yellow-700 placeholder-gray-600"
        />
        <input
          type="text"
          value={paymentStripeId}
          onChange={e => setPaymentStripeId(e.target.value)}
          placeholder="Stripe Transaction ID (optional — ch_xxx or pi_xxx, e.g. for Tap to Pay)"
          className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono outline-none focus:border-yellow-700 placeholder-gray-600"
        />
        {recordError && <p className="text-red-400 text-xs">{recordError}</p>}
        <button
          onClick={recordPayment}
          disabled={!paymentAmt || parseFloat(paymentAmt) <= 0 || recordingPayment}
          className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-2.5 transition-colors"
        >
          {recordingPayment ? 'Recording…' : `Record $${paymentAmt ? parseFloat(paymentAmt).toFixed(2) : '0.00'} Payment`}
        </button>
      </div>

      {/* Card on file — primary payment method */}
      {hasCardOnFile ? (
        <div className="bg-gray-900 border border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-0.5">Card on File</p>
              <p className="text-white text-sm font-mono">•••• •••• •••• {job.stripeLast4 || '****'}</p>
            </div>
            <span className="text-emerald-400 text-xs font-bold">✓ Saved</span>
          </div>
          {chargeError && <p className="text-red-400 text-xs">{chargeError}</p>}
          {!chargeConfirm ? (
            <button
              onClick={() => setChargeConfirm(true)}
              disabled={!finalAmount || charging || !CHARGEABLE_STATUSES.includes(job.jobStatus)}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors"
            >
              💳 Charge ${(amountPaidSoFar > 0 ? balanceDue : totalForAmount(finalAmount)).toFixed(2)} to Card on File
              {amountPaidSoFar > 0 ? ' (Remaining Balance)' : ''}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-yellow-400 text-xs font-bold">Confirm charge of ${(amountPaidSoFar > 0 ? balanceDue : totalForAmount(finalAmount)).toFixed(2)} to •••• {job.stripeLast4}?</p>
              <p className="text-gray-600 text-xs">
                {amountPaidSoFar > 0
                  ? `Remaining balance after $${amountPaidSoFar.toFixed(2)} already paid`
                  : `${finalAmount.toFixed(2)} subtotal + ${taxForAmount(finalAmount).toFixed(2)} tax`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setChargeConfirm(false)} className="flex-1 border border-gray-600 text-gray-400 text-xs font-bold py-2 hover:border-white hover:text-white transition-colors">Cancel</button>
                <button onClick={chargeCardOnFile} disabled={charging} className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold py-2 transition-colors disabled:opacity-40">
                  {charging ? 'Charging...' : 'Yes, Charge Now'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 px-4 py-3">
          <p className="text-gray-500 text-xs">No card on file — use manual entry below or Tap to Pay.</p>
        </div>
      )}

      {/* Manual fallback */}
      <details className="group" open={!hasCardOnFile}>
        <summary className="text-gray-600 text-xs font-bold uppercase tracking-widest cursor-pointer hover:text-gray-400 transition-colors list-none">
          {hasCardOnFile ? "▸ Manual Entry / Tap to Pay" : "Manual Entry / Tap to Pay"}
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Stripe Transaction ID</label>
            <input
              type="text"
              value={stripeId}
              onChange={e => setStripeId(e.target.value)}
              placeholder="ch_xxxxxxxx or pi_xxxxxxxx"
              className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono w-full focus:border-red-600 outline-none"
            />
            <p className="text-gray-700 text-xs mt-1">Paste from Stripe dashboard or Tap to Pay receipt</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={markInvoiced} disabled={saving || job.jobStatus === 'INVOICED'}
              className="border border-gray-600 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40">
              Mark Invoiced
            </button>
            <button onClick={markPaid} disabled={!stripeId || saving}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors">
              {saving ? 'Saving…' : '✓ Mark Paid'}
            </button>
          </div>
        </div>
      </details>

      {onRequote && (
        <button
          onClick={async () => {
            await patchJob(job.id, { customer_agreed: false, customer_signature: '', signed_at: null, job_status: 'BOOKED' });
            onRequote();
          }}
          className="border border-yellow-700 text-yellow-600 hover:border-yellow-500 hover:text-yellow-400 text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors"
        >
          ✏️ Revise Quote
        </button>
      )}
    </div>
  );
}

// ── SIGNED DOCUMENT VIEWER ───────────────────────────────────────────────────

function SignedDocSection({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const signedDate = job.signedAt
    ? new Date(job.signedAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' })
    : 'Unknown';
  const amount = job.invoiceAmount ?? job.estimateAmount;

  return (
    <>
      <div className="bg-purple-900/20 border border-purple-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-purple-400 text-xs font-bold uppercase tracking-widest">✓ Estimate Signed</p>
            <p className="text-white text-sm font-bold">{job.customerSignature}</p>
            {job.preExistingDamage && <p className="text-gray-400 text-xs">Pre-existing damage: {job.preExistingDamage}</p>}
            {job.signedAt && <p className="text-gray-600 text-xs">{signedDate}</p>}
            {job.signedIp && <p className="text-gray-700 text-[10px] font-mono">IP: {job.signedIp}</p>}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex-shrink-0 border border-purple-700 text-purple-400 hover:border-purple-400 hover:text-purple-300 text-xs font-bold uppercase tracking-wider px-3 py-1.5 transition-colors"
          >
            Open Doc
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[200] bg-black/90 overflow-y-auto flex items-start justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-[#0f0f0f] border border-gray-700 w-full max-w-lg my-4 relative" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0f0f0f] border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <p className="text-purple-400 text-xs font-bold uppercase tracking-widest">Signed Document</p>
                <h3 className="text-white font-black text-base mt-0.5">{job.fname} {job.lname}</h3>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-2xl leading-none transition-colors">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Job summary */}
              <div className="divide-y divide-white/10 border border-white/10">
                {[
                  ['Vehicle', job.vehicle],
                  ['Service', resolveServiceName(job.service, job.notes)],
                  ['Appointment', `${new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${job.time}`],
                  ...(amount ? [['Quoted Amount', `$${amount.toFixed(2)}`]] : []),
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between px-4 py-2.5 gap-4">
                    <span className="text-gray-500 text-xs font-bold uppercase tracking-wider flex-shrink-0">{label}</span>
                    <span className="text-white text-sm text-right">{val}</span>
                  </div>
                ))}
              </div>

              {/* Line items */}
              {job.lineItems?.length > 0 && (
                <div className="border border-white/10 divide-y divide-white/5">
                  <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest px-4 py-2">Itemized</p>
                  {job.lineItems.map(item => (
                    <div key={item.id} className="flex justify-between gap-3 px-4 py-2">
                      <span className="text-gray-300 text-sm flex-1 min-w-0 break-words">{item.label}</span>
                      <span className="text-white text-sm font-mono flex-shrink-0 whitespace-nowrap">{item.amount === 0 ? 'FREE' : (item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Scope notes */}
              {job.estimateNotes && (
                <div className="bg-white/5 border-l-4 border-red-600 px-4 py-3">
                  <p className="text-gray-400 text-sm leading-relaxed">{job.estimateNotes}</p>
                </div>
              )}

              {/* Terms agreed to */}
              <div className="bg-white/5 border border-white/10 p-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Terms Agreed To</p>
                <ul className="space-y-2">
                  {CYA_TERMS.map((t, i) => (
                    <li key={i} className="text-gray-400 text-xs flex gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">✓</span> {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pre-existing damage */}
              {job.preExistingDamage && (
                <div className="bg-yellow-900/20 border border-yellow-800 px-4 py-3">
                  <p className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-1">Pre-Existing Damage Noted</p>
                  <p className="text-gray-300 text-sm">{job.preExistingDamage}</p>
                </div>
              )}

              {/* Signature block */}
              <div className="bg-purple-900/20 border border-purple-800 px-4 py-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Electronic Signature</p>
                <p className="text-white text-lg font-bold" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{job.customerSignature}</p>
                <p className="text-gray-600 text-xs mt-1">{signedDate}</p>
                <p className="text-gray-700 text-[10px] mt-2">Signed electronically under the Uniform Electronic Transactions Act (UETA). This constitutes a legally binding agreement.</p>
              </div>

              <button onClick={() => window.print()} className="w-full border border-gray-700 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors">
                🖨 Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── PRE/POST HEALTH SCAN UPLOAD ─────────────────────────────────────────────
// Optional link upload — admin attaches a pre-service and/or post-service
// health scan document (PDF or image export from a scan tool). Stored in R2
// under scans/{bookingId}/{stage}-..., served publicly so it can show up as
// a link on the customer invoice.
function ScanUploadBox({ job, stage, onUpdate }: { job: Job; stage: 'pre' | 'post'; onUpdate: (j: Job) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const doc = stage === 'pre' ? job.preScan : job.postScan;
  const label = stage === 'pre' ? 'Pre-Scan' : 'Post-Scan';

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bookingId', job.id);
      formData.append('stage', stage);
      const res = await fetch('/admin-upload-scan', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { key: string; url: string; name: string };
      const field = stage === 'pre' ? 'pre_scan' : 'post_scan';
      await patchJob(job.id, { [field]: JSON.stringify(data) });
      onUpdate({ ...job, ...(stage === 'pre' ? { preScan: data } : { postScan: data }) });
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    }
    setUploading(false);
  }

  async function handleSaveLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setSavingLink(true);
    setError(null);
    try {
      // eslint-disable-next-line no-new
      new URL(url); // throws on garbage input before it ever hits the DB
      const data: ScanDoc = { url, name: linkName.trim() || `${label} Report` };
      const field = stage === 'pre' ? 'pre_scan' : 'post_scan';
      await patchJob(job.id, { [field]: JSON.stringify(data) });
      onUpdate({ ...job, ...(stage === 'pre' ? { preScan: data } : { postScan: data }) });
      setLinkUrl('');
      setLinkName('');
    } catch {
      setError('Enter a valid link (must start with https://)');
    }
    setSavingLink(false);
  }

  async function handleRemove() {
    const field = stage === 'pre' ? 'pre_scan' : 'post_scan';
    await patchJob(job.id, { [field]: null });
    onUpdate({ ...job, ...(stage === 'pre' ? { preScan: null } : { postScan: null }) });
    setMode('upload');
  }

  return (
    <div className="bg-gray-900 border border-gray-800 p-3">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">{stage === 'pre' ? '🔍' : '✅'} {label}</p>
      {doc ? (
        <div className="space-y-2">
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block text-indigo-400 hover:text-indigo-300 text-xs truncate underline">
            {doc.name}
          </a>
          <button onClick={handleRemove} className="text-gray-600 hover:text-red-500 text-[10px] font-bold uppercase tracking-wider transition-colors">
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Upload vs. paste-a-link toggle */}
          <div className="flex gap-1">
            <button onClick={() => setMode('upload')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 border transition-colors ${mode === 'upload' ? 'bg-yellow-800/40 border-yellow-700 text-yellow-500' : 'border-gray-700 text-gray-600 hover:text-gray-400'}`}>
              Upload File
            </button>
            <button onClick={() => setMode('link')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 border transition-colors ${mode === 'link' ? 'bg-yellow-800/40 border-yellow-700 text-yellow-500' : 'border-gray-700 text-gray-600 hover:text-gray-400'}`}>
              Paste Link
            </button>
          </div>

          {mode === 'upload' ? (
            <label className={`flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-700 hover:border-yellow-700 text-gray-500 hover:text-yellow-600 py-3 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
              <span className="text-xs font-bold uppercase tracking-wider">{uploading ? 'Uploading…' : `+ Upload ${label}`}</span>
              <input type="file" accept="application/pdf,image/*" disabled={uploading} className="hidden" onChange={handleUpload} />
            </label>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs outline-none focus:border-yellow-700 placeholder-gray-600"
              />
              <input
                type="text"
                value={linkName}
                onChange={e => setLinkName(e.target.value)}
                placeholder={`Label (optional — e.g. "${label} Report")`}
                className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs outline-none focus:border-yellow-700 placeholder-gray-600"
              />
              <button
                onClick={handleSaveLink}
                disabled={!linkUrl.trim() || savingLink}
                className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-wider py-1.5 transition-colors"
              >
                {savingLink ? 'Saving…' : 'Save Link'}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
    </div>
  );
}

// ── PAYMENT LINK (e.g. pay.bluevine.com) ─────────────────────────────────────
// Optional external payment link — admin pastes a Bluevine (or other) pay
// link here; it shows up as a "Pay Now" button on the customer invoice page,
// letting the customer pay without card-on-file / Stripe.
function PaymentLinkBox({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [editing, setEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const url = linkUrl.trim();
    if (!url) return;
    setSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line no-new
      new URL(url); // throws on garbage input before it ever hits the DB
      await patchJob(job.id, { payment_link: url });
      onUpdate({ ...job, paymentLink: url });
      setEditing(false);
      setLinkUrl('');
    } catch {
      setError('Enter a valid link (must start with https://)');
    }
    setSaving(false);
  }

  async function handleRemove() {
    await patchJob(job.id, { payment_link: null });
    onUpdate({ ...job, paymentLink: null });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 p-3">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">💳 Payment Link</p>
      {job.paymentLink && !editing ? (
        <div className="space-y-2">
          <a href={job.paymentLink} target="_blank" rel="noopener noreferrer" className="block text-indigo-400 hover:text-indigo-300 text-xs truncate underline">
            {job.paymentLink}
          </a>
          <p className="text-gray-600 text-[10px]">Shown to the customer as a "Pay Now" button on their invoice.</p>
          <div className="flex gap-3">
            <button onClick={() => { setLinkUrl(job.paymentLink || ''); setEditing(true); }} className="text-gray-500 hover:text-gray-300 text-[10px] font-bold uppercase tracking-wider transition-colors">
              Edit
            </button>
            <button onClick={handleRemove} className="text-gray-600 hover:text-red-500 text-[10px] font-bold uppercase tracking-wider transition-colors">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            type="text"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://pay.bluevine.com/…"
            className="w-full bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs outline-none focus:border-yellow-700 placeholder-gray-600"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSave}
              disabled={!linkUrl.trim() || saving}
              className="flex-1 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-wider py-1.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Link'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(false); setLinkUrl(''); setError(null); }}
                className="px-3 border border-gray-700 text-gray-400 text-[10px] font-bold uppercase tracking-wider hover:border-gray-500 transition-colors">
                Cancel
              </button>
            )}
          </div>
          <p className="text-gray-600 text-[10px]">Paste your pay.bluevine.com link for this customer.</p>
        </div>
      )}
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
    </div>
  );
}


// ── JOB DETAIL PANEL ──────────────────────────────────────────────────────────

const JOB_PIPELINE: JobStatus[] = ['BOOKED', 'ESTIMATE_SENT', 'SIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'];

function JobDetailPanel({ job: initialJob, onClose, onJobUpdate }: {
  job: Job;
  onClose: () => void;
  onJobUpdate: (j: Job) => void;
}) {
  const [job, setJob] = useState(initialJob);

  // JobsTab opens a job instantly with slim list data, then fetches the full
  // record (photos, line items, payments, inspection data) a beat later and
  // updates its `selected` state — which flows in here as a new `initialJob`.
  // Without this, that full data would arrive but never reach this panel or
  // any of its children, since useState only reads its initial value once.
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  const [tab, setTab] = useState<'overview' | 'estimate' | 'payment' | 'inspection'>('overview');
  const [editingAppt, setEditingAppt] = useState(false);
  const [apptSaving, setApptSaving] = useState(false);
  const [apptErr, setApptErr] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(job.date);
  const [editTime, setEditTime] = useState(job.time);
  const [editCustomTime, setEditCustomTime] = useState(false);
  const [editVehicle, setEditVehicle] = useState(job.vehicle || '');
  const [editPhone, setEditPhone] = useState(job.phone || '');
  const [editEmail, setEditEmail] = useState(job.email || '');
  const [editNotes, setEditNotes] = useState(job.notes || '');

  function startEditAppt() {
    setEditDate(job.date);
    setEditTime(job.time);
    setEditCustomTime(false);
    setEditVehicle(job.vehicle || '');
    setEditPhone(job.phone || '');
    setEditEmail(job.email || '');
    setEditNotes(job.notes || '');
    setApptErr(null);
    setEditingAppt(true);
  }

  async function saveAppt() {
    setApptSaving(true);
    setApptErr(null);
    try {
      await patchJob(job.id, {
        date: editDate, time: editTime, vehicle: editVehicle,
        phone: editPhone, email: editEmail, notes: editNotes,
      });
      handleUpdate({ ...job, date: editDate, time: editTime, vehicle: editVehicle, phone: editPhone, email: editEmail, notes: editNotes });
      setEditingAppt(false);
    } catch (e: any) {
      setApptErr(e.message ?? 'Save failed. Try again.');
    } finally {
      setApptSaving(false);
    }
  }

  function handleUpdate(updated: Job) {
    setJob(updated);
    onJobUpdate(updated);
  }

  async function setJobStatus(s: JobStatus) {
    await patchJob(job.id, { job_status: s });
    handleUpdate({ ...job, jobStatus: s });
  }

  const dateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  const statusIdx = JOB_PIPELINE.indexOf(job.jobStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="relative h-full w-full max-w-xl bg-gray-950 border-l border-gray-800 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <p className="text-red-500 text-xs font-bold uppercase tracking-widest mb-0.5">Job Detail</p>
            <h2 className="text-white font-black text-lg">{job.fname} {job.lname}</h2>
            <p className="text-gray-500 text-sm">{resolveServiceName(job.service, job.notes)} · {job.vehicle}</p>
            <p className="text-gray-600 text-xs mt-0.5">{dateStr} at {job.time}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-2xl leading-none mt-1 transition-colors">×</button>
        </div>

        {/* Pipeline stepper */}
        <div className="px-6 py-4 border-b border-gray-800 overflow-x-auto scrollbar-none" style={{scrollbarWidth:"none",msOverflowStyle:"none"}}>
          <div className="flex items-center gap-0 min-w-max">
            {JOB_PIPELINE.map((s, i) => {
              const cfg = STATUS_CONFIG[s];
              const done = i < statusIdx;
              const active = i === statusIdx;
              return (
                <div key={s} className="flex items-center">
                  <button
                    onClick={() => setJobStatus(s)}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                      active ? `${cfg.bg} ${cfg.color} border border-current` :
                      done ? 'text-gray-600 hover:text-gray-400' :
                      'text-gray-700 hover:text-gray-500'
                    }`}
                  >
                    {cfg.label}
                  </button>
                  {i < JOB_PIPELINE.length - 1 && <span className="text-gray-800 mx-1">›</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {(['overview', 'estimate', 'payment', 'inspection'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-bold uppercase tracking-widest px-5 py-3 transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-red-600 text-white' : 'border-transparent text-gray-600 hover:text-gray-300'
              }`}>
              {t === 'overview' ? '📋 Overview' : t === 'estimate' ? '📝 Estimate' : t === 'payment' ? '💳 Payment' : '🔍 Inspection'}
            </button>
          ))}
        </div>

        <div className="px-6 py-6">

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Pre/Post health scan documents — optional links shown on the customer invoice */}
              <div className="grid grid-cols-2 gap-3">
                <ScanUploadBox job={job} stage="pre" onUpdate={handleUpdate} />
                <ScanUploadBox job={job} stage="post" onUpdate={handleUpdate} />
              </div>

              {/* External payment link (e.g. pay.bluevine.com) — shown to the customer as a Pay Now button */}
              <PaymentLinkBox job={job} onUpdate={handleUpdate} />

              {/* Customer & Job info */}
              {!editingAppt ? (
                <div className="space-y-2">
                  {[
                    ['Service', resolveServiceName(job.service, job.notes)],
                    ['Date', `${dateStr} at ${job.time}`],
                    ['Phone', job.phone],
                    ['Email', job.email],
                    ['Vehicle', job.vehicle],
                    ['Customer Notes', job.notes || '—'],
                  ].map(([label, val]) => (
                    <div key={label} className="flex gap-4 border-b border-gray-800 py-2">
                      <span className="text-gray-600 text-xs font-bold uppercase tracking-wider w-32 flex-shrink-0 pt-0.5">{label}</span>
                      <span className="text-white text-sm">{val}</span>
                    </div>
                  ))}
                  <button onClick={startEditAppt}
                    className="w-full border border-gray-700 text-gray-400 hover:border-red-600 hover:text-white text-xs font-bold uppercase tracking-wider py-2.5 mt-2 transition-colors">
                    ✏️ Edit Appointment
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Date</label>
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                        className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider">Time</label>
                        <button type="button" onClick={() => setEditCustomTime(v => !v)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider">
                          {editCustomTime ? 'Use text' : 'Set exact time'}
                        </button>
                      </div>
                      {editCustomTime ? (
                        <input type="time" value={from12h(editTime)} onChange={e => setEditTime(to12h(e.target.value))}
                          className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                      ) : (
                        <input type="text" value={editTime} onChange={e => setEditTime(e.target.value)}
                          className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Vehicle</label>
                    <input type="text" value={editVehicle} onChange={e => setEditVehicle(e.target.value)} placeholder="Year Make Model Trim Engine"
                      className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Phone</label>
                      <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Email</label>
                      <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                        className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">Notes</label>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                      className="w-full bg-gray-900 text-white text-sm px-3 py-2 outline-none border border-gray-700 focus:border-red-600 transition-colors resize-none" />
                  </div>
                  {apptErr && <p className="text-red-400 text-xs">{apptErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveAppt} disabled={apptSaving}
                      className={`flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider py-2.5 transition-colors ${apptSaving ? 'opacity-50' : ''}`}>
                      {apptSaving ? 'Saving…' : '✓ Save Changes'}
                    </button>
                    <button onClick={() => { setEditingAppt(false); setApptErr(null); }}
                      className="flex-1 border border-gray-700 text-gray-400 text-xs font-bold uppercase tracking-wider py-2.5 hover:border-gray-500 transition-colors">
                      Cancel
                    </button>
                  </div>
                  <p className="text-yellow-600/70 text-[10px]">⚠️ Customer will not be auto-notified of changes — call or text them manually.</p>
                </div>
              )}

              {/* Signature info if signed */}
              {job.customerAgreed && (
                <SignedDocSection job={job} />
              )}

              {/* Payment summary if paid */}
              {job.jobStatus === 'PAID' && (
                <div className="bg-emerald-900/20 border border-emerald-800 p-4 space-y-1">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">✓ Paid</p>
                  <p className="text-white text-2xl font-black">${((job.invoiceAmount || 0) + (job.taxAmount || 0)).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs font-mono">{job.stripeTransactionId}</p>
                </div>
              )}

              {/* Quick status buttons */}
              <div>
                <p className="text-gray-600 text-xs font-bold uppercase tracking-widest mb-3">Quick Actions</p>
                <div className="flex flex-wrap gap-2">
                  {job.jobStatus === 'SIGNED' && (
                    <button onClick={() => setJobStatus('IN_PROGRESS')}
                      className="bg-orange-900/40 border border-orange-800 text-orange-400 text-xs font-bold uppercase tracking-wider px-3 py-2 hover:bg-orange-900/60 transition-colors">
                      → Start Job
                    </button>
                  )}
                  {job.jobStatus === 'IN_PROGRESS' && (
                    <button onClick={() => setJobStatus('COMPLETED')}
                      className="bg-green-900/40 border border-green-800 text-green-400 text-xs font-bold uppercase tracking-wider px-3 py-2 hover:bg-green-900/60 transition-colors">
                      ✓ Mark Complete
                    </button>
                  )}
                  {job.jobStatus === 'BOOKED' && (
                    <button onClick={() => setTab('estimate')}
                      className="bg-yellow-900/40 border border-yellow-800 text-yellow-400 text-xs font-bold uppercase tracking-wider px-3 py-2 hover:bg-yellow-900/60 transition-colors">
                      → Write Estimate
                    </button>
                  )}
                  {(job.jobStatus === 'COMPLETED' || job.jobStatus === 'INVOICED') && (
                    <button onClick={() => setTab('payment')}
                      className="bg-teal-900/40 border border-teal-800 text-teal-400 text-xs font-bold uppercase tracking-wider px-3 py-2 hover:bg-teal-900/60 transition-colors">
                      → Log Payment
                    </button>
                  )}
              {/* Delete job */}
              <button
                onClick={async () => {
                  if (!confirm(`Delete this job for ${job.fname} ${job.lname}? This cannot be undone.`)) return;
                  const res = await fetch('/admin-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: job.id }),
                  });
                  if (res.ok) {
                    onJobUpdate({ ...job, status: 'deleted' } as any);
                    onClose();
                  } else {
                    alert('Delete failed. Try again.');
                  }
                }}
                className="border border-red-900 text-red-700 hover:border-red-600 hover:text-red-400 text-xs font-bold uppercase tracking-wider px-3 py-2 transition-colors"
              >
                🗑 Delete Job
              </button>
                </div>
              </div>

              {/* Photos — inline in overview (same as Schedule) */}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">📷 Photos & Documentation</p>
                <PhotoPanel job={job} onUpdate={handleUpdate} />
                <div className="mt-4">
                  <AdminPhotoPanel
                    entityId={job.id}
                    onSave={async (id, photos) => { await patchJob(id, { admin_photos: JSON.stringify(photos) }); }}
                    initialPhotos={job.adminPhotos || []}
                    onPhotosChange={photos => handleUpdate({ ...job, adminPhotos: photos })}
                  />
                </div>
              </div>

              {/* Parts cost, receipts, and net profit calculator — admin only */}
              <PartsCostPanel job={job} onUpdate={handleUpdate} />

              {/* Videos — shown to customer on the invoice page */}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">🎥 Videos</p>
                <VideoPanel job={job} onUpdate={handleUpdate} />
              </div>
            </div>
          )}

          {/* ESTIMATE TAB */}
          {tab === 'estimate' && <EstimatePanel job={job} onUpdate={handleUpdate} />}

          {/* PAYMENT TAB */}
          {tab === 'payment' && <PaymentPanel job={job} onUpdate={handleUpdate} onRequote={() => setTab('estimate')} />}



          {/* INSPECTION TAB */}
          {tab === 'inspection' && <InspectionPanel job={job} onUpdate={handleUpdate} />}
        </div>
      </div>
    </div>
  );
}

// ── JOBS TAB (pipeline board) ─────────────────────────────────────────────────


// ── ADD JOB MODAL ────────────────────────────────────────────────────────────
const ADD_JOB_SERVICES = [
  { id: 'oil',        label: 'Oil Change' },
  { id: 'brakes',     label: 'Brakes' },
  { id: 'diag',       label: 'Diagnostics' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'audio',      label: 'Car Audio' },
  { id: 'full',       label: 'Full Service' },
  { id: 'other',      label: 'Other / Custom' },
];
const SERVICE_ICONS: Record<string, string> = {
  oil: '🛢️', brakes: '🔧', diag: '💻', suspension: '🚗',
  audio: '🔊', full: '✅', other: '💬',
};

// ── EXTERNAL LEAD → INSTANT ESTIMATE LINK ───────────────────────────────────
// Standalone path for customers who didn't book through the site (Yelp, Nextdoor,
// word of mouth, etc). Creates a job with no date/time requirement, then surfaces
// the estimate link immediately so it can be copied straight into a text or DM.
// Does not touch AddJobModal or the normal booking pipeline.
function ExternalLeadModal({ onClose, onAdded }: { onClose: () => void; onAdded: (job: Job) => void }) {
  // Step 1: contact + vehicle. Step 2: line item builder (same math as EstimatePanel).
  // Step 3: done — copy link or send straight to an email of your choosing.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [createdJob, setCreatedJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paidMethod, setPaidMethod] = useState('Cash');
  const [paidRef, setPaidRef] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [docType, setDocType] = useState<'estimate' | 'invoice'>('invoice');

  const [f, setF] = useState({
    fname: '', lname: '', phone: '', email: '',
    vehicle: '', service: 'other', notes: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: `li-${Date.now()}`, label: 'Mobile Service Fee', amount: 25, type: 'mobile' },
  ]);
  const [rawAmounts, setRawAmounts] = useState<Record<string, string>>({});

  function set(k: string, v: string) { setF(p => ({ ...p, [k]: v })); setFieldErr(p => ({ ...p, [k]: '' })); }

  function addLine() {
    setLineItems(prev => [...prev, { id: `li-${Date.now()}-${prev.length}`, label: '', amount: 0, type: 'parts' }]);
  }
  function updateLine(id: string, field: 'label' | 'amount' | 'type', value: string) {
    setLineItems(prev => prev.map(li => li.id === id
      ? { ...li, [field]: field === 'amount' ? (parseFloat(value) || 0) : value }
      : li
    ));
  }
  function removeLine(id: string) {
    setLineItems(prev => prev.filter(li => li.id !== id));
    setRawAmounts(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0);
  const tax = taxFromItems(lineItems);
  const total = subtotal + tax;

  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!f.fname)   errs.fname   = 'Required';
    if (!f.phone)   errs.phone   = 'Required';
    if (!f.vehicle) errs.vehicle = 'Required';
    setFieldErr(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate() {
    setSaving(true);
    setErr(null);
    const id = `GID-${Date.now()}`;
    const now = new Date();
    const isEstimate = docType === 'estimate';
    const notesStr = f.notes ? `[External lead] ${f.notes}` : '[External lead]';
    const row: Record<string, any> = {
      id,
      service: f.service,
      service_icon: SERVICE_ICONS[f.service] ?? '🔧',
      date: now.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }), // Phoenix is UTC-7 year-round; raw UTC date rolls over 7hrs early
      time: 'TBD',
      fname: f.fname,
      lname: f.lname,
      phone: f.phone,
      email: f.email,
      vehicle: f.vehicle,
      notes: notesStr,
      garage_notes: '',
      status: 'confirmed',
      job_status: isEstimate ? 'ESTIMATE_SENT' : 'INVOICED',
      created_at: now.toISOString(),
      line_items: JSON.stringify(lineItems),
      tax_amount: tax,
    };
    if (isEstimate) {
      row.estimate_amount = subtotal;
      row.estimate_notes = notesStr;
    } else {
      row.invoice_amount = subtotal;
    }
    try {
      const inserted = await adminPost('insert-booking', { row });
      const job = mapJob(inserted ?? row);
      setCreatedJob(job);
      setSendTo(f.email || '');
      onAdded(job);
      setStep(3);
    } catch (e: any) {
      setErr(e.message ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const docUrl = createdJob ? `https://gidgarage.com/${docType === 'estimate' ? 'estimate' : 'invoice'}?id=${createdJob.id}` : '';

  function copyLink() {
    navigator.clipboard.writeText(docUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleMarkPaid() {
    if (!createdJob) return;
    setMarkingPaid(true);
    setErr(null);
    const paidAt = new Date().toISOString();
    const ref = paidRef.trim() ? `${paidMethod} — ${paidRef.trim()}` : paidMethod;
    try {
      await adminPost('patch-booking', {
        id: createdJob.id,
        fields: {
          stripe_transaction_id: ref,
          paid_at: paidAt,
          job_status: 'PAID',
          status: 'completed',
        },
      });
      setCreatedJob({ ...createdJob, stripeTransactionId: ref, paidAt, jobStatus: 'PAID' as JobStatus, status: 'completed' });
      setIsPaid(true);
    } catch (e: any) {
      setErr(e.message ?? 'Could not mark as paid. Try again.');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleSendEmail() {
    if (!createdJob || !sendTo) return;
    setSending(true);
    try {
      const job = { ...createdJob, email: sendTo };
      if (docType === 'estimate') {
        await adminPost('send-estimate', { job, shopAvg: 0 });
      } else {
        const action = isPaid ? 'send-receipt' : 'send-invoice';
        await adminPost(action, { job });
      }
      setSentOk(true);
    } catch (e: any) {
      setErr(e.message ?? 'Send failed. Try again.');
    } finally {
      setSending(false);
    }
  }

  const inp = (k: string, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${fieldErr[k] ? 'text-red-500' : 'text-gray-500'}`}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={(f as any)[k]}
        onChange={e => set(k, e.target.value)}
        className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border transition-colors ${fieldErr[k] ? 'border-red-500' : 'border-gray-700 focus:border-red-600'}`}
      />
      {fieldErr[k] && <p className="text-red-500 text-[10px] mt-0.5">{fieldErr[k]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0f0f0f] border border-gray-800 w-full max-w-lg p-7 relative overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">✕</button>
        <div className="w-8 h-1 bg-indigo-500 mb-4" />

        {/* STEP 1 — contact + vehicle */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-black text-white mb-1">External Lead</h2>
            <p className="text-gray-500 text-xs mb-5">Yelp, Nextdoor, word of mouth — anyone who didn't book through the site. No appointment time needed yet.</p>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setDocType('estimate')}
                className={`flex-1 text-xs font-bold uppercase tracking-widest py-2.5 border transition-colors ${docType === 'estimate' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
              >
                Estimate
              </button>
              <button
                type="button"
                onClick={() => setDocType('invoice')}
                className={`flex-1 text-xs font-bold uppercase tracking-widest py-2.5 border transition-colors ${docType === 'invoice' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
              >
                Invoice
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {inp('fname', 'First Name *', 'text', 'John')}
                {inp('lname', 'Last Name', 'text', 'Smith')}
                {inp('phone', 'Phone *', 'tel', '480-555-0100')}
                {inp('email', 'Email (optional)', 'email', 'customer@email.com')}
              </div>

              {inp('vehicle', 'Vehicle * (Year Make Model Trim)', 'text', '2019 Toyota Camry LE')}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">Service</label>
                <select
                  value={f.service}
                  onChange={e => set('service', e.target.value)}
                  className="w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border border-gray-700 focus:border-red-600 transition-colors"
                >
                  {ADD_JOB_SERVICES.map(sv => (
                    <option key={sv.id} value={sv.id}>{sv.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">Notes</label>
                <textarea
                  value={f.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="What they need, where you found them, anything useful"
                  rows={2}
                  className="w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border border-gray-700 focus:border-red-600 transition-colors resize-none"
                />
              </div>

              <button
                onClick={() => { if (validateStep1()) setStep(2); }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors mt-2"
              >
                Next — Build {docType === 'estimate' ? 'Estimate' : 'Invoice'} →
              </button>
            </div>
          </>
        )}

        {/* STEP 2 — line items, same math as EstimatePanel */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-black text-white mb-1">Build {docType === 'estimate' ? 'Estimate' : 'Invoice'}</h2>
            <p className="text-gray-500 text-xs mb-5">{f.fname} {f.lname} · {f.vehicle}</p>

            <div className="space-y-2 mb-3">
              {lineItems.map(item => (
                <div key={item.id} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateLine(item.id, 'label', e.target.value)}
                    placeholder="Description"
                    className="flex-1 bg-gray-900 border border-gray-700 text-white text-sm px-2.5 py-2 outline-none focus:border-red-600"
                  />
                  <div className="relative w-28 flex-shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rawAmounts[item.id] ?? (item.amount === 0 ? '' : String(item.amount))}
                      onChange={e => {
                        if (/^-?[0-9]*\.?[0-9]*$/.test(e.target.value)) {
                          setRawAmounts(prev => ({ ...prev, [item.id]: e.target.value }));
                        }
                      }}
                      onBlur={e => {
                        if (e.target.value === '') {
                          setRawAmounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                          return;
                        }
                        const n = parseFloat(e.target.value) || 0;
                        updateLine(item.id, 'amount', String(n));
                        setRawAmounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                      }}
                      placeholder="0.00"
                      className="w-full bg-gray-900 border border-gray-700 text-white text-sm pl-5 pr-2 py-2 outline-none focus:border-red-600"
                    />
                  </div>
                  <select
                    value={item.type}
                    onChange={e => updateLine(item.id, 'type', e.target.value)}
                    className="bg-gray-900 border border-gray-700 text-gray-400 text-xs px-1.5 py-2 outline-none focus:border-red-600 flex-shrink-0"
                  >
                    <option value="mobile">Mobile</option>
                    <option value="labor">Labor</option>
                    <option value="parts">Parts</option>
                    <option value="fixed">Fixed</option>
                    <option value="discount">Discount</option>
                    <option value="other">Other</option>
                  </select>
                  <button onClick={() => removeLine(item.id)} className="text-gray-700 hover:text-red-500 text-sm transition-colors w-5 flex-shrink-0 pt-2">×</button>
                </div>
              ))}
            </div>

            <button onClick={addLine} className="text-xs text-gray-500 hover:text-white transition-colors mb-4">+ Add Line</button>

            <div className="border-t border-gray-800 pt-3 space-y-1 mb-5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>AZ TPT ({taxRatePercentLabel()}%)</span>
                <span className="font-mono">${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1">
                <span>Total</span>
                <span className="font-mono">${total.toFixed(2)}</span>
              </div>
            </div>

            {err && <p className="text-red-500 text-xs mb-3">{err}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-shrink-0 border border-gray-700 hover:border-red-600 text-white text-xs font-bold uppercase tracking-widest px-4 py-3 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || lineItems.length === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors"
              >
                {saving ? 'Creating…' : `Create ${docType === 'estimate' ? 'Estimate' : 'Invoice'}`}
              </button>
            </div>
          </>
        )}

        {/* STEP 3 — done — mark paid, copy, or send */}
        {step === 3 && createdJob && (
          <>
            <h2 className="text-xl font-black text-white mb-1">{isPaid ? '✓ Paid' : docType === 'estimate' ? '✓ Estimate Ready' : '✓ Invoice Ready'}</h2>
            <p className="text-gray-500 text-xs mb-5">{createdJob.fname} {createdJob.lname} · {createdJob.vehicle} · ${total.toFixed(2)}</p>

            {docType === 'invoice' && !isPaid && (
              <div className="bg-gray-900 border border-gray-700 p-4 mb-5">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Already paid in person?</p>
                <div className="flex gap-2 mb-2">
                  <select
                    value={paidMethod}
                    onChange={e => setPaidMethod(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white text-sm px-2.5 py-2 outline-none focus:border-emerald-600 flex-shrink-0"
                  >
                    <option>Cash</option>
                    <option>Check</option>
                    <option>Zelle</option>
                    <option>Venmo</option>
                    <option>CashApp</option>
                    <option>Card (manual)</option>
                    <option>Other</option>
                  </select>
                  <input
                    type="text"
                    value={paidRef}
                    onChange={e => setPaidRef(e.target.value)}
                    placeholder="Reference / check # (optional)"
                    className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </div>
                <button
                  onClick={handleMarkPaid}
                  disabled={markingPaid}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-widest py-2.5 transition-colors"
                >
                  {markingPaid ? 'Marking Paid…' : 'Mark as Paid'}
                </button>
              </div>
            )}

            {isPaid && (
              <div className="bg-emerald-950/40 border border-emerald-800 p-3 mb-5">
                <p className="text-emerald-400 text-xs font-bold">✓ Marked paid — {createdJob.stripeTransactionId}</p>
                <p className="text-gray-500 text-[10px] mt-1">Sending now sends a receipt instead of an open invoice.</p>
              </div>
            )}

            <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">{isPaid ? 'Receipt' : docType === 'estimate' ? 'Estimate' : 'Invoice'} Link</label>
            <div className="flex gap-2 mb-5">
              <input
                readOnly
                value={docUrl}
                onClick={e => (e.target as HTMLInputElement).select()}
                className="flex-1 bg-gray-900 border border-gray-700 text-gray-300 text-xs px-3 py-2.5 outline-none font-mono"
              />
              <button
                onClick={copyLink}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors flex-shrink-0 ${copied ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">Or send it to an email</label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={sendTo}
                onChange={e => { setSendTo(e.target.value); setSentOk(false); }}
                placeholder="customer@email.com"
                className="flex-1 bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600"
              />
              <button
                onClick={handleSendEmail}
                disabled={sending || !sendTo}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors flex-shrink-0 disabled:opacity-50 ${sentOk ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {sending ? 'Sending…' : sentOk ? '✓ Sent' : 'Send'}
              </button>
            </div>
            {err && <p className="text-red-500 text-xs mb-3">{err}</p>}

            <button
              onClick={onClose}
              className="w-full border border-gray-700 hover:border-red-600 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors mt-4"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AddJobModal({ onClose, onAdded }: { onClose: () => void; onAdded: (job: Job) => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [f, setF] = useState({
    fname: '', lname: '', phone: '', email: '',
    vehicle: '', service: 'other', date: '', time: '', notes: '',
  });

  function set(k: string, v: string) { setF(p => ({ ...p, [k]: v })); setFieldErr(p => ({ ...p, [k]: '' })); }

  // Convert "14:30" → "2:30 PM" to match booking time slot format
  function to12h(t: string): string {
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr ?? '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${period}`;
  }

  async function handleSave() {
    const errs: Record<string, string> = {};
    if (!f.fname)    errs.fname   = 'Required';
    if (!f.phone)    errs.phone   = 'Required';
    if (!f.vehicle)  errs.vehicle = 'Required';
    if (!f.service)  errs.service = 'Required';
    if (!f.date)     errs.date    = 'Required';
    if (!f.time)     errs.time    = 'Required';
    if (Object.keys(errs).length) { setFieldErr(errs); return; }

    setSaving(true);
    setErr(null);
    const id = `GID-${Date.now()}`;
    const formattedTime = to12h(f.time);
    const row = {
      id,
      service: f.service,
      service_icon: SERVICE_ICONS[f.service] ?? '🔧',
      date: f.date,
      time: formattedTime,
      fname: f.fname,
      lname: f.lname,
      phone: f.phone,
      email: f.email,
      vehicle: f.vehicle,
      notes: f.notes,
      garage_notes: '',
      status: 'confirmed',
      job_status: 'BOOKED',
      created_at: new Date().toISOString(),
    };
    try {
      const inserted = await adminPost('insert-booking', { row });
      onAdded(mapJob(inserted ?? row));
      onClose();
    } catch (e: any) {
      setErr(e.message ?? 'Save failed. Try again.');
      setSaving(false);
    }
  }

  const inp = (k: string, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${fieldErr[k] ? 'text-red-500' : 'text-gray-500'}`}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={(f as any)[k]}
        onChange={e => set(k, e.target.value)}
        className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border transition-colors ${fieldErr[k] ? 'border-red-500' : 'border-gray-700 focus:border-red-600'}`}
      />
      {fieldErr[k] && <p className="text-red-500 text-[10px] mt-0.5">{fieldErr[k]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0f0f0f] border border-gray-800 w-full max-w-lg p-7 relative overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 border border-gray-700 text-gray-500 hover:border-red-600 hover:text-white flex items-center justify-center transition-colors">✕</button>
        <div className="w-8 h-1 bg-red-600 mb-4" />
        <h2 className="text-xl font-black text-white mb-5">Add Job to Calendar</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {inp('fname', 'First Name *', 'text', 'John')}
            {inp('lname', 'Last Name', 'text', 'Smith')}
            {inp('phone', 'Phone *', 'tel', '480-555-0100')}
            {inp('email', 'Email', 'email', 'customer@email.com')}
          </div>

          {inp('vehicle', 'Vehicle * (Year Make Model Trim)', 'text', '2019 Toyota Camry LE')}

          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${fieldErr.service ? 'text-red-500' : 'text-gray-500'}`}>Service *</label>
            <select
              value={f.service}
              onChange={e => set('service', e.target.value)}
              className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border transition-colors ${fieldErr.service ? 'border-red-500' : 'border-gray-700 focus:border-red-600'}`}
            >
              {ADD_JOB_SERVICES.map(sv => (
                <option key={sv.id} value={sv.id}>{sv.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${fieldErr.date ? 'text-red-500' : 'text-gray-500'}`}>Date *</label>
              <input
                type="date"
                value={f.date}
                onChange={e => set('date', e.target.value)}
                className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border transition-colors ${fieldErr.date ? 'border-red-500' : 'border-gray-700 focus:border-red-600'}`}
              />
              {fieldErr.date && <p className="text-red-500 text-[10px] mt-0.5">{fieldErr.date}</p>}
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${fieldErr.time ? 'text-red-500' : 'text-gray-500'}`}>Time *</label>
              <input
                type="time"
                value={f.time}
                onChange={e => set('time', e.target.value)}
                className={`w-full bg-gray-900 text-white text-sm px-3 py-2.5 outline-none border transition-colors ${fieldErr.time ? 'border-red-500' : 'border-gray-700 focus:border-red-600'}`}
              />
              {fieldErr.time && <p className="text-red-500 text-[10px] mt-0.5">{fieldErr.time}</p>}
            </div>
          </div>

          <div>
            <label className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Notes / Problem Description</label>
            <textarea
              value={f.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Customer complaint, symptoms, special instructions..."
              className="w-full bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 transition-colors resize-y"
            />
          </div>

          {err && <div className="bg-red-950/50 border border-red-700 text-red-400 text-sm px-4 py-3">{err}</div>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-700 text-gray-400 hover:border-gray-500 text-xs font-bold uppercase tracking-widest py-3 transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {saving ? 'Saving…' : 'Add Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const JOBS_CACHE_KEY = 'gid_jobs_cache_v1';

export function JobsTab() {
  useGlobalErrorReporting({ page: 'admin-jobs' });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'ALL'>('ALL');
  const [showAddJob, setShowAddJob] = useState(false);
  const [showExternalLead, setShowExternalLead] = useState(false);
  const [revenueView, setRevenueView] = useState<'month' | 'year'>('month');
  const [netProfitView, setNetProfitView] = useState<'month' | 'year'>('month');

  const seenEventIds = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem('seenPaymentEventIds') ?? '[]'))
  );

  // Load the saved AZ TPT rate once per admin session — falls back to the
  // built-in default if the settings row doesn't exist yet or the fetch fails.
  useEffect(() => {
    adminPost('get-tax-rate')
      .then((data: any) => { if (data?.taxRate) setTaxRate(Number(data.taxRate)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Paint instantly from whatever was loaded last time — Supabase's free
    // tier can take several seconds to wake from idle, and that wait was
    // happening on every single admin open. Showing cached data immediately
    // (then quietly refreshing) means that cold-start tax only ever shows up
    // as a brief "Updating…" tag instead of a blank loading screen.
    let hadCache = false;
    try {
      const cached = localStorage.getItem(JOBS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Job[];
        if (Array.isArray(parsed) && parsed.length) {
          setJobs(parsed);
          setLoading(false);
          hadCache = true;
        }
      }
    } catch { /* corrupt cache — ignore and fall through to a normal load */ }

    if (hadCache) setRefreshing(true);
    getAllJobs()
      .then(data => {
        setJobs(data);
        setLoadError(null);
        setLoading(false);
        setRefreshing(false);
        try { localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(data)); } catch { /* storage full/unavailable — non-critical */ }
      })
      .catch(err => {
        console.error('Failed to load jobs:', err);
        setRefreshing(false);
        if (!hadCache) {
          setLoadError('Could not load jobs. The admin data service (/admin-api) may be unreachable — check Cloudflare Access covers /admin-api and SUPABASE_SERVICE_KEY is set.');
          setLoading(false);
        }
        // If we had cache, just keep showing it silently rather than erroring out a working screen.
      });

    // Poll jobs every 30s — was 10s but the extra worker hop made it noticeably heavy
    const jobsInterval = setInterval(async () => {
      let fresh: Job[];
      try {
        fresh = await getAllJobs();
        setLoadError(null);
        try { localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(fresh)); } catch { /* non-critical */ }
      } catch (err) {
        console.error('Job refresh failed:', err);
        return;
      }
      setJobs(fresh);
      setSelected(prev => {
        if (!prev) return null;
        const slimMatch = fresh.find(j => j.id === prev.id);
        if (!slimMatch) return prev; // e.g. filtered out by status change elsewhere — keep showing what we have
        // list-bookings returns most list-view columns, including payments
        // (small JSON, worth the cost — Revenue This Month needs it). The
        // genuinely heavy fields still aren't in there, so carry those forward
        // from the already-loaded full record instead of wiping them.
        return {
          ...slimMatch,
          jobPhotos: prev.jobPhotos,
          jobVideos: prev.jobVideos,
          adminPhotos: prev.adminPhotos,
          lineItems: prev.lineItems,
          inspectionData: prev.inspectionData,
          estimateNotes: prev.estimateNotes,
          preExistingDamage: prev.preExistingDamage,
          customerSignature: prev.customerSignature,
          adjustmentReason: prev.adjustmentReason,
        };
      });
    }, 30000);

    // Payment event notifications on a separate 60s interval — decoupled from job refresh
    const eventsInterval = setInterval(async () => {
      if (Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
      try {
        const events = await adminPost('list-payment-events', { limit: 20 });
        if (!events?.length) return;
        const reg = await navigator.serviceWorker.ready;
        const currentJobs = await getAllJobs().catch(() => [] as Job[]);
        for (const ev of events) {
          if (seenEventIds.current.has(ev.id)) continue;
          seenEventIds.current.add(ev.id);
          localStorage.setItem('seenPaymentEventIds', JSON.stringify([...seenEventIds.current].slice(-100)));
          const job = currentJobs.find((j: Job) => j.id === ev.booking_id);
          const name = job ? `${job.fname} ${job.lname}` : 'Unknown customer';
          if (ev.event_type === 'paid') {
            reg.showNotification(`💳 Payment received — ${name}`, {
              body: `$${Number(ev.amount).toFixed(2)} collected · ${job?.vehicle ?? ''}`.trim().replace(/· $/, ''),
              icon: '/favicon-192.png',
              tag: `paid-${ev.id}`,
              data: { url: '/bookings' },
            });
          } else if (ev.event_type === 'declined') {
            reg.showNotification(`⚠️ Payment declined — ${name}`, {
              body: ev.error_message ?? `$${Number(ev.amount).toFixed(2)} failed`,
              icon: '/favicon-192.png',
              tag: `declined-${ev.id}`,
              data: { url: '/bookings' },
            });
          } else if (ev.event_type === 'signed') {
            reg.showNotification(`✅ Estimate signed — ${name}`, {
              body: `$${Number(ev.amount).toFixed(2)} · ${job?.vehicle ?? ''}`.trim().replace(/· $/, ''),
              icon: '/favicon-192.png',
              tag: `signed-${ev.id}`,
              data: { url: '/bookings' },
            });
          }
        }
      } catch { /* non-critical */ }
    }, 60000);

    return () => { clearInterval(jobsInterval); clearInterval(eventsInterval); };
  }, []);

  function handleJobUpdate(updated: Job) {
    if ((updated as any).status === 'deleted') {
      setJobs(prev => prev.filter(j => j.id !== updated.id));
      setSelected(null);
      return;
    }
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setSelected(updated);
  }

  // list-bookings now returns only list-view columns (for load-time speed),
  // so opening a job needs its full row — photos, line items, payments,
  // inspection data, etc. Open instantly with what we already have, then
  // fill in the rest as soon as it loads.
  async function openJob(job: Job) {
    setSelected(job);
    try {
      const full = await getJobById(job.id);
      if (full) setSelected(prev => prev?.id === job.id ? full : prev);
    } catch { /* keep showing the slim version if this fails */ }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });

  // Stats
  const unpaid = jobs.filter(j => j.jobStatus === 'COMPLETED' || j.jobStatus === 'INVOICED').length;
  const awaitingSign = jobs.filter(j => j.jobStatus === 'ESTIMATE_SENT').length;
  const now = new Date();
  const isThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const isThisYear = (iso: string) => new Date(iso).getFullYear() === now.getFullYear();
  const paidThisMonth = jobs.filter(j => j.jobStatus === 'PAID' && j.paidAt && isThisMonth(j.paidAt));
  // Revenue collected in a given window — two payment paths don't overlap:
  // (1) a single full Stripe charge never gets logged into job.payments, so for
  //     those count the job's total when its paidAt falls in the window;
  // (2) anything recorded via "Record a Payment" (manual/partial — cash, Zelle,
  //     a card charge that only covered part of the balance, etc.) lives in
  //     job.payments regardless of whether the job has reached PAID yet, so sum
  //     whichever individual entries landed in the window instead of gating on
  //     job-level status.
  // Don't trust payments[] alone: a Stripe idempotent-retry can close a job
  // (jobStatus PAID, paidAt set) without ever appending its closing entry to
  // payments — logged entries would then under-report what's actually owed.
  // If logged payments don't add up to the invoice total, fall back to
  // paidAt/invoiceTotal for this job instead of just what's logged.
  const revenueFor = (inWindow: (iso: string) => boolean) => jobs.reduce((sum, j) => {
    const loggedInWindow = (j.payments || []).filter(p => inWindow(p.at)).reduce((s, p) => s + p.amount, 0);
    const loggedTotal = (j.payments || []).reduce((s, p) => s + p.amount, 0);
    const invoiceTotal = (j.invoiceAmount || 0) + (j.taxAmount || 0);
    if (j.jobStatus === 'PAID' && j.paidAt && inWindow(j.paidAt) && loggedTotal < invoiceTotal - 0.01) {
      return sum + invoiceTotal;
    }
    return sum + loggedInWindow;
  }, 0);
  const monthRevenue = revenueFor(isThisMonth);
  const yearRevenue = revenueFor(isThisYear);
  // Net profit = revenue collected minus parts cost, attributed to the job's
  // close-out date (paidAt) — parts cost is a lump sum per job, not something
  // that splits across payment entries the way revenue can.
  const netProfitFor = (inWindow: (iso: string) => boolean) => jobs.reduce((sum, j) => {
    if (j.jobStatus !== 'PAID' || !j.paidAt || !inWindow(j.paidAt)) return sum;
    const paid = j.amountPaid ?? ((j.invoiceAmount || 0) + (j.taxAmount || 0));
    return sum + (paid - (j.partsCost || 0));
  }, 0);
  const monthNetProfit = netProfitFor(isThisMonth);
  const yearNetProfit = netProfitFor(isThisYear);

  const JOB_STATUS_ORDER: Record<string, number> = {
    BOOKED: 0, ESTIMATE_SENT: 1, SIGNED: 2, IN_PROGRESS: 3,
    COMPLETED: 4, INVOICED: 5, PAID: 6, CANCELLED: 7,
  };
  const filtered = jobs
    .filter(j => {
      const matchStatus = filterStatus === 'ALL' || j.jobStatus === filterStatus;
      const matchSearch = !search || `${j.fname} ${j.lname} ${j.vehicle} ${j.phone} ${j.stripeTransactionId || ''}`.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    })
    .sort((a, b) => {
      const statusDiff = (JOB_STATUS_ORDER[a.jobStatus] ?? 0) - (JOB_STATUS_ORDER[b.jobStatus] ?? 0);
      if (statusDiff !== 0) return statusDiff;
      return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
    });

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          ['Unpaid / Due', unpaid, 'text-yellow-400'],
          ['Awaiting Signature', awaitingSign, 'text-purple-400'],
          ['Jobs This Month', paidThisMonth.length, 'text-green-400'],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
            <div className={`text-2xl font-black ${cls} mb-1`}>{val}</div>
            <div className="text-gray-600 text-xs font-bold uppercase tracking-wider">{label}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRevenueView(v => v === 'month' ? 'year' : 'month')}
          className="bg-gray-900 border border-gray-800 p-5 text-left hover:border-emerald-800 active:bg-gray-800 transition-colors"
          title="Tap to toggle Month / Year"
        >
          <div className="text-2xl font-black text-emerald-400 mb-1">
            ${(revenueView === 'month' ? monthRevenue : yearRevenue).toFixed(2)}
          </div>
          <div className="text-gray-600 text-xs font-bold uppercase tracking-wider">
            {revenueView === 'month' ? 'Revenue This Month' : `${now.getFullYear()} Revenue`}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setNetProfitView(v => v === 'month' ? 'year' : 'month')}
          className="bg-gray-900 border border-gray-800 p-5 text-left hover:border-cyan-800 active:bg-gray-800 transition-colors"
          title="Tap to toggle Month / Year"
        >
          <div className={`text-2xl font-black mb-1 ${(netProfitView === 'month' ? monthNetProfit : yearNetProfit) >= 0 ? 'text-cyan-400' : 'text-red-500'}`}>
            ${(netProfitView === 'month' ? monthNetProfit : yearNetProfit).toFixed(2)}
          </div>
          <div className="text-gray-600 text-xs font-bold uppercase tracking-wider">
            {netProfitView === 'month' ? 'Net Profit This Month' : `${now.getFullYear()} Net Profit`}
          </div>
        </button>
      </div>

      {/* Filters + Add Job */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, vehicle, phone…"
          className="bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm focus:border-red-600 outline-none flex-1 min-w-48"
        />
        {refreshing && (
          <span className="text-gray-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-600 animate-pulse" /> Updating…
          </span>
        )}
        <button
          onClick={() => setShowAddJob(true)}
          className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <span className="text-base leading-none">+</span> Add Job
        </button>
        <button
          onClick={() => setShowExternalLead(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <span className="text-base leading-none">🔗</span> External Lead
        </button>
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', ...JOB_PIPELINE] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                filterStatus === s ? 'bg-red-600 border-red-600 text-white' : 'border-gray-700 text-gray-500 hover:border-red-600 hover:text-white'
              }`}>
              {s === 'ALL' ? 'All' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-gray-600 font-bold uppercase tracking-wider text-sm">Loading jobs…</div>}

      {!loading && loadError && (
        <div className="text-center py-16 px-6 text-red-400 text-sm">{loadError}</div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-700 font-bold uppercase tracking-wider text-sm">No jobs found</div>
      )}

      {/* Job list */}
      <div className="space-y-2">
        {filtered.map(job => {
          const dateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const isOverdue = job.date < today && job.jobStatus !== 'PAID' && job.jobStatus !== 'CANCELLED';
          return (
            <button
              key={job.id}
              onClick={() => openJob(job)}
              className={`w-full text-left bg-gray-900 border p-4 flex items-center justify-between gap-4 hover:border-red-600/50 transition-all ${
                isOverdue ? 'border-yellow-900/50' : 'border-gray-800'
              }`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <div className="text-white font-bold text-sm">{job.fname} {job.lname}</div>
                  <div className="text-gray-500 text-xs">{job.vehicle}</div>
                </div>
                <div className="hidden sm:block text-gray-600 text-xs">
                  <div>{resolveServiceName(job.service, job.notes)}</div>
                  <div>{dateStr} · {job.time}</div>
                </div>
                {job.estimateAmount && (
                  <div className="hidden md:block text-gray-500 text-sm font-mono">
                    ${job.estimateAmount.toFixed(2)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {job.service === 'other' && <span className="text-purple-400 text-[10px] font-bold uppercase bg-purple-900/30 px-2 py-0.5">Inquiry</span>}
                {isOverdue && <span className="text-yellow-600 text-[10px] font-bold uppercase">Overdue</span>}
                <StatusBadge status={job.jobStatus} />
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <JobDetailPanel
          job={selected}
          onClose={() => setSelected(null)}
          onJobUpdate={handleJobUpdate}
        />
      )}

      {showAddJob && (
        <AddJobModal
          onClose={() => setShowAddJob(false)}
          onAdded={job => { setJobs(prev => [job, ...prev]); setSelected(job); }}
        />
      )}
      {showExternalLead && (
        <ExternalLeadModal
          onClose={() => setShowExternalLead(false)}
          onAdded={job => { setJobs(prev => [job, ...prev]); }}
        />
      )}
    </div>
  );
}

// ── INVOICE / RECEIPT PAGE (customer-facing) ──────────────────────────────────

// ── SELF-SERVE PAYMENT FORM (invoice page, post-decline) ─────────────────────

function SelfPayForm({ job, onPaid }: { job: Job; onPaid: (updated: Job) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [card, setCard] = useState<any>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const amount = job.invoiceAmount ?? job.estimateAmount ?? 0;
  const amountPaidSoFar = job.amountPaid || 0;
  // Must match what InvoicePage shows as "Total Due" exactly — that figure
  // uses job.taxAmount (tax on taxable line items only, e.g. excluding the
  // Mobile Service Fee), NOT a flat rate on the whole subtotal. calcTax/
  // calcTotal apply the rate to everything, which overcharges whenever any
  // line item is tax-exempt — that mismatch is exactly what showed up as
  // "Total Due $303.91" vs. "Pay $306.26" on the same invoice.
  const actualTax = job.taxAmount ?? (job.lineItems?.length ? taxFromItems(job.lineItems) : calcTax(amount));
  const totalDue = Math.round((amount + actualTax) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((totalDue - amountPaidSoFar) * 100) / 100);

  useEffect(() => {
    if (!STRIPE_PK) return;
    loadStripe(STRIPE_PK).then(setStripe);
  }, []);

  useEffect(() => {
    if (!stripe || !mountRef.current) return;
    const elements = stripe.elements({
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#dc2626',
          colorBackground: '#111827',
          colorText: '#ffffff',
          colorDanger: '#ef4444',
          borderRadius: '0px',
        },
      },
    });
    const cardEl = elements.create('card', {
      style: {
        base: { fontSize: '14px', color: '#fff', '::placeholder': { color: '#6b7280' } },
        invalid: { color: '#ef4444' },
      },
    });
    cardEl.mount(mountRef.current);
    cardEl.on('change', (e: any) => {
      setCardError(e.error?.message ?? null);
      setCardComplete(e.complete);
    });
    setCard(cardEl);
    return () => cardEl.destroy();
  }, [stripe]);

  async function handlePay() {
    if (!stripe || !card || !cardComplete) return;
    setPaying(true);
    setCardError(null);
    try {
      // Tokenize new card
      const { token, error } = await stripe.createToken(card, { name: `${job.fname} ${job.lname}` });
      if (error) { setCardError(error.message); setPaying(false); return; }

      // Save new card → creates/updates Stripe customer
      const saveRes = await fetch('/save-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.id, bookingId: job.id, name: `${job.fname} ${job.lname}`, email: job.email }),
      });
      const saveData = await saveRes.json() as any;
      if (saveData.error) throw new Error(saveData.error);

      // Charge the new card — only the remaining balance, in case a partial
      // payment (e.g. cash from a family friend) was already recorded against
      // this invoice. Uses the public /customer-charge endpoint (not
      // /admin-charge) since this runs in the customer's own browser, which
      // has no Cloudflare Access session — that endpoint would 401 otherwise.
      const chargeRes = await fetch('/customer-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: saveData.customerId,
          amountCents: Math.round(balanceDue * 100),
          subtotal: amount,
          taxAmount: actualTax,
          description: `GID Garage — ${job.service} — ${job.vehicle}`,
          bookingId: job.id,
        }),
      });
      const chargeData = await chargeRes.json() as any;
      if (!chargeRes.ok && chargeData.error !== 'already_paid') throw new Error(chargeData.error ?? `HTTP ${chargeRes.status}`);

      // customer-charge.js already wrote the DB update, payment event, and
      // receipt email server-side — no further Access-gated calls needed here.
      const updated: Job = {
        ...job,
        invoiceAmount: amount,
        taxAmount: actualTax,
        stripeTransactionId: chargeData.chargeId,
        paidAt: new Date().toISOString(),
        jobStatus: 'PAID' as JobStatus,
        status: 'completed',
        amountPaid: chargeData.amountPaid ?? totalDue,
        payments: chargeData.payments ?? job.payments,
      };
      setDone(true);
      onPaid(updated);
    } catch (e: any) {
      await reportError(e, { source: 'SelfPayForm.handlePay', jobId: job.id, amount: balanceDue });
      setCardError(e.message ?? 'Payment failed. Please try again.');
    }
    setPaying(false);
  }

  if (done) return (
    <div className="mt-6 bg-emerald-900/20 border border-emerald-800 p-6 text-center">
      <div className="text-3xl mb-2">✓</div>
      <p className="text-emerald-400 font-bold text-sm uppercase tracking-widest mb-1">Payment Successful</p>
      <p className="text-gray-400 text-sm">A receipt has been sent to {job.email}.</p>
    </div>
  );

  return (
    <div className="mt-6 bg-white/5 border border-white/10 p-6">
      <p className="text-white text-sm font-bold uppercase tracking-widest mb-1">Pay with a New Card</p>
      <p className="text-gray-500 text-xs mb-4">
        {amountPaidSoFar > 0
          ? `Enter your card details to pay the remaining balance of $${balanceDue.toFixed(2)} ($${amountPaidSoFar.toFixed(2)} already received).`
          : 'Enter your card details below to complete payment securely.'}
      </p>
      <div ref={mountRef} className="bg-gray-900 border border-gray-700 px-3 py-3 mb-3" />
      {cardError && <p className="text-red-400 text-xs mb-3">{cardError}</p>}
      <button
        onClick={handlePay}
        disabled={!cardComplete || paying}
        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors"
      >
        {paying ? 'Processing…' : `Pay $${balanceDue.toFixed(2)}`}
      </button>
      <p className="text-gray-700 text-[10px] text-center mt-2">🔒 Secured by Stripe</p>
    </div>
  );
}

export function InvoicePage() {
  useGlobalErrorReporting({ page: 'public-invoice' });
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('id');
  const showPayForm = params.get('action') === 'pay';
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    getJobByIdPublic(jobId).then(j => {
      if (!j) setNotFound(true);
      else setJob(j);
      setLoading(false);
    });
  }, [jobId]);

  function handlePaid(updated: Job) { setJob(updated); }

  if (loading) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <p className="text-gray-600 text-sm font-bold uppercase tracking-widest">Loading…</p>
    </div>
  );

  if (notFound || !job) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-white text-2xl font-black mb-3">Invoice Not Found</h1>
        <p className="text-gray-500 text-sm mb-6">This link may be invalid. Please call us.</p>
        <a href="tel:4807570476" className="inline-block bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-8 py-4">Call 480-757-0476</a>
      </div>
    </div>
  );

  const isPaid = job.jobStatus === 'PAID';
  const amount = job.invoiceAmount ?? job.estimateAmount;
  const totalDue = (amount || 0) + (job.taxAmount || 0);
  const isPartiallyPaid = !isPaid && (job.amountPaid || 0) > 0;
  const balanceDue = Math.max(0, Math.round((totalDue - (job.amountPaid || 0)) * 100) / 100);
  const serviceDateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const paidDateStr = job.paidAt
    ? new Date(job.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const invoiceNumber = job.id.startsWith('GID-') ? job.id : `GID-${job.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#0f0f0f] py-12 px-4 print:py-0 print:px-0 print:min-h-0">
      <style>{`
        @media print {
          @page { margin: 8mm; size: letter; }
          html, body, #root {
            background: #0f0f0f !important;
            background-color: #0f0f0f !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .print-full {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 24px !important;
          }
          .print-banner {
            max-height: 80px !important;
            width: auto !important;
            display: block !important;
          }
          /* Photos take too much space when printing — hide them */
          .print-hide-photos { display: none !important; }
          /* Ensure line items and totals don't break across pages */
          table { page-break-inside: avoid; }
          .page-break-avoid { page-break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-lg mx-auto print-full">

        {/* Banner — full width, both screen and print */}
        <div className="mb-6">
          <a href="/" className="no-print">
            <img src={img('banner.PNG')} alt="GID Garage" className="w-full h-auto block" />
          </a>
          <img src={img('banner.PNG')} alt="GID Garage" className="hidden print:block h-auto block mb-2 print-banner" />
          <div className="flex justify-end mt-3">
            {isPaid
              ? <span className="inline-block bg-emerald-900/40 border border-emerald-700 text-emerald-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5">✓ Paid</span>
              : isPartiallyPaid
              ? <span className="inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5">Partial Payment Received</span>
              : <span className="inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5">Amount Due</span>
            }
          </div>
        </div>

        {/* Invoice card */}
        <div className="bg-white/5 border border-white/10 page-break-avoid">

          {/* Title row */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-0.5">{isPaid ? 'Receipt' : 'Invoice'}</p>
              <p className="text-white font-mono text-sm">{invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-black ${isPaid ? 'text-emerald-400' : isPartiallyPaid ? 'text-yellow-400' : 'text-red-400'}`}>
                ${isPartiallyPaid ? balanceDue.toFixed(2) : ((amount || 0) + (job.taxAmount || 0)).toFixed(2)}
              </p>
              {isPartiallyPaid && (
                <p className="text-gray-600 text-xs mt-0.5">of ${totalDue.toFixed(2)} total</p>
              )}
            </div>
          </div>

          {/* Job details */}
          <div className="divide-y divide-white/10">
            {[
              ['Customer', `${job.fname} ${job.lname}`],
              ['Vehicle', job.vehicle],
              ['Service Date', serviceDateStr],
              ...(isPaid && paidDateStr ? [['Date Paid', paidDateStr]] : []),
              ...(isPaid && job.stripeTransactionId ? [['Transaction ID', job.stripeTransactionId]] : []),
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between px-6 py-3 gap-4">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider flex-shrink-0">{label}</span>
                <span className={`text-sm text-right ${label === 'Transaction ID' ? 'text-gray-400 font-mono text-xs break-all' : 'text-white'}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* Line items */}
          {job.lineItems?.length > 0 && (
            <div className="border-t border-white/10">
              <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest px-6 py-2">Services</p>
              <div className="divide-y divide-white/5">
                {job.lineItems.map(item => (
                  <div key={item.id} className="flex justify-between gap-3 px-6 py-2.5">
                    <span className="text-gray-300 text-sm flex-1 min-w-0 break-words">{item.label}</span>
                    <span className={`text-sm font-mono font-bold flex-shrink-0 whitespace-nowrap ${item.amount === 0 ? 'text-gray-600' : 'text-white'}`}>
                      {item.amount === 0 ? 'FREE' : (item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`)}
                    </span>
                  </div>
                ))}
                {/* Price adjustment line — only shown on paid receipts when present */}
                {isPaid && job.adjustmentAmount != null && Math.abs(job.adjustmentAmount) > 0.01 && (
                  <div className="flex justify-between gap-3 px-6 py-2.5 bg-indigo-900/20">
                    <span className="text-indigo-300 text-sm italic flex-1 min-w-0 break-words">
                      Price Adjustment{job.adjustmentReason ? ` — ${job.adjustmentReason}` : ''}
                    </span>
                    <span className="text-indigo-300 text-sm font-mono font-bold flex-shrink-0 whitespace-nowrap">
                      {job.adjustmentAmount < 0 ? '-' : '+'}${Math.abs(job.adjustmentAmount).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scope notes if present */}
          {job.estimateNotes && (
            <div className="px-6 py-4 border-t border-white/10">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1.5">Scope of Work</p>
              <p className="text-gray-300 text-sm leading-relaxed">{job.estimateNotes}</p>
            </div>
          )}

          {/* Amount row */}
          <div className="border-t border-white/10">
            <div className="flex justify-between px-6 py-3">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Subtotal</span>
              <span className="text-white text-sm font-mono">${amount?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-6 py-3 border-t border-white/5">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">AZ TPT ({taxRatePercentLabel()}%)</span>
              <span className="text-white text-sm font-mono">${(job.taxAmount || 0).toFixed(2)}</span>
            </div>
            {isPartiallyPaid && (
              <div className="flex justify-between px-6 py-3 border-t border-white/5">
                <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Amount Paid</span>
                <span className="text-emerald-400 text-sm font-mono">-${(job.amountPaid || 0).toFixed(2)}</span>
              </div>
            )}
            <div className={`px-6 py-6 border-t border-white/10 flex items-center justify-between ${isPaid ? 'bg-emerald-900/10' : isPartiallyPaid ? 'bg-yellow-900/10' : 'bg-red-900/10'}`}>
              <span className="text-white font-bold uppercase tracking-wider text-sm">{isPaid ? 'Total Paid' : isPartiallyPaid ? 'Balance Due' : 'Total Due'}</span>
              <span className={`text-3xl font-black ${isPaid ? 'text-emerald-400' : isPartiallyPaid ? 'text-yellow-400' : 'text-red-400'}`}>
                ${isPaid ? ((job.invoiceAmount || 0) + (job.taxAmount || 0)).toFixed(2) : isPartiallyPaid ? balanceDue.toFixed(2) : (amount ? ((amount) + (job.taxAmount || 0)).toFixed(2) : '0.00')}
              </span>
            </div>
          </div>

          {/* Payments received — shown whenever any payment (full or partial) has been recorded */}
          {job.payments?.length > 0 && (
            <div className="border-t border-white/10 px-6 py-4">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Payments Received</p>
              <div className="space-y-1.5">
                {job.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-sm gap-3">
                    <span className="text-gray-400">
                      {p.method}{p.note ? ` — ${p.note}` : ''}
                      <span className="text-gray-600"> · {new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {p.stripeId && <span className="block text-gray-600 font-mono text-xs break-all">{p.stripeId}</span>}
                    </span>
                    <span className="text-emerald-400 font-mono flex-shrink-0">${p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Signed disclaimer */}
        {job.customerAgreed && (
          <div className="mt-4 px-4 py-3 border border-white/10 bg-white/5">
            <p className="text-gray-600 text-xs">Estimate approved by <strong className="text-gray-400">{job.customerSignature}</strong>
              {job.signedAt ? ` on ${new Date(job.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}` : ''}.
            </p>
          </div>
        )}

        {/* Garage notes if present */}
        {job.garageNotes && (
          <div className="mt-4 border border-white/10 bg-white/5 px-6 py-4">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1.5">Technician Notes</p>
            <p className="text-gray-300 text-sm leading-relaxed">{job.garageNotes}</p>
          </div>
        )}

        {/* Job photos if present — hidden when printing */}
        {job.jobPhotos?.length > 0 && (
          <div className="mt-4 border border-white/10 bg-white/5 px-6 py-4 print-hide-photos">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Job Photos</p>
            <div className="space-y-3">
              {job.jobPhotos.map(photo => (
                <div key={photo.id}>
                  <img src={photo.url || photo.dataUrl} alt="Job photo" className="w-full max-h-64 object-cover" />
                  {photo.note && <p className="text-gray-400 text-xs mt-1">{photo.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job videos if present — hidden when printing */}
        {job.jobVideos?.length > 0 && (
          <div className="mt-4 border border-white/10 bg-white/5 px-6 py-4 print-hide-photos">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Job Videos</p>
            <div className="space-y-3">
              {job.jobVideos.map(video => (
                <div key={video.id}>
                  <video src={video.url} controls className="w-full max-h-64 bg-black" />
                  {video.note && <p className="text-gray-400 text-xs mt-1">{video.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Health scan reports — optional pre/post service scan documents */}
        {(job.preScan || job.postScan) && (
          <div className="mt-4 border border-white/10 bg-white/5 px-6 py-4 no-print">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Vehicle Health Scan Reports</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {job.preScan && (
                <a href={job.preScan.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/10 hover:border-indigo-500 px-4 py-3 transition-colors">
                  <span className="text-lg">🔍</span>
                  <span>
                    <span className="block text-gray-400 text-[10px] font-bold uppercase tracking-wider">Pre-Service Scan</span>
                    <span className="block text-indigo-400 text-sm underline truncate max-w-[180px]">{job.preScan.name}</span>
                  </span>
                </a>
              )}
              {job.postScan && (
                <a href={job.postScan.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/10 hover:border-indigo-500 px-4 py-3 transition-colors">
                  <span className="text-lg">✅</span>
                  <span>
                    <span className="block text-gray-400 text-[10px] font-bold uppercase tracking-wider">Post-Service Scan</span>
                    <span className="block text-indigo-400 text-sm underline truncate max-w-[180px]">{job.postScan.name}</span>
                  </span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* External payment link (e.g. pay.bluevine.com) — admin-provided alternative to card-on-file */}
        {job.paymentLink && !isPaid && (
          <div className="mt-4 no-print">
            <a
              href={job.paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold uppercase tracking-widest px-6 py-4 transition-colors"
            >
              💳 Pay {isPartiallyPaid ? 'Balance' : 'Now'} — ${isPartiallyPaid ? balanceDue.toFixed(2) : totalDue.toFixed(2)}
            </a>
          </div>
        )}

        {/* Self-serve payment — only shown when customer arrives from decline email */}
        {showPayForm && job.jobStatus !== 'PAID' && (
          <SelfPayForm job={job} onPaid={handlePaid} />
        )}

        {/* Download / Save button */}
        <div className="mt-6 flex justify-center no-print">
          <button
            onClick={() => window.print()}
            className="border border-white/20 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-8 py-3 transition-colors"
          >
            🖨 Save / Print Receipt
          </button>
        </div>

        {/* Review CTA — only shown on paid receipts */}
        {isPaid && job.id !== 'GID-1781742991286' && (
          <div className="mt-8 border border-white/10 bg-white/5 px-6 py-5 text-center no-print">
            <p className="text-gray-400 text-sm font-bold mb-1">How'd we do?</p>
            <p className="text-gray-600 text-xs mb-4">Your review helps other Flagstaff drivers find a shop they can trust.</p>
            <a
              href="https://g.page/r/CdERSypGqVdlEAI/review"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-white/20 text-gray-300 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-6 py-3 transition-colors"
            >
              ⭐ Leave a Google Review
            </a>
          </div>
        )}

        {/* Inspection Report — tire pressure, tread, DTC codes */}
        {job.inspectionData && (() => {
          const { tirePressure: tp, tireTread: tt, dtcCodes } = job.inspectionData!;
          const hasPressure = Object.values(tp).some(v => v);
          const hasTread = Object.values(tt).some(v => v);
          const hasCodes = dtcCodes.length > 0;
          if (!hasPressure && !hasTread && !hasCodes) return null;

          const TireDisplay = ({ label, values, unit }: { label: string; values: TireReading; unit: string }) => (
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">{label}</p>
              {/* Car outline graphic */}
              <div className="relative mx-auto mb-3" style={{ width: 200, height: 110 }}>
                <svg viewBox="0 0 200 110" width="200" height="110">
                  {/* Car body */}
                  <rect x="30" y="40" width="140" height="40" rx="6" fill="#1f2937" stroke="#374151" strokeWidth="1.5"/>
                  <rect x="55" y="20" width="90" height="25" rx="5" fill="#1f2937" stroke="#374151" strokeWidth="1.5"/>
                  {/* Wheels */}
                  <circle cx="58" cy="82" r="14" fill="#111" stroke="#4b5563" strokeWidth="2"/>
                  <circle cx="58" cy="82" r="7" fill="#1f2937"/>
                  <circle cx="142" cy="82" r="14" fill="#111" stroke="#4b5563" strokeWidth="2"/>
                  <circle cx="142" cy="82" r="7" fill="#1f2937"/>
                  {/* Windshield tint */}
                  <rect x="60" y="23" width="80" height="19" rx="3" fill="#1e3a5f" opacity="0.6"/>
                  {/* Arrow: Front label */}
                  <text x="100" y="13" textAnchor="middle" fill="#6b7280" fontSize="8" fontWeight="bold">FRONT</text>
                </svg>
                {/* FL */}
                <div className="absolute text-center" style={{ top: 48, left: 2 }}>
                  <div className="text-[9px] text-gray-600 font-bold">FL</div>
                  <div className="text-xs font-mono font-bold text-white">{values.fl || '—'}</div>
                </div>
                {/* FR */}
                <div className="absolute text-center" style={{ top: 48, right: 2 }}>
                  <div className="text-[9px] text-gray-600 font-bold">FR</div>
                  <div className="text-xs font-mono font-bold text-white">{values.fr || '—'}</div>
                </div>
                {/* RL */}
                <div className="absolute text-center" style={{ bottom: 0, left: 2 }}>
                  <div className="text-[9px] text-gray-600 font-bold">RL</div>
                  <div className="text-xs font-mono font-bold text-white">{values.rl || '—'}</div>
                </div>
                {/* RR */}
                <div className="absolute text-center" style={{ bottom: 0, right: 2 }}>
                  <div className="text-[9px] text-gray-600 font-bold">RR</div>
                  <div className="text-xs font-mono font-bold text-white">{values.rr || '—'}</div>
                </div>
              </div>
              <p className="text-gray-700 text-[10px] text-center">{unit}</p>
            </div>
          );

          return (
            <div className="mt-6 border border-white/10 bg-white/5">
              <div className="px-6 py-4 border-b border-white/10">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">🔍 Vehicle Inspection Report</p>
              </div>
              <div className="px-6 py-5 space-y-8">
                {hasPressure && <TireDisplay label="Tire Pressure" values={tp} unit="PSI" />}
                {hasTread && <TireDisplay label="Tire Tread Depth" values={tt} unit={'32nds of an inch · 2/32" = replace, 4/32" = caution'} />}
                {hasCodes && (
                  <div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Diagnostic Codes (DTC)</p>
                    <div className="space-y-4">
                      {dtcCodes.map(c => (
                        <div key={c.id} className="border border-white/10 bg-white/5 p-4">
                          <p className="text-red-400 text-sm font-mono font-bold mb-1">{c.code}</p>
                          {c.plan && <p className="text-gray-300 text-sm leading-relaxed">{c.plan}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <p className="text-gray-700 text-xs text-center mt-8">GID Garage · Flagstaff, AZ · 480-757-0476 · gidgarage.com</p>
      </div>
    </div>
  );
}


export function EstimatePage() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('id');

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [damage, setDamage] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    getJobByIdPublic(jobId).then(j => {
      if (!j) { setNotFound(true); }
      else if (j.customerAgreed) { setAlreadySigned(true); setJob(j); }
      else { setJob(j); }
      setLoading(false);
    });
  }, [jobId]);

  async function handleSign() {
    if (!job || !agreed || !signature.trim()) return;
    setSubmitting(true);
    // Capture IP for electronic signature record
    let signerIp = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      signerIp = data.ip || '';
    } catch { /* non-critical */ }
    try {
      await apiPost('sign', { id: job.id, signature: signature.trim(), damage, signerIp });
      setDone(true);
    } catch (err) {
      console.error('Sign failed', err);
      alert('Something went wrong submitting. Please try again or call us at 480-757-0476.');
    } finally {
      setSubmitting(false);
    }
  }

  const dateStr = job ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }) : '';

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-start justify-center px-4 py-12" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="w-full max-w-lg">
        <div className="mb-8 no-print">
          <a href="/">
            <img src={img('banner.PNG')} alt="GID Garage" className="w-full h-auto block" />
          </a>
        </div>

        {loading && (
          <p className="text-center text-gray-600 text-sm font-bold uppercase tracking-widest">Loading estimate…</p>
        )}

        {notFound && (
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-white text-2xl font-black mb-3">Estimate Not Found</h1>
            <p className="text-gray-500 text-sm mb-6">This link may be expired or invalid. Please call us.</p>
            <a href="tel:4807570476" className="inline-block bg-red-600 text-white text-xs font-bold uppercase tracking-widest px-8 py-4">Call 480-757-0476</a>
          </div>
        )}

        {alreadySigned && job && !done && (
          <div className="text-center">
            <div className="text-4xl mb-4">✓</div>
            <h1 className="text-white text-2xl font-black mb-3">Already Signed</h1>
            <p className="text-gray-500 text-sm">You've already approved this estimate. We'll see you on {dateStr} at {job.time}.</p>
          </div>
        )}

        {done && (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-white text-2xl font-black mb-3">You're All Set!</h1>
            <p className="text-gray-400 text-sm mb-2">Your estimate is approved and your appointment is confirmed.</p>
            <p className="text-gray-600 text-sm">{dateStr} at {job?.time}</p>
            <p className="text-gray-700 text-xs mt-6">Questions? Call or text <strong className="text-gray-500">480-757-0476</strong></p>
          </div>
        )}

        {job && !alreadySigned && !done && !loading && !notFound && (
          <div className="space-y-6">
            <div>
              <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-1">Your Estimate</p>
              <h1 className="text-white text-3xl font-black tracking-tight">Review &amp; Approve</h1>
            </div>

            {/* Job summary */}
            <div className="bg-white/5 border border-white/10 divide-y divide-white/10">
              {[
                ['Vehicle', job.vehicle],
                ['Appointment', `${dateStr} at ${job.time}`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between px-4 py-3">
                  <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</span>
                  <span className="text-white text-sm">{val}</span>
                </div>
              ))}
              {/* Line items */}
              {job.lineItems?.length > 0 ? (
                <>
                  {job.lineItems.map(item => (
                    <div key={item.id} className="flex justify-between gap-3 px-4 py-3">
                      <span className="text-gray-300 text-sm flex-1 min-w-0 break-words">{item.label}</span>
                      <span className={`text-sm font-mono font-bold flex-shrink-0 whitespace-nowrap ${item.amount === 0 ? 'text-gray-600' : 'text-white'}`}>
                        {item.amount === 0 ? 'FREE' : (item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`)}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="flex justify-between px-4 py-3">
                  <span className="text-gray-300 text-sm">{resolveServiceName(job.service, job.notes)}</span>
                  <span className="text-white text-sm font-mono">${job.estimateAmount?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-3 border-t border-white/10">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Subtotal</span>
                <span className="text-white text-sm font-mono">${job.estimateAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 border-t border-white/5">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">AZ TPT ({taxRatePercentLabel()}%)</span>
                <span className="text-white text-sm font-mono">${taxFromItems(job.lineItems).toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-4 border-t border-white/10">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total</span>
                <span className="text-red-400 text-2xl font-black">${totalFromItems(job.estimateAmount || 0, job.lineItems).toFixed(2)}</span>
              </div>
            </div>

            {/* Scope notes */}
            {job.estimateNotes && (
              <div className="bg-white/5 border-l-4 border-l-red-600 px-4 py-3">
                <p className="text-gray-400 text-sm leading-relaxed">{job.estimateNotes}</p>
              </div>
            )}

            {/* Terms */}
            <div className="bg-white/5 border border-white/10 p-4">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Terms of Service</p>
              {/* Core terms — always visible */}
              <ul className="space-y-2 mb-3">
                {CYA_TERMS_CORE.map((t, i) => (
                  <li key={i} className="text-gray-300 text-sm flex gap-2.5">
                    <span className="text-red-600 font-bold flex-shrink-0 mt-0.5">✓</span> {t}
                  </li>
                ))}
              </ul>
              {/* Extended terms — collapsible scrollable box */}
              <details className="group">
                <summary className="text-red-500 text-xs font-bold uppercase tracking-widest cursor-pointer select-none hover:text-red-400 transition-colors list-none flex items-center gap-1.5">
                  <span className="group-open:hidden">▶ View all terms ({CYA_TERMS_EXTENDED.length} additional)</span>
                  <span className="hidden group-open:inline">▼ Hide additional terms</span>
                </summary>
                <div
                  className="mt-3 max-h-48 overflow-y-auto pr-1 space-y-2 scrollbar-thin"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                  onScroll={e => {
                    const el = e.currentTarget;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
                      const sigSection = document.getElementById('sig-section');
                      const sigInput = document.getElementById('sig-input') as HTMLInputElement;
                      if (sigSection) {
                        sigSection.classList.remove('opacity-40', 'pointer-events-none');
                        sigSection.classList.add('opacity-100');
                      }
                      if (sigInput) {
                        sigInput.removeAttribute('disabled');
                        sigInput.classList.remove('bg-white/5', 'border-white/10');
                        sigInput.classList.add('bg-white/10', 'border-red-600/50', 'ring-1', 'ring-red-600/30');
                        sigInput.focus();
                      }
                    }
                  }}
                  id="extended-terms-scroll"
                >
                  {CYA_TERMS_EXTENDED.map((t, i) => (
                    <div key={i} className="text-gray-400 text-xs flex gap-2 border-b border-white/5 pb-2 last:border-0">
                      <span className="text-gray-600 font-bold flex-shrink-0">{i + 1}.</span> {t}
                    </div>
                  ))}
                  <p className="text-gray-600 text-[10px] text-center pt-1 pb-0.5">— End of terms —</p>
                </div>
              </details>
            </div>

            {/* Pre-existing damage + signature — dimmed until extended terms scrolled */}
            <div id="sig-section" className="space-y-4 opacity-40 pointer-events-none transition-opacity duration-300">
              <div>
                <label className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-2">
                  Note any pre-existing damage <span className="text-gray-700 normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={damage}
                  onChange={e => setDamage(e.target.value)}
                  rows={2}
                  placeholder="e.g. small dent on passenger door, cracked bumper…"
                  className="bg-white/5 border border-white/10 text-white px-3 py-2 text-sm w-full focus:border-red-600 outline-none resize-none placeholder-gray-700"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-1 accent-red-600 w-4 h-4 flex-shrink-0"
                />
                <span className="text-gray-300 text-sm">I have read and agree to the above terms and authorize GID Garage to perform the described service at the quoted price. If a card on file was provided at booking, I authorize GID Garage to charge it upon job completion for the final agreed amount.</span>
              </label>

              <div>
                <label className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-2">Electronic Signature — Type Your Full Legal Name</label>
                <input
                  id="sig-input"
                  type="text"
                  value={signature}
                  onChange={e => setSignature(e.target.value)}
                  placeholder="Full legal name"
                  disabled
                  className="bg-white/5 border border-white/10 text-white px-3 py-3 text-sm w-full focus:border-red-600 outline-none placeholder-gray-700 transition-all duration-300"
                />
                <p className="text-gray-500 text-[10px] mt-1.5">Please read all terms above to unlock the signature field. By typing your name, you are providing an electronic signature legally binding under the Uniform Electronic Transactions Act (UETA).</p>
              </div>

              <button
                onClick={handleSign}
                disabled={!agreed || !signature.trim() || submitting}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest py-4 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Approve Estimate'}
              </button>
            </div>

            <p className="text-gray-700 text-xs text-center">Questions before signing? Call or text us at <strong className="text-gray-600">480-757-0476</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BUSINESS HUB ─────────────────────────────────────────────────────────────

interface HubNote {
  id: string;
  content: string;
  createdAt: string;
}

interface HubCategory {
  id: string;
  icon: string;
  label: string;
  color: string; // tailwind text color
  border: string;
  bg: string;
}

const HUB_CATEGORIES: HubCategory[] = [
  { id: 'revenue',  icon: '📈', label: 'Revenue',             color: 'text-emerald-400', border: 'border-emerald-800', bg: 'bg-emerald-900/10' },
  { id: 'recovery', icon: '🛟', label: 'Recovery',            color: 'text-red-400',     border: 'border-red-800',    bg: 'bg-red-900/10'    },
  { id: 'taxes',    icon: '🧾', label: 'Taxes & TPT',        color: 'text-yellow-400',  border: 'border-yellow-800', bg: 'bg-yellow-900/10' },
  { id: 'ops',      icon: '⚙️', label: 'Operations',         color: 'text-blue-400',    border: 'border-blue-800',   bg: 'bg-blue-900/10'   },
  { id: 'legal',    icon: '⚖️', label: 'Legal & Licensing',  color: 'text-purple-400',  border: 'border-purple-800', bg: 'bg-purple-900/10' },
  { id: 'pricing',  icon: '💲', label: 'Pricing & Labor',    color: 'text-green-400',   border: 'border-green-800',  bg: 'bg-green-900/10'  },
  { id: 'vendors',  icon: '🔩', label: 'Vendors & Parts',    color: 'text-orange-400',  border: 'border-orange-800', bg: 'bg-orange-900/10' },
  { id: 'banking',  icon: '🏦', label: 'Banking & Credit',   color: 'text-cyan-400',    border: 'border-cyan-800',   bg: 'bg-cyan-900/10'   },
  { id: 'misc',     icon: '📌', label: 'Misc Notes',         color: 'text-gray-400',    border: 'border-gray-700',   bg: 'bg-gray-900/20'   },
];

const SEED_NOTES: Record<string, string[]> = {
  taxes: [
    'AZ TPT License #21663074 (Standard) — ACTIVE. File & pay at AZTaxes.gov by the 20th of the following month.',
    'Flagstaff combined TPT rate: 9.386% (State 5.6% + City 2.281% + County 1.125% + other 0.176%). Applied to ALL auto repair — labor AND parts.',
    'Every paid invoice has tax_amount stored in Supabase. Use the Tax Summary below to pull monthly totals for your TPT filing.',
    'Zoho Books: log all business expenses there (tools, PPE, parts, fuel, insurance). These reduce your taxable NET income for federal/state income tax — not TPT.',
    'Keep receipts for every expense ≥ $75. AutoZone Pro purchases pull statements monthly — save them.',
    'Federal income tax: you\'re a single-member LLC taxed as sole proprietor. Pay quarterly estimated taxes (Form 1040-ES) by: Apr 15, Jun 15, Sep 15, Jan 15.',
    'AZ state income tax: file AZ Form 140 annually. Also consider AZ estimated tax payments if you expect to owe > $1,000.',
  ],
  ops: [
    'Service area: Flagstaff, AZ (relocating to Gilbert in ~1yr — update TPT location registration when you move).',
    'Hours: Mon–Fri 1:30PM–8PM, Sat–Sun 5AM–8PM.',
    'Mobile service fee included in all pricing. Customer must provide flat, stable surface with sufficient clearance.',
    'Parts markup: 25% over AutoZone Pro cost. Labor: $135/hr.',
    'Oil change: $79.99 full synthetic only. Brakes from $149.99/axle. Diagnostics $89.99. Front struts from $399.99 labor. Audio from $174.99 labor.',
    'Cancellations: require 24hr notice. Late cancellation fee up to 50% of quoted cost.',
  ],
  legal: [
    'Entity: Echiverri Holdings LLC — EIN obtained, DBA "GID Garage" filed through AZ SOS.',
    'AZ TPT License: #21663074 — ACTIVE.',
    'AZ ROC License: in progress.',
    'Insurance & bonding: in progress.',
    'All estimates require customer e-signature (UETA-compliant). Signed docs stored in Supabase with IP and timestamp.',
    'Coconino County jurisdiction for any disputes.',
  ],
  pricing: [
    'Labor rate: $135/hr.',
    'Parts markup: 25% over AutoZone Pro invoice cost.',
    'Oil Change: $79.99 (full synthetic, 5qt). Extra quarts: $10.99/qt.',
    'Diagnostics: $89.99 (OBD2 scan + recommendation).',
    'Brakes from $149.99/axle (pads only). Pads + rotors from $549.99. Full service from $649.99.',
    'Front struts from $399.99 labor. Audio from $174.99 labor.',
    'Flagstaff combined sales tax 9.386% added to all invoices.',
    'Shop comparison baseline: use for estimate emails to show customer savings vs. local shops.',
  ],
  vendors: [
    'AutoZone Pro commercial account under Echiverri Holdings — monthly statement pay (builds Paydex).',
    'Quill net-30 account — paid off.',
    'Harbor Freight: startup tools & PPE — log all receipts in Zoho Books as Equipment/Supplies expense.',
    'Parts sourcing flow: quote customer → order from AutoZone Pro → apply 25% markup on invoice.',
  ],
  banking: [
    'Primary operating account: Bluevine (Stripe integrated for deposits).',
    'Mercury: retained for lender credibility / secondary account.',
    'Stripe: tap-to-pay + saved cards. Integrated with charge-card.js Cloudflare Worker.',
    'Business credit: DUNS obtained. D&B SER moved from "no data" to "moderate to high".',
    'Amex Blue Business Cash: denied (too many inquiries + thin Bluevine history). Re-apply in ~6 months.',
    'AutoZone Pro monthly statement pay reports to D&B — keep account current to build Paydex score.',
  ],
  misc: [],
};

function usePersistentNotes(categoryId: string) {
  const [notes, setNotes] = useState<HubNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await adminPost('list-notes', { categoryId });
        if (cancelled) return;
        if (data && data.length > 0) {
          setNotes(data.map((r: any) => ({ id: r.id, content: r.content, createdAt: r.created_at })));
        } else {
          // Seed this category — insert one at a time with staggered timestamps to avoid ID collision
          const seeds = SEED_NOTES[categoryId] ?? [];
          for (let i = 0; i < seeds.length; i++) {
            const uid = `${categoryId}-s${i}-${Math.random().toString(36).slice(2,9)}`;
            try {
              await adminPost('add-note', { id: uid, categoryId, content: seeds[i] });
            } catch { /* skip duplicate */ }
          }
          if (seeds.length > 0) {
            const fresh = await adminPost('list-notes', { categoryId });
            if (!cancelled) setNotes((fresh || []).map((r: any) => ({ id: r.id, content: r.content, createdAt: r.created_at })));
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [categoryId]);

  async function addNote(content: string) {
    const noteId = `${categoryId}-${Date.now()}`;
    const created = await adminPost('add-note', { id: noteId, categoryId, content });
    if (created) setNotes(prev => [...prev, { id: created.id, content: created.content, createdAt: created.created_at }]);
  }

  async function deleteNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id));
    await adminPost('delete-note', { id });
  }

  async function editNote(id: string, content: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
    await adminPost('update-note', { id, content });
  }

  return { notes, loading, addNote, deleteNote, editNote };
}

// ── INVOICE EXPORT ────────────────────────────────────────────────────────────
// iOS apps added to the home screen (standalone/PWA mode — what this admin
// panel runs as) execute in a stripped-down WebKit container that silently
// no-ops on window.print(), window.open(), and the <a download> attribute on
// blob URLs — none of those work there, which is why earlier attempts at
// Print Invoices appeared to do nothing. The Web Share API is the one
// mechanism Apple does support in that mode: it opens the native share sheet
// (Save to Files, Print, AirDrop, Mail, etc.). Falls back to a normal
// download for desktop browsers / anywhere Web Share isn't available.
async function shareOrDownloadFile(filename: string, mimeType: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // user cancelled the share sheet — not an error
      // fall through to the download fallback below
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Loads the jsPDF library from a CDN at runtime instead of an npm package —
// keeps this a single drop-in file with no package.json/dependency changes
// required to deploy it. Cached on window after the first load.
let jsPdfLoadPromise: Promise<any> | null = null;
function loadJsPDF(): Promise<any> {
  const w = window as any;
  if (w.jspdf?.jsPDF) return Promise.resolve(w.jspdf.jsPDF);
  if (jsPdfLoadPromise) return jsPdfLoadPromise;
  jsPdfLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => {
      if (w.jspdf?.jsPDF) resolve(w.jspdf.jsPDF);
      else reject(new Error('PDF library loaded but jsPDF was not found.'));
    };
    script.onerror = () => reject(new Error('Could not load the PDF library — check your connection and try again.'));
    document.head.appendChild(script);
  });
  return jsPdfLoadPromise;
}

// Builds an actual PDF (not an HTML printout) for a set of paid invoices —
// one page per job, plus a closing tax-summary page. Clean black-on-white
// layout since this is meant to be printed/filed, not viewed on a dark UI.
function buildInvoicesPdf(JsPDF: any, jobs: Job[], periodLabel: string): any {
  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const rightX = pageWidth - marginX;

  function money(n: number) {
    return `$${n.toFixed(2)}`;
  }

  function labelValueRow(y: number, label: string, value: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(20);
    doc.text(value || '—', rightX, y, { align: 'right' });
    doc.setDrawColor(225);
    doc.line(marginX, y + 7, rightX, y + 7);
    return y + 24;
  }

  jobs.forEach((job, i) => {
    if (i > 0) doc.addPage();
    let y = 56;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text('RECEIPT', marginX, y);
    doc.setTextColor(22, 163, 74);
    doc.text('PAID', rightX, y, { align: 'right' });
    y += 16;
    const invoiceNum = job.id?.startsWith('GID-') ? job.id : `GID-${(job.id || '').slice(0, 8).toUpperCase()}`;
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(invoiceNum, marginX, y);
    y += 28;

    // GID Garage / total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text('GID Garage', marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120);
    doc.text('EIN: 42-2687870  ·  TPT: 21663074', marginX, y + 13);
    const total = (job.invoiceAmount || 0) + (job.taxAmount || 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(22, 163, 74);
    doc.text(money(total), rightX, y + 4, { align: 'right' });
    y += 34;
    doc.setDrawColor(20);
    doc.setLineWidth(1);
    doc.line(marginX, y, rightX, y);
    y += 22;

    // Details
    const svcDate = job.date ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const paidDate = job.paidAt ? new Date(job.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    y = labelValueRow(y, 'Customer', `${job.fname || ''} ${job.lname || ''}`.trim());
    y = labelValueRow(y, 'Vehicle', job.vehicle || '');
    y = labelValueRow(y, 'Service Date', svcDate);
    y = labelValueRow(y, 'Date Paid', paidDate);
    if (job.stripeTransactionId) y = labelValueRow(y, 'Transaction ID', job.stripeTransactionId);
    y += 12;

    // Line items
    if (job.lineItems?.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('SERVICES', marginX, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      job.lineItems.forEach(li => {
        if (y > pageHeight - 140) { doc.addPage(); y = 56; }
        doc.setTextColor(40);
        const label = doc.splitTextToSize(li.label, 320);
        doc.text(label, marginX, y);
        doc.setTextColor(20);
        const amtStr = li.amount === 0 ? 'FREE' : (li.amount < 0 ? `-${money(Math.abs(li.amount))}` : money(li.amount));
        doc.text(amtStr, rightX, y, { align: 'right' });
        y += 14 * label.length + 4;
      });
      y += 8;
    }

    // Totals
    if (y > pageHeight - 110) { doc.addPage(); y = 56; }
    doc.setDrawColor(20);
    doc.line(marginX, y, rightX, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(110);
    doc.text('Subtotal', marginX, y);
    doc.setTextColor(20);
    doc.text(money(job.invoiceAmount || 0), rightX, y, { align: 'right' });
    y += 16;
    doc.setTextColor(180, 83, 9);
    doc.text(`AZ TPT (${taxRatePercentLabel()}%)`, marginX, y);
    doc.text(money(job.taxAmount || 0), rightX, y, { align: 'right' });
    y += 14;
    doc.setDrawColor(20);
    doc.line(marginX, y, rightX, y);
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('Total', marginX, y);
    doc.setTextColor(22, 163, 74);
    doc.text(money(total), rightX, y, { align: 'right' });
  });

  // Closing tax-summary page
  doc.addPage();
  let sy = 64;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(`${periodLabel} — Tax Summary`, marginX, sy);
  sy += 30;

  const totals = jobs.reduce((acc, j) => ({
    subtotal: acc.subtotal + (j.invoiceAmount || 0),
    tax: acc.tax + (j.taxAmount || 0),
  }), { subtotal: 0, tax: 0 });

  const summaryRows: [string, string][] = [
    ['Invoices', String(jobs.length)],
    ['Subtotal', money(totals.subtotal)],
    ['AZ TPT Collected', money(totals.tax)],
    ['Total Revenue', money(totals.subtotal + totals.tax)],
  ];
  summaryRows.forEach(([label, value], i) => {
    doc.setFillColor(i === summaryRows.length - 1 ? 240 : 248, i === summaryRows.length - 1 ? 253 : 248, i === summaryRows.length - 1 ? 244 : 248);
    doc.rect(marginX, sy - 14, rightX - marginX, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), marginX + 10, sy + 3);
    doc.setFont('helvetica', i === summaryRows.length - 1 ? 'bold' : 'normal');
    doc.setTextColor(i === summaryRows.length - 1 ? 22 : 20, i === summaryRows.length - 1 ? 163 : 20, i === summaryRows.length - 1 ? 74 : 20);
    doc.setFontSize(11);
    doc.text(value, rightX - 10, sy + 3, { align: 'right' });
    sy += 30;
  });

  sy += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(140);
  doc.text('Remit TPT at AZTaxes.gov by the 20th of the following month.', marginX, sy);
  doc.text('EIN: 42-2687870  ·  TPT License: 21663074', marginX, sy + 12);

  return doc;
}

function InvoiceExport() {
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  // In-app preview is the guaranteed fallback — window.print(), window.open(),
  // <a download>, and even the Web Share API can all silently no-op depending
  // on the device/browser (especially iOS standalone/home-screen mode), so
  // rendering the report directly in the page is the one thing that always
  // shows something. Share/Save is offered as a bonus action from there.
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewFilename, setPreviewFilename] = useState('');
  const [previewJobs, setPreviewJobs] = useState<Job[]>([]);
  const [previewPeriodLabel, setPreviewPeriodLabel] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    adminPost('paid-bookings')
      .then((data: any[]) => {
        if (!data?.length) { setLoading(false); return; }
        const jobs = data.filter(b => b.paid_at).map(mapJob);
        jobs.sort((a, b) => new Date(a.paidAt!).getTime() - new Date(b.paidAt!).getTime());
        setAllJobs(jobs);
        setLoading(false);
      })
      .catch((e: any) => { setLoadError(e?.message ?? 'Failed to load paid jobs'); setLoading(false); });
  }, []);

  const years = [...new Set(allJobs.map(j => new Date(j.paidAt!).getFullYear().toString()))].sort();
  const months = selectedYear
    ? [...new Set(allJobs
        .filter(j => new Date(j.paidAt!).getFullYear().toString() === selectedYear)
        .map(j => new Date(j.paidAt!).toISOString().slice(0, 7)))]
        .sort()
    : [];

  const filteredJobs = allJobs.filter(j => {
    const d = new Date(j.paidAt!);
    if (mode === 'year') return selectedYear && d.getFullYear().toString() === selectedYear;
    if (mode === 'month') return selectedMonth && d.toISOString().slice(0, 7) === selectedMonth;
    return false;
  });

  async function printInvoices() {
    if (!filteredJobs.length) return;
    const periodLabel = mode === 'year'
      ? `Year ${selectedYear}`
      : (() => {
          const [yr, mo] = selectedMonth.split('-');
          return new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        })();

    const invoiceHtml = filteredJobs.map(job => {
      const invoiceNum = job.id.startsWith('GID-') ? job.id : `GID-${job.id.slice(0, 8).toUpperCase()}`;
      const total = ((job.invoiceAmount || 0) + (job.taxAmount || 0)).toFixed(2);
      const svcDate = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const paidDate = job.paidAt ? new Date(job.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const lineItemsHtml = job.lineItems?.length
        ? job.lineItems.map(li => `<tr><td style="padding:6px 0;color:#ccc;font-size:13px;">${li.label}</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:13px;color:#fff;white-space:nowrap;">${li.amount === 0 ? 'FREE' : (li.amount < 0 ? '-$' + Math.abs(li.amount).toFixed(2) : '$' + li.amount.toFixed(2))}</td></tr>`).join('')
        : '';
      return `
        <div style="background:#0f0f0f;color:#fff;padding:32px;margin-bottom:0;page-break-after:always;font-family:sans-serif;max-width:600px;margin-left:auto;margin-right:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <div>
              <div style="font-size:10px;color:#666;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">Receipt</div>
              <div style="font-family:monospace;font-size:13px;color:#fff;">${invoiceNum}</div>
            </div>
            <div style="font-size:10px;color:#4ade80;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">✓ Paid</div>
          </div>
          <div style="border:1px solid #222;padding:0;">
            <div style="padding:16px 20px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">GID Garage</div>
                <div style="font-size:11px;color:#999;margin-top:2px;">EIN: 42-2687870 · TPT: 21663074</div>
              </div>
              <div style="font-size:26px;font-weight:900;color:#4ade80;">$${total}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${[
                ['Customer', `${job.fname} ${job.lname}`],
                ['Vehicle', job.vehicle],
                ['Service Date', svcDate],
                ['Date Paid', paidDate],
                ...(job.stripeTransactionId ? [['Transaction ID', job.stripeTransactionId]] : []),
              ].map(([lbl, val]) => `<tr style="border-bottom:1px solid #1a1a1a;"><td style="padding:10px 20px;font-size:10px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">${lbl}</td><td style="padding:10px 20px;font-size:13px;color:#fff;text-align:right;">${val}</td></tr>`).join('')}
            </table>
            ${lineItemsHtml ? `
            <div style="border-top:1px solid #222;padding:12px 20px;">
              <div style="font-size:10px;color:#444;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Services</div>
              <table style="width:100%;">${lineItemsHtml}</table>
            </div>` : ''}
            <div style="border-top:1px solid #333;padding:12px 20px;">
              <table style="width:100%;">
                <tr><td style="padding:4px 0;font-size:11px;color:#666;">Subtotal</td><td style="text-align:right;font-family:monospace;font-size:12px;color:#fff;">$${(job.invoiceAmount||0).toFixed(2)}</td></tr>
                <tr><td style="padding:4px 0;font-size:11px;color:#b45309;">AZ TPT (${taxRatePercentLabel()}%)</td><td style="text-align:right;font-family:monospace;font-size:12px;color:#fbbf24;">$${(job.taxAmount||0).toFixed(2)}</td></tr>
                <tr style="border-top:1px solid #333;"><td style="padding:8px 0 4px;font-size:12px;color:#fff;font-weight:700;">Total</td><td style="text-align:right;font-family:monospace;font-size:14px;color:#4ade80;font-weight:900;">$${total}</td></tr>
              </table>
            </div>
          </div>
        </div>`;
    }).join('');

    const totals = filteredJobs.reduce((acc, j) => ({
      subtotal: acc.subtotal + (j.invoiceAmount || 0),
      tax: acc.tax + (j.taxAmount || 0),
    }), { subtotal: 0, tax: 0 });

    const summaryHtml = `
      <div style="background:#0f0f0f;color:#fff;padding:32px;font-family:sans-serif;max-width:600px;margin:0 auto;page-break-before:always;">
        <div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.1em;">📊 ${periodLabel} — Tax Summary</div>
        <table style="width:100%;border:1px solid #333;">
          <tr style="background:#1a1a1a;"><td style="padding:10px 16px;font-size:11px;color:#999;text-transform:uppercase;">Invoices</td><td style="padding:10px 16px;text-align:right;font-size:13px;color:#fff;font-weight:700;">${filteredJobs.length}</td></tr>
          <tr><td style="padding:10px 16px;font-size:11px;color:#999;text-transform:uppercase;">Subtotal</td><td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:13px;color:#fff;">$${totals.subtotal.toFixed(2)}</td></tr>
          <tr style="background:#1a0a00;"><td style="padding:10px 16px;font-size:11px;color:#b45309;text-transform:uppercase;">AZ TPT Collected</td><td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:13px;color:#fbbf24;font-weight:700;">$${totals.tax.toFixed(2)}</td></tr>
          <tr style="background:#0a1a0a;"><td style="padding:10px 16px;font-size:11px;color:#4ade80;text-transform:uppercase;font-weight:700;">Total Revenue</td><td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:14px;color:#4ade80;font-weight:900;">$${(totals.subtotal + totals.tax).toFixed(2)}</td></tr>
        </table>
        <p style="font-size:10px;color:#444;margin-top:12px;">Remit TPT at AZTaxes.gov by the 20th of the following month. EIN: 42-2687870 · TPT License: 21663074</p>
      </div>`;

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GID Garage Invoices — ${periodLabel}</title><style>*{box-sizing:border-box;}body{margin:0;background:#0f0f0f;}@media print{@page{margin:0;size:letter;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>${invoiceHtml}${summaryHtml}</body></html>`;

    // Show it in-page first — this always works, regardless of what the
    // device/browser does or doesn't support for printing/downloading/sharing.
    setPreviewHtml(fullHtml);
    setPreviewJobs(filteredJobs);
    setPreviewPeriodLabel(periodLabel);
    setPreviewFilename(`gid-garage-invoices-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    setShareError(null);
    setShowPreview(true);
  }

  async function shareInvoicePreview() {
    setSharing(true);
    setShareError(null);
    try {
      const JsPDF = await loadJsPDF();
      const pdf = buildInvoicesPdf(JsPDF, previewJobs, previewPeriodLabel);
      const pdfBlob = pdf.output('blob');
      await shareOrDownloadFile(previewFilename, 'application/pdf', pdfBlob);
    } catch (e: any) {
      setShareError(e?.message ?? 'Share failed — you can still scroll and screenshot the preview below.');
    }
    setSharing(false);
  }

  if (loading) return <p className="text-gray-600 text-xs py-4">Loading invoice data…</p>;
  if (loadError) return (
    <div className="bg-red-900/10 border border-red-800 px-4 py-3 mt-4">
      <p className="text-red-400 text-xs font-bold mb-1">Couldn't load paid jobs</p>
      <p className="text-gray-500 text-xs">{loadError}</p>
    </div>
  );
  if (!allJobs.length) return null;

  return (
    <div className="mt-6 border border-gray-800 bg-gray-900/30 p-4">
      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">🖨 Print Invoices</p>
      <p className="text-gray-600 text-[10px] mb-3">Preview on screen, then Share/Save as a real PDF file (Print, AirDrop, etc. from there).</p>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('year')} className={`flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border transition-colors ${mode === 'year' ? 'border-red-600 text-white bg-red-900/20' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>By Year</button>
        <button onClick={() => setMode('month')} className={`flex-1 text-xs font-bold uppercase tracking-wider py-2.5 border transition-colors ${mode === 'month' ? 'border-red-600 text-white bg-red-900/20' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>By Month</button>
      </div>
      {mode === 'year' && (
        <div className="space-y-2 mb-4">
          {years.map(y => (
            <button key={y} onClick={() => setSelectedYear(y)} className={`w-full text-left px-4 py-3 border text-sm font-bold transition-colors ${selectedYear === y ? 'border-red-600 text-white bg-red-900/20' : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'}`}>
              {y} — {allJobs.filter(j => new Date(j.paidAt!).getFullYear().toString() === y).length} invoices
            </button>
          ))}
        </div>
      )}
      {mode === 'month' && (
        <div className="space-y-1 mb-4">
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(e.target.value); setSelectedMonth(''); }}
            className="w-full bg-gray-900 border border-gray-700 text-white text-xs px-3 py-2.5 mb-2 outline-none focus:border-red-600"
          >
            <option value="">Select year…</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {selectedYear && months.map(m => {
            const [yr, mo] = m.split('-');
            const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const count = allJobs.filter(j => new Date(j.paidAt!).toISOString().slice(0, 7) === m).length;
            return (
              <button key={m} onClick={() => setSelectedMonth(m)} className={`w-full text-left px-4 py-3 border text-sm font-bold transition-colors ${selectedMonth === m ? 'border-red-600 text-white bg-red-900/20' : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'}`}>
                {label} — {count} invoices
              </button>
            );
          })}
        </div>
      )}
      {filteredJobs.length > 0 && (
        <button onClick={printInvoices} className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold uppercase tracking-widest transition-colors">
          👁 Preview {filteredJobs.length} Invoice{filteredJobs.length !== 1 ? 's' : ''}
        </button>
      )}
      {filteredJobs.length === 0 && (mode === 'year' ? selectedYear : selectedMonth) && (
        <p className="text-gray-600 text-xs text-center py-2">No paid invoices for this period.</p>
      )}

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-3">
          <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
            <p className="text-white text-xs font-bold uppercase tracking-wider truncate">Invoice Preview</p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={shareInvoicePreview} disabled={sharing}
                className="text-xs font-bold uppercase tracking-wider px-3 py-2 border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-colors disabled:opacity-40">
                {sharing ? 'Generating PDF…' : '📤 Share / Save PDF'}
              </button>
              <button onClick={() => setShowPreview(false)}
                className="text-xs font-bold uppercase tracking-wider px-3 py-2 border border-gray-700 text-gray-400 hover:border-white hover:text-white transition-colors">
                ✕ Close
              </button>
            </div>
          </div>
          {shareError && (
            <p className="text-red-400 text-xs mb-2 flex-shrink-0">{shareError}</p>
          )}
          <iframe title="Invoice preview" srcDoc={previewHtml} className="flex-1 w-full bg-[#0f0f0f] border border-gray-800" />
        </div>
      )}
    </div>
  );
}

// ── CSV EXPORT (all jobs — for taxes / bookkeeping) ────────────────────────────
function csvCell(val: any): string {
  const s = val === null || val === undefined ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function JobsCSVExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvFilename, setCsvFilename] = useState('');
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  async function shareCsv() {
    setSharing(true);
    setShareError(null);
    try {
      await shareOrDownloadFile(csvFilename, 'text/csv;charset=utf-8', csvContent);
    } catch (e: any) {
      setShareError(e?.message ?? 'Share failed — tap into the text below, Select All, and copy instead.');
    }
    setSharing(false);
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const data = await adminPost('list-bookings', { limit: 5000 });
      const jobs: Job[] = (data || []).map(mapJob).filter((j: Job) => j.jobStatus === 'PAID');
      // Oldest first reads naturally in a spreadsheet / for a bookkeeper.
      // Sort by paid date — taxes care about when income was received, not booked.
      jobs.sort((a, b) => new Date(a.paidAt || a.date || a.createdAt).getTime() - new Date(b.paidAt || b.date || b.createdAt).getTime());

      if (!jobs.length) {
        setError('No paid jobs to export yet.');
        setExporting(false);
        return;
      }

      const headers = [
        'Date', 'Customer', 'Vehicle', 'Service', 'Status',
        'Subtotal', 'Tax Collected', 'Total Charged', 'Amount Paid',
        'Parts Cost', 'Net Profit', 'Date Paid', 'Transaction ID',
      ];

      const rows = jobs.map(j => {
        const subtotal = j.invoiceAmount ?? j.estimateAmount ?? 0;
        const tax = j.taxAmount ?? 0;
        const totalCharged = subtotal + tax;
        const amountPaid = j.amountPaid ?? (j.jobStatus === 'PAID' ? totalCharged : 0);
        const partsCost = j.partsCost ?? 0;
        const netProfit = Math.round((amountPaid - partsCost) * 100) / 100;
        return [
          j.date || '',
          `${j.fname || ''} ${j.lname || ''}`.trim(),
          j.vehicle || '',
          j.service || '',
          j.jobStatus,
          subtotal.toFixed(2),
          tax.toFixed(2),
          totalCharged.toFixed(2),
          amountPaid.toFixed(2),
          partsCost.toFixed(2),
          netProfit.toFixed(2),
          j.paidAt ? new Date(j.paidAt).toLocaleDateString('en-US') : '',
          j.stripeTransactionId || '',
        ];
      });

      const totals = jobs.reduce((acc, j) => {
        const subtotal = j.invoiceAmount ?? j.estimateAmount ?? 0;
        const tax = j.taxAmount ?? 0;
        const amountPaid = j.amountPaid ?? (j.jobStatus === 'PAID' ? subtotal + tax : 0);
        const partsCost = j.partsCost ?? 0;
        return {
          subtotal: acc.subtotal + subtotal,
          tax: acc.tax + tax,
          amountPaid: acc.amountPaid + amountPaid,
          partsCost: acc.partsCost + partsCost,
        };
      }, { subtotal: 0, tax: 0, amountPaid: 0, partsCost: 0 });
      const totalsRow = [
        'TOTALS', '', '', '', '',
        totals.subtotal.toFixed(2),
        totals.tax.toFixed(2),
        (totals.subtotal + totals.tax).toFixed(2),
        totals.amountPaid.toFixed(2),
        totals.partsCost.toFixed(2),
        (totals.amountPaid - totals.partsCost).toFixed(2),
        '', '',
      ];

      const csv = '\uFEFF' + [headers, ...rows, totalsRow]
        .map(r => r.map(csvCell).join(','))
        .join('\r\n');

      const today = new Date().toISOString().slice(0, 10);
      setPreviewHeaders(headers);
      setPreviewRows([...rows, totalsRow]);
      setCsvContent(csv);
      setCsvFilename(`gid-garage-jobs-export-${today}.csv`);
      setShareError(null);
      setShowPreview(true);
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    }
    setExporting(false);
  }

  return (
    <div className="mt-6 border border-gray-800 bg-gray-900/30 p-4">
      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">📑 Export Paid Jobs (CSV)</p>
      <p className="text-gray-600 text-[10px] mb-3">Paid jobs only — revenue, tax, parts cost, and net profit. Preview on screen, then Share/Save or copy the text.</p>
      <button onClick={exportCsv} disabled={exporting}
        className="w-full py-3 border border-gray-700 hover:border-yellow-700 hover:text-yellow-500 text-gray-300 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-40">
        {exporting ? 'Exporting…' : '👁 Preview CSV'}
      </button>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-3">
          <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
            <p className="text-white text-xs font-bold uppercase tracking-wider truncate">Paid Jobs — {previewRows.length - 1} job{previewRows.length - 1 !== 1 ? 's' : ''}</p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={shareCsv} disabled={sharing}
                className="text-xs font-bold uppercase tracking-wider px-3 py-2 border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-colors disabled:opacity-40">
                {sharing ? 'Sharing…' : '📤 Share / Save'}
              </button>
              <button onClick={() => setShowPreview(false)}
                className="text-xs font-bold uppercase tracking-wider px-3 py-2 border border-gray-700 text-gray-400 hover:border-white hover:text-white transition-colors">
                ✕ Close
              </button>
            </div>
          </div>
          {shareError && <p className="text-red-400 text-xs mb-2 flex-shrink-0">{shareError}</p>}
          <p className="text-gray-600 text-[10px] mb-2 flex-shrink-0">Swipe sideways to see all columns. Share/Save exports the full file (CSV).</p>
          <div className="flex-1 overflow-auto border border-gray-800">
            <table className="min-w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-gray-900">
                <tr>
                  {previewHeaders.map(h => (
                    <th key={h} className="text-left text-gray-400 font-bold uppercase tracking-wider px-3 py-2 border-b border-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => {
                  const isTotals = row[0] === 'TOTALS';
                  return (
                    <tr key={i} className={isTotals ? 'bg-gray-900 font-bold' : i % 2 === 0 ? 'bg-black/20' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 whitespace-nowrap border-b border-gray-900 ${isTotals ? 'text-white' : 'text-gray-300'} ${j >= 5 ? 'font-mono text-right' : ''}`}>
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAX RATE SETTINGS (editable, saved to Supabase, applies going forward) ─────
function TaxRateSettings() {
  const [savedRate, setSavedRate] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminPost('get-tax-rate')
      .then((data: any) => {
        const rate = Number(data?.taxRate) || 0.09386;
        setSavedRate(rate);
        setInput((rate * 100).toFixed(3));
        setTaxRate(rate); // keep the in-memory rate in sync too
        setLoading(false);
      })
      .catch(() => { setError('Failed to load current rate'); setLoading(false); });
  }, []);

  async function save() {
    const pct = parseFloat(input);
    if (!pct || pct <= 0 || pct >= 100) { setError('Enter a valid percentage, e.g. 9.386'); return; }
    const rate = Math.round((pct / 100) * 1e6) / 1e6; // keep enough precision for e.g. 9.386%
    setSaving(true);
    setError(null);
    try {
      await adminPost('set-tax-rate', { taxRate: rate });
      setTaxRate(rate); // applies immediately, site-wide, for the rest of this session
      setSavedRate(rate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
    }
    setSaving(false);
  }

  if (loading) return <p className="text-gray-600 text-xs py-4">Loading tax rate…</p>;

  return (
    <div className="border border-gray-800 bg-gray-900/30 p-4">
      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">⚙️ AZ TPT Rate</p>
      <p className="text-gray-600 text-[10px] mb-3">
        Flagstaff's published combined rate (state 5.6% + Coconino County 1.3% + city 2.486%) is currently <strong className="text-gray-400">9.386%</strong>, per the AZ Dept. of Revenue rate tables — confirmed January 2026. This app can't auto-detect future changes, so update it here if AZ ever changes it. Saving applies to every <em>new</em> estimate/invoice from then on — past paid jobs keep whatever rate was actually charged.
      </p>
      <div className="flex gap-2 mb-1">
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 px-2.5 flex-1">
          <input
            type="number"
            step="0.001"
            value={input}
            onChange={e => { setInput(e.target.value); setSaved(false); }}
            className="bg-transparent text-white py-2 text-sm font-mono w-full outline-none"
          />
          <span className="text-gray-500 text-xs font-bold">%</span>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`px-4 text-xs font-bold uppercase tracking-wider border transition-colors ${
            saved ? 'border-emerald-800 text-emerald-600' : 'border-yellow-700 text-yellow-600 hover:bg-yellow-900/20'
          }`}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      {savedRate != null && (
        <p className="text-gray-700 text-[10px]">Currently saved: {(savedRate * 100).toFixed(3)}%</p>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}

// ── TAX SUMMARY (live from Supabase) ──────────────────────────────────────────
function TaxSummary() {
  const [rows, setRows] = useState<{ month: string; subtotal: number; tax: number; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminPost('paid-bookings')
      .then((data: any[]) => {
        if (!data?.length) { setRows([]); setLoading(false); return; }
        const byMonth: Record<string, { subtotal: number; tax: number }> = {};
        for (const b of data) {
          if (!b.paid_at) continue;
          const month = b.paid_at.slice(0, 7); // YYYY-MM
          if (!byMonth[month]) byMonth[month] = { subtotal: 0, tax: 0 };
          byMonth[month].subtotal += Number(b.invoice_amount) || 0;
          byMonth[month].tax += Number(b.tax_amount) || 0;
        }
        const sorted = Object.entries(byMonth)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, { subtotal, tax }]) => ({
            month,
            subtotal: Math.round(subtotal * 100) / 100,
            tax: Math.round(tax * 100) / 100,
            total: Math.round((subtotal + tax) * 100) / 100,
          }));
        setRows(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-600 text-xs py-4">Loading tax data…</p>;
  if (!rows.length) return (
    <div className="bg-yellow-900/10 border border-yellow-800 px-4 py-3 mt-4">
      <p className="text-yellow-400 text-xs font-bold mb-1">No paid invoices yet</p>
      <p className="text-gray-500 text-xs">Once you mark jobs as PAID, your monthly tax summary will appear here automatically.</p>
    </div>
  );

  return (
    <div className="mt-4">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">📊 Monthly TPT Summary</p>
      <div className="space-y-2">
        {rows.map(r => {
          const [yr, mo] = r.month.split('-');
          const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return (
            <div key={r.month} className="border border-gray-800 bg-gray-900/40 px-4 py-3 space-y-1.5">
              <p className="text-white text-sm font-black">{label}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-900 border border-gray-800 px-2 py-2">
                  <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">Subtotal</p>
                  <p className="text-white text-sm font-mono font-bold">${r.subtotal.toFixed(2)}</p>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-800 px-2 py-2">
                  <p className="text-yellow-600 text-[10px] font-bold uppercase tracking-wider mb-0.5">Tax</p>
                  <p className="text-yellow-400 text-sm font-mono font-bold">${r.tax.toFixed(2)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-700 px-2 py-2">
                  <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">Total</p>
                  <p className="text-white text-sm font-mono font-bold">${r.total.toFixed(2)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div className="border border-gray-700 bg-gray-900/60 px-4 py-3 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-gray-600 text-[10px] uppercase tracking-wider">All Time</p><p className="text-gray-300 text-sm font-mono font-bold">${rows.reduce((s, r) => s + r.subtotal, 0).toFixed(2)}</p></div>
          <div><p className="text-yellow-700 text-[10px] uppercase tracking-wider">Tax</p><p className="text-yellow-400 text-sm font-mono font-bold">${rows.reduce((s, r) => s + r.tax, 0).toFixed(2)}</p></div>
          <div><p className="text-gray-600 text-[10px] uppercase tracking-wider">Total</p><p className="text-white text-sm font-mono font-bold">${rows.reduce((s, r) => s + r.total, 0).toFixed(2)}</p></div>
        </div>
      </div>
      <p className="text-gray-700 text-[10px] mt-2">File & remit at AZTaxes.gov by the 20th of the following month.</p>
    </div>
  );
}

// ── REVENUE PANEL (Hub) ──────────────────────────────────────────────────────
// Same payments-aware, fallback-to-paidAt accounting as JobsTab's monthRevenue,
// generalized to per-entry {date, amount} so it can be bucketed by day or month.
function revenueEntriesFor(b: any): { date: string; amount: number }[] {
  const payments = b.payments
    ? (typeof b.payments === 'string' ? JSON.parse(b.payments) : b.payments)
    : [];
  const loggedTotal = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const invoiceTotal = (Number(b.invoice_amount) || 0) + (Number(b.tax_amount) || 0);
  // If what's logged in payments[] actually covers the invoice, trust it
  // (preserves the real dates of partial payments split across periods).
  // Otherwise (missing/incomplete payments — e.g. the Stripe idempotent-retry
  // gap) fall back to a single entry on paid_at for the full invoice total.
  if (payments.length && loggedTotal >= invoiceTotal - 0.01) {
    return payments.map((p: any) => ({ date: p.at, amount: Number(p.amount) || 0 }));
  }
  if (b.paid_at) return [{ date: b.paid_at, amount: invoiceTotal }];
  return [];
}

function LineGraph({ points, valueFmt }: { points: { label: string; value: number }[]; valueFmt: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 220, PAD_L = 8, PAD_R = 8, PAD_T = 16, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...points.map(p => p.value));
  const n = points.length;
  const x = (i: number) => PAD_L + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v: number) => PAD_T + innerH - (innerH * v) / max;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;
  // Show every label if there are few points (months), thin them out for days
  const labelStep = n <= 12 ? 1 : Math.ceil(n / 8);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" preserveAspectRatio="none">
        {/* horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH * (1 - f)} y2={PAD_T + innerH * (1 - f)} stroke="#1f2937" strokeWidth="1" />
        ))}
        <path d={areaPath} fill="url(#revGrad)" opacity="0.25" />
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2.5" />
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3} fill="#34d399" stroke="#052e21" strokeWidth="1.5" />
            {/* invisible wide hit area for touch/hover */}
            <rect
              x={x(i) - (innerW / n) / 2} y={PAD_T} width={innerW / n || innerW} height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
        {points.map((p, i) => (
          i % labelStep === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#4b5563">{p.label}</text>
          ) : null
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div className="absolute top-1 right-1 bg-gray-950 border border-emerald-800 px-2.5 py-1.5 text-right pointer-events-none">
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">{points[hover].label}</p>
          <p className="text-emerald-400 text-sm font-mono font-bold">{valueFmt(points[hover].value)}</p>
        </div>
      )}
    </div>
  );
}

function RevenuePanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [yearOffset, setYearOffset] = useState(0);    // 0 = current year

  useEffect(() => {
    adminPost('paid-bookings')
      .then((data: any[]) => { setRows(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-600 text-xs py-8 text-center animate-pulse">Loading revenue…</p>;

  const allEntries = rows.flatMap(revenueEntriesFor).filter(e => e.date);

  const now = new Date();
  const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const targetYear = now.getFullYear() + yearOffset;

  let points: { label: string; value: number }[] = [];
  let periodLabel = '';
  let periodTotal = 0;

  if (mode === 'month') {
    const y = targetMonthDate.getFullYear(), m = targetMonthDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dailyTotals = new Array(daysInMonth).fill(0);
    for (const e of allEntries) {
      const d = new Date(e.date);
      if (d.getFullYear() === y && d.getMonth() === m) dailyTotals[d.getDate() - 1] += e.amount;
    }
    let running = 0;
    points = dailyTotals.map((amt, i) => { running += amt; return { label: String(i + 1), value: Math.round(running * 100) / 100 }; });
    periodLabel = targetMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    periodTotal = running;
  } else {
    const monthTotals = new Array(12).fill(0);
    for (const e of allEntries) {
      const d = new Date(e.date);
      if (d.getFullYear() === targetYear) monthTotals[d.getMonth()] += e.amount;
    }
    let running = 0;
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    points = monthTotals.map((amt, i) => { running += amt; return { label: MONTH_ABBR[i], value: Math.round(running * 100) / 100 }; });
    periodLabel = String(targetYear);
    periodTotal = running;
  }

  const hasAnyData = points.some(p => p.value > 0);

  return (
    <div>
      {/* Month / Year toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('month')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider border transition-colors ${mode === 'month' ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
        >By Month</button>
        <button
          onClick={() => setMode('year')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider border transition-colors ${mode === 'year' ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
        >By Year</button>
      </div>

      {/* Period nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => mode === 'month' ? setMonthOffset(o => o - 1) : setYearOffset(o => o - 1)}
          className="w-8 h-8 flex items-center justify-center border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors"
        >‹</button>
        <div className="text-center">
          <p className="text-white text-sm font-black">{periodLabel}</p>
          <p className="text-emerald-400 text-lg font-mono font-black">${periodTotal.toFixed(2)}</p>
        </div>
        <button
          onClick={() => mode === 'month' ? setMonthOffset(o => Math.min(0, o + 1)) : setYearOffset(o => Math.min(0, o + 1))}
          disabled={mode === 'month' ? monthOffset === 0 : yearOffset === 0}
          className="w-8 h-8 flex items-center justify-center border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-gray-800"
        >›</button>
      </div>

      {/* Graph */}
      <div className="border border-gray-800 bg-gray-900/40 p-3">
        {hasAnyData ? (
          <LineGraph points={points} valueFmt={n => `$${n.toFixed(2)}`} />
        ) : (
          <p className="text-gray-700 text-xs italic py-16 text-center">No paid revenue in this period.</p>
        )}
      </div>
      <p className="text-gray-700 text-[10px] mt-2">
        {mode === 'month' ? 'Cumulative revenue by day of month.' : 'Cumulative revenue by month of year.'} Tap/hover a point for that day/month's running total.
      </p>
    </div>
  );
}

// ── RECOVERY PANEL (Hub) ─────────────────────────────────────────────────────
function RecoveryPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [backups, setBackups] = useState<{ key: string; uploaded: string; sizeBytes: number }[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<any>(null);

  function load() {
    setLoading(true);
    adminPost('backup-status')
      .then(s => { setStatus(s); setLoading(false); })
      .catch(() => setLoading(false));
  }
  function loadBackups() {
    setBackupsLoading(true);
    adminPost('list-backups')
      .then(list => { setBackups(list || []); setBackupsLoading(false); if (list?.length) setSelectedKey(list[0].key); })
      .catch(() => setBackupsLoading(false));
  }
  useEffect(load, []);
  useEffect(loadBackups, []);

  async function runNow() {
    setRunning(true);
    setRunError(null);
    try {
      const s = await adminPost('run-backup');
      setStatus(s);
      loadBackups();
    } catch (e: any) {
      setRunError(e.message ?? 'Backup failed');
    }
    setRunning(false);
  }

  async function runRestore() {
    if (!selectedKey) return;
    if (restoreMode === 'replace' && confirmText.trim().toUpperCase() !== 'REPLACE') return;
    if (!confirm(
      restoreMode === 'replace'
        ? `This will DELETE everything currently in the database and replace it with the ${new Date(backups.find(b => b.key === selectedKey)?.uploaded ?? '').toLocaleString()} backup. This cannot be undone. Continue?`
        : `This will restore jobs/notes/settings from the ${new Date(backups.find(b => b.key === selectedKey)?.uploaded ?? '').toLocaleString()} backup, without deleting anything created since. Continue?`
    )) return;
    setRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const result = await adminPost('restore-backup', { key: selectedKey, mode: restoreMode, confirm: true });
      setRestoreResult(result);
      setConfirmText('');
    } catch (e: any) {
      await reportError(e, { source: 'RecoveryPanel.runRestore', key: selectedKey, mode: restoreMode });
      setRestoreError(e.message ?? 'Restore failed');
    }
    setRestoring(false);
  }

  const hoursAgo = status?.lastBackupAt ? (Date.now() - new Date(status.lastBackupAt).getTime()) / 3600000 : null;
  // Clear-as-day status: green if backed up in the last day, yellow within 2
  // days (probably just hasn't run yet today), red/never otherwise.
  const state: 'ok' | 'warn' | 'bad' = hoursAgo == null ? 'bad' : hoursAgo <= 26 ? 'ok' : hoursAgo <= 50 ? 'warn' : 'bad';
  const STATE_STYLE = {
    ok:   { bg: 'bg-emerald-900/20', border: 'border-emerald-700', text: 'text-emerald-400', label: '✅ Backed Up' },
    warn: { bg: 'bg-yellow-900/20',  border: 'border-yellow-700',  text: 'text-yellow-400',  label: '⚠️ Overdue' },
    bad:  { bg: 'bg-red-900/20',     border: 'border-red-700',     text: 'text-red-400',     label: hoursAgo == null ? '🚨 Never Backed Up' : '🚨 Backup Failing' },
  }[state];

  return (
    <div>
      {/* Big, unmissable status card */}
      <div className={`border-2 ${STATE_STYLE.border} ${STATE_STYLE.bg} p-5 mb-4`}>
        {loading ? (
          <p className="text-gray-500 text-sm animate-pulse">Checking backup status…</p>
        ) : (
          <>
            <p className={`text-lg font-black ${STATE_STYLE.text} mb-1`}>{STATE_STYLE.label}</p>
            {status?.lastBackupAt ? (
              <>
                <p className="text-gray-300 text-sm mb-0.5">
                  Last backup: <span className="font-mono">{new Date(status.lastBackupAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {' '}({hoursAgo! < 1 ? '<1 hr' : `${Math.round(hoursAgo!)} hr${Math.round(hoursAgo!) === 1 ? '' : 's'}`} ago)
                </p>
                <p className="text-gray-500 text-xs">
                  {status.totalRows} rows saved ({Object.entries(status.rowCounts || {}).map(([t, n]) => `${t}: ${n}`).join(', ')}) — {(status.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">No backup has ever run. Set up the scheduled job below, or run one now.</p>
            )}
          </>
        )}
      </div>

      <button
        onClick={runNow}
        disabled={running}
        className="w-full py-3 mb-2 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest transition-colors"
      >
        {running ? 'Running Backup…' : '🛟 Run Backup Now'}
      </button>
      {runError && <p className="text-red-400 text-xs mb-2">{runError}</p>}
      <button onClick={load} className="w-full py-2 text-[11px] font-bold uppercase tracking-wider text-gray-600 hover:text-gray-300 transition-colors">↺ Refresh Status</button>

      {/* Restore from a backup */}
      <div className="mt-6 border-t border-gray-800 pt-4">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Restore From Backup</p>

        {backupsLoading ? (
          <p className="text-gray-600 text-xs animate-pulse">Loading backups…</p>
        ) : backups.length === 0 ? (
          <p className="text-gray-700 text-xs italic">No backups available yet.</p>
        ) : (
          <>
            <select
              value={selectedKey}
              onChange={e => { setSelectedKey(e.target.value); setRestoreResult(null); setRestoreError(null); setConfirmText(''); }}
              className="w-full bg-gray-950 border border-gray-700 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 mb-3"
            >
              {backups.map(b => (
                <option key={b.key} value={b.key}>
                  {new Date(b.uploaded).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — {(b.sizeBytes / 1024).toFixed(0)} KB
                </option>
              ))}
            </select>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setRestoreMode('merge'); setConfirmText(''); }}
                className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider border transition-colors ${restoreMode === 'merge' ? 'bg-emerald-900/20 border-emerald-700 text-emerald-400' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
              >Merge (safe)</button>
              <button
                onClick={() => { setRestoreMode('replace'); setConfirmText(''); }}
                className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider border transition-colors ${restoreMode === 'replace' ? 'bg-red-900/20 border-red-700 text-red-400' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
              >Full Replace (danger)</button>
            </div>

            <p className="text-gray-600 text-[10px] mb-3 leading-relaxed">
              {restoreMode === 'merge'
                ? 'Restores every row from this backup, filling in anything missing or reverting anything changed — but never deletes jobs created after this backup ran.'
                : 'DELETES everything currently in the database, then loads exactly what was in this backup. Anything created after this backup was taken — new bookings, payments, notes — is gone permanently.'}
            </p>

            {restoreMode === 'replace' && (
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder='Type REPLACE to enable this button'
                className="w-full bg-gray-950 border border-red-800 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 mb-3 placeholder-gray-700"
              />
            )}

            <button
              onClick={runRestore}
              disabled={restoring || !selectedKey || (restoreMode === 'replace' && confirmText.trim().toUpperCase() !== 'REPLACE')}
              className={`w-full py-3 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-30 ${restoreMode === 'replace' ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
            >
              {restoring ? 'Restoring…' : restoreMode === 'replace' ? '⚠️ Wipe & Restore' : '↩ Restore (Merge)'}
            </button>
            {restoreError && <p className="text-red-400 text-xs mt-2">{restoreError}</p>}
            {restoreResult && (
              <div className="mt-2 border border-emerald-800 bg-emerald-900/10 px-3 py-2">
                <p className="text-emerald-400 text-xs font-bold">✅ Restore complete ({restoreResult.mode})</p>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  {Object.entries(restoreResult.rowCounts || {}).map(([t, n]) => `${t}: ${n}`).join(', ')}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 border-t border-gray-800 pt-4 space-y-2">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">One-time setup for daily auto-backups</p>
        <p className="text-gray-500 text-xs leading-relaxed">
          Cloudflare Pages Functions can't run on their own schedule, so a free external
          scheduler has to trigger it — this only needs to be set up once:
        </p>
        <ol className="text-gray-500 text-xs leading-relaxed list-decimal list-inside space-y-1">
          <li>Cloudflare Pages → Settings → Environment variables → add <span className="text-gray-300 font-mono">CRON_SECRET</span> (any long random string).</li>
          <li>At a free service like cron-job.org, create a daily job hitting:<br/>
            <span className="text-gray-300 font-mono break-all">https://gidgarage.com/cron-backup-database?key=YOUR_SECRET</span>
          </li>
          <li>Come back here after a day to confirm it went green.</li>
        </ol>
        <p className="text-gray-600 text-[10px] mt-2">
          Backups are stored as JSON in the same R2 bucket your job photos live in, under a <span className="font-mono">backups/</span> prefix, and kept for 30 days.
        </p>
        <p className="text-gray-600 text-[10px] mt-2">
          <strong className="text-gray-500">If the site itself is down/broken</strong> and you can't reach this panel: log into
          Cloudflare dashboard → R2 → your photos bucket → <span className="font-mono">backups/</span> folder, download the JSON
          file for the date you want, and hand it to me (or paste its contents) — I can restore it directly via Supabase's SQL
          editor as a last resort.
        </p>
      </div>
    </div>
  );
}

// ── CATEGORY PANEL ────────────────────────────────────────────────────────────
function HubCategoryPanel({ cat }: { cat: HubCategory }) {
  const { notes, loading, addNote, deleteNote, editNote } = usePersistentNotes(cat.id);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  function handleAdd() {
    const trimmed = newText.trim();
    if (!trimmed) return;
    addNote(trimmed);
    setNewText('');
  }

  function startEdit(note: HubNote) {
    setEditingId(note.id);
    setEditText(note.content);
  }

  function saveEdit() {
    if (!editingId) return;
    editNote(editingId, editText.trim());
    setEditingId(null);
  }

  if (loading) return <p className="text-gray-600 text-xs py-8 text-center animate-pulse">Loading…</p>;

  if (cat.id === 'revenue') return <RevenuePanel />;
  if (cat.id === 'recovery') return <RecoveryPanel />;

  return (
    <div>
      <div className="space-y-2 mb-4">
        {notes.length === 0 && (
          <p className="text-gray-700 text-xs italic py-6 text-center">No notes yet. Add one below.</p>
        )}
        {notes.map(note => (
          <div key={note.id} className={`border ${cat.border} ${cat.bg} px-4 py-3`}>
            {editingId === note.id ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={4}
                  className="w-full bg-gray-950 border border-gray-700 text-white text-sm px-3 py-2.5 outline-none focus:border-red-600 resize-y"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex-1 text-xs font-bold uppercase tracking-wider px-3 py-2.5 bg-red-600 hover:bg-red-500 text-white transition-colors">Save</button>
                  <button onClick={() => setEditingId(null)} className="flex-1 text-xs font-bold uppercase tracking-wider px-3 py-2.5 border border-gray-700 text-gray-400 hover:text-white transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-200 text-sm leading-relaxed mb-3">{note.content}</p>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(note)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 border border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 transition-colors active:bg-gray-800">Edit</button>
                  <button onClick={() => { if (confirm('Delete this note?')) deleteNote(note.id); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 border border-gray-800 text-gray-600 hover:text-red-400 hover:border-red-800 transition-colors active:bg-red-950">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tax summary auto-embedded in taxes tab */}
      {cat.id === 'taxes' && <TaxRateSettings />}
      {cat.id === 'taxes' && <TaxSummary />}
      {cat.id === 'taxes' && <JobsCSVExport />}
      {cat.id === 'taxes' && <InvoiceExport />}

      {/* Add note */}
      <div className="mt-5 space-y-2">
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 text-white text-sm px-3 py-3 outline-none focus:border-red-600 resize-none placeholder-gray-700 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-30 text-white text-xs font-bold uppercase tracking-widest transition-colors"
        >
          + Add Note
        </button>
      </div>
    </div>
  );
}

// ── BUSINESS HUB MAIN ─────────────────────────────────────────────────────────
export function BusinessHub() {
  const [activeId, setActiveId] = useState<string>('taxes');
  const [resetting, setResetting] = useState(false);
  const activeCat = HUB_CATEGORIES.find(c => c.id === activeId)!;

  function selectCat(id: string) {
    setActiveId(id);
  }

  async function resetAllNotes() {
    if (!confirm('Delete ALL hub notes and re-seed defaults? This cannot be undone.')) return;
    setResetting(true);
    try {
      // Delete all hub notes
      await adminPost('clear-notes');
      // Re-seed every category sequentially
      for (const cat of HUB_CATEGORIES) {
        const seeds = SEED_NOTES[cat.id] ?? [];
        for (let i = 0; i < seeds.length; i++) {
          const uid = `${cat.id}-s${i}-${Math.random().toString(36).slice(2, 9)}`;
          try { await adminPost('add-note', { id: uid, categoryId: cat.id, content: seeds[i] }); } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
    setResetting(false);
    window.location.reload();
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-3 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-red-600 text-xs font-bold uppercase tracking-[0.25em] mb-1">Admin · GID Garage</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Business Hub</h2>
        </div>
        <button
          onClick={resetAllNotes}
          disabled={resetting}
          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 border border-gray-800 text-gray-700 hover:border-red-800 hover:text-red-600 transition-colors disabled:opacity-40 flex-shrink-0 mt-1"
          title="Reset all notes to defaults"
        >
          {resetting ? 'Resetting…' : '↺ Reset'}
        </button>
      </div>

      {/* Mobile category picker — horizontal scroll chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
        {HUB_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => selectCat(cat.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border transition-colors whitespace-nowrap ${
              activeId === cat.id
                ? `${cat.bg} ${cat.border} ${cat.color}`
                : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Active category header */}
      <div className={`border ${activeCat.border} ${activeCat.bg} px-4 py-3 mb-4 flex items-center gap-3`}>
        <span className="text-xl">{activeCat.icon}</span>
        <h3 className={`text-base font-black ${activeCat.color}`}>{activeCat.label}</h3>
      </div>

      {/* Content */}
      <HubCategoryPanel cat={activeCat} />
    </div>
  );
}
