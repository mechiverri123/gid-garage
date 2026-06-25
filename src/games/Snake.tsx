import { useEffect, useRef, useState, useCallback } from 'react';

const GRID = 18;
const CELL = 18;
const SIZE = GRID * CELL;
const SPEED_MS = 110;

type Pt = { x: number; y: number };

function randCell(exclude: Pt[]): Pt {
  let p: Pt;
  do {
    p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (exclude.some((e) => e.x === p.x && e.y === p.y));
  return p;
}

export default function Snake({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Pt[]>([{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }]);
  const dirRef = useRef<Pt>({ x: 1, y: 0 });
  const nextDirRef = useRef<Pt>({ x: 1, y: 0 });
  const foodRef = useRef<Pt>(randCell(snakeRef.current));
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#dc2626';
    snakeRef.current.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#ef4444' : '#dc2626';
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.fillStyle = '#fafafa';
    const f = foodRef.current;
    ctx.beginPath();
    ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL / 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const reset = useCallback(() => {
    snakeRef.current = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    foodRef.current = randCell(snakeRef.current);
    setScore(0);
    setOver(false);
    setStarted(true);
    draw();
  }, [draw]);

  useEffect(() => {
    draw();
    if (!started || over) return;
    const id = setInterval(() => {
      dirRef.current = nextDirRef.current;
      const head = snakeRef.current[0];
      const newHead = { x: head.x + dirRef.current.x, y: head.y + dirRef.current.y };

      if (
        newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID ||
        snakeRef.current.some((p) => p.x === newHead.x && p.y === newHead.y)
      ) {
        setOver(true);
        onGameEnd(score);
        return;
      }

      const ate = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const newSnake = [newHead, ...snakeRef.current];
      if (ate) {
        foodRef.current = randCell(newSnake);
        setScore((s) => s + 1);
      } else {
        newSnake.pop();
      }
      snakeRef.current = newSnake;
      draw();
    }, SPEED_MS);
    return () => clearInterval(id);
  }, [started, over, draw, onGameEnd, score]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = dirRef.current;
      const map: Record<string, Pt> = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      };
      const nd = map[e.key];
      if (nd && !(nd.x === -d.x && nd.y === -d.y)) {
        e.preventDefault();
        nextDirRef.current = nd;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  const wrapperRef = useRef<HTMLDivElement>(null);

  // React's JSX onTouchMove is attached as a passive listener, so
  // preventDefault() inside it is silently ignored by the browser. A native
  // listener with passive:false is required to actually stop page scroll.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const d = dirRef.current;
    let nd: Pt;
    if (Math.abs(dx) > Math.abs(dy)) nd = { x: dx > 0 ? 1 : -1, y: 0 };
    else nd = { x: 0, y: dy > 0 ? 1 : -1 };
    if (!(nd.x === -d.x && nd.y === -d.y)) nextDirRef.current = nd;
    touchStart.current = null;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-white font-bold text-lg">Score: {score}</div>
      <div ref={wrapperRef} className="relative touch-none" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="border-2 border-red-600 touch-none"
          style={{ width: 'min(90vw, 360px)', height: 'min(90vw, 360px)' }}
        />
        {!started && !over && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
            <button onClick={reset} className="btn-primary">Start Snake</button>
          </div>
        )}
        {over && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3">
            <p className="text-white font-bold">Game Over — Score: {score}</p>
            <button onClick={reset} className="btn-primary">Play Again</button>
          </div>
        )}
      </div>
      <p className="text-white/50 text-xs">Arrow keys or swipe to move</p>
    </div>
  );
}
