"use client";

/**
 * Voice layer (browser): speech out with speechSynthesis, speech in with the
 * Chrome SpeechRecognition API. A tiny store lets any component react to who is
 * speaking, whether Cosmo is listening, and the live caption.
 */

import { useSyncExternalStore } from "react";

export type Speaker = "cosmo" | "astronaut" | "crewmate";

export interface VoiceState {
  speaking: Speaker | null;
  listening: boolean;
  /** Live words while listening, or the line being spoken. */
  caption: { who: Speaker; text: string; interim?: boolean } | null;
  /** Rough loudness 0..1 while speaking, for the orb. */
  level: number;
  supported: { tts: boolean; stt: boolean };
  error: string | null;
}

let state: VoiceState = {
  speaking: null, listening: false, caption: null, level: 0,
  supported: { tts: false, stt: false }, error: null,
};
const subs = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const SERVER: VoiceState = state;
export const useVoice = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

/* ---------------- speech out ---------------- */
const PROFILE: Record<Speaker, { pitch: number; rate: number; prefer: RegExp[] }> = {
  cosmo: { pitch: 1.12, rate: 1.04, prefer: [/Google US English/i, /Aria|Jenny|Ava|Samantha/i, /en-US/i] },
  astronaut: { pitch: 0.9, rate: 1.0, prefer: [/Google UK English Male/i, /Guy|Daniel|Ryan|Christopher|Alex/i, /en-GB/i, /en/i] },
  crewmate: { pitch: 1.0, rate: 1.02, prefer: [/Google UK English Female/i, /Sonia|Libby|Karen|Moira|Tessa/i, /en-AU|en-GB/i, /en/i] },
};
let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  voices = window.speechSynthesis.getVoices();
}
function pick(who: Speaker) {
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const used = new Set<string>();
  // keep the three speakers on different voices where possible
  const order: Speaker[] = ["cosmo", "astronaut", "crewmate"];
  const chosen: Partial<Record<Speaker, SpeechSynthesisVoice>> = {};
  for (const s of order) {
    for (const re of PROFILE[s].prefer) {
      const v = en.find((x) => re.test(`${x.name} ${x.lang}`) && !used.has(x.name));
      if (v) { chosen[s] = v; used.add(v.name); break; }
    }
  }
  return chosen[who] ?? en[0];
}

export function initVoice() {
  if (typeof window === "undefined") return;
  const tts = "speechSynthesis" in window;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const stt = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  set({ supported: { tts, stt } });
  if (tts) {
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
  }
}

let levelTimer: number | undefined;
/** Speak a line as one of the speakers. Resolves when finished (or skipped). */
export function speak(text: string, who: Speaker = "cosmo"): Promise<void> {
  return new Promise((resolve) => {
    set({ caption: { who, text } });
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setTimeout(resolve, Math.min(6000, 600 + text.length * 45));
      return;
    }
    if (!voices.length) loadVoices();
    const u = new SpeechSynthesisUtterance(text);
    const v = pick(who);
    if (v) u.voice = v;
    u.pitch = PROFILE[who].pitch;
    u.rate = PROFILE[who].rate;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(levelTimer);
      set({ speaking: null, level: 0 });
      resolve();
    };
    u.onstart = () => {
      set({ speaking: who });
      window.clearInterval(levelTimer);
      levelTimer = window.setInterval(() => set({ level: 0.35 + Math.random() * 0.65 }), 110);
    };
    u.onboundary = () => set({ level: 1 });
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
    // safety net: some voices never fire onend
    setTimeout(finish, 2500 + text.length * 90);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  window.clearInterval(levelTimer);
  set({ speaking: null, level: 0 });
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------------- speech in ---------------- */
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
let rec: Rec | null = null;

/** Listen for one utterance. Resolves with the final words, or "" if nothing was heard. */
export function listen(): Promise<string> {
  return new Promise((resolve) => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { set({ error: "Voice input needs Chrome. Use the presenter controls instead." }); resolve(""); return; }
    stopSpeaking();
    rec?.abort();
    const r = new Ctor();
    rec = r;
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      set({ caption: { who: "astronaut", text: (final + interim).trim(), interim: !final } });
    };
    r.onerror = (e) => {
      const msg = e.error === "not-allowed" ? "Microphone blocked. Allow it in Chrome's address bar." : e.error === "no-speech" ? null : `Voice input error: ${e.error}`;
      set({ error: msg });
    };
    r.onend = () => { set({ listening: false }); rec = null; resolve(final.trim()); };
    set({ listening: true, error: null, caption: { who: "astronaut", text: "", interim: true } });
    try { r.start(); } catch { set({ listening: false }); resolve(""); }
  });
}

export function stopListening() { rec?.stop(); }
