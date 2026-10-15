// Jarvis vocabulary: Hub → Jarvis Vocabulary (the list) and the "Wrong?" button
// under Jarvis replies on /jarvis (adds a correction). Server:
// functions/_lib/vocabulary.js via /admin-api-data vocab-*.
import { useEffect, useState } from 'react';

export type VocabEntry = { id: string; said: string; meant: string; source: 'manual' | 'correction'; at: string };

async function vocab(action: string, args: Record<string, unknown> = {}): Promise<VocabEntry[]> {
  const res = await fetch('/admin-api-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.entries || [];
}
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function VocabularySettings() {
  const [list, setList] = useState<VocabEntry[] | null>(null);
  const [said, setSaid] = useState('');
  const [meant, setMeant] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { vocab('vocab-list').then(setList, e => { setList([]); setMsg(msgOf(e)); }); }, []);

  async function run(p: Promise<VocabEntry[]>, done = '') {
    setBusy(true); setMsg('');
    try { setList(await p); setMsg(done); } catch (e) { setMsg(msgOf(e)); }
    setBusy(false);
  }
  const add = () => run(vocab('vocab-save', { said, meant }).then(l => { setSaid(''); setMeant(''); return l; }), 'Saved. Jarvis uses it from the next message.');

  const field = 'bg-gray-800 border border-gray-700 text-white text-sm px-2 py-2 outline-none focus:border-red-600 min-w-0';
  if (!list) return <p className="text-gray-500 text-sm">Loading vocabulary…</p>;
  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">Your shorthand, so Jarvis reads you right in chat, voice and Telegram. Short words here (names, nicknames) also help voice hear them. Example: <b className="text-white">"Kass"</b> means <b className="text-white">Kassidy (girlfriend, Venmo pass-through)</b>.</p>
      <form className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_auto] gap-2" onSubmit={e => { e.preventDefault(); if (said.trim() && meant.trim()) add(); }}>
        <input className={field} value={said} onChange={e => setSaid(e.target.value)} placeholder="When I say…" aria-label="When I say" maxLength={120} />
        <input className={field} value={meant} onChange={e => setMeant(e.target.value)} placeholder="I mean…" aria-label="I mean" maxLength={300} />
        <button type="submit" disabled={busy || !said.trim() || !meant.trim()} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest">Add</button>
      </form>
      {msg && <p className="text-gray-400 text-xs" role="status">{msg}</p>}
      {list.length === 0 ? <p className="text-gray-600 text-sm">Nothing yet.</p> : (
        <ul className="space-y-2">
          {list.map(e => (
            <li key={e.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 px-3 py-2">
              <div className="flex-1 min-w-0 text-sm">
                <span className="text-white font-semibold break-words">"{e.said}"</span>
                <span className="text-gray-500"> means </span>
                <span className="text-gray-200 break-words">{e.meant}</span>
                {e.source === 'correction' && <span className="ml-2 text-[11px] uppercase tracking-wider text-amber-400">from a correction</span>}
              </div>
              <button type="button" disabled={busy} onClick={() => run(vocab('vocab-remove', { id: e.id }))} className="px-2 border border-gray-700 text-gray-400 hover:text-red-400 shrink-0" aria-label={`Remove "${e.said}"`}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Under a Jarvis reply: "Wrong?" → say what you meant; saved as a vocabulary
// correction so the same words are read right next time.
export function CorrectionButton({ said }: { said: string }) {
  const [open, setOpen] = useState(false);
  const [meant, setMeant] = useState('');
  const [state, setState] = useState<'' | 'saving' | 'saved' | string>('');
  if (state === 'saved') return <p className="text-[12px] text-emerald-400 py-1">Got it. Jarvis will read that the new way from now on.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-[12px] text-[#8899A6] hover:text-white underline underline-offset-2 py-1">Wrong?</button>;
  return (
    <form className="py-1 space-y-1.5" onSubmit={async e => {
      e.preventDefault(); if (!meant.trim()) return;
      setState('saving');
      try { await vocab('vocab-save', { said, meant, source: 'correction' }); setState('saved'); } catch (err) { setState(msgOf(err)); }
    }}>
      <p className="text-[12px] text-[#8899A6]">When you said <span className="text-[#F5F8FA]">"{said.length > 120 ? `${said.slice(0, 117)}…` : said}"</span>, you meant:</p>
      <div className="flex gap-2">
        <input autoFocus value={meant} onChange={e => setMeant(e.target.value)} maxLength={300} placeholder="e.g. mark them all lost" aria-label="What you meant"
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[13px] text-[#F5F8FA] outline-none focus:border-[#32D9FF]/60" />
        <button type="submit" disabled={!meant.trim() || state === 'saving'} className="px-3 rounded bg-[#32D9FF]/15 border border-[#32D9FF]/40 text-[#32D9FF] text-[12px] font-bold disabled:opacity-40">Save</button>
        <button type="button" onClick={() => { setOpen(false); setState(''); }} className="px-2 text-[12px] text-[#8899A6]">Cancel</button>
      </div>
      {state && state !== 'saving' && <p className="text-[12px] text-red-400" role="alert">{state}</p>}
    </form>
  );
}
