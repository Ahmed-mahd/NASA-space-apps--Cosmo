/**
 * "Hey Cosmo" detection on the speech recognizer's text.
 *
 * Chrome's recognizer often hears the name as "cosmos", "kosmo", "cozmo" or
 * "cosimo", and "hey" as "hi", "hay", "he", "a" or "okay", so the match is
 * loose on purpose. The name on its own also wakes Cosmo anywhere in a
 * sentence ("so Cosmo, what's my heart rate"), except the everyday words
 * "cosmos" and "cosmic", which only count after a greeting.
 */

const NAME = "(?:cosmo|cosmos|kosmo|kosmos|cozmo|kozmo|kozmos|cosimo|cosma|cosmoe|cosmo's|cosmic|kuzmo|gizmo)";
const BARE = "(?:cosmo|kosmo|cozmo|kozmo|cosimo|cosmoe|cosmo's|kuzmo)";
const CALL = new RegExp(`(?:^|\\b)(?:hey|hi|hay|he|hei|ey|hey there|okay|ok|yo|hello|oh|a)[\\s,.!-]*${NAME}\\b[\\s,.!?-]*`, "i");
const ANYWHERE = new RegExp(`\\b${BARE}\\b[\\s,.!?-]*`, "i");

export interface Wake {
  /** The wake phrase was heard. */
  woke: boolean;
  /** Whatever was said after it ("" if the astronaut only said "Hey Cosmo"). */
  command: string;
}

export function parseWake(text: string): Wake {
  const m = CALL.exec(text) ?? ANYWHERE.exec(text);
  if (!m) return { woke: false, command: text.trim() };
  const after = text.slice(m.index + m[0].length).trim();
  // "thanks, Cosmo" or "what's my heart rate Cosmo": the words come before the name
  const before = text.slice(0, m.index).replace(/[\s,.!?-]+$/, "").trim();
  return { woke: true, command: after || before };
}

/** Remove a leading wake phrase from typed or scripted lines. */
export const stripWake = (text: string) => {
  const w = parseWake(text);
  return w.woke ? w.command : text.trim();
};
