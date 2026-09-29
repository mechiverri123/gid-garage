// "Jarvis" wake word, at no cost: the browser's built-in speech recognition
// (Chrome / Edge; audio handled by the browser vendor, nothing billed to GID)
// listens only for the word "Jarvis". Deepgram/Cartesia start only after it
// hears it, and the page puts voice back to sleep after a short quiet spell.
// "Jarvis, brief me" in one breath runs "brief me" right away; "Jarvis" alone
// gets "Yes, sir?" and listens. Paused whenever the voice session is live.
import { useEffect, useRef, useState } from 'react';
import { Ear, EarOff } from 'lucide-react';
import { C } from '../ui/theme';
import { afterWakeWord } from '../../../shared/voice-text.js';

type Rec = {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; abort(): void;
};
const Recognition = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export function useWakeWord({ enabled, paused, onWake }: { enabled: boolean; paused: boolean; onWake: (command: string) => void }) {
  const supported = typeof window !== 'undefined' && !!Recognition();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onWake); cb.current = onWake;

  useEffect(() => {
    const Ctor = Recognition();
    if (!enabled || paused || !Ctor) { setListening(false); return; }
    let stopped = false; let fired = false; let restart = 0; let fails = 0;
    let rec: Rec | null = null;
    const begin = () => {
      if (stopped) return;
      rec = new Ctor();
      rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US'; rec.maxAlternatives = 1;
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res.isFinal) continue;
          const cmd = afterWakeWord(res[0]?.transcript || '');
          if (cmd == null || fired) continue;
          fired = true; stopped = true;
          try { rec?.abort(); } catch { /* ended */ }
          setListening(false);
          cb.current(cmd);
          return;
        }
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopped = true; setError('Microphone or speech recognition is blocked in this browser.'); }
        else if (e.error !== 'no-speech' && e.error !== 'aborted') fails++;
      };
      // The browser ends recognition after a while; keep it going (backing off if it keeps failing).
      rec.onend = () => { if (!stopped) restart = window.setTimeout(begin, fails > 3 ? 5000 : 300); };
      try { rec.start(); setListening(true); setError(null); } catch { restart = window.setTimeout(begin, 1000); }
    };
    begin();
    return () => { stopped = true; window.clearTimeout(restart); try { rec?.abort(); } catch { /* ended */ } setListening(false); };
  }, [enabled, paused]);

  return { supported, listening, error };
}

export function WakeWordToggle({ on, onChange, supported, listening, error }: { on: boolean; onChange: (v: boolean) => void; supported: boolean; listening: boolean; error: string | null }) {
  if (!supported) return <div className="text-[12.5px]" style={{ color: C.muted }}>“Jarvis” wake word needs Chrome or Edge.</div>;
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
        className="cc-btn self-start inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium"
        style={{ border: `1px solid ${on ? C.borderStrong : C.border}`, color: on ? C.cyan : C.text2, background: on ? 'rgba(52,214,255,0.08)' : 'transparent' }}
        title="Free: the browser listens for the word “Jarvis”; paid voice starts only after it hears it.">
        {on ? <Ear size={14} /> : <EarOff size={14} />}
        {on ? (listening ? 'Say “Jarvis…”' : 'Wake word on') : 'Wake word off'}
      </button>
      {error && <div className="text-[12.5px]" style={{ color: C.amber }}>{error}</div>}
    </div>
  );
}
