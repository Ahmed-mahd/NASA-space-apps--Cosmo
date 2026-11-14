/**
 * Proactive check-ins: Cosmo speaks first when a reading drifts away from this
 * astronaut's normal, or is heading there.
 *
 * This reads the learning layer (deviations, trend over the last minute) and
 * the rules layer (minor conditions). Major conditions have their own alert
 * (brain.majorAlert). Forecasts are simple straight-line extrapolations of the
 * last minute of data, and Cosmo says them as "if it keeps going like this".
 */

import type { Deviation } from "./baseline";
import type { CheckTopic, Pending } from "./brain";
import type { Condition } from "./conditions";
import type { VitalKey } from "./vitals";

export interface Observation {
  id: CheckTopic;
  priority: number;
  say: string[];
  pending: Pending;
}

type Point = Partial<Record<VitalKey, number>> & { t: number };

const r0 = (v: number | null | undefined) => (v == null ? "--" : Math.round(v).toString());
const r1 = (v: number | null | undefined) => (v == null ? "--" : v.toFixed(1));
const ASK = "Are you feeling okay?";

/** Least-squares slope of a vital over the last `seconds` of history, in units per minute. */
export function slopePerMin(history: Point[], key: VitalKey, seconds = 60): number | null {
  const pts = history.slice(-seconds).filter((p) => p[key] != null);
  if (pts.length < Math.min(30, seconds / 2)) return null;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { const x = p.t, y = p[key]!; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx;
  if (!den) return null;
  return ((n * sxy - sx * sy) / den) * 60;
}

export function observe(devs: Record<VitalKey, Deviation>, history: Point[], conditions: Condition[]): Observation[] {
  const out: Observation[] = [];
  const d = devs;
  const resting = (d.activity.recent ?? 0) < 40;
  const obs = (id: CheckTopic, priority: number, line: string) =>
    out.push({ id, priority, say: [line], pending: { kind: "check-in", topic: id } });

  // oxygen: below normal now, or on its way there
  const o2 = d.spo2;
  const lowO2 = conditions.find((c) => c.id === "low-oxygen" && c.severity === "minor");
  if (lowO2) {
    obs("o2", 4, `I noticed your oxygen is ${r0(o2.recent)} percent, a bit lower than your usual ${r0(o2.mean)}. Some people get a headache or feel tired when that happens. ${ASK}`);
  } else if (o2.recent != null) {
    // a real drift, not the normal wobble: falling for 90 s, down at least 1.5 points, already below the usual
    const s = slopePerMin(history, "spo2", 90);
    const win = history.slice(-90).map((p) => p.spo2).filter((x): x is number => x != null);
    const drop = win.length > 10 ? Math.max(...win.slice(0, 10)) - Math.min(...win.slice(-10)) : 0;
    const bound = Math.max(94, o2.mean - 2 * o2.sd);
    if (s != null && s < -0.8 && drop >= 1.5 && o2.z <= -1 && o2.recent > bound) {
      const mins = (o2.recent - bound) / -s;
      if (mins <= 45) {
        const when = mins < 1.5 ? "in about a minute" : `in about ${Math.round(mins)} minutes`;
        obs("o2-trend", 5, `Heads up. Your oxygen has been drifting down, and it's now ${r0(o2.recent)} percent. If it keeps going like this, it could drop below your normal ${when}, and you might start to feel a headache or get tired. ${ASK}`);
      }
    }
  }

  // heart and stress
  const hr = d.heartRate;
  const hrUp = resting && hr.recent != null && hr.z >= 2;
  const stressUp = d.stress.level >= 1;
  if (hrUp && stressUp) {
    obs("stress", 3, `Hey, I noticed your heart rate is ${r0(hr.recent)}, higher than your usual ${r0(hr.mean)}, and your stress readings have been climbing. ${ASK}`);
  } else if (hrUp) {
    obs("hr", 2, `Hey, I noticed your heart rate is ${r0(hr.recent)}, higher than usual for you while you're resting. ${ASK}`);
  } else if (stressUp) {
    obs("stress", 2, `Your stress readings have been climbing for the last few minutes. ${ASK}`);
  }

  // breathing and skin temperature
  if (resting && d.respRate.z >= 2 && !lowO2) obs("rr", 1, `You're breathing a bit faster than usual, ${r0(d.respRate.recent)} a minute. ${ASK}`);
  if (d.skinTemp.level >= 1) obs("temp", 0, `Your skin temperature has moved away from your usual. It's ${r1(d.skinTemp.recent)} degrees now. ${ASK}`);

  return out.sort((a, b) => b.priority - a.priority);
}
