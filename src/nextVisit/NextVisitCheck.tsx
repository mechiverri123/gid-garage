// Admin → job → Inspection tab → Next-Visit Check. A free "what's next"
// checklist: Good / Soon / Needs attention per item; Soon and Needs attention
// become recommendations on the customer's invoice (no prices, quoted later).
// Saves itself; with no signal, changes and photos wait on the phone and
// upload when the connection returns. Stored in inspection_data.nextVisit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withTemplate, recommendations, NV_STATUS, DEFAULT_CHECKLIST, type NextVisit, type NvItem, type NvStatus, type NvTemplateItem } from '../../shared/next-visit.js';
import { compressImage, uploadMedia, queueMedia, unqueueMedia, queuedFor, savePending, readPending, clearPending, isNetworkError, MAX_VIDEO_BYTES } from './media';

type Insp = Record<string, unknown> & { nextVisit?: NextVisit };
interface JobLike { id: string; vin?: string; vehicle?: string; inspectionData?: unknown }

const EMPTY_INSP = { tirePressure: { fl: '', fr: '', rl: '', rr: '' }, tireTread: { fl: '', fr: '', rl: '', rr: '' }, dtcCodes: [] };
const STATUS_STYLE: Record<NvStatus, { on: string; off: string; dot: string }> = {
  good: { on: 'bg-emerald-600 border-emerald-600 text-white', off: 'border-gray-700 text-gray-400 hover:border-emerald-600 hover:text-emerald-400', dot: 'bg-emerald-500' },
  soon: { on: 'bg-amber-500 border-amber-500 text-black', off: 'border-gray-700 text-gray-400 hover:border-amber-500 hover:text-amber-400', dot: 'bg-amber-400' },
  now: { on: 'bg-red-600 border-red-600 text-white', off: 'border-gray-700 text-gray-400 hover:border-red-600 hover:text-red-400', dot: 'bg-red-500' },
};

async function admin<T>(action: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch('/admin-api-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || text || `HTTP ${res.status}`);
  return body as T;
}

let templateCache: NvTemplateItem[] | null = null;

export function NextVisitCheck({ job, onSaved }: { job: JobLike; onSaved: (inspectionData: Insp) => void }) {
  const base = (job.inspectionData as Insp) || EMPTY_INSP;
  const [template, setTemplate] = useState<NvTemplateItem[]>(templateCache || DEFAULT_CHECKLIST);
  const [nv, setNv] = useState<NextVisit>(() => readPending<NextVisit>(job.id) || withTemplate(base.nextVisit, templateCache || DEFAULT_CHECKLIST));
  const [state, setState] = useState<'saved' | 'saving' | 'offline' | 'error'>(readPending(job.id) ? 'offline' : 'saved');
  const [err, setErr] = useState('');
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  const [hours, setHours] = useState<Record<string, { busy?: boolean; text?: string; error?: string }>>({});
  const latest = useRef(nv);
  // Every change updates `latest` right away, so a save never misses the newest state.
  const apply = useCallback((fn: (cur: NextVisit) => NextVisit) => { latest.current = fn(latest.current); setNv(latest.current); }, []);
  const baseRef = useRef(base); baseRef.current = base;
  const timer = useRef<number | null>(null);
  const answered = !!nv.response;

  // The full job record can arrive after this mounts: show its saved answers
  // unless there are local edits that haven't been saved yet.
  useEffect(() => {
    if (state !== 'saved' || timer.current || readPending(job.id)) return;
    apply(() => withTemplate(base.nextVisit, templateCache || DEFAULT_CHECKLIST));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.inspectionData]);

  useEffect(() => {
    if (templateCache) return;
    admin<{ checklist: NvTemplateItem[] }>('get-next-visit-checklist', {}).then(r => { templateCache = r.checklist; setTemplate(r.checklist); apply(cur => withTemplate(cur, r.checklist)); }).catch(() => { /* default list */ });
  }, [apply]);

  const save = useCallback(async () => {
    const next = { ...latest.current, updatedAt: new Date().toISOString() };
    setState('saving'); setErr('');
    try {
      // Merge into the record as it is on the server right now, so tire
      // readings / codes saved elsewhere (or not loaded here yet) are kept.
      const row = await admin<Record<string, unknown> | Record<string, unknown>[]>('get-booking', { id: job.id });
      const cur = (Array.isArray(row) ? row[0] : row)?.inspection_data;
      let server: Insp | null = null;
      try { server = typeof cur === 'string' ? JSON.parse(cur) : (cur as Insp) || null; } catch { server = null; }
      // Once the customer has answered, their answer (and the list they saw) wins.
      if (server?.nextVisit?.response) {
        apply(() => withTemplate(server!.nextVisit, templateCache || DEFAULT_CHECKLIST));
        clearPending(job.id); setState('saved'); onSaved(server);
        return;
      }
      const inspection: Insp = { ...EMPTY_INSP, ...(server || baseRef.current), nextVisit: next };
      await admin('patch-booking', { id: job.id, fields: { inspection_data: JSON.stringify(inspection) } });
      clearPending(job.id); setState('saved'); onSaved(inspection);
    } catch (e) {
      if (isNetworkError(e)) { savePending(job.id, next); setState('offline'); }
      else { setState('error'); setErr(e instanceof Error ? e.message : String(e)); }
    }
  }, [job.id, onSaved, apply]);
  const scheduleSave = useCallback(() => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { timer.current = null; void save(); }, 700); }, [save]);

  const update = (id: string, patch: Partial<NvItem>) => { apply(cur => ({ ...cur, items: cur.items.map(i => (i.id === id ? { ...i, ...patch } : i)) })); scheduleSave(); };

  // Upload anything that waited for signal, then save.
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const queued = await queuedFor(job.id);
    for (const q of queued) {
      try {
        const { key, url } = await uploadMedia(job.id, q.blob, q.name, q.kind);
        apply(cur => ({ ...cur, items: cur.items.map(i => (i.id === q.itemId ? { ...i, media: [...(i.media || []), { id: q.qid, key, url, kind: q.kind, takenAt: q.takenAt }] } : i)) }));
        await unqueueMedia(q.qid);
      } catch (e) { if (isNetworkError(e)) return; }
    }
    const left = await queuedFor(job.id);
    setWaiting(left.reduce<Record<string, number>>((a, q) => ({ ...a, [q.itemId]: (a[q.itemId] || 0) + 1 }), {}));
    if (queued.length || readPending(job.id)) await save();
  }, [job.id, save, apply]);
  useEffect(() => {
    void flush();
    const on = () => { void flush(); };
    window.addEventListener('online', on);
    const t = window.setInterval(on, 30000);
    return () => { window.removeEventListener('online', on); window.clearInterval(t); };
  }, [flush]);

  async function addMedia(item: NvItem, files: FileList | null, kind: 'photo' | 'video') {
    for (const file of Array.from(files || [])) {
      try {
        if (kind === 'video' && file.size > MAX_VIDEO_BYTES) { setErr('Video is over 80MB — record a shorter clip.'); continue; }
        const blob = kind === 'photo' ? await compressImage(file) : file;
        const name = kind === 'photo' ? `${file.name.replace(/\.\w+$/, '') || 'photo'}.jpg` : file.name || 'clip.mp4';
        const qid = crypto.randomUUID();
        const takenAt = new Date().toISOString();
        try {
          if (!navigator.onLine) throw new TypeError('offline');
          const { key, url } = await uploadMedia(job.id, blob, name, kind);
          update(item.id, { media: [...(latest.current.items.find(i => i.id === item.id)?.media || []), { id: qid, key, url, kind, takenAt }] });
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          await queueMedia({ qid, jobId: job.id, itemId: item.id, kind, name, blob, takenAt });
          setWaiting(w => ({ ...w, [item.id]: (w[item.id] || 0) + 1 }));
          setState('offline');
        }
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    }
  }

  async function suggest(item: NvItem) {
    setHours(h => ({ ...h, [item.id]: { busy: true } }));
    try {
      const r = await admin<{ hours: number; low: number; high: number; reason: string; vehicle: string }>('suggest-labor-hours', { vin: job.vin, vehicle: job.vehicle, service: item.service, note: item.note });
      update(item.id, { laborHours: r.hours });
      setHours(h => ({ ...h, [item.id]: { text: `≈ ${r.hours} h (${r.low}–${r.high}) · ${r.reason}` } }));
    } catch (e) { setHours(h => ({ ...h, [item.id]: { error: e instanceof Error ? e.message : String(e) } })); }
  }

  const byCat = useMemo(() => nv.items.reduce<Record<string, NvItem[]>>((acc, i) => { (acc[i.category] ||= []).push(i); return acc; }, {}), [nv.items]);
  const checked = nv.items.filter(i => i.status).length;
  const recs = recommendations(nv);
  const totalWaiting = Object.values(waiting).reduce((a, b) => a + b, 0);
  const markRestGood = () => { apply(cur => ({ ...cur, items: cur.items.map(i => (i.status ? i : { ...i, status: 'good' as const })) })); scheduleSave(); };
  void template;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Next-Visit Check</p>
          <p className="text-gray-600 text-[11px] mt-0.5">Free check. Yellow and red items show on the customer's invoice as recommendations for next time.</p>
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 border ${state === 'offline' ? 'border-amber-700 text-amber-400' : state === 'error' ? 'border-red-700 text-red-400' : 'border-gray-800 text-gray-500'}`} role="status">
          {state === 'saving' ? 'Saving…' : state === 'offline' ? `No signal — will upload${totalWaiting ? ` (${totalWaiting} waiting)` : ''}` : state === 'error' ? 'Not saved' : '✓ Saved'}
        </span>
      </div>
      {err && <p className="text-red-400 text-xs" role="alert">{err}</p>}
      {answered && (
        <div className="border border-emerald-800 bg-emerald-900/10 px-3 py-2 text-xs text-emerald-300">
          Customer answered {new Date(nv.response!.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' })}:
          {' '}{nv.response!.approved.length} approved, {nv.response!.declined.length} declined{nv.response!.jobId ? ` · new job ${nv.response!.jobId} on ${nv.response!.date} ${nv.response!.time}` : ''}. The check is locked so it matches what they saw.
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{checked} of {nv.items.length} checked · <b className="text-white">{recs.length}</b> recommendation{recs.length === 1 ? '' : 's'}</span>
        {!answered && checked < nv.items.length && <button type="button" onClick={markRestGood} className="ml-auto text-[11px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400">Mark the rest Good</button>}
      </div>

      {Object.entries(byCat).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-gray-600 text-[11px] font-bold uppercase tracking-widest mb-1.5">{cat}</p>
          <div className="space-y-1.5">
            {items.map(i => (
              <div key={i.id} className="bg-gray-900 border border-gray-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 flex-shrink-0 rounded-full ${i.status ? STATUS_STYLE[i.status].dot : 'bg-gray-700'}`} aria-hidden />
                  <span className="text-white text-sm flex-1 min-w-0">{i.label}</span>
                  {(['good', 'soon', 'now'] as NvStatus[]).map(st => (
                    <button key={st} type="button" disabled={answered} onClick={() => update(i.id, { status: i.status === st ? null : st })} aria-pressed={i.status === st}
                      className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 border transition-colors disabled:opacity-60 ${i.status === st ? STATUS_STYLE[st].on : STATUS_STYLE[st].off}`}>
                      {st === 'good' ? 'Good' : st === 'soon' ? 'Soon' : 'Now'}
                    </button>
                  ))}
                </div>
                {(i.status === 'soon' || i.status === 'now') && (
                  <div className="mt-2 space-y-2 pl-4">
                    <p className="text-[11px] text-gray-500">Recommends: <span className="text-gray-300">{i.service}</span> · {NV_STATUS[i.status]}</p>
                    <input type="text" value={i.note} disabled={answered} onChange={e => update(i.id, { note: e.target.value })} placeholder="What you saw (the customer reads this) — e.g. 3mm left on the pads"
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm px-3 py-1.5 outline-none focus:border-red-600" />
                    <div className="flex flex-wrap items-center gap-2">
                      {(i.media || []).map(m => (
                        <div key={m.id} className="relative">
                          {m.kind === 'video' ? <video src={m.url} className="w-16 h-16 object-cover bg-black" muted /> : <img src={m.url} alt="" className="w-16 h-16 object-cover" />}
                          {!answered && <button type="button" aria-label="Remove" onClick={() => update(i.id, { media: i.media.filter(x => x.id !== m.id) })} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black border border-gray-600 text-gray-300 text-xs leading-none">×</button>}
                        </div>
                      ))}
                      {!!waiting[i.id] && <span className="text-[11px] text-amber-400">{waiting[i.id]} waiting for signal</span>}
                      {!answered && <>
                        <label className="cursor-pointer text-[11px] font-bold uppercase tracking-wider px-2 py-1 border border-gray-700 text-gray-300 hover:text-white">📷 Photo<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => { void addMedia(i, e.target.files, 'photo'); e.target.value = ''; }} /></label>
                        <label className="cursor-pointer text-[11px] font-bold uppercase tracking-wider px-2 py-1 border border-gray-700 text-gray-300 hover:text-white">🎥 Video<input type="file" accept="video/*" capture="environment" className="hidden" onChange={e => { void addMedia(i, e.target.files, 'video'); e.target.value = ''; }} /></label>
                      </>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={hours[i.id]?.busy} onClick={() => void suggest(i)} className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50">{hours[i.id]?.busy ? 'Thinking…' : '✨ Suggest labor hours'}</button>
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">Hours
                        <input type="text" inputMode="decimal" value={i.laborHours ?? ''} onChange={e => update(i.id, { laborHours: e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                          className="w-14 bg-gray-800 border border-gray-700 text-white text-sm px-2 py-1 outline-none focus:border-red-600" />
                      </label>
                      <span className="text-[11px] text-gray-600">(for you only — not shown to the customer)</span>
                    </div>
                    {hours[i.id]?.text && <p className="text-[11px] text-gray-400">{hours[i.id].text}</p>}
                    {hours[i.id]?.error && <p className="text-[11px] text-red-400">{hours[i.id].error}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
