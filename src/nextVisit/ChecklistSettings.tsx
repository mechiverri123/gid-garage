// Hub → Next-Visit Checklist: edit the items every next-visit check starts with.
// Saved in business_settings.next_visit_checklist (next_visit_migration.sql).
// Changing the list never touches checks already done on past jobs.
import { useEffect, useState } from 'react';
import { DEFAULT_CHECKLIST, cleanTemplate, type NvTemplateItem } from '../../shared/next-visit.js';

async function admin<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/admin-api-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

const input = 'bg-gray-800 border border-gray-700 text-white text-sm px-2 py-1.5 outline-none focus:border-red-600 min-w-0';

export function ChecklistSettings() {
  const [list, setList] = useState<NvTemplateItem[] | null>(null);
  const [migrated, setMigrated] = useState(true);
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    admin<{ checklist: NvTemplateItem[]; migrated: boolean }>('get-next-visit-checklist')
      .then(r => { setList(r.checklist); setMigrated(r.migrated); }, e => { setList(DEFAULT_CHECKLIST); setMsg(e.message); });
  }, []);

  const edit = (i: number, patch: Partial<NvTemplateItem>) => { setList(l => l!.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, d: number) => { setList(l => { const a = [...l!]; const [x] = a.splice(i, 1); a.splice(Math.max(0, Math.min(a.length, i + d)), 0, x); return a; }); setDirty(true); };
  async function save(reset = false) {
    setBusy(true); setMsg('');
    try {
      const r = await admin<{ checklist: NvTemplateItem[] }>('set-next-visit-checklist', reset ? { reset: true } : { checklist: cleanTemplate(list) });
      setList(r.checklist); setDirty(false); setMsg(reset ? 'Back to the default list.' : 'Saved.');
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  if (!list) return <p className="text-gray-500 text-sm">Loading checklist…</p>;
  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">The items every next-visit check starts with. Yellow/red items show the <b className="text-white">recommended service</b> on the customer's invoice. Past checks aren't changed.</p>
      {!migrated && <p className="text-amber-400 text-xs border border-amber-800 px-3 py-2">Using the built-in list. To save your own, run <code>next_visit_migration.sql</code> once in Supabase.</p>}
      <div className="hidden sm:grid grid-cols-[1fr_1.3fr_1.6fr_auto] gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 px-1">
        <span>Category</span><span>Check</span><span>Recommended service</span><span />
      </div>
      <div className="space-y-2">
        {list.map((t, i) => (
          <div key={t.id + i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1.6fr_auto] gap-2 bg-gray-900 border border-gray-800 p-2">
            <input className={input} value={t.category} onChange={e => edit(i, { category: e.target.value })} aria-label="Category" />
            <input className={input} value={t.label} onChange={e => edit(i, { label: e.target.value })} aria-label="Check" />
            <input className={input} value={t.service} onChange={e => edit(i, { service: e.target.value })} aria-label="Recommended service" />
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 border border-gray-700 text-gray-400 disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="px-2 border border-gray-700 text-gray-400 disabled:opacity-30" aria-label="Move down">↓</button>
              <button type="button" onClick={() => { setList(l => l!.filter((_, j) => j !== i)); setDirty(true); }} className="px-2 border border-gray-700 text-gray-400 hover:text-red-400" aria-label="Remove">×</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setList(l => [...l!, { id: `custom-${Date.now()}`, category: l![l!.length - 1]?.category || 'Other', label: '', service: '' }]); setDirty(true); }}
          className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-400">+ Add item</button>
        <button type="button" onClick={() => save(false)} disabled={busy || !dirty || !migrated} className="ml-auto bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest px-4 py-2">{busy ? 'Saving…' : 'Save checklist'}</button>
        <button type="button" onClick={() => save(true)} disabled={busy || !migrated} className="border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 text-xs font-bold uppercase tracking-widest px-3 py-2">Reset to default</button>
      </div>
      {msg && <p className="text-xs text-gray-400" role="status">{msg}</p>}
    </div>
  );
}
