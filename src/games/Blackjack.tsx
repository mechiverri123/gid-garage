import { useState } from 'react';

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

type Card = { r: string; s: string };

function cardLabel(c: Card) {
  return `${c.r}${c.s}`;
}

function DealtCard({ children, index, faceDown }: { children: React.ReactNode; index: number; faceDown?: boolean }) {
  return (
    <div
      className={`w-12 h-16 rounded flex items-center justify-center text-lg border border-white/10 ${faceDown ? 'bg-zinc-700' : 'bg-black'}`}
      style={{
        animation: 'gid-deal-card 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        animationDelay: `${index * 140}ms`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </div>
  );
}

function handTotal(hand: Card[]) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.r === 'A') { total += 11; aces++; }
    else if (c.r === 'J' || c.r === 'Q' || c.r === 'K') total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export default function Blackjack() {
  const [fname, setFname] = useState('');
  const [phone, setPhone] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [spinsRemaining, setSpinsRemaining] = useState(20);
  const [bet, setBet] = useState(5);
  const [inHand, setInHand] = useState(false);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerUpCard, setDealerUpCard] = useState<Card | null>(null);
  const [dealerHand, setDealerHand] = useState<Card[] | null>(null);
  const [canDouble, setCanDouble] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

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
      setJoined(true);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function digitsOf() {
    return phone.replace(/\D/g, '');
  }

  async function deal() {
    if (busy || balance < bet || spinsRemaining <= 0) return;
    setBusy(true);
    setError(null);
    setLastResult(null);
    setDealerHand(null);
    try {
      const data = await apiGame('bj-deal', { fname: fname.trim(), phone: digitsOf(), bet });
      if (data.outcome) {
        // Resolved immediately (a natural on deal)
        applyResolution(data);
      } else {
        setPlayerHand(data.playerHand);
        setDealerUpCard(data.dealerUpCard);
        setCanDouble(data.canDouble);
        setInHand(true);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  function applyResolution(data: any) {
    setInHand(false);
    setPlayerHand(data.playerHand);
    setDealerHand(data.dealerHand);
    setBalance(data.newBalance);
    setSpinsRemaining(data.spinsRemaining);
    setLastResult(data);
  }

  async function hit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGame('bj-hit', { phone: digitsOf() });
      if (data.outcome) applyResolution(data);
      else {
        setPlayerHand(data.playerHand);
        setCanDouble(false);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function stand() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGame('bj-stand', { phone: digitsOf() });
      applyResolution(data);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function double() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGame('bj-double', { phone: digitsOf() });
      applyResolution(data);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
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
          {loading ? 'Loading…' : "Let's Play"}
        </button>
        <p className="text-white/40 text-xs text-center">No purchase necessary. Free credits, just for fun — used only to redeem in-shop promos. Balance is shared with Spin & Win.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 340 }}>
      <style>{`
        @keyframes gid-deal-card {
          from { opacity: 0; transform: translateY(-18px) scale(0.8) rotate(-4deg); }
          to { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }
      `}</style>
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 bg-zinc-800 rounded px-3 py-2 text-center">
          <span className="text-white/50 text-[10px] uppercase block">Balance</span>
          <span className="text-white font-bold text-lg">${balance}</span>
        </div>
        <div className="flex-1 bg-zinc-800 rounded px-3 py-2 text-center">
          <span className="text-white/50 text-[10px] uppercase block">Hands Left</span>
          <span className="text-white font-bold text-lg">{spinsRemaining}</span>
        </div>
      </div>

      <div className="bg-zinc-900 border-2 border-red-600 rounded-xl p-4 w-full flex flex-col items-center gap-4">
        {/* Dealer */}
        <div className="w-full">
          <p className="text-white/50 text-xs uppercase mb-1 text-center">Dealer{dealerHand ? ` · ${handTotal(dealerHand)}` : ''}</p>
          <div className="flex gap-2 justify-center">
            {inHand && dealerUpCard && !dealerHand && (
              <>
                <DealtCard index={0}>{cardLabel(dealerUpCard)}</DealtCard>
                <DealtCard index={1} faceDown>🂠</DealtCard>
              </>
            )}
            {dealerHand && dealerHand.map((c, i) => (
              <DealtCard key={i} index={i}>{cardLabel(c)}</DealtCard>
            ))}
          </div>
        </div>

        {/* Player */}
        <div className="w-full">
          <p className="text-white/50 text-xs uppercase mb-1 text-center">You{playerHand.length ? ` · ${handTotal(playerHand)}` : ''}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {playerHand.map((c, i) => (
              <DealtCard key={i} index={i}>{cardLabel(c)}</DealtCard>
            ))}
          </div>
        </div>

        {!inHand && !lastResult && (
          <>
            <div className="flex gap-2 w-full">
              {BET_OPTIONS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBet(b)}
                  disabled={busy}
                  className={`flex-1 py-2 rounded text-sm font-bold transition-colors ${bet === b ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white/60 active:bg-zinc-700'}`}
                >
                  ${b}
                </button>
              ))}
            </div>
            <button
              onClick={deal}
              disabled={busy || balance < bet || spinsRemaining <= 0}
              className="w-full bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded"
            >
              {busy ? 'Dealing…' : `Deal for $${bet}`}
            </button>
          </>
        )}

        {inHand && (
          <div className="flex gap-2 w-full">
            <button onClick={hit} disabled={busy} className="flex-1 bg-zinc-800 active:bg-zinc-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded">Hit</button>
            <button onClick={stand} disabled={busy} className="flex-1 bg-zinc-800 active:bg-zinc-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded">Stand</button>
            {canDouble && (
              <button onClick={double} disabled={busy} className="flex-1 bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded">Double</button>
            )}
          </div>
        )}

        {lastResult && (
          <button
            onClick={() => { setLastResult(null); setDealerHand(null); setPlayerHand([]); }}
            className="w-full bg-zinc-800 active:bg-zinc-700 text-white font-bold uppercase text-sm py-3 rounded"
          >
            Play Again
          </button>
        )}

        {spinsRemaining <= 0 && <p className="text-white/50 text-xs text-center">Daily hands used up — come back tomorrow!</p>}
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      </div>

      {lastResult && (
        <div className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-center">
          {lastResult.outcome === 'lose' && <p className="text-white/60 text-sm">Dealer wins this hand.</p>}
          {lastResult.outcome === 'push' && <p className="text-white/60 text-sm">Push — bet returned.</p>}
          {lastResult.outcome === 'win' && <p className="text-green-400 font-bold text-sm">You win! {lastResult.creditWin > 0 ? `+$${lastResult.creditWin} bonus credits 🍒` : ''}</p>}
          {lastResult.outcome === 'blackjack' && <p className="text-yellow-400 font-bold text-sm">Blackjack! 🎉</p>}
          {lastResult.prizeLabel && (
            <div className="flex flex-col items-center gap-2 mt-2">
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
