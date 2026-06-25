import { useState } from 'react';

async function apiGame(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/api-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

export default function GameRedeem() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; win?: any } | null>(null);

  async function lookup() {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await apiGame('redeem', { code: code.trim() });
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    }
    setLoading(false);
  }

  return (
    <div className="bg-dark min-h-screen flex flex-col items-center px-4 py-10 font-sans">
      <h1 className="text-white font-extrabold text-xl uppercase mb-1">Redeem Game Code</h1>
      <p className="text-white/50 text-sm mb-6">Staff only — type the customer's 6-digit code</p>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="000000"
          inputMode="numeric"
          className="w-full bg-zinc-900 border border-white/10 rounded px-4 py-4 text-white text-center text-2xl font-mono tracking-widest"
        />
        <button
          onClick={lookup}
          disabled={loading || code.length !== 6}
          className="bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded"
        >
          {loading ? 'Checking…' : 'Look Up & Redeem'}
        </button>

        {result && !result.ok && (
          <div className="bg-zinc-900 border border-red-700 rounded-lg p-4 text-center">
            <p className="text-red-400 font-bold text-sm">{result.error}</p>
            {result.win && (
              <p className="text-white/50 text-xs mt-1">
                {result.win.prize_label} — already redeemed {result.win.redeemed_at ? `on ${new Date(result.win.redeemed_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' })}` : ''}
              </p>
            )}
          </div>
        )}

        {result && result.ok && result.win && (
          <div className="bg-zinc-900 border border-green-700 rounded-lg p-4 text-center">
            <p className="text-green-400 font-bold text-sm mb-1">✓ Valid — now marked redeemed</p>
            <p className="text-white font-bold">{result.win.prize_label}</p>
            <p className="text-white/50 text-xs mt-1">{result.win.fname} · {result.win.phone}</p>
            <p className="text-white/30 text-[11px] mt-2">Apply this manually in the invoice builder.</p>
          </div>
        )}
      </div>

      <a href="/admin" className="text-white/30 text-xs mt-8 hover:text-white/60">← Back to Admin</a>
    </div>
  );
}
