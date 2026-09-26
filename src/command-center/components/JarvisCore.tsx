import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'motion/react';
import { COLORS } from '../tokens';
import type { JarvisState } from '../types';

const STATE_COLOR: Record<JarvisState, string> = {
  idle: COLORS.accentDim,
  processing: COLORS.accent,
  tool: COLORS.accent,
  speaking: COLORS.accent,
  success: COLORS.success,
  error: COLORS.critical,
};

const STATE_SPEED: Record<JarvisState, number> = {
  idle: 0.18,
  processing: 0.9,
  tool: 1.35,
  speaking: 0.72,
  success: 0.42,
  error: 0.48,
};

function ReactorScene({ state }: { state: JarvisState }) {
  const color = STATE_COLOR[state];
  const speed = STATE_SPEED[state];
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const shellB = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const ringC = useRef<THREE.Mesh>(null);
  const nodes = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (core.current) {
      const pulse = 1 + Math.sin(t * (state === 'idle' ? 1.2 : 2.2)) * (state === 'idle' ? 0.028 : 0.06);
      core.current.scale.setScalar(pulse);
      core.current.rotation.y += delta * speed * 0.2;
      core.current.rotation.x = Math.sin(t * 0.25) * 0.08;
    }
    if (shell.current) {
      shell.current.rotation.y -= delta * speed * 0.08;
      shell.current.rotation.z += delta * speed * 0.04;
    }
    if (shellB.current) {
      shellB.current.rotation.y += delta * speed * 0.04;
      shellB.current.rotation.x -= delta * speed * 0.03;
    }
    if (ringA.current) ringA.current.rotation.z += delta * speed * 0.36;
    if (ringB.current) ringB.current.rotation.z -= delta * speed * 0.24;
    if (ringC.current) ringC.current.rotation.z += delta * speed * 0.14;
    if (nodes.current) nodes.current.rotation.z += delta * speed * 0.06;
  });

  const nodePositions = useMemo(() => [
    [1.65, 0.2, 0.08], [-1.34, -0.66, 0.22], [0.74, 1.16, -0.24],
    [-0.62, 1.42, 0.16], [1.16, -1.02, -0.1], [-1.1, 0.92, -0.18],
  ] as [number, number, number][], []);

  return (
    <>
      <ambientLight intensity={0.38} />
      <pointLight position={[2.2, 2.6, 3]} intensity={1.8} color={color} />
      <pointLight position={[-2, -1.2, 1]} intensity={0.6} color={color} />

      <mesh position={[0, 0, -0.6]}>
        <sphereGeometry args={[1.95, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.05} depthWrite={false} />
      </mesh>

      <mesh ref={shell}>
        <icosahedronGeometry args={[1.08, 2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.14} />
      </mesh>

      <mesh ref={shellB}>
        <octahedronGeometry args={[0.98, 1]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.07} />
      </mesh>

      <mesh ref={core}>
        <icosahedronGeometry args={[0.76, 3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} roughness={0.14} metalness={0.12} wireframe transparent opacity={0.97} />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.66, 28, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <mesh ref={ringA} rotation={[Math.PI / 2.55, 0.2, 0]}>
        <torusGeometry args={[1.16, 0.012, 8, 140]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 3.15, -0.3, 0.38]}>
        <torusGeometry args={[1.42, 0.008, 8, 140, Math.PI * 1.72]} />
        <meshBasicMaterial color={color} transparent opacity={0.46} />
      </mesh>
      <mesh ref={ringC} rotation={[Math.PI / 2.05, 0, -0.28]}>
        <torusGeometry args={[1.64, 0.006, 8, 140, Math.PI * 1.32]} />
        <meshBasicMaterial color={color} transparent opacity={0.24} />
      </mesh>

      <group ref={nodes}>
        {nodePositions.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[i === 0 ? 0.05 : 0.032, 12, 12]} />
            <meshBasicMaterial color={color} transparent opacity={0.92} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function GaugeArc({ rotate, span = 72, radius = 43, opacity = 0.45, width = 0.5 }: { rotate: number; span?: number; radius?: number; opacity?: number; width?: number }) {
  const circumference = 2 * Math.PI * radius;
  const dash = (span / 360) * circumference;
  return (
    <circle
      cx="50" cy="50" r={radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeDasharray={`${dash} ${circumference - dash}`}
      strokeLinecap="round"
      opacity={opacity}
      transform={`rotate(${rotate} 50 50)`}
    />
  );
}

function TelemetryTag({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'right' }) {
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[104px] ${align === 'right' ? 'text-right' : 'text-left'}`} style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.018)' }}>
      <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>{label}</div>
      <div className="text-xs font-semibold mt-1" style={{ color: COLORS.text }}>{value}</div>
    </div>
  );
}

export function JarvisCore({ state, progress = 0, label, size = 360 }: { state: JarvisState; progress?: number; label: string; size?: number }) {
  const color = STATE_COLOR[state];
  const [booted, setBooted] = useState(false);
  const active = state !== 'idle';
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const marks = Array.from({ length: 48 });
  const progressDeg = Math.max(8, progress * 360);

  return (
    <div className="relative w-full min-h-[420px] md:min-h-[470px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 w-[68%] h-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${color}1f 0%, ${color}0f 24%, transparent 64%)`, filter: 'blur(10px)' }} />
        <div className="absolute inset-y-[8%] left-1/2 w-px bg-white/[0.04]" />
        <div className="absolute inset-x-[8%] top-1/2 h-px bg-white/[0.04]" />
        <div className="absolute left-[9%] top-[10%] w-14 h-14 border-l border-t" style={{ borderColor: `${color}66` }} />
        <div className="absolute right-[9%] top-[10%] w-14 h-14 border-r border-t" style={{ borderColor: `${color}66` }} />
        <div className="absolute left-[9%] bottom-[10%] w-14 h-14 border-l border-b" style={{ borderColor: `${color}66` }} />
        <div className="absolute right-[9%] bottom-[10%] w-14 h-14 border-r border-b" style={{ borderColor: `${color}66` }} />
        <div className="absolute left-[16%] right-[16%] bottom-[16%] h-[18%] rounded-[50%] border" style={{ borderColor: `${color}33` }} />
        <div className="absolute left-[22%] right-[22%] bottom-[19%] h-[10%] rounded-[50%] border border-white/5" />
      </div>

      <motion.div
        className="absolute w-[min(80vw,680px)] aspect-square rounded-full pointer-events-none"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: booted ? 1 : 0, scale: booted ? 1 : 0.88 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" style={{ color }}>
          <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="0.18" opacity="0.12" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.15" opacity="0.1" strokeDasharray="1.2 2.1" />
          <circle cx="50" cy="50" r="36.5" fill="none" stroke="currentColor" strokeWidth="0.14" opacity="0.09" strokeDasharray="0.9 2.2" />
          <GaugeArc rotate={-32} span={82} radius={46.5} opacity={0.6} width={0.52} />
          <GaugeArc rotate={100} span={52} radius={43} opacity={0.34} width={0.42} />
          <GaugeArc rotate={194} span={96} radius={39} opacity={0.24} width={0.38} />
          <GaugeArc rotate={258} span={40} radius={34} opacity={0.24} width={0.34} />
          {marks.map((_, i) => {
            const a = i * 7.5;
            return <line key={i} x1="50" y1="2.2" x2="50" y2={i % 4 === 0 ? '4.9' : '3.8'} stroke="currentColor" strokeWidth={i % 4 === 0 ? '0.3' : '0.16'} opacity={i % 4 === 0 ? 0.55 : 0.18} transform={`rotate(${a} 50 50)`} />;
          })}
          {state === 'tool' && (
            <circle cx="50" cy="50" r="48.5" fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray={`${(progressDeg / 360) * 304} 304`} strokeLinecap="round" transform="rotate(-90 50 50)" opacity="0.95" />
          )}
        </svg>
      </motion.div>

      <div className="absolute inset-x-[8%] top-10 flex items-start justify-between pointer-events-none">
        <TelemetryTag label="Owner" value="Michael" />
        <div className="text-center mt-1">
          <div className="text-[10px] uppercase tracking-[0.32em]" style={{ color: COLORS.accent }}>GID GARAGE</div>
          <div className="text-[9px] uppercase tracking-[0.22em] mt-1" style={{ color: COLORS.textFaint }}>AI CORE</div>
        </div>
        <TelemetryTag label="City" value="Flagstaff, AZ" align="right" />
      </div>

      <div className="absolute inset-y-[28%] left-[7%] flex flex-col justify-between pointer-events-none">
        <TelemetryTag label="Mode" value={active ? 'Owner Assist' : 'Passive Watch'} />
        <TelemetryTag label="State" value={label} />
      </div>
      <div className="absolute inset-y-[28%] right-[7%] flex flex-col justify-between pointer-events-none">
        <TelemetryTag label="Business" value="GID Garage" align="right" />
        <TelemetryTag label="Intent" value={active ? 'Processing' : 'Monitoring'} align="right" />
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <Canvas camera={{ position: [0, 0, 4.1], fov: 38 }} gl={{ antialias: true, alpha: true }}>
          <ReactorScene state={state} />
        </Canvas>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[78%] max-w-[720px] text-center pointer-events-none">
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}66, transparent)` }} />
        <div className="grid grid-cols-3 gap-2 mt-3">
          <TelemetryTag label="Core" value={active ? 'Reactive' : 'Stable'} />
          <TelemetryTag label="Command" value={label} />
          <TelemetryTag label="Reactor" value={state === 'tool' ? `${Math.round(progress * 100)}%` : 'Ready'} align="right" />
        </div>
      </div>
    </div>
  );
}
