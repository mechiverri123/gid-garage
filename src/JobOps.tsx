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
  paidAt: string | null;
  // photos
  jobPhotos: JobPhoto[];
}

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────

async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
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
    <div style="background:#052e16;border:1px solid #166534;padding:16px;margin-bottom:24px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <p style="color:#4ade80;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 2px;">vs. Flagstaff Shops</p>
        <p style="color:#6b7280;font-size:12px;margin:0;">They'd charge ~$${shopAvg.toFixed(2)}</p>
      </div>
      <p style="color:#4ade80;font-size:24px;font-weight:900;margin:0;">Save $${savings.toFixed(2)}</p>
    </div>` : '';

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
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${job.fname}, here's your quote for the upcoming appointment.</p>

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

          ${savingsHtml}

          <a href="${estimateUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
            Review &amp; Approve Estimate →
          </a>

          <p style="color:#4b5563;font-size:12px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p>
        </div>
      `,
    }),
  });
}


  const estimateUrl = `${window.location.origin}/estimate?id=${job.id}`;
  const dateStr = new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

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
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${job.fname}, here's your quote for the upcoming appointment.</p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Service</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${resolveServiceName(job.service, job.notes)}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Vehicle</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${job.vehicle}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#6b7280;font-size:13px;">Appointment</td>
                <td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;">${dateStr} at ${job.time}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Estimate</td>
                <td style="padding:8px 0;color:#ef4444;font-size:18px;font-weight:bold;">$${job.estimateAmount?.toFixed(2)}</td></tr>
          </table>

          ${job.estimateNotes ? `<p style="color:#9ca3af;font-size:13px;margin-bottom:24px;padding:12px;background:#1f2937;border-left:3px solid #ef4444;">${job.estimateNotes}</p>` : ''}

          <a href="${estimateUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
            Review &amp; Approve Estimate →
          </a>

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
          <p style="color:#9ca3af;margin:0 0 24px;">Hi ${job.fname}, thank you for choosing GID Garage. Here is your invoice.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #374151;color:#6b7280;font-size:13px;">Vehicle</td>
                <td style="padding:8px 0;border-bottom:1px solid #374151;color:#fff;font-size:13px;text-align:right;">${job.vehicle}</td></tr>
            ${lineItemsHtml}
            <tr><td style="padding:10px 0 0;color:#fff;font-size:14px;font-weight:bold;">Total Due</td>
                <td style="padding:10px 0 0;color:#ef4444;font-size:22px;font-weight:900;text-align:right;">$${amount?.toFixed(2)}</td></tr>
          </table>
          <a href="${invoiceUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
            View Invoice
          </a>
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

const CYA_TERMS = [
  'Price is as quoted. Any additional work requires your approval before proceeding.',
  'Payment is due in full at time of completion.',
  'GID Garage is not responsible for pre-existing conditions unrelated to the service performed.',
  'Parts carry manufacturer warranty. Labor is warranted for 30 days from date of service.',
];

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

// Flagstaff shop averages per axle where applicable
const SHOP_AVERAGES: Record<string, number> = {
  oil:                    95,
  diag:                   100,
  full:                   0,
  brakes_pads:            175,   // per axle
  brakes_pads_rotors:     350,   // per axle
  brakes_full:            425,   // per axle
  suspension_struts_front: 500,  // pair
  suspension_struts_rear:  350,  // pair
  suspension_control_arms: 350,  // each
  suspension_tie_rods:     280,  // each
  suspension_cv_axles:     350,  // each
  audio_head_unit:         150,
  audio_speakers:          200,
  audio_head_unit_supplied: 100,
  audio_4ch_amp:           200,
  audio_mono_amp:          175,
  audio_full_system:       800,
};

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

interface AxleConfig {
  frontEnabled: boolean;
  rearEnabled: boolean;
  frontPartsCost: string;
  rearPartsCost: string;
  frontLaborHours: number;
  rearLaborHours: number;
  frontLabel: string;
  rearLabel: string;
  frontShopAvg: number;
  rearShopAvg: number;
}

function AxleSchematic({ config, onChange }: { config: AxleConfig; onChange: (c: AxleConfig) => void }) {
  return (
    <div className="bg-gray-900 border border-gray-700 p-4 space-y-4">
      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Axle Configuration</p>

      {/* Vehicle diagram */}
      <div className="flex flex-col items-center gap-2 py-2">
        {/* Front axle */}
        <div className="flex items-center gap-3 w-full max-w-xs">
          <button
            onClick={() => onChange({ ...config, frontEnabled: !config.frontEnabled })}
            className={`w-8 h-14 rounded-sm border-2 flex items-center justify-center text-[10px] font-black transition-all ${config.frontEnabled ? 'border-red-500 bg-red-900/30 text-red-400' : 'border-gray-700 bg-gray-800 text-gray-600'}`}
          >LF</button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wider">Front</span>
            <div className={`w-full h-0.5 ${config.frontEnabled ? 'bg-red-600' : 'bg-gray-700'}`} />
            {config.frontEnabled && (
              <div className="w-full space-y-1 mt-1">
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 text-[10px] w-12">Parts $</span>
                  <input
                    type="number"
                    value={config.frontPartsCost}
                    onChange={e => onChange({ ...config, frontPartsCost: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 text-[10px] w-12">Hrs</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.frontLaborHours}
                    onChange={e => onChange({ ...config, frontLaborHours: parseFloat(e.target.value) || 0 })}
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => onChange({ ...config, frontEnabled: !config.frontEnabled })}
            className={`w-8 h-14 rounded-sm border-2 flex items-center justify-center text-[10px] font-black transition-all ${config.frontEnabled ? 'border-red-500 bg-red-900/30 text-red-400' : 'border-gray-700 bg-gray-800 text-gray-600'}`}
          >RF</button>
        </div>

        {/* Vehicle body */}
        <div className="w-16 h-20 border-2 border-gray-700 bg-gray-800/50 rounded-sm flex items-center justify-center">
          <span className="text-gray-600 text-[10px] font-bold">🚗</span>
        </div>

        {/* Rear axle */}
        <div className="flex items-center gap-3 w-full max-w-xs">
          <button
            onClick={() => onChange({ ...config, rearEnabled: !config.rearEnabled })}
            className={`w-8 h-14 rounded-sm border-2 flex items-center justify-center text-[10px] font-black transition-all ${config.rearEnabled ? 'border-blue-500 bg-blue-900/30 text-blue-400' : 'border-gray-700 bg-gray-800 text-gray-600'}`}
          >LR</button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full h-0.5 ${config.rearEnabled ? 'bg-blue-600' : 'bg-gray-700'}`} />
            <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wider">Rear</span>
            {config.rearEnabled && (
              <div className="w-full space-y-1 mt-1">
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 text-[10px] w-12">Parts $</span>
                  <input
                    type="number"
                    value={config.rearPartsCost}
                    onChange={e => onChange({ ...config, rearPartsCost: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 text-[10px] w-12">Hrs</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.rearLaborHours}
                    onChange={e => onChange({ ...config, rearLaborHours: parseFloat(e.target.value) || 0 })}
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-2 py-1 text-xs font-mono focus:border-red-600 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => onChange({ ...config, rearEnabled: !config.rearEnabled })}
            className={`w-8 h-14 rounded-sm border-2 flex items-center justify-center text-[10px] font-black transition-all ${config.rearEnabled ? 'border-blue-500 bg-blue-900/30 text-blue-400' : 'border-gray-700 bg-gray-800 text-gray-600'}`}
          >RR</button>
        </div>
      </div>

      {/* Per-corner pricing display */}
      {(config.frontEnabled || config.rearEnabled) && (
        <div className="grid grid-cols-2 gap-2 border-t border-gray-700 pt-3">
          {config.frontEnabled && (
            <>
              <div className="bg-red-900/20 border border-red-900/50 p-2 text-center">
                <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider">LF</p>
                <p className="text-white text-sm font-bold">${((parseFloat(config.frontPartsCost) || 0) * (1 + PARTS_MARKUP) / 2 + config.frontLaborHours / 2 * LABOR_RATE).toFixed(2)}</p>
              </div>
              <div className="bg-red-900/20 border border-red-900/50 p-2 text-center">
                <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider">RF</p>
                <p className="text-white text-sm font-bold">${((parseFloat(config.frontPartsCost) || 0) * (1 + PARTS_MARKUP) / 2 + config.frontLaborHours / 2 * LABOR_RATE).toFixed(2)}</p>
              </div>
            </>
          )}
          {config.rearEnabled && (
            <>
              <div className="bg-blue-900/20 border border-blue-900/50 p-2 text-center">
                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">LR</p>
                <p className="text-white text-sm font-bold">${((parseFloat(config.rearPartsCost) || 0) * (1 + PARTS_MARKUP) / 2 + config.rearLaborHours / 2 * LABOR_RATE).toFixed(2)}</p>
              </div>
              <div className="bg-blue-900/20 border border-blue-900/50 p-2 text-center">
                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">RR</p>
                <p className="text-white text-sm font-bold">${((parseFloat(config.rearPartsCost) || 0) * (1 + PARTS_MARKUP) / 2 + config.rearLaborHours / 2 * LABOR_RATE).toFixed(2)}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── QUOTE CALCULATOR ──────────────────────────────────────────────────────────

function QuoteCalculator({ job, onApply }: { job: Job; onApply: (items: LineItem[], total: number, shopTotal: number) => void }) {
  const [serviceType, setServiceType] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [extraQuarts, setExtraQuarts] = useState(0);
  const [axle, setAxle] = useState<AxleConfig>({
    frontEnabled: false, rearEnabled: false,
    frontPartsCost: '', rearPartsCost: '',
    frontLaborHours: 0, rearLaborHours: 0,
    frontLabel: 'Front', rearLabel: 'Rear',
    frontShopAvg: 0, rearShopAvg: 0,
  });

  const isAxleService = serviceType.startsWith('brakes_') || serviceType.startsWith('suspension_struts');
  const isOil = serviceType === 'oil';
  const isDiag = serviceType === 'diag';
  const isFull = serviceType === 'full';
  const isFixed = isOil || isDiag || isFull;

  // Auto-fill labor hours when service changes
  function handleServiceChange(svc: string) {
    setServiceType(svc);
    if (LABOR_HOURS[svc]) setLaborHours(LABOR_HOURS[svc].toString());
    // Set axle defaults for axle services
    if (svc.startsWith('brakes_')) {
      setAxle(prev => ({
        ...prev,
        frontLaborHours: LABOR_HOURS[svc] || 1.0,
        rearLaborHours: LABOR_HOURS[svc] || 1.0,
        frontShopAvg: SHOP_AVERAGES[svc] || 0,
        rearShopAvg: SHOP_AVERAGES[svc] || 0,
      }));
    }
    if (svc === 'suspension_struts_front') {
      setAxle(prev => ({ ...prev, frontLaborHours: LABOR_HOURS[svc] || 2.5, frontShopAvg: SHOP_AVERAGES[svc] || 500 }));
    }
    if (svc === 'suspension_struts_rear') {
      setAxle(prev => ({ ...prev, rearLaborHours: LABOR_HOURS[svc] || 1.5, rearShopAvg: SHOP_AVERAGES[svc] || 350 }));
    }
  }

  // Calculate line items
  function buildLineItems(): { items: LineItem[]; total: number; shopTotal: number } {
    const items: LineItem[] = [];
    let shopTotal = SHOP_AVERAGES[serviceType] || 0;

    // Always add mobile fee
    items.push({ id: 'mobile', label: 'Mobile Service Fee', amount: MOBILE_FEE, type: 'mobile' });

    if (isOil) {
      const base = 79.99 + (extraQuarts * 10.99);
      items.push({ id: 'oil_labor', label: `Oil Change — Full Synthetic (${5 + extraQuarts}qt)`, amount: base, type: 'fixed' });
      shopTotal = 95 + (extraQuarts * 15);
    } else if (isDiag) {
      items.push({ id: 'diag_labor', label: 'Diagnostics — OBD2 Scan & Repair Recommendation', amount: 75, type: 'fixed' });
      shopTotal = 100;
    } else if (isFull) {
      items.push({ id: 'full_labor', label: 'Multi-Point Inspection (Complimentary)', amount: 0, type: 'fixed' });
      shopTotal = 0;
    } else if (isAxleService) {
      shopTotal = 0;
      if (axle.frontEnabled) {
        const frontParts = (parseFloat(axle.frontPartsCost) || 0) * (1 + PARTS_MARKUP);
        const frontLabor = axle.frontLaborHours * LABOR_RATE;
        const svcLabel = serviceType.startsWith('brakes_') ? 'Brakes' : 'Struts';
        if (frontParts > 0) items.push({ id: 'front_parts', label: `Front ${svcLabel} — Parts (LF + RF)`, amount: frontParts, type: 'parts' });
        items.push({ id: 'front_labor', label: `Front ${svcLabel} — Labor (${axle.frontLaborHours}hr @ $${LABOR_RATE}/hr)`, amount: frontLabor, type: 'labor' });
        shopTotal += (axle.frontShopAvg || SHOP_AVERAGES[serviceType] || 0);
      }
      if (axle.rearEnabled) {
        const rearParts = (parseFloat(axle.rearPartsCost) || 0) * (1 + PARTS_MARKUP);
        const rearLabor = axle.rearLaborHours * LABOR_RATE;
        const svcLabel = serviceType.startsWith('brakes_') ? 'Brakes' : 'Shocks';
        if (rearParts > 0) items.push({ id: 'rear_parts', label: `Rear ${svcLabel} — Parts (LR + RR)`, amount: rearParts, type: 'parts' });
        items.push({ id: 'rear_labor', label: `Rear ${svcLabel} — Labor (${axle.rearLaborHours}hr @ $${LABOR_RATE}/hr)`, amount: rearLabor, type: 'labor' });
        shopTotal += (axle.rearShopAvg || SHOP_AVERAGES[serviceType] || 0);
      }
    } else if (serviceType) {
      const parts = (parseFloat(partsCost) || 0) * (1 + PARTS_MARKUP);
      const hrs = parseFloat(laborHours) || LABOR_HOURS[serviceType] || 1;
      const labor = hrs * LABOR_RATE;
      if (parts > 0) items.push({ id: 'parts', label: `Parts (${serviceType.replace(/_/g,' ')})`, amount: parts, type: 'parts' });
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
        <AxleSchematic config={axle} onChange={setAxle} />
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
      {savings > 0 && (
        <div className="bg-emerald-900/20 border border-emerald-700 p-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">vs. Flagstaff Shops</p>
            <p className="text-gray-400 text-xs mt-0.5">They'd charge ~${shopTotal.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-emerald-400 text-2xl font-black">-${savings.toFixed(2)}</p>
            <p className="text-emerald-600 text-[10px] font-bold uppercase">Customer Saves</p>
          </div>
        </div>
      )}

      {canApply && (
        <button
          onClick={() => onApply(items, total, shopTotal)}
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
      {/* Capture button */}
      <div>
        <label className="flex items-center justify-center gap-2 w-full bg-gray-800 border-2 border-dashed border-gray-600 hover:border-red-600 text-gray-400 hover:text-white py-4 cursor-pointer transition-colors">
          <span className="text-xl">📷</span>
          <span className="text-xs font-bold uppercase tracking-widest">Take Photo / Upload</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleCapture}
          />
        </label>
        <p className="text-gray-700 text-xs mt-1 text-center">Opens camera on mobile · Add notes per photo</p>
      </div>

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
  const [showCalc, setShowCalc] = useState(!job.lineItems?.length);
  const [shopAvg, setShopAvg] = useState(0);

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
    await sendEstimateEmail(updated, shopAvg);
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
        <div className="bg-emerald-900/20 border border-emerald-700 px-4 py-3 flex items-center justify-between">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Customer saves vs shops</p>
          <p className="text-emerald-400 font-black text-lg">-${savings.toFixed(2)}</p>
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

      <div className="flex gap-3">
        <button onClick={saveEstimate} disabled={saving}
          className="border border-gray-600 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button onClick={sendEstimate} disabled={!canSend || sending || sent}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors">
          {sending ? 'Sending…' : sent ? '✓ Sent' : `Send to ${job.email}`}
        </button>
      </div>
    </div>
  );
}


  const [amount, setAmount] = useState(job.estimateAmount?.toString() ?? '');
  const [notes, setNotes] = useState(job.estimateNotes);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function saveEstimate() {
    setSaving(true);
    const fields = {
      estimate_amount: parseFloat(amount) || null,
      estimate_notes: notes,
    };
    await patchJob(job.id, fields);
    onUpdate({ ...job, estimateAmount: parseFloat(amount) || null, estimateNotes: notes });
    setSaving(false);
  }

  async function sendEstimate() {
    if (!amount || !job.email) return;
    setSending(true);
    // Save first, then send
    const fields = {
      estimate_amount: parseFloat(amount) || null,
      estimate_notes: notes,
      job_status: 'ESTIMATE_SENT',
    };
    await patchJob(job.id, fields);
    const updated = { ...job, estimateAmount: parseFloat(amount) || null, estimateNotes: notes, jobStatus: 'ESTIMATE_SENT' as JobStatus };
    await sendEstimateEmail(updated);
    onUpdate(updated);
    setSending(false);
    setSent(true);
  }

  const canSend = !!amount && parseFloat(amount) > 0 && !!job.email;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Estimate Amount</label>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-lg font-bold">$</span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono w-36 focus:border-red-600 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest block mb-1">Scope Notes <span className="text-gray-700 normal-case font-normal">(optional — shown to customer)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. Full synthetic oil change, drain/fill transmission fluid, inspect brakes..."
          className="bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm w-full focus:border-red-600 outline-none resize-none"
        />
      </div>

      <div className="bg-gray-800/50 border border-gray-700 p-4">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Terms included in estimate</p>
        <ul className="space-y-1.5">
          {CYA_TERMS.map((t, i) => (
            <li key={i} className="text-gray-400 text-xs flex gap-2">
              <span className="text-red-600 font-bold flex-shrink-0">✓</span> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveEstimate}
          disabled={saving}
          className="border border-gray-600 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={sendEstimate}
          disabled={!canSend || sending || sent}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors"
        >
          {sending ? 'Sending…' : sent ? '✓ Sent to Customer' : `Send to ${job.email}`}
        </button>
      </div>
    </div>
  );
}

// ── PAYMENT PANEL ─────────────────────────────────────────────────────────────

function PaymentPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const [invoiceAmt, setInvoiceAmt] = useState(job.invoiceAmount?.toString() ?? job.estimateAmount?.toString() ?? '');
  const [stripeId, setStripeId] = useState(job.stripeTransactionId);
  const [saving, setSaving] = useState(false);

  async function markPaid() {
    if (!stripeId) return;
    setSaving(true);
    const paidAt = new Date().toISOString();
    const finalAmount = parseFloat(invoiceAmt) || job.estimateAmount;
    const fields = {
      invoice_amount: finalAmount,
      stripe_transaction_id: stripeId,
      paid_at: paidAt,
      job_status: 'PAID',
      status: 'completed',
    };
    await patchJob(job.id, fields);
    const updated = {
      ...job,
      invoiceAmount: finalAmount,
      stripeTransactionId: stripeId,
      paidAt,
      jobStatus: 'PAID' as JobStatus,
      status: 'completed',
    };
    onUpdate(updated);
    setSaving(false);
  }

  async function markInvoiced() {
    setSaving(true);
    const finalAmount = parseFloat(invoiceAmt) || job.estimateAmount;
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

      <div className="flex gap-3">
        <button
          onClick={markInvoiced}
          disabled={saving || job.jobStatus === 'INVOICED'}
          className="border border-gray-600 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
        >
          Mark Invoiced
        </button>
        <button
          onClick={markPaid}
          disabled={!stripeId || saving}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors"
        >
          {saving ? 'Saving…' : '✓ Mark Paid'}
        </button>
      </div>
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
        <div className="px-6 py-4 border-b border-gray-800 overflow-x-auto">
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
                <div className="bg-purple-900/20 border border-purple-800 p-4 space-y-1">
                  <p className="text-purple-400 text-xs font-bold uppercase tracking-widest">✓ Estimate Signed</p>
                  <p className="text-white text-sm font-bold">{job.customerSignature}</p>
                  {job.preExistingDamage && <p className="text-gray-400 text-xs">Pre-existing damage noted: {job.preExistingDamage}</p>}
                  {job.signedAt && <p className="text-gray-600 text-xs">{new Date(job.signedAt).toLocaleString()}</p>}
                </div>
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
          {tab === 'payment' && <PaymentPanel job={job} onUpdate={handleUpdate} />}

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
  const invoiceNumber = `GID-${job.id.slice(0, 8).toUpperCase()}`;

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
    await patchJob(job.id, {
      pre_existing_damage: damage,
      customer_agreed: true,
      customer_signature: signature.trim(),
      signed_at: new Date().toISOString(),
      job_status: 'SIGNED',
    });
    setDone(true);
    setSubmitting(false);
  }

  const dateStr = job ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }) : '';

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-start justify-center px-4 py-12">
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
              <ul className="space-y-2">
                {CYA_TERMS.map((t, i) => (
                  <li key={i} className="text-gray-300 text-sm flex gap-2.5">
                    <span className="text-red-600 font-bold flex-shrink-0 mt-0.5">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pre-existing damage */}
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

            {/* Agreement checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-1 accent-red-600 w-4 h-4 flex-shrink-0"
              />
              <span className="text-gray-300 text-sm">I have read and agree to the above terms and authorize GID Garage to perform the described service at the quoted price.</span>
            </label>

            {/* Signature */}
            <div>
              <label className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-2">Type your full name to sign</label>
              <input
                type="text"
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder="Full name"
                className="bg-white/5 border border-white/10 text-white px-3 py-3 text-sm w-full focus:border-red-600 outline-none font-medium"
              />
            </div>

            <button
              onClick={handleSign}
              disabled={!agreed || !signature.trim() || submitting}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest py-4 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Approve Estimate'}
            </button>

            <p className="text-gray-700 text-xs text-center">Questions before signing? Call or text us at <strong className="text-gray-600">480-757-0476</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}
