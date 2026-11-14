"use client";

/**
 * Voice layer (browser).
 *
 * - Speech out: speechSynthesis, one voice per speaker.
 * - Speech in: Chrome's SpeechRecognition, running continuously while
 *   "Hey Cosmo" is on. Cosmo sleeps until it hears the wake phrase, listens
 *   for the command, answers, and then keeps listening for a few seconds so
 *   the astronaut can reply without saying "Hey Cosmo" again (like a phone
 *   assistant's follow-up mode).
 * - Mic level: a WebAudio analyser on the same microphone, so the orb can
 *   move with the astronaut's voice.
 *
 * Recognition pauses while anything is being spoken, so Cosmo never hears
 * itself (or the demo voices) and wakes up by mistake.
 */

import { useSyncExternalStore } from "react";
import { parseWake } from "./wake";

export type Speaker = "cosmo" | "astronaut" | "crewmate";
/** off: wake word disabled. sleeping: waiting for "Hey Cosmo". awake: listening for words. */
export type WakeState = "off" | "starting" | "sleeping" | "awake";

export interface VoiceState {
  speaking: Speaker | null;
  /** True while the mic is taking a command or an answer. */
  listening: boolean;
  /** Cosmo is working out what to say. */
  thinking: boolean;
  wake: WakeState;
  /** Live words while listening, or the line being spoken. */
  caption: { who: Speaker; text: string; interim?: boolean } | null;
  /** Rough loudness 0..1 while speaking (also readable every frame with getLevels). */
  level: number;
  supported: { tts: boolean; stt: boolean };
  error: string | null;
  /** Development only: what the recognizer heard while Cosmo was asleep. */
  overheard: string | null;
}

let state: VoiceState = {
  speaking: null, listening: false, thinking: false, wake: "off", caption: null, level: 0,
  supported: { tts: false, stt: false }, error: null, overheard: null,
};
const subs = new Set<() => void>();
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const SERVER: VoiceState = state;
export const useVoice = () => useSyncExternalStore(subscribe, () => state, () => SERVER);
export const getVoiceState = () => state;
export const setThinking = (thinking: boolean) => { if (state.thinking !== thinking) set({ thinking }); };

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
  const stt = !!Rec();
  set({ supported: { tts, stt } });
  if (tts) {
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
  }
  if (debugOn()) {
    // test hook: feed words as if the recognizer heard them (the real mic path is identical after this point)
    (window as unknown as { __cosmoVoice: unknown }).__cosmoVoice = {
      hear: (text: string) => { onSegment(text, false); onSegment(text, true); },
      say: simulateSpeech,
      state: () => state,
    };
  }
}

let speakLevel = 0;
let levelTimer: number | undefined;
let speakingCount = 0;
/** Cosmo's recent lines, so the recognizer can tell Cosmo's own voice from the astronaut's. */
const spoken: string[] = [];
let lastSpokeEnd = 0;

/** Speak a line as one of the speakers. Resolves when finished (or skipped). */
export function speak(text: string, who: Speaker = "cosmo"): Promise<void> {
  return new Promise((resolve) => {
    set({ caption: { who, text }, thinking: false, listening: false });
    speakingCount++;
    if (who === "cosmo") { spoken.push(text.toLowerCase()); if (spoken.length > 4) spoken.shift(); }
    const end = () => {
      speakingCount = Math.max(0, speakingCount - 1);
      if (!speakingCount) lastSpokeEnd = performance.now();
      resolve();
    };
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setTimeout(end, Math.min(6000, 600 + text.length * 45));
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
      speakLevel = 0;
      set({ speaking: null, level: 0 });
      end();
    };
    u.onstart = () => {
      set({ speaking: who });
      window.clearInterval(levelTimer);
      levelTimer = window.setInterval(() => { speakLevel = 0.35 + Math.random() * 0.65; set({ level: speakLevel }); }, 110);
    };
    u.onboundary = () => { speakLevel = 1; };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
    // safety net: some voices never fire onend
    setTimeout(finish, 2500 + text.length * 90);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (typeof window !== "undefined") window.clearInterval(levelTimer);
  speakLevel = 0;
  set({ speaking: null, level: 0 });
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Test helper (development): the astronaut "says" a line through the same path as the
 * microphone. Words arrive one by one at speaking pace, and a pause longer than
 * 0.7 s ends Chrome's piece the way the real recognizer does. `pauses` maps a word
 * index to a pause in ms after that word. With `voice`, the line is also spoken aloud.
 */
async function simulateSpeech(text: string, opts: { pauses?: Record<number, number>; voice?: boolean; wpm?: number } = {}) {
  if (opts.voice && "speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    const v = pick("astronaut");
    if (v) u.voice = v;
    u.pitch = PROFILE.astronaut.pitch;
    window.speechSynthesis.speak(u);
  }
  const list = text.split(/\s+/).filter(Boolean);
  const per = 60000 / (opts.wpm ?? 165);
  let seg = "";
  for (let i = 0; i < list.length; i++) {
    seg = `${seg} ${list[i]}`.trim();
    onSegment(seg, false);
    await wait(per);
    const pause = opts.pauses?.[i];
    if (pause) {
      await wait(Math.min(pause, 700));
      if (pause >= 700) { onSegment(seg, true); seg = ""; }
      await wait(Math.max(0, pause - 700));
    }
  }
  if (seg) { await wait(700); onSegment(seg, true); }
}

/* ---------------- microphone level (for the orb) ---------------- */
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freq: Uint8Array<ArrayBuffer> | null = null;
let wave: Uint8Array<ArrayBuffer> | null = null;
const bands = new Float32Array(16);

async function openMic() {
  if (micStream || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    src.connect(analyser);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
  } catch {
    micStream = null; // the orb falls back to recognizer activity
  }
}
function closeMic() {
  micStream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close().catch(() => {});
  micStream = null; audioCtx = null; analyser = null; freq = null; wave = null;
}

/** Read every animation frame: mic loudness 0..1, 16 voice bands 0..1, and Cosmo's speaking level. */
export function getLevels(): { mic: number; bands: Float32Array; speak: number } {
  let mic = 0;
  if (analyser && freq && wave) {
    if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
    analyser.getByteTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) { const x = (wave[i] - 128) / 128; sum += x * x; }
    mic = Math.min(1, Math.sqrt(sum / wave.length) * 4.2);
    analyser.getByteFrequencyData(freq);
    // voice lives roughly in bins 2..64 at 48 kHz / 512
    for (let b = 0; b < 16; b++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += freq[2 + b * 4 + k];
      bands[b] = Math.min(1, s / (4 * 200));
    }
  } else {
    bands.fill(0);
  }
  return { mic, bands, speak: speakLevel };
}

/* ---------------- speech in ---------------- */
type RecResult = ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean };
type RecLike = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
};
type RecCtor = new () => RecLike;
const Rec = (): RecCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

let wakeOn = false;
let rec: RecLike | null = null;
let segStart = 0;
let awakeTimer: number | undefined;
let restartTimer: number | undefined;
let backoff = 250;
let onCommand: ((text: string) => void) | null = null;
let capture: ((text: string) => void) | null = null;
/** Seconds of quiet before Cosmo goes back to sleep. */
let awakeMs = 8000;
/** Chrome lets only one tab listen at a time: another Cosmo tab has the mic. */
let yielded = false;
let lastStart = 0;
let storms = 0;
const BUSY_MSG = "Speech recognition is busy in another tab. Close other Cosmo tabs, then tap the orb.";
const OTHER_TAB_MSG = "Listening in another Cosmo tab. Tap the orb to listen here.";

export function setCommandHandler(fn: ((text: string) => void) | null) { onCommand = fn; }

/** Voice debug log: always on in development, or with localStorage cosmo.debug = "1". */
const debugOn = () => {
  if (process.env.NODE_ENV !== "production") return true;
  try { return localStorage.getItem("cosmo.debug") === "1"; } catch { return false; }
};
const log = (...a: unknown[]) => { if (typeof window !== "undefined" && debugOn()) console.log("[cosmo-voice]", ...a); };

/* small chimes so the astronaut hears Cosmo wake and sleep */
let chimeCtx: AudioContext | null = null;
function chime(kind: "wake" | "sleep") {
  try {
    chimeCtx ??= new AudioContext();
    const a = chimeCtx;
    const notes = kind === "wake" ? [660, 990] : [740, 494];
    notes.forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * 0.09;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + 0.25);
    });
  } catch { /* no audio, no chime */ }
}

function armSleep(ms = awakeMs) {
  if (typeof window === "undefined") return;
  window.clearTimeout(awakeTimer);
  awakeTimer = window.setTimeout(() => goToSleep(), ms);
}

/** Open the conversation: listen for words without the wake phrase. */
export function wakeUp(opts: { chime?: boolean; ms?: number } = {}) {
  if (!wakeOn) return;
  if (yielded) claimMic();
  storms = 0;
  backoff = 250;
  awakeMs = opts.ms ?? 8000;
  log("awake for", awakeMs, "ms");
  if (opts.chime !== false && state.wake !== "awake") chime("wake");
  set({ wake: "awake", listening: !speakingCount, error: null, caption: speakingCount ? state.caption : { who: "astronaut", text: "", interim: true } });
  armSleep();
  startRecognition();
}

/** Close the conversation: only "Hey Cosmo" wakes it again. */
export function goToSleep(opts: { chime?: boolean } = {}) {
  if (typeof window !== "undefined") window.clearTimeout(awakeTimer);
  if (capture) { const c = capture; capture = null; c(""); }
  if (!wakeOn) { set({ listening: false }); return; }
  if (state.wake === "awake" && opts.chime) chime("sleep");
  if (state.wake === "awake") log("back to sleep, waiting for Hey Cosmo");
  set({ wake: "sleeping", listening: false });
}

/** After Cosmo answers, keep listening for a reply for a while. */
export function followUp(ms = 8000) {
  if (!wakeOn) return;
  wakeUp({ chime: false, ms });
}

function dispatch(text: string) {
  log("command:", JSON.stringify(text), capture ? "(answer for an activity)" : "");
  lastDispatchAt = performance.now();
  if (typeof window !== "undefined") window.clearTimeout(awakeTimer);
  set({ listening: false, caption: { who: "astronaut", text } });
  if (capture) { const c = capture; capture = null; c(text); return; }
  setThinking(true);
  onCommand?.(text);
}

/* ---- one listening tab at a time ---- */
const tabId = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;
function initTabLock() {
  if (channel || typeof window === "undefined") return;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("cosmo-voice");
    channel.onmessage = (e) => {
      if (e.data?.type !== "claim" || e.data.id === tabId || !wakeOn) return;
      log("another Cosmo tab took the mic");
      yielded = true;
      pauseRecognition();
      set({ wake: "sleeping", listening: false, error: OTHER_TAB_MSG });
    };
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { log("tab hidden, mic paused"); pauseRecognition(); }
    else claimMic();
  });
  window.addEventListener("focus", () => claimMic());
}
/** This tab listens; any other Cosmo tab steps back. */
function claimMic() {
  if (!wakeOn) return;
  yielded = false;
  channel?.postMessage({ type: "claim", id: tabId });
  if (state.error === OTHER_TAB_MSG || state.error === BUSY_MSG) set({ error: null });
  if (!rec) resumeRecognitionSoon();
}

/* ---- turn-taking: one "turn" is everything the astronaut says before a real pause ---- */
let turnDone = ""; // finished pieces of this turn
let segWords = ""; // the piece being spoken now
let endTimer: number | undefined;
let muted = false;
let expecting: "yesno" | "number" | "reading" | "open" | undefined;
let patience = 0;
let interruptSeq = 0;
let lastDispatchAt = 0;
let onBargeIn: ((info: { msSinceAnswerStarted: number }) => void) | null = null;

function resetTurn() {
  turnDone = "";
  segWords = "";
  if (typeof window !== "undefined") window.clearTimeout(endTimer);
}
const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];

/** Is this Cosmo's own voice coming back through the mic? */
function isEcho(heard: string) {
  const hw = words(heard);
  if (!hw.length) return true;
  const pool = new Set(words(spoken.join(" ")));
  return hw.filter((w) => pool.has(w)).length / hw.length >= 0.6;
}

/** The astronaut talks over Cosmo: stop talking and listen. */
function bargeIn() {
  log("astronaut talked over Cosmo: stopping to listen");
  interruptSeq++;
  const since = performance.now() - lastDispatchAt;
  stopSpeaking();
  onBargeIn?.({ msSinceAnswerStarted: since });
  if (wakeOn) wakeUp({ chime: false, ms: 10000 });
}

/** How long a pause means "I'm done talking". Longer when the sentence sounds unfinished. */
function endDelay(text: string, final: boolean) {
  const t = text.trim().toLowerCase();
  const unfinished = /(,|\b(and|but|so|because|cause|or|then|i|i'm|i was|was|were|is|the|a|an|to|of|with|my|um|uh|er|like|just|that|if|when|which|about|for|from|actually|well))\s*$/.test(t);
  const bareYesNo = /^(yes|yeah|yep|no|nope|nah|not really|not yet|okay|ok)[.!]?$/.test(t);
  return (final ? 900 : 1700) + patience + (unfinished ? 1600 : 0) + (bareYesNo && expecting !== "yesno" ? 0 : bareYesNo ? 600 : 0);
}

function endTurn() {
  const full = `${turnDone} ${segWords}`.trim();
  resetTurn();
  const w = parseWake(full);
  const said = (w.woke ? w.command : full).trim();
  if (said) dispatch(said);
}

/** One update from the recognizer (or the simulator): part of the current piece, or the finished piece. */
function onSegment(text: string, final: boolean) {
  if (muted) return;
  const piece = text.trim();
  // Cosmo is (or was just) talking: its own voice is ignored, the astronaut's voice interrupts it
  const echoWindow = speakingCount > 0 || performance.now() - lastSpokeEnd < 1200;
  if (echoWindow && piece && isEcho(piece)) { log("ignored Cosmo's own voice:", JSON.stringify(piece)); return; }
  if (speakingCount > 0) {
    if (state.speaking !== "cosmo") return; // demo voices
    if (!piece || (words(piece).length < 2 && !/^(stop|wait|cosmo|hold on|hang on|sorry|no|excuse me)\b/.test(piece.toLowerCase()))) return;
    bargeIn();
  }
  const full = `${turnDone} ${piece}`.trim();
  if (state.wake !== "awake" && !capture) {
    if (!parseWake(full).woke) { if (final) turnDone = ""; return; }
    if (state.overheard) set({ overheard: null });
    wakeUp();
  }
  const w = parseWake(full);
  set({ listening: true, caption: { who: "astronaut", text: (w.woke ? w.command : full).trim(), interim: !final } });
  armSleep(Math.max(awakeMs, 6000));
  if (final) { turnDone = full; segWords = ""; } else segWords = piece;
  if (typeof window !== "undefined") {
    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(endTurn, endDelay(full, final));
  }
}

/** The conversation tells the voice layer what kind of answer it expects (a bare "no" may be followed by an explanation). */
export function setExpecting(e: typeof expecting) { expecting = e; }
/** Extra wait before answering, learned from this astronaut (memory.patience). */
export function setPatience(ms: number) { patience = Math.max(0, Math.min(2000, ms)); }
/** Ignore the microphone (demo conversations play their own voices). */
export function setMuted(m: boolean) { muted = m; if (m) resetTurn(); }
export function setBargeInHandler(fn: typeof onBargeIn) { onBargeIn = fn; }
/** Changes every time the astronaut interrupts Cosmo; the conversation stops its current answer. */
export const getInterruptSeq = () => interruptSeq;

function startRecognition() {
  const Ctor = Rec();
  if (!Ctor || !wakeOn || rec || yielded) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  lastStart = performance.now();
  const r = new Ctor();
  rec = r;
  segStart = 0;
  r.lang = "en-US";
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 3;
  r.onstart = () => log("recognizer started");
  r.onaudiostart = () => log("audio capture started");
  r.onspeechstart = () => log("speech detected");
  r.onresult = (e) => {
    backoff = 250;
    storms = 0;
    if (state.error === BUSY_MSG) set({ error: null });
    const res = e.results;
    let text = "";
    for (let i = segStart; i < res.length; i++) text += res[i][0].transcript;
    // asleep: if Chrome's best guess misses the name, try its other guesses
    if (state.wake !== "awake" && !capture && !parseWake(text).woke) {
      for (let k = 1; k < 3; k++) {
        let alt = "";
        for (let i = segStart; i < res.length; i++) alt += (res[i][k] ?? res[i][0]).transcript;
        if (parseWake(alt).woke) { log("wake phrase found in guess", k + 1, JSON.stringify(alt)); text = alt; break; }
      }
      if (text.trim() && debugOn()) set({ overheard: text.trim() });
    }
    const final = res.length > 0 && res[res.length - 1].isFinal;
    log(final ? "heard (final):" : "heard:", JSON.stringify(text), "| state:", state.wake, speakingCount ? "(Cosmo speaking)" : "");
    if (final) segStart = res.length;
    // Chrome sometimes finalizes with an empty transcript: keep the words it already showed
    const said = final ? (text.trim() || segWords) : text;
    if (said.trim() || final) onSegment(said, final);
  };
  r.onerror = (e) => {
    log("recognizer error:", e.error);
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      set({ error: "Microphone blocked. Allow it in Chrome's address bar, then tap the orb." });
      disableWake(false);
    } else if (e.error === "aborted" && performance.now() - lastStart < 1500) {
      // cancelled right after starting: someone else holds the speech service
      storms++;
      backoff = Math.min(6000, 250 * 2 ** storms);
      if (storms >= 3) set({ error: BUSY_MSG });
    } else if (e.error === "network") {
      backoff = Math.min(8000, backoff * 2);
      set({ error: "Speech service unreachable. Retrying…" });
    } else if (e.error === "audio-capture") {
      set({ error: "No microphone found." });
    }
  };
  r.onend = () => {
    log("recognizer ended; restarting:", wakeOn);
    rec = null;
    if (wakeOn) {
      window.clearTimeout(restartTimer);
      restartTimer = window.setTimeout(startRecognition, backoff);
    }
  };
  try {
    r.start();
    if (state.wake === "starting") set({ wake: "sleeping" });
    if (state.error?.startsWith("Speech service")) set({ error: null });
  } catch (err) {
    log("recognizer failed to start:", err);
    rec = null;
  }
}

function pauseRecognition() {
  if (typeof window !== "undefined") window.clearTimeout(restartTimer);
  const r = rec;
  rec = null;
  resetTurn();
  if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.abort(); } catch { /* already stopped */ } }
}
function resumeRecognitionSoon() {
  if (!wakeOn || typeof window === "undefined") return;
  window.clearTimeout(restartTimer);
  restartTimer = window.setTimeout(startRecognition, 300);
}

/** Turn on "Hey Cosmo". Asks for the microphone the first time. */
export async function enableWake(): Promise<boolean> {
  if (!Rec()) { set({ error: "Voice input needs Chrome. Use the presenter controls instead." }); return false; }
  if (wakeOn) return true;
  wakeOn = true;
  set({ wake: "starting", error: null });
  try { localStorage.setItem("cosmo.wake", "on"); } catch { /* private mode */ }
  await openMic();
  if (!wakeOn) return false;
  initTabLock();
  set({ wake: "sleeping" });
  claimMic();
  startRecognition();
  return true;
}

/** Turn "Hey Cosmo" off. `remember` is false when the browser refused the mic (try again next visit). */
export function disableWake(remember = true) {
  wakeOn = false;
  capture?.("");
  capture = null;
  pauseRecognition();
  closeMic();
  if (typeof window !== "undefined") window.clearTimeout(awakeTimer);
  if (remember) try { localStorage.setItem("cosmo.wake", "off"); } catch { /* private mode */ }
  set({ wake: "off", listening: false });
}

export const wakePreference = () => {
  try { return localStorage.getItem("cosmo.wake") !== "off"; } catch { return true; }
};

/**
 * Listen for one answer (used by the Mind activities). With "Hey Cosmo" on,
 * it reuses the running recognizer; otherwise it runs a single-shot one.
 */
export function listen(ms = 9000): Promise<string> {
  if (wakeOn) {
    return new Promise((resolve) => {
      capture?.("");
      capture = resolve;
      wakeUp({ chime: false, ms });
    });
  }
  return new Promise((resolve) => {
    const Ctor = Rec();
    if (!Ctor) { set({ error: "Voice input needs Chrome. Use the presenter controls instead." }); resolve(""); return; }
    stopSpeaking();
    const r = new Ctor();
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
    r.onend = () => { set({ listening: false }); resolve(stripLead(final)); };
    set({ listening: true, error: null, caption: { who: "astronaut", text: "", interim: true } });
    try { r.start(); } catch { set({ listening: false }); resolve(""); }
  });
}
const stripLead = (s: string) => { const w = parseWake(s); return (w.woke ? w.command : s).trim(); };

export function stopListening() {
  if (wakeOn) goToSleep();
  else set({ listening: false });
}
