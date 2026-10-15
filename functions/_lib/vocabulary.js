// Jarvis vocabulary: the owner’s own shorthand and corrections ("when I say X I
// mean Y"). Kept in R2 private/jarvis-vocabulary.json (no table needed). Used by:
//   admin-ai-chat.js  -> vocabularyPrompt() as a small extra system block each turn
//   jarvis/voice.js   -> voiceKeyterms() so Deepgram hears names and terms right
//   admin-api-data.js -> vocab-list / vocab-save / vocab-remove (Hub + "Wrong?" button)
// Tests: tests/vocabulary.test.js

export const VOCAB_KEY = 'private/jarvis-vocabulary.json';
export const MAX_ENTRIES = 80;
const MAX_KEYTERMS = 50;          // Deepgram: 20-50 terms recommended
const MAX_KEYTERM_CHARS = 1400;   // ~350 tokens, under Deepgram's 500-token keyterm limit

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function cleanEntry({ said, meant } = {}) {
  const s = clean(said, 120); const m = clean(meant, 300);
  if (!s) throw new Error('What do you say? (left side is empty)');
  if (!m) throw new Error('What do you mean by it? (right side is empty)');
  return { said: s, meant: m };
}

// Same "said" (any case) replaces the old entry; newest first; capped.
export function upsertEntry(list = [], entry, { now = new Date(), source = 'manual', id } = {}) {
  const e = cleanEntry(entry);
  const key = e.said.toLowerCase();
  const rest = list.filter(x => x.said.toLowerCase() !== key && x.id !== id);
  const row = { id: id || `v${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...e, source: source === 'correction' ? 'correction' : 'manual', at: now.toISOString() };
  return [row, ...rest].slice(0, MAX_ENTRIES);
}

export const removeEntry = (list = [], id) => list.filter(x => x.id !== id);

// Extra system text for Jarvis. Owner-written, so it can clarify meaning, but it
// never changes the confirmation or honesty rules.
export function vocabularyPrompt(list = []) {
  if (!list.length) return '';
  return [
    "MICHAEL'S VOCABULARY (his own words; when he uses one, read it this way):",
    ...list.map(e => `- "${e.said}" means: ${e.meant}`),
    'These only explain what he means. They never skip a confirmation step and never replace looking things up with tools.',
  ].join('\n');
}

// Words Deepgram should listen for: fixed brand words, short vocabulary terms,
// then customer/lead names (most relevant first). Deduped and capped.
export function voiceKeyterms({ entries = [], names = [] } = {}) {
  const out = []; const seen = new Set(); let chars = 0;
  const add = t => {
    const term = clean(t, 40);
    if (!term || term.split(' ').length > 3 || seen.has(term.toLowerCase())) return;
    if (out.length >= MAX_KEYTERMS || chars + term.length > MAX_KEYTERM_CHARS) return;
    seen.add(term.toLowerCase()); out.push(term); chars += term.length;
  };
  ['Jarvis', 'GID Garage'].forEach(add);
  entries.forEach(e => add(e.said));
  names.forEach(add);
  return out;
}

// Starter list, used until the owner saves his own (the first add/remove saves
// these with it, so a removed one stays removed). Facts he has stated only.
const d = (id, said, meant) => ({ id: `default-${id}`, said, meant, source: 'manual', at: '2026-10-15T00:00:00.000Z' });
export const DEFAULT_VOCABULARY = [
  d('kass', 'Kass', 'Kassidy Altomar, my girlfriend. A Venmo to her is normally a pass-through repayment of owner’s equity (she sends it back to me), unless I logged it as helper pay in Team & Pay.'),
  d('gid', 'GID', 'GID Garage, my mobile mechanic business in Flagstaff.'),
  d('close-it', 'close it', 'Mark that lead lost so its follow-up goes away (close_lead_followups, after I confirm).'),
  d('close-followups', 'close my follow-ups', 'Mark every lead that needs follow-up as lost (close_lead_followups, after I confirm). Silent leads should just be gone.'),
  d('meta-leads', 'Facebook leads', 'Leads from my Facebook/Instagram ad lead form (source meta_ads). They are in Meta Business Suite → All tools → Leads Center, not Messenger.'),
  d('tpt', 'TPT', 'Arizona sales tax (transaction privilege tax) on my jobs, filed and paid on AZTaxes by the 20th of the next month.'),
  d('my-pay', 'my pay', 'Owner pay from Team & Pay: my labor hours × my rate, paid weekly (Mon–Sun). Not an expense, and separate from owner’s equity.'),
  d('paid-back', 'paid myself back', 'Repayment of owner’s equity (transfers to my SoFi or the Venmo pass-through). Not pay and not an expense.'),
  d('bluevine', 'Bluevine', 'My business bank account. All Stripe card payments pay out there.'),
  d('tech-app', 'tech app', 'The phone app I use on jobs (/jarvis/tech).'),
  d('scope-notes', 'tech notes', 'The job’s Scope Notes on the Estimate tab (the same field as technician notes in the tech app); they print as Scope of Work on the invoice.'),
  d('ppi', 'PPI', 'Pre-purchase inspection.'),
];

export async function loadVocabulary(bucket) {
  if (!bucket) return DEFAULT_VOCABULARY;
  try {
    const o = await bucket.get(VOCAB_KEY);
    if (!o) return DEFAULT_VOCABULARY; // never saved yet
    const data = await o.json();
    return Array.isArray(data?.entries) ? data.entries : DEFAULT_VOCABULARY;
  } catch { return DEFAULT_VOCABULARY; }
}

export async function saveVocabulary(bucket, entries) {
  if (!bucket) throw new Error('Storage (GID_PHOTOS) is not connected.');
  await bucket.put(VOCAB_KEY, JSON.stringify({ entries }), { httpMetadata: { contentType: 'application/json' } });
  return entries;
}
