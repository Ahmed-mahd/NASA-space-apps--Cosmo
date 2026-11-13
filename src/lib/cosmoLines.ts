/**
 * What Cosmo says on the device, scripted until the voice layer (Phase 3)
 * words it live. Humor follows severity: on when all is well, gentle for minor
 * issues, off for major ones. At major severity Cosmo asks about a crewmate.
 */
import type { Condition, CrewStatus } from "./conditions";

const NOMINAL = [
  "Everything is inside your normal. Your heart is calmer than mission control on launch day.",
  "All green. If you were a spacecraft, I would sign off on you for another orbit.",
  "Readings look like you. I'll keep watching so you can keep working.",
];

export function cosmoLine(status: CrewStatus, conditions: Condition[], tick: number): string {
  const top = [...conditions].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1))[0];
  if (!top) return NOMINAL[Math.floor(tick / 12) % NOMINAL.length];
  switch (top.id) {
    case "short-sleep":
      return status === "advisory" && conditions.length === 1
        ? "You slept just over five hours. I'll go easy on the jokes until you've had coffee. Before noon only, deal?"
        : "You're running on short sleep, so I'm watching a little closer today.";
    case "low-oxygen":
      return top.severity === "major"
        ? "Your oxygen is low. Stop and stay still. Is a crewmate with you right now?"
        : "Your oxygen is a little below your normal. Let's pause for five minutes. Any headache?";
    case "fast-heart":
      return top.severity === "major"
        ? "Your heart is racing while you're resting. Sit down and stay with me. Is a crewmate nearby?"
        : "Your heart rate is up while you're resting. Take five, and tell me if anything hurts.";
    case "high-stress":
      return "I can see some strain building. Two minutes of slow breathing with me? I'll count.";
    case "flank-pain":
      return "I hear you, that sounds painful. Stop work and get stable. Is a crewmate nearby? I'll guide a quick kidney scan.";
    default:
      return top.title;
  }
}
