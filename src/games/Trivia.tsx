import { useMemo, useState } from 'react';

type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

type RawQ = { q: string; a: string[]; correct: number };

// Local question bank — no network calls. Each pool is large enough that a
// shuffled, random subset feels different every playthrough.
const QUESTION_BANK: Record<Difficulty, RawQ[]> = {
  easy: [
    { q: 'What does "OBD" stand for in OBD2 scanners?', a: ['On-Board Diagnostics', 'Oil Brake Detector', 'Outside Body Damage', 'Optimal Battery Drain'], correct: 0 },
    { q: 'How often should most cars get an oil change (full synthetic)?', a: ['Every 1,000 mi', 'Every 5,000–7,500 mi', 'Every 20,000 mi', 'Never'], correct: 1 },
    { q: 'Which part commonly causes a squealing noise when braking?', a: ['Spark plugs', 'Brake pads', 'Alternator', 'Radiator cap'], correct: 1 },
    { q: 'What does a check engine light most often indicate first?', a: ['Flat tire', 'A stored diagnostic trouble code', 'Low washer fluid', 'Dead radio'], correct: 1 },
    { q: 'What color is engine coolant most commonly?', a: ['Blue or green', 'Black', 'Clear only', 'Red only'], correct: 0 },
    { q: 'What does the "4WD" badge typically mean?', a: ['Four-wheel drive', 'Four-window doors', 'Fast warm-up device', 'Fuel-saving wheels'], correct: 0 },
    { q: 'What part do you check the dipstick for?', a: ['Tire tread', 'Engine oil level', 'Battery voltage', 'Coolant temp'], correct: 1 },
    { q: 'Which fluid keeps your windshield clear in winter?', a: ['Brake fluid', 'Washer fluid', 'Power steering fluid', 'Transmission fluid'], correct: 1 },
    { q: 'What is a "flat" tire usually caused by?', a: ['Too much oil', 'A puncture or air loss', 'Dead battery', 'Bad spark plug'], correct: 1 },
    { q: 'What does RPM stand for?', a: ['Revolutions Per Minute', 'Road Pressure Meter', 'Rapid Power Mode', 'Rear Pump Motor'], correct: 0 },
  ],
  medium: [
    { q: 'What is the job of a car\'s alternator?', a: ['Cools the engine', 'Recharges the battery while running', 'Controls the brakes', 'Steers the wheels'], correct: 1 },
    { q: 'Struts and shocks are part of which system?', a: ['Exhaust', 'Suspension', 'Fuel injection', 'Audio'], correct: 1 },
    { q: 'What does CV in "CV axle" stand for?', a: ['Constant Velocity', 'Center Vehicle', 'Cylinder Valve', 'Cold Vacuum'], correct: 0 },
    { q: 'Tie rods primarily affect which of these?', a: ['Air conditioning', 'Steering and alignment', 'Fuel economy gauge', 'Radio reception'], correct: 1 },
    { q: 'What does a serpentine belt typically drive?', a: ['Only the radio', 'Alternator, power steering, AC compressor', 'Only the brakes', 'The transmission gears'], correct: 1 },
    { q: 'A "misfire" code usually points to a problem in which system?', a: ['Ignition/fuel delivery', 'Suspension', 'Audio system', 'HVAC blower'], correct: 0 },
    { q: 'What does a wheel alignment adjust?', a: ['Camber, caster, toe angles', 'Tire pressure only', 'Engine timing', 'Brake bias'], correct: 0 },
    { q: 'What is the purpose of a catalytic converter?', a: ['Boosts horsepower', 'Reduces harmful exhaust emissions', 'Cools transmission fluid', 'Stores extra fuel'], correct: 1 },
    { q: 'What does "AWD" stand for?', a: ['All-Wheel Drive', 'Auto Wash Detect', 'Air-Weighted Damper', 'Adjustable Wheel Drag'], correct: 0 },
    { q: 'A failing wheel bearing commonly causes what symptom?', a: ['Silent operation', 'A humming/grinding noise that changes with speed', 'Brighter headlights', 'Lower fuel gauge reading'], correct: 1 },
  ],
  hard: [
    { q: 'What does a P0420 OBD2 code generally indicate?', a: ['Catalyst system efficiency below threshold', 'Low tire pressure', 'Battery overcharge', 'Faulty radio fuse'], correct: 0 },
    { q: 'What is "torque steer" most associated with?', a: ['Rear-wheel drive trucks', 'High-torque FWD cars under acceleration', 'Manual transmissions only', 'Diesel idling'], correct: 1 },
    { q: 'What does a MAP sensor measure?', a: ['Manifold Absolute Pressure', 'Maximum Allowed Power', 'Mileage Average Percentage', 'Motor Alignment Position'], correct: 0 },
    { q: 'What does "limp mode" typically protect against?', a: ['Radio overheating', 'Further drivetrain/engine damage', 'Tire blowouts', 'Window motor burnout'], correct: 1 },
    { q: 'Which component regulates voltage output from the alternator?', a: ['Voltage regulator', 'Thermostat', 'Throttle body', 'Idler pulley'], correct: 0 },
    { q: 'What does a knock sensor detect?', a: ['Low oil pressure', 'Premature/abnormal combustion (engine knock)', 'Flat tire vibration', 'Loose exhaust bolts'], correct: 1 },
    { q: 'In a MacPherson strut suspension, the strut combines which two functions?', a: ['Steering and braking', 'Shock absorption and structural support', 'Fuel delivery and ignition', 'Cooling and lubrication'], correct: 1 },
    { q: 'What does EGR stand for in emissions systems?', a: ['Exhaust Gas Recirculation', 'Engine Ground Relay', 'Electronic Gear Ratio', 'Extended Glow Relay'], correct: 0 },
  ],
  extreme: [
    { q: 'In a direct injection engine, fuel is injected directly into the:', a: ['Intake manifold', 'Combustion chamber', 'Fuel rail only', 'Exhaust manifold'], correct: 1 },
    { q: 'Variable valve timing systems (VANOS/VTEC-style) are primarily designed to optimize what?', a: ['Tire wear', 'Power and efficiency across the RPM range', 'Radio signal', 'Brake bias'], correct: 1 },
    { q: 'A failing harmonic balancer can cause damage to which component over time?', a: ['Crankshaft and accessory belt system', 'Cabin air filter', 'Glovebox latch', 'Door speaker'], correct: 0 },
    { q: 'What does a "lambda" or O2 sensor primarily measure?', a: ['Oxygen content in exhaust to manage air-fuel ratio', 'Cabin humidity', 'Tire temperature', 'Battery internal resistance'], correct: 0 },
    { q: 'In an automatic transmission, what does a torque converter replace from a manual setup?', a: ['The clutch', 'The differential', 'The driveshaft', 'The flywheel only'], correct: 0 },
    { q: 'What is "pre-ignition" in an internal combustion engine?', a: ['Fuel igniting before the spark fires', 'Battery charging before startup', 'Headlights turning on early', 'Coolant warming before the thermostat opens'], correct: 0 },
    { q: 'A "limited-slip differential" is designed to address what condition?', a: ['One wheel spinning freely while the other has no power', 'Excess brake dust', 'Overcharging alternator', 'Cabin air leaks'], correct: 0 },
  ],
};

const LEVELS: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: 'Easy', desc: 'Everyday car basics' },
  { id: 'medium', label: 'Medium', desc: 'Common repair know-how' },
  { id: 'hard', label: 'Hard', desc: 'Diagnostic deep-dives' },
  { id: 'extreme', label: 'Extreme', desc: 'For true gearheads' },
];

const QUESTIONS_PER_ROUND = 8;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildRound(diff: Difficulty) {
  const pool = QUESTION_BANK[diff];
  const count = Math.min(QUESTIONS_PER_ROUND, pool.length);
  const picked = shuffle(pool).slice(0, count);
  // Shuffle answer order per question too, so the correct index isn't predictable.
  return picked.map((raw) => {
    const order = shuffle(raw.a.map((_, i) => i));
    return {
      q: raw.q,
      a: order.map((i) => raw.a[i]),
      correct: order.indexOf(raw.correct),
    };
  });
}

export default function Trivia({ onGameEnd }: { onGameEnd: (score: number, total: number) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  const round = useMemo(() => (difficulty ? buildRound(difficulty) : []), [difficulty, roundKey]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  function pick(i: number) {
    if (selected !== null || round.length === 0) return;
    setSelected(i);
    const correct = i === round[idx].correct;
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      if (idx + 1 < round.length) {
        setIdx((n) => n + 1);
        setSelected(null);
      } else {
        setDone(true);
        onGameEnd(correct ? score + 1 : score, round.length);
      }
    }, 650);
  }

  function chooseLevel(lvl: Difficulty) {
    setDifficulty(lvl);
    setRoundKey((k) => k + 1);
    setIdx(0);
    setScore(0);
    setSelected(null);
    setDone(false);
  }

  function playAgainSameLevel() {
    setRoundKey((k) => k + 1);
    setIdx(0);
    setScore(0);
    setSelected(null);
    setDone(false);
  }

  function changeLevel() {
    setDifficulty(null);
    setIdx(0);
    setScore(0);
    setSelected(null);
    setDone(false);
  }

  if (!difficulty) {
    return (
      <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 380 }}>
        <p className="text-white/70 text-sm text-center mb-1">Pick a difficulty</p>
        <div className="grid grid-cols-2 gap-3 w-full">
          {LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              onClick={() => chooseLevel(lvl.id)}
              className="bg-zinc-900 active:bg-zinc-800 border border-white/10 rounded-xl p-4 flex flex-col items-start gap-1 text-left"
            >
              <span className="text-white font-bold text-sm">{lvl.label}</span>
              <span className="text-white/50 text-xs leading-snug">{lvl.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-white font-bold text-lg">You scored {score} / {round.length} on {LEVELS.find((l) => l.id === difficulty)?.label}! 🔧</p>
        <div className="flex gap-3">
          <button onClick={playAgainSameLevel} className="bg-red-600 active:bg-red-700 text-white font-bold px-5 py-3 rounded">Play Again</button>
          <button onClick={changeLevel} className="bg-zinc-800 active:bg-zinc-700 text-white font-bold px-5 py-3 rounded">Change Level</button>
        </div>
      </div>
    );
  }

  const q = round[idx];

  return (
    <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: 380 }}>
      <div className="bg-zinc-800 px-4 py-2 rounded text-white font-bold text-sm">
        {LEVELS.find((l) => l.id === difficulty)?.label} · Q{idx + 1} / {round.length} · Score: {score}
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
