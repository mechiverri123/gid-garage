// ── Jarvis Core (Phase 3) ────────────────────────────────────────────────
// The 3D orb. Built with plain Three.js materials (no custom GLSL shaders)
// so it's something I can reason about statically and be confident it
// compiles and renders correctly — I have no way to actually see WebGL
// output from here, so anything requiring visual iteration (shader tuning,
// bloom intensity, exact color balance) is a guess that needs checking
// live and adjusting. If it looks off, tell me specifically what's wrong
// (too bright/dim, too fast/slow, wrong proportions) rather than "make it
// better" — concrete feedback is the only way to tune this blind.
//
// One canvas, driven entirely by the same JarvisState the flat status dot
// used — idle/processing/tool/success/error, all real, none faked.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../tokens';
import type { JarvisState } from '../types';

const STATE_COLOR: Record<JarvisState, string> = {
  idle: COLORS.textFaint,
  processing: COLORS.accent,
  tool: COLORS.accent,
  success: COLORS.success,
  error: COLORS.critical,
};

const STATE_SPEED: Record<JarvisState, number> = {
  idle: 0.15,
  processing: 1.2,
  tool: 1.6,
  success: 0.4,
  error: 0.4,
};

function CoreSphere({ state }: { state: JarvisState }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(STATE_COLOR[state]), [state]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Breathing scale — slow and small at idle, tighter/faster pulse when
    // actively working, matches "motion communicates state" principle.
    const breathSpeed = state === 'idle' ? 0.6 : 2.2;
    const breathAmount = state === 'idle' ? 0.04 : 0.09;
    const scale = 1 + Math.sin(t * breathSpeed) * breathAmount;
    meshRef.current.scale.setScalar(scale);
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.color = color;
    mat.emissive = color;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.55, 2]} />
      <meshStandardMaterial
        color={STATE_COLOR[state]}
        emissive={STATE_COLOR[state]}
        emissiveIntensity={0.9}
        roughness={0.25}
        metalness={0.1}
        wireframe
      />
    </mesh>
  );
}

function InnerRing({ state }: { state: JarvisState }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * STATE_SPEED[state] * 0.6;
    ref.current.rotation.x = Math.PI / 2.4;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.85, 0.012, 8, 96]} />
      <meshBasicMaterial color={STATE_COLOR[state]} transparent opacity={0.55} />
    </mesh>
  );
}

function OuterRing({ state, progress }: { state: JarvisState; progress: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    // Counter-rotates relative to the inner ring.
    ref.current.rotation.z -= delta * STATE_SPEED[state] * 0.35;
    ref.current.rotation.x = Math.PI / 2.4;
  });
  // Partial arc during active tool execution — a literal progress sweep
  // rather than a decorative full ring, per the "real telemetry only" rule.
  const arc = state === 'tool' ? Math.max(0.15, progress) * Math.PI * 2 : Math.PI * 2;
  return (
    <mesh ref={ref}>
      <torusGeometry args={[1.05, 0.008, 8, 96, arc]} />
      <meshBasicMaterial color={STATE_COLOR[state]} transparent opacity={0.35} />
    </mesh>
  );
}

function Particles({ state }: { state: JarvisState }) {
  const ref = useRef<THREE.Points>(null);
  const count = 60; // sparse, per spec — never a starfield
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 1.3 + Math.random() * 0.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = radius * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * STATE_SPEED[state] * 0.08;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={STATE_COLOR[state]} size={0.02} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

function Scene({ state, progress }: { state: JarvisState; progress: number }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 2, 2]} intensity={0.6} color={STATE_COLOR[state]} />
      <CoreSphere state={state} />
      <InnerRing state={state} />
      <OuterRing state={state} progress={progress} />
      <Particles state={state} />
    </>
  );
}

export function JarvisCore({ state, progress = 0, label }: { state: JarvisState; progress?: number; label: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center">
      <div style={{ width: 160, height: 160 }}>
        <Canvas camera={{ position: [0, 0, 3.2], fov: 40 }} gl={{ antialias: true, alpha: true }}>
          <Scene state={state} progress={progress} />
        </Canvas>
      </div>
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.2em] -mt-2"
        style={{ color: STATE_COLOR[state] }}
      >
        {label}
      </div>
    </div>
  );
}
