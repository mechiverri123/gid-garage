// Quick Quote vehicle fields: people sometimes paste their whole message into Model
// (or Make/Engine). Keep only the first word of an over-long field in the vehicle,
// and move the full text into the notes so nothing they wrote is lost.
// Tests: tests/quick-quote.test.js
const MAX = 40;

export function quickQuoteVehicle({ year, make, model, engine, issue }) {
  const extra = [];
  const part = v => {
    const s = String(v || '').trim().replace(/\s+/g, ' ');
    if (s.length <= MAX) return s;
    extra.push(s);
    return s.split(' ')[0].slice(0, MAX);
  };
  const vehicle = [year, make, model, engine].map(part).filter(Boolean).join(' ') || 'Not specified';
  const notes = [String(issue || '').trim(), ...extra].filter(Boolean).join('\n\n');
  return { vehicle, notes };
}
