import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { COLORS } from '../tokens';
import { ActivityFeed } from './ActivityFeed';
import { Workspace } from './Workspace';
import type { ActivityItem, ChatMsg } from '../types';

type RecognitionError = {
  error?: string;
  message?: string;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onnomatch?: (() => void) | null;
};

type DictationState = 'idle' | 'starting' | 'listening' | 'blocked' | 'unsupported' | 'error' | 'captured';

function isLocalhost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function supportStatus() {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return { ok: false, reason: 'Speech recognition is not supported in this browser.' };
  if (!window.isSecureContext && !isLocalhost()) {
    return { ok: false, reason: 'Dictation needs HTTPS (or localhost) to access your microphone.' };
  }
  return { ok: true, reason: '' };
}

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
  const [dictationState, setDictationState] = useState<DictationState>('idle');
  const [dictationMessage, setDictationMessage] = useState('Click the mic and speak your command.');
  const [dictationSupported, setDictationSupported] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const statusTimeoutRef = useRef<number | null>(null);

  function clearStatusLater(nextMessage = 'Click the mic and speak your command.') {
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = window.setTimeout(() => {
      setDictationState('idle');
      setDictationMessage(nextMessage);
    }, 2400);
  }

  function composeTranscript(finalText: string, interimText: string) {
    return `${finalText}${interimText ? ` ${interimText}` : ''}`.trim();
  }

  async function ensureMicrophoneReady() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  }

  useEffect(() => {
    const support = supportStatus();
    setDictationSupported(support.ok);
    if (!support.ok) {
      setDictationState('unsupported');
      setDictationMessage(support.reason);
      return;
    }

    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    const r: Recognition = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;

    r.onstart = () => {
      setListening(true);
      setDictationState('listening');
      setDictationMessage('Listening… Speak naturally, then tap the mic again to stop.');
    };

    r.onresult = (event: any) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalChunk += text;
        else interimChunk += text;
      }

      if (finalChunk) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalChunk}`.trim();
      }
      interimTranscriptRef.current = interimChunk.trim();
      setQuery(composeTranscript(finalTranscriptRef.current, interimTranscriptRef.current));
    };

    r.onerror = (event: RecognitionError) => {
      setListening(false);
      const code = event?.error || 'error';
      const map: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked. Allow mic access for this site.',
        'service-not-allowed': 'Speech service was blocked by the browser.',
        'audio-capture': 'No microphone was found.',
        'no-speech': 'No speech was detected. Try again and speak a little closer to the mic.',
        'network': 'Speech recognition hit a network error.',
        'aborted': 'Dictation stopped.',
      };
      const message = map[code] || event?.message || 'Dictation failed.';
      setDictationState(code === 'not-allowed' || code === 'service-not-allowed' ? 'blocked' : 'error');
      setDictationMessage(message);
      if (code !== 'aborted') clearStatusLater();
    };

    r.onend = () => {
      setListening(false);
      const transcript = composeTranscript(finalTranscriptRef.current, '');
      if (transcript) {
        setQuery(transcript);
        setDictationState('captured');
        setDictationMessage('Captured. Edit if needed, then press Send.');
        clearStatusLater('Edit your captured command or press Send.');
      } else if (dictationState !== 'blocked' && dictationState !== 'error') {
        setDictationState('idle');
        setDictationMessage('Click the mic and speak your command.');
      }
      interimTranscriptRef.current = '';
    };

    r.onnomatch = () => {
      setDictationState('error');
      setDictationMessage('I heard audio but could not recognize clear speech.');
      clearStatusLater();
    };

    recognitionRef.current = r;
    return () => {
      try { r.abort(); } catch {}
      if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = query.trim();
    if (!clean || asking) return;
    onAsk(clean);
    setQuery('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setDictationState('idle');
    setDictationMessage('Click the mic and speak your command.');
  }

  async function toggleDictation() {
    const r = recognitionRef.current;
    if (!r || asking) return;
    if (listening) {
      try { r.stop(); } catch {}
      return;
    }

    try {
      finalTranscriptRef.current = query.trim();
      interimTranscriptRef.current = '';
      setDictationState('starting');
      setDictationMessage('Starting microphone…');
      await ensureMicrophoneReady();
      try { r.abort(); } catch {}
      setTimeout(() => {
        try { r.start(); } catch {
          setListening(false);
          setDictationState('error');
          setDictationMessage('Could not start dictation. Try again.');
          clearStatusLater();
        }
      }, 80);
    } catch {
      setListening(false);
      setDictationState('blocked');
      setDictationMessage('Microphone permission was denied. Allow mic access and try again.');
      clearStatusLater('Allow microphone access to use dictation.');
    }
  }

  const active = focused || listening;
  const statusColor = dictationState === 'blocked' || dictationState === 'error'
    ? COLORS.warning
    : dictationState === 'listening' || dictationState === 'starting' || dictationState === 'captured'
      ? COLORS.accent
      : COLORS.textFaint;

  return (
    <div className="max-w-[1320px] mx-auto w-full">
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

      <div className="flex items-center justify-center gap-4 mb-2 text-[11px]" style={{ color: statusColor }}>
        <div className="flex items-center gap-2">
          {(dictationState === 'blocked' || dictationState === 'error') && <AlertCircle size={13} />}
          <span>{dictationMessage}</span>
        </div>
      </div>

      <form onSubmit={submit} className="flex items-center justify-center gap-3">
        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 3, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all duration-150" style={{ height: active ? 6 + h * 4 : 4, background: active ? COLORS.accent : COLORS.textFaint, opacity: active ? 0.85 : 0.28 }} />
          ))}
        </div>

        <div
          className="relative flex-1 max-w-[980px] flex items-center rounded-full px-5 py-3 transition-all overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(11,24,39,0.98) 0%, rgba(6,14,24,0.96) 100%)',
            border: `1px solid ${active ? COLORS.borderStrong : COLORS.border}`,
            boxShadow: active ? '0 0 34px rgba(84,231,255,0.2), inset 0 0 0 1px rgba(84,231,255,0.08), inset 0 -18px 36px rgba(84,231,255,0.06)' : 'inset 0 0 0 1px rgba(84,231,255,0.04), inset 0 -16px 26px rgba(0,0,0,0.18)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'linear-gradient(90deg, transparent, rgba(84,231,255,0.05), transparent)' }} />
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full" style={{ background: 'radial-gradient(circle, rgba(84,231,255,0.12), transparent 70%)' }} />
          <div className="mr-4 shrink-0 relative z-10">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: COLORS.accent }}>GID</div>
            <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>{listening ? 'Listening to Michael' : 'Owner Command'}</div>
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Catch me up. How are my ads doing? Move John's brakes to Thursday."
            className="relative z-10 flex-1 bg-transparent text-[#F5F8FA] placeholder-[#52616D] text-sm outline-none min-w-0"
          />
          <button
            type="button"
            onClick={toggleDictation}
            disabled={!dictationSupported || asking}
            title={dictationSupported ? (listening ? 'Stop dictation' : 'Start dictation') : 'Browser dictation is not supported here'}
            className="relative z-10 shrink-0 w-11 h-11 ml-2 rounded-full border flex items-center justify-center transition-all disabled:opacity-25"
            style={{
              borderColor: listening ? COLORS.accent : COLORS.border,
              background: listening ? 'rgba(84,231,255,0.12)' : 'rgba(255,255,255,0.02)',
              boxShadow: listening ? '0 0 18px rgba(84,231,255,0.22)' : 'inset 0 0 0 1px rgba(84,231,255,0.04)',
            }}
          >
            {listening ? <MicOff size={15} color={COLORS.accent} /> : <Mic size={15} color={COLORS.textMuted} />}
          </button>
          <button
            type="submit"
            disabled={asking}
            className="relative z-10 shrink-0 rounded-full px-5 py-2 ml-2 text-xs font-bold uppercase tracking-[0.18em] transition-all hover:-translate-y-px active:scale-[0.98] disabled:opacity-40"
            style={{ background: COLORS.accent, color: COLORS.bg0, boxShadow: '0 0 18px rgba(84,231,255,0.22)' }}
          >
            {asking ? '…' : 'Send'}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {[0, 1, 2, 3, 2, 1, 0].map((h, i) => (
            <span key={i} className="w-0.5 rounded-full transition-all duration-150" style={{ height: active ? 6 + h * 4 : 4, background: active ? COLORS.accent : COLORS.textFaint, opacity: active ? 0.85 : 0.28 }} />
          ))}
        </div>
      </form>
    </div>
  );
}
