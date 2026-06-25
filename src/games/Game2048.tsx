import { useEffect, useRef, useState, useCallback } from 'react';

type Grid = number[][];
const SIZE = 4;

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function addRandomTile(grid: Grid): Grid {
  const empties: [number, number][] = [];
  grid.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empties.push([r, c]); }));
  if (empties.length === 0) return grid;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRow(row: number[]): { row: number[]; gained: number; moved: boolean } {
  const vals = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i++;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  const moved = out.some((v, i) => v !== row[i]);
  return { row: out, gained, moved };
}

function rotateCW(grid: Grid): Grid {
  const next = emptyGrid();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) next[c][SIZE - 1 - r] = grid[r][c];
  return next;
}

function move(grid: Grid, dir: 'up' | 'down' | 'left' | 'right'): { grid: Grid; gained: number; moved: boolean } {
  let g = grid;
  let rotations = 0;
  if (dir === 'up') rotations = 3;
  else if (dir === 'right') rotations = 2;
  else if (dir === 'down') rotations = 1;
  for (let i = 0; i < rotations; i++) g = rotateCW(g);

  let gained = 0;
  let moved = false;
  const result = g.map((row) => {
    const r = slideRow(row);
    gained += r.gained;
    if (r.moved) moved = true;
    return r.row;
  });

  let out = result;
  for (let i = 0; i < (4 - rotations) % 4; i++) out = rotateCW(out);
  return { grid: out, gained, moved };
}

function canMove(grid: Grid): boolean {
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    if (move(grid, dir).moved) return true;
  }
  return false;
}

const TILE_COLORS: Record<number, string> = {
  2: 'bg-zinc-200 text-zinc-900', 4: 'bg-zinc-300 text-zinc-900',
  8: 'bg-orange-300 text-white', 16: 'bg-orange-400 text-white',
  32: 'bg-orange-500 text-white', 64: 'bg-orange-600 text-white',
  128: 'bg-yellow-400 text-white', 256: 'bg-yellow-500 text-white',
  512: 'bg-yellow-600 text-white', 1024: 'bg-red-500 text-white',
  2048: 'bg-red-600 text-white',
};

export default function Game2048({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [grid, setGrid] = useState<Grid>(() => addRandomTile(addRandomTile(emptyGrid())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // JSX onTouchMove is passive in React, so preventDefault() there is
  // ignored. A native listener is required to actually block page scroll.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  const endedRef = useRef(false);

  const doMove = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (over) return;
    setGrid((g) => {
      const result = move(g, dir);
      if (!result.moved) return g;
      const next = addRandomTile(result.grid);
      setScore((s) => {
        const ns = s + result.gained;
        if (next.some((row) => row.some((v) => v >= 2048)) && !won) setWon(true);
        if (!canMove(next) && !endedRef.current) {
          endedRef.current = true;
          setOver(true);
          onGameEnd(ns);
        }
        return ns;
      });
      return next;
    });
  }, [over, won, onGameEnd]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      };
      if (map[e.key]) { e.preventDefault(); doMove(map[e.key]); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
    touchStart.current = null;
  }

  function reset() {
    setGrid(addRandomTile(addRandomTile(emptyGrid())));
    setScore(0);
    setOver(false);
    setWon(false);
    endedRef.current = false;
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full select-none">
      <div className="flex items-center gap-4">
        <div className="bg-zinc-800 px-4 py-2 rounded text-white font-bold">Score: {score}</div>
        <button onClick={reset} className="bg-red-600 active:bg-red-700 text-white font-bold px-4 py-2 rounded text-sm">New Game</button>
      </div>
      <div
        ref={wrapperRef}
        className="relative bg-zinc-900 p-2 rounded-lg touch-none"
        style={{ width: 'min(92vw, 360px)' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid grid-cols-4 gap-2">
          {grid.flatMap((row, r) => row.map((v, c) => (
            <div
              key={`${r}-${c}`}
              className={`aspect-square rounded flex items-center justify-center font-extrabold text-lg sm:text-xl ${v ? TILE_COLORS[v] ?? 'bg-purple-700 text-white' : 'bg-zinc-800'}`}
            >
              {v !== 0 && v}
            </div>
          )))}
        </div>
        {(over || won) && (
          <div className="absolute inset-0 bg-black/85 rounded-lg flex flex-col items-center justify-center gap-3">
            <p className="text-white font-bold">{won ? 'You hit 2048! 🎉' : 'No more moves'} — Score: {score}</p>
            <button onClick={reset} className="bg-red-600 active:bg-red-700 text-white font-bold px-5 py-3 rounded">Play Again</button>
          </div>
        )}
      </div>
      <p className="text-white/50 text-xs">Swipe (or arrow keys) to merge tiles</p>
    </div>
  );
}
