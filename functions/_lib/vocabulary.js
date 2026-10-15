// Jarvis vocabulary: the owner's own shorthand and corrections ("when I say X I
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

export async function loadVocabulary(bucket) {
  if (!bucket) return [];
  try { const o = await bucket.get(VOCAB_KEY); const d = o ? await o.json() : null; return Array.isArray(d?.entries) ? d.entries : []; } catch { return []; }
}

export async function saveVocabulary(bucket, entries) {
  if (!bucket) throw new Error('Storage (GID_PHOTOS) is not connected.');
  await bucket.put(VOCAB_KEY, JSON.stringify({ entries }), { httpMetadata: { contentType: 'application/json' } });
  return entries;
}
