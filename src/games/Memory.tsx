import { useEffect, useState } from 'react';

const ICONS = ['🚗', '🔧', '🛞', '🔋', '⚡', '🛠️', '🚙', '🧰'];

function shuffled(): { id: number; icon: string }[] {
  const pairs = [...ICONS, ...ICONS].map((icon, i) => ({ id: i, icon }));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

export default function Memory({ onGameEnd }: { onGameEnd: (moves: number) => void }) {
  const [cards, setCards] = useState(shuffled());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const ended = matched.length === cards.length;

  useEffect(() => {
    if (ended) onGameEnd(moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  function handleFlip(idx: number) {
    if (locked || flipped.includes(idx) || matched.includes(idx) || flipped.length === 2) return;
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setLocked(true);
      setMoves((m) => m + 1);
      const [a, b] = next;
      if (cards[a].icon === cards[b].icon) {
        setTimeout(() => {
          setMatched((m) => [...m, a, b]);
          setFlipped([]);
          setLocked(false);
        }, 400);
      } else {
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 700);
      }
    }
  }

  function reset() {
    setCards(shuffled());
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setLocked(false);
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full select-none">
      <div className="flex items-center gap-4">
        <div className="bg-zinc-800 px-4 py-2 rounded text-white font-bold">Moves: {moves}</div>
        <button onClick={reset} className="bg-red-600 active:bg-red-700 text-white font-bold px-4 py-2 rounded text-sm">Reset</button>
      </div>
      <div className="relative" style={{ width: 'min(92vw, 380px)' }}>
        <div className="grid grid-cols-4 gap-2">
          {cards.map((card, idx) => {
            const isFlipped = flipped.includes(idx) || matched.includes(idx);
            return (
              <button
                key={card.id}
                onClick={() => handleFlip(idx)}
                className={`aspect-square rounded-lg flex items-center justify-center text-2xl sm:text-3xl transition-colors ${isFlipped ? 'bg-red-600' : 'bg-zinc-800 active:bg-zinc-700'}`}
              >
                {isFlipped ? card.icon : ''}
              </button>
            );
          })}
        </div>
        {ended && (
          <div className="absolute inset-0 bg-black/85 rounded-lg flex flex-col items-center justify-center gap-3">
            <p className="text-white font-bold">Solved in {moves} moves! 🎉</p>
            <button onClick={reset} className="bg-red-600 active:bg-red-700 text-white font-bold px-5 py-3 rounded">Play Again</button>
          </div>
        )}
      </div>
      <p className="text-white/50 text-xs">Tap two cards to find a match</p>
    </div>
  );
}
