// ── Jarvis Core (Phase 3, visual pass 2) ─────────────────────────────────
// The 3D orb. Built with plain Three.js materials — no custom GLSL shaders,
// no postprocessing pipeline dependency — so it's something I can reason
// about statically and be confident it compiles/renders correctly. I have
// no way to actually see WebGL output from here, so anything requiring
// real visual iteration (exact glow intensity, precise color balance) is a
// best-effort guess that needs checking live. The "bloom" here is a classic
// cheap trick (a larger, soft, backside-rendered transparent sphere behind
// the wireframe core) rather than real postprocessing bloom — safer to
// build blind, and avoids a new dependency (@react-three/postprocessing)
// that could fail to install/build without me able to verify it.
//
// Visual pass 2 additions vs. the first version: denser wireframe core, a
// glow layer, a third ring, and a network-globe particle layer (points
// connected to their nearest neighbors, computed once) instead of a bare
// point cloud — this is the piece meant to close the gap toward a
// connected-network look rather than a scattered starfield.
//
// One canvas, driven entirely by the same JarvisState the rest of the app
// uses — idle/processing/tool/success/error, all real, none faked.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'motion/react';
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

function GlowSphere({ state }: { state: JarvisState }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const breathSpeed = state === 'idle' ? 0.6 : 2.2;
    const scale = 1 + Math.sin(t * breathSpeed) * (state === 'idle' ? 0.05 : 0.12);
    ref.current.scale.setScalar(scale);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.62, 24, 24]} />
      <meshBasicMaterial
        color={STATE_COLOR[state]}
        transparent
        opacity={0.12}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function CoreSphere({ state }: { state: JarvisState }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(STATE_COLOR[state]), [state]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const breathSpeed = state === 'idle' ? 0.6 : 2.2;
    const breathAmount = state === 'idle' ? 0.04 : 0.09;
    const scale = 1 + Math.sin(t * breathSpeed) * breathAmount;
    meshRef.current.scale.setScalar(scale);
    meshRef.current.rotation.y = t * STATE_SPEED[state] * 0.12;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.color = color;
    mat.emissive = color;
  });

  return (
    <mesh ref={meshRef}>
      {/* Subdivision 3 (vs. 2 before) — denser wireframe, closer to a
          network-mesh look instead of a plain low-poly ball. */}
      <icosahedronGeometry args={[0.55, 3]} />
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

function Ring({ radius, thickness, speed, tilt, opacity, state, arc }: {
  radius: number; thickness: number; speed: number; tilt: number; opacity: number; state: JarvisState; arc?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * STATE_SPEED[state] * speed;
    ref.current.rotation.x = tilt;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, thickness, 8, 96, arc ?? Math.PI * 2]} />
      <meshBasicMaterial color={STATE_COLOR[state]} transparent opacity={opacity} />
    </mesh>
  );
}

// Points scattered on a sphere shell, connected to their nearest couple of
// neighbors with thin lines — a network-globe look (like a connected node
// graph) rather than a bare point cloud. Positions and the connection list
// are computed once (useMemo), so this costs nothing extra per frame.
function NetworkGlobe({ state }: { state: JarvisState }) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const count = 42;

  const { positions, linePositions } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const radius = 1.35 + Math.random() * 0.25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pts.push(new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      ));
    }
    const positions = new Float32Array(count * 3);
    pts.forEach((p, i) => { positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z; });

    // Connect each point to its 2 nearest neighbors — small, fixed cost
    // (42^2), computed once, never per-frame.
    const lineVerts: number[] = [];
    const maxConnectDist = 0.85;
    for (let i = 0; i < count; i++) {
      const dists = pts.map((p, j) => ({ j, d: i === j ? Infinity : pts[i].distanceTo(p) }));
      dists.sort((a, b) => a.d - b.d);
      for (let k = 0; k < 2; k++) {
        const nb = dists[k];
        if (nb.d < maxConnectDist) {
          lineVerts.push(pts[i].x, pts[i].y, pts[i].z, pts[nb.j].x, pts[nb.j].y, pts[nb.j].z);
        }
      }
    }
    return { positions, linePositions: new Float32Array(lineVerts) };
  }, []);

  useFrame((_, delta) => {
    const rot = delta * STATE_SPEED[state] * 0.1;
    if (pointsRef.current) pointsRef.current.rotation.y += rot;
    if (linesRef.current) linesRef.current.rotation.y += rot;
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={STATE_COLOR[state]} size={0.025} transparent opacity={0.65} sizeAttenuation />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={STATE_COLOR[state]} transparent opacity={0.18} />
      </lineSegments>
    </>
  );
}

function Scene({ state, progress }: { state: JarvisState; progress: number }) {
  const arc = state === 'tool' ? Math.max(0.15, progress) * Math.PI * 2 : undefined;
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 2, 2]} intensity={0.6} color={STATE_COLOR[state]} />
      <GlowSphere state={state} />
      <CoreSphere state={state} />
      <Ring radius={0.78} thickness={0.010} speed={0.6} tilt={Math.PI / 2.4} opacity={0.5} state={state} />
      <Ring radius={0.95} thickness={0.007} speed={-0.4} tilt={Math.PI / 3.1} opacity={0.35} state={state} />
      <Ring radius={1.12} thickness={0.006} speed={-0.35} tilt={Math.PI / 2.4} opacity={0.3} state={state} arc={arc} />
      <NetworkGlobe state={state} />
    </>
  );
}

export function JarvisCore({ state, progress = 0, label, size = 160 }: { state: JarvisState; progress?: number; label: string; size?: number }) {
  const color = STATE_COLOR[state];
  const [booted, setBooted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBooted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Boot flash — a bright pulse that fires once, then fades for good.
          Plain div, no size-sensitive rendering, safe to animate freely. */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size, height: size, background: color }}
        initial={{ opacity: 0.5, scale: 0.3 }}
        animate={booted ? { opacity: 0, scale: 1.8 } : {}}
        transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
      />
      {/* CSS glow behind the canvas — cheap, safe, no WebGL risk. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.9, height: size * 0.9,
          background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
          filter: 'blur(8px)',
        }}
      />
      {/* IMPORTANT: this div (the Canvas's direct measuring container)
          must never receive a scale/rotate transform, only opacity. A
          scaled ancestor collapses what Three.js reads as the render
          target size at mount, and it does not recover even after the
          transform animates back — this is what broke the orb entirely
          in the previous version. Opacity-only fade is safe: it doesn't
          affect the measured bounding box the way scale does. */}
      <motion.div
        style={{ width: size, height: size }}
        className="relative"
        initial={{ opacity: 0 }}
        animate={booted ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <Canvas camera={{ position: [0, 0, 3.2], fov: 40 }} gl={{ antialias: true, alpha: true }}>
          <Scene state={state} progress={progress} />
        </Canvas>
      </motion.div>
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.2em] -mt-2 relative"
        style={{ color }}
      >
        {label}
      </div>
    </div>
  );
}
