/**
 * What Cosmo learns about this astronaut, kept on the device (browser storage).
 *
 * Learning comes from three places:
 * 1. Words: names, family, likes and dislikes picked out of what the astronaut says.
 * 2. Outcomes: which suggestions they accept or turn down, what keeps coming up when
 *    they feel low, whether they laugh at the jokes.
 * 3. How they talk: if Cosmo ever answers while they were still speaking, it waits
 *    longer before replying next time.
 * The language model (when configured) can add short facts too. Nothing here ever
 * changes a medical protocol. Only the check-in itself goes to the mission log,
 * never what was said.
 */

import type { MoodId, PlanId, TopicId } from "@/data/mind";

export interface AstroMemory {
  name?: string;
  /** Short third-person facts, newest first. */
  facts: string[];
  /** relation -> name, e.g. daughter -> Lina */
  people: Record<string, string>;
  helps: Partial<Record<PlanId, number>>;
  declined: Partial<Record<PlanId, number>>;
  topics: Partial<Record<TopicId, number>>;
  moods: { at: string; mood: MoodId }[];
  jokes: { laughs: number; groans: number };
  /** Extra milliseconds Cosmo waits before answering, learned from being cut off. */
  patience: number;
  episodes: { at: string; text: string }[];
  turns: number;
}

export type Learn =
  | { kind: "name"; name: string }
  | { kind: "fact"; text: string }
  | { kind: "person"; relation: string; name: string }
  | { kind: "helped"; plan: PlanId }
  | { kind: "declined"; plan: PlanId }
  | { kind: "topic"; topic: TopicId }
  | { kind: "mood"; mood: MoodId }
  | { kind: "joke"; laughed: boolean }
  | { kind: "episode"; text: string }
  | { kind: "patience"; ms: number }
  | { kind: "forget" };

export const emptyMemory = (): AstroMemory => ({
  facts: [], people: {}, helps: {}, declined: {}, topics: {}, moods: [], jokes: { laughs: 0, groans: 0 }, patience: 0, episodes: [], turns: 0,
});

const today = () => new Date().toISOString().slice(0, 10);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NOT_NAMES = /^(fine|okay|ok|good|great|tired|sad|here|alone|sorry|not|so|just|feeling|really|very|a|the|done|ready|back|sure|lonely|stressed|bored|worried|anxious|cosmo)$/i;
const RELATIONS = "wife|husband|partner|daughter|son|mother|mom|mum|father|dad|brother|sister|girlfriend|boyfriend|fiancee?|best friend|friend|dog|cat|grandmother|grandma|grandfather|grandpa|baby|kids?|children";

/** Pick facts out of one thing the astronaut said. */
export function learnFromWords(raw: string): Learn[] {
  const out: Learn[] = [];
  const t = raw.replace(/[’`]/g, "'").trim();
  const name = /\b(?:my name is|call me|i'?m called|you can call me)\s+([A-Za-z][A-Za-z'-]{1,20})/i.exec(t);
  if (name && !NOT_NAMES.test(name[1])) out.push({ kind: "name", name: cap(name[1]) });
  const person = new RegExp(`\\bmy (${RELATIONS})(?:'s name is| is called| called| named|,)?\\s+([A-Z][a-z'-]{1,20})\\b`).exec(t)
    ?? new RegExp(`\\b([A-Z][a-z'-]{1,20}),? my (${RELATIONS})\\b`).exec(t);
  if (person) {
    const [rel, nm] = /^[A-Z]/.test(person[1]) ? [person[2], person[1]] : [person[1], person[2]];
    if (!NOT_NAMES.test(nm)) out.push({ kind: "person", relation: rel.toLowerCase(), name: nm });
  }
  const event = /\b(birthday|anniversary|wedding|graduation|exam|surgery)\b/i.exec(t)?.[1]?.toLowerCase();
  const who = out.find((l): l is Extract<Learn, { kind: "person" }> => l.kind === "person");
  const fam = new RegExp(`\\bmy (${RELATIONS})'?s? (birthday|anniversary|wedding|graduation|exam|surgery)\\b`, "i").exec(t);
  if (event && who) out.push({ kind: "fact", text: `${who.name} (${who.relation})'s ${event} was around ${today()}` });
  else if (fam) out.push({ kind: "fact", text: `Their ${fam[1].toLowerCase()}'s ${fam[2].toLowerCase()} was around ${today()}` });
  const like = /\bi (?:really |do )?(?:like|love|enjoy)\s+([a-z][^.,!?]{2,40})/i.exec(t);
  if (like && !/\byou\b|\bit\b|\bthat\b/i.test(like[1])) out.push({ kind: "fact", text: `Enjoys ${like[1].trim()}` });
  const dislike = /\bi (?:really )?(?:hate|don'?t like|can'?t stand)\s+([a-z][^.,!?]{2,40})/i.exec(t);
  if (dislike && !/\byou\b|\bit\b|\bthat\b/i.test(dislike[1])) out.push({ kind: "fact", text: `Dislikes ${dislike[1].trim()}` });
  return out;
}

export function applyLearn(m: AstroMemory, list: Learn[]): AstroMemory {
  if (!list.length) return m;
  let n: AstroMemory = { ...m, facts: [...m.facts], people: { ...m.people }, helps: { ...m.helps }, declined: { ...m.declined }, topics: { ...m.topics }, moods: [...m.moods], jokes: { ...m.jokes }, episodes: [...m.episodes] };
  for (const l of list) {
    switch (l.kind) {
      case "forget": n = emptyMemory(); break;
      case "name": n.name = l.name; break;
      case "person": n.people[l.relation] = l.name; break;
      case "fact": if (!n.facts.some((f) => f.toLowerCase() === l.text.toLowerCase())) n.facts = [l.text, ...n.facts].slice(0, 40); break;
      case "helped": n.helps[l.plan] = (n.helps[l.plan] ?? 0) + 1; break;
      case "declined": n.declined[l.plan] = (n.declined[l.plan] ?? 0) + 1; break;
      case "topic": n.topics[l.topic] = (n.topics[l.topic] ?? 0) + 1; break;
      case "mood": n.moods = [{ at: today(), mood: l.mood }, ...n.moods].slice(0, 30); break;
      case "joke": if (l.laughed) n.jokes.laughs++; else n.jokes.groans++; break;
      case "episode": n.episodes = [{ at: today(), text: l.text }, ...n.episodes].slice(0, 20); break;
      case "patience": n.patience = Math.max(0, Math.min(2000, n.patience + l.ms)); break;
    }
  }
  return n;
}

/** The plan that has worked best for this astronaut so far, if any. */
export function bestHelper(m: AstroMemory | undefined): PlanId | null {
  if (!m) return null;
  const scored = Object.entries(m.helps).map(([p, n]) => [p, 2 * (n ?? 0) - (m.declined[p as PlanId] ?? 0)] as const).filter(([, s]) => s > 0);
  scored.sort((a, b) => b[1] - a[1]);
  return (scored[0]?.[0] as PlanId) ?? null;
}

const PLAN_WORDS: Record<PlanId, string> = {
  "family-call": "a call with your family", "psych-conference": "talking with the support team", "crew-company": "some time with the crew",
  exercise: "exercise", quiet: "some quiet time", earth: "the Earth window", journal: "writing in your journal", breathing: "a breathing break",
  rest: "a proper rest", joke: "a laugh", trivia: "a round of trivia", options: "trying something new",
};
export const planWords = (p: PlanId) => PLAN_WORDS[p];

/** Plain sentences for the language model and for "what do you know about me". */
export function describe(m: AstroMemory | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.name) out.push(`Their name is ${m.name}.`);
  for (const [rel, nm] of Object.entries(m.people)) out.push(`Their ${rel} is ${nm}.`);
  out.push(...m.facts.slice(0, 12).map((f) => `${f}.`.replace(/\.\.$/, ".")));
  const best = bestHelper(m);
  if (best) out.push(`When they feel low, ${planWords(best)} has helped before.`);
  const topTopic = Object.entries(m.topics).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  if (topTopic && (topTopic[1] ?? 0) >= 1 && topTopic[0] !== "unknown" && topTopic[0] !== "other") out.push(`What has weighed on them before: ${topTopic[0]}.`);
  if (m.jokes.laughs + m.jokes.groans >= 2) out.push(m.jokes.laughs >= m.jokes.groans ? "They enjoy Cosmo's jokes." : "They are not big on Cosmo's puns.");
  if (m.episodes[0]) out.push(`Last health episode: ${m.episodes[0].text}`);
  return out;
}

/** The same memory, said to the astronaut ("Your daughter is Lina."). */
export function recall(m: AstroMemory | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.name) out.push(`Your name is ${m.name}.`);
  for (const [rel, nm] of Object.entries(m.people)) out.push(`Your ${rel} is ${nm}.`);
  out.push(...m.facts.slice(0, 3).map((f) => `${f.replace(/^Their /, "Your ").replace(/^Enjoys /, "You enjoy ").replace(/^Dislikes /, "You don't like ")}.`.replace(/\.\.$/, ".")));
  const best = bestHelper(m);
  if (best) out.push(`When you feel low, ${planWords(best)} helps you.`);
  const topics = Object.entries(m.topics).filter(([t, n]) => (n ?? 0) > 0 && t !== "unknown" && t !== "other").map(([t]) => t);
  if (topics.length) out.push(`Lately, ${topics.slice(0, 2).join(" and ")} ${topics.length > 1 ? "have" : "has"} been on your mind.`);
  if (m.jokes.laughs + m.jokes.groans >= 2) out.push(m.jokes.laughs >= m.jokes.groans ? "And you laugh at my jokes, which I appreciate." : "And you're not a fan of my puns. Noted.");
  return out;
}

/* ---------- storage ---------- */
const KEY = "cosmo.memory.v1";
export function loadMemory(): AstroMemory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyMemory(), ...JSON.parse(raw) } : emptyMemory();
  } catch { return emptyMemory(); }
}
export function saveMemory(m: AstroMemory) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode: memory lasts this session only */ }
}
