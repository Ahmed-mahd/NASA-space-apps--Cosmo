"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mmash from "@/data/clips/mmash-user22.json";
import type { MoodId } from "@/data/mind";
import type { RegionId } from "@/data/regions";
import { proactiveLine, type Action } from "@/lib/brain";
import { crewStatus, evaluate, regionSeverity } from "@/lib/conditions";
import { PHASES } from "@/lib/stream";
import { useConversation, type LiveContext } from "@/lib/useConversation";
import { useVitals } from "@/lib/useVitals";
import type { VitalKey } from "@/lib/vitals";
import { LabsView, LinkView, RadiationView, TrendsView, type LogEntry } from "./DeviceViews";
import GeneralColumn from "./GeneralColumn";
import type { Activity } from "./MindDeck";
import RegionBrief from "./RegionBrief";
import ScanCard from "./ScanCard";
import SensorColumn from "./SensorColumn";
import VoiceDock from "./VoiceDock";

const HoloBody = dynamic(() => import("./HoloBody"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-holo/70">Projecting hologram…</div>,
});
const MindDeck = dynamic(() => import("./MindDeck"), { ssr: false });

type Tab = "body" | "trends" | "mind" | "radiation" | "labs" | "link";
const TABS: { id: Tab; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "trends", label: "Vitals" },
  { id: "mind", label: "Mind" },
  { id: "radiation", label: "Radiation" },
  { id: "labs", label: "Labs" },
  { id: "link", label: "Earth link" },
];
// steps walked between 09:15 and 10:00, before the live clip starts
const STEPS_BEFORE = mmash.history.steps.slice(0, 45).reduce((a, b) => a + b, 0);

export default function DeviceOS({ onExit }: { onExit?: () => void }) {
  const { state, speed, setSpeed, paused, setPaused, phase, setPhase } = useVitals();
  const [tab, setTab] = useState<Tab>("body");
  const [region, setRegion] = useState<RegionId | null>(null);
  const [focus, setFocus] = useState<VitalKey>("spo2");
  const [online, setOnline] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [mood, setMood] = useState<MoodId | null>(null);
  const [presenter, setPresenter] = useState(false);
  const [crewmate, setCrewmate] = useState(false);
  const [scanStep, setScanStep] = useState(-1);
  const [mindReq, setMindReq] = useState<{ activity: Activity; nonce: number } | null>(null);

  const conditions = useMemo(() => (state ? evaluate(state.deviations, phase) : []), [state, phase]);
  const status = crewStatus(conditions);
  const severity = useMemo(() => regionSeverity(conditions), [conditions]);
  const labels = useMemo(() => Object.fromEntries(conditions.map((c) => [c.region, c.short.split(",")[0]])) as Partial<Record<RegionId, string>>, [conditions]);

  /* ---------- conversation wiring ---------- */
  const live = useRef<LiveContext | null>(null);
  useEffect(() => {
    live.current = state ? { devs: state.deviations, conditions, status, phase } : null;
  });
  const clock = useRef("--:--:--");
  useEffect(() => { if (state) clock.current = state.reading.clock; });
  const addLog = useCallback((text: string, severity: LogEntry["severity"]) => {
    setLog((l) => [...l, { time: clock.current, text, severity, synced: online }]);
  }, [online]);

  const run = useCallback((a: Action) => {
    switch (a.type) {
      case "phase": setPhase(a.phase); if (a.phase !== "flank-pain") { setScanStep(-1); } if (a.phase === "normal") setCrewmate(false); break;
      case "openRegion": setTab("body"); setRegion(a.region); break;
      case "tab": setTab(a.tab); break;
      case "mind": setTab("mind"); setMindReq({ activity: a.activity, nonce: Date.now() }); break;
      case "mood": setMood(a.mood); break;
      case "log": addLog(a.text, a.severity); break;
      case "crewmate": setCrewmate(a.present); break;
      case "scan": setScanStep(a.step); setTab("body"); break;
    }
  }, [setPhase, addLog]);
  const getCtx = useCallback(() => live.current, []);
  const convo = useConversation(getCtx, run, setSpeed);

  // log condition onsets (queued while the Earth link is down)
  const seen = useRef(new Set<string>());
  const key = conditions.map((c) => `${c.id}:${c.severity}`).join("|");
  useEffect(() => {
    if (!state) return;
    for (const c of conditions) {
      const k = `${c.id}:${c.severity}`;
      if (!seen.current.has(k)) {
        seen.current.add(k);
        setLog((l) => [...l, { time: state.reading.clock, text: `${c.title}. ${c.short}.`, severity: c.severity, synced: online }]);
      }
    }
    for (const k of [...seen.current]) if (!key.includes(k)) seen.current.delete(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // a new major condition: open its brief and, if nobody is talking, Cosmo speaks up
  const major = conditions.find((c) => c.severity === "major") ?? null;
  const [lastMajor, setLastMajor] = useState<string | null>(null);
  if ((major?.id ?? null) !== lastMajor) {
    setLastMajor(major?.id ?? null);
    if (major) { setTab("body"); setRegion(major.region); }
  }
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!major) { announced.current = null; return; }
    if (announced.current === major.id || convo.busy) return;
    announced.current = major.id;
    convo.announce([proactiveLine(major)], "crewmate");
  }, [major, convo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "p") setPresenter((p) => !p);
      if (e.key === "Escape") setRegion(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openVital = (k: VitalKey) => { setFocus(k); setTab("trends"); };
  const statusColor = status === "alert" ? "var(--crit)" : status === "advisory" ? "var(--alert)" : "var(--ok)";
  const sidePanel = scanStep >= 0 ? "scan" : region ? "brief" : null;

  return (
    <div className="relative flex h-dvh min-h-[660px] flex-col gap-3 overflow-hidden p-3 md:p-4" style={{ background: "radial-gradient(1200px 800px at 50% 40%, #0a2150 0%, #030b1e 65%)" }}>
      {/* header */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-3">
          {onExit && (
            <button type="button" onClick={onExit} className="rounded-full border border-holo/30 px-3 py-1.5 text-xs text-ink/80 hover:border-holo" aria-label="Back to the mission view">← Mission view</button>
          )}
          <span className="dev-section hidden md:inline">Sensor</span>
        </div>
        <h1 className="rounded-full border border-holo/40 bg-hull/60 px-5 py-2 text-center font-pixel text-[13px] tracking-[0.28em] text-holo shadow-[0_0_24px_rgba(46,230,255,.25)] md:px-8 md:text-[15px]">
          COSMO · HUMAN BODY HEALTH MONITOR
        </h1>
        <div className="flex items-center justify-end gap-3 text-[11px]">
          <span className="hidden text-ink/60 xl:inline">Transit · day 142 · {state?.reading.clock ?? "--:--:--"}</span>
          {crewmate && <span className="rounded-full border border-violet/60 px-2.5 py-1 text-violet">Crewmate mode</span>}
          <button type="button" onClick={() => setTab("link")} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: online ? "rgba(61,255,176,.4)" : "rgba(255,154,61,.6)", color: online ? "var(--ok)" : "var(--alert)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />{online ? "Earth link" : "Blackout"}
          </button>
          <span className="dev-section hidden md:inline" style={{ color: statusColor }}>
            {status === "nominal" ? "All systems OK" : status === "advisory" ? "Advisory" : "Alert"}
          </span>
        </div>
      </header>

      {/* main */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[272px_minmax(0,1fr)_292px]">
        <div className="dev-scroll hidden min-h-0 overflow-y-auto pr-0.5 lg:block">
          {state && <SensorColumn devs={state.deviations} history={state.history} onOpen={openVital} />}
        </div>

        <main className="relative min-h-[420px] min-w-0">
          {tab === "body" && (
            <div className="absolute inset-0">
              <div className={`absolute inset-y-0 left-0 transition-[right] duration-500 ease-out ${sidePanel ? "right-0 xl:right-[380px]" : "right-0"}`}>
                {state && (
                  <HoloBody severity={severity} labels={labels} selected={region} onSelect={setRegion}
                    heartRate={state.deviations.heartRate.value ?? 70} respRate={state.deviations.respRate.value ?? 16} />
                )}
              </div>
              <p className="pointer-events-none absolute left-2 top-1 text-[11px] text-ink/45">Drag to turn · tap a body area for its brief</p>
              {sidePanel && (
                <div className="dev-scroll absolute inset-y-0 right-0 z-30 w-full max-w-[380px] overflow-y-auto py-1">
                  {sidePanel === "scan"
                    ? <ScanCard step={scanStep} onClose={() => setScanStep(-1)} />
                    : <RegionBrief region={region!} conditions={conditions} onClose={() => setRegion(null)} />}
                </div>
              )}
            </div>
          )}
          {state && tab === "trends" && <TrendsView state={state} focus={focus} onFocus={setFocus} />}
          {state && tab === "mind" && (
            <MindDeck request={mindReq} mood={mood} status={status}
              onMood={(m) => { setMood(m); addLog(`Mood check-in: ${m}.`, "info"); }}
              stress={state.deviations.stress.value} hrv={state.deviations.hrv.value} />
          )}
          {tab === "radiation" && <RadiationView />}
          {tab === "labs" && <LabsView />}
          {tab === "link" && (
            <LinkView online={online} log={log} conditions={conditions}
              onToggle={() => setOnline((o) => !o)}
              onSync={() => setLog((l) => l.map((x) => ({ ...x, synced: true })))} />
          )}
        </main>

        <div className="dev-scroll hidden min-h-0 overflow-y-auto pr-0.5 lg:block">
          <GeneralColumn status={status} conditions={conditions} stepsToday={STEPS_BEFORE + Math.round(state?.stepsLive ?? 0)} onOpenRegion={(r) => { setTab("body"); setRegion(r); }} />
        </div>
      </div>

      {/* dock */}
      <footer className="grid items-center gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <nav aria-label="Device screens" className="dev-panel flex gap-1 overflow-x-auto p-1.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition ${tab === t.id ? "bg-holo text-void shadow-[0_0_18px_rgba(46,230,255,.4)]" : "text-ink/75 hover:bg-white/5"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <VoiceDock engine={convo.engine} busy={convo.busy} demo={convo.demo} transcript={convo.transcript} alert={status === "alert"}
          onTalk={convo.talk} onDemo={(id) => convo.playDemo(id)} onCancelDemo={convo.cancelDemo} />
      </footer>

      <p className="pointer-events-none absolute bottom-[4.7rem] left-1/2 hidden -translate-x-1/2 text-[10px] text-ink/40 lg:block">
        Simulation · replayed research data and simulated readings · example protocols, need medical review
      </p>

      {presenter && (
        <div className="fixed bottom-24 right-4 z-50 w-72 rounded-xl border border-amber/50 bg-deep/95 p-3 text-xs shadow-2xl" role="dialog" aria-label="Presenter controls">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber">Presenter</span>
            <button onClick={() => setPresenter(false)} className="text-ink/60 hover:text-ink" aria-label="Close presenter controls">✕</button>
          </div>
          <p className="mt-2 text-ink/60">Scenario</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {PHASES.map((p) => (
              <button key={p.id} onClick={() => { setPhase(p.id); convo.reset(); if (p.id === "normal") { setScanStep(-1); setCrewmate(false); } }} className={`rounded px-2 py-1.5 ${phase === p.id ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>{p.label}</button>
            ))}
          </div>
          <p className="mt-2 text-ink/60">Speed</p>
          <div className="mt-1 flex gap-1.5">
            {[1, 5, 20].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`flex-1 rounded px-2 py-1 ${speed === s ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>{s}×</button>
            ))}
            <button onClick={() => setPaused(!paused)} className="flex-1 rounded border border-amber/40 px-2 py-1 text-ink">{paused ? "Play" : "Pause"}</button>
          </div>
          <form className="mt-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem("say") as HTMLInputElement; if (f.value.trim()) { convo.handle(f.value.trim()); f.value = ""; } }}>
            <label className="text-ink/60" htmlFor="say">Say as the astronaut (backup if the mic fails)</label>
            <input id="say" name="say" className="mt-1 w-full rounded border border-amber/40 bg-void px-2 py-1 text-ink" placeholder="I have a headache" />
          </form>
          {state && <p className="mt-2 text-ink/50">Scenario blend {Math.round(state.reading.blend * 100)}% · brain: {convo.engine}</p>}
        </div>
      )}
    </div>
  );
}
