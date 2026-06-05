// ── GID GARAGE JOB OPS ──────────────────────────────────────────────────────
// Drop this file into src/ alongside BookingWidget.tsx
// In App.tsx, add the EstimatePage route and Jobs tab to AdminSchedule
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY as string;

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
  type: 'mobile' | 'labor' | 'parts' | 'fixed' | 'other';
}

export interface JobPhoto {
  id: string;
  dataUrl: string;
  note: string;
  takenAt: string;
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
  // signing
  preExistingDamage: string;
  customerAgreed: boolean;
  customerSignature: string;
  signedAt: string | null;
  // payment
  invoiceAmount: number | null;
  stripeTransactionId: string;
  stripeCustomerId: string;
  stripeLast4: string;
  paidAt: string | null;
  // photos
  jobPhotos: JobPhoto[];
}

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────

async function sbFetch(path: string, options: RequestInit = {}) {
  const isPatch = options.method === 'PATCH' || options.method === 'DELETE';
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': isPatch ? 'return=minimal' : 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  if (isPatch) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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
    preExistingDamage: b.pre_existing_damage || '',
    customerAgreed: b.customer_agreed || false,
    customerSignature: b.customer_signature || '',
    signedAt: b.signed_at || null,
    invoiceAmount: b.invoice_amount ?? null,
    stripeTransactionId: b.stripe_transaction_id || '',
    stripeCustomerId: b.stripe_customer_id || '',
    stripeLast4: b.stripe_last4 || '',
    paidAt: b.paid_at || null,
    jobPhotos: b.job_photos ? (typeof b.job_photos === 'string' ? JSON.parse(b.job_photos) : b.job_photos) : [],
  };
}

export async function getAllJobs(): Promise<Job[]> {
  const data = await sbFetch('/bookings?select=*&order=date.desc,time.desc');
  return (data || []).map(mapJob);
}

export async function getJobById(id: string): Promise<Job | null> {
  const data = await sbFetch(`/bookings?id=eq.${id}&select=*`);
  if (!data || data.length === 0) return null;
  return mapJob(data[0]);
}

async function patchJob(id: string, fields: Record<string, any>) {
  await sbFetch(`/bookings?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// ── BREVO: SEND ESTIMATE EMAIL ────────────────────────────────────────────────

async function sendEstimateEmail(job: Job, shopAvg: number = 0) {
  const estimateUrl = `${window.location.origin}/estimate?id=${job.id}`;
  const dateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const savings = shopAvg > 0 ? shopAvg - (job.estimateAmount || 0) : 0;

  const lineItemsHtml = job.lineItems?.length
    ? job.lineItems.map(item => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${item.label}</td>
          <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">${item.amount === 0 ? 'FREE' : '$' + item.amount.toFixed(2)}</td>
        </tr>`).join('')
    : `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${resolveServiceName(job.service, job.notes)}</td>
       <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">$${job.estimateAmount?.toFixed(2)}</td></tr>`;

  const savingsHtml = savings > 10 ? `
    <table style="width:100%;background:#052e16;border:1px solid #166534;border-radius:4px;margin-bottom:24px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px;">
          <p style="color:#4ade80;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 2px;">vs. Flagstaff Shops</p>
          <p style="color:#6b7280;font-size:12px;margin:0;">They'd charge ~$${shopAvg.toFixed(2)}</p>
        </td>
        <td style="padding:16px;text-align:right;white-space:nowrap;">
          <p style="color:#4ade80;font-size:24px;font-weight:900;margin:0;">Save $${savings.toFixed(2)}</p>
        </td>
      </tr>
    </table>` : '';

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
      to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
      subject: `Your GID Garage Estimate — ${job.vehicle}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;border-radius:4px;">
          <img src="https://gidgarage.com/website_logo.png" alt="GID Garage" style="height:48px;margin-bottom:24px;" />
          <h2 style="color:#fff;font-size:22px;margin:0 0 8px;">Your Estimate is Ready</h2>
          <p style="color:#9ca3af;margin:0 0 16px;">Hi ${job.fname}, here's your quote for the upcoming appointment.</p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Vehicle</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">${job.vehicle}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Appointment</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">${dateStr} at ${job.time}</td></tr>
            ${lineItemsHtml}
            <tr><td style="padding:10px 0 0;color:#fff;font-size:14px;font-weight:bold;">Total</td>
                <td style="padding:10px 0 0;color:#ef4444;font-size:20px;font-weight:900;text-align:right;">$${job.estimateAmount?.toFixed(2)}</td></tr>
          </table>

          ${job.estimateNotes ? `<p style="color:#9ca3af;font-size:13px;margin:16px 0;padding:12px;background:#1f2937;border-left:3px solid #ef4444;">${job.estimateNotes}</p>` : ''}

          <a href="${estimateUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin:16px 0 24px;">
            Review &amp; Approve Estimate &rarr;
          </a>

          ${savingsHtml}

          <p style="color:#4b5563;font-size:12px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p>
        </div>
      `,
    }),
  });
}


// ── BREVO: SEND INVOICE EMAIL ─────────────────────────────────────────────────

async function sendInvoiceEmail(job: Job) {
  const invoiceUrl = `${window.location.origin}/invoice?id=${job.id}`;
  const amount = job.invoiceAmount ?? job.estimateAmount;

  const lineItemsHtml = job.lineItems?.length
    ? job.lineItems.map(item => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${item.label}</td>
          <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">${item.amount === 0 ? 'FREE' : '$' + item.amount.toFixed(2)}</td>
        </tr>`).join('')
    : `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${resolveServiceName(job.service, job.notes)}</td>
       <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">$${amount?.toFixed(2)}</td></tr>`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
      to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
      subject: `Your GID Garage Invoice — ${job.vehicle}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;border-radius:4px;">
          <img src="https://gidgarage.com/website_logo.png" alt="GID Garage" style="height:48px;margin-bottom:24px;" />
          <h2 style="color:#fff;font-size:22px;margin:0 0 8px;">Invoice from GID Garage</h2>
          <p style="color:#9ca3af;margin:0 0 16px;">Hi ${job.fname}, thank you for choosing GID Garage. Here is your invoice.</p>
          <a href="${invoiceUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
            View Invoice
          </a>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #374151;color:#6b7280;font-size:13px;">Vehicle</td>
                <td style="padding:8px 0;border-bottom:1px solid #374151;color:#fff;font-size:13px;text-align:right;">${job.vehicle}</td></tr>
            ${lineItemsHtml}
            <tr><td style="padding:10px 0 0;color:#fff;font-size:14px;font-weight:bold;">Total Due</td>
                <td style="padding:10px 0 0;color:#ef4444;font-size:22px;font-weight:900;text-align:right;">$${amount?.toFixed(2)}</td></tr>
          </table>
          <p style="color:#4b5563;font-size:12px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p>
        </div>
      `,
    }),
  });
}

// ── BREVO: SEND RECEIPT EMAIL ─────────────────────────────────────────────────

async function sendReceiptEmail(job: Job) {
  const invoiceUrl = `${window.location.origin}/invoice?id=${job.id}`;
  const paidDate = job.paidAt
    ? new Date(job.paidAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
      to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
      subject: `Payment Receipt — GID Garage`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;border-radius:4px;">
          <img src="https://gidgarage.com/website_logo.png" alt="GID Garage" style="height:48px;margin-bottom:24px;" />
          <div style="background:#052e16;border:1px solid #166534;padding:16px;margin-bottom:24px;border-radius:4px;">
            <p style="color:#4ade80;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Payment Received</p>
            <p style="color:#fff;font-size:28px;font-weight:900;margin:0;">$${job.invoiceAmount?.toFixed(2)}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Service</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${resolveServiceName(job.service, job.notes)}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Vehicle</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${job.vehicle}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Date Paid</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${paidDate}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Transaction ID</td>
                <td style="padding:8px 0;color:#9ca3af;font-size:12px;font-family:monospace;">${job.stripeTransactionId}</td></tr>
          </table>
          <a href="${invoiceUrl}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
            View Receipt
          </a>
          <p style="color:#4b5563;font-size:12px;margin:0;">Thank you for your business! — GID Garage &middot; 480-757-0476</p>
        </div>
      `,
    }),
  });
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

const SMALL_MAKES = ['honda','toyota','nissan','hyundai','kia','mazda','subaru','mitsubishi','vw','volkswagen','mini','fiat','smart'];
const MID_MAKES   = ['honda','toyota','nissan','hyundai','kia','mazda','subaru','ford','chevrolet','chevy','gmc','dodge','chrysler','jeep','buick','acura','infiniti','lexus','lincoln','cadillac','volvo','audi','bmw','mercedes','mercedes-benz','genesis','volkswagen','vw'];

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

// Flat legacy alias for audio/fixed services that don't vary by vehicle
const SHOP_AVERAGES: Record<string, number> = Object.fromEntries(
  Object.entries(SHOP_AVERAGES_TIERED).map(([k, v]) => [k, v[1]]) // default to tier 2
);

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
      items.push({ id: 'oil_labor', label: `Oil Change — Full Synthetic (5qt)`, amount: 79.99, type: 'fixed' });
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
  const savings = shopTotal > 0 ? shopTotal - total : 0;
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
                {item.amount === 0 ? 'FREE' : `$${item.amount.toFixed(2)}`}
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

function PhotoPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [photos, setPhotos] = useState<JobPhoto[]>(job.jobPhotos || []);
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const newPhoto: JobPhoto = {
          id: Math.random().toString(36).slice(2),
          dataUrl: ev.target?.result as string,
          note: '',
          takenAt: new Date().toISOString(),
        };
        setPhotos(prev => [...prev, newPhoto]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function updateNote(id: string, note: string) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, note } : p));
  }

  function deletePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  async function savePhotos() {
    setSaving(true);
    await patchJob(job.id, { job_photos: JSON.stringify(photos) });
    onUpdate({ ...job, jobPhotos: photos });
    setSaving(false);
  }

  const hasChanges = JSON.stringify(photos) !== JSON.stringify(job.jobPhotos || []);

  return (
    <div className="space-y-4">
      {/* Capture buttons — two separate so library is always accessible */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 cursor-pointer transition-colors">
          <span className="text-xl">📷</span>
          <span className="text-xs font-bold uppercase tracking-widest">Camera</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleCapture}
          />
        </label>
        <label className="flex flex-col items-center justify-center gap-1.5 bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 cursor-pointer transition-colors">
          <span className="text-xl">🖼️</span>
          <span className="text-xs font-bold uppercase tracking-widest">Library</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleCapture}
          />
        </label>
      </div>
      <p className="text-gray-700 text-xs text-center">Add notes per photo after uploading</p>

      {/* Photo grid */}
      {photos.length === 0 && (
        <div className="text-center py-8 text-gray-700 text-sm">No photos yet</div>
      )}

      <div className="space-y-3">
        {photos.map((photo) => (
          <div key={photo.id} className="bg-gray-900 border border-gray-800">
            <div className="relative">
              <img src={photo.dataUrl} alt="Job photo" className="w-full max-h-48 object-cover" />
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
          onClick={savePhotos}
          disabled={saving || !hasChanges}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
        >
          {saving ? 'Saving…' : hasChanges ? 'Save Photos & Notes' : '✓ Saved'}
        </button>
      )}
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
  const alreadySent = job.jobStatus === 'ESTIMATE_SENT' || job.jobStatus === 'SIGNED' || job.jobStatus === 'IN_PROGRESS' || job.jobStatus === 'COMPLETED' || job.jobStatus === 'INVOICED' || job.jobStatus === 'PAID';
  const [showCalc, setShowCalc] = useState(!job.lineItems?.length);
  const [shopAvg, setShopAvg] = useState(0);
  const [showShopComparison, setShowShopComparison] = useState(true);

  const total = lineItems.reduce((s, i) => s + i.amount, 0);

  function handleApplyCalc(items: LineItem[], calcTotal: number, calcShopAvg: number) {
    setLineItems(items);
    setShopAvg(calcShopAvg);
    setShowCalc(false);
  }

  function updateLineItem(id: string, field: 'label' | 'amount', value: string) {
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : i));
  }

  function removeLineItem(id: string) {
    if (id === 'mobile') return; // can't remove mobile fee
    setLineItems(prev => prev.filter(i => i.id !== id));
  }

  function addLineItem() {
    setLineItems(prev => [...prev, { id: Math.random().toString(36).slice(2), label: '', amount: 0, type: 'other' }]);
  }

  async function saveEstimate() {
    setSaving(true);
    await patchJob(job.id, {
      estimate_amount: total,
      estimate_notes: notes,
      line_items: JSON.stringify(lineItems),
    });
    onUpdate({ ...job, estimateAmount: total, estimateNotes: notes, lineItems });
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
    });
    const updated = { ...job, estimateAmount: total, estimateNotes: notes, lineItems, jobStatus: 'ESTIMATE_SENT' as JobStatus };
    await sendEstimateEmail(updated, showShopComparison ? shopAvg : 0);
    onUpdate(updated);
    setSending(false);
    setSent(true);
  }

  const canSend = total > 0 && !!job.email;
  const savings = shopAvg > 0 ? shopAvg - total : 0;

  return (
    <div className="space-y-5">
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
          {lineItems.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="text"
                value={item.label}
                onChange={e => updateLineItem(item.id, 'label', e.target.value)}
                placeholder="Description"
                disabled={item.id === 'mobile'}
                className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs focus:border-red-600 outline-none disabled:opacity-50"
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-gray-600 text-xs">$</span>
                <input
                  type="number"
                  value={item.amount}
                  onChange={e => updateLineItem(item.id, 'amount', e.target.value)}
                  disabled={item.id === 'mobile'}
                  className="w-20 bg-gray-800 border border-gray-700 text-white px-2 py-1.5 text-xs font-mono focus:border-red-600 outline-none disabled:opacity-50"
                />
              </div>
              {item.id !== 'mobile' && (
                <button onClick={() => removeLineItem(item.id)} className="text-gray-700 hover:text-red-500 text-sm transition-colors w-5">×</button>
              )}
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between border-t border-gray-700 mt-3 pt-3">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total</span>
          <span className="text-white text-sm font-black">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Savings callout if shop avg set */}
      {savings > 0 && (
        <div className="space-y-1">
          <div className="bg-emerald-900/20 border border-emerald-700 px-4 py-3 flex items-center justify-between">
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Customer saves vs shops</p>
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

      {/* Scope notes */}
      <div>
        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Scope Notes <span className="text-gray-700 normal-case font-normal">(shown to customer)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
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

function PaymentPanel({ job, onUpdate, onRequote }: { job: Job; onUpdate: (j: Job) => void; onRequote?: () => void }) {
  const [invoiceAmt, setInvoiceAmt] = useState(job.invoiceAmount?.toString() ?? job.estimateAmount?.toString() ?? '');
  const [stripeId, setStripeId] = useState(job.stripeTransactionId);
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeConfirm, setChargeConfirm] = useState(false);

  const hasCardOnFile = !!job.stripeCustomerId;
  const finalAmount = parseFloat(invoiceAmt) || job.estimateAmount || 0;

  async function chargeCardOnFile() {
    if (!hasCardOnFile || !finalAmount) return;
    setCharging(true);
    setChargeError(null);
    try {
      const res = await fetch('/charge-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: job.stripeCustomerId,
          amountCents: Math.round(finalAmount * 100),
          description: `GID Garage — ${job.service} — ${job.vehicle}`,
          bookingId: job.id,
        }),
      });
      const data = await res.json() as any;
      // already_paid = idempotent success — treat it as paid
      if (data.error && data.error !== 'already_paid') throw new Error(data.error);
      if (data.error === 'already_paid') {
        onUpdate({ ...job, jobStatus: 'PAID' as JobStatus, stripeTransactionId: data.chargeId });
        setCharging(false);
        setChargeConfirm(false);
        return;
      }

      // Send receipt email
      const updated = {
        ...job,
        invoiceAmount: finalAmount,
        stripeTransactionId: data.chargeId,
        paidAt: new Date().toISOString(),
        jobStatus: 'PAID' as JobStatus,
        status: 'completed',
      };
      await sendReceiptEmail(updated);
      onUpdate(updated);
    } catch (e: any) {
      setChargeError(e.message ?? 'Charge failed. Try again or use manual entry.');
    }
    setCharging(false);
    setChargeConfirm(false);
  }

  async function markPaid() {
    if (!stripeId) return;
    setSaving(true);
    const paidAt = new Date().toISOString();
    if (job.jobStatus !== 'INVOICED') {
      await patchJob(job.id, { job_status: 'INVOICED', invoice_amount: finalAmount });
      await sendInvoiceEmail({ ...job, jobStatus: 'INVOICED' as JobStatus, invoiceAmount: finalAmount });
    }
    await patchJob(job.id, {
      invoice_amount: finalAmount,
      stripe_transaction_id: stripeId,
      paid_at: paidAt,
      job_status: 'PAID',
      status: 'completed',
    });
    onUpdate({ ...job, invoiceAmount: finalAmount, stripeTransactionId: stripeId, paidAt, jobStatus: 'PAID' as JobStatus, status: 'completed' });
    setSaving(false);
  }

  async function markInvoiced() {
    setSaving(true);
    await patchJob(job.id, { job_status: 'INVOICED', invoice_amount: finalAmount });
    const updated = { ...job, jobStatus: 'INVOICED' as JobStatus, invoiceAmount: finalAmount };
    await sendInvoiceEmail(updated);
    onUpdate(updated);
    setSaving(false);
  }

  if (job.jobStatus === 'PAID') {
    return (
      <div className="bg-emerald-900/20 border border-emerald-800 p-5 space-y-2">
        <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">✓ Paid</p>
        <p className="text-white text-2xl font-black">${job.invoiceAmount?.toFixed(2)}</p>
        <p className="text-gray-500 text-xs font-mono">{job.stripeTransactionId}</p>
        <p className="text-gray-600 text-xs">{job.paidAt ? new Date(job.paidAt).toLocaleString() : ''}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          {job.estimateAmount && <span className="text-gray-600 text-xs">Estimate was ${job.estimateAmount.toFixed(2)}</span>}
        </div>
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
              disabled={!finalAmount || charging}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold uppercase tracking-widest py-3 transition-colors"
            >
              💳 Charge ${finalAmount.toFixed(2)} to Card on File
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-yellow-400 text-xs font-bold">Confirm charge of ${finalAmount.toFixed(2)} to •••• {job.stripeLast4}?</p>
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
    ? new Date(job.signedAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
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
                    <div key={item.id} className="flex justify-between px-4 py-2">
                      <span className="text-gray-300 text-sm">{item.label}</span>
                      <span className="text-white text-sm font-mono">{item.amount === 0 ? 'FREE' : `$${item.amount.toFixed(2)}`}</span>
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

// ── JOB DETAIL PANEL ──────────────────────────────────────────────────────────

const JOB_PIPELINE: JobStatus[] = ['BOOKED', 'ESTIMATE_SENT', 'SIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'];

function JobDetailPanel({ job: initialJob, onClose, onJobUpdate }: {
  job: Job;
  onClose: () => void;
  onJobUpdate: (j: Job) => void;
}) {
  const [job, setJob] = useState(initialJob);
  const [tab, setTab] = useState<'overview' | 'estimate' | 'payment' | 'photos'>('overview');

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
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-xl bg-gray-950 border-l border-gray-800 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <p className="text-red-500 text-xs font-bold uppercase tracking-widest mb-0.5">Job Detail</p>
            <h2 className="text-white font-black text-lg">{job.fname} {job.lname}</h2>
            <p className="text-gray-500 text-sm">{job.vehicle} · {dateStr}</p>
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
          {(['overview', 'estimate', 'payment', 'photos'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-bold uppercase tracking-widest px-5 py-3 transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-red-600 text-white' : 'border-transparent text-gray-600 hover:text-gray-300'
              }`}>
              {t === 'overview' ? '📋 Overview' : t === 'estimate' ? '📝 Estimate' : t === 'payment' ? '💳 Payment' : `📷 Photos${job.jobPhotos?.length ? ` (${job.jobPhotos.length})` : ''}`}
            </button>
          ))}
        </div>

        <div className="px-6 py-6">

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Customer & Job info */}
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
              </div>

              {/* Signature info if signed */}
              {job.customerAgreed && (
                <SignedDocSection job={job} />
              )}

              {/* Payment summary if paid */}
              {job.jobStatus === 'PAID' && (
                <div className="bg-emerald-900/20 border border-emerald-800 p-4 space-y-1">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">✓ Paid</p>
                  <p className="text-white text-2xl font-black">${job.invoiceAmount?.toFixed(2)}</p>
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
                </div>
              </div>
            </div>
          )}

          {/* ESTIMATE TAB */}
          {tab === 'estimate' && <EstimatePanel job={job} onUpdate={handleUpdate} />}

          {/* PAYMENT TAB */}
          {tab === 'payment' && <PaymentPanel job={job} onUpdate={handleUpdate} onRequote={() => setTab('estimate')} />}

          {/* PHOTOS TAB */}
          {tab === 'photos' && <PhotoPanel job={job} onUpdate={handleUpdate} />}
        </div>
      </div>
    </div>
  );
}

// ── JOBS TAB (pipeline board) ─────────────────────────────────────────────────

export function JobsTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Job | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'ALL'>('ALL');

  useEffect(() => {
    getAllJobs().then(data => { setJobs(data); setLoading(false); });
    // Poll every 10s — fast enough to catch SIGNED status without manual refresh
    const interval = setInterval(() => {
      getAllJobs().then(data => {
        setJobs(data);
        // Update selected job if open so status/sig reflects immediately
        setSelected(prev => prev ? (data.find(j => j.id === prev.id) ?? prev) : null);
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  function handleJobUpdate(updated: Job) {
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setSelected(updated);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Stats
  const unpaid = jobs.filter(j => j.jobStatus === 'COMPLETED' || j.jobStatus === 'INVOICED').length;
  const awaitingSign = jobs.filter(j => j.jobStatus === 'ESTIMATE_SENT').length;
  const paidThisMonth = jobs.filter(j => {
    if (j.jobStatus !== 'PAID' || !j.paidAt) return false;
    const m = new Date(j.paidAt).getMonth();
    const y = new Date(j.paidAt).getFullYear();
    const now = new Date();
    return m === now.getMonth() && y === now.getFullYear();
  });
  const monthRevenue = paidThisMonth.reduce((sum, j) => sum + (j.invoiceAmount || 0), 0);

  const filtered = jobs.filter(j => {
    const matchStatus = filterStatus === 'ALL' || j.jobStatus === filterStatus;
    const matchSearch = !search || `${j.fname} ${j.lname} ${j.vehicle} ${j.phone}`.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          ['Unpaid / Due', unpaid, 'text-yellow-400'],
          ['Awaiting Signature', awaitingSign, 'text-purple-400'],
          ['Jobs This Month', paidThisMonth.length, 'text-green-400'],
          ['Revenue This Month', `$${monthRevenue.toFixed(0)}`, 'text-emerald-400'],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="bg-gray-900 border border-gray-800 p-5">
            <div className={`text-2xl font-black ${cls} mb-1`}>{val}</div>
            <div className="text-gray-600 text-xs font-bold uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, vehicle, phone…"
          className="bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm focus:border-red-600 outline-none flex-1 min-w-48"
        />
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

      {!loading && filtered.length === 0 && (
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
              onClick={() => setSelected(job)}
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
    </div>
  );
}

// ── INVOICE / RECEIPT PAGE (customer-facing) ──────────────────────────────────

export function InvoicePage() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('id');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    getJobById(jobId).then(j => {
      if (!j) setNotFound(true);
      else setJob(j);
      setLoading(false);
    });
  }, [jobId]);

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
  const serviceDateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const paidDateStr = job.paidAt
    ? new Date(job.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const invoiceNumber = job.id.startsWith('GID-') ? job.id : `GID-${job.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#0f0f0f] py-12 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <a href="/">
            <img src="/website_logo.png" alt="GID Garage" className="h-10 w-auto" />
          </a>
          <div className="text-right">
            {isPaid
              ? <span className="inline-block bg-emerald-900/40 border border-emerald-700 text-emerald-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5">✓ Paid</span>
              : <span className="inline-block bg-yellow-900/40 border border-yellow-700 text-yellow-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5">Amount Due</span>
            }
          </div>
        </div>

        {/* Invoice card */}
        <div className="bg-white/5 border border-white/10">

          {/* Title row */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-0.5">{isPaid ? 'Receipt' : 'Invoice'}</p>
              <p className="text-white font-mono text-sm">{invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-black ${isPaid ? 'text-emerald-400' : 'text-red-400'}`}>${amount?.toFixed(2)}</p>
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
                  <div key={item.id} className="flex justify-between px-6 py-2.5">
                    <span className="text-gray-300 text-sm">{item.label}</span>
                    <span className={`text-sm font-mono font-bold ${item.amount === 0 ? 'text-gray-600' : 'text-white'}`}>
                      {item.amount === 0 ? 'FREE' : `$${item.amount.toFixed(2)}`}
                    </span>
                  </div>
                ))}
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
          <div className={`px-6 py-5 border-t border-white/10 flex items-center justify-between ${isPaid ? 'bg-emerald-900/10' : 'bg-red-900/10'}`}>
            <span className="text-white font-bold uppercase tracking-wider text-sm">{isPaid ? 'Total Paid' : 'Total Due'}</span>
            <span className={`text-2xl font-black ${isPaid ? 'text-emerald-400' : 'text-red-400'}`}>${amount?.toFixed(2)}</span>
          </div>
        </div>

        {/* Signed disclaimer */}
        {job.customerAgreed && (
          <div className="mt-4 px-4 py-3 border border-white/10 bg-white/5">
            <p className="text-gray-600 text-xs">Estimate approved by <strong className="text-gray-400">{job.customerSignature}</strong>
              {job.signedAt ? ` on ${new Date(job.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
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

        {/* Job photos if present */}
        {job.jobPhotos?.length > 0 && (
          <div className="mt-4 border border-white/10 bg-white/5 px-6 py-4">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Job Photos</p>
            <div className="space-y-3">
              {job.jobPhotos.map(photo => (
                <div key={photo.id}>
                  <img src={photo.dataUrl} alt="Job photo" className="w-full max-h-64 object-cover" />
                  {photo.note && <p className="text-gray-400 text-xs mt-1">{photo.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download / Save button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.print()}
            className="border border-white/20 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-8 py-3 transition-colors"
          >
            🖨 Save / Print Receipt
          </button>
        </div>

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
    getJobById(jobId).then(j => {
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
      await patchJob(job.id, {
        pre_existing_damage: damage,
        customer_agreed: true,
        customer_signature: signature.trim(),
        signed_at: new Date().toISOString(),
        job_status: 'SIGNED',
      });
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
        <a href="/" className="flex justify-center mb-8">
          <img src="/website_logo.png" alt="GID Garage" className="h-12 w-auto" />
        </a>

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
                    <div key={item.id} className="flex justify-between px-4 py-3">
                      <span className="text-gray-300 text-sm">{item.label}</span>
                      <span className={`text-sm font-mono font-bold ${item.amount === 0 ? 'text-gray-600' : 'text-white'}`}>
                        {item.amount === 0 ? 'FREE' : `$${item.amount.toFixed(2)}`}
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
              <div className="flex justify-between px-4 py-4">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total</span>
                <span className="text-red-400 text-2xl font-black">${job.estimateAmount?.toFixed(2)}</span>
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
