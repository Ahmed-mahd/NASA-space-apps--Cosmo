"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { csa, hazards, HAZARDS_SOURCE } from "@/data/nasa";
import type { Condition } from "@/lib/conditions";
import type { VitalsState } from "@/lib/useVitals";
import { VITAL, VITALS, type VitalKey } from "@/lib/vitals";
import { LabCard } from "../cosmo/OtherIndicators";
import TrendChart from "../cosmo/TrendChart";
import VitalTile from "../cosmo/VitalTile";

export function TrendsView({ state, focus, onFocus }: { state: VitalsState; focus: VitalKey; onFocus: (k: VitalKey) => void }) {
  return (
    <div className="dev-scroll flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {VITALS.map((m) => (
          <VitalTile key={m.key} meta={m} dev={state.deviations[m.key]} range={state.ranges[m.key]} history={state.history}
            shifted={state.reading.shifted.includes(m.key)} selected={focus === m.key} onSelect={() => onFocus(m.key)} />
        ))}
      </div>
      <TrendChart meta={VITAL[focus]} dev={state.deviations[focus]} range={state.ranges[focus]} history={state.history} shifted={state.reading.shifted.includes(focus)} />
    </div>
  );
}

export function RadiationView() {
  const data = Array.from({ length: 30 }, (_, i) => ({ day: 113 + i, dose: +(0.42 + 0.06 * Math.sin(i / 3) + (i === 21 ? 0.9 : 0) + (i === 22 ? 0.35 : 0)).toFixed(2) }));
  const rad = hazards.find((h) => h.id === "radiation")!;
  return (
    <div className="dev-scroll grid h-full gap-3 overflow-y-auto pr-1 lg:grid-cols-[1.4fr_1fr]">
      <div className="dev-panel p-5">
        <div className="flex items-start justify-between"><p className="dev-title">Daily dose · last 30 days</p><span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] text-amber">SIMULATED</span></div>
        <p className="dev-num mt-2 text-4xl">71 <span className="text-base font-normal text-ink/60">mSv this mission</span></p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
              <defs><linearGradient id="rad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a35bff" stopOpacity={0.6} /><stop offset="1" stopColor="#a35bff" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="day" tick={{ fill: "var(--ink)", fillOpacity: 0.5, fontSize: 10 }} stroke="var(--holo)" strokeOpacity={0.2} />
              <YAxis tick={{ fill: "var(--ink)", fillOpacity: 0.5, fontSize: 10 }} stroke="var(--holo)" strokeOpacity={0.2} />
              <Tooltip contentStyle={{ background: "var(--deep)", border: "1px solid var(--holo-dim)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} mSv`, "Dose"]} labelFormatter={(d) => `Mission day ${d}`} />
              <Area dataKey="dose" stroke="#a35bff" fill="url(#rad)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[12px] text-ink/65">The spike on day 134 shows how a solar particle event would appear. Cosmo would tell the crew to move to the shielded area and log the dose.</p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="dev-panel p-5">
          <p className="dev-title">Why it matters</p>
          <p className="mt-2 text-sm text-ink/85">{rad.summary}</p>
          <a className="mt-2 inline-block text-[12px] text-holo/80 hover:underline" href={HAZARDS_SOURCE} target="_blank" rel="noreferrer">Source: NASA HRP hazards</a>
        </div>
        <div className="dev-panel p-5">
          <p className="dev-title">The device behind this</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink/85">{csa.radiation.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <a className="mt-2 inline-block text-[12px] text-holo/80 hover:underline" href={csa.radiation.source} target="_blank" rel="noreferrer">Source: Canadian Space Agency</a>
        </div>
      </div>
    </div>
  );
}

export function LabsView() {
  return <div className="dev-scroll grid h-full content-start gap-3 overflow-y-auto pr-1 md:grid-cols-3"><LabCard /></div>;
}

export interface LogEntry { time: string; text: string; severity: "minor" | "major" | "info"; synced: boolean }

export function LinkView({ online, onToggle, log, onSync, conditions }: { online: boolean; onToggle: () => void; log: LogEntry[]; onSync: () => void; conditions: Condition[] }) {
  const queued = log.filter((l) => !l.synced);
  return (
    <div className="dev-scroll grid h-full gap-3 overflow-y-auto pr-1 lg:grid-cols-[1fr_1.2fr]">
      <div className="dev-panel p-5">
        <p className="dev-title">Earth link</p>
        <p className="mt-2 font-pixel text-2xl tracking-wider" style={{ color: online ? "var(--ok)" : "var(--alert)" }}>{online ? "CONNECTED" : "BLACKOUT"}</p>
        <p className="mt-1 text-sm text-ink/75">{online ? "Records sync to mission control as they happen." : "No contact with Earth. Cosmo keeps monitoring, deciding and logging on board."}</p>
        <button type="button" onClick={onToggle} className="mt-4 rounded-full border border-holo/40 px-4 py-2 text-sm hover:border-holo">
          {online ? "Simulate a blackout" : "Restore the link"}
        </button>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-holo/15 p-3"><p className="text-[11px] text-ink/60">Waiting to sync</p><p className="dev-num text-2xl">{queued.length}</p></div>
          <div className="rounded-xl border border-holo/15 p-3"><p className="text-[11px] text-ink/60">Active conditions</p><p className="dev-num text-2xl">{conditions.length}</p></div>
        </div>
        {online && queued.length > 0 && (
          <button type="button" onClick={onSync} className="mt-4 w-full rounded-full bg-holo px-4 py-2 text-sm font-medium text-void">Send {queued.length} records and the flight surgeon report</button>
        )}
      </div>
      <div className="dev-panel p-5">
        <p className="dev-title">Mission health log</p>
        <ol className="mt-2 space-y-1.5 text-sm">
          {log.length === 0 && <li className="text-ink/60">Nothing logged yet this shift.</li>}
          {[...log].reverse().map((l, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="dev-num w-16 flex-none text-[12px] text-ink/55">{l.time}</span>
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: l.severity === "major" ? "var(--crit)" : l.severity === "minor" ? "var(--alert)" : "var(--holo)" }} />
              <span className="flex-1">{l.text}</span>
              <span className={`text-[10px] ${l.synced ? "text-ok" : "text-amber"}`}>{l.synced ? "synced" : "queued"}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
