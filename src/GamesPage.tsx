import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Gamepad2, Brain, Grid3x3, HelpCircle, Star, X, Coins, Spade } from 'lucide-react';

const Snake = lazy(() => import('./games/Snake'));
const Game2048 = lazy(() => import('./games/Game2048'));
const Memory = lazy(() => import('./games/Memory'));
const Trivia = lazy(() => import('./games/Trivia'));
const SlotMachine = lazy(() => import('./games/SlotMachine'));
const Blackjack = lazy(() => import('./games/Blackjack'));

const REVIEW_URL = 'https://g.page/r/CdERSypGqVdlEAE/review';

type GameId = 'snake' | '2048' | 'memory' | 'trivia' | 'slots' | 'blackjack';

const GAMES: { id: GameId; title: string; desc: string; icon: typeof Gamepad2 }[] = [
  { id: 'slots', title: 'Spin & Win', desc: 'Free spins — win real shop prizes', icon: Coins },
  { id: 'blackjack', title: 'Blackjack', desc: 'Beat the dealer for real prizes', icon: Spade },
  { id: 'snake', title: 'Snake', desc: 'Classic arcade — swipe to move', icon: Gamepad2 },
  { id: '2048', title: '2048', desc: 'Swipe to merge tiles to 2048', icon: Grid3x3 },
  { id: 'memory', title: 'Memory Match', desc: 'Find all the matching pairs', icon: Brain },
  { id: 'trivia', title: 'Car Trivia', desc: 'Test your auto knowledge', icon: HelpCircle },
];

function GameLoader({ id }: { id: GameId }) {
  const fallback = <div className="text-white/60 text-sm py-12">Loading game…</div>;
  const noop = () => {};
  switch (id) {
    case 'snake':
      return <Suspense fallback={fallback}><Snake onGameEnd={noop} /></Suspense>;
    case '2048':
      return <Suspense fallback={fallback}><Game2048 onGameEnd={noop} /></Suspense>;
    case 'memory':
      return <Suspense fallback={fallback}><Memory onGameEnd={noop} /></Suspense>;
    case 'trivia':
      return <Suspense fallback={fallback}><Trivia onGameEnd={noop} /></Suspense>;
    case 'slots':
      return <Suspense fallback={fallback}><SlotMachine /></Suspense>;
    case 'blackjack':
      return <Suspense fallback={fallback}><Blackjack /></Suspense>;
  }
}

export default function GamesPage() {
  const [active, setActive] = useState<GameId | null>(null);
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true);
  }

  return (
    <div className="bg-dark min-h-screen font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-black/95 border-b border-white/10 px-4 py-3 flex items-center gap-3">
        {active ? (
          <button onClick={() => setActive(null)} className="text-white/70 active:text-white p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          <a href="/" className="text-white/70 active:text-white p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </a>
        )}
        <h1 className="text-white font-extrabold text-lg uppercase tracking-wide">Waiting Room</h1>
      </header>

      <main className={`flex-1 px-4 py-6 ${!dismissed ? 'pb-24' : ''}`}>
        {!active && (
          <>
            <p className="text-white/60 text-sm mb-5">Stuck waiting on your service? Kill some time with a quick game.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 max-w-md mx-auto">
              {GAMES.map((g) => {
                const Icon = g.icon;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActive(g.id)}
                    className="bg-zinc-900 active:bg-zinc-800 border border-white/10 rounded-xl p-4 flex flex-col items-start gap-2 text-left transition-colors"
                  >
                    <Icon className="w-7 h-7 text-red-500" />
                    <span className="text-white font-bold text-sm">{g.title}</span>
                    <span className="text-white/50 text-xs leading-snug">{g.desc}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {active && (
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md flex items-center justify-between mb-4">
              <h2 className="text-white font-bold uppercase tracking-wide text-sm">
                {GAMES.find((g) => g.id === active)?.title}
              </h2>
              <button onClick={() => setActive(null)} className="text-white/60 active:text-white p-2 flex items-center gap-1 text-xs font-semibold uppercase">
                <X className="w-4 h-4" /> Close
              </button>
            </div>
            <GameLoader id={active} />
          </div>
        )}
      </main>

      {!dismissed && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-zinc-900 border-t border-white/10 px-4 py-3 flex items-center gap-3">
          <div className="flex text-yellow-400 flex-shrink-0">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}
          </div>
          <p className="text-white/70 text-xs flex-1 leading-snug">Enjoying the wait? A quick review helps us a ton.</p>
          <a
            href={REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-red-600 active:bg-red-700 text-white font-bold text-xs uppercase px-3 py-2 rounded flex-shrink-0"
          >
            Review
          </a>
          <button onClick={dismiss} className="text-white/40 active:text-white p-1 flex-shrink-0" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
