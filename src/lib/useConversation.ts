"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { oxygenReport, respond, type Action, type BrainContext, type FollowUp, type Pending, type Turn } from "./brain";
import type { Condition, CrewStatus } from "./conditions";
import type { Deviation } from "./baseline";
import type { StreamPhase } from "./stream";
import type { VitalKey } from "./vitals";
import { initVoice, listen, speak, wait, type Speaker } from "./voice";

export interface LiveContext {
  devs: Record<VitalKey, Deviation>;
  conditions: Condition[];
  status: CrewStatus;
  phase: StreamPhase;
}

export interface TranscriptLine { who: Speaker; text: string; time: number }

export interface DemoLine { who: "astronaut" | "crewmate"; text: string }
export const DEMOS: Record<"hypoxia" | "flank", { title: string; lines: DemoLine[] }> = {
  hypoxia: {
    title: "Fatigue and headache",
    lines: [
      { who: "astronaut", text: "Hey Cosmo, I've had a headache all morning and I'm really tired." },
      { who: "astronaut", text: "Okay. I'm resting now." },
      { who: "astronaut", text: "Much better, thanks." },
      { who: "astronaut", text: "Go on then." },
    ],
  },
  flank: {
    title: "Flank pain, crewmate helps",
    lines: [
      { who: "astronaut", text: "Cosmo, I've got a sharp pain in my lower back, on the right side." },
      { who: "astronaut", text: "About a seven." },
      { who: "crewmate", text: "Yes, I'm here. What do you need?" },
      { who: "crewmate", text: "Ready. I've got the probe." },
      { who: "crewmate", text: "Done." },
      { who: "crewmate", text: "Done." },
      { who: "crewmate", text: "Done." },
    ],
  },
};

export function useConversation(getCtx: () => LiveContext | null, run: (a: Action) => void, setSpeed: (s: number) => void) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState("on-board scripted");
  const [demo, setDemo] = useState<string | null>(null);
  const mem = useRef<{ pending: Pending; jokeIndex: number; scanStep: number; activity?: BrainContext["activity"] }>({ pending: null, jokeIndex: 0, scanStep: -1 });
  const stopDemo = useRef(false);

  useEffect(() => {
    initVoice();
    fetch("/api/cosmo").then((r) => r.json()).then((d) => d.engine && setEngine(d.engine)).catch(() => {});
  }, []);

  const add = (who: Speaker, text: string) => setTranscript((t) => [...t.slice(-40), { who, text, time: Date.now() }]);

  const say = useCallback(async (lines: string[], who: Speaker = "cosmo") => {
    for (const l of lines) { add(who, l); await speak(l, who); }
  }, []);

  const ctxFor = (): BrainContext | null => {
    const live = getCtx();
    if (!live) return null;
    return { ...live, pending: mem.current.pending, jokeIndex: mem.current.jokeIndex, scanStep: mem.current.scanStep, activity: mem.current.activity };
  };

  /** Run a decided turn: actions, optional rewording by the model, speech, then any follow-up. */
  const playRef = useRef<(turn: Turn, utterance: string) => Promise<void>>(async () => {});
  useEffect(() => {
    playRef.current = async (turn, utterance) => {
      mem.current.pending = turn.pending;
      if (turn.offer) mem.current.activity = turn.offer;
      let ff: { seconds: number; then: FollowUp } | null = null;
      for (const a of turn.actions) {
        if (a.type === "fastForward") { ff = a; continue; }
        if (a.type === "scan") mem.current.scanStep = a.step;
        run(a);
      }
      if (turn.joke) {
        mem.current.jokeIndex++;
        await say([turn.joke.setup]);
        await wait(700);
        await say([turn.joke.punch]);
      } else if (turn.say.length) {
        let lines = turn.say;
        const c = getCtx();
        if (engine !== "on-board scripted" && c) {
          try {
            const d = c.devs;
            const res = await fetch("/api/cosmo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ utterance, draft: lines, intent: turn.intent, status: c.status,
                vitals: `HR ${Math.round(d.heartRate.recent ?? 0)}, SpO2 ${Math.round(d.spo2.recent ?? 0)}%, breathing ${Math.round(d.respRate.recent ?? 0)}/min` }),
            }).then((r) => r.json());
            if (Array.isArray(res.lines) && res.lines.length) lines = res.lines;
          } catch { /* keep the on-board draft */ }
        }
        await say(lines);
      }
      if (ff) {
        // TRY -> OBSERVE -> REASSESS: speed the simulation up while the astronaut waits, then recheck
        setSpeed(25);
        await wait((ff.seconds / 25) * 1000);
        setSpeed(1);
        const c = ctxFor();
        if (c) await playRef.current(oxygenReport(c, ff.then === "recheck-oxygen"), ff.then);
      }
    };
  });

  const handle = useCallback(async (text: string) => {
    const c = ctxFor();
    if (!c) return;
    await playRef.current(respond(text, c), text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Push to talk: listen once, then answer. */
  const talk = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const heard = await listen();
    if (heard) { add("astronaut", heard); await handle(heard); }
    setBusy(false);
  }, [busy, handle]);

  /** Cosmo speaks first (proactive alert), and remembers what it asked. */
  const announce = useCallback(async (lines: string[], pending: Pending) => {
    mem.current.pending = pending;
    await say(lines);
  }, [say]);

  /** Play a scripted conversation: the astronaut and crewmate lines are voiced, and Cosmo answers live. */
  const playDemo = useCallback(async (id: keyof typeof DEMOS) => {
    if (busy) return;
    setBusy(true);
    stopDemo.current = false;
    setDemo(DEMOS[id].title);
    mem.current = { pending: null, jokeIndex: mem.current.jokeIndex, scanStep: -1 };
    for (const line of DEMOS[id].lines) {
      if (stopDemo.current) break;
      add(line.who, line.text);
      await speak(line.text, line.who);
      await wait(250);
      await handle(line.text);
      await wait(500);
    }
    setDemo(null);
    setBusy(false);
  }, [busy, handle]);

  const cancelDemo = () => { stopDemo.current = true; };
  const reset = () => { mem.current = { pending: null, jokeIndex: mem.current.jokeIndex, scanStep: -1 }; };

  return { transcript, busy, engine, demo, talk, handle, say, announce, playDemo, cancelDemo, reset };
}
