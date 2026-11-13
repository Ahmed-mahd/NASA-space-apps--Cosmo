"use client";

import Link from "next/link";
import { hazards, HAZARDS_SOURCE, type HazardId } from "@/data/nasa";

export type Environment = "earth" | "station" | "transit" | "moon" | "mars";
export type SuitMode = "IVA" | "EVA";

/** Our mission-profile mapping (design, not NASA statements). Light-time delays are one-way. */
export const ENVIRONMENTS: Record<Environment, { label: string; gravity: string; delay: string; hazards: HazardId[] }> = {
  earth: { label: "Earth", gravity: "1 g", delay: "none", hazards: [] },
  station: { label: "Station", gravity: "Microgravity", delay: "< 1 s", hazards: ["radiation", "isolation", "gravity", "environment"] },
  transit: { label: "Transit", gravity: "Microgravity", delay: "up to 22 min", hazards: ["radiation", "isolation", "distance", "gravity", "environment"] },
  moon: { label: "Moon", gravity: "1/6 g", delay: "≈ 1.3 s", hazards: ["radiation", "isolation", "distance", "gravity", "environment"] },
  mars: { label: "Mars", gravity: "3/8 g", delay: "3–22 min", hazards: ["radiation", "isolation", "distance", "gravity", "environment"] },
};

interface Props {
  env: Environment;
  onEnv: (e: Environment) => void;
  suit: SuitMode;
  onSuit: (s: SuitMode) => void;
  clock?: string;
}

export default function MissionBar({ env, onEnv, suit, onSuit, clock }: Props) {
  const e = ENVIRONMENTS[env];
  return (
    <header className="holo-panel flex flex-col gap-4 px-4 py-3 md:px-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/" className="font-mono text-sm tracking-[0.35em] holo-text">COSMO</Link>
        <span className="hud-label">Mission day 142</span>
        {clock && <span className="font-mono text-xs text-ink/60 tabular-nums">Ship time {clock}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Mission environment" className="flex rounded-full border border-holo/30 p-0.5">
          {(Object.keys(ENVIRONMENTS) as Environment[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={env === k}
              onClick={() => onEnv(k)}
              className={`rounded-full px-3 py-1 text-xs transition ${env === k ? "bg-holo text-void" : "text-ink/70 hover:text-ink"}`}
            >
              {ENVIRONMENTS[k].label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Activity mode" className="flex rounded-full border border-amber/40 p-0.5">
          {(["IVA", "EVA"] as SuitMode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={suit === m}
              onClick={() => onSuit(m)}
              title={m === "IVA" ? "Inside the vehicle" : "Spacewalk, suit on"}
              className={`rounded-full px-3 py-1 font-mono text-xs transition ${suit === m ? "bg-amber text-void" : "text-ink/70 hover:text-ink"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="text-ink/70">Gravity <b className="font-medium text-ink">{e.gravity}</b></span>
        <span className="text-ink/70">Earth delay <b className="font-medium text-ink">{e.delay}</b></span>
        <span className="flex flex-wrap gap-1.5" aria-label="Active NASA hazards">
          {hazards.filter((h) => e.hazards.includes(h.id)).map((h) => (
            <a
              key={h.id}
              href={HAZARDS_SOURCE}
              target="_blank"
              rel="noreferrer"
              title={h.summary}
              className="rounded-full border border-holo/30 px-2 py-0.5 text-[11px] text-holo/90 hover:border-holo"
            >
              {h.name}
            </a>
          ))}
          {e.hazards.length === 0 && <span className="text-ink/50">Ground analog: no spaceflight hazards</span>}
        </span>
      </div>
    </header>
  );
}
