/**
 * Cosmo's dialogue manager (runs on board, no network needed).
 *
 * It understands what the astronaut said (intent + slots) and decides what to
 * do next. Every medical sentence is built from the rules layer's conditions
 * and approved steps; this file never invents a medical action. When a
 * language model is configured, /api/cosmo only rewords the draft reply (or
 * handles open chit-chat), it never changes the decision.
 */

import { JOKES, MOODS, type MoodId } from "@/data/mind";
import type { RegionId } from "@/data/regions";
import type { Deviation } from "./baseline";
import type { Condition, CrewStatus } from "./conditions";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";

export type Pending =
  | null
  | "rest" | "recheck-symptom" | "pain-score" | "crewmate" | "offer-joke" | "offer-activity" | "scan-ready" | "scan-step";

export type Action =
  | { type: "phase"; phase: StreamPhase }
  | { type: "fastForward"; seconds: number; then: FollowUp }
  | { type: "openRegion"; region: RegionId }
  | { type: "tab"; tab: "body" | "mind" }
  | { type: "mind"; activity: "joke" | "trivia" | "breathing" | "earth" | "journal" }
  | { type: "mood"; mood: MoodId }
  | { type: "log"; text: string; severity: "minor" | "major" | "info" }
  | { type: "crewmate"; present: boolean }
  | { type: "scan"; step: number };

export type FollowUp = "report-oxygen" | "recheck-oxygen";

export interface BrainContext {
  devs: Record<VitalKey, Deviation>;
  conditions: Condition[];
  status: CrewStatus;
  phase: StreamPhase;
  pending: Pending;
  jokeIndex: number;
  scanStep: number;
  activity?: "breathing" | "earth" | "trivia" | "joke" | "journal";
}

export interface Turn {
  say: string[];
  speaker?: "cosmo";
  actions: Action[];
  pending: Pending;
  intent: string;
  /** A joke split into setup and punchline, spoken with a pause. */
  joke?: { setup: string; punch: string };
  /** The Mind activity Cosmo just offered (answered with yes). */
  offer?: "breathing" | "earth";
}

const r0 = (v: number | null | undefined) => (v == null ? "unknown" : Math.round(v).toString());
const has = (s: string, re: RegExp) => re.test(s);
const YES = /\b(yes|yeah|yep|sure|ok(ay)?|go (on|ahead)|please|do it|let'?s|why not|she'?s here|he'?s here|is here|present|ready)\b/i;
const NO = /\b(no|nope|not now|nah|alone|nobody|no one|later)\b/i;

export const SCAN_STEPS = [
  "Put a line of gel on the probe.",
  "Place the probe on the right side of the back, just below the lowest rib, pointing toward the belly button.",
  "Tilt slowly until the bean shape of the kidney fills the screen. Then hold still for five seconds while I record.",
  "Done. I've saved the images with the readings for the flight surgeon. You can wipe off the gel.",
];

function vitalsSummary(c: BrainContext) {
  const d = c.devs;
  const parts = [
    `Heart rate ${r0(d.heartRate.recent)}`,
    `oxygen ${r0(d.spo2.recent)} percent`,
    `breathing ${r0(d.respRate.recent)} a minute`,
  ];
  const off = c.conditions.filter((x) => x.id !== "short-sleep");
  if (!off.length) return `${parts.join(", ")}. All inside your normal.`;
  return `${parts.join(", ")}. ${off[0].title}.`;
}

function topCondition(c: BrainContext) {
  return [...c.conditions].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1))[0];
}

/** Words for an oxygen check, built from the rule engine's current output. */
export function oxygenReport(c: BrainContext, recheck: boolean): Turn {
  const o2 = c.devs.spo2, cond = c.conditions.find((x) => x.id === "low-oxygen");
  const normal = r0(o2.mean);
  if (!cond) {
    return {
      intent: recheck ? "recheck" : "report",
      say: recheck
        ? [`Rechecking. Your oxygen is back to ${r0(o2.recent)} percent, inside your normal of about ${normal}. How's the headache now?`]
        : [`Your oxygen is ${r0(o2.recent)} percent, right where it usually is for you. Let's keep an eye on it, and tell me if the headache gets worse.`],
      actions: recheck ? [{ type: "log", text: `Recheck: SpO2 ${r0(o2.recent)}%, back inside normal.`, severity: "info" }] : [],
      pending: recheck ? "recheck-symptom" : null,
    };
  }
  const steps = cond.steps;
  if (cond.severity === "major") {
    return {
      intent: "report",
      say: [`Your oxygen is ${r0(o2.recent)} percent. That's low, and it needs action now.`, `${steps[0]} Is a crewmate with you?`],
      actions: [{ type: "openRegion", region: "lungs" }],
      pending: "crewmate",
    };
  }
  return {
    intent: "report",
    say: [
      `Your oxygen is ${r0(o2.recent)} percent. Your normal is about ${normal}, so that's lower than usual for you, and it can explain the headache and tiredness.`,
      `Here's the plan. ${steps[0]} ${steps[1]} I'll recheck in five minutes.`,
    ],
    actions: [{ type: "openRegion", region: "lungs" }],
    pending: "rest",
  };
}

export function respond(text: string, c: BrainContext): Turn {
  const t = text.toLowerCase().trim();
  const alert = c.status === "alert";
  const T = (intent: string, say: string[], actions: Action[] = [], pending: Pending = null): Turn => ({ intent, say, actions, pending });

  if (!t) return T("silence", ["I didn't catch that. Try again whenever you're ready."], [], c.pending);

  /* ---- answers to something Cosmo just asked ---- */
  if (c.pending === "crewmate") {
    const top = topCondition(c);
    if (has(t, YES) && !has(t, /\bno\b/)) {
      const who = top?.id === "flank-pain"
        ? [`Hi, I'm Cosmo. Thanks for helping. Your crewmate has sharp pain on the right side of the lower back, seven out of ten.`, `Please help them into a stable position, then grab the handheld ultrasound probe. I'll guide you through a quick kidney scan. Say ready when you have it.`]
        : [`Hi, I'm Cosmo. Thanks for coming. Your crewmate's oxygen is low.`, `Please help them stay still, then check the cabin oxygen and pressure readout with me. I'm rechecking every minute.`];
      return T("crewmate-yes", who, [{ type: "crewmate", present: true }, { type: "log", text: "Crewmate present. Cosmo is coaching them.", severity: "info" }], top?.id === "flank-pain" ? "scan-ready" : null);
    }
    if (has(t, NO)) {
      return T("crewmate-no", [`Okay. I'll stay with you the whole time. ${top ? top.steps[0] : "Stay still."} If anything gets worse, tell me straight away.`], [{ type: "crewmate", present: false }]);
    }
  }
  if (c.pending === "scan-ready" || c.pending === "scan-step") {
    if (has(t, /ready|got (it|the probe)|done|okay|ok\b|next|yes|finished/)) {
      const step = c.pending === "scan-ready" ? 0 : c.scanStep + 1;
      const last = step >= SCAN_STEPS.length - 1;
      return T("scan", [SCAN_STEPS[step] + (last ? "" : " Say done when you're there.")], [{ type: "scan", step }], last ? null : "scan-step");
    }
  }
  if (c.pending === "pain-score") {
    const n = t.match(/\b(10|[1-9])\b/)?.[1] ?? Object.entries({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }).find(([w]) => t.includes(w))?.[1];
    if (n) {
      return T("pain-score", [
        `${n} out of ten. Thank you. I'm treating this as a major alert.`,
        `Stop work and find a stable, comfortable position. Is a crewmate nearby?`,
      ], [{ type: "phase", phase: "flank-pain" }, { type: "openRegion", region: "kidneys" }, { type: "log", text: `Reported right flank pain ${n}/10.`, severity: "major" }], "crewmate");
    }
  }
  if (c.pending === "rest" && has(t, /rest|ok(ay)?|sure|will do|done|alright|fine|sitting|stopp/)) {
    return T("rest", ["Good. Breathe normally and stay still. I'm fast-forwarding five minutes of the simulation so you can see me recheck."],
      [{ type: "phase", phase: "normal" }, { type: "fastForward", seconds: 110, then: "recheck-oxygen" }], null);
  }
  if (c.pending === "recheck-symptom") {
    if (has(t, /better|fine|good|gone|great|improv|ok(ay)?/)) {
      return T("recovered", ["Great news. I've logged the whole episode for the flight surgeon.", "And since you're feeling better, can I tell you a joke? It's a good one. Probably."],
        [{ type: "log", text: "Symptoms resolved after rest. Logged for the flight surgeon.", severity: "info" }], "offer-joke");
    }
    if (has(t, /worse|still|same|bad/)) {
      return T("not-better", ["Thanks for telling me. Let's keep resting and I'll recheck again in five minutes. If it gets worse, I'll raise this to a major alert."],
        [{ type: "fastForward", seconds: 110, then: "recheck-oxygen" }], null);
    }
  }
  if (c.pending === "offer-joke") {
    if (has(t, YES)) return tellJoke(c);
    if (has(t, NO)) return T("no-joke", ["Fair enough. I'll save it for later. It's not getting any less funny."]);
  }
  if (c.pending === "offer-activity" && has(t, YES)) {
    return T("activity", ["Opening it now."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: c.activity ?? "breathing" }]);
  }

  /* ---- symptoms (scenario 1: hypoxia pathway) ---- */
  if (has(t, /headache|head hurts|tired|fatigue|exhausted|dizz|confus|blurr|vision|short of breath|can'?t breathe|breathless|light.?headed/)) {
    const syms = ["headache", "tired", "dizz", "confus", "vision", "breath"].filter((s) => t.includes(s));
    return T("symptoms", ["Sorry you're feeling that way. Let me look at your readings."],
      [
        ...(c.phase === "normal" ? [{ type: "phase", phase: "hypoxia" } as Action] : []),
        { type: "log", text: `Reported: ${syms.join(", ") || "feeling unwell"}.`, severity: "minor" },
        { type: "fastForward", seconds: 100, then: "report-oxygen" },
      ], null);
  }

  /* ---- pain (scenario 2: flank pain pathway) ---- */
  if (has(t, /pain|hurts|ache|sore|cramp/) && has(t, /back|side|flank|kidney|lower|belly|stomach|abdom/)) {
    return T("pain", ["I hear you. That sounds painful. On a scale of one to ten, how bad is it?"],
      [{ type: "log", text: "Reported pain in the lower back or side.", severity: "minor" }], "pain-score");
  }

  /* ---- mood and mental support ---- */
  const mood = MOODS.find((m) => m.words.test(t) && has(t, /feel|i'?m|i am|bit|so|really|pretty|quite/));
  if (mood) {
    const activity: "earth" | "breathing" | undefined = mood.id === "low" ? "earth" : mood.id === "stressed" || mood.id === "tired" ? "breathing" : undefined;
    const turn = T("mood", [mood.reply], [{ type: "mood", mood: mood.id }, { type: "log", text: `Mood check-in: ${mood.label}.`, severity: "info" }], activity ? "offer-activity" : null);
    return { ...turn, offer: activity };
  }
  if (has(t, /breath(e|ing)|calm (me )?down|relax/)) return T("breathing", ["Let's breathe together. Follow the circle and my voice."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "breathing" }]);
  if (has(t, /trivia|quiz|game|play something|bored/)) return T("trivia", ["Space trivia it is. Three questions. Winner gets bragging rights and nothing else."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "trivia" }]);
  if (has(t, /earth|home|window|view/)) return T("earth", ["Let's look at home for a minute."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "earth" }]);
  if (has(t, /journal|diary|good thing|grateful|gratitude/)) return T("journal", ["Tell me one good thing about today. I'll keep it in your journal."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "journal" }]);

  /* ---- jokes (humor follows severity) ---- */
  if (has(t, /joke|make me laugh|funny|cheer me up/)) {
    if (alert) return T("joke-declined", ["Let's sort this out first. Jokes after, I promise."]);
    return tellJoke(c);
  }

  /* ---- vitals ---- */
  if (has(t, /how am i|how'?s my|how is my|status|vitals|readings|oxygen|heart rate|check me|am i ok/)) {
    return T("vitals", [vitalsSummary(c)]);
  }

  /* ---- small talk ---- */
  if (has(t, /^(hey|hi|hello|good (morning|evening|afternoon))\b|^cosmo\b/) && t.split(" ").length < 5) {
    const top = topCondition(c);
    return T("greeting", [top ? `Hi! I'm here. One thing on my list: ${top.title.toLowerCase()}. How are you feeling?` : "Hi! Everything looks good on my side. How are you feeling?"]);
  }
  if (has(t, /thank/)) return T("thanks", [alert ? "Of course. I'm right here." : "Anytime. Looking after you is literally my whole job."]);
  if (has(t, /who are you|what are you|what can you do|help/)) {
    return T("about", ["I'm Cosmo, your health companion. I watch your band and shirt, learn what normal looks like for you, and talk you through approved steps when something's off. I also tell jokes. Some of them are good."]);
  }

  return T("unknown", ["I'm not sure I got that. You can tell me how you feel, ask about your readings, or ask for a joke."], [], c.pending);
}

export function tellJoke(c: BrainContext): Turn {
  const j = JOKES[c.jokeIndex % JOKES.length];
  return { intent: "joke", say: [], joke: j, actions: [], pending: null };
}

/** The line Cosmo opens with when a new major condition appears without being asked. */
export function proactiveLine(cond: Condition): string {
  if (cond.id === "low-oxygen") return `I need your attention. Your oxygen just dropped to ${cond.short.split(",")[0].replace("SpO2 ", "")}. ${cond.steps[0]} Is a crewmate with you?`;
  return `I need your attention. ${cond.title}. ${cond.steps[0]}`;
}
