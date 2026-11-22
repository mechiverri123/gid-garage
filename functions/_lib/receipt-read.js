// Read a parts receipt (admin only, via /admin-api-data `read-receipt`): the
// photo (JPEG made on the phone) or PDF goes to Claude Haiku, which returns
// the store, date and the total actually paid. The owner taps once to add it
// to the job's parts cost; nothing is saved here. Cost goes into the Jarvis AI
// budget, and a blocked budget stops it. Tests: tests/receipt-read.test.js
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
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(j.date || '')) ? j.date : null,
    };
  } catch { return null; }
}

export async function readReceipt({ base, headers, env, mediaType, data, fetchImpl = (...a) => fetch(...a), now = new Date() }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  if (!TYPES.includes(mediaType)) throw new Error('Only photos (JPG/PNG) and PDFs can be read.');
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
      system: 'You read store receipts for an auto mechanic. Find the final amount actually paid (the grand total including tax, after any discounts or core credits; not the subtotal). Reply with ONLY a JSON object: {"store": "store name", "date": "YYYY-MM-DD or null", "total": number}. If this is not a receipt or the total cannot be read, reply {"total": null}.',
      messages: [{ role: 'user', content: [file, { type: 'text', text: 'Read this receipt.' }] }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI error: ${body?.error?.message || res.status}`);
  const usd = anthropicUsd(body.usage || {}, pricing(env));
  await addUsage({ base, headers, provider: 'anthropic', units: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0), usd, now, fetchImpl });
  if (body.stop_reason === 'refusal') throw new Error('The receipt could not be read. Enter the amount by hand.');
  const r = parseReceipt((body.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  if (!r) throw new Error("Couldn't find a total on that receipt. Enter the amount by hand.");
  return r;
}
