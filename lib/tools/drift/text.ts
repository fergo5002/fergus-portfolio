/**
 * What counts as a word, and what counts as a sentence.
 *
 * One module owns both, because every number this tool prints is a ratio over
 * one of them. Two modules with two slightly different tokenisers would produce
 * a Delta, a rhythm and a substitution count that quietly disagree, and nothing
 * would fail.
 *
 * Numbers are dropped on purpose. People paste whatever they have to hand, and
 * a piece carrying a table, a changelog or a run of figures would push every
 * relative frequency down without saying anything about how anybody writes.
 * Same reasoning for the worked example's corpus, several of this site's
 * articles being mostly tables.
 *
 * Each function builds its own regular expression rather than sharing a
 * module-level one. A regex literal evaluated inside a function body is a fresh
 * object per call, so `lastIndex` cannot leak between calls: `lib/markdown.ts`
 * builds its inline regex the same way and for the same reason.
 */

/** One sentence, with its words already tokenised and its offset in the source. */
export type Sentence = {
  /** The sentence, trimmed. */
  text: string;
  /** Its words, lowercased, per `words`. */
  words: string[];
  /** Index of its first character in the text it came from. */
  start: number;
};

/**
 * Words, lowercased, apostrophes kept inside a word and normalised to the
 * straight one so "don't" and "don’t" are the same token.
 */
export function words(text: string): string[] {
  const re = /\p{L}+(?:['’]\p{L}+)*/gu;
  const out: string[] = [];
  for (const m of text.matchAll(re)) out.push(m[0].toLowerCase().replace(/’/g, "'"));
  return out;
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Sentences, split on a run of terminators plus any closing quote or bracket.
 *
 * Naive about abbreviations: "Dr. Byrne" is two sentences to this. Fixing that
 * needs an abbreviation dictionary, and the tool would rather print the limit
 * on the page than ship a half-dictionary that is wrong in a different way.
 */
export function sentences(text: string): Sentence[] {
  const re = /[^.!?]+(?:[.!?]+["'’)\]]*|$)/gu;
  const out: Sentence[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const lead = raw.length - raw.trimStart().length;
    out.push({ text: trimmed, words: words(trimmed), start: (m.index ?? 0) + lead });
  }
  return out;
}

/**
 * The visitor's samples, separated by a line of three or more dashes.
 *
 * One text area rather than a growing list of them, because on a 320px screen a
 * list of ten text areas is a scroll marathon, and because a separator is
 * something a person can paste. The separator is stated in the label.
 */
export function splitPieces(text: string): string[] {
  return text
    .split(/^\s*-{3,}\s*$/m)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}
