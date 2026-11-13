/**
 * Learning layer: this astronaut's personal baseline, and how far each live
 * reading is from it.
 *
 * - Keeps a running mean and spread per vital (Welford, with slow forgetting
 *   so the baseline follows the person over weeks, not minutes).
 * - Seeded from MMASH user_22's awake day (heart rate, HRV, activity) and the
 *   normal BIDMC records (SpO2, breathing). Simulated vitals are seeded from a
 *   warm-up run of the stream.
 * - Scores a 15-second recent average, so one noisy sample never flags.
 * - Pauses learning for a vital once it drifts toward concern (1.5 spreads),
 *   so a slow problem cannot teach Cosmo that it is normal.
 *
 * Output is a deviation score only. Severity and next steps belong to the
 * rules layer; this file never decides them.
 */

import mmash from "@/data/clips/mmash-user22.json";
import bidmc from "@/data/clips/bidmc.json";
import { NORMAL_TRACK, ReplayStream, type Reading } from "./stream";
import { VITALS, VITAL, type VitalKey } from "./vitals";

/** 0 = within your normal, 1 = mildly unusual, 2 = clearly unusual, 3 = far from normal. */
export type DeviationLevel = 0 | 1 | 2 | 3;

export interface Deviation {
  key: VitalKey;
  value: number | null;
  /** Average of the last RECENT readings, the number that is scored. */
  recent: number | null;
  mean: number;
  sd: number;
  /** Signed distance from the mean in spreads: (recent - mean) / sd. */
  z: number;
  level: DeviationLevel;
  /** True while learning is paused for this vital because it is unusual. */
  frozen: boolean;
  /** How many readings the baseline has learned from. */
  n: number;
}

const RECENT = 15;
const LEARN_BELOW = 1.5; // learning pauses once a vital drifts this many spreads toward concern
const MEMORY = 5000; // after this many readings, older ones fade (exponential forgetting)

class RunningStat {
  n = 0; mean = 0; m2 = 0;
  push(x: number) {
    this.n++;
    if (this.n <= MEMORY) {
      const d = x - this.mean;
      this.mean += d / this.n;
      this.m2 += d * (x - this.mean);
    } else {
      const a = 1 / MEMORY, d = x - this.mean;
      this.mean += a * d;
      // keep m2 consistent with a variance over MEMORY samples
      const variance = (1 - a) * (this.m2 / (MEMORY - 1) + a * d * d);
      this.m2 = variance * (MEMORY - 1);
    }
  }
  get sd() { return this.n > 1 ? Math.sqrt(this.m2 / (Math.min(this.n, MEMORY) - 1)) : 0; }
}

const levelOf = (concernZ: number): DeviationLevel =>
  concernZ < 2 ? 0 : concernZ < 3 ? 1 : concernZ < 4 ? 2 : 3;

export class Baseline {
  private stats = Object.fromEntries(VITALS.map((v) => [v.key, new RunningStat()])) as Record<VitalKey, RunningStat>;
  private recent = Object.fromEntries(VITALS.map((v) => [v.key, [] as number[]])) as Record<VitalKey, number[]>;

  /** A baseline that already knows this astronaut's normal day. */
  static seeded(): Baseline {
    const b = new Baseline();
    const seed = (k: VitalKey, xs: (number | null)[]) => xs.forEach((x) => x != null && b.stats[k].push(x));
    seed("heartRate", mmash.history.hr);
    seed("hrv", mmash.history.hrv);
    seed("activity", mmash.history.steps);
    const rec = bidmc.records as Record<string, { spo2: (number | null)[]; resp: (number | null)[] }>;
    NORMAL_TRACK.spo2.forEach((id) => seed("spo2", rec[id].spo2));
    NORMAL_TRACK.resp.forEach((id) => seed("respRate", rec[id].resp));
    const warm = new ReplayStream();
    for (let i = 0; i < 900; i++) {
      const { values } = warm.next();
      seed("skinTemp", [values.skinTemp]);
      seed("stress", [values.stress]);
    }
    return b;
  }

  /** Score a reading against the baseline, then learn from it if it looks normal. */
  update(reading: Reading): Record<VitalKey, Deviation> {
    const out = {} as Record<VitalKey, Deviation>;
    for (const meta of VITALS) {
      const k = meta.key, v = reading.values[k], st = this.stats[k], buf = this.recent[k];
      if (v != null) { buf.push(v); if (buf.length > RECENT) buf.shift(); }
      const recent = buf.length ? buf.reduce((a, b) => a + b, 0) / buf.length : null;
      const sd = Math.max(st.sd, meta.sdFloor);
      const z = recent == null ? 0 : (recent - st.mean) / sd;
      const concernZ =
        meta.concern === "low" ? Math.max(0, -z)
        : meta.concern === "high" ? Math.max(0, z)
        : meta.concern === "both" ? Math.abs(z)
        : 0;
      const level = levelOf(concernZ);
      const frozen = concernZ >= LEARN_BELOW;
      if (v != null && !frozen) st.push(v);
      out[k] = { key: k, value: v, recent, mean: st.mean, sd, z, level, frozen, n: st.n };
    }
    return out;
  }

  /** Your normal range for a vital, shown as mean ± 2 spreads. */
  range(k: VitalKey): [number, number] {
    const st = this.stats[k], sd = Math.max(st.sd, VITAL[k].sdFloor), [lo, hi] = VITAL[k].domain;
    return [Math.max(lo, st.mean - 2 * sd), Math.min(hi, st.mean + 2 * sd)];
  }
}
