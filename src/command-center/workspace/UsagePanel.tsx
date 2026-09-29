// Settings -> Usage: this month's estimated Jarvis AI spend against the budget
// (functions/_lib/ai-budget.js via /jarvis/voice?action=usage), plus the last
// voice latency timings for debugging. Estimates, not a provider bill.
import { useEffect, useState } from 'react';
import { Gauge, CheckCircle2, XCircle, Timer } from 'lucide-react';
import { C, money } from '../ui/theme';
import { Skeleton } from '../ui/primitives';
import { voiceTimings } from '../voice/useDirectVoice';

interface Usage {
  month: string; total: number; limit: number; pct: number; state: 'normal' | 'warn' | 'conscious' | 'blocked'; tracking: boolean;
  providers: Record<'anthropic' | 'stt' | 'tts', { usd: number; units: number }>;
  configured?: { anthropic: boolean; deepgram: boolean; cartesia: boolean };
}
const STATE_NOTE: Record<Usage['state'], string> = {
  normal: 'Normal operation.',
  warn: '80% of monthly Jarvis AI budget used.',
  conscious: 'Cost-conscious mode: shorter spoken answers; everything else works.',
  blocked: 'Monthly Jarvis AI budget reached. AI answers pause until next month; screen commands still work.',
};

export function UsagePanel() {
  const [u, setU] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/jarvis/voice?action=usage', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setU, e => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const t = voiceTimings.last;
  const barColor = !u ? C.cyan : u.state === 'blocked' ? C.red : u.state === 'conscious' || u.state === 'warn' ? C.amber : C.cyan;
  const row = (label: string, usd: number, unit: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b last:border-b-0" style={{ borderColor: 'rgba(54,211,255,0.08)' }}>
      <span className="text-[14px]" style={{ color: C.text2 }}>{label} <span className="text-[12.5px]" style={{ color: C.muted }}>{unit}</span></span>
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: C.text }}>{money(usd, 2)}</span>
    </div>
  );
  return (
    <section className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: 'rgba(3,10,17,0.5)', border: `1px solid ${C.border}` }} aria-label="Jarvis AI usage">
      <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: C.text2 }}><Gauge size={16} color={C.cyan} />Jarvis AI usage (estimate)</h3>
      {err ? <div className="text-[14px]" style={{ color: C.amber }}>Couldn't load usage ({err}).</div> : !u ? <Skeleton className="h-[140px]" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[30px] font-bold tabular-nums" style={{ color: C.text }}>{money(u.total, 2)}</span>
              <span className="text-[14px]" style={{ color: C.text2 }}>of {money(u.limit, 0)} · {Math.round(u.pct)}%</span>
            </div>
            <div className="h-2.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(52,214,255,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, u.pct)}%`, background: barColor }} />
            </div>
            <div className="text-[13px] mt-2" style={{ color: u.state === 'normal' ? C.muted : barColor }}>{u.tracking ? STATE_NOTE[u.state] : 'Tracking is off until jarvis_ai_usage_migration.sql is run in Supabase.'}</div>
            <div className="text-[12px] mt-1" style={{ color: C.muted }}>{u.month} · app-side estimate, not your provider bill. Set provider spending limits too (MANUAL_STEPS.md).</div>
          </div>
          <div>
            {row('Claude (Anthropic)', u.providers.anthropic.usd, `${Math.round(u.providers.anthropic.units / 1000)}k tokens`)}
            {row('Speech-to-text (Deepgram)', u.providers.stt.usd, `${Math.round(u.providers.stt.units / 60)} min`)}
            {row('Voice (Cartesia)', u.providers.tts.usd, `${Math.round(u.providers.tts.units / 1000)}k chars`)}
            {u.configured && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12.5px]">
                {(['anthropic', 'deepgram', 'cartesia'] as const).map(k => (
                  <span key={k} className="inline-flex items-center gap-1" style={{ color: u.configured![k] ? C.green : C.amber }}>
                    {u.configured![k] ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{k} key
                  </span>
                ))}
              </div>
            )}
          </div>
          {t && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] tabular-nums" style={{ color: C.muted }}>
              <Timer size={14} />Last voice turn: speech end → text {t.speechEndToFinal ?? '—'} ms · text → first words {t.finalToFirstText ?? '—'} ms · words → audio {t.firstTextToAudio ?? '—'} ms · total {t.speechEndToAudio ?? '—'} ms
            </div>
          )}
        </div>
      )}
    </section>
  );
}
