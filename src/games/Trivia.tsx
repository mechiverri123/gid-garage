import { useState } from 'react';

const QUESTIONS = [
  { q: 'What does "OBD" stand for in OBD2 scanners?', a: ['On-Board Diagnostics', 'Oil Brake Detector', 'Outside Body Damage', 'Optimal Battery Drain'], correct: 0 },
  { q: 'How often should most cars get an oil change (full synthetic)?', a: ['Every 1,000 mi', 'Every 5,000–7,500 mi', 'Every 20,000 mi', 'Never'], correct: 1 },
  { q: 'Which part wears out and commonly causes a squealing noise when braking?', a: ['Spark plugs', 'Brake pads', 'Alternator', 'Radiator cap'], correct: 1 },
  { q: 'What does a check engine light most often indicate first?', a: ['Flat tire', 'A stored diagnostic trouble code', 'Low windshield fluid', 'Dead radio'], correct: 1 },
  { q: 'What is the job of a car\'s alternator?', a: ['Cools the engine', 'Recharges the battery while running', 'Controls the brakes', 'Steers the wheels'], correct: 1 },
  { q: 'Struts and shocks are part of which system?', a: ['Exhaust', 'Suspension', 'Fuel injection', 'Audio'], correct: 1 },
  { q: 'What does CV in "CV axle" stand for?', a: ['Constant Velocity', 'Center Vehicle', 'Cylinder Valve', 'Cold Vacuum'], correct: 0 },
  { q: 'Tie rods primarily affect which of these?', a: ['Air conditioning', 'Steering and alignment', 'Fuel economy gauge', 'Radio reception'], correct: 1 },
];

export default function Trivia({ onGameEnd }: { onGameEnd: (score: number, total: number) => void }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const q = QUESTIONS[idx];

  function pick(i: number) {
    if (selected !== null) return;
    setSelected(i);
    const correct = i === q.correct;
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      if (idx + 1 < QUESTIONS.length) {
        setIdx((n) => n + 1);
        setSelected(null);
      } else {
        setDone(true);
        onGameEnd(correct ? score + 1 : score, QUESTIONS.length);
      }
    }, 650);
  }

  function reset() {
    setIdx(0);
    setScore(0);
    setSelected(null);
    setDone(false);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-white font-bold text-lg">You scored {score} / {QUESTIONS.length}! 🔧</p>
        <button onClick={reset} className="bg-red-600 active:bg-red-700 text-white font-bold px-5 py-3 rounded">Play Again</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 380 }}>
      <div className="bg-zinc-800 px-4 py-2 rounded text-white font-bold text-sm">
        Question {idx + 1} / {QUESTIONS.length} · Score: {score}
      </div>
      <div className="w-full bg-zinc-900 rounded-lg p-4">
        <p className="text-white font-bold mb-4 leading-snug">{q.q}</p>
        <div className="flex flex-col gap-2">
          {q.a.map((ans, i) => {
            let style = 'bg-zinc-800 active:bg-zinc-700 text-white';
            if (selected !== null) {
              if (i === q.correct) style = 'bg-green-600 text-white';
              else if (i === selected) style = 'bg-red-700 text-white';
              else style = 'bg-zinc-800 text-white/40';
            }
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={selected !== null}
                className={`text-left px-4 py-3 rounded font-semibold text-sm transition-colors ${style}`}
              >
                {ans}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
