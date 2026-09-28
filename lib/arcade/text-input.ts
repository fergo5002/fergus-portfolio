/**
 * What a typing game hears from the room's text input.
 *
 * The room never reads keydown for text. A phone keyboard does not send keys:
 * Android reports most characters as keydown "Unidentified" with keyCode 229,
 * and a composing keyboard (GBoard, iOS predictive text) replaces a whole word
 * in one input event. The one thing every keyboard agrees on is the field's
 * value, so the room keeps the value it last saw, and on each input event the
 * difference between the two becomes presses: an `erase` for every character
 * taken off the end, then a `char:<c>` for every character added.
 *
 * Comparing from the start of the string is enough because a game's input is
 * one short word: the caret is at the end, and a correction rewrites the tail.
 */

export type InputDiff = { erase: number; insert: string };

/** The most presses one input event may send. A paste is not a thousand keystrokes. */
export const MAX_PRESSES = 64;

export function diffInput(before: string, after: string): InputDiff {
  const a = [...before], b = [...after];
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  return { erase: a.length - same, insert: b.slice(same).join("") };
}

export function pressesFor(diff: InputDiff): string[] {
  const out: string[] = [];
  for (let i = 0; i < diff.erase && out.length < MAX_PRESSES; i++) out.push("erase");
  for (const c of diff.insert) {
    if (out.length >= MAX_PRESSES) break;
    out.push(`char:${c.toLowerCase()}`);
  }
  return out;
}
