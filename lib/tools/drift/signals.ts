import { sentences, words } from "./text";

/**
 * The three habits that are not Burrows's Delta.
 *
 * A Delta is a single number about word frequencies. These are the parts of a
 * voice a reader would actually name: how long the sentences are and how much
 * they vary, which marks somebody reaches for, and whether they start sentences
 * with a conjunction. None of them needs a reference population, so none of
 * them takes one, and all of them are testable on two sentences.
 *
 * Everything is a rate rather than a count, so a profile and a draft of very
 * different lengths compare. Punctuation is per thousand words; buckets and
 * joins are shares of the sentences.
 */

/** Upper bounds, in words, of the first four sentence-length buckets. */
export const BUCKET_EDGES = [8, 16, 24, 32] as const;

export type Rhythm = {
  sentences: number;
  meanWords: number;
  /** Population standard deviation. One sentence has none, and that is 0, not NaN. */
  sdWords: number;
  /** Shares, one per bucket, `BUCKET_EDGES.length + 1` of them, summing to 1. */
  buckets: number[];
};

export type Punctuation = {
  emDash: number;
  enDash: number;
  semicolon: number;
  exclamation: number;
  question: number;
  parenthetical: number;
  contraction: number;
};

export type Joins = { and: number; but: number; so: number; any: number };

export function rhythmOf(text: string): Rhythm {
  const lengths = sentences(text)
    .map((s) => s.words.length)
    .filter((n) => n > 0);
  const buckets = new Array<number>(BUCKET_EDGES.length + 1).fill(0);
  const n = lengths.length;
  if (n === 0) return { sentences: 0, meanWords: 0, sdWords: 0, buckets };

  const mean = lengths.reduce((a, b) => a + b, 0) / n;
  const variance = lengths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  for (const length of lengths) {
    const found = BUCKET_EDGES.findIndex((edge) => length <= edge);
    buckets[found === -1 ? BUCKET_EDGES.length : found] += 1;
  }
  return {
    sentences: n,
    meanWords: mean,
    sdWords: Math.sqrt(variance),
    buckets: buckets.map((count) => count / n),
  };
}

export function punctuationOf(text: string): Punctuation {
  const total = words(text).length;
  const per = (count: number) => (total === 0 ? 0 : (count * 1000) / total);
  const count = (re: RegExp) => [...text.matchAll(re)].length;
  return {
    emDash: per(count(/\u2014/g)),
    enDash: per(count(/\u2013/g)),
    semicolon: per(count(/;/g)),
    exclamation: per(count(/!/g)),
    question: per(count(/\?/g)),
    // A pair counts once. Counting brackets would double every parenthesis and
    // make an unclosed one look like a habit.
    parenthetical: per(count(/\([^)]*\)/g)),
    contraction: per(count(/\p{L}+['’](?:t|s|d|ll|ve|re|m)\b/giu)),
  };
}

export function joinsOf(text: string): Joins {
  const list = sentences(text);
  const n = list.length;
  if (n === 0) return { and: 0, but: 0, so: 0, any: 0 };
  let and = 0;
  let but = 0;
  let so = 0;
  for (const sentence of list) {
    const first = sentence.words[0];
    if (first === "and") and += 1;
    else if (first === "but") but += 1;
    else if (first === "so") so += 1;
  }
  return { and: and / n, but: but / n, so: so / n, any: (and + but + so) / n };
}

/**
 * Raw em dashes, not a rate.
 *
 * This is the one signal the tool still prints under the word floor, because
 * two em dashes are two em dashes in a text of any length. A rate over
 * forty words would be a statistic, and statistics are what the floor refuses.
 */
export function countEmDashes(text: string): number {
  return [...text.matchAll(/\u2014/g)].length;
}
