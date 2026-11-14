/**
 * Sensor layer (demo): replays research recordings as if the band and shirt
 * were streaming live, one reading per tick (1 Hz at normal speed).
 *
 *  - Heart rate, HRV, activity: MMASH user_22, day 1 10:00-10:30 (looped)
 *  - SpO2:                      BIDMC records 03 and 01 (normal), 04 (low)
 *  - Breathing rate:            BIDMC records 03 and 02 (normal), 04 (scenario)
 *  - Skin temperature, stress:  generated here, labeled simulated
 *
 * A scenario phase fades in over ~90 s and out over ~60 s. "hypoxia" fades
 * SpO2 into the real low-SpO2 recording; "hypoxia-severe" adds a further
 * simulated drop; "flank-pain" adds a simulated pain/stress response. Any
 * vital that gets a scenario shift on top of a recording is listed in
 * `reading.shifted` so the screen can label it simulated.
 */

import mmash from "@/data/clips/mmash-user22.json";
import bidmc from "@/data/clips/bidmc.json";
import type { Values, VitalKey } from "./vitals";

export type StreamPhase = "normal" | "hypoxia" | "hypoxia-severe" | "flank-pain" | "stress";

export const PHASES: { id: StreamPhase; label: string }[] = [
  { id: "normal", label: "Normal day" },
  { id: "hypoxia", label: "Mild hypoxia" },
  { id: "hypoxia-severe", label: "Hypoxia worsening" },
  { id: "flank-pain", label: "Flank pain" },
  { id: "stress", label: "Stress spike" },
];

export interface Reading {
  /** Seconds since the stream started. */
  t: number;
  /** Clock time of the underlying recording, HH:MM:SS. */
  clock: string;
  values: Values;
  phase: StreamPhase;
  /** 0 = fully normal recording, 1 = fully scenario recording. */
  blend: number;
  /** Vitals carrying a simulated scenario shift on top of the recording. */
  shifted: VitalKey[];
}

type Rec = { hr: (number | null)[]; spo2: (number | null)[]; resp: (number | null)[] };
const REC = bidmc.records as Record<string, Rec>;
const LIVE = mmash.live as { hr: (number | null)[]; hrv: (number | null)[]; steps: number[] };
const LIVE_LEN = LIVE.hr.length;
const SEG = REC["02"].spo2.length; // 481 samples per BIDMC record
const XFADE = 30; // seconds of crossfade between normal records
const RAMP_IN = 90; // seconds to fade fully into a scenario
const RAMP_OUT = 60; // seconds to fade back to normal
// Normal recordings, played one after the other and looped. SpO2 and breathing use
// different pairs so each stays in a steady healthy range (02 sits at a flat 100%,
// 01 breathes at ~21/min).
export const NORMAL_TRACK = { spo2: ["03", "01"], resp: ["03", "02"] } as const;

/** Small deterministic PRNG so every demo run looks the same. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pingPong = (i: number, n: number) => {
  const p = i % (2 * (n - 1));
  return p < n ? p : 2 * (n - 1) - p;
};

function clockAt(t: number) {
  const [h, m, s] = mmash.live.startClock.split(":").map(Number);
  const total = (h * 3600 + m * 60 + s + (t % LIVE_LEN)) % 86400;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export class ReplayStream {
  private t = 0;
  private phase: StreamPhase = "normal";
  private blend = 0; // hypoxia recording
  private severe = 0; // extra simulated SpO2 drop
  private pain = 0; // flank-pain stress response
  private strain = 0; // emotional stress: faster heart, lower HRV
  private rand = mulberry32(142);
  private last: Partial<Record<string, number>> = {};

  setPhase(p: StreamPhase) { this.phase = p; }
  getPhase() { return this.phase; }

  /** Carry the last good value through short sensor dropouts. */
  private hold(key: string, v: number | null | undefined) {
    if (v != null) { this.last[key] = v; return v; }
    return this.last[key] ?? null;
  }

  /** Normal SpO2 / breathing: the field's normal track, looped, with crossfades at the joins. */
  private normal(field: "spo2" | "resp", t: number) {
    const seg = Math.floor(t / SEG), k = t % SEG, track = NORMAL_TRACK[field];
    const cur = REC[track[seg % track.length]][field];
    const nxt = REC[track[(seg + 1) % track.length]][field];
    const a = this.hold(`n-${field}`, cur[k]);
    if (k < SEG - XFADE || a == null) return a;
    const b = nxt[k - (SEG - XFADE)] ?? a;
    return lerp(a, b, (k - (SEG - XFADE)) / XFADE);
  }

  next(): Reading {
    const t = this.t++;
    const ramp = (cur: number, on: boolean) =>
      on ? Math.min(1, cur + 1 / RAMP_IN) : Math.max(0, cur - 1 / RAMP_OUT);
    const p = this.phase;
    this.blend = ramp(this.blend, p === "hypoxia" || p === "hypoxia-severe");
    this.severe = ramp(this.severe, p === "hypoxia-severe");
    this.pain = ramp(this.pain, p === "flank-pain");
    this.strain = ramp(this.strain, p === "stress");
    const b = this.blend, sv = this.severe, pn = this.pain, st = this.strain;
    const i = t % LIVE_LEN;

    // MMASH replay
    const hrRec = this.hold("hr", LIVE.hr[i]);
    const hrvRec = this.hold("hrv", LIVE.hrv[i]);
    let steps = 0;
    for (let k = 0; k < 60; k++) steps += LIVE.steps[(i - k + LIVE_LEN) % LIVE_LEN];

    // BIDMC replay: normal track, faded toward record 04 during hypoxia
    const j = pingPong(t, SEG);
    const spo2N = this.normal("spo2", t);
    const respN = this.normal("resp", t);
    const spo2L = this.hold("l-spo2", REC["04"].spo2[j]);
    const respL = this.hold("l-resp", REC["04"].resp[j]);
    const spo2Rec = spo2N == null || spo2L == null ? spo2N ?? spo2L : lerp(spo2N, spo2L, b);
    const spo2 = spo2Rec == null ? null : spo2Rec - 5 * sv;
    const respBase = respN == null || respL == null ? respN ?? respL : lerp(respN, respL, b);

    // Scenario shifts (simulated): faster heart and breathing, lower HRV under strain
    const heartRate = hrRec == null ? null : hrRec + 9 * b + 8 * sv + 22 * pn + 26 * st;
    const hrv = hrvRec == null ? null : hrvRec * (1 - 0.25 * b - 0.15 * sv - 0.45 * pn - 0.45 * st);
    const respRate = respBase == null ? null : respBase + 3 * b + 4 * sv + 5 * pn + 1.5 * st;

    // Generated signals (simulated)
    const noise = () => (this.rand() - 0.5) * 2;
    const skinTemp = 33.6 + 0.12 * Math.sin((2 * Math.PI * t) / 900) + 0.03 * noise() - 0.6 * pn;
    const stress = heartRate == null || hrv == null ? null
      : clamp(30 + 1.2 * (heartRate - 67) - 0.5 * (hrv - 42) + 2 * noise(), 0, 100);

    return {
      t,
      clock: clockAt(t),
      phase: this.phase,
      blend: Math.max(b, sv, pn, st),
      shifted: [
        ...(b + sv + pn + st > 0 ? (["heartRate", "hrv", "respRate"] as VitalKey[]) : []),
        ...(sv > 0 ? (["spo2"] as VitalKey[]) : []),
      ],
      values: { heartRate, hrv, spo2, respRate, skinTemp, stress, activity: steps },
    };
  }
}
