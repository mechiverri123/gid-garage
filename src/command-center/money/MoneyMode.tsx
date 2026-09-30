// Money: revenue vs expenses vs net, sales tax, and owner's equity, from the
// jobs (canonical revenue) + the Bluevine bank export + the Zoho Books expense
// export, reconciled so each expense counts once (shared/money.js, tested in
// tests/money.test.js). Data: /jarvis/money. Customer jobs stay in Jobs;
// here customer money only appears as revenue and as bank deposits.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wallet, Upload, Receipt, Landmark, PiggyBank, AlertTriangle, BarChart3, Settings, Search } from 'lucide-react';
import type { CommandCenterSummary } from '../types';
import { C, money, shortDay, timeAgo } from '../ui/theme';
import { CommandCard, SectionHeader, StatusBadge, ActionButton, Skeleton, ErrorState, EmptyState, Segmented } from '../ui/primitives';
import { RevenueTrend } from '../dashboard/BusinessSections';
import { phoenixYmd, addDaysYmd } from '../../../shared/business-metrics.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
type Period = 'month' | 'last' | '90' | 'ytd' | 'all';

function rangeFor(p: Period, today: string): [string, string] {
  const [y, m] = today.split('-').map(Number);
  if (p === 'month') return [`${today.slice(0, 7)}-01`, today];
  if (p === 'last') { const ly = m === 1 ? y - 1 : y; const lm = m === 1 ? 12 : m - 1; const end = addDaysYmd(`${today.slice(0, 7)}-01`, -1); return [`${ly}-${String(lm).padStart(2, '0')}-01`, end]; }
  if (p === '90') return [addDaysYmd(today, -89), today];
  if (p === 'ytd') return [`${y}-01-01`, today];
  return ['2000-01-01', today];
}

const KIND_LABEL: Record<string, string> = { expense: 'Expense', tax_paid: 'Sales tax paid', owner_out: 'Paid you back', owner_in: 'You put in', deposit: 'Customer money in', income: 'Interest', excluded: 'Not counted' };
const KIND_TONE: Record<string, any> = { expense: 'muted', tax_paid: 'amber', owner_out: 'purple', owner_in: 'purple', deposit: 'green', income: 'green', excluded: 'muted' };
const FILTERS = [
  { value: 'expense', label: 'Expenses' }, { value: 'equity', label: "Owner's equity" }, { value: 'deposit', label: 'Money in' },
  { value: 'tax_paid', label: 'Sales tax' }, { value: 'review', label: 'Needs review' }, { value: 'all', label: 'Everything' },
] as const;
type Filter = typeof FILTERS[number]['value'];

async function post(body: Record<string, unknown>) {
  const r = await fetch('/jarvis/money', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function Stat({ label, value, sub, color = C.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 min-w-0" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: C.muted }}>{label}</div>
      <div className="text-[26px] font-bold tabular-nums leading-tight mt-1" style={{ color }}>{value}</div>
      {sub && <div className="text-[13px] mt-1" style={{ color: C.text2 }}>{sub}</div>}
    </div>
  );
}

// One entry's decision: what it is (and, for an expense, its category / how it was paid).
function Decide({ e, categories, onDone }: { e: Any; categories: string[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (d: Record<string, unknown>) => { setBusy(true); setErr(''); try { await post({ action: 'decide', id: e.id, ...d }); onDone(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } setBusy(false); };
  const sel = { background: 'rgba(3,10,17,0.9)', border: `1px solid ${C.borderStrong}`, color: C.text };
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {(e.kind === 'expense' || (e.amount > 0 && e.kind !== 'deposit')) && (
        <select aria-label="Category" disabled={busy} value={e.kind === 'expense' ? e.category : ''} onChange={x => go({ kind: 'expense', category: x.target.value })} className="h-9 rounded-lg px-2 text-[13.5px]" style={sel}>
          <option value="" disabled>{e.amount < 0 ? 'Refund of…' : 'Business expense…'}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {e.amount > 0 && e.source !== 'zoho' && <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ kind: 'owner_out' })}>Personal (paid me back)</ActionButton>}
      {e.funding === 'outside' && <>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ funding: 'personal' })}>My personal card</ActionButton>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ funding: 'business_cash' })}>Business cash</ActionButton>
      </>}
      {e.kind === 'excluded' && <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ kind: 'expense' })}>It was a separate purchase</ActionButton>}
      {e.kind !== 'excluded' && e.source === 'zoho' && <ActionButton size="sm" variant="ghost" disabled={busy} onClick={() => go({ kind: 'excluded' })}>Duplicate — don't count</ActionButton>}
      {e.amount < 0 && e.kind === 'deposit' && <>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ kind: 'deposit' })}>Customer payment</ActionButton>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ kind: 'owner_in' })}>My own money</ActionButton>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => go({ kind: 'expense', category: 'Other Business Expense' })}>A refund</ActionButton>
      </>}
      {e.reviewed && <ActionButton size="sm" variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await post({ action: 'undecide', id: e.id }); onDone(); } finally { setBusy(false); } }}>Undo my choice</ActionButton>}
      {err && <span className="text-[13px] w-full" style={{ color: C.amber }}>{err}</span>}
    </div>
  );
}

function Row({ e, categories, onDone }: { e: Any; categories: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const out = e.amount > 0;
  return (
    <li className="rounded-xl px-4 py-3 text-[14px]" style={{ background: 'rgba(3,10,17,0.45)', border: `1px solid ${e.review ? 'rgba(255,184,77,0.4)' : C.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[92px_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1">
        <span className="hidden sm:block tabular-nums font-semibold" style={{ color: C.cyan }}>{shortDay(e.date)}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold" style={{ color: C.text }}>{e.desc}</span>
          <span className="block truncate text-[13px]" style={{ color: C.text2 }}>
            <span className="sm:hidden">{shortDay(e.date)} · </span>{e.kind === 'expense' ? e.category : KIND_LABEL[e.kind]}
            {e.source === 'both' ? ' · bank + Zoho receipt' : e.source === 'zoho' ? ' · Zoho only' : e.noReceipt ? ' · no Zoho receipt' : ''}
            {e.funding === 'personal' ? ' · paid personally' : e.funding === 'business_cash' ? ' · business cash' : ''}
            {e.notInLedger ? ' · not in your equity ledger' : e.inLedger ? ' · in your equity ledger' : ''}
          </span>
        </span>
        <span className="hidden sm:block">{e.review ? <StatusBadge tone="amber">review</StatusBadge> : <StatusBadge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</StatusBadge>}</span>
        <span className="tabular-nums font-semibold text-right" style={{ color: out ? C.text : C.green }}>{out ? '' : '+'}{money(Math.abs(e.amount), 2)}</span>
      </button>
      {(open || e.review) && (
        <div className="text-[13px] mt-1" style={{ color: C.text2 }}>
          {e.review && <div style={{ color: C.amber }}>{e.review}</div>}
          {e.note && <div>{e.note}</div>}
          {e.bankDesc && <div>Bank: {e.bankDesc}{e.bankDate && !e.bankIds ? ` (${e.bankDate})` : ''}</div>}
          {e.zohoAccount && <div>Zoho: {e.zohoAccount}{e.receipt ? ` · receipt ${e.receipt}` : ''}</div>}
          <Decide e={e} categories={categories} onDone={onDone} />
        </div>
      )}
    </li>
  );
}

export function MoneyMode({ summary, onOpenView }: { summary: CommandCenterSummary | null; onOpenView: (v: { type: string; [k: string]: unknown }) => void }) {
  const today = phoenixYmd(new Date());
  const [period, setPeriod] = useState<Period>('month');
  const [from, to] = rangeFor(period, today);
  const [data, setData] = useState<Any | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('expense');
  const [q, setQ] = useState('');
  const [upMsg, setUpMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/jarvis/money?from=${from}&to=${to}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs: string[] = [];
    for (const f of Array.from(files)) {
      try { const r = await post({ action: 'upload', text: await f.text(), name: f.name }); msgs.push(`${f.name}: ${r.kind === 'bluevine' ? 'Bluevine' : 'Zoho Books'}, ${r.added} new of ${r.rows} (${r.from} – ${r.to})`); }
      catch (e) { msgs.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setUpMsg(msgs.join(' · '));
    if (file.current) file.current.value = '';
    void load();
  };

  const rows = useMemo(() => {
    const list: Any[] = data?.entries || [];
    const f = list.filter(e => filter === 'all' ? true : filter === 'review' ? !!e.review : filter === 'equity' ? e.kind === 'owner_out' || e.kind === 'owner_in' || e.funding === 'personal' : filter === 'deposit' ? e.kind === 'deposit' || e.kind === 'income' : e.kind === filter);
    const s = q.trim().toLowerCase().replace(/[$,]/g, '');
    return s ? f.filter(e => `${e.desc} ${e.category} ${e.zohoAccount || ''} ${e.bankDesc || ''} ${Math.abs(e.amount).toFixed(2)}`.toLowerCase().includes(s)) : f;
  }, [data, filter, q]);

  const s = data?.summary; const all = data?.allTime; const src = data?.sources;
  const cats: [string, number][] = s ? Object.entries(s.byCategory) as [string, number][] : [];
  const maxCat = Math.max(1, ...cats.map(([, v]) => Math.abs(v)));
  const selfEmp = s ? Math.max(0, s.net) * 0.9235 * 0.153 : 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <CommandCard variant="primary" className="p-5 sm:p-6">
        <SectionHeader icon={Wallet} title="Money" subtitle="Revenue from your jobs, expenses from Bluevine + Zoho Books (each counted once), sales tax and owner's equity."
          right={<ActionButton icon={Upload} variant="primary" onClick={() => file.current?.click()}>Upload CSVs</ActionButton>} />
        <input ref={file} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={e => upload(e.target.files)} aria-label="Upload Bluevine or Zoho Books CSV" />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: '90', label: '90 days' }, { value: 'ytd', label: 'This year' }, { value: 'all', label: 'All time' }]} />
          <span className="text-[13px]" style={{ color: C.muted }}>{shortDay(from === '2000-01-01' ? (src?.bluevine?.from || from) : from)} – {shortDay(to)}</span>
        </div>
        <div className="text-[13px] mt-3 flex flex-col gap-0.5" style={{ color: C.text2 }}>
          <span>Bluevine: {src?.bluevine?.rows ? `${src.bluevine.from} – ${src.bluevine.to}${src.bluevine.balance != null ? ` · balance ${money(src.bluevine.balance, 2)} on ${src.bluevine.balanceDate}` : ''}${src.bluevine.lastUpload ? ` · uploaded ${timeAgo(src.bluevine.lastUpload.at)}` : ''}` : 'not uploaded yet (Bluevine → Transactions → Export CSV)'}</span>
          <span>Zoho Books: {src?.zoho?.rows ? `${src.zoho.from} – ${src.zoho.to}${src.zoho.lastUpload ? ` · uploaded ${timeAgo(src.zoho.lastUpload.at)}` : ''}` : "not uploaded yet (Zoho Books → Reports → Expense Details → Export CSV)"}</span>
          <span style={{ color: C.muted }}>Upload both every two weeks; re-uploading overlapping dates never double counts.</span>
          {upMsg && <span role="status" style={{ color: C.cyan }}>{upMsg}</span>}
        </div>
      </CommandCard>

      {error && <ErrorState message={`Couldn't load money: ${error}`} onRetry={load} />}
      {!data && !error && <Skeleton className="h-[360px]" />}

      {s && <>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Revenue collected" value={money(s.revenue, 2)} sub={`From your jobs (same as the dashboard). Includes ${money(s.salesTaxCollected, 2)} sales tax.`} color={C.green} />
          <Stat label="Expenses" value={money(s.expenses, 2)} sub={s.paidOutsideBank ? `${money(s.paidOutsideBank, 2)} paid outside Bluevine` : 'Bluevine + Zoho, each counted once'} />
          <Stat label="Net profit" value={money(s.net, 2)} sub="Revenue − sales tax − expenses (+ interest). Not reduced by paying yourself back." color={s.net >= 0 ? C.cyan : C.red} />
          <Stat label="Paid yourself back" value={money(s.ownerPaidBack, 2)} sub={`Owner's equity repaid this period · you put in ${money(s.ownerPutIn, 2)}`} color={C.purple} />
        </div>

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-12 items-start">
          <CommandCard className="p-5 xl:col-span-7">
            <SectionHeader icon={Receipt} title="Expenses by category" subtitle={`${money(s.expenses, 2)} · ${shortDay(from === '2000-01-01' ? (src?.bluevine?.from || from) : from)} – ${shortDay(to)}`} />
            {!cats.length ? <EmptyState icon={Receipt} title="No expenses in this period">Upload your Bluevine and Zoho Books CSVs.</EmptyState> : (
              <ul className="flex flex-col gap-2.5">{cats.map(([k, v]) => (
                <li key={k}>
                  <div className="flex justify-between text-[14px] gap-3"><span style={{ color: C.text }}>{k}</span><span className="tabular-nums font-semibold" style={{ color: C.text }}>{money(v, 2)}</span></div>
                  <div className="h-2 rounded-full mt-1" style={{ background: 'rgba(52,214,255,0.08)' }}><div className="h-2 rounded-full" style={{ width: `${(Math.abs(v) / maxCat) * 100}%`, background: C.cyan }} /></div>
                </li>
              ))}</ul>
            )}
          </CommandCard>

          <div className="xl:col-span-5 flex flex-col gap-4 sm:gap-5">
            <CommandCard className="p-5">
              <SectionHeader icon={Landmark} tone="amber" title="Sales tax (AZ TPT)" subtitle="Collected on jobs vs paid to the Department of Revenue" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>Collected</div><div className="text-[18px] font-bold tabular-nums" style={{ color: C.text }}>{money(s.salesTaxCollected, 2)}</div></div>
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>Paid</div><div className="text-[18px] font-bold tabular-nums" style={{ color: C.text }}>{money(s.salesTaxPaid, 2)}</div></div>
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>All-time left to pay</div><div className="text-[18px] font-bold tabular-nums" style={{ color: all?.salesTaxOwed > 0 ? C.amber : C.green }}>{money(Math.max(0, all?.salesTaxOwed ?? 0), 2)}</div></div>
              </div>
              <p className="text-[13px] mt-3" style={{ color: C.text2 }}>Rough self-employment tax on this period's net: <b style={{ color: C.text }}>{money(selfEmp, 0)}</b> (15.3% × 92.35%), before income tax. An estimate to set money aside, not tax advice.</p>
              <div className="mt-2"><ActionButton size="sm" variant="ghost" icon={Settings} onClick={() => onOpenView({ type: 'settings' })}>Tax rate & owner pay settings</ActionButton></div>
            </CommandCard>

            <CommandCard className="p-5">
              <SectionHeader icon={PiggyBank} tone="purple" title="Owner's equity (all time)" subtitle="From your Owner's Equity ledger in admin (Hub → Banking & Credit)" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>You put in</div><div className="text-[18px] font-bold tabular-nums" style={{ color: C.text }}>{money(all?.ownerPutIn, 2)}</div></div>
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>Paid back</div><div className="text-[18px] font-bold tabular-nums" style={{ color: C.text }}>{money(all?.ownerPaidBack, 2)}</div></div>
                <div><div className="text-[12px] uppercase tracking-wider" style={{ color: C.muted }}>{(all?.ownerEquityNet ?? 0) >= 0 ? 'Still owed to you' : 'Paid back beyond'}</div><div className="text-[18px] font-bold tabular-nums" style={{ color: C.purple }}>{money(Math.abs(all?.ownerEquityNet ?? 0), 2)}</div></div>
              </div>
              {data.equityLedger && !data.equityLedger.ok && <p className="text-[13px] mt-3" style={{ color: C.amber }}>Couldn't read the admin equity ledger.</p>}
              {(all?.bankDrawsNotInLedger > 0 || all?.bankContributionsNotInLedger > 0) && (
                <p className="text-[13px] mt-3" style={{ color: C.amber }}>
                  In Bluevine but not in your ledger: {all.bankDrawsNotInLedger > 0 && <>{money(all.bankDrawsNotInLedger, 2)} paid to you</>}{all.bankDrawsNotInLedger > 0 && all.bankContributionsNotInLedger > 0 && ' · '}{all.bankContributionsNotInLedger > 0 && <>{money(all.bankContributionsNotInLedger, 2)} you deposited</>}.
                  {' '}If those were draws or contributions, add them in admin; otherwise tap them below (filter "Owner's equity") and pick what they were.
                </p>)}
            </CommandCard>
          </div>
        </div>

        {all && src?.bluevine?.balance != null && (() => {
          const taxHeld = Math.max(0, all.salesTaxOwed);
          const shouldHave = all.net + taxHeld + all.ownerEquityNet;
          const rest = shouldHave - src.bluevine.balance;
          const line = (label: string, v: number, bold = false) => (
            <div className="flex justify-between gap-3 py-1" style={{ borderTop: bold ? `1px solid ${C.border}` : undefined }}>
              <span style={{ color: bold ? C.text : C.text2, fontWeight: bold ? 700 : 400 }}>{label}</span>
              <span className="tabular-nums" style={{ color: C.text, fontWeight: bold ? 700 : 500 }}>{v < 0 ? '−' : ''}{money(Math.abs(v), 2)}</span>
            </div>
          );
          return (
            <CommandCard className="p-5">
              <SectionHeader icon={Landmark} title="Why net profit isn't your bank balance (all time)" subtitle="Profit is what the business earned. The bank only holds part of it at any moment." />
              <div className="text-[14px] max-w-[640px]">
                {line('Net profit (everything uploaded)', all.net)}
                {line('+ Sales tax collected, not yet paid to AZ', taxHeld)}
                {line(`${all.ownerEquityNet >= 0 ? '+' : '−'} You put in more than you took out (equity ledger)`, Math.abs(all.ownerEquityNet))}
                {line('= Money the business should have somewhere', shouldHave, true)}
                {line(`Bluevine balance on ${src.bluevine.balanceDate}`, src.bluevine.balance)}
                {line('= Not in the bank on that date', rest, true)}
              </div>
              <p className="text-[13px] mt-2" style={{ color: C.text2 }}>That last line is money that's real but somewhere else: Stripe payouts still on the way, cash customers paid you that never went into Bluevine, Venmo transfers still pending, and anything spent after {src.bluevine.balanceDate} (upload a newer Bluevine export to include it).</p>
            </CommandCard>
          );
        })()}

        {data.reviewAll > 0 && (
          <div className="rounded-xl px-4 py-3 text-[14px] flex flex-wrap items-center gap-2" role="status" style={{ color: C.amber, background: 'rgba(255,184,77,0.07)', border: '1px solid rgba(255,184,77,0.35)' }}>
            <AlertTriangle size={17} /> {data.reviewAll} item{data.reviewAll === 1 ? '' : 's'} need a quick decision (they're counted as business expenses until you decide).
            <ActionButton size="sm" variant="secondary" onClick={() => { setPeriod('all'); setFilter('review'); }}>Review them</ActionButton>
          </div>
        )}

        <CommandCard className="p-5">
          <SectionHeader icon={Search} title="Every transaction" subtitle={`${rows.length} shown · tap one for details or to change it`} />
          <div className="flex flex-wrap gap-2 mb-3">
            <Segmented label="Show" value={filter} onChange={setFilter} options={FILTERS.map(f => ({ value: f.value, label: f.label }))} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search store, category, amount…" aria-label="Search transactions"
              className="flex-1 min-w-[200px] h-10 rounded-lg px-3 text-[14px] outline-none" style={{ background: 'rgba(3,10,17,0.8)', border: `1px solid ${C.borderStrong}`, color: C.text }} />
          </div>
          {!rows.length ? (filter === 'review'
            ? <EmptyState icon={Receipt} title="Nothing needs review" action={<ActionButton size="sm" onClick={() => setFilter('expense')}>Show expenses</ActionButton>}>Every transaction has a decision.</EmptyState>
            : <EmptyState icon={Receipt} title="Nothing here for this period" />) : (
            <ul className="flex flex-col gap-2">{rows.map(e => <Row key={e.id} e={e} categories={data.categories} onDone={load} />)}</ul>
          )}
        </CommandCard>
      </>}

      {summary && <RevenueTrend summary={summary} />}
      <div><ActionButton variant="secondary" icon={BarChart3} onClick={() => onOpenView({ type: 'analytics', range: { period: 'this_month' } })}>Open the revenue chart</ActionButton></div>
    </div>
  );
}
