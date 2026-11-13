"use client";

import { Line, LineChart, ReferenceArea, ResponsiveContainer, YAxis } from "recharts";
import type { Deviation, DeviationLevel } from "@/lib/baseline";
import type { HistoryPoint } from "@/lib/useVitals";
import type { VitalMeta } from "@/lib/vitals";

export const LEVEL_COLOR: Record<DeviationLevel, string> = {
  0: "var(--ok)", 1: "var(--warn)", 2: "var(--alert)", 3: "var(--crit)",
};
export const LEVEL_TEXT: Record<DeviationLevel, string> = {
  0: "Within your normal",
  1: "A little unusual for you",
  2: "Clearly unusual for you",
  3: "Far from your normal",
};

export function fmt(v: number | null | undefined, decimals: number) {
  return v == null ? "--" : v.toFixed(decimals);
}

export function SourceBadge({ meta, shifted }: { meta: VitalMeta; shifted?: boolean }) {
  const sim = meta.provenance === "Simulated" || shifted;
  const text = meta.provenance === "Simulated" ? "Simulated" : shifted ? `${meta.provenance} + sim shift` : meta.provenance;
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sim ? "bg-amber/15 text-amber" : "bg-holo/10 text-holo/80"}`}
      title={`Product sensor: ${meta.sensor}. Demo data: ${text}.`}
    >
      {text}
    </span>
  );
}

interface Props {
  meta: VitalMeta;
  dev: Deviation;
  range: [number, number];
  history: HistoryPoint[];
  shifted: boolean;
  selected: boolean;
  onSelect: () => void;
}

export default function VitalTile({ meta, dev, range, history, shifted, selected, onSelect }: Props) {
  const color = LEVEL_COLOR[dev.level];
  const trend = dev.z > 1 ? "↑" : dev.z < -1 ? "↓" : "";
  const data = history.slice(-120);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`holo-panel group flex min-h-40 flex-col p-3.5 text-left transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-holo ${selected ? "ring-1 ring-holo" : ""}`}
      style={{ borderColor: dev.level > 0 ? color : undefined, boxShadow: dev.level > 0 ? `0 0 22px color-mix(in srgb, ${color} 35%, transparent)` : undefined }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="hud-label leading-tight">{meta.label}</span>
        <SourceBadge meta={meta} shifted={shifted} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums" style={{ color: dev.level > 0 ? color : undefined }}>
          {fmt(dev.value, meta.decimals)}
        </span>
        <span className="text-xs text-ink/60">{meta.unit}</span>
        {trend && <span className="ml-1 text-sm" style={{ color }} aria-hidden>{trend}</span>}
      </div>
      <div className="h-12 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={meta.domain} />
            <ReferenceArea y1={range[0]} y2={range[1]} fill="var(--holo)" fillOpacity={0.07} stroke="none" ifOverflow="hidden" />
            <Line type="monotone" dataKey={meta.key} stroke={dev.level > 0 ? color : "var(--holo)"} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px]">
        <span className="flex items-center gap-1.5" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {meta.concern === "none" ? "Context only" : LEVEL_TEXT[dev.level]}
        </span>
        <span className="text-ink/50 tabular-nums">
          normal {fmt(range[0], meta.decimals)}–{fmt(range[1], meta.decimals)}
        </span>
      </div>
    </button>
  );
}
