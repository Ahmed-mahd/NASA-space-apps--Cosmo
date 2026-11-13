"use client";

import { useEffect, useState } from "react";
import type { TranscriptLine } from "@/lib/useConversation";
import { useVoice, type Speaker } from "@/lib/voice";

const WHO: Record<Speaker, { label: string; color: string }> = {
  cosmo: { label: "Cosmo", color: "var(--holo)" },
  astronaut: { label: "Astronaut", color: "var(--amber)" },
  crewmate: { label: "Crewmate", color: "var(--violet)" },
};

interface Props {
  engine: string;
  busy: boolean;
  demo: string | null;
  transcript: TranscriptLine[];
  onTalk: () => void;
  onDemo: (id: "hypoxia" | "flank") => void;
  onCancelDemo: () => void;
  alert: boolean;
}

/** The voice interface: Cosmo's orb, push-to-talk, live captions and demo conversations. */
export default function VoiceDock({ engine, busy, demo, transcript, onTalk, onDemo, onCancelDemo, alert }: Props) {
  const v = useVoice();
  const [log, setLog] = useState(false);
  const [menu, setMenu] = useState(false);

  // hold Space to talk (when not typing in a field)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code === "Space" && !e.repeat && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(t.tagName)) { e.preventDefault(); onTalk(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [onTalk]);

  const speaking = v.speaking;
  const ring = speaking ? WHO[speaking].color : v.listening ? "var(--ok)" : alert ? "var(--crit)" : "var(--holo)";
  const cap = v.caption;
  const status = v.listening ? "Listening…" : speaking ? `${WHO[speaking].label} speaking` : busy ? (demo ? `Demo: ${demo}` : "Thinking…") : v.supported.stt ? "Press the mic or hold Space" : "Voice input needs Chrome";

  return (
    <div className="dev-panel relative flex items-center gap-3 p-2 pr-3" style={{ borderColor: alert ? "var(--crit)" : undefined }}>
      {/* orb + mic */}
      <button type="button" onClick={onTalk} disabled={busy && !v.listening} aria-label={v.listening ? "Listening" : "Talk to Cosmo"}
        className="relative grid h-14 w-14 flex-none place-items-center rounded-full disabled:cursor-wait">
        {v.listening && <span className="listen-pulse absolute inset-0 rounded-full border-2" style={{ borderColor: ring }} />}
        <span className="voice-ring absolute inset-0 rounded-full border-2"
          style={{ borderColor: ring, transform: `scale(${1 + (speaking ? v.level * 0.14 : 0)})`, boxShadow: `0 0 ${speaking || v.listening ? 26 : 10}px ${ring}` }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/models/cosmo-robot.svg" alt="" className={`h-10 w-9 object-contain ${speaking === "cosmo" ? "mind-talk" : ""}`} />
        <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-void text-[12px]" style={{ border: `1px solid ${ring}` }} aria-hidden>🎙</span>
      </button>

      {/* caption */}
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] tracking-wide text-ink/55">{status}</p>
        <p className="truncate text-[14px] leading-snug" aria-live="polite">
          {cap?.text ? (
            <><b style={{ color: WHO[cap.who].color }}>{WHO[cap.who].label} </b><span className={cap.interim ? "italic text-ink/70" : ""}>{cap.text}</span></>
          ) : <span className="text-ink/50">Say &ldquo;Hey Cosmo, I&rsquo;ve got a headache&rdquo; or &ldquo;tell me a joke&rdquo;.</span>}
        </p>
        {v.error && <p className="text-[11px] text-alert">{v.error}</p>}
      </div>

      {/* controls */}
      <div className="flex flex-none items-center gap-1.5">
        {demo ? (
          <button type="button" onClick={onCancelDemo} className="rounded-full border border-amber/60 px-3 py-1.5 text-xs text-amber">Stop demo</button>
        ) : (
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} disabled={busy} className="rounded-full border border-violet/60 px-3 py-1.5 text-xs hover:bg-violet/20 disabled:opacity-50" aria-expanded={menu}>
              ▶ Demo conversation
            </button>
            {menu && (
              <div className="absolute bottom-10 right-0 z-50 w-64 rounded-xl border border-violet/40 bg-deep/95 p-1.5 shadow-2xl">
                <button type="button" onClick={() => { setMenu(false); onDemo("hypoxia"); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">Fatigue and headache<span className="block text-[11px] text-ink/55">Mild hypoxia, rest, recheck, joke</span></button>
                <button type="button" onClick={() => { setMenu(false); onDemo("flank"); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">Flank pain<span className="block text-[11px] text-ink/55">Major alert, crewmate, kidney scan</span></button>
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={() => setLog((l) => !l)} className="rounded-full border border-holo/30 px-3 py-1.5 text-xs" aria-expanded={log}>Log</button>
      </div>

      {log && (
        <div className="dev-panel dev-scroll absolute bottom-[4.5rem] right-0 z-40 max-h-80 w-[min(460px,90vw)] overflow-y-auto p-4 brief-in">
          <div className="flex items-center justify-between"><p className="dev-title">Conversation</p><span className="text-[10.5px] text-ink/50">Brain: {engine}</span></div>
          <ol className="mt-2 space-y-2 text-sm">
            {transcript.length === 0 && <li className="text-ink/55">Nothing said yet.</li>}
            {transcript.map((l, i) => (
              <li key={i}><b style={{ color: WHO[l.who].color }}>{WHO[l.who].label}: </b>{l.text}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
