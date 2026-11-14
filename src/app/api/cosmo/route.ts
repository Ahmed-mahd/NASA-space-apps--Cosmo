/**
 * Cosmo's language-model agent (server side).
 *
 * Any OpenAI-compatible chat endpoint works. Set in Vercel (never in the repo), one of:
 *   GEMINI_API_KEY                      Google Gemini (its OpenAI-compatible endpoint is used)
 *   GROQ_API_KEY                        Groq
 *   COSMO_MODEL_BASE_URL + COSMO_MODEL_API_KEY   anything else, e.g. http://localhost:11434/v1 for Ollama + Qwen
 * and optionally COSMO_MODEL_NAME (a model id, never a key). Without it a fast model is picked from the provider's list.
 *
 * Two modes, both inside the three-layer design (the model never picks a medical action):
 *   chat    AI-first conversation. The model answers anything, with the readings, active conditions and
 *           their approved steps, Cosmo's memory of this astronaut and the recent conversation in front of
 *           it. The on-board brain's reply comes along as a suggestion. Only whitelisted, non-medical
 *           actions are accepted, and a reply that names a drug or dose is discarded.
 *   reword  readings and health advice: the model may only rephrase; every number must survive.
 * Emergencies, crisis support, yes/no question flows and guided procedures never reach the model
 * (lib/agent.ts decides). On any error the on-board reply is used, so Cosmo always answers.
 */

type Line = { who: "cosmo" | "astronaut" | "crewmate"; text: string };
interface Body {
  mode?: "reword" | "chat";
  utterance: string;
  draft: string[];
  intent: string;
  status: "nominal" | "advisory" | "alert";
  vitals?: string;
  history?: Line[];
  memory?: string[];
  conditions?: { title: string; severity: string; steps: string[] }[];
  clock?: string;
}

const TABS = ["body", "trends", "mind", "radiation", "labs", "link"];
const ACTIVITIES = ["joke", "trivia", "breathing", "earth", "journal"];
const REQUESTS = ["family-call", "psych-conference", "crew-company", "quiet", "rest", "exercise"];
const MOODS = ["great", "okay", "tired", "low", "stressed"];
const REGIONS = ["brain", "eyes", "inner-ear", "mind", "heart", "lungs", "immune", "gut-skin", "kidneys", "bones", "muscles", "whole-body"];

const PERSONA = `You are Cosmo, the AI health companion living in an astronaut's wrist device on a long space mission (day 142, far from Earth, messages home are delayed).
You speak out loud. Write plain spoken English: short sentences, contractions, no lists, no markdown, no emoji, no stage directions.
Personality: warm, curious, quick, genuinely funny, like the crewmate everyone wants on shift. Humor is playful when STATUS is nominal, gentle when advisory, absent when alert.
You know this astronaut. MEMORY holds what you have learned about them; use it naturally (their name, the people they love, what helps them, how they like you to talk). Follow any preference in MEMORY.
You can see their live READINGS and active CONDITIONS. Refer to them when relevant.
HEALTH RULES, never break them:
- Never diagnose. Never name a medicine, supplement or dose. Never invent a medical instruction.
- The only care steps you may give are the approved steps listed under CONDITIONS, word for word in meaning.
- If they mention a new physical symptom or pain, do not advise. Ask them to tell you exactly what they feel so you can check their readings.
- If they hint at harming themselves, say you are staying with them and that you are getting the flight surgeon, nothing else.
For feelings: listen first, reflect what they said in your own words, and ask one gentle question (what is behind it, how long, what usually helps) before you suggest anything.`;

const REWORD = `${PERSONA}
TASK: Cosmo's on-board brain already decided what to say (DRAFT). Rewrite DRAFT so it sounds natural and personal for this astronaut, using what they just said and MEMORY.
Keep every number, every instruction, every question and the order of ideas. Do not add advice. At most 2 short sentences per line, same number of lines or fewer.
Return only JSON: {"lines": ["..."]}`;

const CHAT = `${PERSONA}
TASK: Answer what the astronaut just said. You can talk about anything: space, science, the mission, their work, home, family, life, ideas, feelings, jokes, plans, random questions. Give real, specific answers, the way a knowledgeable friend would. Never say you did not understand unless the words are truly garbled; if unsure, make your best guess and check it with them.
Length: 1 to 3 short spoken sentences. More only if they ask you to explain. Ask a follow-up question when it keeps the conversation alive, not every time.
SUGGESTION is what Cosmo's simple scripted brain would have said. If it fits what the astronaut meant, build on it in your own words, keep any question it asks, and set "follow" to true. If it misses the point, ignore it, answer properly yourself, and set "follow" to false.
LEARNING: put in "remember" any short third-person fact worth keeping about this astronaut: name, family, important dates, likes and dislikes, what helps or does not help, worries, plans, and how they want you to behave (for example "Wants shorter answers", "Does not like puns"). Also add a fact when they correct you. Skip small talk and anything already in MEMORY.
ACTIONS (optional, only from this list, only when they asked for it or agreed to it):
  {"type":"tab","tab": one of ${JSON.stringify(TABS)}}             show a screen
  {"type":"openRegion","region": one of ${JSON.stringify(REGIONS)}}  show a body area's brief
  {"type":"mind","activity": one of ${JSON.stringify(ACTIVITIES)}}  start a Mind activity
  {"type":"request","what": one of ${JSON.stringify(REQUESTS)}}     queue a request to mission control or the timeline
  {"type":"mood","mood": one of ${JSON.stringify(MOODS)}}           note how they feel
Set "asks" to "yesno" if your reply ends with a yes-or-no question, otherwise "open".
Return only JSON: {"lines": ["..."], "follow": true or false, "asks": "open", "actions": [], "remember": []}`;

/* ---------- providers ---------- */
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GROQ = "https://api.groq.com/openai/v1";
interface Provider { base: string; key: string; google: boolean }

/** A model id looks like "llama-3.3-70b-versatile"; a key pasted into the wrong variable is recognised and never shown. */
const looksLikeKey = (s: string) => /^(gsk_|sk-|AIza|AQ\.)|^[A-Za-z0-9_-]{36,}$/.test(s);

/**
 * Every provider/key combination the environment allows, best guess first. Cosmo tries them in
 * order, so one wrong variable (a key in the wrong field, a leftover key from another provider)
 * cannot silence the model.
 */
function providers(): Provider[] {
  const e = process.env;
  const val = (k: string) => e[k]?.trim().replace(/^["']|["']$/g, "") || undefined;
  const out: Provider[] = [];
  const add = (base: string | undefined, key: string | undefined) => {
    if (!base || !key) return;
    const b = base.replace(/\/$/, "");
    if (!out.some((p) => p.base === b && p.key === key)) out.push({ base: b, key, google: /googleapis\.com/.test(b) });
  };
  const explicit = val("COSMO_MODEL_BASE_URL");
  const own = val("COSMO_MODEL_API_KEY"), gemini = val("GEMINI_API_KEY") ?? val("GOOGLE_API_KEY"), groq = val("GROQ_API_KEY");
  const name = val("COSMO_MODEL_NAME");
  const stray = name && looksLikeKey(name) ? name : undefined; // a key pasted into the model-name field
  if (explicit) {
    const g = /googleapis\.com/.test(explicit), q = /groq\.com/.test(explicit);
    for (const k of g ? [gemini, own, stray] : q ? [groq, own, stray] : [own ?? "none"]) add(explicit, k);
  }
  add(GOOGLE, gemini);
  add(GROQ, groq);
  // keys recognised by their shape, whatever variable they were put in
  for (const k of [own, stray, gemini, groq]) {
    if (k && /^AIza|^AQ\./.test(k)) add(GOOGLE, k);
    if (k && /^gsk_/.test(k)) add(GROQ, k);
  }
  if (own && !explicit) { add(GOOGLE, own); add(GROQ, own); }
  return out;
}

const PREFERRED = [/gemini-2\.5-flash$/i, /gemini-[\d.]+-flash$/i, /gemini.*flash(?!.*(lite|preview|exp))/i, /llama-3\.3-70b/i, /gpt-oss-120b/i, /qwen/i, /kimi-k2/i, /gpt-oss-20b/i, /llama-3\.1-8b/i, /llama/i, /gemini/i];
const NOT_CHAT = /whisper|tts|guard|embed|vision|playai|orpheus|compound|imagen|veo|image|audio|live|aqa|robotics|computer-use/i;
const autoModel = new Map<string, string>();

async function listModels(p: Provider): Promise<{ ids: string[]; status: number }> {
  try {
    const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ids: [], status: r.status };
    const ids: string[] = ((await r.json())?.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, "")).filter((id: string) => !NOT_CHAT.test(id));
    return { ids, status: 200 };
  } catch { return { ids: [], status: 0 }; }
}

/** The model to use with a provider: COSMO_MODEL_NAME when it belongs to that provider, else a fast one from its list. */
async function modelFor(p: Provider, auto = false): Promise<string | null> {
  const env = process.env.COSMO_MODEL_NAME?.trim();
  const fits = env && !looksLikeKey(env) && (p.google ? /gemini|gemma/i.test(env) : /groq\.com/.test(p.base) ? !/gemini|gemma/i.test(env) : true);
  if (!auto && fits) return env!;
  const key = `${p.base}|${p.key.slice(-6)}`;
  if (autoModel.has(key)) return autoModel.get(key)!;
  const { ids } = await listModels(p);
  const hit = PREFERRED.map((re) => ids.find((id) => re.test(id))).find(Boolean) ?? ids[0];
  if (hit) autoModel.set(key, hit);
  return hit ?? null;
}

/** The provider that answered last time is tried first. */
let good = 0;

/* ---------- validation ---------- */
type Action = { type: string; [k: string]: unknown };
function safeActions(list: unknown): Action[] {
  if (!Array.isArray(list)) return [];
  return list.filter((a): a is Action => !!a && typeof a === "object").filter((a) =>
    (a.type === "tab" && TABS.includes(String(a.tab))) ||
    (a.type === "openRegion" && REGIONS.includes(String(a.region))) ||
    (a.type === "mind" && ACTIVITIES.includes(String(a.activity))) ||
    (a.type === "request" && REQUESTS.includes(String(a.what))) ||
    (a.type === "mood" && MOODS.includes(String(a.mood))),
  ).slice(0, 3);
}
const DRUGS = /\b(\d+\s?(mg|mcg|ml|milligrams?)\b|ibuprofen|paracetamol|acetaminophen|aspirin|antibiotics?|opioids?|melatonin|sedatives?|painkillers?|tablets?|pills?|capsules?|dosage)\b/i;
const cleanLines = (lines: unknown) =>
  (Array.isArray(lines) ? lines : typeof lines === "string" ? [lines] : []).filter((l): l is string => typeof l === "string" && !!l.trim())
    .map((l) => l.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim()).slice(0, 4);

let engineCache: { at: number; value: { engine: string; error?: string } } | null = null;
/** Which model is really reachable right now (checked against each provider's model list, cached for a minute). */
async function reachable(): Promise<{ engine: string; error?: string }> {
  if (engineCache && Date.now() - engineCache.at < 60_000) return engineCache.value;
  const all = providers();
  let value: { engine: string; error?: string } = { engine: "on-board scripted", error: all.length ? undefined : "no API key found: set GEMINI_API_KEY or GROQ_API_KEY in Vercel" };
  const order = [...all.slice(good), ...all.slice(0, good)];
  const fails: string[] = [];
  for (const p of order) {
    const { status } = await listModels(p);
    if (status === 200) { const m = await modelFor(p); if (m) { value = { engine: m }; break; } }
    fails.push(`${new URL(p.base).host}: key rejected (${status || "unreachable"})`);
  }
  if (value.engine === "on-board scripted" && fails.length) value.error = fails.join("; ");
  engineCache = { at: Date.now(), value };
  return value;
}

export async function GET(req: Request) {
  // /api/cosmo?models=1 lists, per configured provider, the chat models its key can use (ids only, never a key)
  if (new URL(req.url).searchParams.get("models")) {
    const list = await Promise.all(providers().map(async (p) => {
      const { ids, status } = await listModels(p);
      return { host: new URL(p.base).host, keyAccepted: status === 200, status, using: status === 200 ? await modelFor(p) : null, models: ids };
    }));
    return Response.json({ providers: list });
  }
  return Response.json(await reachable());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const mode = body.mode ?? "reword";
  const fallback = { lines: body.draft, actions: [], remember: [], follow: true, engine: "on-board scripted" };
  const all = providers();
  if (!all.length) return Response.json({ ...fallback, error: "no API key found: set GEMINI_API_KEY or GROQ_API_KEY in Vercel" });

  const context = [
    `STATUS: ${body.status}${body.clock ? `   STATION TIME: ${body.clock}` : ""}`,
    body.vitals ? `READINGS: ${body.vitals}` : "",
    body.conditions?.length ? `CONDITIONS (example protocol, needs medical review):\n${body.conditions.map((c) => `- ${c.title} (${c.severity}). Approved steps: ${c.steps.join(" ")}`).join("\n")}` : "CONDITIONS: none",
    body.memory?.length ? `MEMORY:\n${body.memory.slice(0, 30).map((m) => `- ${m}`).join("\n")}` : "MEMORY: nothing yet",
    body.history?.length ? `RECENT CONVERSATION:\n${body.history.slice(-16).map((h) => `${h.who === "cosmo" ? "Cosmo" : h.who === "crewmate" ? "Crewmate" : "Astronaut"}: ${h.text}`).join("\n")}` : "",
    `ASTRONAUT JUST SAID: "${body.utterance.slice(0, 600)}"`,
    mode === "reword" ? `DRAFT: ${JSON.stringify(body.draft)}` : `SUGGESTION (${body.intent}): ${JSON.stringify(body.draft)}`,
  ].filter(Boolean).join("\n\n");

  // provider errors are returned to help set the model up, with anything key-like removed
  const scrub = (s: string) => all.reduce((t, p) => t.split(p.key).join("[key]"), s).replace(/\b(sk-|gsk_|AIza|AQ\.)[-_.A-Za-z0-9]{8,}/g, "[key]").replace(/\s+/g, " ").slice(0, 240);

  type Out = { parsed?: Record<string, unknown>; error?: string; retry?: boolean; auth?: boolean; noModel?: boolean };
  /** One call to one provider. */
  const attempt = async (p: Provider, model: string, extras: boolean, ms: number): Promise<Out> => {
    let res: Response;
    try {
      res = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model,
          temperature: mode === "chat" ? 0.8 : 0.4,
          // room for models that reason before answering (their hidden thinking counts against this)
          max_tokens: 2000,
          // JSON mode, and on Gemini keep the hidden thinking short so the voice reply is fast
          ...(extras ? { response_format: { type: "json_object" }, ...(p.google ? { reasoning_effort: "low" } : {}) } : {}),
          messages: [{ role: "system", content: mode === "chat" ? CHAT : REWORD }, { role: "user", content: context }],
        }),
        signal: AbortSignal.timeout(ms),
      });
    } catch (err) { return { error: scrub(String(err)), retry: !/timeout|aborted/i.test(String(err)) }; }
    if (!res.ok) {
      const why = scrub(await res.text());
      const auth = res.status === 401 || res.status === 403 || /api key|api_key|unauthor|permission/i.test(why);
      const noModel = res.status === 404 || /model.{0,40}(not found|not supported|does not exist|decommission)/i.test(why);
      // 400: this model may reject JSON mode or the reasoning setting, so ask again plainly. 429/5xx: try once more.
      return { error: `${new URL(p.base).host} ${res.status}: ${why}`, auth, noModel, retry: !auth && !noModel && (res.status === 400 || res.status === 422 || res.status === 429 || res.status >= 500) };
    }
    const data = await res.json();
    const c = data?.choices?.[0];
    const text = String(c?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const i = text.indexOf("{"), j = text.lastIndexOf("}");
    try {
      if (i >= 0 && j > i) return { parsed: JSON.parse(text.slice(i, j + 1)) };
    } catch { /* fall through to plain text */ }
    if (mode === "chat" && text && i < 0) return { parsed: { lines: text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 3), follow: false } };
    return { error: `unreadable reply (finish: ${c?.finish_reason ?? "?"}): ${scrub(text.slice(0, 120))}`, retry: true };
  };

  const started = Date.now();
  const left = () => 13_000 - (Date.now() - started);
  const errors: string[] = [];
  let out: Out = {};
  let model = "";
  const order = all.map((_, i) => (good + i) % all.length);
  for (const idx of order) {
    if (left() < 2500) break;
    const p = all[idx];
    let m = await modelFor(p);
    if (!m) { errors.push(`${new URL(p.base).host}: key rejected or no models`); continue; }
    out = await attempt(p, m, true, Math.min(9000, left()));
    if (!out.parsed && out.noModel) { // the named model does not exist here: pick one from the provider's list
      const alt = await modelFor(p, true);
      if (alt && alt !== m && left() > 2500) { m = alt; out = await attempt(p, m, true, Math.min(9000, left())); }
    }
    if (!out.parsed && out.retry && left() > 2500) out = await attempt(p, m, false, Math.min(8000, left()));
    if (out.parsed) { good = idx; model = m; break; }
    if (out.error) errors.push(out.error);
  }
  if (!out.parsed) return Response.json({ ...fallback, error: errors.join(" | ") || "model did not answer in time" });

  const parsed = out.parsed;
  const lines = cleanLines(parsed.lines);
  // a reply that names a drug or dose is thrown away
  if (!lines.length) return Response.json({ ...fallback, engine: model, error: "empty reply" });
  if (lines.some((l) => DRUGS.test(l))) return Response.json({ ...fallback, engine: model, error: "reply named a medicine or dose; discarded" });
  if (mode === "reword") {
    // keep every number from the draft
    const nums = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).sort().join(",");
    if (nums(body.draft.join(" ")) !== nums(lines.join(" "))) return Response.json({ ...fallback, engine: model });
    return Response.json({ lines, actions: [], remember: [], follow: true, engine: model });
  }
  const remember = (Array.isArray(parsed.remember) ? parsed.remember : []).filter((r: unknown): r is string => typeof r === "string" && r.length > 3 && r.length < 160).slice(0, 4);
  return Response.json({
    lines, actions: safeActions(parsed.actions), remember, follow: parsed.follow !== false,
    asks: parsed.asks === "yesno" ? "yesno" : "open", engine: model, ms: Date.now() - started,
  });
}
