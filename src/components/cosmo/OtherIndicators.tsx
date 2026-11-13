"use client";

import { useState } from "react";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import mmash from "@/data/clips/mmash-user22.json";
import osd from "@/data/clips/osd575.json";
import { csa } from "@/data/nasa";

type Analyte = { label: string; units: string; rangeMin: number; rangeMax: number; crew: Record<string, Record<string, number | null>> };
const ANALYTES = osd.analytes as Record<string, Analyte>;
const LAB_ORDER = ["glucose", "creatinine", "bun", "calcium", "potassium", "sodium"] as const;
const LAB_NAME: Record<string, string> = {
  glucose: "Glucose", creatinine: "Creatinine", bun: "Urea nitrogen", calcium: "Calcium", potassium: "Potassium", sodium: "Sodium",
};
const CREW = ["C001", "C002", "C003", "C004"];

function Badge({ sim, children }: { sim?: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sim ? "bg-amber/15 text-amber" : "bg-holo/10 text-holo/80"}`}>
      {children}
    </span>
  );
}

function Card({ title, badge, children, className = "" }: { title: string; badge: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`holo-panel flex flex-col p-3.5 ${className}`} aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="hud-label leading-tight">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function SleepCard() {
  const s = mmash.sleep;
  const h = Math.floor((s.totalSleepMin ?? 0) / 60), m = (s.totalSleepMin ?? 0) % 60;
  return (
    <Card title="Sleep · last night" badge={<Badge>MMASH replay</Badge>}>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{h}<span className="text-base text-ink/60">h</span> {String(m).padStart(2, "0")}<span className="text-base text-ink/60">m</span></p>
      <dl className="mt-auto grid grid-cols-3 gap-2 pt-2 text-[11px] text-ink/60">
        <div><dt>In bed</dt><dd className="text-ink tabular-nums">{s.inBed}–{s.outBed}</dd></div>
        <div><dt>Efficiency</dt><dd className="text-ink tabular-nums">{Math.round(s.efficiency ?? 0)}%</dd></div>
        <div><dt>Awakenings</dt><dd className="text-ink tabular-nums">{s.awakenings}</dd></div>
      </dl>
    </Card>
  );
}

export function MoodCard() {
  return (
    <Card title="Mood" badge={<Badge>Voice check-in</Badge>}>
      <p className="mt-2 text-lg text-ink/80">No check-in yet today</p>
      <p className="mt-auto pt-2 text-[11px] text-ink/60">Cosmo asks how you feel and logs it from your answer. No forms, no typing.</p>
    </Card>
  );
}

export function SpotChecksCard() {
  return (
    <Card title="Blood pressure · glucose" badge={<Badge sim>Preset for demo</Badge>}>
      <div className="mt-2 flex items-baseline gap-4">
        <p className="text-2xl font-semibold tabular-nums">118/76 <span className="text-xs font-normal text-ink/60">mmHg</span></p>
        <p className="text-2xl font-semibold tabular-nums">92 <span className="text-xs font-normal text-ink/60">mg/dL</span></p>
      </div>
      <p className="mt-auto pt-2 text-[11px] text-ink/60">Measured with the cuff and meter when Cosmo asks. Values are spoken or read from the device. This morning, 07:40.</p>
    </Card>
  );
}

export function RadiationCard() {
  return (
    <Card title="Radiation dose" badge={<Badge sim>Simulated</Badge>}>
      <p className="mt-2 text-3xl font-semibold tabular-nums">71 <span className="text-xs font-normal text-ink/60">mSv this mission</span></p>
      <p className="mt-auto pt-2 text-[11px] text-ink/60">
        From the cabin dosimeter. {csa.radiation.points[1]}{" "}
        <a className="text-holo/80 underline-offset-2 hover:underline" href={csa.radiation.source} target="_blank" rel="noreferrer">CSA</a>
      </p>
    </Card>
  );
}

export function LabCard() {
  const [key, setKey] = useState<(typeof LAB_ORDER)[number]>("glucose");
  const [crew, setCrew] = useState("C001");
  const a = ANALYTES[key];
  const data = osd.timepoints.map((tp) => ({ tp, v: a.crew[crew]?.[tp] ?? null }));
  const vals = data.map((d) => d.v).filter((v): v is number => v != null);
  const lo = Math.min(a.rangeMin, ...vals), hi = Math.max(a.rangeMax, ...vals), pad = (hi - lo) * 0.15;
  return (
    <Card title="Blood chemistry · before and after flight" badge={<Badge>OSD-575</Badge>} className="md:col-span-3">
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="sr-only" htmlFor="lab-analyte">Test</label>
        <select id="lab-analyte" value={key} onChange={(e) => setKey(e.target.value as typeof key)} className="rounded border border-holo/30 bg-deep px-2 py-1 text-ink">
          {LAB_ORDER.map((k) => <option key={k} value={k}>{LAB_NAME[k]}</option>)}
        </select>
        <label className="sr-only" htmlFor="lab-crew">Crew member</label>
        <select id="lab-crew" value={crew} onChange={(e) => setCrew(e.target.value)} className="rounded border border-holo/30 bg-deep px-2 py-1 text-ink">
          {CREW.map((c) => <option key={c} value={c}>Inspiration4 crew {c}</option>)}
        </select>
        <span className="text-ink/60">Lab range {a.rangeMin}–{a.rangeMax} {a.units}</span>
      </div>
      <div className="mt-2 h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -16 }}>
            <XAxis dataKey="tp" tick={{ fill: "var(--ink)", fillOpacity: 0.55, fontSize: 10 }} stroke="var(--holo)" strokeOpacity={0.2} />
            <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} tick={{ fill: "var(--ink)", fillOpacity: 0.55, fontSize: 10 }} stroke="var(--holo)" strokeOpacity={0.2} />
            <ReferenceArea y1={a.rangeMin} y2={a.rangeMax} fill="var(--holo)" fillOpacity={0.08} stroke="none" />
            <ReferenceArea x1="L-3" x2="R+1" fill="var(--amber)" fillOpacity={0.06} stroke="none" label={{ value: "flight", fill: "var(--amber)", fontSize: 10, position: "insideTop" }} />
            <Tooltip contentStyle={{ background: "var(--deep)", border: "1px solid var(--holo-dim)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} ${a.units}`, LAB_NAME[key]]} />
            <Line type="monotone" dataKey="v" stroke="var(--holo)" strokeWidth={2} dot={{ r: 3, fill: "var(--holo)" }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-ink/60">
        Real research data from the Inspiration4 crew, shown for trend only and not interpreted. L = days before launch, R = days after return.{" "}
        <a className="text-holo/80 underline-offset-2 hover:underline" href={osd.url} target="_blank" rel="noreferrer">NASA OSDR</a>
      </p>
    </Card>
  );
}
