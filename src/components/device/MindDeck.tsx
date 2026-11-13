"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { EARTH_LINES, GROAN_REPLIES, JOKES, LAUGH_REPLIES, MOODS, TRIVIA, type MoodId } from "@/data/mind";
import { risks } from "@/data/nasa";
import type { CrewStatus } from "@/lib/conditions";
import { listen, speak, useVoice, wait } from "@/lib/voice";

const SpaceScene = dynamic(() => import("../landing/SpaceScene"), { ssr: false });

export type Activity = "home" | "joke" | "trivia" | "breathing" | "earth" | "journal";
const behavior = risks.find((r) => r.id === "behavior")!;

const CARDS: { id: Exclude<Activity, "home">; title: string; blurb: string; tag: string; glyph: string }[] = [
  { id: "joke", title: "Joke break", blurb: "Cosmo's stand-up set. Rate every joke.", tag: "Laughter breaks the routine", glyph: "☺" },
  { id: "trivia", title: "Space trivia", blurb: "Three questions from NASA's own research pages.", tag: "Keeps the mind sharp", glyph: "?" },
  { id: "breathing", title: "Breathe with me", blurb: "Box breathing with voice and sound.", tag: "Calms heart and mind", glyph: "◎" },
  { id: "earth", title: "Earth window", blurb: "One quiet minute looking at home.", tag: "NASA: windows and views", glyph: "◐" },
  { id: "journal", title: "Voice journal", blurb: "Tell Cosmo one good thing about today.", tag: "NASA: keeping a journal", glyph: "✎" },
];

/* ---------------- tiny sound kit (WebAudio, no files) ---------------- */
let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());
function tone(freq: number, dur: number, vol = 0.05, type: OscillatorType = "sine") {
  const a = audio(), o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.05);
}
const rimshot = () => { tone(180, 0.12, 0.08, "triangle"); setTimeout(() => tone(140, 0.12, 0.08, "triangle"), 140); setTimeout(() => tone(900, 0.35, 0.03, "square"), 300); };
function ambientPad() {
  const a = audio(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 600; g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.05, a.currentTime + 2);
  const os = [110, 164.8, 220.5].map((fr) => { const o = a.createOscillator(); o.frequency.value = fr; o.detune.value = Math.random() * 8; o.connect(f); o.start(); return o; });
  f.connect(g).connect(a.destination);
  return () => { g.gain.linearRampToValueAtTime(0, a.currentTime + 1.2); setTimeout(() => os.forEach((o) => o.stop()), 1300); };
}

/* ---------------- Cosmo avatar that reacts to the voice ---------------- */
function CosmoAvatar({ size = 120, mood = "idle" }: { size?: number; mood?: "idle" | "laugh" | "think" | "calm" }) {
  const v = useVoice();
  const talking = v.speaking === "cosmo";
  return (
    <div className="relative grid flex-none place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full border border-violet/40" style={{ transform: `scale(${1 + (talking ? v.level * 0.12 : 0)})`, transition: "transform .1s", boxShadow: talking ? "0 0 40px rgba(163,91,255,.55)" : "0 0 20px rgba(46,230,255,.2)" }} />
      <span className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgba(163,91,255,.35),transparent_70%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/models/cosmo-robot.svg" alt="" style={{ height: size * 0.78, width: size * 0.5 }} className={`relative object-contain ${mood === "laugh" ? "mind-laugh" : talking ? "mind-talk" : "cosmo-float"}`} />
    </div>
  );
}

/* ---------------- activities ---------------- */
function JokeBreak({ index, onNext, onLaugh }: { index: number; onNext: () => void; onLaugh: (laughed: boolean) => void }) {
  const [stage, setStage] = useState<"idle" | "setup" | "punch" | "rated">("idle");
  const [reaction, setReaction] = useState("");
  const j = JOKES[index % JOKES.length];
  const tell = async () => {
    setReaction(""); setStage("setup");
    await speak(j.setup);
    await wait(650);
    setStage("punch");
    await speak(j.punch);
    rimshot();
  };
  const rate = async (laughed: boolean) => {
    const pool = laughed ? LAUGH_REPLIES : GROAN_REPLIES;
    const line = pool[index % pool.length];
    setReaction(line); setStage("rated"); onLaugh(laughed);
    await speak(line);
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <CosmoAvatar size={140} mood={stage === "punch" ? "laugh" : "idle"} />
      <div className="min-h-28 max-w-xl">
        {stage === "idle" && <p className="text-lg text-ink/70">Ready for a joke? Fair warning: I wrote them myself.</p>}
        {stage !== "idle" && <p className="text-2xl font-medium leading-snug">{j.setup}</p>}
        {(stage === "punch" || stage === "rated") && <p className="brief-in mt-3 text-2xl font-semibold text-violet">{j.punch}</p>}
        {reaction && <p className="brief-in mt-3 text-sm text-ink/70">{reaction}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {stage === "punch" && (
          <>
            <button type="button" onClick={() => rate(true)} className="rounded-full bg-violet px-5 py-2.5 text-sm font-medium text-white">😂 Good one</button>
            <button type="button" onClick={() => rate(false)} className="rounded-full border border-violet/50 px-5 py-2.5 text-sm">🙄 Groan</button>
          </>
        )}
        {(stage === "idle" || stage === "rated") && (
          <button type="button" onClick={() => { if (stage === "rated") onNext(); setTimeout(tell, 50); }} className="rounded-full bg-holo px-6 py-2.5 text-sm font-medium text-void">
            {stage === "idle" ? "Tell me a joke" : "Another one"}
          </button>
        )}
      </div>
    </div>
  );
}

function Trivia({ seed, onScore }: { seed: number; onScore: (correct: boolean) => void }) {
  const [order] = useState(() => [0, 1, 2].map((k) => (seed * 3 + k) % TRIVIA.length));
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [hearing, setHearing] = useState(false);
  const q = TRIVIA[order[n]];
  const done = n >= order.length;
  useEffect(() => { if (!done) speak(q.q); }, [n, done, q]);
  const answer = async (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === q.answer;
    if (ok) setScore((s) => s + 1);
    onScore(ok);
    tone(ok ? 880 : 220, 0.3, 0.05, ok ? "sine" : "sawtooth");
    await speak(`${ok ? "Correct!" : "Not quite."} ${q.fact}`);
  };
  const byVoice = async () => {
    setHearing(true);
    const heard = await listen();
    setHearing(false);
    const i = q.said.findIndex((re) => re.test(heard));
    if (i >= 0) answer(i); else if (heard) speak("I didn't match that to an answer. Try again, or tap one.");
  };
  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <CosmoAvatar size={130} mood={score >= 2 ? "laugh" : "idle"} />
        <p className="text-3xl font-semibold">{score} / {order.length}</p>
        <p className="text-ink/70">{score === 3 ? "Perfect. Mission control is jealous." : score === 2 ? "Solid. You'd pass astronaut school. Probably." : "The questions were hard. That's my story and I'm sticking to it."}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div className="flex items-center justify-between text-xs text-ink/60"><span>Question {n + 1} of {order.length}</span><span>Score {score}</span></div>
      <p className="text-2xl font-medium leading-snug">{q.q}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {q.options.map((o, i) => {
          const state = picked === null ? "" : i === q.answer ? "border-ok bg-ok/15 text-ok" : i === picked ? "border-crit bg-crit/15 text-crit" : "opacity-50";
          return <button key={o} type="button" onClick={() => answer(i)} className={`rounded-xl border border-holo/30 px-4 py-3 text-left text-sm transition hover:border-holo ${state}`}>{o}</button>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {picked === null ? (
          <button type="button" onClick={byVoice} className="rounded-full border border-holo/50 px-4 py-2 text-sm">{hearing ? "Listening…" : "🎙 Answer by voice"}</button>
        ) : (
          <button type="button" onClick={() => { setPicked(null); setN((x) => x + 1); }} className="rounded-full bg-holo px-5 py-2 text-sm font-medium text-void">Next</button>
        )}
        {picked !== null && <a href={q.source} target="_blank" rel="noreferrer" className="text-xs text-holo/70 hover:underline">Source</a>}
      </div>
    </div>
  );
}

function Breathing() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);
  const stop = useRef(false);
  const LABELS = ["Breathe in", "Hold", "Breathe out", "Hold"];
  const run = async () => {
    stop.current = false; setRunning(true);
    await speak("Let's do four rounds of box breathing. Four counts each. Follow the light.");
    for (let c = 0; c < 4 && !stop.current; c++) {
      setCycle(c + 1);
      for (let p = 0; p < 4 && !stop.current; p++) {
        setPhase(p);
        tone([392, 523, 330, 262][p], 0.9, 0.035);
        speak(LABELS[p]);
        await wait(4000);
      }
    }
    if (!stop.current) await speak("Nice work. Your heart will thank you. I'll check your HRV in a minute.");
    setRunning(false);
  };
  const scale = !running ? 0.7 : phase === 0 ? 1 : phase === 2 ? 0.55 : phase === 1 ? 1 : 0.55;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="relative grid h-64 w-64 place-items-center">
        <span className="absolute inset-0 rounded-[28%] border-2 border-violet/30" />
        <div className="grid h-52 w-52 place-items-center rounded-full"
          style={{ transform: `scale(${scale})`, transition: "transform 4s ease-in-out", background: "radial-gradient(circle, rgba(163,91,255,.55), rgba(46,230,255,.15) 60%, transparent 72%)", boxShadow: "0 0 70px rgba(163,91,255,.45)" }}>
          <span className="text-lg font-medium" style={{ transform: `scale(${1 / scale})`, transition: "transform 4s ease-in-out" }}>{running ? LABELS[phase] : "Ready"}</span>
        </div>
      </div>
      <p className="text-sm text-ink/60">{running ? `Round ${cycle} of 4` : "Four rounds, about one minute"}</p>
      <button type="button" onClick={() => (running ? (stop.current = true) : run())} className="rounded-full bg-violet px-6 py-2.5 text-sm font-medium text-white">
        {running ? "Stop" : "Start breathing"}
      </button>
    </div>
  );
}

function EarthWindow() {
  const [on, setOn] = useState(false);
  const [line, setLine] = useState("");
  const stop = useRef<null | (() => void)>(null);
  const start = async () => {
    setOn(true);
    stop.current = ambientPad();
    for (const l of EARTH_LINES) { setLine(l); await speak(l); await wait(3500); }
  };
  useEffect(() => () => stop.current?.(), []);
  return (
    <div className="relative h-full overflow-hidden rounded-xl">
      <div className="absolute inset-0"><SpaceScene /></div>
      <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6">
        {on ? <p key={line} className="brief-in max-w-lg text-xl font-medium">{line}</p> : (
          <button type="button" onClick={start} className="rounded-full bg-holo px-6 py-2.5 text-sm font-medium text-void">Open the window</button>
        )}
      </div>
    </div>
  );
}

function Journal({ entries, onAdd }: { entries: string[]; onAdd: (t: string) => void }) {
  const [hearing, setHearing] = useState(false);
  const record = async () => {
    await speak("Tell me one good thing about today.");
    setHearing(true);
    const heard = await listen();
    setHearing(false);
    if (heard) { onAdd(heard); await speak("Saved. That one goes in the good-things file."); }
  };
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-4">
        <CosmoAvatar size={90} />
        <div>
          <p className="text-lg font-medium">One good thing, every day.</p>
          <p className="text-sm text-ink/65">Journaling is one of NASA&rsquo;s countermeasures for isolation. Cosmo keeps the entries on board.</p>
        </div>
      </div>
      <button type="button" onClick={record} className="self-start rounded-full bg-violet px-5 py-2.5 text-sm font-medium text-white">{hearing ? "Listening…" : "🎙 Record an entry"}</button>
      <ul className="dev-scroll flex-1 space-y-2 overflow-y-auto">
        {entries.map((e, i) => <li key={i} className="rounded-xl border border-violet/25 bg-violet/5 px-4 py-2.5 text-sm">“{e}”</li>)}
      </ul>
    </div>
  );
}

/* ---------------- the deck ---------------- */
const WEEK: { day: string; mood: MoodId }[] = [
  { day: "Day 136", mood: "okay" }, { day: "Day 137", mood: "great" }, { day: "Day 138", mood: "okay" },
  { day: "Day 139", mood: "tired" }, { day: "Day 140", mood: "low" }, { day: "Day 141", mood: "okay" },
];

export default function MindDeck({ request, mood, onMood, status, stress, hrv }: {
  request: { activity: Activity; nonce: number } | null; mood: MoodId | null; onMood: (m: MoodId) => void;
  status: CrewStatus; stress: number | null; hrv: number | null;
}) {
  const [active, setActive] = useState<Activity>("home");
  const [lastNonce, setLastNonce] = useState(0);
  if (request && request.nonce !== lastNonce) { setLastNonce(request.nonce); setActive(request.activity); }
  const [jokeIdx, setJokeIdx] = useState(0);
  const [laughs, setLaughs] = useState(0);
  const [journal, setJournal] = useState<string[]>(["Grew the first lettuce leaves in the veggie unit."]);
  const [checking, setChecking] = useState(false);
  const [round, setRound] = useState(0);

  const checkIn = async () => {
    setChecking(true);
    await speak("How are you feeling right now?");
    const heard = await listen();
    setChecking(false);
    const m = MOODS.find((x) => x.words.test(heard));
    if (m) { onMood(m.id); await speak(m.reply); }
    else if (heard) await speak("Thanks for telling me. I'll note it as okay. You can always just say how you feel.");
  };

  const cur = MOODS.find((m) => m.id === mood);
  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className="dev-scroll flex min-h-0 flex-col gap-2 overflow-y-auto" aria-label="Mind activities">
        <button type="button" onClick={() => setActive("home")} className={`dev-panel is-interactive p-3 ${active === "home" ? "border-violet" : ""}`}>
          <p className="text-sm font-medium">Check-in & mood weather</p>
          <p className="text-[12px] text-ink/60">{cur ? `Today: ${cur.label}` : "No check-in yet today"}</p>
        </button>
        {CARDS.map((c) => (
          <button key={c.id} type="button" onClick={() => { setActive(c.id); if (c.id === "trivia") setRound((r) => r + 1); }} className={`dev-panel is-interactive flex items-start gap-3 p-3 ${active === c.id ? "border-violet shadow-[0_0_24px_rgba(163,91,255,.25)]" : ""}`}>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-violet/15 text-lg text-violet">{c.glyph}</span>
            <span>
              <span className="block text-sm font-medium">{c.title}</span>
              <span className="block text-[12px] text-ink/60">{c.blurb}</span>
              <span className="mt-1 block text-[10.5px] text-violet/80">{c.tag}</span>
            </span>
          </button>
        ))}
      </nav>

      <section className="dev-panel relative min-h-[420px] overflow-hidden p-5" aria-live="polite">
        {status === "alert" && active === "joke" ? (
          <div className="grid h-full place-items-center text-center"><p className="max-w-sm text-lg">Jokes are paused while there&rsquo;s an active alert. Let&rsquo;s sort that out first.</p></div>
        ) : active === "home" ? (
          <div className="flex h-full flex-col gap-5">
            <div className="flex flex-wrap items-center gap-5">
              <CosmoAvatar size={120} />
              <div className="flex-1">
                <p className="text-2xl font-semibold">How&rsquo;s your head today?</p>
                <p className="text-sm text-ink/65">Talk to Cosmo the way you&rsquo;d talk to a friend. It listens for how you feel and suggests something that helps.</p>
                <button type="button" onClick={checkIn} className="mt-3 rounded-full bg-violet px-5 py-2.5 text-sm font-medium text-white">{checking ? "Listening…" : "🎙 Voice check-in"}</button>
              </div>
            </div>
            <div>
              <p className="dev-title">Mood weather, last 7 days</p>
              <div className="mt-2 grid grid-cols-7 gap-2">
                {[...WEEK, { day: "Today", mood: mood ?? null }].map((d, i) => {
                  const m = MOODS.find((x) => x.id === d.mood);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 rounded-xl border border-holo/15 p-2 text-center">
                      <span className="h-10 w-10 rounded-full" style={{ background: m ? `radial-gradient(circle, ${m.color}, transparent 70%)` : "transparent", border: m ? "none" : "1px dashed rgba(217,244,255,.3)" }} />
                      <span className="text-[11px]">{m?.label ?? "?"}</span>
                      <span className="text-[10px] text-ink/45">{d.day}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-amber/80">Earlier days are simulated</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-holo/15 p-3"><p className="text-[11px] text-ink/60">Stress index</p><p className="dev-num text-2xl">{stress == null ? "--" : Math.round(stress)}<span className="text-xs text-ink/50">/100</span></p></div>
              <div className="rounded-xl border border-holo/15 p-3"><p className="text-[11px] text-ink/60">HRV (calm signal)</p><p className="dev-num text-2xl">{hrv == null ? "--" : Math.round(hrv)}<span className="text-xs text-ink/50"> ms</span></p></div>
              <div className="rounded-xl border border-holo/15 p-3"><p className="text-[11px] text-ink/60">Laughs today</p><p className="dev-num text-2xl">{laughs}</p></div>
            </div>
            <a href={behavior.source} target="_blank" rel="noreferrer" className="text-[11px] text-holo/70 hover:underline">Built on NASA&rsquo;s behavioral health countermeasures</a>
          </div>
        ) : active === "joke" ? (
          <JokeBreak index={jokeIdx} onNext={() => setJokeIdx((i) => i + 1)} onLaugh={(l) => l && setLaughs((n) => n + 1)} />
        ) : active === "trivia" ? (
          <Trivia key={round} seed={round} onScore={() => {}} />
        ) : active === "breathing" ? (
          <Breathing />
        ) : active === "earth" ? (
          <EarthWindow />
        ) : (
          <Journal entries={journal} onAdd={(t) => setJournal((j) => [t, ...j])} />
        )}
      </section>
    </div>
  );
}
