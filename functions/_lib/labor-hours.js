// "Suggest labor hours" for a next-visit recommendation (admin only, via
// /admin-api-data). Decodes the VIN with the free NHTSA vPIC API when there is
// one, then asks Claude Haiku for book-style labor hours ONLY (no prices, no
// parts, no torque specs). It's a suggestion the owner edits. Cost goes into
// the Jarvis AI budget, and a blocked budget stops it. Tests: tests/labor-hours.test.js
import { readBudget, addUsage, anthropicUsd, pricing } from './ai-budget.js';

const MODEL = 'claude-haiku-4-5-20251001';

export async function decodeVin(vin, fetchImpl = (...a) => fetch(...a)) {
  const v = String(vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null;
  try {
    const res = await fetchImpl(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`);
    const r = (await res.json())?.Results?.[0];
    if (!r?.Make) return null;
    const engine = [r.DisplacementL && `${Number(r.DisplacementL).toFixed(1)}L`, r.EngineCylinders && `${r.EngineCylinders}-cyl`, r.FuelTypePrimary].filter(Boolean).join(' ');
    return [r.ModelYear, r.Make, r.Model, r.Trim, engine, r.DriveType].filter(Boolean).join(' ');
  } catch { return null; }
}

export function parseSuggestion(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const n = x => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 40 ? Math.round(Number(x) * 10) / 10 : null);
    const hours = n(j.hours);
    if (hours == null) return null;
    return { hours, low: n(j.low) ?? hours, high: n(j.high) ?? hours, reason: String(j.reason || '').slice(0, 300) };
  } catch { return null; }
}

export async function suggestLaborHours({ base, headers, env, vin, vehicle, service, note, fetchImpl = (...a) => fetch(...a), now = new Date() }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const svc = String(service || '').trim().slice(0, 120);
  if (!svc) throw new Error('Which service?');
  const budget = await readBudget({ base, headers, env, now, fetchImpl });
  if (budget.state === 'blocked') throw new Error('The monthly AI budget is used up (Settings → Usage).');
  const decoded = await decodeVin(vin, fetchImpl);
  const veh = decoded || String(vehicle || '').trim().slice(0, 120) || 'unknown vehicle';
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 300,
      system: 'You estimate auto-repair labor time the way a published labor guide would, for an experienced mobile mechanic working in a driveway. Reply with ONLY a JSON object: {"hours": number, "low": number, "high": number, "reason": "one short sentence on what drives the time for this vehicle"}. Hours only: no prices, no parts, no torque specs. If the vehicle is unknown, give a typical range and say so in the reason.',
      messages: [{ role: 'user', content: `Vehicle: ${veh}\nService: ${svc}${note ? `\nTechnician note: ${String(note).slice(0, 300)}` : ''}` }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI error: ${body?.error?.message || res.status}`);
  const usd = anthropicUsd(body.usage || {}, pricing(env));
  await addUsage({ base, headers, provider: 'anthropic', units: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0), usd, now, fetchImpl });
  const s = parseSuggestion((body.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  if (!s) throw new Error('The AI answer could not be read. Try again.');
  return { ...s, vehicle: veh, decodedFromVin: !!decoded };
}
