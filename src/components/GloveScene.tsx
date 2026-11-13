"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

const HOLO = "#5ee6ff";

function Glove() {
  const suit = { color: "#dfe6ee", roughness: 0.85, metalness: 0.05 };
  const dark = { color: "#1a2433", roughness: 0.6, metalness: 0.3 };
  return (
    <group rotation={[0.25, -0.5, 0.12]} position={[0.2, -1.1, 0]}>
      {/* forearm */}
      <mesh position={[0, -0.9, 0]}>
        <capsuleGeometry args={[0.42, 1.6, 12, 24]} />
        <meshStandardMaterial {...suit} />
      </mesh>
      {/* wrist ring: Cosmo's emitter */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.07, 16, 48]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.47, 0.018, 12, 64]} />
        <meshBasicMaterial color={HOLO} />
      </mesh>
      {/* palm */}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[0.78, 0.8, 0.34]} />
        <meshStandardMaterial {...suit} />
      </mesh>
      {/* fingers */}
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 1.38 + (i === 1 || i === 2 ? 0.06 : 0), 0]}>
          <capsuleGeometry args={[0.085, 0.42, 8, 12]} />
          <meshStandardMaterial {...suit} />
        </mesh>
      ))}
      {/* thumb */}
      <mesh position={[-0.52, 0.72, 0.05]} rotation={[0, 0, 0.7]}>
        <capsuleGeometry args={[0.095, 0.34, 8, 12]} />
        <meshStandardMaterial {...suit} />
      </mesh>
      {/* back-of-hand module */}
      <mesh position={[0, 0.72, 0.19]}>
        <boxGeometry args={[0.46, 0.46, 0.06]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      <mesh position={[0, 0.72, 0.225]}>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color={HOLO} />
      </mesh>
    </group>
  );
}

function Projection() {
  const cone = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (cone.current) (cone.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 3) * 0.02;
    if (rings.current) rings.current.rotation.z = t * 0.4;
  });
  return (
    <group position={[0.75, 0.1, 0.5]} rotation={[0.1, -0.35, 0]}>
      {/* light cone from the wrist to the screen */}
      <mesh ref={cone} position={[-0.45, -0.35, -0.2]} rotation={[Math.PI, 0, 0.5]}>
        <coneGeometry args={[1.1, 1.9, 48, 1, true]} />
        <meshBasicMaterial color={HOLO} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Float speed={2} rotationIntensity={0.08} floatIntensity={0.25}>
        <group ref={rings} position={[0, 0.75, -0.02]}>
          <mesh>
            <ringGeometry args={[1.5, 1.515, 96]} />
            <meshBasicMaterial color={HOLO} transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <ringGeometry args={[1.62, 1.63, 96, 1, 0, Math.PI * 1.2]} />
            <meshBasicMaterial color={HOLO} transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </Float>
    </group>
  );
}

export default function GloveScene() {
  return (
    <div className="relative h-full w-full">
    <Canvas camera={{ position: [0, 0.4, 5.2], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 5, 3]} intensity={1.6} />
      <pointLight position={[0.9, 0.6, 1.2]} color={HOLO} intensity={6} distance={5} />
      <Stars radius={60} depth={40} count={2500} factor={3} fade speed={0.6} />
      <group position={[-1.1, -0.35, 0]} scale={0.8}>
        <Glove />
        <Projection />
      </group>
    </Canvas>
      <div className="pointer-events-none absolute left-[38%] top-[16%] w-[min(340px,56%)] [transform:perspective(900px)_rotateY(-14deg)_rotateX(4deg)]">
        <div className="holo-panel flicker p-4 select-none">
          <div className="flex items-center justify-between">
            <span className="hud-label">Cosmo · wrist projection</span>
            <span className="hud-label" style={{ color: "var(--ok)" }}>● nominal</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 font-mono">
            {[
              ["HR", "62", "bpm"],
              ["SpO₂", "98", "%"],
              ["HRV", "71", "ms"],
            ].map(([k, v, u]) => (
              <div key={k}>
                <div className="hud-label">{k}</div>
                <div className="holo-text text-3xl leading-none mt-1">{v}<span className="text-xs opacity-70 ml-1">{u}</span></div>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 300 40" className="mt-3 w-full" aria-hidden>
            <polyline fill="none" stroke="var(--holo)" strokeWidth="1.5"
              points="0,22 30,22 40,22 46,8 52,34 58,22 90,22 120,22 130,22 136,8 142,34 148,22 180,22 210,22 220,22 226,8 232,34 238,22 300,22" />
          </svg>
          <p className="mt-2 text-[13px] text-ink/90">&ldquo;Morning, Commander. You slept 7 h 10. Better than me, and I don&rsquo;t sleep.&rdquo;</p>
        </div>
      </div>
    </div>
  );
}
