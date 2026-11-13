"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { REGIONS, type RegionId } from "@/data/regions";
import type { Severity } from "@/lib/conditions";

const CYAN = new THREE.Color("#2ee6ff");
const ORANGE = new THREE.Color("#ff9a3d");
const RED = new THREE.Color("#ff3b5c");
const colorFor = (s?: Severity) => (s === "major" ? RED : s === "minor" ? ORANGE : CYAN);

/* ---------- hologram material: fresnel rim + moving scanlines + alert pulse ---------- */
const vert = /* glsl */ `
  varying vec3 vN; varying vec3 vView; varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vY = wp.y;
    vN = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * wp;
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uPulse; uniform float uCore;
  varying vec3 vN; varying vec3 vView; varying float vY;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.2);
    float scan = smoothstep(0.92, 1.0, sin(vY * 70.0 - uTime * 3.0) * 0.5 + 0.5) * 0.35;
    float sweep = smoothstep(0.06, 0.0, abs(fract(uTime * 0.12) * 4.2 - 0.3 - vY)) * 0.6;
    float pulse = 1.0 + uPulse * (0.6 + 0.6 * sin(uTime * 6.0));
    float a = (f * 0.95 + uCore + scan + sweep) * uOpacity * pulse;
    gl_FragColor = vec4(uColor * (0.55 + f * 1.6 + sweep) * pulse, clamp(a, 0.0, 1.0));
  }`;

function useHoloMaterial(sev: Severity | undefined, opacity = 0.9, core = 0.06) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: CYAN.clone() },
          uTime: { value: 0 },
          uOpacity: { value: opacity },
          uPulse: { value: 0 },
          uCore: { value: core },
        },
      }),
    [opacity, core],
  );
  const target = colorFor(sev);
  useFrame((st, dt) => {
    mat.uniforms.uTime.value = st.clock.elapsedTime;
    (mat.uniforms.uColor.value as THREE.Color).lerp(target, Math.min(1, dt * 4));
    mat.uniforms.uPulse.value = sev === "major" ? 0.5 : sev === "minor" ? 0.18 : 0;
  });
  return mat;
}

type Sev = Partial<Record<RegionId, Severity>>;
interface PartProps {
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  region: RegionId;
  sev: Sev;
  onSelect: (r: RegionId) => void;
  opacity?: number;
  core?: number;
  wire?: boolean;
}

function Part({ geometry, position, rotation, scale, region, sev, onSelect, opacity = 0.9, core = 0.06, wire = true }: PartProps) {
  const mat = useHoloMaterial(sev[region], opacity, core);
  const wireMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#2ee6ff", wireframe: true, transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(region); };
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={geometry} material={mat} onClick={click}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }} />
      {wire && <mesh geometry={geometry} material={wireMat} />}
    </group>
  );
}

/* ---------- the body ---------- */
function Body({ sev, onSelect, heartRate, respRate }: { sev: Sev; onSelect: (r: RegionId) => void; heartRate: number; respRate: number }) {
  const g = useMemo(() => {
    const torsoProfile = [
      [0.0, 1.5], [0.24, 1.53], [0.29, 1.66], [0.27, 1.9], [0.24, 2.08], [0.28, 2.3], [0.34, 2.55], [0.35, 2.68], [0.24, 2.79], [0.09, 2.83], [0.0, 2.84],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = new THREE.LatheGeometry(torsoProfile, 40);
    torso.scale(1, 1, 0.62);
    return {
      torso,
      head: new THREE.SphereGeometry(0.21, 40, 32),
      neck: new THREE.CylinderGeometry(0.075, 0.09, 0.18, 24),
      shoulder: new THREE.SphereGeometry(0.1, 24, 16),
      upperArm: new THREE.CapsuleGeometry(0.072, 0.48, 8, 20),
      foreArm: new THREE.CapsuleGeometry(0.06, 0.42, 8, 20),
      hand: new THREE.SphereGeometry(0.07, 20, 16),
      thigh: new THREE.CapsuleGeometry(0.11, 0.56, 8, 24),
      shin: new THREE.CapsuleGeometry(0.08, 0.56, 8, 20),
      foot: new THREE.CapsuleGeometry(0.06, 0.16, 6, 12),
      brain: new THREE.SphereGeometry(0.14, 32, 24),
      eye: new THREE.SphereGeometry(0.026, 16, 12),
      ear: new THREE.TorusGeometry(0.028, 0.009, 8, 20),
      heart: new THREE.SphereGeometry(0.07, 24, 16),
      lung: new THREE.SphereGeometry(0.12, 24, 20),
      thymus: new THREE.SphereGeometry(0.035, 16, 12),
      gut: new THREE.TorusKnotGeometry(0.1, 0.03, 80, 10, 2, 3),
      kidney: new THREE.CapsuleGeometry(0.035, 0.06, 6, 12),
      vertebra: new THREE.BoxGeometry(0.06, 0.05, 0.05),
      femur: new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10),
      tibia: new THREE.CylinderGeometry(0.018, 0.018, 0.55, 10),
      halo: new THREE.TorusGeometry(0.26, 0.006, 8, 80),
    };
  }, []);

  const heartRef = useRef<THREE.Group>(null);
  const lungRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const beat = (t * heartRate) / 60;
    const ph = beat - Math.floor(beat);
    const s = 1 + 0.18 * Math.exp(-ph * 14) + 0.08 * Math.exp(-Math.max(0, ph - 0.18) * 16) * (ph > 0.18 ? 1 : 0);
    heartRef.current?.scale.setScalar(s);
    const br = 0.5 + 0.5 * Math.sin((t * respRate * Math.PI * 2) / 60);
    lungRef.current?.scale.set(1 + br * 0.06, 1 + br * 0.08, 1 + br * 0.06);
    if (haloRef.current) haloRef.current.rotation.z = t * 0.6;
  });

  const P = { sev, onSelect };
  return (
    <group>
      {/* shell */}
      <Part geometry={g.head} position={[0, 3.12, 0]} scale={[0.92, 1.1, 1]} region="whole-body" {...P} />
      <Part geometry={g.neck} position={[0, 2.88, 0]} region="whole-body" {...P} />
      <Part geometry={g.torso} region="whole-body" {...P} opacity={0.75} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Part geometry={g.shoulder} position={[0.36 * s, 2.66, 0]} region="muscles" {...P} />
          <Part geometry={g.upperArm} position={[0.43 * s, 2.32, 0]} rotation={[0, 0, 0.12 * s]} region="muscles" {...P} />
          <Part geometry={g.foreArm} position={[0.52 * s, 1.83, 0.04]} rotation={[-0.08, 0, 0.06 * s]} region="muscles" {...P} />
          <Part geometry={g.hand} position={[0.55 * s, 1.5, 0.06]} scale={[0.8, 1.25, 0.5]} region="muscles" {...P} />
          <Part geometry={g.thigh} position={[0.15 * s, 1.17, 0]} rotation={[0, 0, -0.03 * s]} region="muscles" {...P} />
          <Part geometry={g.shin} position={[0.165 * s, 0.5, -0.02]} region="muscles" {...P} />
          <Part geometry={g.foot} position={[0.17 * s, 0.07, 0.07]} rotation={[Math.PI / 2, 0, 0]} region="muscles" {...P} />
          {/* inner structures */}
          <Part geometry={g.eye} position={[0.072 * s, 3.12, 0.17]} region="eyes" {...P} core={0.5} wire={false} />
          <Part geometry={g.ear} position={[0.2 * s, 3.1, 0]} rotation={[0, Math.PI / 2, 0]} region="inner-ear" {...P} core={0.4} wire={false} />
          <Part geometry={g.kidney} position={[0.12 * s, 1.98, -0.07]} rotation={[0, 0, 0.3 * s]} region="kidneys" {...P} core={0.35} wire={false} />
          <Part geometry={g.femur} position={[0.15 * s, 1.17, 0]} region="bones" {...P} core={0.3} wire={false} />
          <Part geometry={g.tibia} position={[0.165 * s, 0.5, -0.02]} region="bones" {...P} core={0.3} wire={false} />
        </group>
      ))}
      <Part geometry={g.brain} position={[0, 3.17, -0.01]} scale={[0.95, 0.8, 1.1]} region="brain" {...P} core={0.25} />
      <group ref={lungRef} position={[0, 2.45, 0]}>
        {[-1, 1].map((s) => (
          <Part key={s} geometry={g.lung} position={[0.13 * s, 0, 0]} scale={[0.8, 1.45, 0.7]} region="lungs" {...P} core={0.18} />
        ))}
      </group>
      <group ref={heartRef} position={[0.06, 2.36, 0.07]}>
        <Part geometry={g.heart} scale={[1, 1.15, 0.9]} region="heart" {...P} core={0.5} wire={false} />
      </group>
      <Part geometry={g.thymus} position={[-0.02, 2.68, 0.08]} region="immune" {...P} core={0.5} wire={false} />
      <Part geometry={g.gut} position={[0, 1.82, 0.04]} scale={[1, 0.8, 0.6]} region="gut-skin" {...P} core={0.2} wire={false} />
      {Array.from({ length: 16 }, (_, i) => (
        <Part key={i} geometry={g.vertebra} position={[0, 1.62 + i * 0.075, -0.13]} region="bones" {...P} core={0.3} wire={false} />
      ))}
      <group ref={haloRef} position={[0, 3.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <Part geometry={g.halo} region="mind" {...P} core={0.6} wire={false} />
      </group>
    </group>
  );
}

/* ---------- platform, scan ring and particles ---------- */
function Platform({ sev }: { sev?: Severity }) {
  const ref = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const color = sev === "major" ? "#ff3b5c" : sev === "minor" ? "#ff9a3d" : "#2ee6ff";
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (ref.current) {
      ref.current.children[0].rotation.z = t * 0.25;
      ref.current.children[1].rotation.z = -t * 0.4;
      ref.current.children[2].rotation.z = t * 0.1;
    }
    if (scan.current) {
      const p = (t * 0.25) % 1;
      scan.current.position.y = p * 3.6;
      (scan.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.sin(p * Math.PI);
    }
  });
  const dashes = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 64; i++) {
      const a0 = (i / 64) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / 64 * 0.55;
      pts.push(Math.cos(a0) * 1.12, Math.sin(a0) * 1.12, 0, Math.cos(a1) * 1.12, Math.sin(a1) * 1.12, 0);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, []);
  return (
    <group>
      <group ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <mesh><ringGeometry args={[0.78, 0.82, 96, 1, 0, Math.PI * 1.6]} /><meshBasicMaterial color={color} transparent opacity={0.8} blending={THREE.AdditiveBlending} /></mesh>
        <mesh><ringGeometry args={[0.95, 0.965, 96]} /><meshBasicMaterial color={color} transparent opacity={0.45} blending={THREE.AdditiveBlending} /></mesh>
        <lineSegments geometry={dashes}><lineBasicMaterial color={color} transparent opacity={0.5} /></lineSegments>
        <mesh><circleGeometry args={[0.76, 64]} /><meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} /></mesh>
      </group>
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.52, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Dust() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = 0.35 + rand() * 0.9;
      pos.set([Math.cos(a) * r, rand() * 3.8, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.12;
      if (y > 3.8) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#7ff3ff" size={0.012} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

/* ---------- region markers: DOM buttons placed by projecting 3D anchors each frame ---------- */
const OFFSET_Y = -1.75;
const tmp = new THREE.Vector3();
const center = new THREE.Vector3(0, 2 + OFFSET_Y, 0);

function Projector({ els }: { els: React.RefObject<Partial<Record<RegionId, HTMLButtonElement | null>>> }) {
  useFrame(({ camera, size }) => {
    const camDist = camera.position.distanceTo(center);
    for (const r of REGIONS) {
      const el = els.current?.[r.id];
      if (!el) continue;
      tmp.set(r.anchor[0], r.anchor[1] + OFFSET_Y, r.anchor[2]);
      const behind = tmp.distanceTo(camera.position) > camDist + 0.02;
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * size.width, y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x - 9}px, ${y - 9}px)`;
      const alert = el.classList.contains("is-minor") || el.classList.contains("is-major");
      el.style.opacity = behind && !alert ? "0.35" : "1";
      el.style.zIndex = behind ? "1" : "2";
    }
  });
  return null;
}

function Markers({ sev, labels, selected, onSelect, els }: { sev: Sev; labels: Partial<Record<RegionId, string>>; selected: RegionId | null; onSelect: (r: RegionId) => void; els: React.RefObject<Partial<Record<RegionId, HTMLButtonElement | null>>> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {REGIONS.map((r) => {
        const s = sev[r.id];
        const active = !!s || selected === r.id;
        return (
          <button
            key={r.id}
            ref={(el) => { if (els.current) els.current[r.id] = el; }}
            type="button"
            onClick={() => onSelect(r.id)}
            className={`region-marker pointer-events-auto absolute left-0 top-0 ${s ? `is-${s}` : ""} ${selected === r.id ? "is-selected" : ""}`}
            aria-label={`${r.label}${s ? `, ${s} alert` : ""}`}
          >
            <span className="region-dot" />
            {active && (
              <span className="region-label">
                {r.label}
                {labels[r.id] && <em>{labels[r.id]}</em>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface HoloBodyProps {
  severity: Sev;
  labels: Partial<Record<RegionId, string>>;
  selected: RegionId | null;
  onSelect: (r: RegionId) => void;
  heartRate: number;
  respRate: number;
}

export default function HoloBody({ severity, labels, selected, onSelect, heartRate, respRate }: HoloBodyProps) {
  const els = useRef<Partial<Record<RegionId, HTMLButtonElement | null>>>({});
  const worst = Object.values(severity).includes("major") ? "major" : Object.values(severity).length ? "minor" : undefined;
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 1.9, 5.6], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <group position={[0, OFFSET_Y, 0]}>
          <Body sev={severity} onSelect={onSelect} heartRate={heartRate} respRate={respRate} />
          <Platform sev={worst} />
          <Dust />
        </group>
        <Projector els={els} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={!selected}
          autoRotateSpeed={0.7}
          minPolarAngle={Math.PI / 2.6}
          maxPolarAngle={Math.PI / 1.8}
          target={[0, 0.1, 0]}
        />
      </Canvas>
      <Markers sev={severity} labels={labels} selected={selected} onSelect={onSelect} els={els} />
    </div>
  );
}
