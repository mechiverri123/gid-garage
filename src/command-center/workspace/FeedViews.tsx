// Feed panels inside the Jarvis workspace: the visual daily brief, Google
// reviews, Facebook + Instagram, and the Zoho inbox. Data comes from
// /jarvis/feeds (functions/_lib/jarvis-feeds.js); when Jarvis just spoke about
// a panel, the same data rides along on the `ui` event (feedPrefetch), so the
// screen shows exactly what he said. Read-only: nothing here posts or replies.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Star, RefreshCw, ExternalLink, Mail, Facebook, Instagram, Sun, Briefcase, Bell, UserRoundSearch, Receipt, Megaphone, Package, Paperclip, ArrowLeft, Link2 } from 'lucide-react';
import { C, money, num, timeAgo, clock, shortDay } from '../ui/theme';
import { Skeleton, ErrorState, ActionButton } from '../ui/primitives';
import { feedPrefetch } from './jobMeta';

type Dispatch = (a: { type: string; [k: string]: unknown }) => void;
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const box = { background: 'rgba(3,10,17,0.45)', border: `1px solid ${C.border}` };

export function useFeed(action: string) {
  const [data, setData] = useState<Any | null>(() => (feedPrefetch.get(action) as Any) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/jarvis/feeds?action=${action}${force ? '&force=1' : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      feedPrefetch.set(action, body); setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [action]);
  useEffect(() => {
    const pre = feedPrefetch.get(action) as Any | undefined;
    if (pre) { setData(pre); feedPrefetch.delete(action); } else void load(); // prefetch is used once; later opens refresh
  }, [action, load]);
  return { data, error, loading, reload: load };
}

function Panel({ icon: Icon, title, right, children, tone = C.cyan }: { icon: typeof Star; title: string; right?: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 min-w-0" style={box}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <Icon size={17} color={tone} className="shrink-0" />
        <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] truncate" style={{ color: C.text2 }}>{title}</h2>
        <div className="ml-auto shrink-0">{right}</div>
      </div>
      {children}
    </section>
  );
}
const Muted = ({ children }: { children: ReactNode }) => <div className="text-[14px]" style={{ color: C.muted }}>{children}</div>;
const Refresh = ({ onClick, loading }: { onClick: () => void; loading: boolean }) => (
  <button type="button" onClick={onClick} className="cc-btn inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-lg" style={{ color: C.text2, border: `1px solid ${C.border}` }} aria-label="Refresh">
    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh
  </button>
);
const Delta = ({ n }: { n: number | null | undefined }) => (n == null || n === 0 ? null : <span className="text-[13px] font-semibold ml-1.5" style={{ color: n > 0 ? C.green : C.amber }}>{n > 0 ? `+${n}` : n}</span>);

// ---- Google reviews ------------------------------------------------------------------------

export function Stars({ value, size = 15 }: { value: number | null | undefined; size?: number }) {
  const v = Number(value) || 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => <Star key={i} size={size} color={C.amber} fill={v >= i - 0.25 ? C.amber : 'transparent'} strokeWidth={1.6} />)}
    </span>
  );
}

function ReviewItem({ r }: { r: Any }) {
  const fresh = r.time && Date.now() - Date.parse(r.time) <= 7 * 86400_000;
  return (
    <li className="rounded-xl p-3.5 min-w-0" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${fresh ? 'rgba(32,229,139,0.4)' : C.border}` }}>
      <div className="flex items-center gap-2.5 min-w-0">
        {r.photo ? <img src={r.photo} alt="" className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" loading="lazy" /> : <span className="w-8 h-8 rounded-full shrink-0" style={{ background: C.surface3 }} />}
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold truncate" style={{ color: C.text }}>{r.author}</div>
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: C.muted }}><Stars value={r.rating} size={12} />{r.relative}</div>
        </div>
        {fresh && <span className="ml-auto text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ color: C.green, border: '1px solid rgba(32,229,139,0.4)' }}>New</span>}
      </div>
      {r.text && <p className="text-[14px] leading-relaxed mt-2 line-clamp-4 break-words" style={{ color: C.text2 }}>{r.text}</p>}
    </li>
  );
}

// Compact: the strip at the top of the SEO page (rating, count, new this week, newest two).
export function ReviewsCard({ compact = false, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const { data, error, loading, reload } = useFeed('reviews');
  if (error) return <ErrorState message={`Couldn't load Google reviews: ${error}`} onRetry={() => reload()} />;
  if (!data) return <Skeleton className={compact ? 'h-[120px]' : 'h-[320px]'} />;
  if (!data.connected) return <Panel icon={Star} title="Google reviews" tone={C.amber}><Muted>Not connected ({data.reason}).</Muted></Panel>;
  const list: Any[] = data.reviews || [];
  const head = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-3">
        <span className="text-[40px] font-bold leading-none tabular-nums" style={{ color: C.text }}>{data.rating?.toFixed?.(1) ?? '—'}</span>
        <div><Stars value={data.rating} size={18} /><div className="text-[13.5px] mt-1" style={{ color: C.text2 }}>{num(data.total)} Google reviews</div></div>
      </div>
      <span className="text-[14px] font-semibold px-3 py-1 rounded-full" style={data.new7 > 0 ? { color: C.green, background: 'rgba(32,229,139,0.08)', border: '1px solid rgba(32,229,139,0.35)' } : { color: C.text2, border: `1px solid ${C.border}` }}>
        {data.new7 > 0 ? `${data.new7} new in the past 7 days` : 'No new reviews this week'}
      </span>
    </div>
  );
  return (
    <Panel icon={Star} title="Google reviews" tone={C.amber} right={
      <div className="flex items-center gap-2">
        {compact && onOpen && <button type="button" onClick={onOpen} className="text-[13.5px] hover:underline" style={{ color: C.cyan }}>View all</button>}
        {!compact && <Refresh onClick={() => reload(true)} loading={loading} />}
      </div>}>
      <div className={compact ? 'grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start' : 'flex flex-col gap-4'}>
        {head}
        {list.length > 0 && (
          <ul className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
            {(compact ? list.slice(0, 2) : list).map((r, i) => <ReviewItem key={i} r={r} />)}
          </ul>
        )}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-2 mt-4">
          {data.reviewsUrl && <ActionButton href={data.reviewsUrl} icon={ExternalLink} size="sm">All reviews on Google</ActionButton>}
          {data.writeReviewUrl && <ActionButton href={data.writeReviewUrl} icon={Link2} size="sm" variant="ghost">Review link to send customers</ActionButton>}
        </div>
      )}
    </Panel>
  );
}

export function ReviewsView() {
  return <div className="max-w-[1180px] mx-auto jv-pop"><ReviewsCard /></div>;
}

// ---- connect forms ------------------------------------------------------------------------

function Field({ label, value, onChange, secret = false, placeholder }: { label: string; value: string; onChange: (v: string) => void; secret?: boolean; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-semibold" style={{ color: C.text2 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} type={secret ? 'password' : 'text'} placeholder={placeholder} autoComplete="off" spellCheck={false}
        className="h-10 rounded-lg px-3 text-[14px] outline-none min-w-0" style={{ background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
    </label>
  );
}

function useConnect(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/jarvis/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || `HTTP ${res.status}`);
      setMsg('Connected.'); onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return { busy, msg, post };
}

export function ConnectMeta({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState(''); const [appId, setAppId] = useState(''); const [appSecret, setAppSecret] = useState('');
  const { busy, msg, post } = useConnect(onDone);
  return (
    <div className="flex flex-col gap-3 text-[14px]" style={{ color: C.text2 }}>
      <ol className="list-decimal pl-5 flex flex-col gap-1">
        <li>Open <a className="underline" style={{ color: C.cyan }} href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer</a> and pick your Meta app (App ID and secret are under App settings → Basic).</li>
        <li>Add permissions: pages_show_list, pages_read_engagement, instagram_basic, ads_read, business_management, and for lead forms leads_retrieval, pages_manage_ads, pages_manage_metadata, and for Messenger pages_messaging. Click <b>Generate Access Token</b> and approve your GID page.</li>
        <li>Paste the token below. With the app ID and secret, Jarvis turns it into a page token that doesn’t expire.</li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="App ID" value={appId} onChange={setAppId} />
        <Field label="App secret" value={appSecret} onChange={setAppSecret} secret />
      </div>
      <Field label="Access token" value={token} onChange={setToken} secret placeholder="EAAB…" />
      <div className="flex items-center gap-3 flex-wrap">
        <ActionButton variant="primary" disabled={busy || !token.trim()} onClick={() => post({ action: 'connect_meta', token, appId, appSecret })}>{busy ? 'Connecting…' : 'Connect Facebook & Instagram'}</ActionButton>
        {msg && <span role="status" style={{ color: msg === 'Connected.' ? C.green : C.amber }}>{msg}</span>}
      </div>
    </div>
  );
}

export function ConnectZoho({ onDone }: { onDone: () => void }) {
  const [clientId, setClientId] = useState(''); const [clientSecret, setClientSecret] = useState(''); const [code, setCode] = useState('');
  const { busy, msg, post } = useConnect(onDone);
  return (
    <div className="flex flex-col gap-3 text-[14px]" style={{ color: C.text2 }}>
      <ol className="list-decimal pl-5 flex flex-col gap-1">
        <li>Open <a className="underline" style={{ color: C.cyan }} href="https://api-console.zoho.com/" target="_blank" rel="noreferrer">Zoho API Console</a> → <b>Add Client</b> → <b>Self Client</b> → Create.</li>
        <li>On the <b>Generate Code</b> tab, scope: <code className="select-all" style={{ color: C.text }}>ZohoMail.accounts.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE</code>, duration 10 minutes, any description → Create.</li>
        <li>Paste the Client ID, Client Secret (Client Secret tab) and the code here within 10 minutes.</li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client ID" value={clientId} onChange={setClientId} />
        <Field label="Client secret" value={clientSecret} onChange={setClientSecret} secret />
      </div>
      <Field label="Generated code" value={code} onChange={setCode} secret placeholder="1000.xxxx…" />
      <div className="flex items-center gap-3 flex-wrap">
        <ActionButton variant="primary" disabled={busy || !clientId.trim() || !clientSecret.trim() || !code.trim()} onClick={() => post({ action: 'connect_zoho', clientId, clientSecret, code })}>{busy ? 'Connecting…' : 'Connect Zoho Mail'}</ActionButton>
        {msg && <span role="status" style={{ color: msg === 'Connected.' ? C.green : C.amber }}>{msg}</span>}
      </div>
    </div>
  );
}

// ---- Facebook + Instagram ------------------------------------------------------------------

function PostGrid({ posts, likeKey }: { posts: Any[]; likeKey: 'reactions' | 'likes' }) {
  if (!posts?.length) return <Muted>No recent posts.</Muted>;
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {posts.slice(0, 6).map((p, i) => (
        <li key={i} className="min-w-0">
          <a href={p.url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden h-full" style={{ border: `1px solid ${C.border}`, background: 'rgba(3,10,17,0.5)' }}>
            {p.image ? <img src={p.image} alt="" className="w-full aspect-square object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <div className="p-3 text-[13px] line-clamp-5 aspect-square" style={{ color: C.text2 }}>{p.text}</div>}
            <div className="flex items-center gap-3 px-2.5 py-1.5 text-[12.5px]" style={{ color: C.text2 }}>
              <span>♥ {num(p[likeKey])}</span><span>💬 {num(p.comments)}</span><span className="ml-auto truncate" style={{ color: C.muted }}>{p.at ? timeAgo(p.at) : ''}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SocialView() {
  const { data, error, loading, reload } = useFeed('social');
  if (error) return <div className="max-w-[1180px] mx-auto"><ErrorState message={`Couldn't load Facebook/Instagram: ${error}`} onRetry={() => reload()} /></div>;
  if (!data) return <div className="max-w-[1180px] mx-auto"><Skeleton className="h-[420px]" /></div>;
  if (!data.connected) {
    return <div className="max-w-[900px] mx-auto jv-pop"><Panel icon={Facebook} title="Connect Facebook & Instagram"><ConnectMeta onDone={() => reload(true)} /></Panel></div>;
  }
  const fb = data.facebook as Any | null; const ig = data.instagram as Any | null; const ch = data.changes as Any | null;
  const since = ch?.since ? `since ${shortDay(ch.since)}` : 'first snapshot today — changes show from tomorrow';
  return (
    <div className="max-w-[1180px] mx-auto flex flex-col gap-4 jv-pop">
      <div className="grid gap-4 md:grid-cols-2">
        {fb && (
          <Panel icon={Facebook} title="Facebook" right={<Refresh onClick={() => reload(true)} loading={loading} />}>
            {fb.error ? <Muted>{fb.error}</Muted> : <>
              <div className="flex items-center gap-3 mb-3 min-w-0">
                {fb.picture && <img src={fb.picture} alt="" className="w-11 h-11 rounded-full shrink-0" referrerPolicy="no-referrer" />}
                <a href={fb.url} target="_blank" rel="noreferrer" className="text-[17px] font-semibold truncate hover:underline" style={{ color: C.text }}>{fb.name}</a>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]" style={{ color: C.text2 }}>
                <span><b className="text-[22px] tabular-nums" style={{ color: C.text }}>{num(fb.followers)}</b> followers<Delta n={ch?.fbFollowers} /></span>
                <span><b className="text-[22px] tabular-nums" style={{ color: C.text }}>{num(fb.pageLikes)}</b> page likes<Delta n={ch?.fbPageLikes} /></span>
              </div>
              <div className="text-[13px] mt-1 mb-3" style={{ color: C.muted }}>Post reactions<Delta n={ch?.fbPostReactions} /> · {since}</div>
              <PostGrid posts={fb.posts} likeKey="reactions" />
            </>}
          </Panel>
        )}
        {ig && (
          <Panel icon={Instagram} title="Instagram" tone={C.purple}>
            {ig.error ? <Muted>{ig.error}</Muted> : <>
              <div className="flex items-center gap-3 mb-3 min-w-0">
                {ig.picture && <img src={ig.picture} alt="" className="w-11 h-11 rounded-full shrink-0" referrerPolicy="no-referrer" />}
                <a href={ig.url} target="_blank" rel="noreferrer" className="text-[17px] font-semibold truncate hover:underline" style={{ color: C.text }}>@{ig.username}</a>
              </div>
              <div className="text-[14px]" style={{ color: C.text2 }}><b className="text-[22px] tabular-nums" style={{ color: C.text }}>{num(ig.followers)}</b> followers<Delta n={ch?.igFollowers} /></div>
              <div className="text-[13px] mt-1 mb-3" style={{ color: C.muted }}>Likes on recent posts<Delta n={ch?.igPostLikes} /> · {since}</div>
              <PostGrid posts={ig.posts} likeKey="likes" />
            </>}
          </Panel>
        )}
      </div>
      <LeadSyncLine s={data.leadSync as Any | null} />
      {fb?.url && (
        <Panel icon={Facebook} title="Your page, live">
          <div className="flex justify-center">
            <iframe title="GID Garage Facebook page" className="w-full max-w-[500px] rounded-xl" style={{ height: 620, border: 0, background: '#fff' }} loading="lazy"
              src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(fb.url)}&tabs=timeline&width=500&height=620&small_header=true&adapt_container_width=true&hide_cover=false`} />
          </div>
        </Panel>
      )}
    </div>
  );
}

// Facebook/Instagram lead forms -> leads (polled every 5 min by the proactive cron).
function LeadSyncLine({ s: initial }: { s: Any | null }) {
  const [fix, setFix] = useState(false);
  const [s, setS] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const checkNow = async () => {
    setChecking(true); setNote(null);
    try {
      const res = await fetch('/jarvis/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check_leads' }) });
      const out = await res.json();
      if (out.status) setS(out.status);
      setNote(out.error ? null : `${out.imported ?? 0} new lead${out.imported === 1 ? '' : 's'} imported.`);
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); } finally { setChecking(false); }
  };
  const bad = s?.lastError && (!s.checkedAt || Date.parse(s.errorAt) > Date.parse(s.checkedAt));
  return (
    <div className="rounded-xl px-4 py-3 text-[14px] flex flex-col gap-2" style={{ ...box, color: C.text2 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold" style={{ color: C.text }}>Lead forms → leads</span>
        {!s ? <span>Waiting for the first check (every 5 minutes, 6 a.m.–10 p.m.).</span>
          : bad ? <span style={{ color: C.amber }}>Can't read lead forms: {s.lastError}</span>
          : <span>Checked {timeAgo(s.checkedAt)} · {s.forms ?? 0} form{s.forms === 1 ? '' : 's'}{s.lastImported ? ` · last new lead ${timeAgo(s.lastImported)}` : ''}</span>}
        <span className="ml-auto flex gap-3">
          <button type="button" className="underline" style={{ color: C.cyan }} disabled={checking} onClick={checkNow}>{checking ? 'Checking…' : 'Check now'}</button>
          <button type="button" className="underline" style={{ color: C.cyan }} onClick={() => setFix(v => !v)}>{fix ? 'Hide' : 'Update permissions'}</button>
        </span>
      </div>
      {note && <div role="status" style={{ color: C.green }}>{note}</div>}
      {fix && <ConnectMeta onDone={() => setFix(false)} />}
    </div>
  );
}

// ---- Zoho inbox ----------------------------------------------------------------------------

function MailBody({ m, onBack }: { m: Any; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/jarvis/feeds?action=message&id=${encodeURIComponent(m.id)}&folder=${encodeURIComponent(m.folderId)}`).then(r => r.json()).then(b => { if (!live) return; if (b.error) setErr(b.error); else setText(b.text || ''); }, e => live && setErr(String(e)));
    return () => { live = false; };
  }, [m.id, m.folderId]);
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <button type="button" onClick={onBack} className="self-start inline-flex items-center gap-1.5 text-[14px] hover:underline" style={{ color: C.cyan }}><ArrowLeft size={15} />Inbox</button>
      <h3 className="text-[19px] font-semibold break-words" style={{ color: C.text }}>{m.subject}</h3>
      <div className="text-[13.5px]" style={{ color: C.text2 }}>{m.fromName} &lt;{m.from}&gt; · {m.at ? new Date(m.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</div>
      {err ? <ErrorState message={err} /> : text == null ? <Skeleton className="h-[200px]" /> : (
        <pre className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed rounded-xl p-4 font-sans" style={{ color: C.text, ...box }}>{text || '(empty message)'}</pre>
      )}
    </div>
  );
}

export function MailView({ open, dispatch }: { open?: string; dispatch: Dispatch }) {
  const { data, error, loading, reload } = useFeed('mail');
  const [sel, setSel] = useState<string | null>(open ?? null);
  useEffect(() => { setSel(open ?? null); }, [open]);
  if (error) return <div className="max-w-[1180px] mx-auto"><ErrorState message={`Couldn't load email: ${error}`} onRetry={() => reload()} /></div>;
  if (!data) return <div className="max-w-[1180px] mx-auto"><Skeleton className="h-[420px]" /></div>;
  if (!data.connected) return <div className="max-w-[900px] mx-auto jv-pop"><Panel icon={Mail} title="Connect Zoho Mail"><ConnectZoho onDone={() => reload(true)} /></Panel></div>;
  const msgs: Any[] = data.messages || [];
  const current = sel ? msgs.find(m => m.id === sel) : null;
  return (
    <div className="max-w-[1000px] mx-auto jv-pop">
      <Panel icon={Mail} title={`Inbox · ${data.email || 'Zoho Mail'}`} right={<Refresh onClick={() => reload(true)} loading={loading} />}>
        {current ? <MailBody m={current} onBack={() => { setSel(null); dispatch({ type: 'open', view: { type: 'mail' } }); }} /> : <>
          <div className="text-[14px] mb-3" style={{ color: C.text2 }}>{data.unreadCount ? `${data.unreadCount} unread` : 'All read'} · {data.last24} in the last 24 hours</div>
          {msgs.length ? (
            <ul className="flex flex-col divide-y" style={{ borderColor: C.border }}>
              {msgs.map(m => (
                <li key={m.id}>
                  <button type="button" onClick={() => setSel(m.id)} className="w-full text-left py-3 px-2 rounded-lg hover:bg-white/5 min-w-0 flex gap-3">
                    <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: m.unread ? C.cyan : 'transparent' }} aria-label={m.unread ? 'Unread' : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`truncate text-[14.5px] ${m.unread ? 'font-bold' : 'font-medium'}`} style={{ color: C.text }}>{m.fromName || m.from}</span>
                        {m.parts && <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0" style={{ color: C.amber, border: '1px solid rgba(255,184,77,0.4)' }}><Package size={11} />Parts</span>}
                        {m.attachments && <Paperclip size={13} color={C.muted} className="shrink-0" />}
                        <span className="ml-auto text-[12.5px] shrink-0" style={{ color: C.muted }}>{m.at ? timeAgo(m.at) : ''}</span>
                      </span>
                      <span className={`block truncate text-[14px] ${m.unread ? 'font-semibold' : ''}`} style={{ color: C.text2 }}>{m.subject}</span>
                      <span className="block truncate text-[13px]" style={{ color: C.muted }}>{m.summary}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Muted>Inbox is empty.</Muted>}
        </>}
      </Panel>
    </div>
  );
}

// ---- the daily brief ----------------------------------------------------------------------

function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const cls = 'w-full text-left flex items-center gap-2 py-1.5 text-[14.5px] min-w-0';
  return onClick ? <button type="button" onClick={onClick} className={`${cls} hover:underline`} style={{ color: C.text }}>{children}</button> : <div className={cls} style={{ color: C.text }}>{children}</div>;
}

export function BriefView({ dispatch }: { dispatch: Dispatch }) {
  const { data, error, loading, reload } = useFeed('brief');
  if (error) return <div className="max-w-[1180px] mx-auto"><ErrorState message={`Couldn't build the brief: ${error}`} onRetry={() => reload()} /></div>;
  if (!data) return <div className="max-w-[1180px] mx-auto grid gap-4 md:grid-cols-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[160px]" />)}</div>;
  const b = (data.business || {}) as Any;
  const openJob = (id: string) => dispatch({ type: 'open', view: { type: 'jobs', jobIds: [id] } });
  const open = (type: string) => dispatch({ type: 'open', view: { type } });
  const w = data.weather as Any | null; const r = data.reviews as Any; const s = data.social as Any; const m = data.mail as Any; const a = data.ads as Any;
  const likes = s?.changes ? [s.changes.fbPostReactions, s.changes.igPostLikes, s.changes.fbPageLikes].filter((v: number) => v > 0).reduce((t: number, v: number) => t + v, 0) : 0;
  const follows = s?.changes ? [s.changes.fbFollowers, s.changes.igFollowers].filter((v: number) => v > 0).reduce((t: number, v: number) => t + v, 0) : 0;
  const when = new Date(data.at).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-[1180px] mx-auto flex flex-col gap-4 jv-pop">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-[0.24em]" style={{ color: C.cyan }}>Daily brief</div>
          <div className="text-[22px] font-bold" style={{ color: C.text }}>{when}</div>
        </div>
        <div className="ml-auto"><Refresh onClick={() => reload(true)} loading={loading} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
        <Panel icon={Briefcase} title={`Today · ${(b.todayJobs || []).length} jobs`} right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => dispatch({ type: 'open', view: { type: 'calendar', mode: 'day' } })}>Calendar</button>}>
          {(b.todayJobs || []).length ? (b.todayJobs as Any[]).map(j => (
            <Row key={j.id} onClick={() => openJob(j.id)}><span className="tabular-nums shrink-0 w-[72px]" style={{ color: C.cyan }}>{clock(j.time)}</span><span className="truncate">{j.customer} · {j.vehicle || j.service}</span></Row>
          )) : <Muted>Nothing booked today.{(b.tomorrowJobs || []).length ? ` ${(b.tomorrowJobs as Any[]).length} tomorrow.` : ''}</Muted>}
          {(b.todayJobs || []).length > 0 && (b.tomorrowJobs || []).length > 0 && <div className="text-[13px] mt-2" style={{ color: C.muted }}>Tomorrow: {(b.tomorrowJobs as Any[]).length} job{(b.tomorrowJobs as Any[]).length === 1 ? '' : 's'}</div>}
        </Panel>

        <Panel icon={Sun} title="Weather · Flagstaff" tone={C.amber}>
          {w?.today ? <>
            <div className="text-[17px] font-semibold" style={{ color: C.text }}>{w.today.summary}</div>
            <div className="text-[14px]" style={{ color: C.text2 }}>High {w.today.highF ?? '—'}° · Low {w.today.lowF ?? '—'}°</div>
            {(w.next || []).length > 0 && <div className="text-[13px] mt-2" style={{ color: C.muted }}>{(w.next as Any[]).slice(0, 3).map(d => `${shortDay(d.date).split(',')[0]} ${d.highF ?? '—'}° ${d.summary || ''}`).join(' · ')}</div>}
          </> : <Muted>No forecast synced yet.</Muted>}
        </Panel>

        <Panel icon={Bell} title="Needs you">
          {[...(b.remindersNeedingAttention || []), ...(b.leadsNeedingAttention || []), ...(b.unpaid || [])].length ? <>
            {(b.remindersNeedingAttention as Any[] || []).map(x => <Row key={`r${x.id}`}><Bell size={14} color={C.amber} className="shrink-0" /><span className="truncate">{x.title}</span></Row>)}
            {(b.leadsNeedingAttention as Any[] || []).map(x => <Row key={`l${x.id}`}><UserRoundSearch size={14} color={C.cyan} className="shrink-0" /><span className="truncate">{x.title} — follow up</span></Row>)}
            {(b.unpaid as Any[] || []).map(x => <Row key={`u${x.id}`} onClick={() => openJob(x.id)}><Receipt size={14} color={C.red} className="shrink-0" /><span className="truncate">{x.title} — {String(x.detail || '').replace(/\.$/, '')}</span></Row>)}
          </> : <Muted>Nothing waiting on you.</Muted>}
          {b.collectedLast7Days && <div className="text-[13px] mt-2" style={{ color: C.muted }}>Collected last 7 days: <span style={{ color: C.green }}>{b.collectedLast7Days}</span></div>}
        </Panel>

        <Panel icon={Star} title="Google reviews" tone={C.amber} right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => open('reviews')}>Open</button>}>
          {r?.connected && !r.error ? <>
            <div className="flex items-center gap-2"><span className="text-[24px] font-bold" style={{ color: C.text }}>{r.rating?.toFixed?.(1)}</span><Stars value={r.rating} /><span className="text-[13.5px]" style={{ color: C.text2 }}>{num(r.total)} reviews</span></div>
            <div className="text-[14.5px] mt-1" style={{ color: r.new7 ? C.green : C.text2 }}>{r.new7 ? `${r.new7} new in the past 7 days` : 'No new reviews this week'}</div>
          </> : <Muted>{r?.error || 'Not connected.'}</Muted>}
        </Panel>

        <Panel icon={Facebook} title="Social overnight" right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => open('social')}>{s?.connected ? 'Open' : 'Connect'}</button>}>
          {s?.connected && !s.error ? <>
            <div className="text-[14.5px]" style={{ color: C.text }}>{likes || follows ? `${likes ? `${likes} new like${likes === 1 ? '' : 's'}` : ''}${likes && follows ? ' · ' : ''}${follows ? `${follows} new follower${follows === 1 ? '' : 's'}` : ''}` : 'No change since the last check.'}</div>
            <div className="text-[13px] mt-1" style={{ color: C.muted }}>{[s.facebook?.followers != null && `Facebook ${num(s.facebook.followers)}`, s.instagram?.followers != null && `Instagram ${num(s.instagram.followers)}`].filter(Boolean).join(' · ')} followers</div>
          </> : <Muted>{s?.error || 'Connect Facebook & Instagram to see new likes and followers here.'}</Muted>}
        </Panel>

        <Panel icon={Mail} title="Email" right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => open('mail')}>{m?.connected ? 'Inbox' : 'Connect'}</button>}>
          {m?.connected && !m.error ? <>
            <div className="text-[14.5px]" style={{ color: C.text }}>{m.unreadCount ? `${m.unreadCount} unread` : 'All read'} · {m.last24} in 24 h</div>
            {(m.partsEmails as Any[] || []).slice(0, 3).map(x => <Row key={x.id} onClick={() => dispatch({ type: 'open', view: { type: 'mail', open: x.id } })}><Package size={14} color={C.amber} className="shrink-0" /><span className="truncate">{x.subject}</span></Row>)}
            {(m.messages as Any[] || []).filter(x => x.unread && !x.parts).slice(0, 3).map(x => <Row key={x.id} onClick={() => dispatch({ type: 'open', view: { type: 'mail', open: x.id } })}><Mail size={14} color={C.cyan} className="shrink-0" /><span className="truncate">{x.fromName}: {x.subject}</span></Row>)}
          </> : <Muted>{m?.error || "Connect Zoho Mail to see new email and O'Reilly orders here."}</Muted>}
        </Panel>

        {data.messenger?.connected && (
          <Panel icon={Facebook} title="Messenger" right={<button type="button" className="text-[13.5px] hover:underline" style={{ color: C.cyan }} onClick={() => open('messages')}>Open</button>}>
            {data.messenger.error ? <Muted>{/permission|pages_messaging/i.test(data.messenger.error) ? 'Needs the pages_messaging permission (Facebook → Update permissions).' : data.messenger.error}</Muted> : (() => {
              const un = (data.messenger.conversations as Any[] || []).filter(c => c.unread);
              return un.length ? un.slice(0, 4).map(c => <Row key={c.id} onClick={() => dispatch({ type: 'open', view: { type: 'messages', open: c.id } })}><span className="font-semibold shrink-0">{c.name}</span><span className="truncate" style={{ color: C.text2 }}>{c.snippet}</span></Row>) : <Muted>No unread messages.</Muted>;
            })()}
          </Panel>
        )}
        {a?.connected && (
          <Panel icon={Megaphone} title="Meta ads" tone={C.purple}>
            {a.error ? <Muted>{a.error}</Muted> : <>
              <div className="text-[14.5px]" style={{ color: C.text }}>Yesterday {money(a.yesterday?.spend, 2)}{a.yesterday?.leads ? ` · ${a.yesterday.leads} lead${a.yesterday.leads === 1 ? '' : 's'}` : ''}</div>
              <div className="text-[13px] mt-1" style={{ color: C.muted }}>Last 7 days {money(a.last7?.spend, 2)} · {num(a.last7?.clicks)} clicks{a.last7?.leads ? ` · ${a.last7.leads} leads` : ''}</div>
            </>}
          </Panel>
        )}
      </div>
    </div>
  );
}
