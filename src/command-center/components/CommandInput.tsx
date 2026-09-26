import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { COLORS } from '../tokens';
import { ActivityFeed } from './ActivityFeed';
import { Workspace } from './Workspace';
import type { ActivityItem, ChatMsg } from '../types';

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function CommandInput({
  chatMessages, asking, liveActivity, onAsk, onClear,
}: {
  chatMessages: ChatMsg[];
  asking: boolean;
  liveActivity: ActivityItem[];
  onAsk: (q: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setDictationSupported(true);
    const r: Recognition = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (event: any) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += text;
        else interim += text;
      }
      setQuery(prev => {
        const base = prev.replace(/\s*\[dictating:.*\]$/i, '').trim();
        if (finalText) return `${base}${base ? ' ' : ''}${finalText.trim()}`;
        return interim ? `${base}${base ? ' ' : ''}[dictating: ${interim.trim()}]` : base;
      });
    };
    r.onend = () => {
      setListening(false);
      setQuery(prev => prev.replace(/\s*\[dictating:.*\]$/i, '').trim());
    };
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch {}
      recognitionRef.current = null;
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = query.replace(/\s*\[dictating:.*\]$/i, '').trim();
    if (!clean || asking) return;
    onAsk(clean);
    setQuery('');
  }

  function toggleDictation() {
    const r = recognitionRef.current;
    if (!r) return;
    if (listening) {
      r.stop();
      setListening(false);
      return;
    }
    try {
      setListening(true);
      r.start();
    } catch {
      setListening(false);
    }
  }

  return (
    <div className="max-w-[1180px] mx-auto w-full">
      {(chatMessages.length > 0 || asking) && (
        <div className="mb-4 rounded-[18px] border p-4 max-h-64 overflow-y-auto space-y-2.5" style={{ borderColor: COLORS.border, background: 'rgba(4,10,18,0.78)' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>Michael + GID</div>
            {chatMessages.length > 0 && (
              <button onClick={onClear} className="text-[10px] uppercase tracking-wide" style={{ color: COLORS.textFaint }}>Clear</button>
            )}
          </div>
          <Workspace messages={chatMessages} />
          {asking && (
            <div className="pl-3 border-l-2 py-1" style={{ borderColor: `${COLORS.accent}40` }}>
              <ActivityFeed items={liveActivity} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center justify-center gap-3">
        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused || listening ? 6 + h * 5 : 4, background: focused || listening ? COLORS.accent : COLORS.textFaint, opacity: focused || listening ? 0.8 : 0.35 }} />
          ))}
        </div>

        <div
          className="flex-1 max-w-[900px] flex items-center rounded-full px-5 py-3 transition-all"
          style={{
            background: 'linear-gradient(180deg, rgba(10,22,38,0.97) 0%, rgba(5,13,24,0.94) 100%)',
            border: `1px solid ${focused || listening ? COLORS.borderStrong : COLORS.border}`,
            boxShadow: focused || listening ? '0 0 34px rgba(84,231,255,0.2), inset 0 0 0 1px rgba(84,231,255,0.08)' : 'inset 0 0 0 1px rgba(84,231,255,0.04)',
          }}
        >
          <div className="mr-4 shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: COLORS.accent }}>GID</div>
            <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>{listening ? 'Listening to Michael' : 'Owner Command'}</div>
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask about GID Garage, dictate a note, reschedule a job, or say ‘catch me up’…"
            className="flex-1 bg-transparent text-[#F5F8FA] placeholder-[#52616D] text-sm outline-none min-w-0"
          />
          <button
            type="button"
            onClick={toggleDictation}
            disabled={!dictationSupported || asking}
            title={dictationSupported ? (listening ? 'Stop dictation' : 'Start dictation') : 'Browser dictation is not supported here'}
            className="shrink-0 w-10 h-10 ml-2 rounded-full border flex items-center justify-center transition-all disabled:opacity-25"
            style={{
              borderColor: listening ? COLORS.accent : COLORS.border,
              background: listening ? 'rgba(84,231,255,0.12)' : 'rgba(255,255,255,0.02)',
              boxShadow: listening ? '0 0 18px rgba(84,231,255,0.22)' : 'none',
            }}
          >
            {listening ? <MicOff size={15} color={COLORS.accent} /> : <Mic size={15} color={COLORS.textMuted} />}
          </button>
          <button
            type="submit"
            disabled={asking}
            className="shrink-0 rounded-full px-5 py-2 ml-2 text-xs font-bold uppercase tracking-[0.18em] transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-40"
            style={{ background: COLORS.accent, color: COLORS.bg0 }}
          >
            {asking ? '…' : 'Send'}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all" style={{ height: focused || listening ? 6 + h * 5 : 4, background: focused || listening ? COLORS.accent : COLORS.textFaint, opacity: focused || listening ? 0.8 : 0.35 }} />
          ))}
        </div>
      </form>
    </div>
  );
}
