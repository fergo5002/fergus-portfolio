/**
 * Text helpers for per-character motion.
 */

export type WordSpan = {
  /** The word (or the run of whitespace) itself. */
  word: string;
  /** Index of its first character in the original string. */
  start: number;
};

/**
 * Split a string into words and whitespace runs, remembering where each begins.
 *
 * Exists because of a specific layout bug. Animating text per character requires
 * each character to be its own `inline-block`, but a flat run of inline-blocks is
 * a run of independent boxes, so the browser may break the line between any two
 * of them. On a 390px screen that rendered the hero as "Patrick Fergus O'Re /
 * illy". Grouping each word into a `white-space: nowrap` span keeps its letters
 * together and restores breaking at spaces.
 *
 * The `start` offset travels with each word so the caller can keep addressing
 * characters by their original flat index — the magnetic field in `HeroName`
 * stores one entry per character and must not care how they were grouped.
 *
 * Whitespace runs are returned as their own spans rather than being dropped, so
 * concatenating every `word` reproduces the input exactly.
 */
export function splitWordsWithOffsets(text: string): WordSpan[] {
  const out: WordSpan[] = [];
  let start = 0;
  for (const word of text.split(/(\s+)/)) {
    if (word.length > 0) out.push({ word, start });
    start += word.length;
  }
  return out;
}
