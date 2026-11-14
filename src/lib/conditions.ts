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
import { behavioralSupport, RESEARCH_SOURCE, risks } from "@/data/nasa";
import type { RegionId } from "@/data/regions";
import type { Deviation } from "./baseline";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";

export type Severity = "minor" | "major";

/**
 * A yes-or-no question Cosmo asks when the astronaut is alone during a major
 * alert, so they never have to say more than one word.
 */
export interface YesNoCheck {
  q: string;
  yes: string;
  no: string;
  /** Logged for the flight surgeon together with the answer. */
  log: string;
  /** Ask once more when the answer is this (for example "have you stopped moving?" -> no). */
  repeatOn?: "yes" | "no";
  /** What happens next. Without it Cosmo moves to the next question. */
  thenYes?: Then;
  thenNo?: Then;
}
export type Then = "recheck" | "scan-self" | "talk" | "crewmate" | "stop";

/** Things the astronaut told Cosmo, which the rules read alongside the sensors. */
export type ReportKind = "low-mood" | "crisis" | "chest-pain";
export interface Report { kind: ReportKind; at: string }

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
  /** Yes-or-no questions for when no crewmate is present (major alerts only). */
  alone?: YesNoCheck[];
  sources: { label: string; url: string }[];
}

/** Yes-or-no questions per condition, for when the astronaut is alone (example protocol). */
export const ALONE_CHECKS: Record<string, YesNoCheck[]> = {
  "low-oxygen": [
    { q: "Have you stopped moving, and are you holding still?", yes: "Good.", no: "Please stop now and hold on to something steady.", log: "Stopped exertion", repeatOn: "no" },
    { q: "Are you feeling dizzy or confused?", yes: "Thank you. That's important. Stay still, I'm right here.", no: "Good.", log: "Dizzy or confused" },
    { q: "Have you started the vehicle's emergency oxygen procedure?", yes: "Well done.", no: "Start it now. I'll wait.", log: "Emergency oxygen procedure started", repeatOn: "no" },
    { q: "Is your breathing getting easier?", yes: "That's what I want to hear. Let me recheck your oxygen.", no: "Okay. I've told the flight surgeon it isn't improving yet. Keep following the procedure while I recheck.", log: "Breathing easier", thenYes: "recheck", thenNo: "recheck" },
  ],
  "fast-heart": [
    { q: "Do you have any chest pain or pressure?", yes: "Thank you. Stay still. I'm flagging this to the flight surgeon as urgent.", no: "Good.", log: "Chest pain or pressure" },
    { q: "Do you feel dizzy or faint?", yes: "Okay. Anchor yourself and keep still.", no: "Good.", log: "Dizzy or faint" },
    { q: "Were you exercising in the last few minutes?", yes: "That could explain part of it. Rest now and I'll recheck.", no: "Okay. Rest now, and I'll recheck in a few minutes.", log: "Recent exercise", thenYes: "stop", thenNo: "stop" },
  ],
  "flank-pain": [
    { q: "Are you in a stable position, anchored or strapped in?", yes: "Good.", no: "Take a moment to anchor yourself. I'll wait.", log: "In a stable position", repeatOn: "no" },
    { q: "Is the pain getting worse?", yes: "Thank you. I've marked it as getting worse for the flight surgeon.", no: "Okay. Good to know.", log: "Pain getting worse" },
    { q: "Do you feel sick, or have you vomited?", yes: "Noted. Sip water slowly if mission rules allow.", no: "Good.", log: "Nausea or vomiting" },
    { q: "Can you hold the ultrasound probe yourself if I guide you?", yes: "Great. We'll do it together.", no: "That's fine. I've sent everything to the flight surgeon, and I'm staying with you.", log: "Able to self-scan", thenYes: "scan-self", thenNo: "stop" },
  ],
  "chest-pain": [
    { q: "Have you stopped what you were doing?", yes: "Good.", no: "Please stop now and stay still.", log: "Stopped activity", repeatOn: "no" },
    { q: "Is the pain spreading to your arm, jaw or back?", yes: "Thank you. I'm marking this as urgent. Start the medical emergency procedure now.", no: "Okay.", log: "Pain spreading" },
    { q: "Are you short of breath?", yes: "Noted. Stay still and breathe slowly.", no: "Good.", log: "Short of breath" },
    { q: "Are you sweating, or do you feel sick?", yes: "Noted. The flight surgeon has all of this now.", no: "Good. The flight surgeon has all of this now.", log: "Sweating or nausea", thenYes: "stop", thenNo: "stop" },
  ],
  "crisis": [
    { q: "Are you safe right now?", yes: "Thank you. Let's keep it that way, together.", no: "Okay. Please move away from anything you could hurt yourself with, and stay where the crew can reach you. I'm alerting them now.", log: "Safe right now" },
    { q: "Is a crewmate nearby?", yes: "Please ask them to stay with you. I'll only tell them you'd like company.", no: "Okay. Then I'm staying right here with you.", log: "Crewmate nearby", thenYes: "crewmate" },
    { q: "Would you like to talk about what's going on while we wait for the call?", yes: "I'm listening. Take your time. What's been going on?", no: "That's okay. We can just stay here together. I'll tell you as soon as the call is ready.", log: "Wants to talk", thenYes: "talk", thenNo: "stop" },
  ],
};
ALONE_CHECKS["faint"] = ALONE_CHECKS["fast-heart"];

export const PROTOCOL_VERSION = "cosmo-protocols v0.2 (draft)";
export const PROTOCOL_LABEL = "Example protocol, needs medical review";

const risk = (id: string) => risks.find((r) => r.id === id)!;
const src = (id: string) => ({ label: `NASA HRP: ${risk(id).name}`, url: risk(id).source });
const r0 = (v: number | null) => (v == null ? "--" : Math.round(v).toString());

type Devs = Record<VitalKey, Deviation>;

export function evaluate(devs: Devs, phase: StreamPhase, reports: Report[] = []): Condition[] {
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
      alone: major ? ALONE_CHECKS["low-oxygen"] : undefined,
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
      alone: major ? ALONE_CHECKS["fast-heart"] : undefined,
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
      alone: ALONE_CHECKS["flank-pain"],
      sources: [src("bone"), { label: "NASA HRP research: CIPHER (routine ultrasound)", url: RESEARCH_SOURCE }],
    });
  }

  // R-CHEST-01: reported chest pain (always major)
  if (reports.some((r) => r.kind === "chest-pain")) {
    out.push({
      id: "chest-pain", ruleId: "R-CHEST-01", region: "heart", severity: "major",
      title: "Chest pain reported",
      short: `Chest pain reported, heart rate ${r0(h)} bpm`,
      readings: ["You reported chest pain", `Heart rate ${r0(h)} bpm, oxygen ${r0(o2)}%, breathing ${r0(rr.recent)}/min`],
      meaning: "Chest pain always needs a person to look at it. Cosmo records your heart readings for the flight surgeon.",
      steps: [
        "Stop all activity and stay still.",
        "If a crewmate is nearby, call them over now.",
        "Cosmo records your heart readings and alerts the flight surgeon.",
        "Follow the vehicle's medical emergency procedure if the pain is severe or spreading.",
      ],
      recheck: "Rechecking every minute.",
      crewmate: true,
      alone: ALONE_CHECKS["chest-pain"],
      sources: [src("cardiovascular")],
    });
  }

  // R-MIND-02: thoughts of self-harm (always major, a person takes over)
  if (reports.some((r) => r.kind === "crisis")) {
    out.push({
      id: "crisis", ruleId: "R-MIND-02", region: "mind", severity: "major",
      title: "Needs support now",
      short: "Urgent private conference requested",
      readings: ["The astronaut shared that they may not be safe. Details stay private."],
      meaning: "This is a moment for a person, not a program. Cosmo stays and gets the support team on the line.",
      steps: [
        "Cosmo stays with you and keeps talking.",
        "Cosmo asks the flight surgeon for an urgent private conference.",
        "If a crewmate is nearby, ask them to stay with you.",
        "Move away from anything you could hurt yourself with.",
      ],
      recheck: "Cosmo stays in the conversation until the call starts.",
      crewmate: true,
      alone: ALONE_CHECKS["crisis"],
      sources: [src("behavior"), ...behavioralSupport.sources],
    });
  }

  // R-MIND-01: low mood shared in conversation
  if (reports.some((r) => r.kind === "low-mood") && !reports.some((r) => r.kind === "crisis")) {
    out.push({
      id: "low-mood", ruleId: "R-MIND-01", region: "mind", severity: "minor",
      title: "Low mood shared",
      short: "Talked it through with Cosmo",
      readings: ["You told Cosmo you were not feeling great. What you said stays private; only the check-in is logged."],
      meaning: "Low moods are common on long missions. Talking, contact with home and small routines help.",
      steps: [
        "Talk it through with Cosmo, a crewmate, or the support team on Earth.",
        "Ask Cosmo for a private family or psychological conference if you want one.",
        "Spend a few minutes at a window or the Earth view.",
        "Keep your journal going.",
      ],
      recheck: "Cosmo checks in on you later today.",
      crewmate: false,
      sources: [src("behavior"), ...behavioralSupport.sources],
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
