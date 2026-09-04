import type { Reference } from "./reference";
import { joinsOf, punctuationOf, rhythmOf, type Joins, type Punctuation, type Rhythm } from "./signals";
import { countPairs, type PairCounts } from "./substitutions";
import { words } from "./text";

/**
 * A voice profile: everything the tool knows about how somebody writes.
 *
 * The reference table arrives as an argument and this module never asks where
 * it came from. In the tool it came from the visitor's own pieces, built in
 * their tab a few lines earlier; in the worked example it came from this site's
 * articles at build time. Same function either way, and that is the whole point
 * of taking it as a parameter.
 *
 * A profile holds no prose. `freq` and `z` are keyed by the marker words, which
 * are the visitor's own hundred commonest words, and `pairs` is forty-four
 * counters over the fixed substitution table. So there are words in a saved
 * profile: single words, each with a number beside it, in frequency order and
 * never in the order anybody wrote them. There is no sentence in it and no way
 * back to one, and `lib/tools/drift/storage.test.ts` walks the serialised
 * object and proves it rather than asserting it in a comment.
 */

export const PROFILE_VERSION = 1;

/**
 * A conservative warning threshold, not a calibrated boundary. Sparse marker
 * counts become more likely as a profile gets shorter; this value was chosen
 * from the expected behaviour of Delta and has not been measured on visitors.
 */
export const MIN_PROFILE_WORDS = 1000;

export type VoiceProfile = {
  version: typeof PROFILE_VERSION;
  /** How many samples went in. */
  pieces: number;
  /** Total words across them. */
  words: number;
  /** Relative frequency of each reference marker. */
  freq: Record<string, number>;
  /** The same, as z-scores against the reference population. */
  z: Record<string, number>;
  rhythm: Rhythm;
  punctuation: Punctuation;
  joins: Joins;
  pairs: PairCounts;
};

export function relativeFrequencies(tokens: string[], markers: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const marker of markers) {
    out[marker] = tokens.length === 0 ? 0 : (counts.get(marker) ?? 0) / tokens.length;
  }
  return out;
}

export function zScores(freq: Record<string, number>, ref: Reference): Record<string, number> {
  const out: Record<string, number> = {};
  for (const marker of ref.markers) {
    out[marker] = ((freq[marker] ?? 0) - ref.mean[marker]) / ref.sd[marker];
  }
  return out;
}

/**
 * Build a profile from the visitor's samples.
 *
 * The samples are pooled, not averaged. Ten short pieces averaged piece by
 * piece is the mean of ten noisy vectors; the same ten concatenated is one
 * vector with ten times the counts behind it, and that is the steadier of the
 * two by a long way.
 */
export function profileOf(pieces: string[], ref: Reference): VoiceProfile {
  const used = pieces.filter((piece) => piece.trim().length > 0);
  const text = used.join("\n\n");
  const tokens = words(text);
  const freq = relativeFrequencies(tokens, ref.markers);
  return {
    version: PROFILE_VERSION,
    pieces: used.length,
    words: tokens.length,
    freq,
    z: zScores(freq, ref),
    rhythm: rhythmOf(text),
    punctuation: punctuationOf(text),
    joins: joinsOf(text),
    pairs: countPairs(text),
  };
}
