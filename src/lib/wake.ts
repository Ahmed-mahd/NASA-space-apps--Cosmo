/**
 * "Hey Cosmo" detection on the speech recognizer's text.
 *
 * Chrome's recognizer often hears the name as "cosmos", "kosmo", "cozmo" or
 * "cosimo", and "hey" as "hi", "hay", "a" or "okay", so the match is loose on
 * purpose. A bare "Cosmo, ..." at the start of a sentence also wakes it.
 */

const NAME = "(?:cosmo|cosmos|kosmo|kosmos|cozmo|kozmo|cosimo|cosma|cosmoe|cosmo's|cosmic)";
const CALL = new RegExp(`(?:^|\\b)(?:hey|hi|hay|hey there|okay|ok|yo|hello|a)[\\s,.!-]*${NAME}\\b[\\s,.!?-]*`, "i");
const LEAD = new RegExp(`^\\s*${NAME}\\b[\\s,.!?-]*`, "i");

export interface Wake {
  /** The wake phrase was heard. */
  woke: boolean;
  /** Whatever was said after it ("" if the astronaut only said "Hey Cosmo"). */
  command: string;
}

export function parseWake(text: string): Wake {
  const m = CALL.exec(text) ?? LEAD.exec(text);
  if (!m) return { woke: false, command: text.trim() };
  return { woke: true, command: text.slice(m.index + m[0].length).trim() };
}

/** Remove a leading wake phrase from typed or scripted lines. */
export const stripWake = (text: string) => {
  const w = parseWake(text);
  return w.woke ? w.command : text.trim();
};
