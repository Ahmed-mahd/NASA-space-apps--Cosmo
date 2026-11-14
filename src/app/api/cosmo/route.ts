/**
 * Cosmo's language-model agent (server side).
 *
 * Any OpenAI-compatible chat endpoint works. Set in Vercel (never in the repo), one of:
 *   OPENROUTER_API_KEY                  OpenRouter (tried first; picks a fast model it offers)
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
  /** The model that answered this browser last time; tried first if it is still healthy. */
  prefer?: string;
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
const OPENROUTER = "https://openrouter.ai/api/v1";
interface Provider { base: string; key: string; google: boolean; openrouter: boolean }
/** OpenRouter: fast, reliable chat models tried in this order (each is used only if OpenRouter lists it). */
const OPENROUTER_MODELS = [
  "google/gemini-2.5-flash", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct", "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku", "mistralai/mistral-small-3.1-24b-instruct", "qwen/qwen-2.5-72b-instruct",
];

/** A model id looks like "llama-3.3-70b-versatile"; a key pasted into the wrong variable is recognised and never shown. */
const looksLikeKey = (s: string) => /^(gsk_|sk-|sk-or-|AIza|AQ\.)|^[A-Za-z0-9_-]{36,}$/.test(s);

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
    if (!out.some((p) => p.base === b && p.key === key)) out.push({ base: b, key, google: /googleapis\.com/.test(b), openrouter: /openrouter\.ai/.test(b) });
  };
  const explicit = val("COSMO_MODEL_BASE_URL");
  const own = val("COSMO_MODEL_API_KEY"), gemini = val("GEMINI_API_KEY") ?? val("GOOGLE_API_KEY"), groq = val("GROQ_API_KEY");
  const openrouter = val("OPENROUTER_API_KEY");
  const name = val("COSMO_MODEL_NAME");
  const stray = name && looksLikeKey(name) ? name : undefined; // a key pasted into the model-name field
  // OpenRouter first: one key, many models, its own failover between providers
  add(OPENROUTER, openrouter);
  if (explicit) {
    const g = /googleapis\.com/.test(explicit), q = /groq\.com/.test(explicit), o = /openrouter\.ai/.test(explicit);
    for (const k of g ? [gemini, own, stray] : q ? [groq, own, stray] : o ? [openrouter, own, stray] : [own ?? "none"]) add(explicit, k);
  }
  add(GOOGLE, gemini);
  add(GROQ, groq);
  // keys recognised by their shape, whatever variable they were put in
  for (const k of [own, stray, gemini, groq, openrouter]) {
    if (k && /^sk-or-/.test(k)) add(OPENROUTER, k);
    if (k && /^AIza|^AQ\./.test(k)) add(GOOGLE, k);
    if (k && /^gsk_/.test(k)) add(GROQ, k);
  }
  if (own && !explicit) { add(GOOGLE, own); add(GROQ, own); }
  return out;
}

/* ---------- models ---------- */
/** Fast chat models first. The list a key can use changes over time, so this is a ranking, not a fixed choice. */
const PREFERRED = [
  /^gemini-flash-latest$/i, /^gemini-2\.5-flash$/i, /^gemini-flash-lite-latest$/i, /^gemini-2\.5-flash-lite$/i,
  /^gemini-[\d.]+-flash$/i, /^gemini-[\d.]+-flash-lite$/i, /gemini.*flash/i,
  /llama-3\.3-70b/i, /gpt-oss-120b/i, /qwen/i, /kimi-k2/i, /gpt-oss-20b/i, /llama-3\.1-8b/i, /llama/i, /gemma/i, /gemini/i,
];
const NOT_CHAT = /whisper|tts|guard|embed|vision|playai|orpheus|compound|imagen|veo|image|banana|audio|live|omni|transcribe|lyria|antigravity|deep-research|aqa|robotics|computer-use|customtools/i;

const listCache = new Map<string, { at: number; ids: string[]; status: number }>();
async function listModels(p: Provider): Promise<{ ids: string[]; status: number }> {
  const k = `${p.base}|${p.key.slice(-6)}`;
  const hit = listCache.get(k);
  if (hit && Date.now() - hit.at < (hit.status === 200 ? 600_000 : 20_000)) return hit;
  let out = { ids: [] as string[], status: 0 };
  try {
    const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(5000) });
    out = r.ok
      ? { status: 200, ids: ((await r.json())?.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, "")).filter((id: string) => !NOT_CHAT.test(id)) }
      : { ids: [], status: r.status };
  } catch { /* unreachable */ }
  listCache.set(k, { at: Date.now(), ...out });
  return out;
}

/** What Cosmo has seen of each model on this server: how fast it answers, and whether it just failed. */
const health = new Map<string, { ms?: number; badUntil?: number }>();
const markGood = (m: string, ms: number) => { const h = health.get(m); health.set(m, { ms: h?.ms ? Math.round(h.ms * 0.5 + ms * 0.5) : ms }); };
const markBad = (m: string, minutes = 3) => health.set(m, { ...health.get(m), badUntil: Date.now() + minutes * 60_000 });
const isBad = (m: string) => (health.get(m)?.badUntil ?? 0) > Date.now();

/**
 * Models to try with a provider, best first: the one named in COSMO_MODEL_NAME (when it belongs to
 * this provider), then fast models from the provider's own list. A model that just failed or
 * timed out moves to the back for a few minutes; one that has answered quickly moves to the front.
 */
async function candidates(p: Provider, prefer?: string): Promise<string[]> {
  const env = process.env.COSMO_MODEL_NAME?.trim();
  const fits = env && !looksLikeKey(env) && (p.openrouter ? env.includes("/") : p.google ? /gemini|gemma/i.test(env) : /groq\.com/.test(p.base) ? !/gemini|gemma|\//i.test(env) : true);
  const { ids } = await listModels(p);
  const ranked: string[] = [];
  if (p.openrouter) {
    // OpenRouter lists hundreds of models: use the curated fast ones it actually offers
    const offered = ids.length ? OPENROUTER_MODELS.filter((m) => ids.includes(m)) : OPENROUTER_MODELS;
    const list = [...new Set([...(fits ? [env!] : []), ...offered])];
    const score = (m: string, i: number) => (isBad(m) ? 1e6 : 0) + (health.get(m)?.ms ?? (m === prefer ? 1000 : 2000 + i * 100));
    return list.map((m, i) => ({ m, s: score(m, i) })).sort((x, y) => x.s - y.s).map((x) => x.m);
  }
  for (const re of PREFERRED) for (const id of ids) if (re.test(id) && !ranked.includes(id) && !/pro\b|preview|exp/i.test(id)) ranked.push(id);
  // providers with other model names (a local Ollama, for example): use whatever they list
  for (const id of ids) if (!ranked.includes(id) && !/pro|preview|exp/i.test(id)) ranked.push(id);
  const list = [...new Set([...(fits ? [env!] : []), ...ranked])];
  const score = (m: string, i: number) => (isBad(m) ? 1e6 : 0) + (health.get(m)?.ms ?? (m === prefer ? 1000 : i === 0 ? 2000 : 2600 + i * 50));
  return list.map((m, i) => ({ m, s: score(m, i) })).sort((x, y) => x.s - y.s).map((x) => x.m);
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
  let value: { engine: string; error?: string } = { engine: "on-board scripted", error: all.length ? undefined : "no API key found: set OPENROUTER_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY) in Vercel" };
  const fails: string[] = [];
  for (const p of [...all.slice(good), ...all.slice(0, good)]) {
    const { status } = await listModels(p);
    const m = status === 200 ? (await candidates(p))[0] : null;
    if (m) { value = { engine: m }; break; }
    fails.push(`${new URL(p.base).host}: key rejected (${status || "unreachable"})`);
  }
  if (value.engine === "on-board scripted" && fails.length) value.error = fails.join("; ");
  engineCache = { at: Date.now(), value };
  return value;
}

const CONTEXT_HINT = "Reply with JSON only.";
type Out = { parsed?: Record<string, unknown>; error?: string; status?: number; auth?: boolean; noModel?: boolean; plainOk?: boolean };

/** One call to one model. */
async function callModel(p: Provider, model: string, system: string, user: string, opts: { extras: boolean; ms: number; chat: boolean; scrub: (s: string) => string }): Promise<Out> {
  let res: Response;
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}`, ...(p.openrouter ? { "HTTP-Referer": "https://cosmo-health.vercel.app", "X-Title": "COSMO" } : {}) },
      body: JSON.stringify({
        model,
        temperature: opts.chat ? 0.8 : 0.4,
        // room for models that reason before answering (their hidden thinking counts against this)
        max_tokens: 2000,
        // JSON mode, and on Gemini keep the hidden thinking short so the voice reply is fast
        ...(opts.extras ? { response_format: { type: "json_object" }, ...(p.google ? { reasoning_effort: "low" } : {}) } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(opts.ms),
    });
  } catch (err) { return { error: /timeout|aborted/i.test(String(err)) ? `no answer in ${(opts.ms / 1000).toFixed(1)} s` : opts.scrub(String(err)) }; }
  if (!res.ok) {
    const why = opts.scrub(await res.text());
    const auth = res.status === 401 || res.status === 403 || /api key|api_key|unauthor|permission/i.test(why);
    const noModel = res.status === 404 || /model.{0,40}(not found|not supported|does not exist|decommission)/i.test(why);
    return { error: `${res.status}: ${why}`, status: res.status, auth, noModel, plainOk: !auth && !noModel && (res.status === 400 || res.status === 422) };
  }
  const data = await res.json();
  const c = data?.choices?.[0];
  const text = String(c?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  try {
    if (i >= 0 && j > i) return { parsed: JSON.parse(text.slice(i, j + 1)) };
  } catch { /* fall through to plain text */ }
  if (opts.chat && text && i < 0) return { parsed: { lines: text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, 3), follow: false } };
  return { error: `unreadable reply (finish: ${c?.finish_reason ?? "?"}): ${opts.scrub(text.slice(0, 100))}` };
}

/**
 * Ask a provider, never waiting on one slow model: the best candidate starts first; if it has not
 * answered after HEDGE ms (or fails), the next one starts too, and the first good answer wins.
 */
const HEDGE = 2800;
function ask(p: Provider, models: string[], system: string, user: string, chat: boolean, budget: number, scrub: (s: string) => string): Promise<Out & { model?: string; ms?: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const left = () => budget - (Date.now() - started);
    const errors: string[] = [];
    let next = 0, running = 0, done = false, launched = 0;
    const finish = (out: Out & { model?: string; ms?: number }) => { if (!done) { done = true; clearInterval(hedge); clearTimeout(cap); resolve(out); } };
    const launch = () => {
      if (done || next >= models.length || launched >= 4 || left() < 1500) return false;
      const m = models[next++];
      launched++; running++;
      const t0 = Date.now();
      (async () => {
        let out = await callModel(p, m, system, user, { extras: true, ms: Math.min(9000, left()), chat, scrub });
        // this model rejects JSON mode or the reasoning setting: ask again plainly
        if (!out.parsed && out.plainOk && left() > 1500) out = await callModel(p, m, system, user, { extras: false, ms: Math.min(8000, left()), chat, scrub });
        running--;
        if (done) return;
        if (out.parsed) { markGood(m, Date.now() - t0); return finish({ ...out, model: m, ms: Date.now() - t0 }); }
        if (out.auth) return finish({ error: `${new URL(p.base).host} ${out.error}`, auth: true });
        markBad(m, out.noModel ? 60 : 3);
        errors.push(`${m}: ${out.error}`);
        if (!launch() && running === 0) finish({ error: errors.join(" | ") });
      })();
      return true;
    };
    const hedge = setInterval(() => { if (running < 2) launch(); }, HEDGE);
    const cap = setTimeout(() => finish({ error: errors.join(" | ") || `no model answered in ${(budget / 1000).toFixed(0)} s` }), budget);
    if (!launch()) finish({ error: "no chat model available for this key" });
  });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const all = providers();
  // /api/cosmo?models=1 lists, per configured provider, the chat models its key can use (ids only, never a key)
  if (q.get("models")) {
    const list = await Promise.all(all.map(async (p) => {
      const { ids, status } = await listModels(p);
      return { host: new URL(p.base).host, keyAccepted: status === 200, status, tryOrder: status === 200 ? (await candidates(p)).slice(0, 8) : [], models: ids };
    }));
    return Response.json({ providers: list });
  }
  // /api/cosmo?probe=1 times a one-line answer from each candidate model, to see which are fast right now
  if (q.get("probe")) {
    const scrub = (s: string) => all.reduce((t, p) => t.split(p.key).join("[key]"), s).replace(/\s+/g, " ").slice(0, 160);
    const out = [];
    for (const p of all) {
      const list = (await candidates(p)).slice(0, 12);
      const rows = await Promise.all(list.map(async (m) => {
        const t0 = Date.now();
        const r = await callModel(p, m, `You are a test. ${CONTEXT_HINT}`, 'Return {"lines":["ready"]}', { extras: true, ms: 12_000, chat: false, scrub });
        const ms = Date.now() - t0;
        if (r.parsed) markGood(m, ms); else markBad(m, 2);
        return { model: m, ok: !!r.parsed, ms, error: r.error };
      }));
      out.push({ host: new URL(p.base).host, results: rows.sort((x, y) => Number(y.ok) - Number(x.ok) || x.ms - y.ms) });
    }
    engineCache = null;
    return Response.json({ probe: out });
  }
  return Response.json(await reachable());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const mode = body.mode ?? "reword";
  const fallback = { lines: body.draft, actions: [], remember: [], follow: true, engine: "on-board scripted" };
  const all = providers();
  if (!all.length) return Response.json({ ...fallback, error: "no API key found: set OPENROUTER_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY) in Vercel" });

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
  const scrub = (s: string) => all.reduce((t, p) => t.split(p.key).join("[key]"), s).replace(/\b(sk-|gsk_|AIza|AQ\.)[-_.A-Za-z0-9]{8,}/g, "[key]").replace(/\s+/g, " ").slice(0, 200);

  const started = Date.now();
  const left = () => 12_500 - (Date.now() - started);
  const errors: string[] = [];
  let out: Out & { model?: string; ms?: number } = {};
  let model = "";
  for (const idx of all.map((_, i) => (good + i) % all.length)) {
    if (left() < 2000) break;
    const p = all[idx];
    const models = await candidates(p, typeof body.prefer === "string" ? body.prefer : undefined);
    if (!models.length) { errors.push(`${new URL(p.base).host}: key rejected or no models`); continue; }
    out = await ask(p, models, mode === "chat" ? CHAT : REWORD, context, mode === "chat", left(), scrub);
    if (out.parsed && out.model) { good = idx; model = out.model; break; }
    if (out.error) errors.push(out.error);
  }
  if (!out.parsed) return Response.json({ ...fallback, error: errors.join(" | ").slice(0, 600) || "model did not answer in time" });

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
