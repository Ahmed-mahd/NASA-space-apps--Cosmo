import Link from "next/link";
import GloveStage from "@/components/GloveStage";

const pillars = [
  ["Reads", "A band and a smart shirt stream heart, breathing, oxygen, temperature, sleep and stress."],
  ["Learns", "Cosmo builds each astronaut's own baseline and flags what is unusual for them."],
  ["Guides", "Verified IF–THEN rules pick the next approved step. Cosmo tries, observes and reassesses."],
  ["Cares", "A real buddy with a sense of humor, which switches off the moment things get serious."],
];

export default function Home() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <span className="relative grid h-8 w-8 place-items-center">
            <span className="absolute inset-0 rounded-full border border-holo/60 pulse-ring" />
            <span className="h-2.5 w-2.5 rounded-full bg-holo shadow-[0_0_14px_var(--holo)]" />
          </span>
          <span className="font-mono tracking-[0.35em] text-sm holo-text">COSMO</span>
        </div>
        <span className="hud-label hidden sm:block">NASA Space Apps Cairo 2026 · concept demo</span>
      </header>

      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="z-10 flex flex-col justify-center px-6 pt-28 pb-10 md:px-10 lg:pl-16">
          <p className="hud-label">Autonomous health intelligence</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
            When Earth is <span className="holo-text">20 minutes away</span>, your doctor is on your wrist.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink/75">
            Cosmo lives in the astronaut&rsquo;s glove. It listens, reads the wearables, learns what normal looks like for
            one person, and talks them through approved self-care. No keyboard, no signal needed.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/cosmo"
              className="rounded-full bg-holo px-7 py-3.5 font-medium text-void shadow-[0_0_30px_rgba(94,230,255,.45)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo"
            >
              Wake Cosmo
            </Link>
            <span className="hud-label">Voice first · works best in Chrome</span>
          </div>
          <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6">
            {pillars.map(([t, d]) => (
              <div key={t}>
                <dt className="font-mono text-sm tracking-widest text-amber">{t.toUpperCase()}</dt>
                <dd className="mt-1 text-sm text-ink/70">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative h-[70vh] lg:h-auto" aria-label="An astronaut's glove projecting Cosmo's hologram screen from the wrist">
          <GloveStage />
        </div>
      </section>

      <footer className="px-6 pb-8 md:px-10 lg:pl-16">
        <p className="max-w-3xl text-xs text-ink/50">
          Concept demonstration. Sensor data is replayed from public research datasets. Medical rules shown are example
          protocols that need clinical review and are not medical advice. Built with AI assistance.
        </p>
      </footer>
    </main>
  );
}
