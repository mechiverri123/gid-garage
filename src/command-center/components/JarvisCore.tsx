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
  success: COLORS.success,
  error: COLORS.critical,
};

const STATE_SPEED: Record<JarvisState, number> = {
  idle: 0.16,
  processing: 0.9,
  tool: 1.25,
  success: 0.35,
  error: 0.45,
};

function CoreGeometry({ state }: { state: JarvisState }) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const ringC = useRef<THREE.Mesh>(null);
  const color = STATE_COLOR[state];

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const speed = STATE_SPEED[state];
    if (core.current) {
      const pulse = 1 + Math.sin(t * (state === 'idle' ? 0.9 : 2.4)) * (state === 'idle' ? 0.025 : 0.055);
      core.current.scale.setScalar(pulse);
      core.current.rotation.y += delta * speed * 0.17;
      core.current.rotation.x = Math.sin(t * 0.22) * 0.08;
    }
    if (shell.current) {
      shell.current.rotation.y -= delta * speed * 0.07;
      shell.current.rotation.z += delta * speed * 0.035;
    }
    if (ringA.current) ringA.current.rotation.z += delta * speed * 0.34;
    if (ringB.current) ringB.current.rotation.z -= delta * speed * 0.22;
    if (ringC.current) ringC.current.rotation.z += delta * speed * 0.12;
  });

  return (
    <group>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.05, 2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.13} />
      </mesh>

      <mesh ref={core}>
        <icosahedronGeometry args={[0.78, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.7}
          roughness={0.18}
          metalness={0.08}
          wireframe
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.68, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} />
      </mesh>

      <mesh ref={ringA} rotation={[Math.PI / 2.5, 0.25, 0]}>
        <torusGeometry args={[1.18, 0.012, 8, 120]} />
        <meshBasicMaterial color={color} transparent opacity={0.64} />
      </mesh>
      <mesh ref={ringB} rotation={[Math.PI / 3.1, -0.3, 0.35]}>
        <torusGeometry args={[1.42, 0.008, 8, 120, Math.PI * 1.72]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} />
      </mesh>
      <mesh ref={ringC} rotation={[Math.PI / 2.05, 0, -0.28]}>
        <torusGeometry args={[1.62, 0.006, 8, 120, Math.PI * 1.32]} />
        <meshBasicMaterial color={color} transparent opacity={0.26} />
      </mesh>
    </group>
  );
}

function OrbitNodes({ state }: { state: JarvisState }) {
  const group = useRef<THREE.Group>(null);
  const color = STATE_COLOR[state];
  const nodes = useMemo(() => [
    [1.55, 0.22, 0.1], [-1.28, -0.62, 0.18], [0.72, 1.12, -0.2], [-0.58, 1.38, 0.12], [1.1, -0.94, -0.12],
  ] as [number, number, number][], []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z += delta * STATE_SPEED[state] * 0.055;
  });

  return (
    <group ref={group}>
      {nodes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i === 0 ? 0.05 : 0.035, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ state }: { state: JarvisState }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[2, 2.5, 3]} intensity={1.6} color={STATE_COLOR[state]} />
      <CoreGeometry state={state} />
      <OrbitNodes state={state} />
    </>
  );
}

function GaugeArc({ rotate, span = 72, radius = 43, opacity = 0.45 }: { rotate: number; span?: number; radius?: number; opacity?: number }) {
  const circumference = 2 * Math.PI * radius;
  const dash = (span / 360) * circumference;
  return (
    <circle
      cx="50" cy="50" r={radius}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      strokeDasharray={`${dash} ${circumference - dash}`}
      strokeLinecap="round"
      opacity={opacity}
      transform={`rotate(${rotate} 50 50)`}
    />
  );
}

export function JarvisCore({ state, progress = 0, label, size = 320 }: { state: JarvisState; progress?: number; label: string; size?: number }) {
  const color = STATE_COLOR[state];
  const [booted, setBooted] = useState(false);
  const active = state !== 'idle';
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const marks = Array.from({ length: 36 });
  const progressDeg = Math.max(10, progress * 360);

  return (
    <div className="relative w-full min-h-[330px] md:min-h-[365px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 w-[72%] h-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${color}20 0%, ${color}0A 32%, transparent 70%)`, filter: 'blur(5px)' }} />
        <div className="absolute inset-y-[12%] left-1/2 w-px bg-white/[0.035]" />
        <div className="absolute inset-x-[8%] top-1/2 h-px bg-white/[0.035]" />
        <div className="absolute left-[7%] top-[12%] w-10 h-10 border-l border-t" style={{ borderColor: `${color}55` }} />
        <div className="absolute right-[7%] top-[12%] w-10 h-10 border-r border-t" style={{ borderColor: `${color}55` }} />
        <div className="absolute left-[7%] bottom-[12%] w-10 h-10 border-l border-b" style={{ borderColor: `${color}55` }} />
        <div className="absolute right-[7%] bottom-[12%] w-10 h-10 border-r border-b" style={{ borderColor: `${color}55` }} />
      </div>

      <motion.div
        className="absolute w-[min(76vw,580px)] aspect-square rounded-full pointer-events-none"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: booted ? 1 : 0, scale: booted ? 1 : 0.88 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" style={{ color }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="0.22" opacity="0.14" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeWidth="0.18" opacity="0.12" strokeDasharray="1.2 2.2" />
          <GaugeArc rotate={-26} span={78} radius={46} opacity={0.52} />
          <GaugeArc rotate={105} span={52} radius={43} opacity={0.32} />
          <GaugeArc rotate={198} span={96} radius={40} opacity={0.24} />
          {marks.map((_, i) => {
            const a = i * 10;
            return <line key={i} x1="50" y1="3.1" x2="50" y2={i % 3 === 0 ? '5.3' : '4.4'} stroke="currentColor" strokeWidth={i % 3 === 0 ? '0.36' : '0.2'} opacity={i % 3 === 0 ? 0.55 : 0.22} transform={`rotate(${a} 50 50)`} />;
          })}
          {state === 'tool' && (
            <circle cx="50" cy="50" r="47.5" fill="none" stroke="currentColor" strokeWidth="0.65" strokeDasharray={`${(progressDeg / 360) * 298} 298`} strokeLinecap="round" transform="rotate(-90 50 50)" opacity="0.9" />
          )}
        </svg>
      </motion.div>

      <div className="relative" style={{ width: size, height: size }}>
        <Canvas camera={{ position: [0, 0, 4.1], fov: 38 }} gl={{ antialias: true, alpha: true }}>
          <Scene state={state} />
        </Canvas>
      </div>

      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 w-[72%] max-w-[600px] text-center">
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />
        <div className="mt-2 flex items-center justify-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color }}>{label}</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>
        <div className="text-[9px] uppercase tracking-[0.2em] mt-1" style={{ color: COLORS.textFaint }}>
          {active ? 'State-linked reactor active' : 'Standing by'}
        </div>
      </div>
    </div>
  );
}
