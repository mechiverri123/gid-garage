// Command bar: date/time, global search (answered by Jarvis over the real
// data), notifications (the real "needs attention" list), settings, account.
import { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Search, Settings, RotateCw, Lock, CircleUser, PhoneMissed, UserRound, Receipt } from 'lucide-react';
import { C } from '../ui/theme';
import type { NeedsAttentionItem } from '../types';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return now;
}

function useOutside(ref: React.RefObject<HTMLElement>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onOut(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOut, active]);
}

const ATTN_ICON = { lead_follow_up: UserRound, missed_call: PhoneMissed, unpaid_invoice: Receipt } as const;
const ATTN_TONE = { lead_follow_up: C.cyan, missed_call: C.amber, unpaid_invoice: C.red } as const;

export function CommandTopBar({ title, attention, onSearch, onOpenMenu, onRefresh, onLock, onAttention, refreshing }: {
  title: string; attention: NeedsAttentionItem[]; onSearch: (q: string) => void; onOpenMenu: () => void; onRefresh: () => void; onLock: () => void; onAttention: (i: NeedsAttentionItem) => void; refreshing?: boolean;
}) {
  const now = useClock();
  const [q, setQ] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null); const acctRef = useRef<HTMLDivElement>(null);
  useOutside(bellRef, () => setBellOpen(false), bellOpen);
  useOutside(acctRef, () => setAcctOpen(false), acctOpen);
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' });
  const iconBtn = 'cc-btn relative w-10 h-10 rounded-lg flex items-center justify-center shrink-0';
  const iconStyle = { border: `1px solid ${C.border}`, background: 'rgba(52,214,255,0.04)', color: C.text2 };

  return (
    <header className="flex items-center gap-3 px-4 sm:px-6 h-[68px] border-b shrink-0" style={{ borderColor: C.border, background: 'rgba(5,13,21,0.82)', backdropFilter: 'blur(14px)' }}>
      <button type="button" onClick={onOpenMenu} className={`${iconBtn} lg:hidden`} style={iconStyle} aria-label="Open menu"><Menu size={20} /></button>
      <div className="min-w-0 shrink-0 hidden sm:block">
        <h1 className="text-[22px] md:text-[24px] font-bold leading-tight truncate" style={{ color: C.text }}>{title}</h1>
        <div className="text-[13px] tabular-nums" style={{ color: C.text2 }}>{date} · {time} <span style={{ color: C.muted }}>Arizona</span></div>
      </div>

      <form role="search" className="flex-1 min-w-0 max-w-[560px] mx-auto" onSubmit={e => { e.preventDefault(); if (q.trim()) { onSearch(q.trim()); setQ(''); } }}>
        <label className="flex items-center gap-2.5 rounded-lg px-3.5 h-11 w-full" style={{ background: 'rgba(8,19,30,0.9)', border: `1px solid ${C.border}` }}>
          <Search size={18} color={C.text2} aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search jobs, customers, vehicles..." aria-label="Search jobs, customers, vehicles"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" style={{ color: C.text }} />
          <kbd className="hidden md:inline text-[11px] px-1.5 py-0.5 rounded" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Ctrl K</kbd>
        </label>
      </form>

      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={onRefresh} className={`${iconBtn} hidden sm:flex`} style={iconStyle} aria-label="Refresh data" title="Refresh data"><RotateCw size={18} className={refreshing ? 'cc-spin' : ''} style={refreshing ? { animationDuration: '1s' } : undefined} /></button>

        <div className="relative" ref={bellRef}>
          <button type="button" onClick={() => setBellOpen(o => !o)} className={iconBtn} style={iconStyle} aria-label={`Notifications (${attention.length})`} aria-expanded={bellOpen}>
            <Bell size={18} />
            {attention.length > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center" style={{ background: C.red, color: '#fff' }}>{attention.length > 99 ? '99+' : attention.length}</span>}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 z-40 w-[340px] max-w-[calc(100vw-24px)] rounded-xl p-2 cc-fade-up" style={{ background: C.bg2, border: `1px solid ${C.borderStrong}`, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div className="px-2 py-1.5 text-[14px] font-semibold" style={{ color: C.text }}>Needs attention</div>
              {attention.length === 0
                ? <div className="px-2 py-4 text-[14px]" style={{ color: C.text2 }}>You're all caught up.</div>
                : attention.slice(0, 8).map((a, i) => {
                    const Icon = ATTN_ICON[a.type] ?? UserRound; const tone = ATTN_TONE[a.type] ?? C.cyan;
                    return (
                      <button key={i} type="button" onClick={() => { onAttention(a); setBellOpen(false); }} className="cc-btn w-full flex items-start gap-3 text-left rounded-lg p-2 hover:bg-white/5">
                        <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tone}16` }}><Icon size={15} color={tone} /></span>
                        <span className="min-w-0"><span className="block text-[14px] font-medium truncate" style={{ color: C.text }}>{a.label}</span><span className="block text-[12.5px] truncate" style={{ color: C.text2 }}>{a.detail}</span></span>
                      </button>
                    );
                  })}
            </div>
          )}
        </div>

        <a href="/admin?tab=hub" className={`${iconBtn} hidden sm:flex`} style={iconStyle} aria-label="Settings" title="Settings"><Settings size={18} /></a>

        <div className="relative" ref={acctRef}>
          <button type="button" onClick={() => setAcctOpen(o => !o)} className={iconBtn} style={{ ...iconStyle, color: C.cyan }} aria-label="Account" aria-expanded={acctOpen}><CircleUser size={20} /></button>
          {acctOpen && (
            <div className="absolute right-0 top-12 z-40 w-[220px] rounded-xl p-2 cc-fade-up" style={{ background: C.bg2, border: `1px solid ${C.borderStrong}`, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div className="px-2 py-1.5"><div className="text-[14px] font-semibold" style={{ color: C.text }}>Owner</div><div className="text-[12.5px]" style={{ color: C.text2 }}>GID Garage</div></div>
              <a href="/admin" className="cc-btn block rounded-lg px-2 py-2 text-[14px] hover:bg-white/5" style={{ color: C.text }}>Admin dashboard</a>
              <a href="/" className="cc-btn block rounded-lg px-2 py-2 text-[14px] hover:bg-white/5" style={{ color: C.text }}>Public website</a>
              <button type="button" onClick={onLock} className="cc-btn w-full flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] hover:bg-white/5" style={{ color: C.red }}><Lock size={15} /> Lock</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
