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
    { q: 'What is the purpose of a tire pressure gauge?', a: ['Measure air inside the tire', 'Measure engine temp', 'Measure oil level', 'Measure battery charge'], correct: 0 },
    { q: 'Which fluid is used to stop a car?', a: ['Brake fluid', 'Coolant', 'Transmission fluid', 'Power steering fluid'], correct: 0 },
    { q: 'What part of the car holds the engine oil?', a: ['Radiator', 'Oil pan', 'Glovebox', 'Trunk'], correct: 1 },
    { q: 'What does a "low tire pressure" warning light usually look like?', a: ['An exclamation point inside a tire', 'A snowflake', 'A wrench', 'A battery icon'], correct: 0 },
    { q: 'Headlights are part of which system?', a: ['Electrical system', 'Cooling system', 'Fuel system', 'Exhaust system'], correct: 0 },
    { q: 'What does it mean if your "battery" warning light comes on while driving?', a: ['The charging system isn\'t keeping up', 'The radio is too loud', 'The trunk is open', 'The cabin filter is dirty'], correct: 0 },
    { q: 'How often should tires typically be rotated?', a: ['Every 5,000–7,500 miles', 'Once a year regardless of mileage', 'Every 50,000 miles', 'Never, unless flat'], correct: 0 },
    { q: 'What does a "service engine soon" light usually mean?', a: ['Something needs attention — get it scanned', 'The car needs gas immediately', 'The radio needs a software update', 'The car is due for registration'], correct: 0 },
    { q: 'What is the spare tire in most modern cars sometimes called?', a: ['Donut/compact spare', 'Mud tire', 'Slick tire', 'Run-flat only'], correct: 0 },
    { q: 'What does a cabin air filter clean?', a: ['Air coming into the passenger compartment', 'Fuel before it reaches the engine', 'Oil before it reaches the pump', 'Coolant before the radiator'], correct: 0 },
    { q: 'What\'s a quick way to check if your wiper blades need replacing?', a: ['They streak or skip across the windshield', 'They make the radio static', 'They change tire pressure', 'They turn the check engine light on'], correct: 0 },
    { q: 'What does "4x4" typically refer to on a vehicle badge?', a: ['Four-wheel drive capability', 'A four-cylinder, four-door car', 'Four years, four owners', 'Four-wheel disc brakes only'], correct: 0 },
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
    { q: 'What does a thermostat regulate in the engine?', a: ['Coolant flow temperature', 'Tire pressure', 'Fuel octane', 'Radio volume'], correct: 0 },
    { q: 'What is the purpose of power steering fluid?', a: ['Cools the brakes', 'Helps the steering turn with less effort', 'Lubricates spark plugs', 'Cleans the windshield'], correct: 1 },
    { q: 'What does a transmission fluid flush typically help prevent?', a: ['Rough/delayed shifting', 'Flat tires', 'Dead battery', 'Foggy headlights'], correct: 0 },
    { q: 'Which sensor tells the engine how much air is entering it?', a: ['Mass airflow (MAF) sensor', 'Speedometer sensor', 'Fuel gauge sensor', 'Cabin temp sensor'], correct: 0 },
    { q: 'What commonly causes a vehicle to pull to one side while driving?', a: ['Misaligned wheels', 'Low washer fluid', 'Weak radio signal', 'Dirty cabin filter'], correct: 0 },
    { q: 'What does a "shudder" while accelerating from a stop often point to?', a: ['Worn CV joints/axle or transmission issue', 'Low washer fluid', 'A dirty cabin filter', 'A burnt-out headlight'], correct: 0 },
    { q: 'What is the job of motor mounts?', a: ['Secure the engine to the chassis and absorb vibration', 'Hold the spare tire', 'Cool the brakes', 'Filter incoming air'], correct: 0 },
    { q: 'What does a "coolant leak" most often show up as?', a: ['Sweet smell and a puddle under the front of the car', 'A burning rubber smell from the tires', 'Static on the radio', 'A flickering interior light'], correct: 0 },
    { q: 'What does "timing belt" vs "timing chain" mainly differ in?', a: ['Belt is rubber and wears out; chain is metal and lasts longer', 'They do completely different jobs', 'Only chains exist in modern engines', 'Belts never need replacement'], correct: 0 },
    { q: 'What is a common cause of a rotten-egg smell from the exhaust?', a: ['A failing catalytic converter', 'Low tire pressure', 'A dirty cabin filter', 'Old wiper blades'], correct: 0 },
    { q: 'What does a "spongy" brake pedal often indicate?', a: ['Air in the brake lines or low brake fluid', 'New tires', 'A fresh oil change', 'A charged battery'], correct: 0 },
    { q: 'What is the purpose of a serpentine belt tensioner?', a: ['Keeps proper tension on the belt as it wears', 'Cools the cabin', 'Filters fuel', 'Controls headlight brightness'], correct: 0 },
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
    { q: 'What is "brake fade" typically caused by?', a: ['Overheated brake components losing friction', 'Too much tire tread', 'Cold weather only', 'Low radio volume'], correct: 0 },
    { q: 'A PCV (Positive Crankcase Ventilation) valve mainly routes what?', a: ['Blow-by gases back into the intake', 'Exhaust into the cabin', 'Coolant into the oil pan', 'Fuel into the brake lines'], correct: 0 },
    { q: 'What does a "P" code starting with P1 (manufacturer-specific) usually mean vs. a generic P0 code?', a: ["It's specific to that manufacturer's system, not a universal OBD2 code", 'It only applies to diesel engines', "It's not a real code", 'It means the car is brand new'], correct: 0 },
    { q: 'What is the primary purpose of a wastegate on a turbocharged engine?', a: ['Regulate boost pressure', 'Cool the cabin', 'Filter fuel', 'Charge the battery'], correct: 0 },
    { q: 'What does "DPF" stand for on diesel vehicles?', a: ['Diesel Particulate Filter', 'Drive Power Fuse', 'Dual Pressure Fan', 'Direct Piston Feed'], correct: 0 },
    { q: 'What does a "death wobble" in trucks/SUVs commonly point to?', a: ['Worn front-end/steering components', 'Low coolant', 'Bad radio antenna', 'Weak headlight bulb'], correct: 0 },
    { q: 'What is the function of a differential in a vehicle?', a: ['Allows wheels on the same axle to rotate at different speeds', 'Cools the transmission', 'Filters the fuel', 'Controls the radio'], correct: 0 },
    { q: 'What does a "lean" air-fuel mixture mean?', a: ['Too much air relative to fuel', 'Too much fuel relative to air', 'No fuel at all', 'No air at all'], correct: 0 },
    { q: 'What is the purpose of a crankshaft position sensor?', a: ['Tells the ECU exact engine position/speed for timing', 'Measures tire pressure', 'Controls the radio volume', 'Measures cabin temperature'], correct: 0 },
    { q: 'What does "freewheeling" on a timing belt failure risk on an interference engine?', a: ['Valves and pistons colliding, causing major engine damage', 'A dead battery only', 'A flat tire', 'Nothing — it\'s purely cosmetic'], correct: 0 },
    { q: 'What does a vacuum leak commonly cause?', a: ['Rough idle and a lean air-fuel condition', 'A flat tire', 'Brighter headlights', 'Better fuel economy'], correct: 0 },
    { q: 'What is "fuel trim" in OBD2 diagnostics?', a: ['How much the ECU adjusts fuel delivery from a baseline to maintain proper air-fuel ratio', 'The amount of fuel left in the tank', 'A tire pressure setting', 'A transmission shift point'], correct: 0 },
    { q: 'What does a failing ignition coil typically cause?', a: ['A misfire on the cylinder it serves', 'A flat tire', 'Foggy headlights', 'A stuck trunk latch'], correct: 0 },
    { q: 'What is the purpose of a resonator in the exhaust system?', a: ['Cancels out specific drone/frequency noises', 'Filters oil', 'Cools the cabin', 'Charges the battery'], correct: 0 },
  ],
  extreme: [
    { q: 'In a direct injection engine, fuel is injected directly into the:', a: ['Intake manifold', 'Combustion chamber', 'Fuel rail only', 'Exhaust manifold'], correct: 1 },
    { q: 'Variable valve timing systems (VANOS/VTEC-style) are primarily designed to optimize what?', a: ['Tire wear', 'Power and efficiency across the RPM range', 'Radio signal', 'Brake bias'], correct: 1 },
    { q: 'A failing harmonic balancer can cause damage to which component over time?', a: ['Crankshaft and accessory belt system', 'Cabin air filter', 'Glovebox latch', 'Door speaker'], correct: 0 },
    { q: 'What does a "lambda" or O2 sensor primarily measure?', a: ['Oxygen content in exhaust to manage air-fuel ratio', 'Cabin humidity', 'Tire temperature', 'Battery internal resistance'], correct: 0 },
    { q: 'In an automatic transmission, what does a torque converter replace from a manual setup?', a: ['The clutch', 'The differential', 'The driveshaft', 'The flywheel only'], correct: 0 },
    { q: 'What is "pre-ignition" in an internal combustion engine?', a: ['Fuel igniting before the spark fires', 'Battery charging before startup', 'Headlights turning on early', 'Coolant warming before the thermostat opens'], correct: 0 },
    { q: 'A "limited-slip differential" is designed to address what condition?', a: ['One wheel spinning freely while the other has no power', 'Excess brake dust', 'Overcharging alternator', 'Cabin air leaks'], correct: 0 },
    { q: 'What is "scavenging" in the context of a turbocharged engine\'s exhaust pulses?', a: ['Using exhaust pulse timing to help clear the cylinder and spool the turbo', 'Draining old coolant', 'Cleaning the cabin filter', 'Recharging the AC system'], correct: 0 },
    { q: 'What does an "active" suspension system primarily do that a passive one cannot?', a: ['Electronically adjust damping/ride height in real time', 'Change tire size', 'Add more horsepower', 'Increase fuel tank capacity'], correct: 0 },
    { q: 'In a CVT (Continuously Variable Transmission), what replaces traditional fixed gears?', a: ['A belt/pulley system that varies ratio smoothly', 'A single fixed gear', 'A chain with no ratio change', 'Nothing — CVTs have no transmission'], correct: 0 },
    { q: 'What does "ECU remapping" (tuning) primarily alter?', a: ['Fuel, ignition timing, and boost parameters in software', 'The physical size of the engine', 'The color of the dashboard lights only', 'The tire tread pattern'], correct: 0 },
    { q: 'What is the main risk of running too low an octane fuel in a high-compression engine?', a: ['Pre-ignition/knock under load', 'Better fuel economy', 'Cooler running temps', 'Longer spark plug life'], correct: 0 },
    { q: 'What does a "dual-clutch transmission" (DCT) use instead of a traditional torque converter?', a: ['Two separate clutches pre-selecting next gear', 'A single hydraulic fluid coupling only', 'A belt-drive CVT system', 'No clutch at all'], correct: 0 },
    { q: 'What is the purpose of "ignition timing advance" at higher RPM?', a: ['Fire the spark earlier to let combustion complete optimally as engine speed increases', 'Slow the engine down', 'Save fuel by skipping cylinders', 'Cool the exhaust manifold'], correct: 0 },
    { q: 'What does "NVH" stand for in vehicle engineering?', a: ['Noise, Vibration, and Harshness', 'New Vehicle Handling', 'Net Voltage Hold', 'Normal Valve Height'], correct: 0 },
    { q: 'What is the purpose of "overboost" or anti-lag systems on turbo engines?', a: ['Temporarily allow higher boost/keep the turbo spooled to reduce lag', 'Permanently increase tire pressure', 'Cool the cabin faster', 'Charge the battery quicker'], correct: 0 },
    { q: 'In a hybrid drivetrain, what does regenerative braking primarily do?', a: ['Converts kinetic energy back into stored electrical energy', 'Cools the brake pads with extra air', 'Increases tire pressure automatically', 'Shuts off the radio to save power'], correct: 0 },
    { q: 'What does "stiction" refer to in a vehicle\'s steering or suspension?', a: ['Static friction that resists initial movement until overcome', 'A type of synthetic motor oil', 'A tire compound rating', 'A wiring harness connector'], correct: 0 },
    { q: 'What is the purpose of a "knock retard" strategy in ECU tuning?', a: ['Pulling ignition timing back when knock is detected to protect the engine', 'Adding more fuel to cool the cabin', 'Increasing tire pressure under load', 'Disabling the radio under acceleration'], correct: 0 },
    { q: 'What does "torque vectoring" do in performance AWD systems?', a: ['Distributes power differently to individual wheels to improve handling', 'Increases tire pressure automatically', 'Only works in reverse gear', 'Controls cabin temperature'], correct: 0 },
    { q: 'What is the main function of an intercooler on a turbocharged/supercharged engine?', a: ['Cools compressed intake air before it enters the engine', 'Cools the cabin for passengers', 'Cools the brake rotors', 'Cools the exhaust manifold only'], correct: 0 },
    { q: 'What does "drive-by-wire" throttle mean, as opposed to a cable throttle?', a: ['The accelerator pedal sends an electronic signal instead of a physical cable pull', 'The car has no throttle at all', 'It only applies to electric vehicles', 'It refers to wireless key fobs'], correct: 0 },
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
