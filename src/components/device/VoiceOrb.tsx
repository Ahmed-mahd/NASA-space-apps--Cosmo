"use client";

import { useEffect, useRef } from "react";
import { getLevels, useVoice, type VoiceState } from "@/lib/voice";

/**
 * Cosmo's voice orb. A living sphere drawn on a canvas: it breathes while
 * asleep, blooms when it hears "Hey Cosmo", ripples with the astronaut's
 * voice while listening (live mic spectrum), swirls while thinking, and
 * pulses with Cosmo's own voice while speaking.
 */

type Mode = "off" | "sleep" | "listen" | "think" | "speak";
const modeOf = (s: VoiceState): Mode =>
  s.speaking ? "speak" : s.thinking ? "think" : s.listening || s.wake === "awake" ? "listen" : s.wake === "off" ? "off" : "sleep";

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };

function palette(s: VoiceState, alert: boolean): string[] {
  if (s.speaking === "astronaut") return ["#ffb547", "#ff9a3d", "#2ee6ff", "#ffd84d"];
  if (s.speaking === "crewmate") return ["#a35bff", "#d38bff", "#2ee6ff", "#7a5cff"];
  if (alert) return ["#ff3b5c", "#ff9a3d", "#a35bff", "#ff5f8a"];
  return ["#2ee6ff", "#a35bff", "#3dffb0", "#0d59ff"];
}

export default function VoiceOrb({ size = 120, alert = false, onTap }: { size?: number; alert?: boolean; onTap: () => void }) {
  const v = useVoice();
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ v, alert });
  useEffect(() => { live.current = { v, alert }; });

  // press Space to talk (when not typing in a field)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code === "Space" && !e.repeat && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(t.tagName)) { e.preventDefault(); onTap(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [onTap]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, amp = 0, energy = 0.2, spin = 0, last = performance.now();
    const smooth = new Float32Array(16);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { v: s, alert: al } = live.current;
      const mode = modeOf(s);
      const L = getLevels();
      for (let i = 0; i < 16; i++) smooth[i] += (L.bands[i] - smooth[i]) * 0.35;
      const target = mode === "listen" ? Math.max(L.mic, 0.04) : mode === "speak" ? L.speak * 0.75 : mode === "think" ? 0.22 : 0;
      amp += (target - amp) * 0.22;
      const eTarget = mode === "off" ? 0.12 : mode === "sleep" ? 0.32 : 1;
      energy += (eTarget - energy) * 0.07;
      spin += dt * (calm ? 0.2 : mode === "think" ? 2.6 : mode === "listen" ? 1.1 : mode === "speak" ? 1.4 : 0.45);
      const t = spin;

      const pal = palette(s, al);
      const cx = size / 2, cy = size / 2;
      const breathe = mode === "sleep" ? 0.03 * Math.sin(now / 900) : 0;
      const R = size * 0.27 * (1 + amp * 0.22 + breathe);
      ctx.clearRect(0, 0, size, size);

      // halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, size * 0.5);
      halo.addColorStop(0, rgba(pal[0], 0.32 * energy + amp * 0.2));
      halo.addColorStop(1, rgba(pal[0], 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // voice ribbons: three wobbling rings that follow the mic spectrum
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const N = 120;
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const bi = Math.floor((Math.abs(Math.sin(a + layer)) * 15.99));
          const band = mode === "listen" ? smooth[bi] : 0;
          const wob = Math.sin(a * 3 + t * (1 + layer * 0.45) + layer * 2.1) * 0.5 + Math.sin(a * 5 - t * (0.7 + layer * 0.3)) * 0.5;
          const r = R * (1.06 + 0.05 * wob * (0.4 + energy) + band * 0.55 + amp * 0.32 * Math.sin(a * 2 + t * 2.4 + layer));
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = rgba(pal[layer % pal.length], 0.15 + 0.55 * energy);
        ctx.lineWidth = 1.6 + amp * 2;
        ctx.shadowColor = pal[layer % pal.length];
        ctx.shadowBlur = 8 * energy;
        ctx.stroke();
      }
      ctx.restore();

      // core sphere with drifting colour blobs
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(3,11,30,0.92)";
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 4; k++) {
        const dir = k % 2 ? -1 : 1;
        const ang = t * (0.55 + k * 0.22) * dir + k * 1.7;
        const reach = R * (0.42 + 0.3 * amp);
        const bx = cx + Math.cos(ang) * reach, by = cy + Math.sin(ang * 1.3) * reach;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, R * (0.85 + amp * 0.35));
        g.addColorStop(0, rgba(pal[k % pal.length], 0.1 + 0.7 * energy));
        g.addColorStop(1, rgba(pal[k % pal.length], 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      // glass highlight
      const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 0.8);
      gl.addColorStop(0, `rgba(255,255,255,${0.18 * energy + 0.05})`);
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      // rim
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(pal[0], 0.25 + 0.5 * energy);
      ctx.lineWidth = 1;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const mode = modeOf(v);
  const label = mode === "listen" ? "Listening" : mode === "speak" ? (v.speaking === "cosmo" ? "Speaking" : "Hearing") : mode === "think" ? "Thinking"
    : v.wake === "starting" ? "Starting mic" : mode === "off" ? (v.supported.stt ? "Tap to talk" : "Voice needs Chrome") : "Say “Hey Cosmo”";
  const action = mode === "speak" ? "Interrupt Cosmo" : mode === "listen" ? "Stop listening" : "Talk to Cosmo";

  return (
    <div className="flex flex-none flex-col items-center">
      <button type="button" onClick={onTap} aria-label={action} title={`${action} (Space)`}
        className="voice-orb relative grid place-items-center rounded-full" style={{ width: size, height: size }}>
        <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden />
      </button>
      <span className="mt-0.5 font-pixel text-[11px] tracking-[0.18em] text-ink/70" aria-live="polite">{label}</span>
    </div>
  );
}
