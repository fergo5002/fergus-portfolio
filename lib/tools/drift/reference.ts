import { words } from "./text";

/**
 * The reference population for the z-scores, built from whatever documents you
 * hand it.
 *
 * Burrows's Delta is a distance measured in standard deviations, and a standard
 * deviation has to be a standard deviation of something. In this tool that
 * something is the visitor's own pieces, which is the only choice that matches
 * what the page claims: "how far this draft sits from the way you write". A
 * table built from somebody else's writing would still produce a monotone
 * distance, in units of how much that other person's documents vary between
 * themselves, on a list of that other person's commonest words. It would look
 * exactly as convincing and it would be about the wrong writer.
 *
 * So this module takes documents as an argument and imports nothing but the
 * tokeniser. That is what lets it run in the browser tab over what the visitor
 * pasted, with no corpus, no articles and no server call anywhere near it.
 */

/**
 * How many markers. Burrows's own starting point is 150, which suits a corpus
 * of novels. Ten pasted pieces is not that: past roughly the hundredth rank the
 * words stop being function words and start being subject words, and a subject
 * word measures what a text is about rather than how it is written. The cap
 * also means a visitor with ten short pieces and this site's eleven articles
 * are scored on lists of the same length. A choice, not a measurement.
 */
export const MARKER_COUNT = 100;

/**
 * A marker must appear in over half the documents it was built from. Below that
 * the word's standard deviation is computed mostly from zeroes and reports an
 * accident of topic rather than a habit.
 *
 * A share rather than a count, because the visitor decides how many pieces they
 * paste and a count written for one corpus size is nonsense at another.
 * `Math.ceil(n * 0.5)` is six on eleven documents, which is what an earlier
 * draft of this tool hard-coded, and three on five.
 */
export const MIN_DOCUMENT_SHARE = 0.5;

/**
 * The fewest documents a reference may be built from before the report refuses
 * to print a Delta.
 *
 * The same argument as the 150-word floor, pointed at the population instead of
 * the text. Every sigma here is computed from exactly this many numbers, and
 * with three of them one unusual piece sets the scale for everything else, so
 * the distance would be printed in units of that accident.
 *
 * Five, because `Math.ceil(5 * MIN_DOCUMENT_SHARE)` is 3, strictly more than
 * half of five, while the same sum on four documents is 2, exactly half, which
 * filters nothing: five is the smallest count where the document rule above
 * does any work. It also leaves five leave-one-out folds behind the self-spread
 * instead of four. Guessed, not measured, and the report says the number out
 * loud when it refuses. The refusal itself lives in `report.ts`, because that
 * is where a caller reads a status.
 */
export const MIN_REFERENCE_DOCUMENTS = 5;

export type Reference = {
  /** Marker words, most frequent first. Length is at most `MARKER_COUNT`. */
  markers: string[];
  /** Mean relative frequency of each marker across the documents. */
  mean: Record<string, number>;
  /** Population standard deviation of the same. Always greater than zero. */
  sd: Record<string, number>;
  documents: number;
  totalWords: number;
};

/**
 * Build the table from a set of documents.
 *
 * Pure and memo-free on purpose: the visitor rebuilds this every time they
 * press build, and two profiles in one session must never share a table.
 */
export function buildReference(documents: string[]): Reference {
  const perDoc = documents.map((doc) => {
    const tokens = words(doc);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { counts, length: tokens.length };
  });

  const totals = new Map<string, number>();
  const seenIn = new Map<string, number>();
  for (const doc of perDoc) {
    for (const [word, count] of doc.counts) {
      totals.set(word, (totals.get(word) ?? 0) + count);
      seenIn.set(word, (seenIn.get(word) ?? 0) + 1);
    }
  }

  // Over half of however many documents there are. `Math.max(1, ...)` only
  // matters for the empty case, where there is nothing to filter anyway.
  const minDocuments = Math.max(1, Math.ceil(documents.length * MIN_DOCUMENT_SHARE));

  const ranked = [...totals.entries()]
    .filter(([word]) => (seenIn.get(word) ?? 0) >= minDocuments)
    // Ties broken alphabetically so the marker set is deterministic. A set that
    // depended on Map insertion order would make every stored profile a
    // different shape from one build to the next.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  const markers: string[] = [];
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};

  for (const word of ranked) {
    if (markers.length >= MARKER_COUNT) break;
    const rates = perDoc.map((doc) => (doc.length === 0 ? 0 : (doc.counts.get(word) ?? 0) / doc.length));
    const m = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + (b - m) * (b - m), 0) / rates.length;
    const s = Math.sqrt(variance);
    // A word that varies not at all cannot be turned into a z-score: the
    // division is by zero and every Delta downstream becomes NaN. It also
    // carries no information about who wrote anything, so dropping it costs
    // nothing.
    if (s === 0) continue;
    markers.push(word);
    mean[word] = m;
    sd[word] = s;
  }

  return {
    markers,
    mean,
    sd,
    documents: documents.length,
    totalWords: perDoc.reduce((total, doc) => total + doc.length, 0),
  };
}
