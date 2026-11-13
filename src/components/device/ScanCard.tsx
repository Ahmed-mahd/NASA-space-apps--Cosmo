"use client";

import { SCAN_STEPS } from "@/lib/brain";
import { PROTOCOL_LABEL } from "@/lib/conditions";

/** Guided kidney ultrasound (scenario 2). The image is an illustration, not a real scan. */
export default function ScanCard({ step, onClose }: { step: number; onClose: () => void }) {
  const imaging = step >= 2;
  return (
    <aside className="dev-panel brief-in flex flex-col gap-3 p-4" style={{ borderColor: "var(--violet)" }} aria-label="Kidney ultrasound guide">
      <div className="flex items-start justify-between">
        <div>
          <p className="dev-section text-violet">Guided procedure</p>
          <h3 className="text-lg font-semibold">Kidney ultrasound check</h3>
          <p className="text-[11px] text-ink/60">Handheld probe (Butterfly iQ+ class), crewmate operating</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full border border-holo/30 text-ink/70" aria-label="Close procedure">✕</button>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
        <svg viewBox="0 0 200 150" className="h-full w-full">
          <defs>
            <radialGradient id="cone" cx="50%" cy="0%" r="100%"><stop offset="0" stopColor="#9aa" stopOpacity=".5" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
            <filter id="speckle"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3"><animate attributeName="seed" values="1;9;3;7" dur="0.6s" repeatCount="indefinite" /></feTurbulence><feColorMatrix values="0 0 0 0 .8  0 0 0 0 .8  0 0 0 0 .8  0 0 0 .55 0" /></filter>
            <clipPath id="fan"><path d="M100 4 L190 140 Q100 160 10 140 Z" /></clipPath>
          </defs>
          <g clipPath="url(#fan)">
            <rect width="200" height="150" filter="url(#speckle)" opacity={imaging ? 0.9 : 0.35} />
            <rect width="200" height="150" fill="url(#cone)" />
            {imaging && (
              <g opacity=".85">
                <ellipse cx="100" cy="82" rx="38" ry="24" fill="none" stroke="#ddd" strokeWidth="3" />
                <ellipse cx="102" cy="84" rx="16" ry="8" fill="#222" stroke="#bbb" strokeWidth="1.5" />
              </g>
            )}
          </g>
          <text x="6" y="12" fill="#2ee6ff" fontSize="7">R KIDNEY · 5 MHz · ILLUSTRATION</text>
          {step === 2 && <text x="150" y="12" fill="#ff3b5c" fontSize="7">● REC</text>}
        </svg>
      </div>
      <ol className="space-y-1.5 text-sm">
        {SCAN_STEPS.map((s, i) => (
          <li key={i} className={`flex gap-2 rounded-lg px-2 py-1 ${i === step ? "bg-violet/15" : i < step ? "opacity-55" : "opacity-40"}`}>
            <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-semibold" style={{ background: i <= step ? "var(--violet)" : "transparent", border: "1px solid var(--violet)" }}>{i < step ? "✓" : i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-amber/80">{PROTOCOL_LABEL}. The scan image is an illustration.</p>
    </aside>
  );
}
