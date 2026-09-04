import { words } from "./text";

/**
 * The substitutions the visitor's own corpus suggests.
 *
 * No thesaurus, no model, no network. A fixed table of the pairs that actually
 * matter, each side written out as explicit forms, because the alternatives are
 * a stemmer (a dependency and a guess about morphology) and an API call (which
 * would break the promise on the page that nothing leaves the tab).
 *
 * The table on its own would be a lecture. What makes a row evidence is the
 * visitor's own frequency: it is printed only when the draft uses the formal
 * word, their corpus uses it zero times, and their corpus uses the plain word
 * at least once. All three, every time.
 *
 * The table is fixed, so these forty-four counters are the one part of a saved
 * profile that does not depend on what the visitor writes about. The rest of it
 * is keyed by their own marker words; `lib/tools/drift/storage.ts` says exactly
 * what that means and tests it.
 *
 * Adding a pair is one entry here and one row in the test. It cannot find a
 * substitution that is not in this list, and the page says so.
 */

export type Pair = {
  /** The first formal form, hyphenated. Used as the report row's key. */
  id: string;
  /** The forms to look for in the draft. First one is the display form. */
  formal: string[];
  /** The forms that count as evidence the writer says it plainly. */
  plain: string[];
};

export const PAIRS: Pair[] = [
  { id: "utilise", formal: ["utilise", "utilises", "utilised", "utilising", "utilize", "utilizes", "utilized", "utilizing"], plain: ["use", "uses", "used", "using"] },
  { id: "leverage", formal: ["leverage", "leverages", "leveraged", "leveraging"], plain: ["help", "helps", "helped", "helping"] },
  { id: "commence", formal: ["commence", "commences", "commenced", "commencing"], plain: ["start", "starts", "started", "starting"] },
  { id: "regarding", formal: ["regarding", "concerning"], plain: ["about"] },
  { id: "delve", formal: ["delve", "delves", "delved", "delving"], plain: ["dig", "digs", "dug", "digging"] },
  { id: "seamless", formal: ["seamless", "seamlessly"], plain: ["smooth", "smoothly"] },
  { id: "robust", formal: ["robust"], plain: ["solid", "sturdy"] },
  { id: "elevate", formal: ["elevate", "elevates", "elevated", "elevating"], plain: ["lift", "lifts", "lifted", "lifting"] },
  { id: "empower", formal: ["empower", "empowers", "empowered", "empowering"], plain: ["let", "lets", "letting"] },
  { id: "streamline", formal: ["streamline", "streamlines", "streamlined", "streamlining"], plain: ["simplify", "simplifies", "simplified", "simplifying"] },
  { id: "furthermore", formal: ["furthermore", "moreover"], plain: ["and", "also"] },
  { id: "thus", formal: ["thus", "hence"], plain: ["so"] },
  { id: "additionally", formal: ["additionally"], plain: ["also"] },
  { id: "numerous", formal: ["numerous"], plain: ["many", "lots"] },
  { id: "obtain", formal: ["obtain", "obtains", "obtained", "obtaining"], plain: ["get", "gets", "got", "getting"] },
  { id: "purchase", formal: ["purchase", "purchases", "purchased", "purchasing"], plain: ["buy", "buys", "bought", "buying"] },
  { id: "sufficient", formal: ["sufficient", "sufficiently"], plain: ["enough"] },
  { id: "demonstrate", formal: ["demonstrate", "demonstrates", "demonstrated", "demonstrating"], plain: ["show", "shows", "showed", "shown", "showing"] },
  { id: "facilitate", formal: ["facilitate", "facilitates", "facilitated", "facilitating"], plain: ["help", "helps", "helped", "helping"] },
  { id: "terminate", formal: ["terminate", "terminates", "terminated", "terminating"], plain: ["end", "ends", "ended", "ending"] },
  { id: "prior-to", formal: ["prior to"], plain: ["before"] },
  { id: "in-order-to", formal: ["in order to"], plain: ["to"] },
];

/** Both counts for one pair, as a saved profile stores them. */
export type PairCounts = Record<string, { formal: number; plain: number }>;

/**
 * How many times any of `forms` appears in `tokens`.
 *
 * Token scanning rather than a regular expression, for two reasons. A regex
 * with a word boundary would need a lookbehind to avoid eating the separator
 * between two adjacent hits, and lookbehind is missing from WebKit before
 * Safari 16.4, which is a real iPhone this site is meant to work on. And
 * multi-word forms ("prior to") are exact over tokens and fiddly over text.
 */
export function countForms(tokens: string[], forms: string[]): number {
  let found = 0;
  for (const form of forms) {
    const parts = form.split(" ");
    for (let i = 0; i + parts.length <= tokens.length; i += 1) {
      let hit = true;
      for (let k = 0; k < parts.length; k += 1) {
        if (tokens[i + k] !== parts[k]) {
          hit = false;
          break;
        }
      }
      if (hit) found += 1;
    }
  }
  return found;
}

/** Both sides of every pair, in one pass over the text. Always a full table. */
export function countPairs(text: string): PairCounts {
  const tokens = words(text);
  const out: PairCounts = {};
  for (const pair of PAIRS) {
    out[pair.id] = {
      formal: countForms(tokens, pair.formal),
      plain: countForms(tokens, pair.plain),
    };
  }
  return out;
}

export type Substitution = {
  id: string;
  /** The word in the draft. */
  formal: string;
  /** The word their own corpus uses instead. */
  plain: string;
  /** How many times the draft uses the formal form. */
  draftCount: number;
  /** How many times their corpus uses the plain form. The evidence. */
  profilePlain: number;
};

/**
 * The rows worth printing, most-leaned-on first.
 *
 * The `counts.formal > 0` guard is the one that keeps this honest: a writer who
 * does say "utilise" gets told nothing about "utilise".
 */
export function substitutionsFrom(pairs: PairCounts, draft: string): Substitution[] {
  const tokens = words(draft);
  const out: Substitution[] = [];
  for (const pair of PAIRS) {
    const draftCount = countForms(tokens, pair.formal);
    if (draftCount === 0) continue;
    const counts = pairs[pair.id] ?? { formal: 0, plain: 0 };
    if (counts.formal > 0) continue;
    if (counts.plain === 0) continue;
    out.push({
      id: pair.id,
      formal: pair.formal[0],
      plain: pair.plain[0],
      draftCount,
      profilePlain: counts.plain,
    });
  }
  return out.sort((a, b) => b.draftCount - a.draftCount || a.id.localeCompare(b.id));
}
