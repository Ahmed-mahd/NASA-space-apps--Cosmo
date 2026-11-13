"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Deviation } from "@/lib/baseline";
import type { HistoryPoint } from "@/lib/useVitals";
import type { VitalMeta } from "@/lib/vitals";
import { LEVEL_COLOR, LEVEL_TEXT, SourceBadge, fmt } from "./VitalTile";

interface Props {
  meta: VitalMeta;
  dev: Deviation;
  range: [number, number];
  history: HistoryPoint[];
  shifted: boolean;
}

export default function TrendChart({ meta, dev, range, history, shifted }: Props) {
  const color = dev.level > 0 ? LEVEL_COLOR[dev.level] : "var(--holo)";
  return (
    <section className="holo-panel p-4" aria-label={`${meta.label} trend, last 5 minutes`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="hud-label">{meta.label} · last 5 min</h2>
          <SourceBadge meta={meta} shifted={shifted} />
        </div>
        <p className="text-xs text-ink/70">
          Personal baseline {fmt(dev.mean, meta.decimals)} {meta.unit} (band = your normal ±2 spreads) ·{" "}
          {dev.n.toLocaleString("en-US")} readings learned{dev.frozen ? " · learning paused while unusual" : ""}
        </p>
      </div>
      <div className="mt-3 h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--holo)" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="clock" tick={{ fill: "var(--ink)", fillOpacity: 0.5, fontSize: 10 }} minTickGap={60} stroke="var(--holo)" strokeOpacity={0.2} />
            <YAxis domain={meta.domain} tick={{ fill: "var(--ink)", fillOpacity: 0.5, fontSize: 10 }} stroke="var(--holo)" strokeOpacity={0.2} />
            <ReferenceArea y1={range[0]} y2={range[1]} fill="var(--holo)" fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
            <ReferenceLine y={dev.mean} stroke="var(--holo)" strokeOpacity={0.4} strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{ background: "var(--deep)", border: "1px solid var(--holo-dim)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--ink)" }}
              formatter={(v) => [`${v} ${meta.unit}`, meta.label]}
            />
            <Line type="monotone" dataKey={meta.key} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs" style={{ color: LEVEL_COLOR[dev.level] }}>
        {meta.concern === "none" ? "Context only: helps explain other readings." : LEVEL_TEXT[dev.level]} ·{" "}
        <span className="text-ink/60">15-second average {fmt(dev.recent, meta.decimals)} {meta.unit}, {dev.z >= 0 ? "+" : ""}{dev.z.toFixed(1)} spreads from your mean</span>
      </p>
    </section>
  );
}
