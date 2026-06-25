import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Gamepad2, Brain, Grid3x3, HelpCircle, Star, X } from 'lucide-react';

const Snake = lazy(() => import('./games/Snake'));
const Game2048 = lazy(() => import('./games/Game2048'));
const Memory = lazy(() => import('./games/Memory'));
const Trivia = lazy(() => import('./games/Trivia'));

const REVIEW_URL = 'https://g.page/r/CdERSypGqVdlEAE/review';

type GameId = 'snake' | '2048' | 'memory' | 'trivia';

const GAMES: { id: GameId; title: string; desc: string; icon: typeof Gamepad2 }[] = [
  { id: 'snake', title: 'Snake', desc: 'Classic arcade — swipe to move', icon: Gamepad2 },
  { id: '2048', title: '2048', desc: 'Swipe to merge tiles to 2048', icon: Grid3x3 },
  { id: 'memory', title: 'Memory Match', desc: 'Find all the matching pairs', icon: Brain },
  { id: 'trivia', title: 'Car Trivia', desc: 'Test your auto knowledge', icon: HelpCircle },
];

function GameLoader({ id, onGameEnd }: { id: GameId; onGameEnd: () => void }) {
  const fallback = <div className="text-white/60 text-sm py-12">Loading game…</div>;
  switch (id) {
    case 'snake':
      return <Suspense fallback={fallback}><Snake onGameEnd={onGameEnd} /></Suspense>;
    case '2048':
      return <Suspense fallback={fallback}><Game2048 onGameEnd={onGameEnd} /></Suspense>;
    case 'memory':
      return <Suspense fallback={fallback}><Memory onGameEnd={onGameEnd} /></Suspense>;
    case 'trivia':
      return <Suspense fallback={fallback}><Trivia onGameEnd={onGameEnd} /></Suspense>;
  }
}

export default function GamesPage() {
  const [active, setActive] = useState<GameId | null>(null);
  const [showReview, setShowReview] = useState(false);

  return (
    <div className="bg-dark min-h-screen font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-black/95 border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <a href="/" className="text-white/70 active:text-white p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <h1 className="text-white font-extrabold text-lg uppercase tracking-wide">Waiting Room</h1>
      </header>

      <main className="flex-1 px-4 py-6">
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
            <GameLoader id={active} onGameEnd={() => setShowReview(true)} />
          </div>
        )}
      </main>

      {showReview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-20 px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 max-w-sm w-full text-center flex flex-col items-center gap-3">
            <div className="flex gap-1 text-yellow-400">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-6 h-6 fill-current" />)}
            </div>
            <p className="text-white font-bold">Nice round!</p>
            <p className="text-white/60 text-sm">Waiting on your car shouldn't be boring. If you're enjoying GID Garage, a quick review helps a ton.</p>
            <a
              href={REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full justify-center mt-1"
              onClick={() => setShowReview(false)}
            >
              Leave a Review
            </a>
            <button onClick={() => setShowReview(false)} className="text-white/50 text-xs font-semibold uppercase tracking-wide py-2">
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
