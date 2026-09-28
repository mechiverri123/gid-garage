// Jarvis visual core: layered rings, rotating geometry, orbiting particle
// traces and a breathing central orb. Pure SVG + CSS transforms (GPU
// composited) — no WebGL. Driven only by real state.
import { C } from './theme';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'working' | 'complete' | 'error';

const LOOK: Record<OrbState, { color: string; glow: string; speed: number; label: string }> = {
  idle: { color: C.cyan2, glow: 'rgba(0,174,239,0.35)', speed: 1, label: 'IDLE' },
  listening: { color: C.cyan, glow: 'rgba(52,214,255,0.55)', speed: 1.8, label: 'LISTENING' },
  thinking: { color: C.purple, glow: 'rgba(154,101,255,0.55)', speed: 3.2, label: 'THINKING' },
  working: { color: C.cyan, glow: 'rgba(52,214,255,0.65)', speed: 4, label: 'WORKING' },
  complete: { color: C.green, glow: 'rgba(32,229,139,0.5)', speed: 1.3, label: 'COMPLETE' },
  error: { color: C.red, glow: 'rgba(255,77,95,0.5)', speed: 0.8, label: 'ERROR' },
};

export function orbLabel(s: OrbState) { return LOOK[s].label; }
export function orbColor(s: OrbState) { return LOOK[s].color; }

export function JarvisOrb({ state, size = 220 }: { state: OrbState; size?: number }) {
  const { color, glow, speed } = LOOK[state];
  const dur = (base: number) => `${(base / speed).toFixed(2)}s`;
  const c = 100; // viewBox center
  const ticks = Array.from({ length: 48 }, (_, i) => i);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Jarvis is ${LOOK[state].label.toLowerCase()}`}>
      <div className="absolute inset-[18%] rounded-full transition-all duration-700" style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, filter: 'blur(6px)' }} />
      <svg viewBox="0 0 200 200" width={size} height={size} className="relative">
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="42%" r="60%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="0.35" stopColor={color} stopOpacity="0.9" />
            <stop offset="1" stopColor={color} stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* outer dashed ring */}
        <g className="cc-spin" style={{ animationDuration: dur(60) }}>
          <circle cx={c} cy={c} r="94" fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 6" />
        </g>
        {/* tick ring */}
        <g className="cc-spin-rev" style={{ animationDuration: dur(90) }}>
          {ticks.map(i => {
            const a = (i / ticks.length) * Math.PI * 2; const long = i % 6 === 0;
            const r1 = 84; const r2 = long ? 77 : 80;
            return <line key={i} x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + r2 * Math.cos(a)} y2={c + r2 * Math.sin(a)} stroke={color} strokeOpacity={long ? 0.7 : 0.3} strokeWidth={long ? 1.4 : 0.8} />;
          })}
        </g>
        {/* arc segments */}
        <g className="cc-spin" style={{ animationDuration: dur(18) }}>
          <circle cx={c} cy={c} r="68" fill="none" stroke={color} strokeOpacity="0.75" strokeWidth="2.2" strokeDasharray="70 36 20 36 90 175" strokeLinecap="round" />
        </g>
        <g className="cc-spin-rev" style={{ animationDuration: dur(26) }}>
          <circle cx={c} cy={c} r="58" fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 8 40 8" />
        </g>
        {/* orbiting particle traces */}
        {[{ r: 76, d: 9, s: 2.6, o: 0 }, { r: 62, d: 13, s: 2, o: 120 }, { r: 50, d: 7, s: 1.8, o: 240 }].map((p, i) => (
          <g key={i} transform={`rotate(${p.o} ${c} ${c})`}>
            <g className={i % 2 ? 'cc-spin-rev' : 'cc-spin'} style={{ animationDuration: dur(p.d), transformOrigin: `${c}px ${c}px`, transformBox: 'view-box' }}>
              <circle cx={c + p.r} cy={c} r={p.s} fill={color} />
              <path d={`M ${c + p.r} ${c} A ${p.r} ${p.r} 0 0 0 ${c + p.r * Math.cos(-0.5)} ${c + p.r * Math.sin(-0.5)}`} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        ))}
        {/* inner hex geometry */}
        <g className="cc-spin" style={{ animationDuration: dur(40) }}>
          <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return `${c + 40 * Math.cos(a)},${c + 40 * Math.sin(a)}`; }).join(' ')} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
        </g>
        {/* core */}
        <g className="cc-breathe" style={{ animationDuration: dur(4) }}>
          <circle cx={c} cy={c} r="30" fill="url(#orb-core)" />
          <circle cx={c} cy={c} r="30" fill="none" stroke={color} strokeOpacity="0.8" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
