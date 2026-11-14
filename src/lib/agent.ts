/**
 * Who answers a turn: the on-board brain word for word, the on-board brain with the
 * language model polishing the wording, or the language model itself (AI-first).
 *
 * The on-board brain always runs first. It is the safety net and the offline mode:
 * - "exact": emergencies, crisis support, yes/no question flows, guided procedures and
 *   anything that changes the scenario. These never reach the model.
 * - "reword": readings and health advice. The model may only rephrase; every number
 *   and instruction is kept (checked on the server).
 * - "agent": everything else. The model leads the conversation with the readings,
 *   memory and history in front of it. The brain's reply is passed along as a
 *   suggestion the model can build on or ignore.
 */

import type { Action, Turn } from "./brain";
import type { CrewStatus } from "./conditions";

export type Route = "exact" | "reword" | "agent";

const EXACT = /^(crisis|yesno|crewmate|emergency|chest-pain|cant-breathe|faint|injury|major-alert|scan|glucose|crew-o2|stop|repeat|silence|wake|joke$|pain-score|pain-unclear|rest$|recheck|report|recovered|not-better|symptoms|forget|learn-name|check-in)/;
const REWORD = /^(vital|vitals|sleep$|cold|nausea|pain$|thirst|hungry|time|day|plan-done|memory|remember)/;
/** During an alert the model only steps in when the brain has no answer at all. */
const ALERT_AGENT = /^(unknown|lost|reask|open-unclear)$/;

export function routeOf(intent: string, status: CrewStatus): Route {
  if (EXACT.test(intent)) return "exact";
  if (status === "alert") return ALERT_AGENT.test(intent) ? "agent" : "exact";
  if (REWORD.test(intent)) return "reword";
  return "agent";
}

export interface AgentReply {
  lines: string[];
  actions: Action[];
  remember: string[];
  /** true: the model built on the brain's suggestion, so the brain's actions and open question stand. */
  follow: boolean;
  /** The model asked a yes/no question of its own. */
  asks?: "yesno" | "open" | null;
}

/** Combine the brain's turn with the model's reply. */
export function mergeAgent(turn: Turn, reply: AgentReply | null): Turn {
  if (!reply || !reply.lines.length) return turn; // model unavailable: the on-board reply stands
  if (reply.follow) {
    return { ...turn, say: reply.lines, actions: [...turn.actions, ...reply.actions] };
  }
  // the model went its own way: drop the brain's scripted follow-up
  return {
    intent: "agent",
    say: reply.lines,
    actions: reply.actions,
    pending: null,
    expect: reply.asks === "yesno" ? undefined : "open",
    learn: turn.learn,
    joke: undefined,
  };
}
