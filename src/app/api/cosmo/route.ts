/**
 * Voice layer, server side: the language-model adapter.
 *
 * Any OpenAI-compatible chat endpoint works, chosen with three env vars set in
 * Vercel (never in the repo):
 *   COSMO_MODEL_BASE_URL  e.g. http://localhost:11434/v1 for Ollama + Qwen on board
 *   COSMO_MODEL_API_KEY   any string for Ollama
 *   COSMO_MODEL_NAME      e.g. qwen2.5
 *
 * The model only rewords the draft reply that Cosmo's on-board dialogue manager
 * and rules already decided, or answers open small talk. It must not add or
 * change any medical step. Without the env vars, or on any error or timeout,
 * the draft is returned unchanged, so the demo always works.
 */

const SYSTEM = `You are Cosmo, a warm, funny health companion on an astronaut's wrist, far from Earth.
You speak out loud, so reply in plain spoken English, at most 2 short sentences per line, no lists, no markdown, no emoji.
STRICT RULES:
- If DRAFT is given, keep its meaning, every number and every instruction exactly; you may only make the wording warmer and more natural.
- Never add, remove or change a medical instruction. Never name a medicine or dose. Never diagnose.
- Humor: playful when STATUS is nominal, gentle when advisory, none at all when alert.
- If there is no DRAFT, answer small talk briefly. If the astronaut describes a health problem, ask them to tell you their symptoms so you can check their readings.
Return only JSON: {"lines": ["...", "..."]}`;

interface Body {
  utterance: string;
  draft: string[];
  intent: string;
  status: "nominal" | "advisory" | "alert";
  vitals?: string;
}

export async function GET() {
  const name = process.env.COSMO_MODEL_NAME;
  const ready = !!(process.env.COSMO_MODEL_BASE_URL && name);
  return Response.json({ engine: ready ? name : "on-board scripted" });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const base = process.env.COSMO_MODEL_BASE_URL;
  const model = process.env.COSMO_MODEL_NAME;
  const key = process.env.COSMO_MODEL_API_KEY ?? "none";
  const fallback = { lines: body.draft, engine: "on-board scripted" };
  if (!base || !model) return Response.json(fallback);

  // jokes and scripted scan steps are spoken exactly as written
  if (body.intent === "joke" || body.intent === "scan") return Response.json({ ...fallback, engine: model });

  const user = [
    `STATUS: ${body.status}`,
    body.vitals ? `READINGS: ${body.vitals}` : "",
    `ASTRONAUT SAID: "${body.utterance.slice(0, 400)}"`,
    body.intent !== "unknown" ? `DRAFT: ${JSON.stringify(body.draft)}` : "DRAFT: none",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return Response.json(fallback);
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const lines = Array.isArray(parsed.lines) ? parsed.lines.filter((l: unknown) => typeof l === "string" && l.trim()).slice(0, 4) : [];
    return Response.json(lines.length ? { lines, engine: model } : fallback);
  } catch {
    return Response.json(fallback);
  }
}
