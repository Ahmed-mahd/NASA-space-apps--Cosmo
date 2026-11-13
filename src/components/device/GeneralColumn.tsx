"use client";

import mmash from "@/data/clips/mmash-user22.json";
import { risks } from "@/data/nasa";
import type { RegionId } from "@/data/regions";
import type { Condition, CrewStatus } from "@/lib/conditions";

const STATUS: Record<CrewStatus, { label: string; color: string; note: string }> = {
  nominal: { label: "Nominal", color: "var(--ok)", note: "All readings inside your normal" },
  advisory: { label: "Advisory", color: "var(--alert)", note: "Something to keep an eye on" },
  alert: { label: "Alert", color: "var(--crit)", note: "Action needed now" },
};
const SEV_COLOR = { minor: "var(--alert)", major: "var(--crit)" } as const;
const fitness = risks.find((r) => r.id === "fitness")!;

interface Props {
  status: CrewStatus;
  conditions: Condition[];
  stepsToday: number;
  onOpenRegion: (r: RegionId) => void;
}

export default function GeneralColumn({ status, conditions, stepsToday, onOpenRegion }: Props) {
  const s = STATUS[status];
  const top = [...conditions].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1))[0];
  const sleepH = ((mmash.sleep.totalSleepMin ?? 0) / 60).toFixed(1);
  const recs = top
    ? top.steps.slice(0, 3)
    : ["Keep your fluids up through the shift.", `Exercise block at 14:00 (NASA crews train about 1.5 hours a day).`, "Next check-in with Cosmo at 13:00."];
  return (
    <div className="flex flex-col gap-3">
      <div className="dev-panel flex items-center justify-between p-4">
        <div>
          <p className="dev-title">Crew status summary</p>
          <p className="mt-1 font-pixel text-3xl tracking-wider" style={{ color: s.color, textShadow: `0 0 18px ${s.color}` }}>{s.label.toUpperCase()}</p>
          <p className="text-[11px] text-ink/60">{s.note}</p>
        </div>
        <span className="relative grid h-14 w-14 place-items-center rounded-full border-[3px]" style={{ borderColor: s.color, boxShadow: `0 0 18px ${s.color}` }}>
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: s.color }} />
          {status !== "nominal" && <span className="absolute inset-0 rounded-full border-2 pulse-ring" style={{ borderColor: s.color }} />}
        </span>
      </div>

      <div className="dev-panel p-4">
        <p className="dev-title">Active alerts / conditions</p>
        {conditions.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-ok"><span className="grid h-5 w-5 place-items-center rounded-full border border-ok text-[10px]">✓</span>No active alerts</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {conditions.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenRegion(c.region)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: SEV_COLOR[c.severity], boxShadow: `0 0 8px ${SEV_COLOR[c.severity]}` }} />
                  <span className="flex-1">{c.title}</span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: SEV_COLOR[c.severity] }}>{c.severity}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {top && (
        <button type="button" onClick={() => onOpenRegion(top.region)} className="dev-panel is-interactive p-4 brief-in"
          style={{ borderColor: SEV_COLOR[top.severity], background: `linear-gradient(90deg, color-mix(in srgb, ${SEV_COLOR[top.severity]} 16%, transparent), rgba(7,21,48,.75))`, borderLeftWidth: 4 }}>
          <p className="text-sm font-medium">{top.title}</p>
          <p className="mt-0.5 text-[12px]" style={{ color: SEV_COLOR[top.severity] }}>{top.severity === "major" ? "Major" : "Minor"} · {top.short}</p>
          <p className="mt-1 text-[11px] text-ink/55">Open the brief</p>
        </button>
      )}

      <div className="dev-panel p-4">
        <p className="dev-title">Today&rsquo;s activity log</p>
        <dl className="mt-2 grid gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink/70">Steps</dt><dd className="dev-num">{stepsToday.toLocaleString("en-US")}</dd></div>
          <div className="flex justify-between"><dt className="text-ink/70">Sleep last night</dt><dd className="dev-num">{sleepH} hrs</dd></div>
          <div className="flex justify-between"><dt className="text-ink/70">Exercise planned</dt><dd className="dev-num">1.5 hrs</dd></div>
        </dl>
      </div>

      <div className="dev-panel flex-1 p-4">
        <p className="dev-title">{top ? "Next steps from Cosmo" : "Recommendations"}</p>
        <ul className="mt-2 flex flex-col gap-2 text-[13px] text-ink/85">
          {recs.map((x) => (
            <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-holo" />{x}</li>
          ))}
        </ul>
        {!top && (
          <a href={fitness.source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-holo/70 hover:underline">Source: NASA HRP fitness risk</a>
        )}
      </div>
    </div>
  );
}
