// Read a photo (admin only, via /admin-api-data `read-photo`): a parts receipt
// (store, date, total paid), a VIN plate or sticker, or an odometer. The photo
// (JPEG made on the phone) or PDF goes to Claude Haiku; the owner confirms what
// it read, nothing is saved here. Cost goes into the Jarvis AI budget, and a
// blocked budget stops it. Tests: tests/receipt-read.test.js
import { readBudget, addUsage, anthropicUsd, pricing } from './ai-budget.js';

const MODEL = 'claude-haiku-5-5';
const MAX_B64 = 7_000_000; // ~5 MB file: the API's per-image limit
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export function parseReceipt(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const total = Math.round(Number(j.total) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0 || total > 50000) return null;
    return {
      total,
      store: String(j.store || '').slice(0, 80),
      address: String(j.address || '').slice(0, 160),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(j.date || '')) ? j.date : null,
    };
  } catch { return null; }
}

// VIN: 17 characters, never I, O or Q (read as 1, 0, 0).
export function parseVin(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = String(JSON.parse(m[0]).vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO]/g, c => (c === 'I' ? '1' : '0')).replace(/Q/g, '0');
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? { vin: v } : null;
  } catch { return null; }
}

export function parseOdometer(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (j.reading == null || j.reading === '') return null; // Number(null) is 0
    let n = Math.round(Number(String(j.reading).replace(/[,\s]/g, '')));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (String(j.unit || '').toLowerCase().startsWith('k')) n = Math.round(n * 0.621371);
    return n <= 2_000_000 ? { miles: n } : null;
  } catch { return null; }
}

const KINDS = {
  receipt: {
    system: 'You read store receipts for an auto mechanic. Find the final amount actually paid (the grand total including tax, after any discounts or core credits; not the subtotal). Reply with ONLY a JSON object: {"store": "store name", "address": "street address of the store, city, state as printed, or empty", "date": "YYYY-MM-DD or null", "total": number}. If this is not a receipt or the total cannot be read, reply {"total": null}.',
    ask: 'Read this receipt.', parse: parseReceipt,
    fail: "Couldn't find a total on that receipt. Enter the amount by hand.",
  },
  vin: {
    system: 'You read vehicle VINs from photos (door-jamb sticker, windshield plate, title or registration, barcode label). A VIN is exactly 17 characters and never contains I, O or Q. Reply with ONLY a JSON object: {"vin": "17 characters"}. If no full VIN is readable, reply {"vin": null}.',
    ask: 'Read the VIN in this photo.', parse: parseVin,
    fail: "Couldn't read a full 17-character VIN. Get closer, avoid glare, or type it.",
  },
  odometer: {
    system: 'You read car odometers from dashboard photos. Read the total odometer (the main mileage), not a trip meter (Trip A/B), range or outside temperature. Reply with ONLY a JSON object: {"reading": number, "unit": "mi" or "km"}. If the odometer cannot be read, reply {"reading": null}.',
    ask: 'Read the odometer in this photo.', parse: parseOdometer,
    fail: "Couldn't read the odometer. Make sure it isn't showing a trip meter, or type it.",
  },
};

export async function readReceipt(args) { return readPhoto({ ...args, kind: 'receipt' }); }

export async function readPhoto({ base, headers, env, kind = 'receipt', mediaType, data, fetchImpl = (...a) => fetch(...a), now = new Date() }) {
  const k = KINDS[kind];
  if (!k) throw new Error('Unknown photo kind.');
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  if (!TYPES.includes(mediaType) || (kind !== 'receipt' && mediaType === 'application/pdf')) throw new Error('Only photos (JPG/PNG) and PDFs can be read.');
  if (typeof data !== 'string' || !data || data.length > MAX_B64) throw new Error('That receipt file is too large to read (5 MB max).');
  const budget = await readBudget({ base, headers, env, now, fetchImpl });
  if (budget.state === 'blocked') throw new Error('The monthly AI budget is used up (Settings → Usage).');
  const file = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000,
      output_config: { effort: 'low' },
      system: k.system,
      messages: [{ role: 'user', content: [file, { type: 'text', text: k.ask }] }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI error: ${body?.error?.message || res.status}`);
  const usd = anthropicUsd(body.usage || {}, pricing(env));
  await addUsage({ base, headers, provider: 'anthropic', units: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0), usd, now, fetchImpl });
  const r = body.stop_reason === 'refusal' ? null : k.parse((body.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  if (!r) throw new Error(k.fail);
  return r;
}
