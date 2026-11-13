import Link from "next/link";

export default function CosmoPage() {
  return (
    <main className="flex-1 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-mono tracking-[0.35em] text-sm holo-text">COSMO</Link>
        <span className="hud-label">Mission day 142 · Deep-space transit · IVA</span>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {["Vitals", "Body map", "Cosmo"].map((t) => (
          <section key={t} className="holo-panel min-h-64 p-5">
            <h2 className="hud-label">{t}</h2>
            <p className="mt-6 text-sm text-ink/60">Coming online in the next build phase.</p>
          </section>
        ))}
      </div>
    </main>
  );
}
