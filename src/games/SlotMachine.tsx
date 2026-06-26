import { useState, useRef } from 'react';

const SYMBOLS = ['🍒', '🔧', '🛞', '⚡', '🛢️'];
const BET_OPTIONS = [1, 5, 10, 20];

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

type SpinResult = {
  result: 'lose' | 'credit' | 'real';
  creditWin: number;
  prizeLabel: string | null;
  code: string | null;
  newBalance: number;
  spinsRemaining: number;
};

export default function SlotMachine() {
  const [fname, setFname] = useState('');
  const [phone, setPhone] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [spinsRemaining, setSpinsRemaining] = useState(25);
  const [isNew, setIsNew] = useState(false);
  const [bet, setBet] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState(['🍒', '🍒', '🍒']);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const spinTimer = useRef<number | null>(null);

  async function handleJoin() {
    const digits = phone.replace(/\D/g, '');
    if (!fname.trim() || digits.length < 10) {
      setError('Enter your first name and a valid phone number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGame('state', { fname: fname.trim(), phone: digits });
      setBalance(data.balance);
      setSpinsRemaining(data.spinsRemaining);
      setIsNew(data.isNew);
      setJoined(true);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function spin() {
    if (spinning || balance < bet || spinsRemaining <= 0) return;
    setSpinning(true);
    setError(null);
    setLastResult(null);

    // Visual reel spin while the server call resolves underneath.
    let ticks = 0;
    spinTimer.current = window.setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
      ticks++;
    }, 80);

    const digits = phone.replace(/\D/g, '');
    apiGame('spin', { fname: fname.trim(), phone: digits, bet })
      .then((data: SpinResult) => {
        // Let the reel "spin" for a beat, then land on a symbol set that
        // reflects the actual result for a satisfying reveal.
        setTimeout(() => {
          if (spinTimer.current) clearInterval(spinTimer.current);
          let final: string[];
          if (data.result === 'real') final = ['🛢️', '🛢️', '🛢️'];
          else if (data.result === 'credit') final = ['🍒', '🍒', '🍒'];
          else {
            final = [
              SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
              SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
              SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            ];
            // make sure "lose" doesn't accidentally show a triple match
            if (final[0] === final[1] && final[1] === final[2]) final[2] = SYMBOLS[(SYMBOLS.indexOf(final[2]) + 1) % SYMBOLS.length];
          }
          setReels(final);
          setBalance(data.newBalance);
          setSpinsRemaining(data.spinsRemaining);
          setLastResult(data);
          setSpinning(false);
        }, 900);
      })
      .catch((e: Error) => {
        if (spinTimer.current) clearInterval(spinTimer.current);
        setError(e.message);
        setSpinning(false);
      });
  }

  if (!joined) {
    return (
      <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 340 }}>
        <p className="text-white/70 text-sm text-center">Enter your info to grab your free spin credits</p>
        <input
          value={fname}
          onChange={(e) => setFname(e.target.value)}
          placeholder="First name"
          className="w-full bg-zinc-900 border border-white/10 rounded px-4 py-3 text-white text-base"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          type="tel"
          className="w-full bg-zinc-900 border border-white/10 rounded px-4 py-3 text-white text-base"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full bg-red-600 active:bg-red-700 disabled:opacity-50 text-white font-bold uppercase text-sm px-5 py-3 rounded"
        >
          {loading ? 'Loading…' : 'Let\'s Play'}
        </button>
        <p className="text-white/40 text-xs text-center">No purchase necessary. Free credits, just for fun — used only to redeem in-shop promos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 340 }}>
      {isNew && <p className="text-green-400 text-xs font-semibold">Welcome, {fname}! You got ${balance} in free spin credits 🎉</p>}
      {!isNew && <p className="text-white/60 text-xs">Welcome back, {fname}!</p>}

      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 bg-zinc-800 rounded px-3 py-2 text-center">
          <span className="text-white/50 text-[10px] uppercase block">Balance</span>
          <span className="text-white font-bold text-lg">${balance}</span>
        </div>
        <div className="flex-1 bg-zinc-800 rounded px-3 py-2 text-center">
          <span className="text-white/50 text-[10px] uppercase block">Spins Left</span>
          <span className="text-white font-bold text-lg">{spinsRemaining}</span>
        </div>
      </div>

      <div className="bg-zinc-900 border-2 border-red-600 rounded-xl p-5 w-full flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {reels.map((sym, i) => (
            <div key={i} className="w-16 h-16 bg-black rounded-lg flex items-center justify-center text-3xl border border-white/10">
              {sym}
            </div>
          ))}
        </div>

        <div className="flex gap-2 w-full">
          {BET_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => setBet(b)}
              disabled={spinning}
              className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${bet === b ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white/60 active:bg-zinc-700'}`}
            >
              ${b}
            </button>
          ))}
        </div>

        <button
          onClick={spin}
          disabled={spinning || balance < bet || spinsRemaining <= 0}
          className="w-full bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded"
        >
          {spinning ? 'Spinning…' : `Spin for $${bet}`}
        </button>

        {spinsRemaining <= 0 && <p className="text-white/50 text-xs text-center">Daily spins used up — come back tomorrow for more!</p>}
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      </div>

      {lastResult && !spinning && (
        <div className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-center">
          {lastResult.result === 'lose' && <p className="text-white/60 text-sm">No match — try again!</p>}
          {lastResult.result === 'credit' && <p className="text-green-400 font-bold text-sm">You won ${lastResult.creditWin} in credits! 🍒</p>}
          {lastResult.result === 'real' && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-yellow-400 font-bold">🎉 You won: {lastResult.prizeLabel}</p>
              <p className="text-white text-sm">Show this code at GID Garage to redeem:</p>
              <p className="text-white font-mono font-extrabold text-2xl tracking-widest bg-black px-4 py-2 rounded">{lastResult.code}</p>
              <p className="text-white/40 text-xs">Screenshot this — you'll need it at checkout.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
