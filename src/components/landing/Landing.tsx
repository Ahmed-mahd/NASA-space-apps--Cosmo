"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ASTRONAUT_SVG } from "./astronautSvg";

const SpaceScene = dynamic(() => import("./SpaceScene"), { ssr: false });

const LINES = [
  "Earth is 20 minutes away. I'm right here.",
  "No signal? I run on board.",
  "I know your normal, so I notice the small things.",
  "Body and mind. I keep an eye on both.",
];

const POINTS = [
  { title: "Reads the suit and the cabin", body: "A band, a smart shirt and cabin sensors, radiation included, stream into one live picture of the astronaut." },
  { title: "Thinks on board", body: "Monitoring, safety rules and the AI companion run on the spacecraft. No Earth link needed." },
  { title: "Cares for body and mind", body: "Spots what is unusual for this person, explains it in plain words and walks them through approved steps." },
  { title: "Syncs when Earth is back", body: "Logs everything through a blackout, then sends a report to the flight surgeon when contact returns." },
];

export default function Landing({ onOpen, zooming }: { onOpen: (origin: { x: number; y: number }) => void; zooming: boolean }) {
  const [line, setLine] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const hotspot = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % LINES.length), 4200);
    return () => clearInterval(id);
  }, []);

  const open = () => {
    const r = hotspot.current?.getBoundingClientRect();
    onOpen(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth * 0.7, y: innerHeight * 0.35 });
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden" onPointerMove={(e) => setTilt({ x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5 })}>
      <div className="fixed inset-0 -z-0">
        <SpaceScene paused={zooming} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_75%_30%,rgba(13,89,255,.18),transparent_70%),radial-gradient(700px_500px_at_95%_80%,rgba(163,91,255,.14),transparent_70%)]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
        <span className="flex items-center gap-3">
          <span className="relative grid h-7 w-7 place-items-center">
            <span className="absolute inset-0 rounded-full border border-holo/60 pulse-ring" />
            <span className="h-2 w-2 rounded-full bg-holo shadow-[0_0_14px_var(--holo)]" />
          </span>
          <span className="font-pixel text-lg tracking-[0.3em] text-holo">COSMO</span>
        </span>
        <span className="hidden text-xs text-ink/60 sm:block">A simulation for NASA Space Apps Cairo 2026</span>
      </header>

      <section className="relative z-10 grid min-h-[calc(100dvh-76px)] items-center gap-6 px-5 pb-10 md:px-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="max-w-xl">
          <h1 className="text-[clamp(2.6rem,6vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
            Your companion
            <br />
            beyond Earth.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink/75">
            COSMO lives on the astronaut&rsquo;s wrist. It reads their sensors, learns what normal looks like for one person,
            and talks them through what to do, even when Earth goes silent.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={open}
              className="rounded-full bg-holo px-7 py-3.5 font-medium text-void shadow-[0_0_34px_rgba(46,230,255,.5)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo"
            >
              Open the wrist screen
            </button>
            <span className="text-sm text-ink/55">or tap the hologram</span>
          </div>
        </div>

        <div className="relative mx-auto aspect-[1.25] w-full max-w-[820px] [perspective:1400px]">
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out [transform-style:preserve-3d]"
            style={{ transform: `rotateY(${tilt.x * 10}deg) rotateX(${-tilt.y * 6}deg)` }}
          >
            {/* astronaut, facing right toward Cosmo */}
            <div className="absolute left-0 top-[2%] h-[96%] [transform:translateZ(40px)]" style={{ aspectRatio: "1447 / 1857" }}>
              <div className="astro-float relative h-full w-full">
                <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: ASTRONAUT_SVG }} />
                <button ref={hotspot} type="button" onClick={open} className="holo-hotspot" aria-label="Open the COSMO wrist screen">
                  <span className="absolute inset-0 flex flex-col justify-between p-[6cqw] text-left">
                    <span className="flex items-center justify-between">
                      <span className="font-pixel text-[9cqw] leading-none tracking-[0.2em]">COSMO</span>
                      <span className="h-[3cqw] w-[3cqw] rounded-full bg-ok shadow-[0_0_8px_var(--ok)]" />
                    </span>
                    <svg viewBox="0 0 100 24" className="w-full" aria-hidden>
                      <path d="M0 14 L22 14 L26 10 L30 14 L36 14 L39 3 L43 22 L46 14 L60 14 L64 11 L68 14 L100 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="ecg-path" style={{ animationDuration: "1.6s" }} pathLength={600} />
                    </svg>
                    <span className="flex items-end justify-between text-[6.5cqw] text-ink/85">
                      <span>HR 72 · SpO₂ 97%</span>
                      <span className="holo-cta text-holo">Tap to open</span>
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Cosmo, facing the astronaut */}
            <div className="absolute right-[1%] top-[22%] h-[64%] [transform:translateZ(110px)]" style={{ aspectRatio: "720 / 1320" }}>
              <div className="cosmo-float relative h-full w-full">
                <div className="absolute -left-[118%] -top-[14%] w-[165%] text-xs sm:-left-[70%] sm:-top-[12%] sm:w-[140%] sm:text-sm rounded-2xl rounded-br-sm border border-holo/40 bg-hull/85 px-4 py-3 text-sm leading-snug shadow-[0_0_30px_rgba(46,230,255,.2)] backdrop-blur" aria-live="polite">
                  <span key={line} className="brief-in block">{LINES[line]}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/models/cosmo-robot.svg" alt="Cosmo, the robot companion" className="h-full w-full object-contain drop-shadow-[0_0_40px_rgba(46,230,255,.25)] [transform:rotateY(-14deg)]" />
                <div className="absolute -bottom-[3%] left-1/2 h-[5%] w-[70%] -translate-x-1/2 rounded-[50%] bg-holo/30 blur-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-holo/10 bg-void/70 px-5 py-16 backdrop-blur md:px-10">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Built for the far side of the signal.</h2>
            <p className="mt-4 max-w-md text-ink/70">
              On a long mission, help from Earth can be minutes away or out of reach. COSMO keeps monitoring, thinking and
              caring on board, so the astronaut is never on their own.
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {POINTS.map((p) => (
              <div key={p.title} className="border-l border-holo/40 pl-4">
                <dt className="font-medium text-ink">{p.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink/65">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="mx-auto mt-16 max-w-6xl rounded-2xl border border-amber/30 bg-amber/5 p-6 md:p-8" aria-label="What you are seeing">
          <h2 className="text-lg font-semibold text-amber">What you are seeing</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/80">
            This website is a working simulation of COSMO, not a connection to spacecraft hardware. Astronaut readings and
            mission events are replayed from public research data (PhysioNet, NASA OSDR) or simulated, and every simulated value
            is labeled on screen. The health rules are example protocols that need review by a medical professional. Built with
            AI assistance.
          </p>
        </aside>
        <p className="mx-auto mt-10 max-w-6xl text-xs text-ink/45">COSMO, your companion beyond Earth. NASA Space Apps Challenge, Cairo 2026.</p>
      </section>

    </div>
  );
}
