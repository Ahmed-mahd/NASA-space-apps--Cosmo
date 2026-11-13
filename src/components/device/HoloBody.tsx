"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { REGIONS, type RegionId } from "@/data/regions";
import type { Severity } from "@/lib/conditions";

/*
 * Holographic body. The mesh is the MakeHuman base body (CC0), baked by
 * scripts/bake-body.mjs into public/models/body.bin: feet at y = 0, 3.4 tall,
 * facing +z. Three layers share it: fresnel skin, fine wireframe, point cloud.
 * Body zones (head, chest, abdomen, arms, legs) are tinted orange or red in the
 * shader when a region inside them has an alert; organs glow inside.
 */

const BLUE = new THREE.Color("#2f8dff");
const ORANGE = new THREE.Color("#ff9a3d");
const RED = new THREE.Color("#ff3b5c");
const sevColor = (s?: Severity) => (s === "major" ? RED : s === "minor" ? ORANGE : BLUE);
const sevPulse = (s?: Severity) => (s === "major" ? 1 : s === "minor" ? 0.45 : 0);

type Sev = Partial<Record<RegionId, Severity>>;
type Zone = "head" | "chest" | "abdomen" | "arms" | "legs";
const ZONES: Zone[] = ["head", "chest", "abdomen", "arms", "legs"];
const REGION_ZONE: Record<RegionId, Zone | "all"> = {
  brain: "head", eyes: "head", "inner-ear": "head", mind: "head",
  heart: "chest", lungs: "chest", immune: "chest",
  "gut-skin": "abdomen", kidneys: "abdomen",
  muscles: "arms", bones: "legs", "whole-body": "all",
};
const worst = (a?: Severity, b?: Severity): Severity | undefined => (a === "major" || b === "major" ? "major" : a || b);

/* ---------- shared GLSL: zone weights from object-space position ---------- */
const zoneGLSL = /* glsl */ `
  uniform vec3 uZoneColor[5]; uniform float uZonePulse[5]; uniform vec3 uBase; uniform float uBasePulse; uniform float uTime;
  vec4 zoneMix(vec3 p) {
    float ax = abs(p.x);
    float head = smoothstep(2.9, 2.98, p.y);
    float arms = (1.0 - head) * smoothstep(0.27, 0.36, ax) * smoothstep(1.25, 1.45, p.y);
    float chest = (1.0 - head) * (1.0 - arms) * smoothstep(2.18, 2.26, p.y);
    float abdomen = (1.0 - arms) * smoothstep(1.62, 1.7, p.y) * (1.0 - smoothstep(2.18, 2.26, p.y));
    float legs = (1.0 - arms) * (1.0 - smoothstep(1.62, 1.7, p.y));
    float w[5]; w[0] = head; w[1] = chest; w[2] = abdomen; w[3] = arms; w[4] = legs;
    vec3 c = uBase; float pulse = uBasePulse;
    for (int i = 0; i < 5; i++) { c = mix(c, uZoneColor[i], w[i]); pulse = max(pulse, uZonePulse[i] * w[i]); }
    return vec4(c, pulse);
  }`;

const skinVert = /* glsl */ `
  varying vec3 vN; varying vec3 vView; varying vec3 vP;
  void main() {
    vP = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const skinFrag = zoneGLSL + /* glsl */ `
  varying vec3 vN; varying vec3 vView; varying vec3 vP;
  void main() {
    vec4 z = zoneMix(vP);
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
    float scan = smoothstep(0.85, 1.0, sin(vP.y * 90.0 - uTime * 2.5) * 0.5 + 0.5) * 0.18;
    float sweepY = fract(uTime * 0.11) * 4.0 - 0.3;
    float sweep = smoothstep(0.08, 0.0, abs(vP.y - sweepY)) * 0.9;
    float pulse = 1.0 + z.w * (0.55 + 0.55 * sin(uTime * 6.0));
    vec3 col = mix(z.rgb * 0.75, vec3(0.65, 0.95, 1.0), f * 0.55) * (0.5 + f * 1.5 + sweep) * pulse;
    float a = (0.07 + f * 0.85 + scan + sweep * 0.6) * min(pulse, 1.6);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

const wireVert = /* glsl */ `
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const wireFrag = zoneGLSL + /* glsl */ `
  varying vec3 vP;
  void main() {
    vec4 z = zoneMix(vP);
    float pulse = 1.0 + z.w * (0.6 + 0.6 * sin(uTime * 6.0));
    gl_FragColor = vec4(z.rgb * 1.2 * pulse, 0.07 * pulse);
  }`;

const pointVert = /* glsl */ `
  uniform float uTime; uniform float uPixel;
  varying vec3 vP; varying float vTw;
  void main() {
    vP = position;
    float r = fract(sin(dot(position, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.5 + r * 3.0) + r * 40.0));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPixel * (1.4 + r * 1.6) * (3.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const pointFrag = zoneGLSL + /* glsl */ `
  varying vec3 vP; varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    vec4 z = zoneMix(vP);
    float pulse = 1.0 + z.w * (0.6 + 0.6 * sin(uTime * 6.0));
    gl_FragColor = vec4(mix(z.rgb, vec3(0.8, 0.97, 1.0), 0.45) * pulse, smoothstep(0.5, 0.0, d) * vTw * 0.75);
  }`;

function makeZoneUniforms() {
  return {
    uTime: { value: 0 },
    uBase: { value: BLUE.clone() },
    uBasePulse: { value: 0 },
    uZoneColor: { value: ZONES.map(() => BLUE.clone()) },
    uZonePulse: { value: ZONES.map(() => 0) },
  };
}

/** Load the baked body once and share the geometry between renders. */
let bodyPromise: Promise<THREE.BufferGeometry> | null = null;
function loadBody() {
  bodyPromise ??= (async () => {
    const [meta, buf] = await Promise.all([
      fetch("/models/body.json").then((r) => r.json()),
      fetch("/models/body.bin").then((r) => r.arrayBuffer()),
    ]);
    const pos = new Float32Array(buf, 0, meta.vertexCount * 3);
    const idx = new Uint16Array(buf, meta.vertexCount * 12, meta.indexCount);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  })();
  return bodyPromise;
}

function zoneOf(p: THREE.Vector3): RegionId {
  const ax = Math.abs(p.x);
  if (p.y > 2.94) return "brain";
  if (ax > 0.32 && p.y > 1.35) return "muscles";
  if (p.y > 2.22) return ax < 0.12 && p.x > -0.02 ? "heart" : "lungs";
  if (p.y > 1.66) return p.z < -0.05 ? "kidneys" : "gut-skin";
  return "bones";
}

function Body({ sev, onSelect }: { sev: Sev; onSelect: (r: RegionId) => void }) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => { let alive = true; loadBody().then((g) => alive && setGeo(g)); return () => { alive = false; }; }, []);
  const wire = useMemo(() => (geo ? new THREE.WireframeGeometry(geo) : null), [geo]);

  const mats = useMemo(() => {
    const u = makeZoneUniforms();
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    return {
      u,
      skin: new THREE.ShaderMaterial({ ...common, uniforms: u, vertexShader: skinVert, fragmentShader: skinFrag, side: THREE.DoubleSide }),
      wire: new THREE.ShaderMaterial({ ...common, uniforms: u, vertexShader: wireVert, fragmentShader: wireFrag }),
      points: new THREE.ShaderMaterial({ ...common, uniforms: { ...u, uPixel: { value: 2 } }, vertexShader: pointVert, fragmentShader: pointFrag }),
    };
  }, []);

  // resolve region severities into zone colors
  const zoneSev = useMemo(() => {
    const z: Partial<Record<Zone | "all", Severity>> = {};
    for (const [r, s] of Object.entries(sev) as [RegionId, Severity][]) {
      const k = REGION_ZONE[r];
      z[k] = worst(z[k], s);
      if (r === "muscles") z.legs = worst(z.legs, s);
    }
    return z;
  }, [sev]);

  useFrame((st, dt) => {
    const u = mats.u, k = Math.min(1, dt * 4);
    u.uTime.value = st.clock.elapsedTime;
    mats.points.uniforms.uPixel.value = st.gl.getPixelRatio() * 2;
    u.uBase.value.lerp(sevColor(zoneSev.all), k);
    u.uBasePulse.value += (sevPulse(zoneSev.all) - u.uBasePulse.value) * k;
    ZONES.forEach((z, i) => {
      const s = worst(zoneSev[z], zoneSev.all);
      u.uZoneColor.value[i].lerp(sevColor(s), k);
      u.uZonePulse.value[i] += (sevPulse(s) - u.uZonePulse.value[i]) * k;
    });
  });

  if (!geo || !wire) return null;
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(zoneOf(e.object.worldToLocal(e.point.clone())));
  };
  return (
    <group>
      <mesh geometry={geo} material={mats.skin} onClick={click}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }} />
      <lineSegments geometry={wire} material={mats.wire} />
      <points geometry={geo} material={mats.points} />
    </group>
  );
}

/* ---------- inner organs (glow through the skin) ---------- */
const organFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uPulse; uniform float uCore;
  varying vec3 vN; varying vec3 vView; varying vec3 vP;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.6);
    float pulse = 1.0 + uPulse * (0.6 + 0.6 * sin(uTime * 6.0));
    gl_FragColor = vec4(uColor * (0.6 + f) * pulse, clamp((uCore + f * 0.8) * pulse, 0.0, 1.0));
  }`;

function Organ({ geometry, position, rotation, scale, region, sev, onSelect, core = 0.25, base = "#5fd8ff" }: {
  geometry: THREE.BufferGeometry; position: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number];
  region: RegionId; sev: Sev; onSelect: (r: RegionId) => void; core?: number; base?: string;
}) {
  const baseColor = useMemo(() => new THREE.Color(base), [base]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skinVert, fragmentShader: organFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: baseColor.clone() }, uTime: { value: 0 }, uPulse: { value: 0 }, uCore: { value: core } },
  }), [baseColor, core]);
  const s = sev[region];
  useFrame((st, dt) => {
    mat.uniforms.uTime.value = st.clock.elapsedTime;
    (mat.uniforms.uColor.value as THREE.Color).lerp(s ? sevColor(s) : baseColor, Math.min(1, dt * 4));
    mat.uniforms.uPulse.value = sevPulse(s);
  });
  return (
    <mesh geometry={geometry} material={mat} position={position} rotation={rotation} scale={scale}
      onClick={(e) => { e.stopPropagation(); onSelect(region); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }} />
  );
}

function Organs({ sev, onSelect, heartRate, respRate }: { sev: Sev; onSelect: (r: RegionId) => void; heartRate: number; respRate: number }) {
  const g = useMemo(() => ({
    brain: new THREE.SphereGeometry(0.11, 32, 24),
    heart: new THREE.SphereGeometry(0.055, 24, 16),
    lung: new THREE.SphereGeometry(0.1, 24, 20),
    kidney: new THREE.CapsuleGeometry(0.028, 0.05, 6, 12),
    gut: new THREE.TorusKnotGeometry(0.075, 0.022, 90, 10, 2, 3),
    vertebra: new THREE.BoxGeometry(0.045, 0.04, 0.04),
    femur: new THREE.CylinderGeometry(0.018, 0.018, 0.7, 10),
    tibia: new THREE.CylinderGeometry(0.015, 0.015, 0.72, 10),
    halo: new THREE.TorusGeometry(0.2, 0.005, 8, 96),
  }), []);
  const heart = useRef<THREE.Group>(null);
  const lungs = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const ph = ((t * heartRate) / 60) % 1;
    heart.current?.scale.setScalar(1 + 0.2 * Math.exp(-ph * 14) + (ph > 0.18 ? 0.08 * Math.exp(-(ph - 0.18) * 16) : 0));
    const br = 0.5 + 0.5 * Math.sin((t * respRate * Math.PI * 2) / 60);
    lungs.current?.scale.set(1 + br * 0.06, 1 + br * 0.08, 1 + br * 0.06);
    if (halo.current) halo.current.rotation.z = t * 0.5;
  });
  const P = { sev, onSelect };
  return (
    <group>
      <Organ geometry={g.brain} position={[0, 3.24, 0.03]} scale={[0.95, 0.8, 1.1]} region="brain" {...P} core={0.22} />
      <group ref={lungs} position={[0, 2.47, 0.0]}>
        {[-1, 1].map((s) => <Organ key={s} geometry={g.lung} position={[0.1 * s, 0, 0]} scale={[0.85, 1.5, 0.75]} region="lungs" {...P} core={0.12} />)}
      </group>
      <group ref={heart} position={[0.045, 2.42, 0.07]}>
        <Organ geometry={g.heart} position={[0, 0, 0]} scale={[1, 1.15, 0.9]} region="heart" {...P} core={0.55} base="#ff5f8a" />
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Organ geometry={g.kidney} position={[0.09 * s, 2.0, -0.09]} rotation={[0, 0, 0.3 * s]} region="kidneys" {...P} core={0.4} />
          <Organ geometry={g.femur} position={[0.17 * s, 1.18, 0.0]} region="bones" {...P} core={0.3} base="#bfefff" />
          <Organ geometry={g.tibia} position={[0.19 * s, 0.48, -0.02]} region="bones" {...P} core={0.3} base="#bfefff" />
        </group>
      ))}
      <Organ geometry={g.gut} position={[0, 1.88, 0.05]} scale={[1, 0.8, 0.6]} region="gut-skin" {...P} core={0.18} />
      {Array.from({ length: 18 }, (_, i) => (
        <Organ key={i} geometry={g.vertebra} position={[0, 1.66 + i * 0.07, -0.11 + Math.sin(i / 3) * 0.015]} region="bones" {...P} core={0.32} base="#bfefff" />
      ))}
      <group ref={halo} position={[0, 3.62, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <Organ geometry={g.halo} position={[0, 0, 0]} region="mind" {...P} core={0.6} base="#a35bff" />
      </group>
    </group>
  );
}

/* ---------- platform, scan ring, particles ---------- */
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
      const p = (t * 0.22) % 1;
      scan.current.position.y = p * 3.5;
      (scan.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.sin(p * Math.PI);
    }
  });
  const dashes = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a0 = (i / 72) * Math.PI * 2, a1 = a0 + ((Math.PI * 2) / 72) * 0.55;
      pts.push(Math.cos(a0) * 1.15, Math.sin(a0) * 1.15, 0, Math.cos(a1) * 1.15, Math.sin(a1) * 1.15, 0);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, []);
  return (
    <group>
      <group ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <mesh><ringGeometry args={[0.8, 0.84, 96, 1, 0, Math.PI * 1.6]} /><meshBasicMaterial color={color} transparent opacity={0.85} blending={THREE.AdditiveBlending} /></mesh>
        <mesh><ringGeometry args={[0.98, 0.995, 96]} /><meshBasicMaterial color={color} transparent opacity={0.45} blending={THREE.AdditiveBlending} /></mesh>
        <lineSegments geometry={dashes}><lineBasicMaterial color={color} transparent opacity={0.5} /></lineSegments>
        <mesh><circleGeometry args={[0.78, 64]} /><meshBasicMaterial color={color} transparent opacity={0.1} blending={THREE.AdditiveBlending} /></mesh>
      </group>
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.47, 80]} />
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
    const n = 380, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = 0.45 + rand() * 0.9;
      pos.set([Math.cos(a) * r, rand() * 3.8, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.1; if (y > 3.8) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
    if (ref.current) ref.current.rotation.y += dt * 0.04;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#7ff3ff" size={0.012} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

/* ---------- region markers: DOM buttons placed by projecting 3D anchors each frame ---------- */
const OFFSET_Y = -1.72;
const tmp = new THREE.Vector3();
const center = new THREE.Vector3(0, 2 + OFFSET_Y, 0);
type MarkerRefs = React.RefObject<Partial<Record<RegionId, HTMLButtonElement | null>>>;

function Projector({ els }: { els: MarkerRefs }) {
  useFrame(({ camera, size }) => {
    const camDist = camera.position.distanceTo(center);
    for (const r of REGIONS) {
      const el = els.current?.[r.id];
      if (!el) continue;
      tmp.set(r.anchor[0], r.anchor[1] + OFFSET_Y, r.anchor[2]);
      const behind = tmp.distanceTo(camera.position) > camDist + 0.02;
      tmp.project(camera);
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * size.width - 9}px, ${(-tmp.y * 0.5 + 0.5) * size.height - 9}px)`;
      const alert = el.classList.contains("is-minor") || el.classList.contains("is-major");
      el.style.opacity = behind && !alert ? "0.3" : "1";
      el.style.zIndex = behind ? "1" : "2";
    }
  });
  return null;
}

function Markers({ sev, labels, selected, onSelect, els }: { sev: Sev; labels: Partial<Record<RegionId, string>>; selected: RegionId | null; onSelect: (r: RegionId) => void; els: MarkerRefs }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {REGIONS.map((r) => {
        const s = sev[r.id];
        return (
          <button key={r.id} ref={(el) => { if (els.current) els.current[r.id] = el; }} type="button" onClick={() => onSelect(r.id)}
            className={`region-marker pointer-events-auto absolute left-0 top-0 ${s ? `is-${s}` : ""} ${selected === r.id ? "is-selected" : ""}`}
            aria-label={`${r.label}${s ? `, ${s} alert` : ""}`}>
            <span className="region-dot" />
            {(s || selected === r.id) && (
              <span className="region-label">{r.label}{labels[r.id] && <em>{labels[r.id]}</em>}</span>
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
  const all = Object.values(severity);
  const worstSev: Severity | undefined = all.includes("major") ? "major" : all.length ? "minor" : undefined;
  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute left-1/2 top-[42%] h-[70%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(47,141,255,.28),transparent)] blur-2xl" />
      <Canvas camera={{ position: [0, 0.1, 6.3], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <group position={[0, OFFSET_Y, 0]}>
          <Body sev={severity} onSelect={onSelect} />
          <Organs sev={severity} onSelect={onSelect} heartRate={heartRate} respRate={respRate} />
          <Platform sev={worstSev} />
          <Dust />
        </group>
        <Projector els={els} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate={!selected} autoRotateSpeed={0.6}
          minPolarAngle={Math.PI / 2.5} maxPolarAngle={Math.PI / 1.85} target={[0, 0.05, 0]} />
      </Canvas>
      <Markers sev={severity} labels={labels} selected={selected} onSelect={onSelect} els={els} />
    </div>
  );
}
