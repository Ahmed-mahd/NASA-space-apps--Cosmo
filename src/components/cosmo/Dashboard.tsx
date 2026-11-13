"use client";

import { useEffect, useState } from "react";
import { useVitals } from "@/lib/useVitals";
import { VITAL, VITALS, type VitalKey } from "@/lib/vitals";
import MissionBar, { type Environment, type SuitMode } from "./MissionBar";
import { LabCard, MoodCard, RadiationCard, SleepCard, SpotChecksCard } from "./OtherIndicators";
import TrendChart from "./TrendChart";
import VitalTile from "./VitalTile";

export default function Dashboard() {
  const { state, speed, setSpeed, paused, setPaused, phase, setPhase } = useVitals();
  const [env, setEnv] = useState<Environment>("transit");
  const [suit, setSuit] = useState<SuitMode>("IVA");
  const [selected, setSelected] = useState<VitalKey>("spo2");
  const [presenter, setPresenter] = useState(false);

  // Hidden presenter controls: Shift + P
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "p") setPresenter((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <MissionBar env={env} onEnv={setEnv} suit={suit} onSuit={setSuit} clock={state?.reading.clock} />

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Live vitals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {state
              ? VITALS.map((m) => (
                  <VitalTile
                    key={m.key}
                    meta={m}
                    dev={state.deviations[m.key]}
                    range={state.ranges[m.key]}
                    history={state.history}
                    shifted={state.reading.shifted.includes(m.key)}
                    selected={selected === m.key}
                    onSelect={() => setSelected(m.key)}
                  />
                ))
              : VITALS.map((m) => <div key={m.key} className="holo-panel min-h-40 animate-pulse" />)}
            <SleepCard />
          </section>

          {state && (
            <TrendChart
              meta={VITAL[selected]}
              dev={state.deviations[selected]}
              range={state.ranges[selected]}
              history={state.history}
              shifted={state.reading.shifted.includes(selected)}
            />
          )}

          <section aria-label="Other indicators" className="grid gap-3 md:grid-cols-3">
            <MoodCard />
            <SpotChecksCard />
            <RadiationCard />
            <LabCard />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="holo-panel min-h-80 p-4" aria-label="Body map">
            <h2 className="hud-label">Body map · NASA human risks</h2>
            <p className="mt-6 text-sm text-ink/60">Hologram body with 11 regions and the 17 NASA risks. Wired in after the layout review.</p>
          </section>
          <section className="holo-panel min-h-64 p-4" aria-label="Cosmo">
            <h2 className="hud-label">Cosmo</h2>
            <p className="mt-6 text-sm text-ink/60">Voice companion comes online in the next build phase.</p>
          </section>
        </aside>
      </div>

      <footer className="text-[11px] text-ink/50">
        Concept demo. Heart rate, HRV and activity replay MMASH (PhysioNet); SpO2 and breathing replay BIDMC ICU recordings
        (PhysioNet); blood chemistry is NASA OSD-575. Amber labels mark simulated values. Colors show how unusual a reading is for
        this astronaut, not a diagnosis. Not medical advice.
      </footer>

      {presenter && (
        <div className="fixed bottom-4 right-4 z-50 w-64 rounded-xl border border-amber/50 bg-deep/95 p-3 text-xs shadow-2xl" role="dialog" aria-label="Presenter controls">
          <div className="flex items-center justify-between">
            <span className="hud-label text-amber">Presenter</span>
            <button onClick={() => setPresenter(false)} className="text-ink/60 hover:text-ink" aria-label="Close presenter controls">✕</button>
          </div>
          <p className="mt-2 text-ink/60">Scenario</p>
          <div className="mt-1 flex gap-1.5">
            {(["normal", "hypoxia"] as const).map((p) => (
              <button key={p} onClick={() => setPhase(p)} className={`flex-1 rounded px-2 py-1 capitalize ${phase === p ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>
                {p === "hypoxia" ? "Mild hypoxia" : "Normal"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-ink/60">Speed</p>
          <div className="mt-1 flex gap-1.5">
            {[1, 5, 20].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`flex-1 rounded px-2 py-1 ${speed === s ? "bg-amber text-void" : "border border-amber/40 text-ink"}`}>
                {s}×
              </button>
            ))}
            <button onClick={() => setPaused(!paused)} className="flex-1 rounded border border-amber/40 px-2 py-1 text-ink">
              {paused ? "Play" : "Pause"}
            </button>
          </div>
          {state && <p className="mt-2 text-ink/50">Scenario blend {Math.round(state.reading.blend * 100)}%</p>}
        </div>
      )}
    </main>
  );
}
