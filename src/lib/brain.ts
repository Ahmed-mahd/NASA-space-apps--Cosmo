/**
 * Cosmo's dialogue manager (runs on board, no network needed).
 *
 * It understands what the astronaut said (intent + slots), remembers what it
 * just asked (`pending`), and decides what to do next. Every medical sentence
 * is built from the rules layer's conditions and approved steps; this file
 * never invents a medical action. When a language model is configured,
 * /api/cosmo only rewords the draft reply, it never changes the decision.
 *
 * Tests: src/lib/brain.test.ts (npm test).
 */

import mmash from "@/data/clips/mmash-user22.json";
import {
  CRISIS, DURATION_Q, FEELINGS, GROAN_REPLIES, HELPS, HELPS_Q, JOKES, LAUGH_REPLIES, MOODS, OTHER_REFLECT, TOPICS,
  type Feeling, type FeelingId, type MoodId, type PlanId, type TopicId,
} from "@/data/mind";
import { hazards, risks } from "@/data/nasa";
import type { RegionId } from "@/data/regions";
import type { Deviation } from "./baseline";
import { ALONE_CHECKS, type Condition, type CrewStatus, type ReportKind, type YesNoCheck } from "./conditions";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";
import { stripWake } from "./wake";

export type Tab = "body" | "trends" | "mind" | "radiation" | "labs" | "link";
export type MindActivity = "joke" | "trivia" | "breathing" | "earth" | "journal";
export type RequestKind = "family-call" | "psych-conference" | "psych-urgent" | "crew-company" | "exercise" | "quiet" | "rest";
export type CheckTopic = "hr" | "stress" | "o2" | "o2-trend" | "rr" | "temp";

export type Offer =
  | { kind: "joke" }
  | { kind: "activity"; activity: MindActivity }
  | { kind: "plan"; plan: PlanId };

export type Pending =
  | null
  | { kind: "rest" }
  | { kind: "recheck-symptom" }
  | { kind: "pain-score"; region: RegionId | "flank"; label: string; tries: number }
  | { kind: "where" }
  | { kind: "crewmate"; cond: string }
  | { kind: "crew-o2" }
  | { kind: "scan"; step: number; self: boolean }
  | { kind: "yesno"; cond: string; i: number; tries: number }
  | { kind: "emergency"; i: number }
  | { kind: "explore"; feeling: FeelingId; stage: "cause" | "duration" | "helps"; topic?: TopicId; long?: boolean }
  | { kind: "offer"; offer: Offer; long?: boolean; fallback?: boolean }
  | { kind: "check-in"; topic: CheckTopic }
  | { kind: "how-are-you" }
  | { kind: "open"; tries: number }
  | { kind: "check-later" }
  | { kind: "journal-entry" }
  | { kind: "joke-reaction" };

export type Action =
  | { type: "phase"; phase: StreamPhase }
  | { type: "fastForward"; seconds: number; then: FollowUp }
  | { type: "openRegion"; region: RegionId }
  | { type: "tab"; tab: Tab }
  | { type: "focus"; vital: VitalKey }
  | { type: "mind"; activity: MindActivity }
  | { type: "mood"; mood: MoodId }
  | { type: "log"; text: string; severity: "minor" | "major" | "info" }
  | { type: "crewmate"; present: boolean }
  | { type: "scan"; step: number }
  | { type: "report"; kind: ReportKind }
  | { type: "clearReport"; kind: ReportKind }
  | { type: "request"; what: RequestKind }
  | { type: "journal"; text: string };

export type FollowUp = "report-oxygen" | "recheck-oxygen";

export interface BrainContext {
  devs: Record<VitalKey, Deviation>;
  conditions: Condition[];
  status: CrewStatus;
  phase: StreamPhase;
  pending: Pending;
  jokeIndex: number;
  factIndex?: number;
  /** What Cosmo said last, for "say that again". */
  lastSaid?: string[];
  lastIntent?: string;
  clock?: string;
  stepsToday?: number;
}

export interface Turn {
  intent: string;
  say: string[];
  actions: Action[];
  pending: Pending;
  /** A joke split into setup and punchline, spoken with a pause after `say`. */
  joke?: { setup: string; punch: string };
  /** This turn used up a fun fact (so the next one is different). */
  fact?: boolean;
  /** How Cosmo expects the answer, for the on-screen hint. */
  expect?: "yesno" | "number" | "open";
  /** The conversation is over: go back to waiting for "Hey Cosmo". */
  sleep?: boolean;
}

/* ================= helpers ================= */

const r0 = (v: number | null | undefined) => (v == null ? "unknown" : Math.round(v).toString());
const r1 = (v: number | null | undefined) => (v == null ? "unknown" : v.toFixed(1));
const T = (intent: string, say: string[], actions: Action[] = [], pending: Pending = null, extra: Partial<Turn> = {}): Turn =>
  ({ intent, say, actions, pending, ...extra });
const first = (s: string) => s.split(/(?<=[.!?])\s/)[0];

/** Lower-case, curly quotes flattened, wake phrase removed. */
export function normalize(text: string) {
  return stripWake(text.replace(/[’`]/g, "'")).toLowerCase().replace(/\s+/g, " ").trim();
}

const FILLER = /^(?:(?:um+|uh+|er+|erm|well|oh|hmm+|so|ah|look)[\s,.]+)+/;
const UNSURE = /\b(not sure|don'?t know|do not know|no idea|maybe|i can'?t tell|unsure|dunno)\b/;
const YES_START = /^(yes|yeah|yea|yep|yup|ya|yah|sure|ok|okay|alright|all right|correct|right|affirmative|definitely|absolutely|of course|certainly|uh[- ]?huh|mm[- ]?hmm|please|go ahead|go on|do it|i am|i do|i have|i did|i can|i will|i think so|it is|it does|that'?s right|sounds good|let'?s do it|let'?s go|why not|a little|a bit|kind of|sort of|slightly|i guess|done|ready)\b/;
const NO_START = /^(no|nope|nah|negative|not really|not yet|not at all|not now|no thanks|never|i'?m not|i am not|i don'?t|i do not|i haven'?t|i have not|i didn'?t|i did not|i can'?t|i cannot|it isn'?t|it is not|it'?s not|it doesn'?t|nobody|no one|none|not)\b/;
const YES_ANY = /\b(yes|yeah|yep|yup|sure|okay|correct|affirmative|definitely|absolutely)\b/;
const NO_ANY = /\b(no|nope|nah|negative|not)\b/;

/** One-word answers, the way a tired astronaut actually says them. */
export function yesNo(raw: string): "yes" | "no" | null {
  const t0 = normalize(raw);
  if (/^(uh[- ]?huh|mm[- ]?hmm|mhm)\b/.test(t0)) return "yes";
  const t = t0.replace(FILLER, "").trim();
  if (!t) return null;
  if (UNSURE.test(t)) return null;
  if (NO_START.test(t)) return "no";
  if (YES_START.test(t)) return "yes";
  const y = YES_ANY.test(t), n = NO_ANY.test(t);
  if (y && !n) return "yes";
  if (n && !y) return "no";
  return null;
}

const WORDNUM: [string, number][] = [["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10]];
/** "about a seven", "7 out of 10", "eight" -> number. */
export function parseScore(t: string): number | null {
  const d = t.match(/\b(10|[0-9])\b/);
  if (d) return Number(d[1]);
  for (const [w, n] of WORDNUM) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  return null;
}

/** A feeling word that is not negated ("I'm not stressed" is not stress). */
export function feelingOf(t: string): Feeling | undefined {
  for (const f of FEELINGS) {
    const m = f.words.exec(t);
    if (m && !/\b(not|n't|never|no longer|isn't|aren't)\s+(?:\w+\s+)?$/.test(t.slice(0, m.index))) return f;
  }
  return undefined;
}
const topicOf = (t: string): TopicId => TOPICS.find((x) => x.words.test(t))?.id ?? "other";
const reflectFor = (id: TopicId) => TOPICS.find((x) => x.id === id)?.reflect ?? OTHER_REFLECT;
const planOf = (t: string, topic?: TopicId): PlanId => {
  const p = HELPS.find((h) => h.words.test(t))?.plan;
  if (p) return p;
  if (/talk/.test(t)) return topic === "family" ? "family-call" : "crew-company";
  return "options";
};

/* ---- what the astronaut might say ---- */
const HYPOXIA_SYM = /headache|head (hurts|is pounding|aches|is killing)|tired|fatigue|exhausted|worn out|dizz|light.?headed|confus|foggy|blurr|vision|seeing (spots|double)|short of breath|breathless|out of breath|hard to breathe/;
const CANT_BREATHE = /can'?t breathe|cannot breathe|can'?t get (enough )?air|suffocat|choking/;
const CHEST = /chest (pain|hurts|is tight|tightness|pressure|feels)|pain in my chest|my chest (hurts|is tight|feels tight)|heart attack/;
const FAINT = /pass(ing)? out|going to faint|\bfaint|black(ing)? out/;
const EMERGENCY = /\b(emergency|mayday)\b|^(please )?(help|help me|i need help)[!. ]*$|something'?s (really )?wrong|something is (really )?wrong/;
/** A direct request in the middle of a feelings conversation ("tell me a joke") is a request, not an answer. */
const COMMAND = /\b(tell me a joke|joke|trivia|quiz|heart rate|oxygen|what time|show me|open the|breathing exercise)\b/;
const PAIN = /\bpain|hurts?\b|hurting|\bache|aching|\bsore\b|cramp|stinging/;
const FLANK = /flank|kidney|lower back|low back|side of my back|(right|left) side|my side\b/;
const PAIN_AREAS: [RegExp, RegionId, string][] = [
  [/\beyes?\b|vision/, "eyes", "eye"],
  [/\bears?\b/, "inner-ear", "ear"],
  [/stomach|belly|\bgut\b|tummy|abdom/, "gut-skin", "stomach"],
  [/back|spine|neck/, "muscles", "back"],
  [/knee|hip|joint|bone|wrist|ankle|elbow/, "bones", "joint"],
  [/\barms?\b|\blegs?\b|shoulder|muscle|thigh|calf|\bhands?\b|\bfoot\b|\bfeet\b/, "muscles", "muscle"],
  [/tooth|teeth|\bjaw\b|mouth|throat/, "immune", "mouth and throat"],
  [/skin|rash|itch/, "gut-skin", "skin"],
];
const NAUSEA = /nause|feel(ing)? sick|sick to my stomach|throw(ing)? up|threw up|vomit|motion sick|space sick|queasy|spinning/;
const SLEEPLESS = /can'?t sleep|couldn'?t sleep|insomnia|trouble sleeping|slept (badly|bad|terribly|poorly)|didn'?t sleep|no sleep|awake all night|sleep (was )?(bad|terrible)/;
const COLD = /cough|\bcold\b|fever|sore throat|runny nose|sneez|congest|\bflu\b|chills/;
const POSITIVE = /\b(great|amazing|awesome|fantastic|excellent|wonderful|happy|good mood|really good|so good|brilliant|excited|on top of the world)\b/;
const OK_MOOD = /^(i'?m |i am |i feel |feeling |pretty |doing )*(okay|ok|fine|alright|all right|not bad|good(?! (night|morning|evening|afternoon|job|one|bot)))\b/;
const BETTER = /\b(feel|feeling|i'?m|i am)\s+(much |a lot |a bit |way )?(better|good now|okay now|fine now)\b/;
const OK_WORDS = /\b(fine|good|great|okay|ok|alright|all right|all good|no problem|never better|i'?m good)\b/;
const NOT_OK = /\b(not (really|great|good|okay|ok|well|so good|fine|alright)|bad|terrible|awful|meh|rough|struggling|could be better)\b|^no\b/;
const EXERCISED = /exercis|work(ing|ed)? ?out|running|treadmill|\bbike\b|just (moved|moving)|was moving|training|lifting/;

/* ================= readings ================= */

function vitalsSummary(c: BrainContext) {
  const d = c.devs;
  const parts = [`Heart rate ${r0(d.heartRate.recent)}`, `oxygen ${r0(d.spo2.recent)} percent`, `breathing ${r0(d.respRate.recent)} a minute`];
  const off = c.conditions.filter((x) => x.id !== "short-sleep");
  if (!off.length) return `${parts.join(", ")}. All inside your normal.`;
  return `${parts.join(", ")}. One thing I'm watching: ${off[0].title.toLowerCase()}.`;
}

function topCondition(c: BrainContext) {
  return [...c.conditions].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1))[0];
}

const FACTS = [...hazards.flatMap((h) => h.facts), ...risks.flatMap((r) => r.numbers)].filter((f) => f.length < 170);

function vitalAnswer(t: string, c: BrainContext): Turn | null {
  const d = c.devs;
  const show = /\b(show|open|chart|graph|trend)\b/.test(t);
  const focus = (k: VitalKey): Action[] => (show ? [{ type: "focus", vital: k }] : []);
  const vs = (dev: Deviation) => (dev.level >= 1 ? " That's outside your usual range, so I'm keeping an eye on it." : " That's normal for you.");
  if (/heart ?rate variability|\bhrv\b|variability/.test(t))
    return T("vital-hrv", [`Your heart rate variability is ${r0(d.hrv.recent)} milliseconds. Your normal is about ${r0(d.hrv.mean)}. Higher usually means more relaxed.`], focus("hrv"));
  if (/heart ?rate|pulse|\bhr\b|heartbeat|\bbpm\b/.test(t))
    return T("vital-hr", [`Your heart rate is ${r0(d.heartRate.recent)}. Your normal is about ${r0(d.heartRate.mean)}.${vs(d.heartRate)}`], focus("heartRate"));
  if (/oxygen|spo2|saturation|\bo2\b|\bsats\b/.test(t))
    return T("vital-o2", [`Your oxygen is ${r0(d.spo2.recent)} percent. Your normal is about ${r0(d.spo2.mean)}.${vs(d.spo2)}`], focus("spo2"));
  if (/breathing rate|respiration|respiratory|breaths? (a|per) minute|how fast am i breathing|my breathing/.test(t))
    return T("vital-rr", [`You're breathing ${r0(d.respRate.recent)} times a minute. Your normal is about ${r0(d.respRate.mean)}.${vs(d.respRate)}`], focus("respRate"));
  if (/temperature|\btemp\b/.test(t))
    return T("vital-temp", [`Your skin temperature is ${r1(d.skinTemp.recent)} degrees, against your normal of ${r1(d.skinTemp.mean)}. That one is simulated in this demo.`], focus("skinTemp"));
  if (/stress (level|index|score|reading)|how stressed|my stress/.test(t))
    return T("vital-stress", [`Your stress index is ${r0(d.stress.recent)} out of 100. Your normal is about ${r0(d.stress.mean)}. I work it out from your heart rate and HRV.`], focus("stress"));
  if (/how (did|much|long) (i|did i) sleep|my sleep|sleep (last night|score|data)|last night'?s sleep/.test(t)) {
    const s = mmash.sleep, min = s.totalSleepMin ?? 0;
    return T("vital-sleep", [`You slept ${Math.floor(min / 60)} hours ${min % 60} minutes and woke up ${s.awakenings} times.${min < 360 ? " That's short, so let's protect tonight's sleep." : " That's a decent night."}`], [{ type: "openRegion", region: "brain" }]);
  }
  if (/\bsteps\b|how (much|far) (have i|did i) (walk|move)|how active/.test(t))
    return T("vital-steps", [`You're at about ${c.stepsToday != null ? c.stepsToday.toLocaleString("en-US") : "a few thousand"} steps today. Your exercise block will do most of the work.`]);
  if (/radiation|\bdose\b|sievert|\bmsv\b/.test(t))
    return T("vital-radiation", ["About 71 millisieverts so far this mission. The dose readings are simulated in this demo."], show ? [{ type: "tab", tab: "radiation" }] : []);
  if (/blood pressure|\bbp\b/.test(t))
    return T("vital-bp", ["Your last cuff reading was 118 over 76, taken at 7:40. That one is a preset value in this demo."]);
  if (/\blabs?\b|blood (test|work|panel)|metabolic|glucose/.test(t))
    return T("vital-labs", ["Your lab panel comes from real Inspiration4 crew data. I've opened it for you."], [{ type: "tab", tab: "labs" }]);
  return null;
}

/* ================= medical flows ================= */

export const SCAN_STEPS = [
  "Put a line of gel on the probe.",
  "Place the probe on the right side of the back, just below the lowest rib, pointing toward the belly button.",
  "Tilt slowly until the bean shape of the kidney fills the screen. Then hold still for five seconds while I record.",
  "Done. I've saved the images with the readings for the flight surgeon. You can wipe off the gel.",
];

/** Words for an oxygen check, built from the rule engine's current output. */
export function oxygenReport(c: BrainContext, recheck: boolean): Turn {
  const o2 = c.devs.spo2, cond = c.conditions.find((x) => x.id === "low-oxygen");
  const normal = r0(o2.mean);
  if (!cond) {
    return {
      intent: recheck ? "recheck" : "report",
      say: recheck
        ? [`Rechecking. Your oxygen is back to ${r0(o2.recent)} percent, inside your normal of about ${normal}. How are you feeling now?`]
        : [`Your oxygen is ${r0(o2.recent)} percent, right where it usually is for you. Let's keep an eye on it, and tell me if it gets worse.`],
      actions: recheck ? [{ type: "log", text: `Recheck: SpO2 ${r0(o2.recent)}%, back inside normal.`, severity: "info" }] : [],
      pending: recheck ? { kind: "recheck-symptom" } : null,
    };
  }
  const steps = cond.steps;
  if (cond.severity === "major") {
    return {
      intent: "report",
      say: [`Your oxygen is ${r0(o2.recent)} percent. That's low, and it needs action now.`, `${steps[0]} Is a crewmate with you?`],
      actions: [{ type: "openRegion", region: "lungs" }],
      pending: { kind: "crewmate", cond: "low-oxygen" },
      expect: "yesno",
    };
  }
  return {
    intent: "report",
    say: [
      `Your oxygen is ${r0(o2.recent)} percent. Your normal is about ${normal}, so that's lower than usual for you, and it can explain the headache and tiredness.`,
      `Here's the plan. ${steps[0]} ${steps[1]} I'll recheck in five minutes.`,
    ],
    actions: [{ type: "openRegion", region: "lungs" }],
    pending: { kind: "rest" },
  };
}

/** The yes/no questions for a condition (also before the rule has caught up). */
const checksFor = (id: string): YesNoCheck[] => ALONE_CHECKS[id] ?? [];

/** Cosmo speaks first when a new major condition appears. */
export function majorAlert(cond: Condition): Turn {
  const lead =
    cond.id === "low-oxygen" ? `I need your attention. Your oxygen just dropped to ${cond.short.split(",")[0].replace("SpO2 ", "")}.`
    : cond.id === "fast-heart" ? `I need your attention. Your heart rate is ${cond.short.split(" ")[0]} while you're resting.`
    : `I need your attention. ${cond.title}.`;
  return T("major-alert", [lead, `${cond.steps[0]} Is a crewmate with you? Yes or no.`],
    [{ type: "openRegion", region: cond.region }], { kind: "crewmate", cond: cond.id }, { expect: "yesno" });
}
/** Kept for older callers. */
export const proactiveLine = (cond: Condition) => majorAlert(cond).say.join(" ");

function crewmateTurn(condId: string, c: BrainContext): Turn {
  const acts: Action[] = [{ type: "crewmate", present: true }, { type: "log", text: "Crewmate present. Cosmo is coaching them.", severity: "info" }];
  if (condId === "flank-pain") {
    return T("crewmate-yes", [
      "Hi, I'm Cosmo. Thanks for helping. Your crewmate has sharp pain on the right side of the lower back, seven out of ten.",
      "Please help them into a stable position, then grab the handheld ultrasound probe. I'll guide you through a quick kidney scan. Say ready when you have it.",
    ], acts, { kind: "scan", step: -1, self: false });
  }
  if (condId === "low-oxygen") {
    return T("crewmate-yes", [
      "Hi, I'm Cosmo. Thanks for coming. Your crewmate's oxygen is low.",
      "Please keep them still and help them follow the vehicle's emergency oxygen procedure. Say done when it's running.",
    ], acts, { kind: "crew-o2" });
  }
  if (condId === "crisis") {
    return T("crewmate-yes", ["Hi. Thanks for being here. Your crewmate could use some company right now. Please just stay with them. The support team on Earth is being called."], acts);
  }
  const what = condId === "chest-pain" ? "has chest pain" : condId === "fast-heart" || condId === "faint" ? "has a very fast heart rate at rest" : "needs help";
  void c;
  return T("crewmate-yes", [
    `Hi, I'm Cosmo. Thanks for coming. Your crewmate ${what}.`,
    "Please keep them still and stay with them. I've sent their readings to the flight surgeon and I'm rechecking every minute.",
  ], acts);
}

function aloneStart(condId: string, c: BrainContext): Turn {
  const checks = checksFor(condId);
  const acts: Action[] = [{ type: "crewmate", present: false }];
  if (!checks.length) {
    const cond = c.conditions.find((x) => x.id === condId);
    return T("crewmate-no", [`Okay. I'll stay with you the whole time. ${cond ? cond.steps[0] : "Stay still."} Tell me straight away if anything changes.`], acts);
  }
  return T("crewmate-no", [
    "Okay. I'm staying with you the whole time. I'll ask simple yes or no questions, so you don't have to talk much.",
    checks[0].q,
  ], [...acts, { type: "log", text: "No crewmate present. Cosmo switched to yes-or-no questions.", severity: "major" }],
  { kind: "yesno", cond: condId, i: 0, tries: 0 }, { expect: "yesno" });
}

const CLOSING = "I've sent your answers to the flight surgeon. I'm right here with you.";

function answerYesNo(p: Extract<Pending, { kind: "yesno" }>, a: "yes" | "no", c: BrainContext): Turn {
  const checks = checksFor(p.cond), q = checks[p.i];
  const reply = a === "yes" ? q.yes : q.no;
  const acts: Action[] = [{ type: "log", text: `${q.log}: ${a}.`, severity: "major" }];
  if (q.repeatOn === a && p.tries < 1) {
    return T("yesno", [reply, q.q], acts, { ...p, tries: p.tries + 1 }, { expect: "yesno" });
  }
  const then = a === "yes" ? q.thenYes : q.thenNo;
  if (then === "crewmate") acts.push({ type: "crewmate", present: true });
  if (then === "recheck") {
    return T("yesno-recheck", [reply], [...acts, { type: "phase", phase: "normal" }, { type: "fastForward", seconds: 110, then: "recheck-oxygen" }]);
  }
  if (then === "scan-self") {
    return T("yesno-scan", [reply, "Get the handheld probe from the medical kit. Say ready when you have it."], acts, { kind: "scan", step: -1, self: true });
  }
  if (then === "talk") {
    return T("yesno-talk", [reply], acts, { kind: "explore", feeling: "sad", stage: "cause" });
  }
  const next = checks[p.i + 1];
  if (then === "stop" || !next) return T("yesno-done", [reply, CLOSING], acts);
  void c;
  return T("yesno", [reply, next.q], acts, { kind: "yesno", cond: p.cond, i: p.i + 1, tries: 0 }, { expect: "yesno" });
}

/** Thoughts of self-harm: always handled first, no humor, a person on the line. */
function crisisTurn(): Turn {
  return T("crisis", [
    "I'm really glad you told me. You're not alone in this, and I'm staying right here with you.",
    "I'm asking the flight surgeon for an urgent private conference now.",
    checksFor("crisis")[0].q,
  ], [
    { type: "report", kind: "crisis" },
    { type: "request", what: "psych-urgent" },
    { type: "log", text: "Urgent private conference requested. Details kept private.", severity: "major" },
  ], { kind: "yesno", cond: "crisis", i: 0, tries: 0 }, { expect: "yesno" });
}

function chestTurn(): Turn {
  return T("chest-pain", ["I'm treating chest pain as urgent. Stop what you're doing and stay still.", "Is a crewmate with you?"],
    [{ type: "report", kind: "chest-pain" }, { type: "openRegion", region: "heart" }, { type: "log", text: "Reported chest pain.", severity: "major" }],
    { kind: "crewmate", cond: "chest-pain" }, { expect: "yesno" });
}

function breathTurn(): Turn {
  return T("cant-breathe", ["I'm here. Stop moving and stay still.", "Is a crewmate with you?"],
    [{ type: "phase", phase: "hypoxia-severe" }, { type: "openRegion", region: "lungs" }, { type: "log", text: "Reported trouble breathing.", severity: "major" }],
    { kind: "crewmate", cond: "low-oxygen" }, { expect: "yesno" });
}

const EMERGENCY_QS = ["Is this a medical emergency?", "Are you having trouble breathing?", "Do you have chest pain?", "Are you injured or bleeding?"];
function emergencyStep(i: number, a: "yes" | "no"): Turn {
  if (i === 0) {
    return a === "yes"
      ? T("emergency", ["Okay. I'm with you.", EMERGENCY_QS[1]], [], { kind: "emergency", i: 1 }, { expect: "yesno" })
      : T("emergency-ship", ["Okay. For ship emergencies, follow the vehicle's emergency procedures. I'm still watching your health."]);
  }
  if (i === 1) return a === "yes" ? breathTurn() : T("emergency", [EMERGENCY_QS[2]], [], { kind: "emergency", i: 2 }, { expect: "yesno" });
  if (i === 2) return a === "yes" ? chestTurn() : T("emergency", [EMERGENCY_QS[3]], [], { kind: "emergency", i: 3 }, { expect: "yesno" });
  return a === "yes"
    ? T("injury", ["Press firmly on it with something clean, and stay still. I'm alerting the crew and the flight surgeon.", "Is a crewmate with you?"],
        [{ type: "log", text: "Reported an injury.", severity: "major" }], { kind: "crewmate", cond: "injury" }, { expect: "yesno" })
    : T("emergency-open", ["Okay. Tell me in a few words what's happening."], [], { kind: "open", tries: 0 }, { expect: "open" });
}

function painTurn(t: string, c: BrainContext): Turn | null {
  if (!PAIN.test(t)) return null;
  if (FLANK.test(t)) {
    return T("pain", ["I hear you. That sounds painful. On a scale of one to ten, how bad is it?"],
      [{ type: "log", text: "Reported pain in the lower back or side.", severity: "minor" }],
      { kind: "pain-score", region: "flank", label: "lower back", tries: 0 }, { expect: "number" });
  }
  const area = PAIN_AREAS.find(([re]) => re.test(t));
  if (!area) return null;
  const [, region, label] = area;
  const n = parseScore(t);
  if (n != null) return painScored(n, region, label, c);
  const extra = label === "back" ? " Your spine lengthens a little up here, which is one reason back aches are common in space." : "";
  return T("pain", [`Sorry, that doesn't sound fun.${extra} On a scale of one to ten, how bad is it?`],
    [{ type: "openRegion", region }, { type: "log", text: `Reported ${label} pain.`, severity: "minor" }],
    { kind: "pain-score", region, label, tries: 0 }, { expect: "number" });
}

function painScored(n: number, region: RegionId | "flank", label: string, c: BrainContext): Turn {
  if (region === "flank") {
    return T("pain-score", [
      `${n} out of ten. Thank you. I'm treating this as a major alert.`,
      "Stop work and find a stable, comfortable position. Is a crewmate nearby?",
    ], [{ type: "phase", phase: "flank-pain" }, { type: "openRegion", region: "kidneys" }, { type: "log", text: `Reported right flank pain ${n}/10.`, severity: "major" }],
    { kind: "crewmate", cond: "flank-pain" }, { expect: "yesno" });
  }
  void c;
  const acts: Action[] = [{ type: "openRegion", region }, { type: "log", text: `${label[0].toUpperCase()}${label.slice(1)} pain ${n}/10.`, severity: n >= 7 ? "major" : "minor" }];
  if (n >= 7) {
    return T("pain-score", [`${n} out of ten is a lot. I've flagged it to the flight surgeon as a priority and opened the brief with the steps.`, "Rest it and don't push through. I'll check on you in an hour."], acts);
  }
  return T("pain-score", [`Okay, ${n} out of ten. I've logged it. Rest it for now, and tell me if it gets worse.`], acts);
}

/* ================= mental health ================= */

/** Start a feelings conversation: ask what's behind it before suggesting anything. */
function exploreStart(f: Feeling, t: string): Turn {
  const acts: Action[] = [
    { type: "mood", mood: f.mood },
    { type: "log", text: "Mood check-in. Details kept private.", severity: "info" },
    ...(["lonely", "homesick", "sad", "depressed", "anxious", "stressed"].includes(f.id) ? [{ type: "report", kind: "low-mood" } as Action] : []),
  ];
  const topic = topicOf(t);
  const gaveCause = /\b(because|cause|since|about|after|ever since|missed|miss)\b/.test(t) && topic !== "other" && topic !== "unknown";
  if (gaveCause) {
    const nextQ = f.duration ? DURATION_Q : HELPS_Q;
    return T("feeling", [first(f.ask), reflectFor(topic), nextQ], acts,
      { kind: "explore", feeling: f.id, stage: f.duration ? "duration" : "helps", topic }, { expect: "open" });
  }
  return T("feeling", [f.ask], acts, { kind: "explore", feeling: f.id, stage: "cause" }, { expect: "open" });
}

const PLAN_OFFER: Record<PlanId, string> = {
  "family-call": "Then let's set that up. I can request a private family conference for the next communication window. Want me to?",
  "psych-conference": "That's a good instinct. I can request a private psychological conference with the support team on Earth. It's confidential, just you and them. Shall I?",
  "crew-company": "Company helps. Want me to let a crewmate know you'd like a chat? I'll only say that, nothing about how you feel.",
  exercise: "Moving usually lifts the mood, and your exercise block counts. Want me to add a thirty-minute session to your timeline now?",
  quiet: "Good idea. Want me to hold all non-urgent messages for twenty minutes so you can enjoy it? I'll only interrupt if your readings need it.",
  earth: "Then let's go look at home together. Want me to open the Earth window?",
  journal: "Writing it down helps a lot of crews. NASA lists journaling as a countermeasure. Want to start a voice journal entry?",
  breathing: "Let's do that. Want a two-minute breathing session with me?",
  rest: "Rest sounds right. Want me to block thirty quiet minutes on your timeline?",
  joke: "Then I've got just the thing. Want a joke? A gentle one.",
  trivia: "Want a quick round of space trivia, to give your brain something else to chew on?",
  options: "That's okay, it isn't always obvious. Things that help other crews: a minute at the Earth window, a short breathing break, writing it down, or a call with family. Want to try the Earth window with me?",
};

function planOffer(plan: PlanId, long: boolean): Turn {
  const offer: Offer = plan === "options" ? { kind: "activity", activity: "earth" } : { kind: "plan", plan };
  return T("plan-offer", [PLAN_OFFER[plan]], [], { kind: "offer", offer, long }, { expect: "yesno" });
}

const LATER = "I'm here whenever you want to talk. Can I check in on you later today?";

function runOffer(offer: Offer, long: boolean, c: BrainContext): Turn {
  if (offer.kind === "joke") return tellJoke(c);
  const activity = offer.kind === "activity" ? offer.activity
    : offer.plan === "earth" ? "earth" : offer.plan === "journal" ? "journal" : offer.plan === "breathing" ? "breathing" : offer.plan === "trivia" ? "trivia" : null;
  if (activity) return T("activity", ["Opening it now."], [{ type: "tab", tab: "mind" }, { type: "mind", activity }]);
  if (offer.kind === "plan" && offer.plan === "joke") return tellJoke(c, true);
  const plan = offer.kind === "plan" ? offer.plan : "options";
  const done: Partial<Record<PlanId, [RequestKind, string]>> = {
    "family-call": ["family-call", "Done. I've queued a request for a private family conference. It goes to mission control with the next sync, and they'll pick the time."],
    "psych-conference": ["psych-conference", "Requested. The support team will set up a private conference at the next window. What you say there stays between you and them."],
    "crew-company": ["crew-company", "Done. I've told them you'd like some company. Nothing else."],
    exercise: ["exercise", "Added. Thirty minutes on the bike or the treadmill, your choice. I'll watch your heart rate while you go."],
    quiet: ["quiet", "Done. Twenty quiet minutes, starting now."],
    rest: ["rest", "Done. Thirty quiet minutes are blocked on your timeline."],
  };
  const d = done[plan];
  if (!d) return T("activity", ["Opening it now."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "earth" }]);
  const acts: Action[] = [{ type: "request", what: d[0] }];
  if (long && plan !== "psych-conference") {
    return T("plan-done", [d[1], "And because this has been building for a while, I'd also like to request a private psychological conference. It's confidential. Okay?"],
      acts, { kind: "offer", offer: { kind: "plan", plan: "psych-conference" } }, { expect: "yesno" });
  }
  return T("plan-done", [d[1], LATER], acts, { kind: "check-later" }, { expect: "yesno" });
}

/* ================= jokes and fun ================= */

export function tellJoke(c: BrainContext, gentle = false): Turn {
  const j = JOKES[c.jokeIndex % JOKES.length];
  // humor follows severity: gentle while something minor is going on (last night's short sleep doesn't count)
  const minor = c.conditions.some((x) => x.severity === "minor" && x.id !== "short-sleep");
  const lead = gentle || minor ? ["Here's a gentle one."] : [];
  return { intent: "joke", say: lead, joke: j, actions: [], pending: { kind: "joke-reaction" } };
}

function factTurn(c: BrainContext): Turn {
  const f = FACTS[(c.factIndex ?? 0) % FACTS.length];
  return T("fact", [`Here's one from NASA. ${f}`], [], null, { fact: true });
}

/* ================= the answer to "what did you say?" ================= */

function handlePending(t: string, raw: string, c: BrainContext): Turn | null {
  const p = c.pending;
  if (!p) return null;
  switch (p.kind) {
    case "crewmate": {
      const crewNo = /alone|by myself|on my own|nobody|no one|no-one|just me/.test(t);
      const crewYes = !crewNo && /\b(here|with me|next to me|nearby|coming|on (her|his|their) way|beside me)\b/.test(t);
      const a = crewNo ? "no" : crewYes ? "yes" : yesNo(raw);
      if (!a) return T("crewmate-unclear", ["Just yes or no is fine. Is a crewmate with you?"], [], p, { expect: "yesno" });
      return a === "yes" ? crewmateTurn(p.cond, c) : aloneStart(p.cond, c);
    }
    case "yesno": {
      const a = yesNo(raw);
      if (!a) return T("yesno-unclear", [`Just yes or no is fine. ${checksFor(p.cond)[p.i]?.q ?? ""}`], [], p, { expect: "yesno" });
      return answerYesNo(p, a, c);
    }
    case "emergency": {
      const a = yesNo(raw);
      if (!a) return T("emergency-unclear", [`Just yes or no. ${EMERGENCY_QS[p.i]}`], [], p, { expect: "yesno" });
      return emergencyStep(p.i, a);
    }
    case "crew-o2": {
      if (/done|running|started|on\b|ready|okay|ok\b|yes|finished/.test(t)) {
        return T("crew-o2", ["Thank you. Stay with them. I'm rechecking now."],
          [{ type: "log", text: "Crewmate started the emergency oxygen procedure.", severity: "major" }, { type: "phase", phase: "normal" }, { type: "fastForward", seconds: 110, then: "recheck-oxygen" }]);
      }
      return T("crew-o2-wait", ["Take your time. Say done when the procedure is running."], [], p);
    }
    case "scan": {
      if (/ready|got (it|the probe|one)|done|okay|ok\b|next|yes|finished|there\b|in place|holding|i have it|have the probe/.test(t)) {
        const step = p.step + 1;
        const last = step >= SCAN_STEPS.length - 1;
        return T("scan", [SCAN_STEPS[step] + (last ? "" : " Say done when you're there.")],
          [{ type: "scan", step }, ...(last ? [{ type: "log", text: "Kidney ultrasound saved for the flight surgeon.", severity: "info" } as Action] : [])],
          last ? null : { kind: "scan", step, self: p.self });
      }
      return T("scan-wait", ["Take your time. Say done when you're ready."], [], p);
    }
    case "pain-score": {
      const n = parseScore(t);
      if (n != null) return painScored(n, p.region, p.label, c);
      if (p.tries < 1) return T("pain-unclear", ["Just a number from one to ten is fine."], [], { ...p, tries: p.tries + 1 }, { expect: "number" });
      return null;
    }
    case "where": {
      const area = PAIN_AREAS.find(([re]) => re.test(t)) ?? (FLANK.test(t) ? [/x/, "flank", "lower back"] as const : null);
      if (area) {
        const n = parseScore(t);
        if (n != null) return painScored(n, area[1] as RegionId | "flank", area[2], c);
        return T("pain", ["Okay. On a scale of one to ten, how bad is it?"], area[1] === "flank" ? [] : [{ type: "openRegion", region: area[1] as RegionId }],
          { kind: "pain-score", region: area[1] as RegionId | "flank", label: area[2], tries: 0 }, { expect: "number" });
      }
      return null;
    }
    case "rest": {
      if (/rest|ok(ay)?|sure|will do|done|alright|fine|sitting|stopp|yes|resting/.test(t)) {
        return T("rest", ["Good. Breathe normally and stay still. I'm fast-forwarding five minutes of the simulation so you can see me recheck."],
          [{ type: "phase", phase: "normal" }, { type: "fastForward", seconds: 110, then: "recheck-oxygen" }]);
      }
      return null;
    }
    case "recheck-symptom": {
      if (/better|fine|good|gone|great|improv|ok(ay)?|alright/.test(t) && !/not (better|good|great|fine)/.test(t)) {
        return T("recovered", ["Great news. I've logged the whole episode for the flight surgeon.", "And since you're feeling better, can I tell you a joke? It's a good one. Probably."],
          [{ type: "log", text: "Symptoms resolved after rest. Logged for the flight surgeon.", severity: "info" }], { kind: "offer", offer: { kind: "joke" } }, { expect: "yesno" });
      }
      if (/worse|still|same|bad|not (better|good|great)/.test(t)) {
        return T("not-better", ["Thanks for telling me. Let's keep resting and I'll recheck again in five minutes. If it gets worse, I'll raise this to a major alert."],
          [{ type: "fastForward", seconds: 110, then: "recheck-oxygen" }]);
      }
      return null;
    }
    case "offer": {
      const a = yesNo(raw);
      if (a === "yes") return runOffer(p.offer, !!p.long, c);
      if (a === "no") {
        if (p.offer.kind === "joke") return T("no-joke", ["Fair enough. I'll save it for later. It's not getting any less funny."], [], null, { sleep: true });
        if (p.offer.kind === "plan" && p.offer.plan === "psych-conference" && !p.fallback) return T("no-psych", ["That's okay. The option is always there. " + LATER], [], { kind: "check-later" }, { expect: "yesno" });
        if (!p.fallback) {
          const wasEarth = p.offer.kind === "activity" && p.offer.activity === "earth";
          return T("offer-alt", [wasEarth ? "No problem. Would a two-minute breathing break help instead?" : "No problem. Would a minute at the Earth window help instead?"], [],
            { kind: "offer", offer: { kind: "activity", activity: wasEarth ? "breathing" : "earth" }, fallback: true }, { expect: "yesno" });
        }
        return T("offer-none", ["Alright. I'm here whenever you need me. Just say Hey Cosmo."], [], null, { sleep: true });
      }
      return null;
    }
    case "explore": {
      if (HYPOXIA_SYM.test(t) && !feelingOf(t) && p.stage !== "helps") return null;
      if (COMMAND.test(t)) return null;
      if (p.stage === "cause") {
        const topic = topicOf(t);
        const f = FEELINGS.find((x) => x.id === p.feeling)!;
        if (f.duration) return T("explore-cause", [reflectFor(topic), DURATION_Q], [], { ...p, stage: "duration", topic }, { expect: "open" });
        return T("explore-cause", [reflectFor(topic), HELPS_Q], [], { ...p, stage: "helps", topic }, { expect: "open" });
      }
      if (p.stage === "duration") {
        const long = /while|weeks?|days|months|long time|ages|always|since|for a bit|on and off|lately|a lot|building/.test(t) && !/^(just |only |mostly )?today|just now|this morning|tonight\b/.test(t);
        const lead = long ? "Thanks for telling me. When something has been building for a while, it's worth talking to someone trained for it, and I can set that up." : "Okay. Good to know it's recent.";
        return T("explore-duration", [lead, HELPS_Q], [], { ...p, stage: "helps", long }, { expect: "open" });
      }
      return planOffer(planOf(t, p.topic), !!p.long);
    }
    case "check-in": {
      if (feelingOf(t) || HYPOXIA_SYM.test(t) || PAIN.test(t) || NAUSEA.test(t) || CHEST.test(t) || CANT_BREATHE.test(t)) return null;
      if (EXERCISED.test(t)) return T("check-in-exercise", ["That explains it. Your heart rate should settle within a few minutes of rest. I'll keep an eye on it."], [], null, { sleep: true });
      const ok = OK_WORDS.test(t) && !/\bnot (fine|good|great|okay|ok|alright)\b/.test(t);
      const notOk = !ok && (NOT_OK.test(t) || yesNo(raw) === "no");
      if (ok || (!notOk && yesNo(raw) === "yes")) {
        const line = {
          hr: "Good to hear. Maybe you've been moving around. I'll keep watching and tell you if it keeps climbing.",
          stress: "Glad to hear it. If you want a two-minute breather later, just ask.",
          o2: "Good. Take it easy for a few minutes anyway, and tell me straight away if you get a headache or feel tired. I'll keep watching.",
          "o2-trend": "Good. Take it easy for a few minutes anyway, and tell me straight away if you get a headache or feel tired. I'll keep watching.",
          rr: "Okay. Maybe you were moving. I'll keep watching.",
          temp: "Okay. It's a small change. I'll keep watching.",
        }[p.topic];
        return T("check-in-ok", [line], [{ type: "log", text: `Check-in (${p.topic}): astronaut feels okay.`, severity: "info" }], null, { sleep: true });
      }
      if (notOk) return T("check-in-not-ok", ["I'm sorry. Tell me what's going on. Is something hurting, or is it more how you're feeling?"], [], { kind: "open", tries: 0 }, { expect: "open" });
      return null;
    }
    case "how-are-you": {
      if (feelingOf(t) || POSITIVE.test(t) || HYPOXIA_SYM.test(t) || PAIN.test(t)) return null;
      if (OK_WORDS.test(t) && !/\bnot\b/.test(t)) return T("how-ok", ["Glad to hear it. I'm here if you need anything."], [], null, { sleep: true });
      if (NOT_OK.test(t)) return T("how-not-ok", ["I'm sorry to hear that. Do you want to tell me what's going on?"], [], { kind: "explore", feeling: "sad", stage: "cause" }, { expect: "open" });
      return null;
    }
    case "open": {
      if (/feel(ing)?s?\b|inside|emotion|mental|mood|in my head|sad|down/.test(t) && !HYPOXIA_SYM.test(t) && !PAIN.test(t) && !feelingOf(t)) {
        return T("open-feelings", ["Thank you. I'm listening. What's been going on?"], [], { kind: "explore", feeling: "sad", stage: "cause" }, { expect: "open" });
      }
      if (/hurt|pain|physical|body|sick/.test(t) && !PAIN_AREAS.some(([re]) => re.test(t)) && !FLANK.test(t)) {
        return T("open-where", ["Okay. Where does it hurt?"], [], { kind: "where" }, { expect: "open" });
      }
      return null;
    }
    case "check-later": {
      const a = yesNo(raw);
      if (a === "yes") return T("check-later", ["I'll check in after your next work block. Take care of yourself."], [{ type: "log", text: "Cosmo will check in later today.", severity: "info" }], null, { sleep: true });
      if (a === "no") return T("check-later", ["Okay. Just say Hey Cosmo whenever you want to talk."], [], null, { sleep: true });
      return null;
    }
    case "journal-entry": {
      if (yesNo(raw) === "no" && t.split(" ").length < 4) return T("journal-skip", ["No problem. Enjoy the good day."], [], null, { sleep: true });
      return T("journal-saved", ["Saved in your journal. That's a good one to come back to."], [{ type: "journal", text: raw.trim() }, { type: "log", text: "Journal entry saved (private).", severity: "info" }], null, { sleep: true });
    }
    case "joke-reaction": {
      if (/another|one more|again|more|next/.test(t)) return tellJoke(c);
      if (/ha(ha)+|\blol\b|lmao|funny|good one|hilarious|nice one|love it|\bha\b|that'?s great/.test(t) && !/not funny/.test(t))
        return T("laugh", [LAUGH_REPLIES[c.jokeIndex % LAUGH_REPLIES.length]], [], null, { sleep: true });
      if (/bad|terrible|awful|lame|corny|cringe|\bboo\b|ugh|not funny|groan|dad joke|worst/.test(t))
        return T("groan", [GROAN_REPLIES[c.jokeIndex % GROAN_REPLIES.length]], [], null, { sleep: true });
      return null;
    }
  }
  return null;
}

/* ================= main entry ================= */

export function respond(text: string, c: BrainContext): Turn {
  const raw = stripWake(text);
  const t = normalize(text);
  const alert = c.status === "alert";

  if (!t) {
    if (/cosmo|cosmos|kosmo|cozmo/i.test(text)) return T("wake", ["I'm listening."], [], c.pending, { expect: "open" });
    return T("silence", ["I didn't catch that. Try again whenever you're ready."], [], c.pending);
  }

  /* ---- always first: safety ---- */
  if (CRISIS.test(t)) return crisisTurn();
  if (/^(stop|cancel|never ?mind|forget it|be quiet|quiet|shush|shut up|stop talking|enough|that'?s enough)\b/.test(t)) {
    return T("stop", [alert ? "Okay. I'll stay quiet, but I'm still watching. Say Hey Cosmo if you need me." : "Okay."], [], null, { sleep: true });
  }
  if (/\b(repeat( that)?|say (that|it) again|what did you (just )?say|come again|pardon|didn'?t (catch|hear) (that|you))\b/.test(t)) {
    return T("repeat", c.lastSaid?.length ? c.lastSaid : ["I haven't said anything yet. How can I help?"], [], c.pending, { expect: c.pending ? undefined : "open" });
  }
  const inYesNo = c.pending?.kind === "yesno" || c.pending?.kind === "crewmate";
  if (!inYesNo && CHEST.test(t) && !c.conditions.some((x) => x.id === "chest-pain")) return chestTurn();
  if (!inYesNo && CANT_BREATHE.test(t)) return breathTurn();
  if (!inYesNo && FAINT.test(t)) {
    return T("faint", ["Hold on to something steady, or strap in, and stay still.", "Is a crewmate with you?"],
      [{ type: "openRegion", region: "heart" }, { type: "log", text: "Reported feeling faint.", severity: "major" }], { kind: "crewmate", cond: "fast-heart" }, { expect: "yesno" });
  }
  if (!inYesNo && EMERGENCY.test(t)) return T("emergency", ["I'm here.", `${EMERGENCY_QS[0]} Yes or no.`], [], { kind: "emergency", i: 0 }, { expect: "yesno" });

  /* ---- answers to something Cosmo just asked ---- */
  const answered = handlePending(t, raw, c);
  if (answered) return answered;

  /* ---- a question about a reading ("what's my stress level") ---- */
  if (/^(what|how|show|check|tell me|give me|read)\b/.test(t)) {
    const v = vitalAnswer(t, c);
    if (v) return v;
  }

  /* ---- feelings (asked about before anything is suggested) ---- */
  const feeling = feelingOf(t);
  const strongSymptom = /headache|dizz|confus|vision|blurr|breath/.test(t);
  if (feeling && !strongSymptom) return exploreStart(feeling, t);

  /* ---- symptoms (scenario 1: hypoxia pathway) ---- */
  if (HYPOXIA_SYM.test(t)) {
    const syms = ["headache", "tired", "dizz", "confus", "vision", "breath"].filter((s) => t.includes(s));
    return T("symptoms", ["Sorry you're feeling that way. Let me look at your readings."], [
      ...(c.phase === "normal" ? [{ type: "phase", phase: "hypoxia" } as Action] : []),
      { type: "log", text: `Reported: ${syms.join(", ") || "feeling unwell"}.`, severity: "minor" },
      { type: "fastForward", seconds: 100, then: "report-oxygen" },
    ]);
  }

  /* ---- pain (scenario 2 for the flank; other areas get a score and a brief) ---- */
  const pain = painTurn(t, c);
  if (pain) return pain;
  if (NAUSEA.test(t)) {
    return T("nausea", ["Motion sickness is really common up here. NASA says most astronauts get it at some point.", "Keep your head as still as you can for a few minutes. I've logged it and opened the inner-ear brief. How bad is it, one to ten?"],
      [{ type: "openRegion", region: "inner-ear" }, { type: "log", text: "Reported nausea.", severity: "minor" }], { kind: "pain-score", region: "inner-ear", label: "nausea", tries: 0 }, { expect: "number" });
  }
  if (SLEEPLESS.test(t)) {
    const min = mmash.sleep.totalSleepMin ?? 0;
    return T("sleep", [`Sleep is hard up here. You see sixteen sunrises a day. Last night you got ${Math.floor(min / 60)} hours ${min % 60} minutes.`,
      "For tonight: switch the cabin lights to the evening setting an hour before bed, and keep caffeine to the first half of the shift."],
      [{ type: "openRegion", region: "brain" }, { type: "log", text: "Reported poor sleep.", severity: "minor" }]);
  }
  if (COLD.test(t)) {
    const temp = c.devs.skinTemp;
    return T("cold", [`I've logged it for the flight surgeon. Your skin temperature is ${r1(temp.recent)} degrees, ${temp.level ? "a little off your normal" : "inside your normal"}.`, "I've opened the immune brief. Tell me if it gets worse or you start to feel feverish."],
      [{ type: "openRegion", region: "immune" }, { type: "log", text: "Reported cold or flu symptoms.", severity: "minor" }]);
  }
  if (/thirsty|dehydrat/.test(t)) return T("thirst", ["Go and drink some water. Staying hydrated matters even more up here. I'll remind you again in an hour."]);
  if (/hungry|starving/.test(t)) return T("hungry", ["Then it's snack time. Your timeline has a meal break coming up, and your body will thank you."]);

  /* ---- mood ---- */
  if (BETTER.test(t)) {
    const mind = c.conditions.some((x) => x.id === "low-mood");
    return T("better", [mind ? "That's really good to hear. Thank you for telling me." : "Good to hear it."],
      mind ? [{ type: "clearReport", kind: "low-mood" }, { type: "mood", mood: "okay" }] : [], null, { sleep: true });
  }
  if (POSITIVE.test(t) && /\b(i'?m|i am|feel|feeling|today|day|mood)\b/.test(t) && !/\bnot\b/.test(t)) {
    return T("mood-great", ["Love that. What made today a good one? I'll save it in your journal."],
      [{ type: "mood", mood: "great" }, { type: "log", text: "Mood check-in: great.", severity: "info" }], { kind: "journal-entry" }, { expect: "open" });
  }
  if (OK_MOOD.test(t) && t.split(" ").length <= 5) {
    const m = MOODS.find((x) => x.id === "okay")!;
    return T("mood-okay", [m.reply], [{ type: "mood", mood: "okay" }], null, { sleep: true });
  }

  /* ---- screens ---- */
  if (/\b(open|show|go to|switch to|take me to|bring up|display)\b/.test(t)) {
    const nav: [RegExp, Tab, string][] = [
      [/earth link|\blink\b|sync|mission log|\blog\b|flight surgeon report/, "link", "Here's the Earth link and your mission log."],
      [/vitals|trends?|charts?|graphs?|readings/, "trends", "Here are your vitals."],
      [/\bmind\b|mental|wellbeing|well-being/, "mind", "Here's the Mind deck."],
      [/radiation|dose/, "radiation", "Here's your radiation dose."],
      [/\blabs?\b|blood/, "labs", "Here's your lab panel."],
      [/\bbody\b|hologram|anatomy/, "body", "Here's your body map."],
    ];
    const hit = nav.find(([re]) => re.test(t));
    if (hit) return T("navigate", [hit[2]], [{ type: "tab", tab: hit[1] }]);
  }

  /* ---- readings ---- */
  const vital = vitalAnswer(t, c);
  if (vital) return vital;
  if (/how am i( doing)?|status|vitals|readings|check me|am i (ok|okay|alright|healthy|good)|everything (ok|okay|good|alright)|health (check|report)|how'?s my (health|body)/.test(t)) {
    return T("vitals", [vitalsSummary(c)]);
  }

  /* ---- Mind activities ---- */
  if (/breath(e|ing) (exercise|session|with me)|help me (calm|relax)|calm (me )?down|\brelax\b|meditat|let'?s breathe/.test(t))
    return T("breathing", ["Let's breathe together. Follow the circle and my voice."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "breathing" }]);
  if (/trivia|quiz|\bgame\b|play something|test me/.test(t))
    return T("trivia", ["Space trivia it is. Three questions. Winner gets bragging rights and nothing else."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "trivia" }]);
  if (/earth window|look at (the )?earth|show me (the )?earth|see (the )?earth|view of (the )?earth|see home|look at home/.test(t))
    return T("earth", ["Let's look at home for a minute."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "earth" }]);
  if (/journal|diary|write (something|it) down|good thing|grateful|gratitude/.test(t))
    return T("journal", ["Tell me one good thing about today. I'll keep it in your journal."], [{ type: "tab", tab: "mind" }, { type: "mind", activity: "journal" }]);
  if (/\bsing\b|a song|music/.test(t))
    return T("music", ["I'd sing, but mission control asked me not to. Want the Earth window with some ambient sound instead?"], [], { kind: "offer", offer: { kind: "activity", activity: "earth" } }, { expect: "yesno" });

  /* ---- jokes and facts (humor follows severity) ---- */
  const JOKE_REACTION = /not funny|bad joke|that'?s (bad|terrible|awful|lame|corny)|so bad|terrible|cringe|groan|\bboo\b/;
  if (c.lastIntent && /^(joke|laugh|groan)$/.test(c.lastIntent) && JOKE_REACTION.test(t)) {
    return T("groan", [GROAN_REPLIES[(c.jokeIndex + 1) % GROAN_REPLIES.length]], [], null, { sleep: true });
  }
  if (/joke|make me laugh|something funny|say something funny|cheer me up|another one|one more/.test(t) && !/not funny/.test(t)) {
    if (alert) return T("joke-declined", ["Let's sort this out first. Jokes after, I promise."]);
    return tellJoke(c);
  }
  if (/fun fact|tell me something|interesting|did you know|teach me|space fact/.test(t)) return factTurn(c);

  /* ---- small talk ---- */
  if (/how are you|how'?re you|how'?s it going|how are things|how do you feel|you okay\b|what'?s up|how have you been/.test(t)) {
    return T("how-are-you", ["All systems nominal, thanks for asking. More importantly, how are you?"], [], { kind: "how-are-you" }, { expect: "open" });
  }
  if (/who (made|built|created|designed) you|where (do you come|are you) from|who are your (makers|creators)/.test(t))
    return T("creator", ["A team of six in Cairo built me for the NASA Space Apps Challenge 2026. On a real mission I'd run on a small model inside your glove, with no internet needed."]);
  if (/are you (real|human|alive|a person|a robot|an ai|conscious)|are you a machine/.test(t))
    return T("are-you-real", ["I'm an AI. A real one, but not a person. I can't replace your crew or your family, but I can listen anytime and help you reach them."]);
  if (/do you (sleep|dream|get tired|eat|rest)/.test(t))
    return T("do-you-sleep", ["I don't sleep. Someone has to watch your heart rate at three in the morning. I do dream about a bigger battery, though."]);
  if (/\bi love you\b|(you'?re|your|you are) (the )?(best|amazing|awesome|great|cool|brilliant)|good job|well done|nice work|good boy|good bot/.test(t))
    return T("compliment", ["That means a lot. I'm officially your biggest fan, by a few hundred million kilometres."]);
  if (/you'?re (stupid|useless|dumb|annoying|bad|terrible)|i hate you|you suck/.test(t))
    return T("insult", ["Fair. I'll try to do better. And if something's bothering you, I'm still here to listen."]);
  if (/\b(thank|thanks|cheers|appreciate)/.test(t)) return T("thanks", [alert ? "Of course. I'm right here." : "Anytime. Looking after you is literally my whole job."], [], null, { sleep: !alert });
  if (/good ?night|going to (bed|sleep)|time for bed/.test(t)) return T("goodnight", ["Good night. Sleep well. I'll keep watch."], [], null, { sleep: true });
  if (/\b(bye|goodbye|see you|that'?s all|that'?s it|i'?m done|talk later|nothing else|no that'?s all)\b/.test(t))
    return T("bye", ["Anytime. I'll keep watch. Just say Hey Cosmo when you need me."], [], null, { sleep: true });
  if (/what time|the time|time is it/.test(t)) return T("time", [`It's ${c.clock ?? "just after ten"} station time.`]);
  if (/what day|mission day|which day|how long (have we|have i) been|what'?s the date/.test(t)) return T("day", ["Today is day 142 of the mission."]);
  if (/weather|raining|sunny/.test(t)) return T("weather", ["Inside the cabin: comfortable, with zero chance of rain. Outside: a vacuum, so I'd stay in."]);
  if (/where are we|how far (from|are we)|distance (to|from) earth|when (do|will) we (get|go) home/.test(t))
    return T("where", ["We're on day 142, a long way from home. A message to Earth takes a while to arrive, which is exactly why I can think and act right here on board."]);
  if (/your name|who are you|what are you|introduce yourself|what can you do|what do you do|how can you help|help me with|how do you work/.test(t)) {
    return T("about", ["I'm Cosmo, your health companion. I watch your band and shirt, learn what normal looks like for you, and talk you through approved steps when something's off.",
      "You can ask about any reading, tell me how you feel, or ask for a joke, trivia, breathing or the Earth window. Just start with Hey Cosmo."]);
  }
  if (/^(hey|hi|hello|good (morning|evening|afternoon)|yo|howdy|hiya|morning)\b/.test(t) && t.split(" ").length < 6) {
    const top = topCondition(c);
    return T("greeting", [top && top.id !== "short-sleep" ? `Hi! I'm here. One thing on my list: ${top.title.toLowerCase()}. How are you feeling?` : "Hi! Everything looks good on my side. How are you feeling?"],
      [], { kind: "how-are-you" }, { expect: "open" });
  }
  if (/\b(yes|yeah|no|nope|okay|ok)\b/.test(t) && t.split(" ").length <= 2) {
    return T("lost", ["Sorry, I lost track of what we were talking about. What can I do for you?"], [], null, { expect: "open" });
  }

  /* ---- nothing matched ---- */
  if (c.pending && (c.pending.kind === "offer" || c.pending.kind === "check-later" || c.pending.kind === "check-in") && c.lastIntent !== "reask") {
    return T("reask", ["Sorry, I didn't catch that. Was that a yes or a no?"], [], c.pending, { expect: "yesno" });
  }
  if (c.pending?.kind === "open") {
    return c.pending.tries < 1
      ? T("open-unclear", ["Take your time. Is something hurting, or is it more about how you're feeling inside?"], [], { kind: "open", tries: c.pending.tries + 1 }, { expect: "open" })
      : T("open-end", ["Okay. Whenever you're ready, I'm here. Just say Hey Cosmo."], [], null, { sleep: true });
  }
  if (c.lastIntent === "unknown") {
    return T("unknown", ["Still not sure what you mean. Try: how's my oxygen, I feel stressed, or tell me a joke."], [], null, { expect: "open" });
  }
  return T("unknown", ["I'm not sure I got that. You can tell me how you feel, ask about your readings, or ask for a joke."], [], null, { expect: "open" });
}
