"use client";

import { useState } from "react";
import type { Turn } from "@/lib/brain";
import { DEMOS, type DemoId, type TranscriptLine } from "@/lib/useConversation";
import { disableWake, enableWake, useVoice, type Speaker } from "@/lib/voice";

const WHO: Record<Speaker, { label: string; color: string }> = {
  cosmo: { label: "Cosmo", color: "var(--holo)" },
  astronaut: { label: "Astronaut", color: "var(--amber)" },
  crewmate: { label: "Crewmate", color: "var(--violet)" },
};

interface Props {
  engine: string;
  /** Why the language model is not answering, if it is not. */
  aiNote: string | null;
  busy: boolean;
  demo: string | null;
  expect: Turn["expect"];
  transcript: TranscriptLine[];
  alert: boolean;
  onDemo: (id: DemoId) => void;
  onCancelDemo: () => void;
  /** Tap fallback for yes/no answers. */
  onAnswer: (text: string) => void;
  /** What Cosmo has learned about the astronaut, in plain sentences. */
  remembers: string[];
  onForget: () => void;
}

/** The conversation text box: what Cosmo is doing, live captions, answer hints and the transcript. */
export default function VoicePanel({ engine, aiNote, busy, demo, expect, transcript, alert, onDemo, onCancelDemo, onAnswer, remembers, onForget }: Props) {
  const v = useVoice();
  const [log, setLog] = useState(false);
  const [menu, setMenu] = useState(false);

  const status = demo ? `Demo: ${demo}`
    : v.speaking ? `${WHO[v.speaking].label} speaking`
    : v.thinking ? "Thinking…"
    : v.listening || v.wake === "awake" ? "Listening, go ahead"
    : v.wake === "sleeping" ? "Waiting for “Hey Cosmo”"
    : v.wake === "starting" ? "Starting the microphone…"
    : v.supported.stt ? "Voice is off. Tap the orb or turn on Hey Cosmo" : "Voice input needs Chrome. The presenter panel (Shift+P) has a typed backup";
  const cap = v.caption;
  const asking = !demo && !v.speaking && (expect === "yesno" || expect === "number" || expect === "reading");

  return (
    <div className="dev-panel relative flex min-h-[84px] flex-col justify-center gap-1 p-3 pr-3" style={{ borderColor: alert ? "var(--crit)" : undefined }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: v.wake === "off" ? "var(--ink)" : v.listening || v.wake === "awake" ? "var(--ok)" : "var(--holo)", opacity: v.wake === "off" ? 0.3 : 1 }} />
        <p className="min-w-0 flex-1 basis-[60%] truncate text-[11px] tracking-wide text-ink/60 sm:basis-0">{status}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${aiNote || engine === "on-board scripted" ? "border-alert/50 text-alert" : "border-ok/50 text-ok"}`}
            title={aiNote ?? (engine === "on-board scripted" ? "No language model configured" : `Language model: ${engine}`)}>
            {aiNote || engine === "on-board scripted" ? "AI offline" : "AI on"}
          </span>
          <button type="button" onClick={() => (v.wake === "off" ? enableWake() : disableWake())} disabled={!v.supported.stt}
            className={`rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40 ${v.wake === "off" ? "border-holo/30 text-ink/60" : "border-ok/50 text-ok"}`}
            aria-pressed={v.wake !== "off"} title="Listen for the wake phrase">
            Hey Cosmo {v.wake === "off" ? "off" : "on"}
          </button>
          {demo ? (
            <button type="button" onClick={onCancelDemo} className="rounded-full border border-amber/60 px-2.5 py-1 text-[11px] text-amber">Stop demo</button>
          ) : (
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} disabled={busy} className="rounded-full border border-violet/60 px-2.5 py-1 text-[11px] hover:bg-violet/20 disabled:opacity-50" aria-expanded={menu}>
                ▶ Demo
              </button>
              {menu && (
                <div className="absolute bottom-9 right-0 z-50 w-72 rounded-xl border border-violet/40 bg-deep/95 p-1.5 shadow-2xl">
                  {(Object.keys(DEMOS) as DemoId[]).map((id) => (
                    <button key={id} type="button" onClick={() => { setMenu(false); onDemo(id); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                      {DEMOS[id].title}<span className="block text-[11px] text-ink/55">{DEMOS[id].blurb}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => setLog((l) => !l)} className="rounded-full border border-holo/30 px-2.5 py-1 text-[11px]" aria-expanded={log}>Log</button>
        </div>
      </div>

      <p className="line-clamp-2 text-[15px] leading-snug" aria-live="polite">
        {cap?.text ? (
          <><b style={{ color: WHO[cap.who].color }}>{WHO[cap.who].label} </b><span className={cap.interim ? "italic text-ink/70" : ""}>{cap.text}</span></>
        ) : <span className="text-ink/50">Try &ldquo;Hey Cosmo, I&rsquo;ve got a headache&rdquo;, &ldquo;Hey Cosmo, I feel lonely&rdquo; or &ldquo;Hey Cosmo, tell me a joke&rdquo;.</span>}
      </p>

      {asking && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink/60">{expect === "yesno" ? "Answer yes or no, or tell me more" : expect === "reading" ? "Read me the number on the meter" : "Say a number from 1 to 10"}</span>
          {expect === "yesno" && (
            <>
              <button type="button" onClick={() => onAnswer("yes")} className="rounded-full bg-ok/90 px-4 py-1 text-xs font-semibold text-void">Yes</button>
              <button type="button" onClick={() => onAnswer("no")} className="rounded-full bg-crit/90 px-4 py-1 text-xs font-semibold text-white">No</button>
            </>
          )}
        </div>
      )}
      {v.error && <p className="text-[11px] text-alert">{v.error}</p>}
      {v.overheard && v.wake === "sleeping" && !demo && (
        <p className="truncate text-[11px] text-ink/45" title="Development only: what Chrome heard while Cosmo was asleep">Mic heard (no wake phrase): &ldquo;{v.overheard}&rdquo;</p>
      )}

      {log && (
        <div className="dev-panel dev-scroll absolute bottom-[calc(100%+8px)] right-0 z-40 max-h-80 w-[min(480px,92vw)] overflow-y-auto p-4 brief-in">
          <div className="flex items-center justify-between"><p className="dev-title">Conversation</p><span className="text-[10.5px] text-ink/50">Brain: {engine}</span></div>
          {aiNote && <p className="mt-1 rounded-lg border border-alert/40 bg-alert/10 px-2 py-1 text-[11px] text-alert">AI model offline, Cosmo is answering from its on-board brain. Reason: {aiNote}</p>}
          <ol className="mt-2 space-y-2 text-sm">
            {transcript.length === 0 && <li className="text-ink/55">Nothing said yet.</li>}
            {transcript.map((l, i) => (
              <li key={i}><b style={{ color: WHO[l.who].color }}>{WHO[l.who].label}: </b>{l.text}</li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-between border-t border-holo/15 pt-3">
            <p className="dev-title">What Cosmo remembers about you</p>
            {remembers.length > 0 && <button type="button" onClick={onForget} className="text-[11px] text-alert hover:underline">Forget everything</button>}
          </div>
          <ul className="mt-2 space-y-1 text-[13px] text-ink/80">
            {remembers.length === 0 && <li className="text-ink/55">Nothing yet. It learns from what you tell it. Kept on this device only.</li>}
            {remembers.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
