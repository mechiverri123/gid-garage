// Leads + Facebook Messenger inside the Jarvis workspace.
// Leads: the same rows and writes as /admin (list-leads, patch-lead). Messenger:
// /jarvis/feeds (messages, thread, send_messenger). Every reply goes through
// ReplyDialog: write → review exactly what will be sent (confirmation 1) →
// "Send to <name> on Messenger now?" (confirmation 2). The server refuses a send
// without both. A lead gets a Messenger reply only when its conversation matches
// on the exact full name, or the owner picks the conversation himself.
import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, ExternalLink, Phone, Search, X, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { adminPost } from '../api';
import { fmtSource } from '../utils/formatters';
import { LEAD_STATUS_OPTIONS, type Lead } from '../types';
import { C, timeAgo } from '../ui/theme';
import { Skeleton, ErrorState, ActionButton, statusTone } from '../ui/primitives';
import { TONE } from '../ui/theme';
import { feedPrefetch } from './jobMeta';
import { useFeed } from './FeedViews';

type Dispatch = (a: { type: string; [k: string]: unknown }) => void;
type Convo = { id: string; psid: string | null; name: string; unread: number; snippet: string; lastFromPage: boolean; lastAt: string; link: string };
const LEADS_CENTER = 'https://business.facebook.com/latest/leads_center';
const box = { background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const leadName = (l: Lead) => `${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || 'Lead';

// Exact full-name match only (same rule as conversationForLead on the server).
function matchConvo(l: Lead, convos: Convo[]) {
  const full = norm(`${l.fname || ''} ${l.lname || ''}`);
  if (!full.includes(' ')) return null;
  const hits = convos.filter(c => norm(c.name) === full);
  return hits.length === 1 ? hits[0] : null;
}

const SERVICE_WORDS: Record<string, string> = { brakes: 'your brakes', oil: 'an oil change', diag: 'a diagnostic', suspension: 'your suspension', audio: 'car audio', full: 'a service' };
export function leadDraft(l: Lead) {
  const first = (l.fname || '').trim().split(' ')[0] || 'there';
  const what = SERVICE_WORDS[String(l.requested_service || '')] || (l.vehicle ? `your ${l.vehicle}` : 'your vehicle');
  return `Hi ${first}, this is Michael with GID Garage. Thanks for reaching out about ${what}! I'm a mobile mechanic, so I come to you anywhere around Flagstaff. When would be a good time to take a look?`;
}

// ---- the reply dialog (two confirmations) ------------------------------------------------

export function ReplyDialog({ to, leadId, initial = '', onClose, onSent }: { to: { name: string; psid: string; link?: string }; leadId?: string; initial?: string; onClose: () => void; onSent: (r: { leadStatus?: string | null }) => void }) {
  const [text, setText] = useState(initial);
  const [step, setStep] = useState<'write' | 'review' | 'confirm' | 'sending' | 'done'>('write');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setStep('sending'); setError(null);
    try {
      const res = await fetch('/jarvis/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send_messenger', psid: to.psid, text, reviewed: true, confirmed: true, ...(leadId ? { leadId } : {}) }) });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || `HTTP ${res.status}`);
      setStep('done'); onSent(out);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStep('confirm'); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'sending') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, step]);

  const bubble = (
    <div className="rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words self-end max-w-full" style={{ background: '#0084FF', color: '#fff' }}>{text}</div>
  );
  return (
    <div className="jv-editor fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,0.6)' }} role="dialog" aria-modal="true" aria-label={`Reply to ${to.name} on Messenger`}>
      <div className="w-full max-w-[560px] rounded-2xl p-5 flex flex-col gap-4 jv-pop" style={{ background: C.surface1, border: `1px solid ${C.borderStrong}` }}>
        <div className="flex items-center gap-2">
          <MessageCircle size={18} color="#0084FF" />
          <div className="text-[16px] font-semibold truncate" style={{ color: C.text }}>Messenger · {to.name}</div>
          <button type="button" onClick={onClose} disabled={step === 'sending'} className="ml-auto cc-btn w-9 h-9 rounded-full flex items-center justify-center" aria-label="Cancel" style={{ color: C.text2 }}><X size={18} /></button>
        </div>
        <ol className="flex gap-2 text-[12px] font-semibold uppercase tracking-wider" aria-label="Steps">
          {['Write', 'Review', 'Confirm'].map((s, i) => {
            const at = { write: 0, review: 1, confirm: 2, sending: 2, done: 3 }[step];
            return <li key={s} className="flex-1 text-center py-1 rounded-full" style={{ color: i <= at ? C.bg : C.muted, background: i <= at ? C.cyan : 'rgba(255,255,255,0.05)' }}>{i + 1}. {s}</li>;
          })}
        </ol>

        {step === 'write' && <>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} maxLength={2000} autoFocus aria-label="Message"
            className="w-full rounded-xl p-3 text-[15px] leading-relaxed outline-none resize-y" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
          <div className="flex items-center gap-2">
            <span className="text-[12.5px]" style={{ color: C.muted }}>{text.length}/2000</span>
            <div className="ml-auto flex gap-2"><ActionButton variant="ghost" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" disabled={!text.trim()} onClick={() => setStep('review')}>Review</ActionButton></div>
          </div>
        </>}

        {step === 'review' && <>
          <div className="text-[14px]" style={{ color: C.text2 }}>This is exactly what <b style={{ color: C.text }}>{to.name}</b> will see on Messenger, from GID Garage:</div>
          <div className="flex flex-col rounded-xl p-3" style={box}>{bubble}</div>
          <div className="flex gap-2 justify-end"><ActionButton variant="ghost" onClick={() => setStep('write')}>Edit</ActionButton><ActionButton variant="primary" icon={Check} onClick={() => setStep('confirm')}>Looks right</ActionButton></div>
        </>}

        {(step === 'confirm' || step === 'sending') && <>
          <div className="flex items-start gap-2 rounded-xl p-3 text-[14.5px]" style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.35)', color: C.text }}>
            <AlertTriangle size={17} color={C.amber} className="shrink-0 mt-0.5" />
            <span>Send this to <b>{to.name}</b> on Messenger now? It can't be unsent.</span>
          </div>
          <div className="flex flex-col rounded-xl p-3 max-h-[160px] overflow-y-auto" style={box}>{bubble}</div>
          {error && <div role="alert" className="text-[14px] flex flex-col gap-2" style={{ color: C.amber }}>
            <span>Not sent: {error}</span>
            {to.link && <a href={to.link} target="_blank" rel="noreferrer" className="underline self-start" style={{ color: C.cyan }}>Open this chat in Business Suite</a>}
          </div>}
          <div className="flex gap-2 justify-end">
            <ActionButton variant="ghost" disabled={step === 'sending'} onClick={() => setStep('review')}>Back</ActionButton>
            <ActionButton variant="primary" icon={Send} disabled={step === 'sending'} onClick={send}>{step === 'sending' ? 'Sending…' : 'Yes, send it'}</ActionButton>
          </div>
        </>}

        {step === 'done' && <>
          <div className="flex items-center gap-2 text-[15px]" style={{ color: C.green }}><Check size={18} />Sent to {to.name} on Messenger.{leadId ? ' Lead marked contacted.' : ''}</div>
          <div className="flex justify-end"><ActionButton variant="primary" onClick={onClose}>Done</ActionButton></div>
        </>}
      </div>
    </div>
  );
}

// ---- Leads -------------------------------------------------------------------------------

const FILTERS: { id: string; label: string; test: (s: string) => boolean }[] = [
  { id: 'open', label: 'Open', test: s => ['new', 'contacted', 'quoted', 'no_response'].includes(s) },
  { id: 'new', label: 'New', test: s => s === 'new' },
  { id: 'contacted', label: 'Contacted', test: s => s === 'contacted' },
  { id: 'quoted', label: 'Quoted', test: s => s === 'quoted' },
  { id: 'booked', label: 'Booked', test: s => s === 'booked' },
  { id: 'lost', label: 'Lost', test: s => s === 'lost' || s === 'no_response' },
  { id: 'all', label: 'All', test: () => true },
];

function LeadCard({ l, convos, convosReady, onStatus, onReply }: { l: Lead; convos: Convo[]; convosReady: boolean; onStatus: (s: string) => void; onReply: (c: Convo) => void }) {
  const auto = matchConvo(l, convos);
  const [pick, setPick] = useState<string>('');
  const chosen = auto || convos.find(c => c.id === pick) || null;
  const notes = String(l.notes || '').split('\n').filter(Boolean);
  return (
    <li className="rounded-2xl p-4 min-w-0 flex flex-col gap-2.5" style={box}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16.5px] font-semibold" style={{ color: C.text }}>{leadName(l)}</span>
            <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ color: C.text2, border: `1px solid ${C.border}` }}>{fmtSource(l.source)}</span>
            <span className="text-[12.5px]" style={{ color: C.muted }}>{timeAgo(l.created_at)}</span>
          </div>
          <div className="text-[14px] mt-0.5" style={{ color: C.text2 }}>{[l.requested_service && fmtSource(l.requested_service), l.vehicle].filter(Boolean).join(' · ') || 'No service or vehicle given'}</div>
        </div>
        <select value={l.status} onChange={e => onStatus(e.target.value)} aria-label={`Status for ${leadName(l)}`}
          className="rounded-lg px-2 py-1 text-[13.5px] outline-none shrink-0" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${TONE[statusTone(l.status)]}66`, color: TONE[statusTone(l.status)] }}>
          {LEAD_STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ color: C.text, background: C.bg2 }}>{fmtSource(s)}</option>)}
        </select>
      </div>
      {notes.length > 0 && <ul className="text-[13.5px] flex flex-col gap-0.5" style={{ color: C.text2 }}>{notes.slice(0, 4).map((n, i) => <li key={i} className="break-words">{n}</li>)}</ul>}
      <div className="flex flex-wrap items-center gap-2">
        {chosen?.psid
          ? <ActionButton size="sm" variant="primary" icon={MessageCircle} onClick={() => onReply(chosen)}>Reply on Messenger</ActionButton>
          : convosReady && convos.length > 0 && (
            <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Pick their Messenger chat" className="rounded-lg h-8 px-2 text-[13px] outline-none max-w-full" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text }}>
              <option value="">No chat under this name — pick one…</option>
              {convos.map(c => <option key={c.id} value={c.id}>{c.name}{c.snippet ? ` — ${c.snippet.slice(0, 40)}` : ''}</option>)}
            </select>
          )}
        <ActionButton size="sm" href={chosen?.link || LEADS_CENTER} icon={ExternalLink}>Business Suite</ActionButton>
        {l.phone && <ActionButton size="sm" variant="ghost" href={`tel:${l.phone}`} icon={Phone}>{l.phone}</ActionButton>}
      </div>
      {chosen && !auto && <div className="text-[12.5px]" style={{ color: C.muted }}>Replying in {chosen.name}'s chat (picked by you).</div>}
    </li>
  );
}

export function LeadsView({ query, status, dispatch }: { query: string; status: string; dispatch: Dispatch }) {
  const pre = feedPrefetch.get('leads') as { leads?: Lead[] } | undefined;
  const [leads, setLeads] = useState<Lead[] | null>(pre?.leads ?? null);
  const [error, setError] = useState<string | null>(null);
  const msgs = useFeed('messages');
  const [reply, setReply] = useState<{ lead: Lead; convo: Convo } | null>(null);
  const [q, setQ] = useState(query);
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => {
    if (pre?.leads) { feedPrefetch.delete('leads'); return; }
    adminPost('list-leads', { limit: 200 }).then(setLeads, e => setError(e instanceof Error ? e.message : String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const convos: Convo[] = msgs.data?.connected && !msgs.data?.error ? msgs.data.conversations || [] : [];
  const filter = FILTERS.find(f => f.id === status) ?? FILTERS[0];
  const shown = useMemo(() => (leads ?? []).filter(l => filter.test(l.status) && (!q || norm(`${leadName(l)} ${l.phone || ''} ${l.email || ''} ${l.vehicle || ''} ${l.requested_service || ''}`).includes(norm(q)))), [leads, filter, q]);

  const setStatus = async (l: Lead, s: string) => {
    setLeads(prev => prev?.map(x => (x.id === l.id ? { ...x, status: s } : x)) ?? prev);
    try { await adminPost('patch-lead', { id: l.id, fields: { status: s, last_contacted_at: new Date().toISOString() } }); }
    catch { adminPost('list-leads', { limit: 200 }).then(setLeads, () => {}); }
  };

  if (error) return <div className="max-w-[1000px] mx-auto"><ErrorState message={`Couldn't load leads: ${error}`} /></div>;
  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-4 jv-pop">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.id} type="button" onClick={() => dispatch({ type: 'filter', status: f.id })} className="text-[14px] font-medium px-3.5 h-9 rounded-full border"
            style={{ borderColor: filter.id === f.id ? C.cyan : C.border, color: filter.id === f.id ? '#021019' : C.text2, background: filter.id === f.id ? C.cyan : 'rgba(3,10,17,0.4)' }}>
            {f.label}{leads ? ` ${leads.filter(l => f.test(l.status)).length}` : ''}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-full px-3 h-9 min-w-0" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}` }}>
          <Search size={15} color={C.muted} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads" aria-label="Search leads" className="bg-transparent outline-none text-[14px] min-w-0 w-[140px]" style={{ color: C.text }} />
        </label>
      </div>
      {msgs.data && !msgs.data.connected && <div className="text-[13.5px]" style={{ color: C.muted }}>Connect Facebook to reply on Messenger.</div>}
      {msgs.data?.error && <div className="text-[13.5px]" style={{ color: C.amber }}>Messenger: {msgs.data.error}. Add the <b>pages_messaging</b> permission (Facebook panel → Update permissions).</div>}
      {msgs.error && <div className="text-[13.5px]" style={{ color: C.amber }}>Messenger: {msgs.error}</div>}
      {!leads ? <Skeleton className="h-[300px]" /> : shown.length ? (
        <ul className="flex flex-col gap-3">
          {shown.map(l => <LeadCard key={l.id} l={l} convos={convos} convosReady={!!msgs.data} onStatus={s => setStatus(l, s)} onReply={c => setReply({ lead: l, convo: c })} />)}
        </ul>
      ) : <div className="text-[14px]" style={{ color: C.muted }}>No {filter.id === 'all' ? '' : `${filter.label.toLowerCase()} `}leads{q ? ` matching “${q}”` : ''}.</div>}
      {reply && reply.convo.psid && (
        <ReplyDialog to={{ name: reply.convo.name, psid: reply.convo.psid, link: reply.convo.link }} leadId={reply.lead.id} initial={leadDraft(reply.lead)}
          onClose={() => setReply(null)}
          onSent={r => { if (r.leadStatus) setLeads(prev => prev?.map(x => (x.id === reply.lead.id ? { ...x, status: r.leadStatus as string } : x)) ?? prev); void msgs.reload(true); }} />
      )}
    </div>
  );
}

// ---- Messenger inbox -------------------------------------------------------------------------

function Thread({ c, onBack, onReply }: { c: Convo; onBack: () => void; onReply: () => void }) {
  const [msgs, setMsgs] = useState<{ text: string; fromPage: boolean; at: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/jarvis/feeds?action=thread&id=${encodeURIComponent(c.id)}`).then(r => r.json()).then(b => { if (live) { if (b.error) setErr(b.error); else setMsgs(b.messages || []); } }, e => live && setErr(String(e)));
    return () => { live = false; };
  }, [c.id]);
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[14px] hover:underline" style={{ color: C.cyan }}><ArrowLeft size={15} />All chats</button>
        <span className="text-[16px] font-semibold truncate" style={{ color: C.text }}>{c.name}</span>
        <a href={c.link} target="_blank" rel="noreferrer" className="ml-auto text-[13px] inline-flex items-center gap-1 hover:underline shrink-0" style={{ color: C.text2 }}><ExternalLink size={13} />Business Suite</a>
      </div>
      {err ? <ErrorState message={err} /> : !msgs ? <Skeleton className="h-[240px]" /> : (
        <div className="flex flex-col gap-2 rounded-xl p-3 max-h-[55vh] overflow-y-auto" style={box}>
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14.5px] whitespace-pre-wrap break-words ${m.fromPage ? 'self-end' : 'self-start'}`}
              style={m.fromPage ? { background: '#0084FF', color: '#fff' } : { background: C.surface3, color: C.text }} title={m.at ? new Date(m.at).toLocaleString('en-US', { timeZone: 'America/Phoenix' }) : ''}>{m.text || '(attachment)'}</div>
          ))}
        </div>
      )}
      <div className="flex justify-end"><ActionButton variant="primary" icon={MessageCircle} disabled={!c.psid} onClick={onReply}>Reply</ActionButton></div>
    </div>
  );
}

export function MessagesView({ open, dispatch }: { open?: string; dispatch: Dispatch }) {
  const { data, error, loading, reload } = useFeed('messages');
  const [sel, setSel] = useState<string | null>(open ?? null);
  const [replying, setReplying] = useState(false);
  const [sent, setSent] = useState(0); // remount the thread after a reply so it shows
  useEffect(() => { setSel(open ?? null); }, [open]);
  if (error) return <div className="max-w-[900px] mx-auto"><ErrorState message={`Couldn't load Messenger: ${error}`} onRetry={() => reload()} /></div>;
  if (!data) return <div className="max-w-[900px] mx-auto"><Skeleton className="h-[360px]" /></div>;
  if (!data.connected) return <div className="max-w-[900px] mx-auto text-[14.5px]" style={{ color: C.text2 }}>Facebook isn't connected. Say “show me my Facebook” to connect it.</div>;
  if (data.error) return <div className="max-w-[900px] mx-auto"><ErrorState message={`Messenger: ${data.error}. Add the pages_messaging permission (Facebook panel → Update permissions).`} onRetry={() => reload(true)} /></div>;
  const convos: Convo[] = data.conversations || [];
  const current = sel ? convos.find(c => c.id === sel) : null;
  return (
    <div className="max-w-[900px] mx-auto jv-pop">
      <section className="rounded-2xl p-4 sm:p-5" style={box}>
        {current ? <Thread key={`${current.id}-${sent}`} c={current} onBack={() => { setSel(null); dispatch({ type: 'open', view: { type: 'messages' } }); }} onReply={() => setReplying(true)} /> : <>
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={17} color="#0084FF" />
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: C.text2 }}>Messenger · {data.unreadCount ? `${data.unreadCount} unread` : 'all read'}</h2>
            <button type="button" onClick={() => reload(true)} className="ml-auto text-[13px] hover:underline" style={{ color: C.cyan }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
          {convos.length ? (
            <ul className="flex flex-col">
              {convos.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSel(c.id)} className="w-full text-left py-3 px-2 rounded-lg hover:bg-white/5 flex gap-3 min-w-0">
                    <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: c.unread ? '#0084FF' : 'transparent' }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className={`truncate text-[14.5px] ${c.unread ? 'font-bold' : 'font-medium'}`} style={{ color: C.text }}>{c.name}</span><span className="ml-auto text-[12.5px] shrink-0" style={{ color: C.muted }}>{timeAgo(c.lastAt)}</span></span>
                      <span className="block truncate text-[13.5px]" style={{ color: C.text2 }}>{c.lastFromPage ? 'You: ' : ''}{c.snippet || '(attachment)'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <div className="text-[14px]" style={{ color: C.muted }}>No conversations yet.</div>}
        </>}
      </section>
      {replying && current?.psid && <ReplyDialog to={{ name: current.name, psid: current.psid, link: current.link }} onClose={() => setReplying(false)} onSent={() => { setSent(n => n + 1); void reload(true); }} />}
    </div>
  );
}
