"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import mmash from "@/data/clips/mmash-user22.json";
import type { RegionId } from "@/data/regions";
import { crewStatus, evaluate, regionSeverity } from "@/lib/conditions";
import { cosmoLine } from "@/lib/cosmoLines";
import { PHASES } from "@/lib/stream";
import { useVitals } from "@/lib/useVitals";
import type { VitalKey } from "@/lib/vitals";
import GeneralColumn from "./GeneralColumn";
import RegionBrief from "./RegionBrief";
import SensorColumn from "./SensorColumn";
import { LabsView, LinkView, MindView, RadiationView, TrendsView, type LogEntry } from "./DeviceViews";

const HoloBody = dynamic(() => import("./HoloBody"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-holo/70">Projecting hologram…</div>,
});

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
  const [mood, setMood] = useState<string | null>(null);
  const [presenter, setPresenter] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const conditions = useMemo(() => (state ? evaluate(state.deviations, phase) : []), [state, phase]);
  const status = crewStatus(conditions);
  const severity = useMemo(() => regionSeverity(conditions), [conditions]);
  const labels = useMemo(() => Object.fromEntries(conditions.map((c) => [c.region, c.short.split(",")[0]])) as Partial<Record<RegionId, string>>, [conditions]);
  const line = cosmoLine(status, conditions, state?.reading.t ?? 0);

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

  // open the brief for a new major condition automatically
  const majorId = conditions.find((c) => c.severity === "major")?.region ?? null;
  const [lastMajor, setLastMajor] = useState<RegionId | null>(null);
  if (majorId !== lastMajor) {
    setLastMajor(majorId);
    if (majorId) { setTab("body"); setRegion(majorId); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "p") setPresenter((p) => !p);
      if (e.key === "Escape") setRegion(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.02; u.pitch = 1.1;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  const openVital = (k: VitalKey) => { setFocus(k); setTab("trends"); };
  const statusColor = status === "alert" ? "var(--crit)" : status === "advisory" ? "var(--alert)" : "var(--ok)";

  return (
    <div className="relative flex h-dvh min-h-[640px] flex-col gap-3 overflow-hidden p-3 md:p-4" style={{ background: "radial-gradient(1200px 800px at 50% 40%, #0a2150 0%, #030b1e 65%)" }}>
      {/* header */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-3">
          {onExit && (
            <button type="button" onClick={onExit} className="rounded-full border border-holo/30 px-3 py-1.5 text-xs text-ink/80 hover:border-holo" aria-label="Back to the mission view">
              ← Mission view
            </button>
          )}
          <span className="dev-section hidden md:inline">Sensor</span>
        </div>
        <h1 className="rounded-full border border-holo/40 bg-hull/60 px-5 py-2 text-center font-pixel text-[13px] tracking-[0.28em] text-holo shadow-[0_0_24px_rgba(46,230,255,.25)] md:px-8 md:text-[15px]">
          COSMO · HUMAN BODY HEALTH MONITOR
        </h1>
        <div className="flex items-center justify-end gap-3 text-[11px]">
          <span className="hidden text-ink/60 lg:inline">Transit · day 142 · {state?.reading.clock ?? "--:--:--"}</span>
          <button type="button" onClick={() => setTab("link")} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: online ? "rgba(61,255,176,.4)" : "rgba(255,154,61,.6)", color: online ? "var(--ok)" : "var(--alert)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />{online ? "Earth link" : "Blackout"}
          </button>
          <span className="hidden font-semibold tracking-wider md:inline" style={{ color: statusColor }}>
            {status === "nominal" ? "ALL SYSTEMS OK" : status === "advisory" ? "ADVISORY" : "ALERT"}
          </span>
        </div>
      </header>

      {/* main */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <div className="dev-scroll hidden min-h-0 overflow-y-auto lg:block">
          {state && <SensorColumn devs={state.deviations} history={state.history} onOpen={openVital} />}
        </div>

        <main className="relative min-h-[420px] min-w-0">
          {tab === "body" && (
            <div className="absolute inset-0">
              <div className="pointer-events-none absolute inset-x-0 bottom-6 mx-auto h-24 w-[60%] rounded-[50%] bg-holo/10 blur-2xl" />
              <div className={`absolute inset-y-0 left-0 transition-[right] duration-500 ease-out ${region ? "right-0 xl:right-[380px]" : "right-0"}`}>
                {state && (
                  <HoloBody severity={severity} labels={labels} selected={region} onSelect={setRegion}
                    heartRate={state.deviations.heartRate.value ?? 70} respRate={state.deviations.respRate.value ?? 16} />
                )}
              </div>
              <p className="pointer-events-none absolute left-2 top-1 text-[11px] text-ink/50">Drag to turn · tap a body area for its brief</p>
              {region && (
                <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[400px] py-1">
                  <RegionBrief region={region} conditions={conditions} onClose={() => setRegion(null)} />
                </div>
              )}
            </div>
          )}
          {state && tab === "trends" && <TrendsView state={state} focus={focus} onFocus={setFocus} />}
          {state && tab === "mind" && <MindView state={state} mood={mood} onMood={(m) => { setMood(m); setLog((l) => [...l, { time: state.reading.clock, text: `Mood check-in: ${m}.`, severity: "info", synced: online }]); }} />}
          {tab === "radiation" && <RadiationView />}
          {tab === "labs" && <LabsView />}
          {tab === "link" && (
            <LinkView online={online} log={log} conditions={conditions}
              onToggle={() => setOnline((o) => !o)}
              onSync={() => setLog((l) => l.map((x) => ({ ...x, synced: true })))} />
          )}
        </main>

        <div className="dev-scroll hidden min-h-0 overflow-y-auto lg:block">
          <GeneralColumn status={status} conditions={conditions} stepsToday={STEPS_BEFORE + Math.round(state?.stepsLive ?? 0)} onOpenRegion={(r) => { setTab("body"); setRegion(r); }} />
        </div>
      </div>

      {/* dock */}
      <footer className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <nav aria-label="Device screens" className="dev-panel flex gap-1 overflow-x-auto p-1.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition ${tab === t.id ? "bg-holo text-void shadow-[0_0_18px_rgba(46,230,255,.4)]" : "text-ink/75 hover:bg-white/5"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="dev-panel flex items-center gap-3 p-2 pr-3" style={{ borderColor: status === "alert" ? "var(--crit)" : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/models/cosmo-robot.svg" alt="" className="h-12 w-10 flex-none object-contain" />
          <p className="flex-1 text-[13px] leading-snug" aria-live="polite"><b className="text-holo">Cosmo </b>{line}</p>
          <button type="button" onClick={speak} className="flex-none rounded-full border border-violet/60 px-3 py-1.5 text-xs text-ink hover:bg-violet/20" aria-label="Hear Cosmo say this">
            {speaking ? "Speaking…" : "▶ Hear"}
          </button>
        </div>
      </footer>

      <p className="pointer-events-none absolute bottom-[4.6rem] left-1/2 hidden -translate-x-1/2 text-[10px] text-ink/40 lg:block">
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
              <button key={p.id} onClick={() => setPhase(p.id)} className={`rounded px-2 py-1.5 ${phase === p.id ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>{p.label}</button>
            ))}
          </div>
          <p className="mt-2 text-ink/60">Speed</p>
          <div className="mt-1 flex gap-1.5">
            {[1, 5, 20].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`flex-1 rounded px-2 py-1 ${speed === s ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>{s}×</button>
            ))}
            <button onClick={() => setPaused(!paused)} className="flex-1 rounded border border-amber/40 px-2 py-1 text-ink">{paused ? "Play" : "Pause"}</button>
          </div>
          {state && <p className="mt-2 text-ink/50">Scenario blend {Math.round(state.reading.blend * 100)}%</p>}
        </div>
      )}
    </div>
  );
}
