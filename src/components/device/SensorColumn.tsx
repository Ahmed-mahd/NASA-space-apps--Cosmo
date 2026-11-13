"use client";

import type { Deviation } from "@/lib/baseline";
import type { HistoryPoint } from "@/lib/useVitals";
import type { VitalKey } from "@/lib/vitals";

const LEVEL = ["var(--ok)", "var(--warn)", "var(--alert)", "var(--crit)"];
const STATUS = ["Normal", "Unusual", "Clearly unusual", "Far from normal"];
const r = (v: number | null, d = 0) => (v == null ? "--" : v.toFixed(d));

function Trend({ dev }: { dev: Deviation }) {
  const up = dev.z > 1, down = dev.z < -1;
  return (
    <span className="text-[11px]" style={{ color: LEVEL[dev.level] }}>
      {up ? "↑ Rising" : down ? "↓ Falling" : "→ Stable"}
    </span>
  );
}

export function Ring({ value, max, color, size = 54, children }: { value: number; max: number; color: string; size?: number; children?: React.ReactNode }) {
  const rad = size / 2 - 4, c = 2 * Math.PI * rad, f = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={rad} stroke="rgba(46,230,255,.12)" strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={rad} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray .6s" }} />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** ECG-style trace drawn from the heart rate. Illustrative: the band reports rate, not a full ECG. */
function Ecg({ bpm, color }: { bpm: number; color: string }) {
  const beats = 3, w = 150;
  const seg = w / beats;
  let d = "M0 22";
  for (let i = 0; i < beats; i++) {
    const x = i * seg;
    d += ` L${x + seg * 0.3} 22 L${x + seg * 0.36} 18 L${x + seg * 0.42} 22 L${x + seg * 0.5} 22 L${x + seg * 0.54} 26 L${x + seg * 0.58} 4 L${x + seg * 0.62} 34 L${x + seg * 0.66} 22 L${x + seg * 0.8} 22 L${x + seg * 0.88} 16 L${x + seg * 0.96} 22`;
  }
  const dur = (beats * 60) / Math.max(30, bpm);
  return (
    <svg viewBox="0 0 150 40" className="h-10 w-36" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" pathLength={600}
        className="ecg-path" style={{ animationDuration: `${dur}s`, filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

interface Props {
  devs: Record<VitalKey, Deviation>;
  history: HistoryPoint[];
  onOpen: (k: VitalKey) => void;
}

export default function SensorColumn({ devs, history, onOpen }: Props) {
  const hr = devs.heartRate, o2 = devs.spo2, temp = devs.skinTemp, rr = devs.respRate, hrv = devs.hrv;
  const bars = Array.from({ length: 8 }, (_, i) => history[history.length - 1 - (7 - i) * 15]?.spo2 ?? null);
  const hrColor = hr.level ? LEVEL[hr.level] : "var(--holo)";
  const o2Color = o2.level ? LEVEL[o2.level] : "var(--holo)";
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => onOpen("heartRate")} className="dev-panel is-interactive p-3.5">
        <div className="flex justify-between"><span className="dev-title">Heart rate</span><span className="text-[11px] text-ink/55">bpm</span></div>
        <div className="mt-1 flex items-end justify-between">
          <Ecg bpm={hr.value ?? 70} color={hrColor} />
          <span className="dev-num text-3xl" style={{ color: hr.level ? hrColor : undefined }}>{r(hr.value)}</span>
        </div>
        <div className="mt-1 flex justify-between"><span className="text-[10px] text-ink/45">MMASH replay</span><Trend dev={hr} /></div>
      </button>

      <div className="dev-panel p-3.5">
        <div className="flex justify-between"><span className="dev-title">Blood pressure</span><span className="text-[11px] text-ink/55">mmHg</span></div>
        <div className="mt-2 flex items-center gap-3">
          <Ring value={118} max={180} color="var(--holo)">118</Ring>
          <Ring value={76} max={120} color="var(--signal)">76</Ring>
          <div className="ml-auto text-right">
            <p className="dev-num text-2xl">118<span className="text-sm text-ink/55">/76</span></p>
            <p className="text-[11px] text-ok">Normal</p>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-amber/80">Cuff reading at 07:40 · preset for demo</p>
      </div>

      <button type="button" onClick={() => onOpen("skinTemp")} className="dev-panel is-interactive p-3.5">
        <div className="flex justify-between"><span className="dev-title">Skin temperature</span><span className="text-[11px] text-ink/55">°C</span></div>
        <div className="mt-1 flex items-end justify-between">
          <span className="rounded-full border border-holo/40 px-2.5 py-0.5 text-[11px] text-holo">● {r(temp.mean, 1)}° your normal</span>
          <span className="dev-num text-3xl">{r(temp.value, 1)}</span>
        </div>
        <div className="mt-1 flex justify-between"><span className="text-[10px] text-amber/80">Simulated</span><Trend dev={temp} /></div>
      </button>

      <button type="button" onClick={() => onOpen("spo2")} className="dev-panel is-interactive p-3.5" style={{ borderColor: o2.level ? o2Color : undefined }}>
        <div className="flex justify-between"><span className="dev-title">Oxygen saturation</span><span className="text-[11px]" style={{ color: o2.level ? o2Color : "var(--ok)" }}>{STATUS[o2.level]}</span></div>
        <div className="mt-2 flex items-center gap-3">
          <Ring value={(o2.value ?? 0) - 80} max={20} color={o2Color} size={58}>{r(o2.value)}%</Ring>
          <div className="flex h-12 items-end gap-1" aria-hidden>
            {bars.map((b, i) => (
              <span key={i} className="w-2 rounded-sm transition-all" style={{ height: `${b == null ? 4 : Math.max(4, (b - 85) * 3.2)}px`, background: o2.level ? o2Color : "var(--ok)", opacity: 0.45 + i * 0.07 }} />
            ))}
          </div>
          <span className="dev-num ml-auto text-3xl" style={{ color: o2.level ? o2Color : undefined }}>{r(o2.value)}<span className="text-base">%</span></span>
        </div>
        <p className="mt-1 text-[10px] text-ink/45">BIDMC replay · your normal {r(o2.mean - 2 * o2.sd)}–{r(Math.min(100, o2.mean + 2 * o2.sd))}%</p>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onOpen("respRate")} className="dev-panel is-interactive p-3" style={{ borderColor: rr.level ? LEVEL[rr.level] : undefined }}>
          <span className="dev-title">Respiration</span>
          <p className="dev-num mt-1 text-2xl" style={{ color: rr.level ? LEVEL[rr.level] : undefined }}>{r(rr.value)} <span className="text-xs font-normal text-ink/55">/min</span></p>
        </button>
        <button type="button" onClick={() => onOpen("hrv")} className="dev-panel is-interactive p-3">
          <span className="dev-title">HRV</span>
          <p className="dev-num mt-1 text-2xl">{r(hrv.value)} <span className="text-xs font-normal text-ink/55">ms</span></p>
        </button>
      </div>
    </div>
  );
}
