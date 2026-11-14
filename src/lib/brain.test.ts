/**
 * Voice command test scenarios for Cosmo's brain. Run with `npm test`.
 *
 * Three layers are exercised together, as in the app: the rules layer
 * (evaluate) decides the conditions, the brain decides the reply, and a small
 * simulator applies the brain's actions (scenario phase, reports, fast-forward
 * rechecks) the way DeviceOS does.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deviation } from "./baseline";
import { feelingOf, oxygenReport, parseScore, respond, yesNo, type BrainContext, type Pending, type Turn } from "./brain";
import { crewStatus, evaluate, type Report } from "./conditions";
import type { StreamPhase } from "./stream";
import { VITAL, type VitalKey } from "./vitals";
import { parseWake } from "./wake";
import { observe } from "./watch";

/* ---------- fake sensors ---------- */
const levelOf = (cz: number) => (cz < 2 ? 0 : cz < 3 ? 1 : cz < 4 ? 2 : 3) as Deviation["level"];
function dev(key: VitalKey, recent: number, mean: number, sd: number): Deviation {
  const z = (recent - mean) / sd;
  const c = VITAL[key].concern;
  const cz = c === "high" ? z : c === "low" ? -z : c === "both" ? Math.abs(z) : 0;
  return { key, value: recent, recent, mean, sd, z, level: levelOf(cz), frozen: false, n: 4000 };
}
const SCENE: Record<StreamPhase, Partial<Record<VitalKey, number>>> = {
  normal: {},
  hypoxia: { spo2: 93, heartRate: 74, respRate: 17 },
  "hypoxia-severe": { spo2: 87, heartRate: 82, respRate: 21 },
  "flank-pain": { heartRate: 90, respRate: 20, hrv: 25, stress: 62 },
  stress: { heartRate: 84, hrv: 27, stress: 58, respRate: 17 },
};
function devsFor(phase: StreamPhase): Record<VitalKey, Deviation> {
  const s = SCENE[phase];
  return {
    heartRate: dev("heartRate", s.heartRate ?? 66, 66, 5),
    hrv: dev("hrv", s.hrv ?? 45, 45, 7),
    spo2: dev("spo2", s.spo2 ?? 97, 97, 1.2),
    respRate: dev("respRate", s.respRate ?? 15, 15, 1.5),
    skinTemp: dev("skinTemp", 33.6, 33.6, 0.2),
    stress: dev("stress", s.stress ?? 30, 30, 6),
    activity: dev("activity", 10, 20, 10),
  };
}

/* ---------- a tiny DeviceOS: applies actions and fast-forward rechecks ---------- */
function session(init: { phase?: StreamPhase; pending?: Pending; reports?: Report[] } = {}) {
  const st = { phase: init.phase ?? "normal" as StreamPhase, reports: init.reports ?? [] as Report[], pending: init.pending ?? null as Pending,
    jokeIndex: 0, factIndex: 0, lastSaid: [] as string[], lastIntent: undefined as string | undefined, requests: [] as string[] };
  const ctx = (): BrainContext => {
    const devs = devsFor(st.phase);
    const conditions = evaluate(devs, st.phase, st.reports);
    return { devs, conditions, status: crewStatus(conditions), phase: st.phase, pending: st.pending, jokeIndex: st.jokeIndex, factIndex: st.factIndex,
      lastSaid: st.lastSaid, lastIntent: st.lastIntent, clock: "10:15:00", stepsToday: 4200 };
  };
  const apply = (turn: Turn, out: Turn[]) => {
    out.push(turn);
    for (const a of turn.actions) {
      if (a.type === "phase") st.phase = a.phase;
      if (a.type === "report" && !st.reports.some((r) => r.kind === a.kind)) st.reports.push({ kind: a.kind, at: "10:15" });
      if (a.type === "clearReport") st.reports = st.reports.filter((r) => r.kind !== a.kind);
      if (a.type === "request") st.requests.push(a.what);
    }
    st.pending = turn.pending;
    st.lastIntent = turn.intent;
    st.lastSaid = turn.say;
    if (turn.joke) st.jokeIndex++;
    if (turn.fact) st.factIndex++;
    const ff = turn.actions.find((a) => a.type === "fastForward");
    if (ff && ff.type === "fastForward") apply(oxygenReport(ctx(), ff.then === "recheck-oxygen"), out);
  };
  return {
    st, ctx,
    /** Say one line; returns Cosmo's turns (a fast-forward adds the recheck turn). */
    say(text: string) { const out: Turn[] = []; apply(respond(text, ctx()), out); return out; },
    /** Say several lines; returns every intent in order. */
    run(lines: string[]) { return lines.flatMap((l) => this.say(l)).map((t) => t.intent); },
  };
}
const words = (t: Turn[]) => t.flatMap((x) => [...x.say, ...(x.joke ? [x.joke.setup, x.joke.punch] : [])]).join(" ");

/* ================= parsing ================= */

describe("wake word", () => {
  const cases: [string, boolean, string][] = [
    ["hey cosmo what's my heart rate", true, "what's my heart rate"],
    ["Hey Cosmos, I have a headache", true, "I have a headache"],
    ["hi kosmo", true, ""],
    ["okay cozmo tell me a joke", true, "tell me a joke"],
    ["Cosmo, I feel lonely", true, "I feel lonely"],
    ["so hey cosmo how am i doing", true, "how am i doing"],
    ["tell me about the cosmos", false, "tell me about the cosmos"],
    ["I study cosmology", false, "I study cosmology"],
    ["what a lovely day", false, "what a lovely day"],
  ];
  for (const [text, woke, command] of cases) {
    it(`"${text}"`, () => assert.deepEqual(parseWake(text), { woke, command }));
  }
});

describe("yes / no answers", () => {
  const yes = ["yes", "Yeah.", "yep", "sure", "okay", "a little", "I think so", "uh huh", "Yes I am", "correct", "Yes, it's running.", "um yes", "of course"];
  const no = ["no", "Nope.", "not yet", "No, I'm alone.", "I'm not", "not really", "never", "nah", "no thanks"];
  const unclear = ["I'm not sure", "maybe", "I don't know", "banana", ""];
  for (const t of yes) it(`yes: "${t}"`, () => assert.equal(yesNo(t), "yes"));
  for (const t of no) it(`no: "${t}"`, () => assert.equal(yesNo(t), "no"));
  for (const t of unclear) it(`unclear: "${t}"`, () => assert.equal(yesNo(t), null));
});

describe("pain scores", () => {
  const cases: [string, number | null][] = [["about a seven", 7], ["8 out of 10", 8], ["ten", 10], ["it's like a 3", 3], ["no idea", null]];
  for (const [t, n] of cases) it(`"${t}" -> ${n}`, () => assert.equal(parseScore(t), n));
});

describe("feelings ignore negation", () => {
  it("lonely", () => assert.equal(feelingOf("i feel so lonely")?.id, "lonely"));
  it("not lonely", () => assert.equal(feelingOf("i'm not feeling lonely"), undefined));
  it("not stressed", () => assert.equal(feelingOf("i'm not stressed at all"), undefined));
});

/* ================= one-line commands ================= */

describe("single commands", () => {
  const table: [string, string][] = [
    // body
    ["Hey Cosmo, I've had a headache all morning", "symptoms"],
    ["I feel dizzy", "symptoms"],
    ["I'm so tired", "symptoms"],
    ["I've got a sharp pain in my lower back on the right side", "pain"],
    ["my knee hurts", "pain"],
    ["my shoulder hurts, about a 3", "pain-score"],
    ["I feel sick", "nausea"],
    ["I couldn't sleep last night", "sleep"],
    ["I have a cough", "cold"],
    ["I'm thirsty", "thirst"],
    // emergencies
    ["my chest hurts", "chest-pain"],
    ["I can't breathe", "cant-breathe"],
    ["I think I'm going to faint", "faint"],
    ["help me", "emergency"],
    // mind
    ["I'm feeling lonely", "feeling"],
    ["I feel depressed", "feeling"],
    ["I'm stressed about the spacewalk tomorrow", "feeling"],
    ["I miss my family", "feeling"],
    ["I'm so anxious", "feeling"],
    ["I'm bored", "feeling"],
    ["I'm really frustrated with my crewmate", "feeling"],
    ["I feel great today", "mood-great"],
    ["I'm fine", "mood-okay"],
    // readings
    ["what's my heart rate", "vital-hr"],
    ["what's my oxygen", "vital-o2"],
    ["how's my breathing", "vital-rr"],
    ["what's my temperature", "vital-temp"],
    ["what's my stress level", "vital-stress"],
    ["how did I sleep", "vital-sleep"],
    ["how many steps today", "vital-steps"],
    ["what's my radiation dose", "vital-radiation"],
    ["what's my blood pressure", "vital-bp"],
    ["how am I doing", "vitals"],
    ["show me my vitals", "navigate"],
    ["open the mind tab", "navigate"],
    ["show me the earth link", "navigate"],
    // fun
    ["tell me a joke", "joke"],
    ["make me laugh", "joke"],
    ["tell me a fun fact", "fact"],
    ["let's play trivia", "trivia"],
    ["help me calm down", "breathing"],
    ["show me the earth", "earth"],
    ["I want to write in my journal", "journal"],
    ["sing me a song", "music"],
    // small talk
    ["how are you", "how-are-you"],
    ["who made you", "creator"],
    ["are you human", "are-you-real"],
    ["do you sleep", "do-you-sleep"],
    ["you're the best", "compliment"],
    ["thank you", "thanks"],
    ["good night", "goodnight"],
    ["bye", "bye"],
    ["what time is it", "time"],
    ["what day is it", "day"],
    ["what's the weather like", "weather"],
    ["what can you do", "about"],
    ["hello", "greeting"],
    ["stop", "stop"],
    ["blah blah blah", "unknown"],
  ];
  for (const [text, intent] of table) {
    it(`"${text}" -> ${intent}`, () => assert.equal(session().say(text)[0].intent, intent));
  }

  it("every reply is non-empty", () => {
    for (const [text] of table) {
      const t = session().say(text);
      assert.ok(words(t).length > 0, text);
    }
  });

  it("'say that again' repeats the last line and keeps the question open", () => {
    const s = session();
    const first = s.say("I'm feeling lonely")[0];
    const again = s.say("sorry, say that again")[0];
    assert.deepEqual(again.say, first.say);
    assert.equal(again.pending?.kind, "explore");
  });

  it("a stray yes with nothing pending gets a graceful reply", () => {
    assert.equal(session().say("yes")[0].intent, "lost");
  });
  it("two unknowns in a row give different help", () => {
    const s = session();
    const a = s.say("purple monkey dishwasher")[0], b = s.say("zebra crossing quantum")[0];
    assert.notDeepEqual(a.say, b.say);
  });
});

/* ================= mental health: ask first, suggest later ================= */

describe("feelings are explored before anything is suggested", () => {
  for (const line of ["I'm feeling lonely", "I feel depressed", "I'm sad", "I'm anxious", "I feel so alone up here"]) {
    it(`"${line}" gets a question, not a suggestion`, () => {
      const t = session().say(line)[0];
      assert.equal(t.intent, "feeling");
      assert.match(t.say.join(" "), /\?/);
      assert.doesNotMatch(t.say.join(" "), /earth window|miss(ing)? home|breathing|joke/i);
      assert.equal(t.actions.some((a) => a.type === "mind" || a.type === "tab"), false);
    });
  }

  it("lonely: cause -> how long -> what helps -> plan -> check back later", () => {
    const s = session({ phase: "stress", pending: { kind: "check-in", topic: "stress" } });
    const intents = s.run([
      "Not really. I've been feeling kind of lonely.",
      "It's my daughter's birthday today, and I'm missing it.",
      "Mostly today.",
      "Talking to my family usually helps.",
      "Yes, please.",
      "Yes, thanks Cosmo.",
    ]);
    assert.deepEqual(intents, ["feeling", "explore-cause", "explore-duration", "plan-offer", "plan-done", "check-later"]);
    assert.deepEqual(s.st.requests, ["family-call"]);
    assert.ok(s.st.reports.some((r) => r.kind === "low-mood"));
    assert.equal(s.st.pending, null);
  });

  it("a cause given up front skips the cause question", () => {
    const t = session().say("I'm stressed because of the spacewalk tomorrow")[0];
    assert.equal(t.pending?.kind, "explore");
    assert.equal(t.pending && "stage" in t.pending ? t.pending.stage : "", "helps");
  });

  it("weeks of low mood also offers a private psychological conference", () => {
    const s = session();
    const intents = s.run(["I feel depressed", "work has been crushing me", "for weeks now", "going for a run", "yes", "yes"]);
    assert.deepEqual(intents, ["feeling", "explore-cause", "explore-duration", "plan-offer", "plan-done", "plan-done"]);
    assert.deepEqual(s.st.requests, ["exercise", "psych-conference"]);
  });

  it("'I don't know what helps' offers options, then backs off politely", () => {
    const s = session();
    const intents = s.run(["I'm sad", "I don't know", "mostly today", "I don't know", "no", "no"]);
    assert.deepEqual(intents, ["feeling", "explore-cause", "explore-duration", "plan-offer", "offer-alt", "offer-none"]);
    assert.equal(s.st.pending, null);
  });

  it("each helper maps to its plan", () => {
    const cases: [string, string][] = [
      ["calling my wife", "family-call"], ["talking to a psychologist", "psych-conference"], ["hanging out with the crew", "crew-company"],
      ["a workout", "exercise"], ["listening to music", "quiet"], ["looking out the window", "earth"], ["writing in my diary", "journal"],
      ["meditating", "breathing"], ["sleeping", "rest"], ["a good laugh", "joke"], ["playing a game", "trivia"],
    ];
    for (const [helps, plan] of cases) {
      const s = session({ pending: { kind: "explore", feeling: "bored", stage: "helps" } });
      const t = s.say(helps)[0];
      assert.equal(t.intent, "plan-offer", helps);
      assert.equal(t.pending?.kind === "offer" && t.pending.offer.kind === "plan" ? t.pending.offer.plan : "", plan, helps);
    }
  });

  it("the mission log never gets the details", () => {
    const s = session();
    const turns = ["I'm feeling lonely", "my husband and I had a fight before launch"].flatMap((l) => s.say(l));
    const logs = turns.flatMap((t) => t.actions.filter((a) => a.type === "log").map((a) => (a.type === "log" ? a.text : "")));
    assert.ok(logs.every((l) => !/husband|fight/i.test(l)));
  });
});

describe("crisis", () => {
  for (const line of ["I want to kill myself", "I don't want to be here anymore", "everyone would be better off without me", "I want to hurt myself"]) {
    it(`"${line}" -> urgent support`, () => {
      const t = session().say(line)[0];
      assert.equal(t.intent, "crisis");
      assert.equal(t.expect, "yesno");
      assert.ok(t.actions.some((a) => a.type === "request" && a.what === "psych-urgent"));
      assert.ok(t.actions.some((a) => a.type === "report" && a.kind === "crisis"));
      assert.equal(t.joke, undefined);
    });
  }
  it("crisis interrupts any other question", () => {
    const t = session({ pending: { kind: "offer", offer: { kind: "joke" } } }).say("honestly I want to die")[0];
    assert.equal(t.intent, "crisis");
  });
  it("stays yes-or-no, then talks, and never jokes", () => {
    const s = session();
    const turns = ["I don't want to be here anymore", "yes", "no", "yes", "tell me a joke"].flatMap((l) => s.say(l));
    assert.deepEqual(turns.map((t) => t.intent), ["crisis", "yesno", "yesno", "yesno-talk", "joke-declined"]);
    assert.ok(turns.every((t) => !t.joke));
  });
});

/* ================= scenarios ================= */

describe("scenario 1: fatigue and headache (mild hypoxia)", () => {
  it("symptoms -> oxygen report -> rest -> recheck -> joke", () => {
    const s = session();
    const intents = s.run(["Hey Cosmo, I've had a headache all morning and I'm really tired.", "Okay. I'm resting now.", "Much better, thanks.", "Go on then.", "Ha! Good one."]);
    assert.deepEqual(intents, ["symptoms", "report", "rest", "recheck", "recovered", "joke", "laugh"]);
  });
  it("the report names the reading and the personal normal", () => {
    const t = session().say("I have a headache");
    assert.match(words(t), /93 percent.*normal is about 97/);
  });
});

describe("scenario 2: flank pain, crewmate helps", () => {
  it("pain -> score -> crewmate -> guided scan", () => {
    const s = session();
    const intents = s.run(["Hey Cosmo, I've got a sharp pain in my lower back, on the right side.", "About a seven.", "Yes, I'm here. What do you need?", "Ready. I've got the probe.", "Done.", "Done.", "Done."]);
    assert.deepEqual(intents, ["pain", "pain-score", "crewmate-yes", "scan", "scan", "scan", "scan"]);
    assert.equal(s.st.pending, null);
    assert.equal(s.ctx().status, "alert");
  });
});

describe("alone in an emergency: yes-or-no questions", () => {
  it("severe low oxygen, nobody around", () => {
    const s = session({ phase: "hypoxia-severe", pending: { kind: "crewmate", cond: "low-oxygen" } });
    const turns = ["No. I'm alone.", "Yes.", "A little.", "Not yet.", "Yes, it's running.", "Yes.", "Much better.", "Not now, thanks."].flatMap((l) => s.say(l));
    assert.deepEqual(turns.map((t) => t.intent), ["crewmate-no", "yesno", "yesno", "yesno", "yesno", "yesno-recheck", "recheck", "recovered", "no-joke"]);
    // every question while alone can be answered with one word
    for (const t of turns.slice(0, 5)) assert.equal(t.expect, "yesno", t.say.join(" "));
  });
  it("a non-answer re-asks the same question", () => {
    const s = session({ phase: "hypoxia-severe", pending: { kind: "crewmate", cond: "low-oxygen" } });
    const q = s.say("nobody's here")[0].say.at(-1);
    const again = s.say("banana")[0];
    assert.equal(again.intent, "yesno-unclear");
    assert.ok(again.say.join(" ").includes(q!));
  });
  it("flank pain alone ends in a self-guided scan", () => {
    const s = session({ phase: "flank-pain", pending: { kind: "crewmate", cond: "flank-pain" } });
    const intents = s.run(["no", "yes", "no", "no", "yes", "ready", "done", "done", "done"]);
    assert.deepEqual(intents, ["crewmate-no", "yesno", "yesno", "yesno", "yesno-scan", "scan", "scan", "scan", "scan"]);
  });
  it("chest pain alone", () => {
    const s = session();
    const intents = s.run(["my chest hurts", "no", "yes", "no", "no", "yes"]);
    assert.deepEqual(intents, ["chest-pain", "crewmate-no", "yesno", "yesno", "yesno", "yesno-done"]);
  });
  it("generic emergency triage", () => {
    assert.deepEqual(session().run(["emergency!", "yes", "no", "yes"]), ["emergency", "emergency", "emergency", "chest-pain"]);
    assert.deepEqual(session().run(["help me", "no"]), ["emergency", "emergency-ship"]);
  });
});

describe("proactive check-ins", () => {
  it("stress spike: Cosmo notices and asks first", () => {
    const d = devsFor("stress");
    const obs = observe(d, [], evaluate(d, "stress"));
    assert.equal(obs[0]?.id, "stress");
    assert.match(obs[0].say[0], /heart rate is 84.*usual 66.*Are you feeling okay\?/);
  });
  it("falling oxygen: forecast before it leaves the normal range", () => {
    const d = devsFor("normal");
    d.spo2 = dev("spo2", 95.6, 97, 1.2);
    const history = Array.from({ length: 90 }, (_, i) => ({ t: i, spo2: 98.6 - i * (2 / 60) })); // -2 %/min for 90 s
    const obs = observe(d, history, evaluate(d, "normal"));
    assert.equal(obs[0]?.id, "o2-trend");
    assert.match(obs[0].say[0], /drifting down.*could drop below your normal in about a minute/);
  });
  it("a quiet normal day: nothing to say", () => {
    const d = devsFor("normal");
    assert.equal(observe(d, [], evaluate(d, "normal")).length, 0);
  });
  it("answers to a check-in", () => {
    assert.equal(session({ pending: { kind: "check-in", topic: "hr" } }).say("yes I'm fine")[0].intent, "check-in-ok");
    assert.equal(session({ pending: { kind: "check-in", topic: "hr" } }).say("I was just exercising")[0].intent, "check-in-exercise");
    assert.equal(session({ pending: { kind: "check-in", topic: "o2-trend" } }).say("I've got a bit of a headache actually")[0].intent, "symptoms");
    const s = session({ pending: { kind: "check-in", topic: "stress" } });
    assert.deepEqual(s.run(["no", "it's more how I'm feeling", "work"]), ["check-in-not-ok", "open-feelings", "explore-cause"]);
    const p = session({ pending: { kind: "check-in", topic: "stress" } });
    assert.deepEqual(p.run(["not great", "it's physical", "my stomach, about a 4"]), ["check-in-not-ok", "open-where", "pain-score"]);
  });
});

describe("humor follows severity", () => {
  it("jokes at green", () => assert.equal(session().say("tell me a joke")[0].intent, "joke"));
  it("gentle at advisory", () => {
    const t = session({ phase: "hypoxia" }).say("tell me a joke")[0];
    assert.equal(t.intent, "joke");
    assert.match(t.say.join(" "), /gentle/);
  });
  it("off during an alert", () => assert.equal(session({ phase: "hypoxia-severe" }).say("tell me a joke")[0].intent, "joke-declined"));
  it("jokes do not repeat back to back", () => {
    const s = session();
    const a = s.say("tell me a joke")[0].joke, b = s.say("another one")[0].joke;
    assert.notDeepEqual(a, b);
  });
});

describe("wording rules", () => {
  it("never names a drug or a dose", () => {
    const lines = ["I have a headache", "my chest hurts", "I feel sick", "I have a cough", "my knee hurts", "I can't sleep", "I feel depressed", "I want to kill myself"];
    const said = lines.flatMap((l) => session().say(l)).flatMap((t) => t.say).join(" ");
    assert.doesNotMatch(said, /\b(mg|milligram|ibuprofen|paracetamol|acetaminophen|aspirin|tablet|pill|dose of)\b/i);
  });
});
