/**
 * Cosmo's language-model agent (server side).
 *
 * Any OpenAI-compatible chat endpoint works. Set in Vercel (never in the repo):
 *   COSMO_MODEL_BASE_URL  e.g. https://api.groq.com/openai/v1, or http://localhost:11434/v1 for Ollama + Qwen
 *   COSMO_MODEL_API_KEY   the provider key (any string for Ollama)
 *   COSMO_MODEL_NAME      optional; picked automatically from the provider's model list
 * A plain GROQ_API_KEY also works (Groq's endpoint is then used).
 *
 * Two modes, both inside the three-layer design (the model never picks a medical action):
 *   reword  the on-board brain already decided; the model makes the wording natural and personal,
 *           keeping every number, instruction and question.
 *   chat    open conversation the brain has no script for (anything at all). The model may only
 *           use whitelisted, non-medical actions and may propose facts to remember.
 * Safety-critical lines (emergencies, yes/no questions, crisis support, scan steps, jokes) never
 * reach the model. On any error or timeout the on-board draft is used, so the demo always works.
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
}

const TABS = ["body", "trends", "mind", "radiation", "labs", "link"];
const ACTIVITIES = ["joke", "trivia", "breathing", "earth", "journal"];
const REQUESTS = ["family-call", "psych-conference", "crew-company", "quiet", "rest", "exercise"];
const MOODS = ["great", "okay", "tired", "low", "stressed"];
const EXACT = /^(joke|scan|crisis|yesno|crewmate|emergency|chest-pain|cant-breathe|faint|injury|major-alert|glucose-check|stop)/;

const PERSONA = `You are Cosmo, the AI health companion living in an astronaut's wrist device on a long mission far from Earth.
You talk out loud, so write plain spoken English: short sentences, no lists, no markdown, no emoji, no stage directions.
You are warm, curious and genuinely funny, like a good crewmate. Humor: playful when STATUS is nominal, gentle when advisory, none when alert.
You remember the astronaut (see MEMORY) and use it naturally: their name, the people they love, what helps them, what they told you before.
HEALTH RULES (never break): never diagnose, never name a medicine, supplement or dose, never invent a medical instruction.
The only care steps you may mention are the ones listed under CONDITIONS. If the astronaut describes a new physical symptom, ask them to tell you more so you can check their readings.
For feelings: listen first, reflect what they said, ask one gentle question before suggesting anything.`;

const REWORD = `${PERSONA}
TASK: Cosmo's on-board brain already decided what to say (DRAFT). Rewrite DRAFT so it sounds natural and personal for this astronaut, using what they just said and MEMORY.
Keep every number, every instruction, every question and the order of ideas. Do not add advice. At most 2 short sentences per line, same number of lines or fewer.
Return only JSON: {"lines": ["..."]}`;

const CHAT = `${PERSONA}
TASK: Reply to the astronaut. You can talk about anything: space, science, the mission, home, life, ideas, feelings, small talk.
Keep it to 1 to 3 short spoken sentences. End with a question only when it keeps the conversation going naturally.
You may attach actions from this whitelist only:
  {"type":"tab","tab": one of ${JSON.stringify(TABS)}}
  {"type":"mind","activity": one of ${JSON.stringify(ACTIVITIES)}}   (start a Mind activity when they ask or agree)
  {"type":"request","what": one of ${JSON.stringify(REQUESTS)}}       (only after they clearly agreed)
  {"type":"mood","mood": one of ${JSON.stringify(MOODS)}}            (when they tell you how they feel)
In "remember", add short third-person facts worth keeping for later (name, family, likes, what helps, important events). Skip trivia.
Return only JSON: {"lines": ["..."], "actions": [], "remember": []}`;

/* ---------- provider ---------- */
function provider() {
  const groq = process.env.GROQ_API_KEY;
  const base = process.env.COSMO_MODEL_BASE_URL ?? (groq ? "https://api.groq.com/openai/v1" : undefined);
  const key = process.env.COSMO_MODEL_API_KEY ?? groq ?? "none";
  return base ? { base: base.replace(/\/$/, ""), key } : null;
}

const PREFERRED = [/llama-3\.3-70b/i, /gpt-oss-120b/i, /llama-4-maverick/i, /qwen3?-?32b|qwen/i, /kimi-k2/i, /gpt-oss-20b/i, /llama-3\.1-8b/i, /llama/i];
let cachedModel: string | null = null;
async function modelName(p: { base: string; key: string }): Promise<string | null> {
  if (process.env.COSMO_MODEL_NAME) return process.env.COSMO_MODEL_NAME;
  if (cachedModel) return cachedModel;
  try {
    const r = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const ids: string[] = ((await r.json())?.data ?? []).map((m: { id: string }) => m.id)
      .filter((id: string) => !/whisper|tts|guard|embed|vision|playai|orpheus|compound/i.test(id));
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
    (a.type === "mind" && ACTIVITIES.includes(String(a.activity))) ||
    (a.type === "request" && REQUESTS.includes(String(a.what))) ||
    (a.type === "mood" && MOODS.includes(String(a.mood))),
  ).slice(0, 3);
}
const DRUGS = /\b(\d+\s?(mg|mcg|ml|milligrams?|grams?)\b|ibuprofen|paracetamol|acetaminophen|aspirin|antibiotic|opioid|melatonin|tablet|pill|capsule|dose)\b/i;
const cleanLines = (lines: unknown) =>
  (Array.isArray(lines) ? lines : []).filter((l): l is string => typeof l === "string" && !!l.trim())
    .map((l) => l.replace(/[*_#`]/g, "").trim()).slice(0, 4);

export async function GET() {
  const p = provider();
  const name = p ? await modelName(p) : null;
  return Response.json({ engine: name ?? "on-board scripted" });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const mode = body.mode ?? "reword";
  const fallback = { lines: body.draft, actions: [], remember: [], engine: "on-board scripted" };
  const p = provider();
  if (!p) return Response.json(fallback);
  const model = await modelName(p);
  if (!model) return Response.json(fallback);
  if (mode === "reword" && (EXACT.test(body.intent) || body.status === "alert")) return Response.json({ ...fallback, engine: model });

  const context = [
    `STATUS: ${body.status}`,
    body.vitals ? `READINGS: ${body.vitals}` : "",
    body.conditions?.length ? `CONDITIONS (example protocol, needs medical review):\n${body.conditions.map((c) => `- ${c.title} (${c.severity}). Approved steps: ${c.steps.join(" ")}`).join("\n")}` : "CONDITIONS: none",
    body.memory?.length ? `MEMORY:\n${body.memory.slice(0, 25).map((m) => `- ${m}`).join("\n")}` : "MEMORY: nothing yet",
    body.history?.length ? `RECENT CONVERSATION:\n${body.history.slice(-12).map((h) => `${h.who === "cosmo" ? "Cosmo" : h.who === "crewmate" ? "Crewmate" : "Astronaut"}: ${h.text}`).join("\n")}` : "",
    `ASTRONAUT JUST SAID: "${body.utterance.slice(0, 500)}"`,
    mode === "reword" ? `DRAFT: ${JSON.stringify(body.draft)}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model,
        temperature: mode === "chat" ? 0.7 : 0.4,
        max_tokens: 320,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: mode === "chat" ? CHAT : REWORD }, { role: "user", content: context }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return Response.json({ ...fallback, error: `model ${res.status}` });
    const data = await res.json();
    const text: string = (data?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const lines = cleanLines(parsed.lines);
    // a reply that names a drug or dose is thrown away
    if (!lines.length || lines.some((l) => DRUGS.test(l))) return Response.json({ ...fallback, engine: model });
    if (mode === "reword") {
      // keep every number from the draft
      const nums = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).sort().join(",");
      if (nums(body.draft.join(" ")) !== nums(lines.join(" "))) return Response.json({ ...fallback, engine: model });
      return Response.json({ lines, actions: [], remember: [], engine: model });
    }
    const remember = (Array.isArray(parsed.remember) ? parsed.remember : []).filter((r: unknown) => typeof r === "string" && r.length < 160).slice(0, 3);
    return Response.json({ lines, actions: safeActions(parsed.actions), remember, engine: model });
  } catch {
    return Response.json(fallback);
  }
}
