"use client";

import { Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* Procedural Earth: ocean, noise continents, clouds, day/night terminator, atmosphere rim. */
const noise = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.03; a*=0.5; } return s; }
`;

function Earth() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0.25, -0.35).normalize() } },
        vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: noise + `
          uniform float uTime; uniform vec3 uSun; varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){
            vec3 p = normalize(vP);
            float land = fbm(p*1.6);
            float ice = smoothstep(0.9, 0.96, abs(p.y));
            vec3 ocean = mix(vec3(0.01,0.06,0.2), vec3(0.02,0.18,0.42), smoothstep(-0.4,0.1,land));
            vec3 ground = mix(vec3(0.1,0.32,0.16), vec3(0.45,0.38,0.22), smoothstep(0.15,0.45,land));
            vec3 col = mix(ocean, ground, smoothstep(0.05, 0.11, land));
            col = mix(col, vec3(0.92), ice);
            float cl = smoothstep(0.1, 0.6, fbm(p*3.0 + vec3(uTime*0.01, 0.0, uTime*0.006)));
            col = mix(col, vec3(0.9), cl*0.6);
            float d = dot(normalize(vN), normalize((viewMatrix*vec4(uSun,0.0)).xyz));
            float day = smoothstep(-0.15, 0.35, d);
            vec3 night = vec3(1.0,0.75,0.4) * smoothstep(0.1, 0.16, land) * step(0.9, fract(sin(dot(floor(p*260.0), vec3(12.9898,78.233,37.719)))*43758.5453)) * (1.0-cl) * 0.35;
            vec3 c = col*day + night*(1.0-day);
            float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
            c += vec3(0.25,0.6,1.0) * rim * (0.4 + day);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float i = pow(0.72 - dot(vN, vV), 3.0); gl_FragColor = vec4(0.2,0.6,1.0,1.0) * i * 1.6; }`,
      }),
    [],
  );
  useFrame((st, dt) => {
    mat.uniforms.uTime.value = st.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y += dt * 0.008;
  });
  return (
    <group position={[-4, -36.5, -30]} rotation={[1.25, 0, 0.18]}>
      <mesh ref={ref} material={mat}><sphereGeometry args={[26, 160, 160]} /></mesh>
      <mesh material={atmo} scale={1.035}><sphereGeometry args={[26, 128, 128]} /></mesh>
    </group>
  );
}

function Moon() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.03; });
  return (
    <mesh ref={ref} position={[-17, 9.5, -30]}>
      <sphereGeometry args={[0.9, 48, 48]} />
      <meshStandardMaterial color="#9aa6bd" roughness={1} />
    </mesh>
  );
}

function Rig() {
  const { camera, pointer } = useThree();
  useFrame((_, dt) => {
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (pointer.y * 0.35 - camera.position.y) * Math.min(1, dt * 2);
    camera.lookAt(0, 0, -10);
  });
  return null;
}

export default function SpaceScene({ paused = false }: { paused?: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 50 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }} frameloop={paused ? "never" : "always"} aria-hidden>
      <color attach="background" args={["#030b1e"]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[10, 4, 6]} intensity={1.6} />
      <Stars radius={80} depth={60} count={6000} factor={3.2} saturation={0.4} fade speed={0.6} />
      <Earth />
      <Moon />
      <Rig />
    </Canvas>
  );
}
