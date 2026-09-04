import type { Reference } from "./reference";
import { profileOf, relativeFrequencies, zScores, type VoiceProfile } from "./profile";
import { words } from "./text";

/**
 * Burrows's Delta.
 *
 * For a marker set M with reference mean mu(w) and standard deviation sigma(w)
 * taken across the reference population's documents, which in this tool are the
 * visitor's own pieces:
 *
 *     f(w, t)     = count of w in t / total words in t
 *     z(w, t)     = (f(w, t) - mu(w)) / sigma(w)
 *     Delta(a, b) = (1 / |M|) * sum over w in M of |z(w, a) - z(w, b)|
 *
 * It is a distance and not a verdict. Two texts with a small Delta use the
 * commonest words at similar rates. That is the whole claim. It says nothing
 * about who wrote either one, nothing about whether either is any good, and
 * nothing whatsoever about meaning.
 *
 * The unit matters as much as the number. Because the reference is built from
 * the visitor's own pieces, a Delta of 1.9 means "1.9 of your own between-piece
 * standard deviations", and the self-spread below prints what their own pieces
 * score so the 1.9 has something to sit beside. Feed this the same draft with a
 * table built from somebody else's writing and the arithmetic still runs, still
 * looks convincing, and answers a question nobody asked.
 */

/**
 * The floor.
 *
 * A conservative refusal threshold, not a calibrated boundary. Marker counts
 * are sparse in short drafts, so the tool refuses to print a distance below
 * this value and says that the value is an explicit design choice.
 */
export const MIN_DELTA_WORDS = 150;

/** Mean absolute difference between two z-score vectors over the markers. */
export function delta(
  a: Record<string, number>,
  b: Record<string, number>,
  markers: string[],
): number {
  if (markers.length === 0) return 0;
  let total = 0;
  for (const marker of markers) total += Math.abs((a[marker] ?? 0) - (b[marker] ?? 0));
  return total / markers.length;
}

/** The distance from a profile to one draft. */
export function deltaOf(profile: VoiceProfile, draft: string, ref: Reference): number {
  const z = zScores(relativeFrequencies(words(draft), ref.markers), ref);
  return delta(profile.z, z, ref.markers);
}

export type SelfSpread = {
  /** How many samples were long enough to take part. */
  pieces: number;
  min: number;
  median: number;
  max: number;
};

/**
 * How far the visitor's own pieces sit from each other.
 *
 * This exists so the tool never has to invent a threshold. A calibrated band
 * ("over 1.5 means it is not you") would need a measurement nobody here has
 * taken, and printing one would be exactly the unearned confidence this whole
 * tool argues against. Instead: leave one piece out, build a profile from the
 * rest, measure the piece against it, and repeat. The result is the range their
 * own writing already occupies, and the draft's Delta is printed beside it.
 * That comparison is the whole reason the reference is theirs: "your own ten
 * pieces sit 0.62 apart on average and this draft sits 1.94 away" is a sentence
 * about one person, in one set of units, and it stops being one the moment the
 * yardstick comes from somewhere else.
 *
 * `ref` is passed in and used for every fold rather than rebuilt from the
 * remaining pieces each time. Rebuilding would give each fold its own marker
 * set and its own sigma, and a min, a median and a max taken across different
 * yardsticks is not a range of anything. The cost is that each held-out piece
 * helped build the table it is then measured against, so the spread runs a
 * little tight, and a draft will look slightly further out than it is. Stated
 * here, and in the ledger's "not verified" list, rather than smoothed over.
 *
 * Samples under the floor are dropped rather than measured, and fewer than two
 * survivors returns null, because a range needs two points. This function does
 * not check `MIN_REFERENCE_DOCUMENTS`: it answers a question about the pieces
 * it was handed, and whether that answer is fit to print is `analyse`'s call.
 */
export function selfSpread(pieces: string[], ref: Reference): SelfSpread | null {
  const usable = pieces.filter((piece) => words(piece).length >= MIN_DELTA_WORDS);
  if (usable.length < 2) return null;

  const values: number[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    const rest = usable.filter((_, j) => j !== i);
    values.push(deltaOf(profileOf(rest, ref), usable[i], ref));
  }
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  return { pieces: usable.length, min: values[0], median, max: values[values.length - 1] };
}
