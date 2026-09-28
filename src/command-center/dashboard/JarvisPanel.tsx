// Jarvis on the dashboard: the visual core with its real state, what it's
// doing right now, the Ask box (+ existing realtime voice control), suggested
// commands, and the latest answer (with its data cards). Earlier messages
// expand in place instead of scrolling inside the card.
import { useState } from 'react';
import { Bot, Send, Sparkles, Trash2, ChevronDown, Eye } from 'lucide-react';
import type { ActivityItem, ChatMsg, CommandCenterSummary } from '../types';
import { toolLabel } from '../tokens';
import { resultComponentFor } from '../utils/resultRenderer';
import { C, money, clock, shortDay } from '../ui/theme';
import { CommandCard, ActionButton } from '../ui/primitives';
import { JarvisOrb, orbLabel, orbColor, type OrbState } from '../ui/JarvisOrb';

export const SUGGESTED = [
  'Who needs follow-up?',
  "Move John's brakes to Thursday",
  'How are ads doing?',
  'What jobs are unpaid?',
  "What is tomorrow's route?",
];

// "What Jarvis is noticing": deterministic observations from the live
// dashboard data (never model output), so nothing here can be invented.
export function jarvisInsights(s: CommandCenterSummary, now = Date.now()): string[] {
  const out: string[] = [];
  const next = s.upcomingJobs[0];
  if (next) {
    const when = next.date === s.today.date ? `today at ${clock(next.time)}` : `${shortDay(next.date)} at ${clock(next.time)}`;
    out.push(next.job_status === 'ESTIMATE_SENT'
      ? `${next.customer || 'Next customer'}'s job ${when} still has an estimate waiting for approval.`
      : `Next job: ${next.customer || 'customer'} ${when}${next.service ? ` (${next.service})` : ''}.`);
  }
  const day = (s.activity || []).filter(e => e.type === 'payment' && now - new Date(e.at).getTime() < 86400000);
  if (day.length) {
    const sum = day.reduce((t, e) => t + (e.amount ?? 0), 0);
    out.push(`${money(sum, 2)} collected in the last 24 hours (${day.length} payment${day.length === 1 ? '' : 's'}).`);
  }
  const follow = s.needsAttention.filter(a => a.type === 'lead_follow_up').length;
  const unpaid = s.needsAttention.filter(a => a.type === 'unpaid_invoice').length;
  if (follow) out.push(`${follow} lead${follow === 1 ? ' is' : 's are'} due for follow-up.`);
  if (unpaid) out.push(`${unpaid} invoice${unpaid === 1 ? ' is' : 's are'} unpaid.`);
  const uncontacted = s.leadsSummary.total - s.leadsSummary.contacted;
  if (!follow && uncontacted > 0) out.push(`${uncontacted} lead${uncontacted === 1 ? '' : 's'} from the last 30 days never contacted.`);
  const w = s.weather?.today;
  if (w?.summary && /storm|thunder|rain|shower|snow|sleet|ice|wind/i.test(w.summary)) out.push(`Weather today: ${w.summary.toLowerCase()} (${w.highF}° / ${w.lowF}°) — plan outdoor work around it.`);
  if (!out.length) out.push('Nothing unusual right now — no overdue follow-ups, unpaid invoices or weather issues.');
  return out.slice(0, 4);
}

function Message({ m }: { m: ChatMsg }) {
  const mine = m.role === 'user';
  return (
    <div className={`rounded-lg px-3.5 py-2.5 ${mine ? 'ml-8' : ''}`} style={mine ? { background: 'rgba(52,214,255,0.08)', border: `1px solid ${C.border}` } : { background: 'rgba(255,255,255,0.025)', borderLeft: `3px solid ${C.cyan}` }}>
      <div className="text-[12px] font-semibold mb-0.5" style={{ color: mine ? C.text2 : C.cyan }}>{mine ? 'You' : 'Jarvis'}</div>
      <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: C.text }}>{m.content}</div>
      {m.cards && m.cards.length > 0 && (
        <div className="mt-2 space-y-2 rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}` }}>
          {m.cards.map((c, i) => { const Card = resultComponentFor(c.tool); return <Card key={i} payload={c.payload} />; })}
        </div>
      )}
    </div>
  );
}

export function JarvisPanel({ summary, state, asking, liveActivity, messages, onAsk, onClear, voiceControl, inputRef }: {
  summary: CommandCenterSummary; state: OrbState; asking: boolean; liveActivity: ActivityItem[]; messages: ChatMsg[]; onAsk: (q: string) => void; onClear: () => void; voiceControl: React.ReactNode; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const running = liveActivity.filter(a => a.status === 'running');
  const task = running.length ? toolLabel(running[running.length - 1].tool) : asking ? 'Thinking about your question…' : null;
  const lastUser = messages.map(m => m.role).lastIndexOf('user');
  const latest = lastUser >= 0 ? messages.slice(lastUser) : messages.slice(-1);
  const earlier = lastUser > 0 ? messages.slice(0, lastUser) : [];
  const submit = (text: string) => { if (!text.trim() || asking) return; onAsk(text.trim()); setQ(''); };

  return (
    <CommandCard id="cc-jarvis" variant="primary" scan className="p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-4">
        <JarvisOrb state={state} size={132} />
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Bot size={18} color={C.cyan} /><h2 className="text-[18px] font-semibold" style={{ color: C.text }}>Jarvis</h2></div>
          <div className="mt-1 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[12px] font-bold tracking-wider" style={{ color: orbColor(state), border: `1px solid ${orbColor(state)}55`, background: `${orbColor(state)}14` }}>
            <span className="cc-pulse" style={{ color: orbColor(state), background: orbColor(state), width: 7, height: 7 }} />{orbLabel(state)}
          </div>
          <div className="text-[13.5px] mt-2 leading-snug" style={{ color: C.text2 }}>{task ?? 'Ready. Ask about jobs, money, leads or SEO.'}</div>
        </div>
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(q); }} className="flex items-center gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-3.5 h-12" style={{ background: 'rgba(3,10,17,0.85)', border: `1px solid ${C.borderStrong}` }}>
          <Sparkles size={17} color={C.cyan} aria-hidden />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Jarvis…" aria-label="Ask Jarvis" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" style={{ color: C.text }} />
        </label>
        <ActionButton type="submit" variant="primary" icon={Send} disabled={asking || !q.trim()}>Ask</ActionButton>
      </form>
      <div className="-mt-1">{voiceControl}</div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map(s => (
          <button key={s} type="button" disabled={asking} onClick={() => submit(s)} className="cc-btn rounded-full px-3 py-1.5 text-[13px] disabled:opacity-40" style={{ border: `1px solid ${C.border}`, background: 'rgba(52,214,255,0.05)', color: C.text }}>{s}</button>
        ))}
      </div>

      <div className="rounded-xl p-3.5" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 text-[13.5px] font-semibold mb-2" style={{ color: C.text }}><Eye size={15} color={C.cyan} />What Jarvis is noticing</div>
        <ul className="flex flex-col gap-1.5">
          {jarvisInsights(summary).map((t, i) => (
            <li key={i} className="flex gap-2 text-[14px] leading-snug" style={{ color: C.text2 }}><span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: C.cyan }} /><span>{t}</span></li>
          ))}
        </ul>
      </div>

      {messages.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t" style={{ borderColor: C.border }}>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[13px] font-semibold" style={{ color: C.text2 }}>Latest</span>
            <div className="flex gap-1">
              {earlier.length > 0 && <ActionButton size="sm" variant="ghost" icon={ChevronDown} onClick={() => setShowAll(s => !s)}>{showAll ? 'Hide earlier' : `Earlier (${earlier.length})`}</ActionButton>}
              <ActionButton size="sm" variant="ghost" icon={Trash2} onClick={onClear} title="Clear the conversation">Clear</ActionButton>
            </div>
          </div>
          {showAll && earlier.map((m, i) => <Message key={`e${i}`} m={m} />)}
          {latest.map((m, i) => <Message key={`l${i}`} m={m} />)}
        </div>
      )}
    </CommandCard>
  );
}
