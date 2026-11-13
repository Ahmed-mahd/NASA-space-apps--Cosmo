"use client";

import { risksByRegion } from "@/data/nasa";
import { REGION, type RegionId } from "@/data/regions";
import { PROTOCOL_LABEL, PROTOCOL_VERSION, type Condition } from "@/lib/conditions";

const SEV = {
  minor: { color: "var(--alert)", label: "Minor" },
  major: { color: "var(--crit)", label: "Major" },
} as const;

export default function RegionBrief({ region, conditions, onClose }: { region: RegionId; conditions: Condition[]; onClose: () => void }) {
  const info = REGION[region];
  const here = conditions.filter((c) => c.region === region);
  const nasa = region === "kidneys" ? [] : risksByRegion(region);
  const worst = here.find((c) => c.severity === "major") ?? here[0];
  const accent = worst ? SEV[worst.severity].color : "var(--holo)";
  return (
    <aside
      className="dev-panel brief-in dev-scroll flex max-h-full flex-col overflow-y-auto p-5"
      style={{ borderColor: accent, boxShadow: `0 0 40px color-mix(in srgb, ${accent} 25%, transparent)` }}
      aria-label={`${info.label} brief`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="dev-section" style={{ color: accent }}>{info.label}</p>
          <h3 className="mt-1 text-xl font-semibold leading-tight">{worst ? worst.title : "No active issues here"}</h3>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-full border border-holo/30 text-ink/70 hover:text-ink" aria-label="Close brief">✕</button>
      </div>

      {here.map((c) => (
        <section key={c.id} className="mt-4">
          {here.length > 1 && <h4 className="text-sm font-semibold">{c.title}</h4>}
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${SEV[c.severity].color} 18%, transparent)`, color: SEV[c.severity].color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV[c.severity].color }} />{SEV[c.severity].label}
          </span>

          <p className="mt-3 text-[11px] font-semibold tracking-wider text-ink/60">WHAT COSMO SEES</p>
          <ul className="mt-1 space-y-1 text-sm">{c.readings.map((x) => <li key={x}>{x}</li>)}</ul>

          <p className="mt-3 text-[11px] font-semibold tracking-wider text-ink/60">WHAT IT COULD MEAN</p>
          <p className="mt-1 text-sm text-ink/85">{c.meaning}</p>

          <p className="mt-3 text-[11px] font-semibold tracking-wider text-ink/60">WHAT TO DO NOW</p>
          <ol className="mt-1.5 space-y-2 text-sm">
            {c.steps.map((x, i) => (
              <li key={x} className="flex gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-semibold text-void" style={{ background: SEV[c.severity].color }}>{i + 1}</span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 rounded-lg border border-holo/20 bg-holo/5 px-3 py-2 text-[12px] text-ink/80">↻ {c.recheck}</p>
          {c.crewmate && <p className="mt-2 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-[12px]">Cosmo will ask if a crewmate is present and coach them directly.</p>}

          <details className="mt-3 text-[12px] text-ink/70">
            <summary className="cursor-pointer text-holo/80">Why did Cosmo say that?</summary>
            <p className="mt-1">Rule {c.ruleId} in {PROTOCOL_VERSION}. The learning layer compared your readings with your own baseline; the rule file picked the severity and the steps. The language model only puts them into words.</p>
            <ul className="mt-1">{c.sources.map((s) => <li key={s.url + s.label}><a className="text-holo/80 hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
          </details>
          <p className="mt-2 text-[11px] text-amber/80">{PROTOCOL_LABEL}</p>
        </section>
      ))}

      {nasa.length > 0 && (
        <section className="mt-5 border-t border-holo/15 pt-4">
          <p className="text-[11px] font-semibold tracking-wider text-ink/60">NASA HUMAN RISKS FOR THIS AREA</p>
          {nasa.map((r) => (
            <details key={r.id} className="mt-2 rounded-lg border border-holo/15 p-2.5 text-sm" open={!here.length && nasa.length === 1}>
              <summary className="cursor-pointer font-medium">{r.name}</summary>
              <p className="mt-1.5 text-ink/80">{r.what}</p>
              {r.signs.length > 0 && <p className="mt-1.5 text-[12px] text-ink/70"><b className="text-ink/90">Signs:</b> {r.signs.join(", ")}</p>}
              <p className="mt-1 text-[12px] text-ink/70"><b className="text-ink/90">NASA countermeasures:</b> {r.countermeasures.join("; ")}</p>
              <a className="mt-1 inline-block text-[12px] text-holo/80 hover:underline" href={r.source} target="_blank" rel="noreferrer">Source: NASA HRP</a>
            </details>
          ))}
        </section>
      )}
      {!here.length && region === "kidneys" && (
        <p className="mt-3 text-sm text-ink/75">Cosmo watches for flank pain you report and can guide a kidney ultrasound check with the handheld probe.</p>
      )}
    </aside>
  );
}
