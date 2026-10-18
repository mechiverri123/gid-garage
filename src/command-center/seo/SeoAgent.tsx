// Local SEO agent screens inside SEO Mode: the status strip, the action queue
// (HIGH / MEDIUM / LOW with expandable WHY), Top-5 gap, blueprint, rank
// observations, research (knowledge base) and history/learning.
// Data: /jarvis/seo-data?action=actions|top5|blueprint|ranks|knowledge|history
// (functions/_lib/seo/agent-ops.js). Status changes use the existing
// update_recommendation actions. Nothing here edits the website.
import { useEffect, useState, type ReactNode } from 'react';
import { Target, ChevronDown, ChevronRight, ExternalLink, Copy, Check, TrendingUp, TrendingDown, MapPin, History, ListChecks, Upload } from 'lucide-react';
import { C, timeAgo, type Tone } from '../ui/theme';
import { CommandCard, SectionHeader, StatusBadge, Skeleton, ActionButton } from '../ui/primitives';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
type Post = (body: Record<string, unknown>) => Promise<unknown>;

const PRIORITY_TONE: Record<string, Tone> = { HIGH: 'red', MEDIUM: 'amber', LOW: 'muted' };
const box = { background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` };
const Muted = ({ children }: { children: ReactNode }) => <div className="text-[14px]" style={{ color: C.muted }}>{children}</div>;
const NotSetUp = ({ what }: { what: string }) => (
  <div className="text-[14px] rounded-xl px-4 py-3" style={{ color: C.amber, background: 'rgba(255,184,77,0.07)', border: '1px solid rgba(255,184,77,0.35)' }}>
    {what} needs the SEO agent tables — run <code>seo_agent_migration.sql</code> once in the Supabase SQL editor.
  </div>
);

// ---- status strip -------------------------------------------------------------------------

export function AgentStatus({ a, onOpen }: { a: Any | undefined; onOpen: () => void }) {
  if (!a) return <Skeleton className="h-[120px]" />;
  const s = a.status || {};
  const v = s.visibility;
  const cell = (label: string, body: ReactNode) => (
    <div className="rounded-xl p-3.5 min-w-0" style={box}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: C.muted }}>{label}</div>
      <div className="text-[14.5px] leading-snug" style={{ color: C.text }}>{body}</div>
    </div>
  );
  return (
    <CommandCard className="p-5">
      <SectionHeader icon={Target} tone="red" title="Local SEO status" subtitle={s.lastAnalysis ? `Analysed ${timeAgo(s.lastAnalysis)}${s.baselineAt ? ` · baseline ${new Date(s.baselineAt).toLocaleDateString()}` : ''}` : 'What to do next to rank higher'}
        right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={onOpen}>Full action queue</button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-1">
        {cell('Current visibility', v ? <>{v.localImpressions.toLocaleString()} local impressions · {v.localClicks} clicks{v.avgCorePosition != null && <><br /><span style={{ color: C.text2 }}>avg position {v.avgCorePosition} on core searches</span></>}</> : <span style={{ color: C.text2 }}>Measured after the first analysis snapshot.</span>)}
        {cell('Trend', s.trend ? <span className="inline-flex items-center gap-1.5" style={{ color: s.trend.direction === 'up' ? C.green : C.amber }}>{s.trend.direction === 'up' ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{s.trend.text}</span> : <span style={{ color: C.text2 }}>No meaningful change since the last analysis.</span>)}
        {cell('Biggest opportunity', s.biggestOpportunity ? <>{s.biggestOpportunity.title} <span style={{ color: C.muted }}>· {s.biggestOpportunity.score}</span></> : '—')}
        {cell('Biggest problem', s.biggestProblem ? s.biggestProblem.title : '—')}
      </div>
      {s.searchUpdates?.length > 0 && (
        <div className="mt-3 rounded-xl px-4 py-3 text-[14px]" role="status" style={{ color: C.amber, background: 'rgba(255,184,77,0.07)', border: '1px solid rgba(255,184,77,0.35)' }}>
          {s.searchUpdates.map((u: Any) => <div key={u.title}><b>Google {u.title}</b> rolling out since {String(u.started).slice(0, 10)} — positions can move for every site; judge results after it ends. <a href={u.url} target="_blank" rel="noreferrer" className="underline">Details</a></div>)}
        </div>
      )}
      {s.changes?.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[14px]" style={{ color: C.text2 }}>
          <li className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>Changes since last analysis</li>
          {s.changes.slice(0, 5).map((c: Any, i: number) => <li key={i} className="flex items-start gap-1.5">{c.direction === 'up' ? <TrendingUp size={14} color={C.green} className="mt-0.5 shrink-0" /> : <TrendingDown size={14} color={C.amber} className="mt-0.5 shrink-0" />}{c.text}</li>)}
        </ul>
      )}
    </CommandCard>
  );
}

// ---- action cards --------------------------------------------------------------------------

function brief(c: Any) {
  return [`SEO action for gidgarage.com: ${c.title}`, '', `Why: ${c.why}`, '', 'What we found:', c.found, '', `Action: ${c.action}`,
    c.files?.length ? `\nFiles likely involved: ${c.files.join(', ')}` : '', c.affectedSearches?.length ? `\nSearches: ${c.affectedSearches.join(', ')}` : '',
    '', 'Rules: follow Google guidance (no doorway pages, keyword stuffing or fake content). Show me the exact diff before changing anything.',
    ...(c.sources || []).map((s: Any) => `Source: ${s.title} — ${s.url}`)].filter(x => x !== '').join('\n');
}

export function ActionCard({ c, post, compact = false }: { c: Any; post: Post; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const act = async (recAction: string, label: string) => {
    setBusy(recAction); setMsg(null);
    try { for (const id of c.ids as string[]) await post({ action: 'update_recommendation', id, recAction }); setMsg(label); }
    catch (e) { setMsg(`Not changed: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(null); }
  };
  const high = c.priority === 'HIGH';
  return (
    <li className="rounded-2xl p-4 sm:p-5 min-w-0" style={{ background: high ? 'rgba(255,77,95,0.06)' : 'rgba(3,10,17,0.5)', border: `1px solid ${high ? 'rgba(255,77,95,0.45)' : C.border}` }}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center" style={{ background: 'rgba(3,10,17,0.7)', border: `1px solid ${C.border}` }} title="GID Opportunity Score — GID's own prioritisation, not a Google score">
          <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{c.opportunityScore}</span>
          <span className="text-[11px] mt-0.5" style={{ color: C.muted }}>score</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>
            <StatusBadge tone="cyan">{c.category}</StatusBadge>
            {c.status !== 'open' && <StatusBadge tone={c.status === 'applied' ? 'purple' : 'green'}>{c.statusLabel}</StatusBadge>}
          </div>
          <h3 className={`font-semibold leading-snug break-words ${high ? 'text-[17px]' : 'text-[15.5px]'}`} style={{ color: C.text }}>{c.title}</h3>
          <div className="text-[13px] mt-1" style={{ color: C.text2 }}>Impact {c.impact} · Effort {c.effort} · Confidence {c.confidence}{c.analyzedAt ? ` · analysed ${timeAgo(c.analyzedAt)}` : ''}</div>
          {!compact && <p className="text-[14.5px] mt-2 leading-relaxed" style={{ color: C.text }}><b>Do this:</b> {c.action}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[13.5px] font-semibold hover:underline" style={{ color: C.cyan }} aria-expanded={open}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}Why?</button>
        <span className="ml-auto flex flex-wrap gap-2">
          {c.status === 'open' && <ActionButton size="sm" disabled={!!busy} onClick={() => act('accept', 'Marked in progress.')}>Start</ActionButton>}
          {(c.status === 'open' || c.status === 'accepted') && <ActionButton size="sm" variant="primary" disabled={!!busy} onClick={() => act('mark_applied', 'Done — measuring the effect at 7, 30, 90 and 180 days.')}>Done</ActionButton>}
          {c.status === 'open' && <ActionButton size="sm" variant="ghost" disabled={!!busy} onClick={() => act('dismiss', 'Dismissed for 30 days.')}>Dismiss</ActionButton>}
          {c.files?.length > 0 && c.status !== 'applied' && (
            <ActionButton size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={() => { void navigator.clipboard?.writeText(brief(c)); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} title="Copies a precise brief for Claude Code; it shows the diff before changing anything">{copied ? 'Copied' : 'Implement'}</ActionButton>
          )}
        </span>
      </div>
      {msg && <div className="text-[13.5px] mt-2" role="status" style={{ color: msg.startsWith('Not') ? C.amber : C.green }}>{msg}</div>}
      {open && (
        <div className="mt-3 flex flex-col gap-3 text-[14px] leading-relaxed" style={{ color: C.text2 }}>
          <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Why this matters</div>{c.why}</div>
          <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>What we found</div><div className="whitespace-pre-line break-words">{c.found}</div></div>
          {compact && <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Exact action</div>{c.action}</div>}
          {c.affectedSearches?.length > 0 && <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Affected searches</div>{c.affectedSearches.join(' · ')}</div>}
          {c.files?.length > 0 && <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Files that would change</div><code className="break-words">{c.files.join(', ')}</code></div>}
          <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Score</div>impact {c.scoreParts?.impact} × confidence {c.scoreParts?.confidence} × value {c.scoreParts?.value} × learning {c.scoreParts?.learning} ÷ effort {c.scoreParts?.effort}</div>
          {c.sources?.length > 0 && (
            <div><div className="font-semibold mb-0.5" style={{ color: C.text }}>Sources</div>
              <ul className="flex flex-col gap-1">{c.sources.map((s: Any) => (
                <li key={s.id}><a className="inline-flex items-center gap-1 underline" style={{ color: C.cyan }} href={s.url} target="_blank" rel="noreferrer">{s.title}<ExternalLink size={12} /></a> <span className="text-[12px] uppercase" style={{ color: C.muted }}>{String(s.tier).replace(/_/g, ' ')}</span><div>{s.claim}</div></li>
              ))}</ul>
            </div>
          )}
          <details><summary className="cursor-pointer" style={{ color: C.muted }}>Raw evidence</summary><pre className="text-[12px] whitespace-pre-wrap break-words mt-1" style={{ color: C.muted }}>{JSON.stringify(c.evidence, null, 1)}</pre></details>
        </div>
      )}
    </li>
  );
}

function Tier({ title, tone, cards, post, empty, compact }: { title: string; tone: Tone; cards: Any[]; post: Post; empty?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2"><StatusBadge tone={tone} dot>{title}</StatusBadge><span className="text-[13px]" style={{ color: C.muted }}>{cards.length}</span></div>
      {cards.length ? <ul className="flex flex-col gap-3">{cards.map(c => <ActionCard key={c.id} c={c} post={post} compact={compact} />)}</ul> : empty ? <Muted>{empty}</Muted> : null}
    </div>
  );
}

// The top of SEO Mode: HIGH priority, visually dominant.
export function ActionQueueTop({ a, post }: { a: Any | undefined; post: Post }) {
  if (!a) return <Skeleton className="h-[260px]" />;
  return (
    <CommandCard className="p-5">
      <SectionHeader icon={ListChecks} tone="red" title="What to do next" subtitle="Highest-value actions first, scored from GID's own data" />
      <Tier title="HIGH PRIORITY" tone="red" cards={a.high} post={post} empty="No high-priority actions right now." />
    </CommandCard>
  );
}

export function ActionsView({ a, post }: { a: Any | undefined; post: Post }) {
  if (!a) return <Skeleton className="h-[400px]" />;
  return (
    <div className="flex flex-col gap-6">
      <Tier title="HIGH PRIORITY" tone="red" cards={a.high} post={post} empty="Nothing high priority." />
      <Tier title="MEDIUM PRIORITY" tone="amber" cards={a.medium} post={post} compact empty="Nothing medium priority." />
      <Tier title="LOW PRIORITY" tone="muted" cards={a.low} post={post} compact />
      {a.inProgress?.length > 0 && <Tier title="IN PROGRESS" tone="cyan" cards={a.inProgress} post={post} compact />}
      {a.monitoring?.length > 0 && <Done cards={a.monitoring} post={post} />}
      {a.decisions?.length > 0 && <Tier title="YOUR DECISION NEEDED" tone="amber" cards={a.decisions} post={post} compact />}
    </div>
  );
}

// Done work leaves the queue: a single line, expandable, while its effect is measured.
function Done({ cards, post }: { cards: Any[]; post: Post }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={() => setOpen(o => !o)} className="self-start inline-flex items-center gap-2 text-[14px]" style={{ color: C.text2 }} aria-expanded={open}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <StatusBadge tone="green" dot>DONE</StatusBadge>
        {cards.length} completed — measuring the effect at 7, 30, 90 and 180 days (History tab)
      </button>
      {open && <ul className="flex flex-col gap-3">{cards.map(c => <ActionCard key={c.id} c={c} post={post} compact />)}</ul>}
    </div>
  );
}

// ---- Top-5 gap -----------------------------------------------------------------------------

const GAP_TONE: Record<string, Tone> = { behind: 'red', competitive: 'green', unknown: 'muted', info: 'cyan' };
export function Top5View({ t }: { t: Any | undefined }) {
  if (!t) return <Skeleton className="h-[400px]" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed" style={{ color: C.text }}>{t.summary}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {t.sections.map((s: Any) => (
          <div key={s.id} className="rounded-xl p-4" style={box}>
            <div className="flex items-center gap-2 mb-1.5"><span className="font-semibold text-[15px]" style={{ color: C.text }}>{s.title}</span><span className="ml-auto"><StatusBadge tone={GAP_TONE[s.status]}>{s.status === 'info' ? 'context' : s.status}</StatusBadge></span></div>
            <p className="text-[14px] leading-relaxed" style={{ color: C.text2 }}>{s.statement}</p>
          </div>
        ))}
      </div>
      {t.actions?.length > 0 && <div className="text-[14px]" style={{ color: C.text2 }}><b style={{ color: C.text }}>Closing these first:</b> {t.actions.map((x: Any) => x.title).join(' · ')}</div>}
    </div>
  );
}

// ---- blueprint -----------------------------------------------------------------------------

export function BlueprintView({ b, post }: { b: Any | undefined; post: Post }) {
  if (!b) return <Skeleton className="h-[400px]" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {b.horizons.map((hz: Any) => (
        <div key={hz.id} className="rounded-xl p-4 min-w-0" style={box}>
          <div className="font-semibold text-[15px] mb-2" style={{ color: C.text }}>{hz.label} <span className="text-[13px]" style={{ color: C.muted }}>{hz.items.length}</span></div>
          {hz.items.length ? (
            <ul className="flex flex-col gap-2">
              {hz.items.map((c: Any) => (
                <li key={c.id} className="flex items-start gap-2 text-[14px] min-w-0">
                  <button type="button" aria-label={`Mark "${c.title}" done`} title="Mark done (starts measuring)" onClick={() => { for (const id of c.ids) void post({ action: 'update_recommendation', id, recAction: 'mark_applied' }).catch(() => {}); }}
                    className="mt-0.5 w-[18px] h-[18px] rounded shrink-0" style={{ border: `1.5px solid ${C.borderStrong}` }} />
                  <span className="min-w-0"><span style={{ color: C.text }}>{c.title}</span><br /><span className="text-[12.5px]" style={{ color: C.muted }}>{c.priority} · impact {c.impact} · effort {c.effort} · {c.statusLabel}</span></span>
                </li>
              ))}
            </ul>
          ) : <Muted>Nothing scheduled.</Muted>}
        </div>
      ))}
    </div>
  );
}

// ---- rank observations ------------------------------------------------------------------------

// ---- scorecard: every ranking metric + one-tap live checks -------------------------------------

// Google's location parameter: results as if searching from that town, not where you sit.
const UULE_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const uule = (place: string) => { const name = `${place},Arizona,United States`; return `w+CAIQICI${encodeURIComponent(UULE_KEY[name.length] + btoa(name))}`; };
const enc = encodeURIComponent;
const liveLinks = (q: string, a: { name: string; lat: number; lng: number }) => {
  const town = /NAU/.test(a.name) ? 'Flagstaff' : a.name;
  return [
    { label: 'Google', href: `https://www.google.com/search?q=${enc(q)}&pws=0&gl=us&hl=en&uule=${uule(town)}` },
    { label: 'Maps', href: `https://www.google.com/maps/search/${enc(q)}/@${a.lat},${a.lng},13z` },
    { label: 'Bing', href: `https://www.bing.com/maps?q=${enc(q)}&cp=${a.lat}~${a.lng}&lvl=13` },
    { label: 'Apple', href: `https://maps.apple.com/?q=${enc(q)}&sll=${a.lat},${a.lng}&z=13` },
  ];
};
const AI_QUESTIONS = ['Who is the best mobile mechanic in Flagstaff, AZ?', 'Recommend an auto repair service in Flagstaff AZ that comes to you'];
const aiLinks = (q: string) => [
  { label: 'ChatGPT', href: `https://chatgpt.com/?q=${enc(q)}` },
  { label: 'Google AI', href: `https://www.google.com/search?q=${enc(q)}&udm=50` },
  { label: 'Perplexity', href: `https://www.perplexity.ai/search?q=${enc(q)}` },
];
const LISTINGS = [
  { label: 'Google listing', href: 'https://g.page/r/CdERSypGqVdlEBM' },
  { label: 'Google search: GID Garage', href: `https://www.google.com/search?q=${enc('GID Garage Flagstaff')}&pws=0` },
  { label: 'Yelp', href: 'https://www.yelp.com/biz/gid-garage-flagstaff' },
  { label: 'Bing', href: `https://www.bing.com/search?q=${enc('GID Garage Flagstaff')}` },
  { label: 'Apple Maps', href: `https://maps.apple.com/?q=${enc('GID Garage')}&sll=35.1983,-111.6513` },
];

const Chip = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap hover:brightness-125"
    style={{ background: 'rgba(52,214,255,0.08)', border: `1px solid ${C.borderStrong}`, color: C.text }}>{children}<ExternalLink size={12} /></a>
);

// Change vs the earlier window. lowerIsBetter for positions.
function Delta({ now, before, lowerIsBetter = false }: { now: number | null; before: number | null; lowerIsBetter?: boolean }) {
  if (now == null || before == null || now === before) return <span style={{ color: C.muted }}>{before == null ? 'no earlier data' : 'no change'}</span>;
  const diff = Math.round((now - before) * 10) / 10;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const Icon = good ? TrendingUp : TrendingDown;
  const text = lowerIsBetter ? `${good ? 'up' : 'down'} ${Math.abs(diff)} spot${Math.abs(diff) === 1 ? '' : 's'}` : `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-US')} vs before`;
  return <span className="inline-flex items-center gap-1" style={{ color: good ? C.green : C.amber }}><Icon size={13} />{text}</span>;
}

function Tile({ label, value, tone, sub, note }: { label: string; value: ReactNode; tone?: string; sub?: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl p-3 min-w-0" style={box} title={note}>
      <div className="text-[12.5px]" style={{ color: C.text2 }}>{label}</div>
      <div className="text-[22px] font-semibold tabular-nums leading-tight mt-0.5 break-words" style={{ color: tone || C.text }}>{value}</div>
      {sub && <div className="text-[12.5px] mt-0.5 break-words" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function Scorecard({ r, post, technical, connections }: { r: Any; post: Post; technical?: Any; connections?: Any }) {
  const areas: { name: string; lat: number; lng: number }[] = r.areas || [];
  const [areaName, setAreaName] = useState('Flagstaff');
  const [logged, setLogged] = useState<Record<string, string>>({});
  const [entry, setEntry] = useState<Record<string, string>>({});
  const area = areas.find(a => a.name === areaName) || { name: 'Flagstaff', lat: 35.1983, lng: -111.6513 };
  const s = r.search; const t = s?.totals || {};
  const sum: Any = Object.fromEntries((r.summary || []).map((x: Any) => [x.id, x]));
  const ownRace = r.reviews?.rows?.find((x: Any) => x.own);
  const posTone = (n: number | null) => (n == null ? C.muted : n <= 3 ? C.green : n <= 5 ? C.cyan : n <= 10 ? C.amber : C.red);
  const speed: Any[] = technical?.pagespeed || [];
  const mobile = speed.find(p => p.strategy === 'mobile' && /gidgarage\.com\/?$/.test(p.url)) || speed.find(p => p.strategy === 'mobile');
  const issues = (technical?.checks || []).reduce((n: number, c: Any) => n + (c.issues?.length || 0), 0);
  const providers: Any[] = connections?.providers || [];
  const lastSync = providers.map(p => p.lastSyncAt).filter(Boolean).sort().pop();
  const gsc = providers.find(p => /search_console|gsc/i.test(p.id));
  const cell = (q: string) => r.grid?.cells?.[`${q}|${area.name}`];
  const m: Any = r.maps;
  const mapsBySearch: { k: string; cells: Any[] }[] = m ? [...new Set<string>(m.cells.map((c: Any) => c.keyword))].map(k => ({ k, cells: m.cells.filter((c: Any) => c.keyword === k) })) : [];
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');
  const checkNow = async () => {
    setChecking(true); setCheckMsg('');
    try { const d = await post({ action: 'run_monitor', id: 'maps_rank' }) as Any; setCheckMsg(d?.detail || 'Checked.'); } catch (e) { setCheckMsg(e instanceof Error ? e.message : String(e)); }
    setChecking(false);
  };
  const move = (c: Any) => {
    if (!c.checkedBefore || c.rank === c.before) return null;
    if (c.rank == null) return <span style={{ color: C.red }}> dropped out</span>;
    if (c.before == null) return <span style={{ color: C.green }}> new</span>;
    const d = c.before - c.rank;
    return <span style={{ color: d > 0 ? C.green : C.red }}> {d > 0 ? '↑' : '↓'}{Math.abs(d)}</span>;
  };

  const log = async (q: string) => {
    const v = entry[q] ?? '';
    const rank = v === '' ? null : Number(v);
    try {
      await post({ action: 'add_rank', keyword: q, area: area.name, rank, in_local_pack: rank != null && rank <= 3, note: 'Scorecard live check (Maps position)' });
      setLogged(l => ({ ...l, [q]: rank == null ? 'saved: not shown' : `saved: #${rank}` }));
    } catch (e) { setLogged(l => ({ ...l, [q]: `not saved: ${e instanceof Error ? e.message : String(e)}` })); }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Every number at a glance */}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Where you rank <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>{lastSync ? `data synced ${timeAgo(lastSync)}` : ''}{s?.period ? ` · Google search ${s.period.from} to ${s.period.to} vs the 28 days before (Google reports about 3 days late)` : ''}</span></h3>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <Tile label="Google search position (local service searches)" value={t.position != null ? `#${t.position}` : '—'} tone={posTone(t.position ?? null)} sub={<Delta now={t.position ?? null} before={t.previousPosition ?? null} lowerIsBetter />} note="Average position across every local service search you showed for, weighted by how often you showed. From Search Console." />
          <Tile label="Clicks from those searches" value={t.clicks ?? '—'} sub={<Delta now={t.clicks ?? null} before={t.previousClicks ?? null} />} />
          <Tile label="Times you showed (impressions)" value={t.impressions != null ? Number(t.impressions).toLocaleString('en-US') : '—'} sub={<Delta now={t.impressions ?? null} before={t.previousImpressions ?? null} />} />
          {m
            ? <Tile label="Google Maps top 3 (checked daily)" value={`${m.top3} of ${m.checks}`} tone={m.top3 ? C.green : C.amber} sub={m.average != null ? `average #${m.average} when shown` : 'not shown yet'} />
            : <Tile label="Google Maps" value="—" sub="Checked automatically every day. Press Check now below for the first one." />}
          <Tile label="New reviews, last 30 days" value={ownRace ? `+${ownRace.gained}` : '—'} tone={ownRace?.gained ? C.green : C.muted} sub={r.reviews?.ownPlace ? `#${r.reviews.ownPlace} of ${r.reviews.of} mobile mechanics for new reviews` : undefined} />
          <Tile label="Google reviews · rating" value={sum.reviews ? `${String(sum.reviews.detail).replace(' reviews', '')} · ${sum.rating?.detail ?? ''}` : '—'} sub={sum.reviews?.rank ? `#${sum.reviews.rank} of ${sum.reviews.of} by count · #${sum.rating?.rank ?? '—'} by rating` : undefined} />
          <Tile label="Strength vs competitors" value={sum.strength?.rank ? `#${sum.strength.rank}` : '—'} tone={posTone(sum.strength?.rank ?? null)} sub={sum.strength?.of ? `of ${sum.strength.of} · reviews × rating (GID's estimate)` : undefined} />
          <Tile label="AI assistants" value={sum.ai ? (sum.ai.rank != null ? `#${sum.ai.rank}` : 'Not named') : '—'} tone={sum.ai?.rank != null ? C.green : C.amber} sub={sum.ai?.detail || 'checked weekly'} />
          <Tile label="Phone speed (PageSpeed)" value={mobile?.perfScore ?? '—'} tone={mobile?.perfScore == null ? C.muted : mobile.perfScore >= 90 ? C.green : mobile.perfScore >= 50 ? C.amber : C.red} sub={mobile?.fetchedAt ? `homepage, measured ${timeAgo(mobile.fetchedAt)}` : undefined} />
          <Tile label="Site issues found" value={technical ? issues : '—'} tone={issues ? C.amber : C.green} sub={technical?.pagesAudited ? `${technical.pagesAudited} pages audited` : undefined} />
          <Tile label="Search Console synced" value={gsc?.lastSyncAt ? timeAgo(gsc.lastSyncAt) : '—'} sub="Sync now (Connections) refreshes it" />
        </div>
      </section>

      {/* 2. Google Maps, checked automatically every day (monitors.js maps_rank) */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Google Maps position <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>checked automatically every day{m ? ` · last check ${m.date}${m.comparedTo ? `, arrows vs ${m.comparedTo}` : ''}` : ''}</span></h3>
          <span className="inline-flex items-center gap-2 flex-wrap lg:ml-auto">
            <ActionButton size="sm" variant="primary" disabled={checking} onClick={checkNow}>{checking ? 'Checking every search…' : 'Check now'}</ActionButton>
            {checkMsg && <span className="text-[13px]" role="status" style={{ color: C.muted }}>{checkMsg}</span>}
          </span>
        </div>
        {!m ? <p className="text-[13.5px]" style={{ color: C.text2 }}>No automatic check yet. Press Check now; after that it runs by itself every day.</p> : <>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            <Tile label="In the map pack (top 3)" value={`${m.top3} of ${m.checks}`} tone={m.top3 ? C.green : C.amber} sub={m.top3Before != null ? <Delta now={m.top3} before={m.top3Before} /> : 'arrows start after a week of checks'} />
            <Tile label="Average Maps position (when shown)" value={m.average != null ? `#${m.average}` : '—'} tone={posTone(m.average)} sub={m.averageBefore != null && m.average != null ? <Delta now={m.average} before={m.averageBefore} lowerIsBetter /> : undefined} />
            <Tile label="Shown at all" value={`${m.shown} of ${m.checks}`} tone={m.shown === m.checks ? C.green : C.amber} sub="searches × towns, top 20 checked" />
          </div>
          <div className="flex flex-col gap-2">
            {mapsBySearch.map(({ k, cells }) => {
              const fl = cells.find(c => c.area === 'Flagstaff');
              return (
                <div key={k} className="rounded-xl p-3 flex flex-col gap-1.5" style={box}>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-[14.5px] font-medium" style={{ color: C.text }}>{k}</span>
                    {fl && fl.rank !== 1 && fl.leader && <span className="text-[12.5px]" style={{ color: C.muted }}>#1 in Flagstaff: {fl.leader}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cells.map(c => (
                      <span key={c.area} className="text-[13px] rounded-lg px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.text2 }}>
                        {c.area} <b style={{ color: posTone(c.rank) }}>{c.rank != null ? `#${c.rank}` : 'not shown'}</b>{move(c)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {m.categories?.beatingYou?.length > 0 && (
            <div className="rounded-xl p-3 flex flex-col gap-1.5" style={box}>
              <span className="text-[14.5px] font-medium" style={{ color: C.text }}>Google categories of the businesses above you</span>
              <span className="text-[13px]" style={{ color: C.text2 }}>Your main category on Google: <b>{m.categories.yours || 'not found'}</b>. Where you're not top 3, the ones above you are listed as:</span>
              <div className="flex flex-wrap gap-1.5">
                {m.categories.beatingYou.slice(0, 8).map((c: Any) => (
                  <span key={c.category} title={c.names.join(', ')} className="text-[13px] rounded-lg px-2 py-1" style={{ border: `1px solid ${c.missing ? C.amber : C.border}`, color: C.text2 }}>
                    {c.category} <b>{c.searches}×</b>{c.missing ? ' · not your main one' : ''}
                  </span>
                ))}
              </div>
              <span className="text-[12.5px]" style={{ color: C.muted }}>Updated with the daily check. Categories you don't have are worth adding as extra categories in Google Business Profile if they truly fit what you do (hover a chip for who uses it).</span>
            </div>
          )}
          <p className="text-[12.5px]" style={{ color: C.muted }}>From Google's own Places search, run from each town: very close to the Maps app, not identical (Maps also weighs each searcher's history and exact spot).</p>
        </>}
      </section>

      {/* 3. Search by search + see it yourself */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>See it yourself</h3>
          <label className="flex items-center gap-2 text-[13.5px]" style={{ color: C.text2 }}>Search from
            <select className="h-9 rounded-lg px-2 text-[14px] outline-none" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text, colorScheme: 'dark' }} value={areaName} onChange={e => setAreaName(e.target.value)}>
              {areas.map(a => <option key={a.name}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[13.5px]" style={{ color: C.text2 }}>Nothing to do here; the Maps positions above update by themselves. These buttons open the real results as if searching from {area.name}, if you want to see them. The Google number is Search Console's 28-day average. Logging a Maps number by hand is optional.</p>
        <div className="flex flex-col gap-2">
          {(s?.searches || []).map((q: Any) => {
            const c = cell(q.query);
            return (
              <div key={q.query} className="rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4" style={box}>
                <div className="min-w-0 lg:w-[34%]">
                  <div className="text-[14.5px] font-medium break-words" style={{ color: C.text }}>{q.query}</div>
                  <div className="text-[12.5px] flex flex-wrap gap-x-3" style={{ color: C.muted }}>
                    <span>Google: <b style={{ color: posTone(q.position) }}>{q.position != null ? `#${q.position}` : 'no data'}</b>{q.position != null && <> · <Delta now={q.position} before={q.previousPosition} lowerIsBetter /></>}</span>
                    <span>{q.clicks} clicks / {q.impressions} shown</span>
                    <span>Maps here: {c ? <b style={{ color: posTone(c.rank) }}>{c.rank != null ? `#${c.rank}` : 'not shown'}</b> : 'not checked'}{c ? ` (${c.date})` : ''}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">{liveLinks(q.query, area).map(l => <Chip key={l.label} href={l.href}>{l.label}</Chip>)}</div>
                <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
                  <input aria-label={`Maps position for ${q.query}`} inputMode="numeric" placeholder="Maps #" value={entry[q.query] ?? ''} onChange={e => setEntry(x => ({ ...x, [q.query]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                    className="h-8 w-[72px] rounded-lg px-2 text-[13.5px] outline-none" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text, colorScheme: 'dark' }} />
                  <ActionButton size="sm" onClick={() => log(q.query)}>Log</ActionButton>
                  {logged[q.query] && <span className="text-[12.5px]" role="status" style={{ color: logged[q.query].startsWith('not') ? C.amber : C.green }}>{logged[q.query]}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[12.5px]" style={{ color: C.muted }}>Tip: open these in a private window (Ctrl+Shift+N) so your own past searches don't skew the results.</p>
      </section>

      {/* 4. Review race */}
      {r.reviews?.rows?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Review race <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>new Google reviews in the last 30 days, mobile mechanics in your area</span></h3>
          <div className="flex flex-col gap-1">
            {r.reviews.rows.map((x: Any) => (
              <div key={x.name} className="flex items-center gap-3 text-[14px] rounded-lg px-3 py-1.5" style={{ background: x.own ? 'rgba(52,214,255,0.08)' : 'transparent', color: x.own ? C.text : C.text2 }}>
                <span className="flex-1 min-w-0 truncate">{x.name}</span>
                <span className="tabular-nums" style={{ color: x.gained > 0 ? C.green : C.muted }}>+{x.gained}</span>
                <span className="tabular-nums w-[92px] text-right" style={{ color: C.muted }}>{x.reviews} total</span>
              </div>
            ))}
          </div>
          <p className="text-[12.5px]" style={{ color: C.muted }}>Counted from {r.reviews.rows[0].since} (or 30 days ago, whichever is later).</p>
        </section>
      )}

      {/* 4. AI + listings */}
      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
          <div className="text-[14px] font-semibold" style={{ color: C.text }}>Ask the AI assistants yourself</div>
          {AI_QUESTIONS.map(q => (
            <div key={q} className="flex flex-col gap-1.5">
              <span className="text-[13px]" style={{ color: C.text2 }}>"{q}"</span>
              <div className="flex flex-wrap gap-1.5">{aiLinks(q).map(l => <Chip key={l.label} href={l.href}>{l.label}</Chip>)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3 flex flex-col gap-2" style={box}>
          <div className="text-[14px] font-semibold" style={{ color: C.text }}>See your listings as customers do</div>
          <div className="flex flex-wrap gap-1.5">{LISTINGS.map(l => <Chip key={l.label} href={l.href}>{l.label}</Chip>)}</div>
        </div>
      </section>
    </div>
  );
}

export function RankingsView({ r, post, technical, connections }: { r: Any | undefined; post: Post; technical?: Any; connections?: Any }) {
  const [keyword, setKeyword] = useState('mobile mechanic flagstaff');
  const [area, setArea] = useState('Flagstaff');
  const [rank, setRank] = useState('');
  const [pack, setPack] = useState(false);
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!r) return <Skeleton className="h-[300px]" />;
  if (r.error && !r.ready) return <NotSetUp what="Rank observations" />;
  const save = async (body: Record<string, unknown>, ok: (o: Any) => string) => {
    try { const o = await post(body) as Any; setMsg(ok(o)); } catch (e) { setMsg(`Not saved: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const input = 'h-10 rounded-lg px-3 text-[14px] outline-none min-w-0';
  const inputStyle = { background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text, colorScheme: 'dark' as const };
  const g = r.grid;
  const tone = (n: number | null) => (n == null ? C.muted : n <= 3 ? C.green : n <= 5 ? C.cyan : n <= 10 ? C.amber : C.red);
  return (
    <div className="flex flex-col gap-4">
      <Scorecard r={r} post={post} technical={technical} connections={connections} />
      <h3 className="font-semibold text-[15px] mt-2" style={{ color: C.text }}>Log a check by hand</h3>
      <p className="text-[14px]" style={{ color: C.text2 }}>Local rank depends on where the searcher stands, so record it per area. Search on your phone from (or set to) that area, note GID's position in the map pack. No scraping — manual, CSV, or a rank-tracker export.</p>
      <div className="grid gap-2 sm:grid-cols-[2fr_1.3fr_0.8fr_auto_auto] items-end">
        <label className="flex flex-col gap-1"><span className="text-[12.5px]" style={{ color: C.text2 }}>Search</span><input className={input} style={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12.5px]" style={{ color: C.text2 }}>Area</span>
          <select className={input} style={inputStyle} value={area} onChange={e => setArea(e.target.value)}>{(r.areas || []).map((a: Any) => <option key={a.name}>{a.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-[12.5px]" style={{ color: C.text2 }}>GID rank</span><input className={input} style={inputStyle} inputMode="numeric" placeholder="blank = not shown" value={rank} onChange={e => setRank(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="flex items-center gap-2 h-10 text-[13.5px]" style={{ color: C.text2 }}><input type="checkbox" checked={pack} onChange={e => setPack(e.target.checked)} />Map pack</label>
        <ActionButton variant="primary" onClick={() => save({ action: 'add_rank', keyword, area, rank: rank || null, in_local_pack: pack }, () => 'Saved.')}>Add</ActionButton>
      </div>
      <details className="rounded-xl p-3" style={box}>
        <summary className="cursor-pointer text-[14px] inline-flex items-center gap-1.5" style={{ color: C.text }}><Upload size={14} />Import CSV</summary>
        <p className="text-[13px] mt-2" style={{ color: C.muted }}>keyword,area,rank,date,in_local_pack,competitors — e.g. <code>mobile mechanic flagstaff,Doney Park,4,2026-09-29,yes,Munoz &amp; Sons;Flagstaff Mobile Mechanic LLC</code></p>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={4} className="w-full rounded-lg p-2 mt-2 text-[13px] outline-none" style={inputStyle} aria-label="CSV rows" />
        <ActionButton size="sm" onClick={() => save({ action: 'import_ranks', csv }, o => `${o.added} imported${o.skipped ? `, ${o.skipped} lines skipped` : ''}.`)}>Import</ActionButton>
      </details>
      {msg && <div role="status" className="text-[14px]" style={{ color: msg.startsWith('Not') ? C.amber : C.green }}>{msg}</div>}
      {g.keywords.length ? (
        <div className="overflow-x-auto">
          <table className="text-[13.5px] border-separate border-spacing-1">
            <thead><tr><th className="text-left pr-2" style={{ color: C.muted }}>Search</th>{g.areas.map((a: string) => <th key={a} className="px-1 font-medium" style={{ color: C.text2 }}><MapPin size={12} className="inline" /> {a}</th>)}</tr></thead>
            <tbody>{g.keywords.map((k: string) => (
              <tr key={k}><td className="pr-2" style={{ color: C.text }}>{k}</td>{g.areas.map((a: string) => { const cell = g.cells[`${k}|${a}`]; return (
                <td key={a} className="text-center rounded-md px-2 py-1 tabular-nums" title={cell ? `${cell.date}${cell.localPack ? ' · map pack' : ''}` : 'no observation'} style={{ background: cell ? `${tone(cell.rank)}22` : 'transparent', color: cell ? tone(cell.rank) : C.muted }}>{cell ? (cell.rank ?? '—') : ''}</td>); })}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Muted>No observations yet.</Muted>}
    </div>
  );
}

// ---- research / knowledge base ------------------------------------------------------------------

const TIER_TONE: Record<string, Tone> = { google_confirmed: 'green', strong_industry: 'cyan', experimental: 'amber', speculation: 'muted' };
// Read-only JSON from /jarvis/seo-data (news, ai) for the Research tab.
function useSeoRead(action: string) {
  const [data, setData] = useState<Any | null>(null);
  useEffect(() => { let live = true; fetch(`/jarvis/seo-data?action=${action}`).then(r => r.json()).then(d => { if (live) setData(d); }, () => {}); return () => { live = false; }; }, [action]);
  return data;
}

const REL_TONE: Record<string, Tone> = { high: 'red', medium: 'amber', low: 'cyan', info: 'muted' };
function SearchNews() {
  const n = useSeoRead('news');
  if (!n) return <Skeleton className="h-[160px]" />;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Search engine updates <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>{n.checkedAt ? `checked ${timeAgo(n.checkedAt)} · Google status, Google & Bing blogs` : 'first check runs on the next daily sync'}</span></h3>
      {n.items?.length ? (
        <ul className="flex flex-col gap-1.5">{n.items.slice(0, 15).map((i: Any) => (
          <li key={i.id} className="text-[14px] flex flex-wrap items-baseline gap-x-2" style={{ color: C.text2 }}>
            <StatusBadge tone={REL_TONE[i.relevance] || 'muted'}>{i.relevance}</StatusBadge>
            <span className="tabular-nums" style={{ color: C.muted }}>{String(i.date || '').slice(0, 10)}</span>
            <a href={i.url} target="_blank" rel="noreferrer" className="underline" style={{ color: C.text }}>{i.title}</a>
            {i.source === 'google_status' && !i.end && i.kind !== 'incident' && <StatusBadge tone="amber">rolling out</StatusBadge>}
            <span className="w-full text-[13px]" style={{ color: C.muted }}>{i.why}</span>
          </li>
        ))}</ul>
      ) : <Muted>No items yet.</Muted>}
    </section>
  );
}

function AiAnswers() {
  const a = useSeoRead('ai');
  const run = a?.runs?.[0];
  if (!a) return <Skeleton className="h-[120px]" />;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>AI assistant answers <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>{run ? `checked ${timeAgo(run.at)} · ${run.model}` : 'first check runs on the next weekly sync'}</span></h3>
      {run ? run.results.map((r: Any) => (
        <details key={r.question} className="rounded-xl p-3" style={box}>
          <summary className="cursor-pointer text-[14px]" style={{ color: C.text }}>
            <StatusBadge tone={r.mentioned ? 'green' : 'red'}>{r.mentioned ? `named${r.rank ? ` #${r.rank}` : ''}` : 'not named'}</StatusBadge> {r.question}
          </summary>
          <div className="text-[13.5px] mt-2 flex flex-col gap-1" style={{ color: C.text2 }}>
            {r.businesses?.length > 0 && <div><b style={{ color: C.text }}>Recommended:</b> {r.businesses.join(', ')}</div>}
            {r.sources?.length > 0 && <div><b style={{ color: C.text }}>Sources it read:</b> {r.sources.join(', ')}{r.gidCited ? ' (gidgarage.com cited)' : ''}</div>}
            <div className="whitespace-pre-line">{r.answer}</div>
          </div>
        </details>
      )) : <Muted>People ask ChatGPT, Gemini, Copilot and Claude for local recommendations. Each week Jarvis asks an AI assistant with live web search your customers' questions and records whether GID Garage is named.</Muted>}
    </section>
  );
}

// ---- where competitors are listed + link outreach (functions/_lib/seo/outreach.js) ----------

async function seoPost(body: Record<string, unknown>) {
  const r = await fetch('/jarvis/seo-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function RunNow({ id, label, onDone }: { id: string; label: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const run = async () => { setBusy(true); setMsg(''); try { const d = await seoPost({ action: 'run_monitor', id }); setMsg(d.detail || 'Done'); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } setBusy(false); };
  return <span className="inline-flex items-center gap-2 flex-wrap"><ActionButton size="sm" variant="secondary" disabled={busy} onClick={run}>{busy ? 'Working… (up to a minute)' : label}</ActionButton>{msg && <span className="text-[13px]" style={{ color: C.muted }}>{msg}</span>}</span>;
}

// "I'm on this": records the owner's listing (seo_citations) so it counts as listed.
function MarkListed({ name, site, onDone }: { name: string; site: string; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [url, setUrl] = useState(''); const [err, setErr] = useState('');
  const ok = (() => { try { const h = new URL(url).hostname; return h === site || h.endsWith(`.${site}`); } catch { return false; } })();
  const save = async () => { setErr(''); try { await seoPost({ action: 'add_citation', platform: name, url, observed_name: 'GID Garage' }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  if (!open) return <div><button type="button" className="text-[13px] underline" style={{ color: C.cyan }} onClick={() => setOpen(true)}>I'm on this — add my listing link</button></div>;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      <input value={url} onChange={e => setUrl(e.target.value.trim())} placeholder={`https://${site}/…  (your GID Garage page)`} aria-label={`Your ${name} listing link`}
        className="flex-1 min-w-[200px] rounded-lg px-2.5 py-1.5 text-[13.5px] outline-none" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
      <ActionButton size="sm" variant="primary" disabled={!ok} onClick={save}>Save</ActionButton>
      <ActionButton size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</ActionButton>
      {url && !ok && <span className="text-[12.5px] w-full" style={{ color: C.amber }}>Paste the link to your page on {site}.</span>}
      {err && <span className="text-[12.5px] w-full" style={{ color: C.amber }}>{err}</span>}
    </div>
  );
}

function CompetitorListings() {
  const [n, setN] = useState(0);
  const l = useSeoRead(`listings&n=${n}`);
  if (!l) return <Skeleton className="h-[140px]" />;
  const missing = (l.sites || []).filter((s: Any) => !s.gidListed);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Where competitors are listed <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>{l.checkedAt ? `checked ${timeAgo(l.checkedAt)} · ${l.competitors?.length || 0} competitors · GID missing from ${missing.length}` : 'first check runs on the next sync'}</span></h3>
      <div><RunNow id="competitor_listings" label="Check now" onDone={() => setN(x => x + 1)} /></div>
      {l.sites?.length ? (
        <ul className="flex flex-col gap-1.5">{l.sites.map((s: Any) => (
          <li key={s.site} className="text-[14px] rounded-xl p-3 flex flex-col gap-0.5" style={box}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <StatusBadge tone={s.gidListed ? 'green' : 'red'}>{s.gidListed ? 'GID listed' : 'GID missing'}</StatusBadge>
              <a href={s.urls?.[0] || `https://${s.site}`} target="_blank" rel="noreferrer" className="underline font-semibold" style={{ color: C.text }}>{s.name}</a>
              <span style={{ color: C.muted }}>{s.competitors.length} competitor{s.competitors.length === 1 ? '' : 's'}</span>
            </div>
            <div className="text-[13px]" style={{ color: C.text2 }}>{s.competitors.join(', ')}</div>
            {s.yourUrl && <div className="text-[13px]"><a href={s.yourUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: C.green }}>Your listing</a></div>}
            {!s.gidListed && s.how && <div className="text-[13px]" style={{ color: C.muted }}>{s.how}</div>}
            {!s.gidListed && <MarkListed name={s.name} site={s.site} onDone={() => setN(x => x + 1)} />}
          </li>
        ))}</ul>
      ) : <Muted>No listing sites recorded yet.</Muted>}
    </section>
  );
}

function OutreachDialog({ p, from, onClose, onSent }: { p: Any; from: string | null; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState<string>(p.draft?.subject || '');
  const [body, setBody] = useState<string>(p.draft?.body || '');
  const [step, setStep] = useState<'write' | 'confirm' | 'sending' | 'done'>('write');
  const [error, setError] = useState('');
  const send = async () => {
    setStep('sending'); setError('');
    try { await seoPost({ action: 'outreach_send', site: p.site, subject, body, reviewed: true, confirmed: true }); setStep('done'); onSent(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStep('confirm'); }
  };
  const field = { background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div className="jv-editor fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,0.6)' }} role="dialog" aria-modal="true" aria-label={`Email ${p.name}`}>
      <div className="w-full max-w-[620px] max-h-[92vh] overflow-y-auto rounded-2xl p-5 flex flex-col gap-3" style={{ background: C.surface1, border: `1px solid ${C.borderStrong}` }}>
        <div className="text-[16px] font-semibold" style={{ color: C.text }}>Email {p.name}</div>
        <div className="text-[13.5px]" style={{ color: C.text2 }}>To <b style={{ color: C.text }}>{p.email}</b> (published on <a href={p.foundOn} target="_blank" rel="noreferrer" className="underline">their site</a>) · from <b style={{ color: C.text }}>{from || 'your Zoho mailbox'}</b></div>
        {step === 'write' && <>
          <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} aria-label="Subject" className="w-full rounded-xl p-2.5 text-[15px] outline-none" style={field} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} maxLength={5000} aria-label="Message" className="w-full rounded-xl p-3 text-[14.5px] leading-relaxed outline-none resize-y" style={field} />
          <div className="flex gap-2 justify-end"><ActionButton variant="ghost" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" disabled={!subject.trim() || body.trim().length < 40} onClick={() => setStep('confirm')}>Review</ActionButton></div>
        </>}
        {(step === 'confirm' || step === 'sending') && <>
          <div className="rounded-xl p-3 text-[14.5px]" style={{ background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.35)', color: C.text }}>Send this email to <b>{p.email}</b> now? It can't be unsent, and this site won't be emailed again.</div>
          <div className="rounded-xl p-3 text-[14px] whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto" style={{ ...box, color: C.text2 }}><b style={{ color: C.text }}>{subject}</b>{'\n\n'}{body}</div>
          {error && <div role="alert" className="text-[14px]" style={{ color: C.amber }}>Not sent: {error}</div>}
          <div className="flex gap-2 justify-end"><ActionButton variant="ghost" disabled={step === 'sending'} onClick={() => setStep('write')}>Edit</ActionButton><ActionButton variant="primary" icon={Check} disabled={step === 'sending'} onClick={send}>{step === 'sending' ? 'Sending…' : 'Yes, send it'}</ActionButton></div>
        </>}
        {step === 'done' && <>
          <div className="flex items-center gap-2 text-[15px]" style={{ color: C.green }}><Check size={18} />Sent to {p.email}.</div>
          <div className="flex justify-end"><ActionButton variant="primary" onClick={onClose}>Close</ActionButton></div>
        </>}
      </div>
    </div>
  );
}

function LinkOutreach() {
  const [n, setN] = useState(0);
  const o = useSeoRead(`outreach&n=${n}`);
  const [open, setOpen] = useState<Any | null>(null);
  if (!o) return <Skeleton className="h-[160px]" />;
  const ps: Any[] = o.prospects || [];
  const ready = ps.filter(p => p.status === 'ready'), noEmail = ps.filter(p => p.status === 'no_email'), done = ps.filter(p => p.status === 'sent' || p.status === 'skipped');
  const skip = async (site: string) => { try { await seoPost({ action: 'outreach_skip', site }); setN(x => x + 1); } catch { /* shown on next load */ } };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-[15px]" style={{ color: C.text }}>Link outreach <span className="text-[12.5px] font-normal" style={{ color: C.muted }}>{o.checkedAt ? `last search ${timeAgo(o.checkedAt)}` : 'first search runs on the next weekly sync'} · {o.sentToday}/{o.cap} sent today · from {o.from || 'Zoho (not connected)'}</span></h3>
      <p className="text-[13.5px]" style={{ color: C.text2 }}>Jarvis finds Flagstaff and Arizona sites that could link to you, reads the contact email each site publishes, and drafts a friendly note. You review and confirm every email; each site is emailed once at most.</p>
      <div><RunNow id="link_outreach" label="Find more sites now" onDone={() => setN(x => x + 1)} /></div>
      {ready.length > 0 ? <ul className="flex flex-col gap-2">{ready.map(p => (
        <li key={p.site} className="rounded-xl p-3 flex flex-col gap-1 text-[14px]" style={box}>
          <div className="flex flex-wrap items-baseline gap-x-2"><StatusBadge tone="cyan">{p.kind}</StatusBadge><a href={p.url} target="_blank" rel="noreferrer" className="underline font-semibold" style={{ color: C.text }}>{p.name}</a><span style={{ color: C.muted }}>{p.email}</span></div>
          {p.why && <div className="text-[13px]" style={{ color: C.text2 }}>{p.why}</div>}
          <div className="flex gap-2 mt-1"><ActionButton size="sm" variant="primary" onClick={() => setOpen(p)}>Review & send</ActionButton><ActionButton size="sm" variant="ghost" onClick={() => skip(p.site)}>Skip</ActionButton></div>
        </li>
      ))}</ul> : <Muted>No drafts waiting.</Muted>}
      {noEmail.length > 0 && <details className="rounded-xl p-3" style={box}><summary className="cursor-pointer text-[14px]" style={{ color: C.text }}>{noEmail.length} site{noEmail.length === 1 ? '' : 's'} with no published email (use their contact form)</summary>
        <ul className="flex flex-col gap-1 mt-2 text-[13.5px]">{noEmail.map(p => <li key={p.site} style={{ color: C.text2 }}><a href={p.contactUrl || p.url} target="_blank" rel="noreferrer" className="underline" style={{ color: C.text }}>{p.name}</a> — {p.why} <button type="button" className="underline ml-1" style={{ color: C.muted }} onClick={() => skip(p.site)}>done / skip</button></li>)}</ul></details>}
      {done.length > 0 && <details className="rounded-xl p-3" style={box}><summary className="cursor-pointer text-[14px]" style={{ color: C.text }}>{done.length} sent or skipped</summary>
        <ul className="flex flex-col gap-1 mt-2 text-[13.5px]">{done.map(p => <li key={p.site} style={{ color: C.text2 }}><StatusBadge tone={p.status === 'sent' ? 'green' : 'muted'}>{p.status}</StatusBadge> {p.name}{p.status === 'sent' ? ` → ${p.to} ${String(p.decidedAt || '').slice(0, 10)}` : ''}</li>)}</ul></details>}
      {open && <OutreachDialog p={open} from={o.from} onClose={() => setOpen(null)} onSent={() => setN(x => x + 1)} />}
    </section>
  );
}

export function ResearchView({ k, post }: { k: Any | undefined; post: Post }) {
  if (!k) return <Skeleton className="h-[300px]" />;
  return (
    <div className="flex flex-col gap-3">
      <SearchNews />
      <AiAnswers />
      <CompetitorListings />
      <LinkOutreach />
      <h3 className="font-semibold text-[15px] mt-2" style={{ color: C.text }}>Guidance the recommendations cite</h3>
      {!k.ready && <NotSetUp what="Weekly re-checking of Google's documents" />}
      <p className="text-[14px]" style={{ color: C.text2 }}>What the recommendations are allowed to cite. Google's pages are re-checked weekly; a changed page is flagged for review, and superseded guidance stops being cited.</p>
      <ul className="flex flex-col gap-2.5">
        {k.entries.map((e: Any) => (
          <li key={e.id} className="rounded-xl p-3.5" style={{ ...box, borderColor: e.status === 'changed' ? 'rgba(255,184,77,0.5)' : C.border, opacity: e.status === 'superseded' ? 0.55 : 1 }}>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <StatusBadge tone={TIER_TONE[e.tier]}>{String(e.tier).replace(/_/g, ' ')}</StatusBadge>
              <StatusBadge tone="cyan">{e.category}</StatusBadge>
              {e.status !== 'active' && <StatusBadge tone={e.status === 'changed' ? 'amber' : 'muted'}>{e.status === 'changed' ? 'changed — review' : 'superseded'}</StatusBadge>}
              <span className="ml-auto text-[12.5px]" style={{ color: C.muted }}>retrieved {e.retrievedAt}{e.lastCheckedAt ? ` · checked ${timeAgo(e.lastCheckedAt)}` : ''}</span>
            </div>
            <div className="text-[14.5px]" style={{ color: C.text }}>{e.claim}</div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[13px]">
              <a href={e.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1" style={{ color: C.cyan }}>{e.source}<ExternalLink size={12} /></a>
              {k.ready && e.status === 'changed' && <button type="button" className="underline" style={{ color: C.green }} onClick={() => void post({ action: 'set_knowledge_status', id: e.id, status: 'active' })}>Reviewed — still true</button>}
              {k.ready && e.status !== 'superseded' && <button type="button" className="underline" style={{ color: C.muted }} onClick={() => void post({ action: 'set_knowledge_status', id: e.id, status: 'superseded' })}>Mark superseded</button>}
              {k.ready && e.status === 'superseded' && <button type="button" className="underline" style={{ color: C.cyan }} onClick={() => void post({ action: 'set_knowledge_status', id: e.id, status: 'active' })}>Restore</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- history & learning ---------------------------------------------------------------------------

const VERDICT: Record<string, { label: string; color: string }> = {
  positive_correlation: { label: 'better', color: C.green }, negative_correlation: { label: 'worse', color: C.red },
  no_clear_change: { label: 'no change', color: C.text2 }, insufficient_data: { label: 'too little data', color: C.muted },
};
export function HistoryView({ hs }: { hs: Any | undefined }) {
  if (!hs) return <Skeleton className="h-[300px]" />;
  const learned = Object.entries(hs.learning || {}).filter(([, v]) => (v as Any).measured || (v as Any).insufficient);
  return (
    <div className="flex flex-col gap-5">
      {!hs.ready && <NotSetUp what="Analysis history" />}
      <section>
        <h3 className="font-semibold text-[15px] mb-2 inline-flex items-center gap-1.5" style={{ color: C.text }}><History size={15} />Completed actions and what followed</h3>
        {hs.outcomes?.length ? (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr style={{ color: C.muted }}><th className="text-left py-1 pr-2">Action</th><th className="text-left pr-2">Done</th>{[7, 30, 90, 180].map(d => <th key={d} className="px-2">{d}d</th>)}</tr></thead>
            <tbody>{hs.outcomes.map((o: Any) => (
              <tr key={o.id} className="border-t" style={{ borderColor: C.border }}>
                <td className="py-1.5 pr-2" style={{ color: C.text }}>{o.title}<div className="text-[12px]" style={{ color: C.muted }}>{o.category}</div></td>
                <td className="pr-2 whitespace-nowrap" style={{ color: C.text2 }}>{String(o.appliedAt).slice(0, 10)}</td>
                {[7, 30, 90, 180].map(d => { const v = o.horizons[d]; return <td key={d} className="px-2 text-center whitespace-nowrap" style={{ color: v ? VERDICT[v]?.color : C.muted }}>{v ? VERDICT[v]?.label : 'pending'}</td>; })}
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Muted>Nothing marked done yet. Press "Done" on an action and its effect is measured at 7, 30, 90 and 180 days.</Muted>}
        <p className="text-[12.5px] mt-2" style={{ color: C.muted }}>Before/after comparisons show correlation, not proof — season, competitors and Google updates move the same numbers.</p>
      </section>
      <section>
        <h3 className="font-semibold text-[15px] mb-2" style={{ color: C.text }}>What has worked for GID</h3>
        {learned.length ? <ul className="flex flex-col gap-1 text-[14px]" style={{ color: C.text2 }}>{learned.map(([cat, v]) => <li key={cat}><b style={{ color: C.text }}>{cat}</b> — {(v as Any).note} {(v as Any).multiplier !== 1 && <span>(priority ×{(v as Any).multiplier})</span>}</li>)}</ul>
          : <Muted>No measured results yet. Priorities follow Google's guidance until GID's own results say otherwise (needs 3+ measured actions per category; capped at ±20%).</Muted>}
      </section>
      {hs.snapshots?.length > 0 && (
        <section>
          <h3 className="font-semibold text-[15px] mb-2" style={{ color: C.text }}>Analyses</h3>
          <ul className="flex flex-col gap-1 text-[13.5px]" style={{ color: C.text2 }}>
            {hs.snapshots.slice(0, 15).map((s: Any) => <li key={s.id}><b style={{ color: C.text }}>{s.label}</b> · {new Date(s.at).toLocaleDateString('en-US', { timeZone: 'America/Phoenix' })} — {s.data.localImpressions} local impressions, {s.data.ownReviews ?? '—'} reviews, {s.data.openHigh} high / {s.data.openMedium} medium open</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

