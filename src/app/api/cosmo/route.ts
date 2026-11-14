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

/* ---------- provider ---------- */
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai";
function provider() {
  const explicit = process.env.COSMO_MODEL_BASE_URL;
  const gemini = process.env.GEMINI_API_KEY, groq = process.env.GROQ_API_KEY;
  const base = explicit ?? (gemini ? GOOGLE : groq ? "https://api.groq.com/openai/v1" : undefined);
  if (!base) return null;
  const google = /googleapis\.com/.test(base);
  const key = process.env.COSMO_MODEL_API_KEY ?? (google ? gemini : groq) ?? gemini ?? groq ?? "none";
  return { base: base.replace(/\/$/, ""), key, google };
}
type Provider = NonNullable<ReturnType<typeof provider>>;

const PREFERRED = [/gemini-2\.5-flash$/i, /gemini-[\d.]+-flash$/i, /gemini.*flash(?!.*(lite|preview|exp))/i, /llama-3\.3-70b/i, /gpt-oss-120b/i, /qwen/i, /kimi-k2/i, /gpt-oss-20b/i, /llama-3\.1-8b/i, /llama/i, /gemini/i];
const NOT_CHAT = /whisper|tts|guard|embed|vision|playai|orpheus|compound|imagen|veo|image|audio|live|aqa|robotics|computer-use/i;
let cachedModel: string | null = null;
/** A model id looks like "llama-3.3-70b-versatile"; a key pasted here by mistake is ignored and never shown. */
const looksLikeKey = (s: string) => /^(gsk_|sk-|AIza)|^[A-Za-z0-9_-]{36,}$/.test(s);
async function modelName(p: Provider): Promise<string | null> {
  const env = process.env.COSMO_MODEL_NAME?.trim();
  if (env && !looksLikeKey(env)) return env;
  if (cachedModel) return cachedModel;
  try {
    const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const ids: string[] = ((await r.json())?.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, "")).filter((id: string) => !NOT_CHAT.test(id));
    for (const re of PREFERRED) { const hit = ids.find((id) => re.test(id)); if (hit) return (cachedModel = hit); }
    return (cachedModel = ids[0] ?? null);
  } catch { return null; }
}

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

export async function GET(req: Request) {
  const p = provider();
  const name = p ? await modelName(p) : null;
  // /api/cosmo?models=1 lists the chat models the key can use (ids only, never the key)
  if (p && new URL(req.url).searchParams.get("models")) {
    try {
      const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(5000) });
      const ids: string[] = r.ok ? ((await r.json())?.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, "")).filter((id: string) => !NOT_CHAT.test(id)) : [];
      return Response.json({ engine: name, host: new URL(p.base).host, models: ids, status: r.status });
    } catch (err) { return Response.json({ engine: name, error: String(err).slice(0, 120) }); }
  }
  return Response.json({ engine: name ?? "on-board scripted" });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const mode = body.mode ?? "reword";
  const fallback = { lines: body.draft, actions: [], remember: [], follow: true, engine: "on-board scripted" };
  const p = provider();
  if (!p) return Response.json(fallback);
  const model = await modelName(p);
  if (!model) return Response.json({ ...fallback, error: "no model: set COSMO_MODEL_NAME to a model id, or check the key" });

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
  const scrub = (s: string) => s.split(p.key).join("[key]").replace(/\b(sk|gsk|key|AIza)[-_A-Za-z0-9]{8,}/g, "[key]").slice(0, 300);
  const call = (extras: boolean, ms: number) => fetch(`${p.base}/chat/completions`, {
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

  /** One attempt: returns the parsed reply, or an error string. */
  const attempt = async (extras: boolean, ms: number): Promise<{ parsed?: Record<string, unknown>; error?: string; retry?: boolean }> => {
    let res: Response;
    try { res = await call(extras, ms); } catch (err) { return { error: scrub(String(err)), retry: !/timeout|aborted/i.test(String(err)) }; }
    if (!res.ok) {
      const why = scrub(await res.text());
      // 400: this model rejects JSON mode or the reasoning setting, so ask again plainly. 429/5xx: try once more.
      return { error: `model ${res.status}: ${why}`, retry: res.status === 400 || res.status === 422 || res.status === 429 || res.status >= 500 };
    }
    const data = await res.json();
    const c = data?.choices?.[0];
    const text = String(c?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    try {
      if (a >= 0 && b > a) return { parsed: JSON.parse(text.slice(a, b + 1)) };
    } catch { /* fall through to plain text */ }
    if (mode === "chat" && text && a < 0) return { parsed: { lines: text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 3), follow: false } };
    return { error: `unreadable reply (finish: ${c?.finish_reason ?? "?"}): ${scrub(text.slice(0, 120))}`, retry: true };
  };

  const started = Date.now();
  let out = await attempt(true, 9000);
  if (!out.parsed && out.retry && Date.now() - started < 6000) out = await attempt(false, 8000);
  if (!out.parsed) return Response.json({ ...fallback, engine: model, error: out.error });

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
