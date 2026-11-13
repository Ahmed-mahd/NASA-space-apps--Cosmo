/**
 * Rules layer (draft, Phase 3 seed). Reads the learning layer's deviations,
 * the scenario's reported symptoms and last night's sleep, and returns the
 * active conditions with severity and the next approved steps.
 *
 * EXAMPLE PROTOCOL, NEEDS MEDICAL REVIEW. Thresholds use only widely published
 * adult reference ranges (SpO2 95-100%, resting heart rate 60-100 bpm,
 * breathing 12-20/min). No drugs or doses are ever named. The language model
 * never edits or chooses these steps; it only says them out loud.
 */

import mmash from "@/data/clips/mmash-user22.json";
import { RESEARCH_SOURCE, risks } from "@/data/nasa";
import type { RegionId } from "@/data/regions";
import type { Deviation } from "./baseline";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";

export type Severity = "minor" | "major";

export interface Condition {
  id: string;
  ruleId: string;
  region: RegionId;
  severity: Severity;
  title: string;
  /** One line for alert lists. */
  short: string;
  /** What Cosmo sees, in plain words. */
  readings: string[];
  /** What it could mean. Never a diagnosis. */
  meaning: string;
  /** The next approved steps, in order. */
  steps: string[];
  /** When Cosmo checks again (TRY -> OBSERVE -> REASSESS). */
  recheck: string;
  /** At major severity Cosmo asks if a crewmate is present. */
  crewmate: boolean;
  sources: { label: string; url: string }[];
}

export const PROTOCOL_VERSION = "cosmo-protocols v0.1 (draft)";
export const PROTOCOL_LABEL = "Example protocol, needs medical review";

const risk = (id: string) => risks.find((r) => r.id === id)!;
const src = (id: string) => ({ label: `NASA HRP: ${risk(id).name}`, url: risk(id).source });
const r0 = (v: number | null) => (v == null ? "--" : Math.round(v).toString());

type Devs = Record<VitalKey, Deviation>;

export function evaluate(devs: Devs, phase: StreamPhase): Condition[] {
  const out: Condition[] = [];
  const spo2 = devs.spo2, hr = devs.heartRate, rr = devs.respRate, stress = devs.stress;
  const resting = (devs.activity.recent ?? 0) < 40;

  // R-SLEEP-01: short sleep last night
  const sleepMin = mmash.sleep.totalSleepMin ?? 0;
  if (sleepMin < 360) {
    const h = Math.floor(sleepMin / 60), m = sleepMin % 60;
    out.push({
      id: "short-sleep", ruleId: "R-SLEEP-01", region: "brain", severity: "minor",
      title: "Short sleep last night",
      short: `Slept ${h} h ${m} m, ${mmash.sleep.awakenings} awakenings`,
      readings: [
        `Slept ${h} h ${String(m).padStart(2, "0")} m (in bed ${mmash.sleep.inBed} to ${mmash.sleep.outBed})`,
        `Sleep efficiency ${Math.round(mmash.sleep.efficiency ?? 0)}%, woke ${mmash.sleep.awakenings} times`,
      ],
      meaning: "Less than 6 hours of sleep can slow reaction time and make headaches and low mood more likely later in the shift.",
      steps: [
        "Keep caffeine to the first half of the shift.",
        "Switch the cabin lights to the evening setting one hour before sleep.",
        "Use today's scheduled rest block if the timeline allows.",
        "Tell Cosmo at mid-shift how alert you feel.",
      ],
      recheck: "Cosmo asks how you feel at mid-shift and reviews tonight's sleep tomorrow.",
      crewmate: false,
      sources: [src("sleep")],
    });
  }

  // R-O2-01 / R-O2-02: oxygen below this astronaut's normal, or below 90%
  const o2 = spo2.recent;
  if (o2 != null && (spo2.level >= 1 || o2 < 94)) {
    const major = o2 < 90 || spo2.level >= 3;
    out.push({
      id: "low-oxygen", ruleId: major ? "R-O2-02" : "R-O2-01", region: "lungs",
      severity: major ? "major" : "minor",
      title: major ? "Blood oxygen is low" : "Blood oxygen below your normal",
      short: `SpO2 ${r0(o2)}%, your normal ${r0(spo2.mean - 2 * spo2.sd)}-${r0(Math.min(100, spo2.mean + 2 * spo2.sd))}%`,
      readings: [
        `SpO2 ${r0(o2)}% (15-second average); your normal is about ${r0(spo2.mean)}%`,
        `Breathing ${r0(rr.recent)}/min, heart rate ${r0(hr.recent)} bpm`,
      ],
      meaning: major
        ? "Your body may not be getting enough oxygen. This needs action now, even if you feel fine."
        : "Your oxygen is lower than usual for you. Early hypoxia can feel like tiredness or a headache before anything else.",
      steps: major
        ? [
            "Stop all exertion and stay still.",
            "If a crewmate is nearby, call them over now.",
            "Follow the vehicle's emergency oxygen procedure.",
            "Check the cabin oxygen and pressure readout.",
            "Stay with Cosmo: it rechecks every minute and logs it for the flight surgeon.",
          ]
        : [
            "Stop what you are doing and rest for five minutes, breathing normally.",
            "Check the cabin oxygen and pressure readout.",
            "Tell Cosmo if you notice a headache, confusion or vision changes.",
          ],
      recheck: major ? "Rechecking every minute." : "Cosmo rechecks your oxygen in five minutes.",
      crewmate: major,
      sources: [src("hypoxia")],
    });
  }

  // R-HR-01: heart rate high at rest
  const h = hr.recent;
  if (h != null && resting && (h > 100 || hr.level >= 2)) {
    const major = h > 120;
    out.push({
      id: "fast-heart", ruleId: major ? "R-HR-02" : "R-HR-01", region: "heart",
      severity: major ? "major" : "minor",
      title: "Heart rate high at rest",
      short: `${r0(h)} bpm while resting, your normal ${r0(hr.mean)} bpm`,
      readings: [`Heart rate ${r0(h)} bpm while resting; your normal is about ${r0(hr.mean)} bpm`, `HRV ${r0(devs.hrv.recent)} ms`],
      meaning: "A fast heart at rest can come from pain, stress, dehydration or low oxygen. Cosmo looks at the other readings to tell which.",
      steps: ["Sit or anchor yourself and rest for five minutes.", "Drink water unless mission rules say otherwise.", "Tell Cosmo about any pain, dizziness or chest discomfort."],
      recheck: "Cosmo rechecks your heart rate in five minutes.",
      crewmate: major,
      sources: [src("cardiovascular")],
    });
  }

  // R-STRESS-01: stress index high
  if (stress.level >= 2 && phase !== "flank-pain") {
    out.push({
      id: "high-stress", ruleId: "R-STRESS-01", region: "mind", severity: "minor",
      title: "Stress is building",
      short: `Stress index ${r0(stress.recent)}/100, your normal ${r0(stress.mean)}`,
      readings: [`Stress index ${r0(stress.recent)}/100 (simulated from heart rate and HRV)`],
      meaning: "Your body is showing signs of strain. A short break now usually helps more than pushing through.",
      steps: ["Take a two-minute guided breathing break with Cosmo.", "Look out of a window or at an Earth view for a minute.", "If it keeps up, talk it through with Cosmo or a crewmate."],
      recheck: "Cosmo checks in again in ten minutes.",
      crewmate: false,
      sources: [src("behavior")],
    });
  }

  // R-FLANK-01: reported flank pain (scenario 2)
  if (phase === "flank-pain") {
    out.push({
      id: "flank-pain", ruleId: "R-FLANK-01", region: "kidneys", severity: "major",
      title: "Sharp pain in the right flank",
      short: "Reported 7/10 pain, right side of the lower back",
      readings: [
        "You reported sharp pain on the right side of your lower back, 7 out of 10",
        `Heart rate ${r0(h)} bpm, breathing ${r0(rr.recent)}/min`,
      ],
      meaning: "Pain in this spot can come from the kidney, among other causes. A quick ultrasound look gives the flight surgeon what they need to decide.",
      steps: [
        "Stop work and find a stable, comfortable position.",
        "If a crewmate is nearby, ask them to help with the scan.",
        "Cosmo guides a kidney ultrasound check with the handheld probe, step by step.",
        "Drink water unless mission rules say otherwise.",
        "Cosmo saves the scan and readings for the flight surgeon.",
      ],
      recheck: "Cosmo asks about the pain again after the scan.",
      crewmate: true,
      sources: [src("bone"), { label: "NASA HRP research: CIPHER (routine ultrasound)", url: RESEARCH_SOURCE }],
    });
  }

  return out;
}

export type CrewStatus = "nominal" | "advisory" | "alert";
export function crewStatus(cs: Condition[]): CrewStatus {
  if (cs.some((c) => c.severity === "major")) return "alert";
  if (cs.length) return "advisory";
  return "nominal";
}

export function regionSeverity(cs: Condition[]) {
  const m: Partial<Record<RegionId, Severity>> = {};
  for (const c of cs) if (m[c.region] !== "major") m[c.region] = c.severity;
  return m;
}
