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
type HandState = { cards: Card[]; total?: number; bet: number; status?: string; isAceSplit?: boolean; outcome?: string; creditWin?: number; prizeLabel?: string | null; code?: string | null };

function cardLabel(c: Card) {
  return `${c.r}${c.s}`;
}

function isRedSuit(s: string) {
  return s === '♥' || s === '♦';
}

function DealtCard({ children, index, faceDown, red }: { children: React.ReactNode; index: number; faceDown?: boolean; red?: boolean }) {
  if (faceDown) {
    return (
      <div
        className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-white/20 bg-red-700"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 10px)',
          animation: 'gid-deal-card 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          animationDelay: `${index * 220}ms`,
          animationFillMode: 'both',
        }}
      />
    );
  }
  return (
    <div
      className={`w-16 h-24 sm:w-20 sm:h-28 rounded-lg bg-white flex items-center justify-center text-2xl sm:text-3xl font-extrabold shadow-lg ${red ? 'text-red-600' : 'text-zinc-900'}`}
      style={{
        animation: 'gid-deal-card 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        animationDelay: `${index * 220}ms`,
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

function outcomeLabel(outcome?: string) {
  if (outcome === 'win') return { text: 'Win', className: 'text-green-400' };
  if (outcome === 'blackjack') return { text: 'Blackjack! 3:2', className: 'text-yellow-400' };
  if (outcome === 'push') return { text: 'Push', className: 'text-white/60' };
  return { text: 'Lose', className: 'text-white/60' };
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
  const [hands, setHands] = useState<HandState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dealerUpCard, setDealerUpCard] = useState<Card | null>(null);
  const [dealerHand, setDealerHand] = useState<Card[] | null>(null);
  const [canDouble, setCanDouble] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ hands: HandState[]; dealerHand: Card[]; dealerTotal: number } | null>(null);

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

  function applyMidHand(data: any) {
    setHands(data.hands);
    setActiveIndex(data.activeIndex);
    setDealerUpCard(data.dealerUpCard);
    setCanDouble(data.canDouble);
    setCanSplit(data.canSplit);
    if (typeof data.newBalance === 'number') setBalance(data.newBalance);
    if (typeof data.spinsRemaining === 'number') setSpinsRemaining(data.spinsRemaining);
    setInHand(true);
  }

  function applyResolution(data: any) {
    setInHand(false);
    setHands(data.hands);
    setDealerHand(data.dealerHand);
    setBalance(data.newBalance);
    setSpinsRemaining(data.spinsRemaining);
    setLastResult(data);
  }

  async function deal() {
    if (busy || balance < bet || spinsRemaining <= 0) return;
    setBusy(true);
    setError(null);
    setLastResult(null);
    setDealerHand(null);
    try {
      const data = await apiGame('bj-deal', { fname: fname.trim(), phone: digitsOf(), bet });
      if (data.dealerHand) applyResolution(data); // resolved immediately (a natural)
      else applyMidHand(data);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function hit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGame('bj-hit', { phone: digitsOf() });
      if (data.dealerHand) applyResolution(data);
      else applyMidHand(data);
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
      if (data.dealerHand) applyResolution(data);
      else applyMidHand(data);
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
      if (data.dealerHand) applyResolution(data);
      else applyMidHand(data);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function split() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGame('bj-split', { phone: digitsOf() });
      if (data.dealerHand) applyResolution(data); // split aces resolved immediately
      else applyMidHand(data);
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

  const activeHand = hands[activeIndex];

  return (
    <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 380 }}>
      <style>{`
        @keyframes gid-deal-card {
          0% { opacity: 0; transform: translateY(-40px) scale(0.6) rotate(-10deg); }
          70% { opacity: 1; transform: translateY(3px) scale(1.06) rotate(2deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
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
                <DealtCard index={0} red={isRedSuit(dealerUpCard.s)}>{cardLabel(dealerUpCard)}</DealtCard>
                <DealtCard index={1} faceDown>🂠</DealtCard>
              </>
            )}
            {dealerHand && dealerHand.map((c, i) => (
              <DealtCard key={i} index={i} red={isRedSuit(c.s)}>{cardLabel(c)}</DealtCard>
            ))}
          </div>
        </div>

        {/* Player hand(s) — two side by side after a split */}
        <div className="w-full flex gap-3 justify-center flex-wrap">
          {(inHand ? hands : lastResult?.hands ?? []).map((h, hi) => (
            <div key={hi} className={`flex flex-col items-center gap-1 ${inHand && hands.length > 1 ? (hi === activeIndex ? 'opacity-100' : 'opacity-50') : ''}`}>
              <p className="text-white/50 text-xs uppercase">
                {hands.length > 1 || (lastResult?.hands?.length ?? 0) > 1 ? `Hand ${hi + 1} · ` : 'You · '}
                {h.total ?? handTotal(h.cards)}
                {hi === activeIndex && inHand && hands.length > 1 ? ' ▾' : ''}
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                {h.cards.map((c, i) => (
                  <DealtCard key={i} index={i} red={isRedSuit(c.s)}>{cardLabel(c)}</DealtCard>
                ))}
              </div>
              {!inHand && h.outcome && (
                <p className={`text-xs font-bold ${outcomeLabel(h.outcome).className}`}>{outcomeLabel(h.outcome).text}</p>
              )}
            </div>
          ))}
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
              <button onClick={double} disabled={busy || balance < (activeHand?.bet ?? bet)} className="flex-1 bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded">Double</button>
            )}
            {canSplit && (
              <button onClick={split} disabled={busy || balance < (activeHand?.bet ?? bet)} className="flex-1 bg-red-600 active:bg-red-700 disabled:opacity-40 text-white font-bold uppercase text-sm py-3 rounded">Split</button>
            )}
          </div>
        )}

        {lastResult && (
          <button
            onClick={() => { setLastResult(null); setDealerHand(null); setHands([]); }}
            className="w-full bg-zinc-800 active:bg-zinc-700 text-white font-bold uppercase text-sm py-3 rounded"
          >
            Play Again
          </button>
        )}

        {spinsRemaining <= 0 && <p className="text-white/50 text-xs text-center">Daily hands used up — come back tomorrow!</p>}
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      </div>

      {lastResult && lastResult.hands.some((h) => h.prizeLabel) && (
        <div className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-center flex flex-col gap-3">
          {lastResult.hands.filter((h) => h.prizeLabel).map((h, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <p className="text-yellow-400 font-bold">🎉 You won: {h.prizeLabel}</p>
              <p className="text-white text-sm">Show this code at GID Garage to redeem:</p>
              <p className="text-white font-mono font-extrabold text-2xl tracking-widest bg-black px-4 py-2 rounded">{h.code}</p>
              <p className="text-white/40 text-xs">Screenshot this — you'll need it at checkout.</p>
            </div>
          ))}
        </div>
      )}
      {lastResult && lastResult.hands.some((h) => (h.creditWin ?? 0) > 0) && (
        <p className="text-green-400 font-bold text-sm">
          +${lastResult.hands.reduce((s, h) => s + (h.creditWin ?? 0), 0)} bonus credits 🍒
        </p>
      )}
    </div>
  );
}
