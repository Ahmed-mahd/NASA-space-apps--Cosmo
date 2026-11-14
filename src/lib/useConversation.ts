"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { majorAlert, oxygenReport, respond, type Action, type BrainContext, type FollowUp, type Pending, type Turn } from "./brain";
import type { Condition, CrewStatus } from "./conditions";
import type { Deviation } from "./baseline";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";
import { mergeAgent, routeOf, type AgentReply } from "./agent";
import { applyLearn, describe as describeMemory, emptyMemory, learnFromWords, loadMemory, saveMemory, type AstroMemory, type Learn } from "./memory";
import {
  enableWake, followUp, getInterruptSeq, getVoiceState, goToSleep, initVoice, setBargeInHandler, setCommandHandler, setExpecting, setMuted,
  setPatience, setThinking, speak, stopSpeaking, wait, wakePreference, wakeUp,
  type Speaker,
} from "./voice";
import { observe, type Observation } from "./watch";
import type { HistoryPoint } from "./useVitals";

export interface LiveContext {
  devs: Record<VitalKey, Deviation>;
  conditions: Condition[];
  status: CrewStatus;
  phase: StreamPhase;
  history: HistoryPoint[];
  clock: string;
  stepsToday: number;
}

export interface TranscriptLine { who: Speaker; text: string; time: number }

type DemoStep =
  | { who: "astronaut" | "crewmate"; text: string }
  | { do: "phase"; phase: StreamPhase }
  | { do: "ff"; seconds: number }
  | { do: "check-in" }
  | { do: "alert" };

export type DemoId = "hypoxia" | "flank" | "lonely" | "alone";
export const DEMOS: Record<DemoId, { title: string; blurb: string; steps: DemoStep[] }> = {
  hypoxia: {
    title: "Fatigue and headache",
    blurb: "Mild hypoxia, rest, recheck, joke",
    steps: [
      { who: "astronaut", text: "Hey Cosmo, I've had a headache all morning and I'm really tired." },
      { who: "astronaut", text: "Okay. I'm resting now." },
      { who: "astronaut", text: "Much better, thanks." },
      { who: "astronaut", text: "Go on then." },
      { who: "astronaut", text: "Ha! Good one." },
    ],
  },
  flank: {
    title: "Flank pain, crewmate helps",
    blurb: "Major alert, crewmate, kidney scan",
    steps: [
      { who: "astronaut", text: "Hey Cosmo, I've got a sharp pain in my lower back, on the right side." },
      { who: "astronaut", text: "About a seven." },
      { who: "crewmate", text: "Yes, I'm here. What do you need?" },
      { who: "crewmate", text: "Ready. I've got the probe." },
      { who: "crewmate", text: "Done." },
      { who: "crewmate", text: "Done." },
      { who: "crewmate", text: "Done." },
    ],
  },
  lonely: {
    title: "Cosmo checks in first",
    blurb: "Heart rate up, loneliness, a call home",
    steps: [
      { do: "phase", phase: "stress" },
      { do: "ff", seconds: 95 },
      { do: "check-in" },
      { who: "astronaut", text: "Not really. I've been feeling kind of lonely." },
      { who: "astronaut", text: "It's my daughter's birthday today, and I'm missing it." },
      { who: "astronaut", text: "Mostly today." },
      { who: "astronaut", text: "Talking to my family usually helps." },
      { who: "astronaut", text: "Yes, please." },
      { who: "astronaut", text: "Yes, thanks Cosmo." },
      { do: "phase", phase: "normal" },
    ],
  },
  alone: {
    title: "Alone in an emergency",
    blurb: "Oxygen drops, yes-or-no questions",
    steps: [
      { do: "phase", phase: "hypoxia-severe" },
      { do: "ff", seconds: 100 },
      { do: "alert" },
      { who: "astronaut", text: "No. I'm alone." },
      { who: "astronaut", text: "Yes." },
      { who: "astronaut", text: "A little." },
      { who: "astronaut", text: "Not yet." },
      { who: "astronaut", text: "Yes, it's running." },
      { who: "astronaut", text: "Yes." },
      { who: "astronaut", text: "Much better." },
      { who: "astronaut", text: "Not now, thanks." },
    ],
  },
};

interface Memory {
  pending: Pending;
  jokeIndex: number;
  factIndex: number;
  lastSaid: string[];
  lastIntent?: string;
  /** When the last turn ended (ms), so proactive check-ins never talk over a conversation. */
  lastTurnAt: number;
  expect?: Turn["expect"];
}

export function useConversation(getCtx: () => LiveContext | null, run: (a: Action) => void, setSpeed: (s: number) => void) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState("on-board scripted");
  const engineRef = useRef("on-board scripted");
  const engineAt = useRef(0);
  /** Why the language model is not answering (null when it is). */
  const [aiNote, setAiNote] = useState<string | null>(null);
  const refreshEngine = useCallback(async () => {
    engineAt.current = Date.now();
    try {
      const d = await fetch("/api/cosmo").then((r) => r.json());
      if (d.engine) { engineRef.current = d.engine; setEngine(d.engine); }
      setAiNote(d.engine === "on-board scripted" ? (d.error ?? "no language model configured") : null);
    } catch { setAiNote("server unreachable"); }
  }, []);
  const [demo, setDemo] = useState<string | null>(null);
  const [expect, setExpect] = useState<Turn["expect"]>(undefined);
  const [memory, setMemory] = useState<AstroMemory>(emptyMemory);
  const astro = useRef<AstroMemory>(emptyMemory());
  const mem = useRef<Memory>({ pending: null, jokeIndex: 0, factIndex: 0, lastSaid: [], lastTurnAt: 0 });
  const history = useRef<TranscriptLine[]>([]);
  const busyN = useRef(0);
  const demoOn = useRef(false);
  const stopDemo = useRef(false);

  /** Learn something about the astronaut and keep it on the device. */
  const learn = useCallback((list: Learn[]) => {
    if (!list.length) return;
    astro.current = applyLearn(astro.current, list);
    saveMemory(astro.current);
    setMemory(astro.current);
    setPatience(astro.current.patience);
  }, []);

  useEffect(() => {
    initVoice();
    astro.current = loadMemory();
    setMemory(astro.current);
    setPatience(astro.current.patience);
    // talked over Cosmo right after it started answering: next time, wait a little longer
    setBargeInHandler(({ msSinceAnswerStarted }) => { if (msSinceAnswerStarted < 5000) learn([{ kind: "patience", ms: 250 }]); });
    void refreshEngine();
    // while the model is unreachable, check again every 20 s (and retry quickly right after load)
    const quick = window.setTimeout(() => { if (engineRef.current === "on-board scripted") void refreshEngine(); }, 4000);
    const poll = window.setInterval(() => { if (engineRef.current === "on-board scripted") void refreshEngine(); }, 20_000);
    return () => { setBargeInHandler(null); window.clearTimeout(quick); window.clearInterval(poll); };
  }, [learn, refreshEngine]);

  const add = (who: Speaker, text: string) => {
    history.current = [...history.current.slice(-30), { who, text, time: Date.now() }];
    setTranscript((t) => [...t.slice(-60), { who, text, time: Date.now() }]);
  };
  const begin = () => { busyN.current++; setBusy(true); };
  const end = () => { busyN.current = Math.max(0, busyN.current - 1); if (!busyN.current) setBusy(false); mem.current.lastTurnAt = Date.now(); };

  /** Speak lines in order; stops early if the astronaut talks over Cosmo. Returns false if interrupted. */
  const say = useCallback(async (lines: string[], who: Speaker = "cosmo") => {
    const seq = getInterruptSeq();
    for (const l of lines) {
      if (getInterruptSeq() !== seq) return false;
      add(who, l);
      await speak(l, who);
    }
    return getInterruptSeq() === seq;
  }, []);

  const ctxFor = (): BrainContext | null => {
    const live = getCtx();
    if (!live) return null;
    const m = mem.current;
    return {
      devs: live.devs, conditions: live.conditions, status: live.status, phase: live.phase, clock: live.clock, stepsToday: live.stepsToday,
      pending: m.pending, jokeIndex: m.jokeIndex, factIndex: m.factIndex, lastSaid: m.lastSaid, lastIntent: m.lastIntent,
      memory: astro.current,
    };
  };

  /** Run a decided turn: actions, optional rewording by the model, speech, then any follow-up. Returns the last turn played. */
  const playRef = useRef<(turn: Turn, utterance: string) => Promise<Turn>>(async (t) => t);
  useEffect(() => {
    playRef.current = async (decided, utterance) => {
      const m = mem.current;
      let turn = decided;
      const c = getCtx();
      // Who answers: the on-board brain word for word, the brain reworded, or the AI agent
      // the model link is re-checked while it is down, so Cosmo recovers by itself
      // always ask the server: if a model is reachable it answers, and the page heals itself even after a failed start
      const route = c && utterance ? routeOf(turn.intent, c.status) : "exact";
      if (route !== "exact" && c && (turn.say.length || route === "agent")) {
        const d = c.devs;
        const r1 = (v: number | null | undefined) => Math.round(v ?? 0);
        // no dead air: if the model is slow, Cosmo says a short "thinking" word, like a person would
        let filler: Promise<void> | null = null;
        const fillerTimer = route === "agent" ? window.setTimeout(() => {
          const words = ["Hmm, let me think.", "Good question.", "Mm, one sec.", "Let me think about that."];
          // still thinking after the filler: keep showing it, so nobody mistakes the pause for Cosmo's turn ending
          filler = speak(words[(history.current.length + utterance.length) % words.length], "cosmo").then(() => setThinking(true));
        }, 1600) : undefined;
        try {
          const res = await fetch("/api/cosmo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: route === "agent" ? "chat" : "reword", prefer: engineRef.current, utterance, draft: turn.say, intent: turn.intent, status: c.status, clock: c.clock,
              vitals: `heart rate ${r1(d.heartRate.recent)} bpm (their normal ${r1(d.heartRate.mean)}), blood oxygen ${r1(d.spo2.recent)}% (normal ${r1(d.spo2.mean)}), breathing ${r1(d.respRate.recent)}/min (normal ${r1(d.respRate.mean)}), HRV ${r1(d.hrv.recent)} ms, stress index ${r1(d.stress.recent)}/100 (normal ${r1(d.stress.mean)}), skin temperature ${(d.skinTemp.recent ?? 0).toFixed(1)} C, steps today ${c.stepsToday}, last night's sleep 5 h 4 min, last finger-stick glucose 92 mg/dL (demo preset), radiation this mission 71 mSv (simulated)`,
              history: history.current.slice(-16).map((h) => ({ who: h.who, text: h.text })),
              memory: describeMemory(astro.current),
              conditions: c.conditions.map((x) => ({ title: x.title, severity: x.severity, steps: x.steps })),
            }),
          }).then((r) => r.json());
          window.clearTimeout(fillerTimer);
          if (filler) await filler;
          if (res.error) console.warn("[cosmo-agent]", res.error);
          if (res.engine && res.engine !== "on-board scripted" && !res.error) { engineRef.current = res.engine; setEngine(res.engine); engineAt.current = Date.now(); }
          // a refusal for safety (a medicine was named) is not an outage
          setAiNote(res.error && !/discarded/.test(res.error) ? String(res.error) : null);
          if (res.error && /no API key|rejected/i.test(String(res.error))) { engineRef.current = "on-board scripted"; setEngine("on-board scripted"); }
          const lines: string[] = Array.isArray(res.lines) ? res.lines : [];
          const fromModel = res.engine && res.engine !== "on-board scripted" && !res.error && lines.length > 0;
          // remember which model answered, so the next question goes straight to it
          if (fromModel && res.engine !== engineRef.current) { engineRef.current = res.engine; setEngine(res.engine); }
          if (fromModel && route === "reword") turn = { ...turn, say: lines };
          if (fromModel && route === "agent") {
            const reply: AgentReply = {
              lines, follow: res.follow !== false, asks: res.asks,
              actions: (Array.isArray(res.actions) ? res.actions : []) as Action[],
              remember: Array.isArray(res.remember) ? res.remember : [],
            };
            turn = mergeAgent(turn, reply);
            if (reply.remember.length) learn(reply.remember.map((text) => ({ kind: "fact", text } as Learn)));
          }
        } catch (err) { console.warn("[cosmo-agent] unreachable, using the on-board reply", err); setAiNote("server unreachable"); }
        window.clearTimeout(fillerTimer);
        if (filler) await filler;
      }
      m.pending = turn.pending;
      m.lastIntent = turn.intent;
      m.expect = turn.expect;
      setExpect(turn.expect);
      setExpecting(turn.expect);
      if (turn.learn?.length) learn(turn.learn);
      let ff: { seconds: number; then: FollowUp } | null = null;
      for (const a of turn.actions) {
        if (a.type === "fastForward") { ff = a; continue; }
        run(a);
      }
      const lines = turn.say;
      setThinking(false);
      let finished = lines.length ? await say(lines) : true;
      if (turn.joke && finished) {
        m.jokeIndex++;
        finished = await say([turn.joke.setup]);
        if (finished) { await wait(750); finished = await say([turn.joke.punch]); }
      }
      if (turn.fact) m.factIndex++;
      m.lastSaid = turn.joke ? [...lines, turn.joke.setup, turn.joke.punch] : lines;
      if (!finished) return { ...turn, interrupted: true } as Turn;
      if (ff) {
        // TRY -> OBSERVE -> REASSESS: speed the simulation up while the astronaut waits, then recheck
        setThinking(true);
        setSpeed(25);
        await wait((ff.seconds / 25) * 1000);
        setSpeed(1);
        const c2 = ctxFor();
        if (c2) return playRef.current(oxygenReport(c2, ff.then === "recheck-oxygen"), ff.then);
        setThinking(false);
      }
      return turn;
    };
  });

  /** Keep the mic open after Cosmo speaks, longer when it asked something or during an alert. */
  const afterTurn = (last: Turn) => {
    if (demoOn.current) return;
    // talked over: the voice layer is already listening to them
    if ((last as Turn & { interrupted?: boolean }).interrupted) return;
    if (last.sleep) { goToSleep({ chime: true }); return; }
    const alert = getCtx()?.status === "alert";
    followUp(alert || last.expect === "yesno" ? 14000 : last.pending ? 10000 : 7000);
  };

  const handle = useCallback(async (text: string) => {
    const c = ctxFor();
    if (!c) return;
    learn(learnFromWords(text));
    begin();
    try {
      const last = await playRef.current(respond(text, c), text);
      afterTurn(last);
    } finally { setThinking(false); end(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Words from the astronaut (heard by the recognizer, tapped, or typed by the presenter). */
  const heard = useCallback(async (text: string) => {
    if (demoOn.current) { setThinking(false); return; }
    // Cosmo is still finishing a turn (it was just interrupted): wait for it instead of dropping the words
    for (let i = 0; i < 150 && busyN.current; i++) await wait(100);
    if (busyN.current) { setThinking(false); return; }
    add("astronaut", text);
    await handle(text);
  }, [handle]);

  useEffect(() => {
    setCommandHandler((text) => { void heard(text); });
    return () => setCommandHandler(null);
  }, [heard]);

  // turn "Hey Cosmo" on by default (Chrome asks for the microphone once)
  useEffect(() => {
    if (!wakePreference()) return;
    const id = window.setTimeout(() => { void enableWake(); }, 900);
    return () => window.clearTimeout(id);
  }, []);

  /** The orb: tap to wake Cosmo (or to interrupt it), tap again to send it back to sleep. */
  const talk = useCallback(async () => {
    const v = getVoiceState();
    if (v.speaking && !demoOn.current) { stopSpeaking(); return; }
    if (v.wake === "off" || v.wake === "starting") {
      const ok = await enableWake();
      if (ok) wakeUp();
      return;
    }
    if (v.wake === "awake") goToSleep({ chime: true });
    else wakeUp();
  }, []);

  /** Cosmo speaks first (proactive alert or check-in) and remembers what it asked. */
  const announce = useCallback(async (turn: Turn) => {
    if (busyN.current) return;
    begin();
    try {
      const last = await playRef.current(turn, "");
      afterTurn(last);
    } finally { end(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pick the most important check-in for right now, if any. */
  const checkIn = useCallback(async (o?: Observation) => {
    const live = getCtx();
    if (!live) return;
    const obs = o ?? observe(live.devs, live.history, live.conditions)[0];
    if (!obs) return;
    await announce({ intent: `check-in-${obs.id}`, say: obs.say, actions: [{ type: "log", text: `Cosmo checked in: ${obs.id}.`, severity: "info" }], pending: obs.pending, expect: "yesno" });
  }, [getCtx, announce]);

  /** Play a scripted conversation: the astronaut and crewmate lines are voiced, and Cosmo answers live. */
  const playDemo = useCallback(async (id: DemoId) => {
    if (busyN.current) return;
    begin();
    demoOn.current = true;
    setMuted(true);
    stopDemo.current = false;
    setDemo(DEMOS[id].title);
    goToSleep();
    mem.current = { ...mem.current, pending: null, lastIntent: undefined };
    try {
      for (const step of DEMOS[id].steps) {
        if (stopDemo.current) break;
        if ("do" in step) {
          if (step.do === "phase") run({ type: "phase", phase: step.phase });
          if (step.do === "ff") { setSpeed(25); await wait((step.seconds / 25) * 1000); setSpeed(1); }
          if (step.do === "check-in" || step.do === "alert") {
            // keep the simulation running fast until the readings really cross the line (max ~8 s)
            let t: Turn | null = null;
            for (let i = 0; i < 16 && !t && !stopDemo.current; i++) {
              const live = getCtx();
              if (live) {
                const major = live.conditions.find((c) => c.severity === "major");
                const obs = observe(live.devs, live.history, live.conditions)[0];
                if (step.do === "alert" && major) t = majorAlert(major);
                if (step.do === "check-in" && obs) t = { intent: `check-in-${obs.id}`, say: obs.say, actions: [{ type: "log", text: `Cosmo checked in: ${obs.id}.`, severity: "info" }], pending: obs.pending, expect: "yesno" };
              }
              if (!t) { setSpeed(25); await wait(500); }
            }
            setSpeed(1);
            if (t) await playRef.current(t, "");
            await wait(400);
          }
          continue;
        }
        add(step.who, step.text);
        await speak(step.text, step.who);
        await wait(250);
        const c = ctxFor();
        if (c) await playRef.current(respond(step.text, c), step.text);
        await wait(450);
      }
    } finally {
      demoOn.current = false;
      setMuted(false);
      setDemo(null);
      setExpect(undefined);
      end();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelDemo = () => { stopDemo.current = true; stopSpeaking(); };
  const reset = () => { mem.current = { ...mem.current, pending: null, lastIntent: undefined }; setExpect(undefined); };
  const pendingNow = () => mem.current.pending;
  const idleFor = () => (busyN.current ? 0 : Date.now() - mem.current.lastTurnAt);

  const forget = () => learn([{ kind: "forget" }]);
  return { transcript, busy, engine, aiNote, refreshEngine, demo, expect, memory, forget, talk, handle, heard, say, announce, checkIn, playDemo, cancelDemo, reset, pendingNow, idleFor };
}
