import { MIN_REFERENCE_DOCUMENTS, type Reference } from "./reference";
import { MIN_DELTA_WORDS, deltaOf, type SelfSpread } from "./delta";
import { relativeFrequencies, zScores, type VoiceProfile } from "./profile";
import { BUCKET_EDGES, countEmDashes, joinsOf, punctuationOf, rhythmOf } from "./signals";
import { PAIRS, substitutionsFrom, type Substitution } from "./substitutions";
import { sentences, wordCount, words } from "./text";

/**
 * One measurement of one draft against one voice profile.
 *
 * The two floors are the important part, and they are not the same refusal.
 *
 * Under `MIN_DELTA_WORDS` the DRAFT is too short, so everything that divides by
 * its length goes with the distance and `status` is "too-short". What still
 * comes back is the two things that are counts rather than statistics, em
 * dashes and substitution hits, because two em dashes are two em dashes in a
 * text of any length and refusing to say so would be pedantry rather than
 * rigour.
 *
 * Under `MIN_REFERENCE_DOCUMENTS` the POPULATION is too thin, so what goes is
 * everything computed through a z-score: the Delta, the leave-one-out spread
 * and the sentence attribution. `status` is "thin-reference". The rhythm,
 * punctuation and join rows survive, because none of them ever needed a
 * reference population, and a visitor with three pieces should still see their
 * own habits beside the draft's. What they must not see is a number claiming to
 * be in units of their own variation when three numbers went into that sigma.
 *
 * The word floor is checked first, because it refuses strictly more.
 *
 * An empty marker set gets the same "thin-reference" status, because `delta`
 * over no markers returns 0 and a distance of zero on a page reads as
 * "identical". A number that cannot fail is not a measurement.
 *
 * The shape is nullable fields rather than a discriminated union so that one
 * object serialises to JSON for the MCP twin and renders in one component
 * without a branch per field. `status` is still the thing to read first, and
 * the tests pin what is empty under each of the two refusals.
 */

/** Every metric row the report can emit, in the order it prints them. */
export const METRIC_KEYS = [
  "sentence-mean",
  "sentence-sd",
  "short-sentences",
  "long-sentences",
  "em-dash",
  "en-dash",
  "semicolon",
  "exclamation",
  "question",
  "parenthetical",
  "contraction",
  "join-and",
  "join-but",
  "join-so",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/** Bucket labels, derived from the edges so a change to one changes both. */
export const BUCKET_KEYS: string[] = [
  ...BUCKET_EDGES.map((edge, i) => `${i === 0 ? 1 : BUCKET_EDGES[i - 1] + 1}-${edge}`),
  `${BUCKET_EDGES[BUCKET_EDGES.length - 1] + 1}+`,
];

export type MetricRow = { key: MetricKey; profile: number; draft: number };
export type ShapeRow = { key: string; profile: number; draft: number };

export type PullReason = "em-dash" | "substitution" | "long";

export type SentencePull = {
  /** Position in the draft, so the page can point at it. */
  index: number;
  text: string;
  pull: number;
  reasons: PullReason[];
};

/**
 * What the yardstick was made of, so the page and the MCP twin can both say it
 * without either of them carrying the table.
 */
export type ReferenceSummary = {
  /** How many separate pieces the population was built from. */
  documents: number;
  /** How many marker words survived both filters. */
  markers: number;
  totalWords: number;
};

export type DriftReport = {
  status: "ok" | "too-short" | "thin-reference";
  words: number;
  /** The word floor for the draft. */
  floor: number;
  /** The document floor for the population. */
  documentFloor: number;
  reference: ReferenceSummary;
  /** A count, printed at any length. */
  emDashes: number;
  /** Counts, printed at any length. */
  substitutions: Substitution[];
  delta: number | null;
  selfSpread: SelfSpread | null;
  metrics: MetricRow[];
  shape: ShapeRow[];
  pulls: SentencePull[];
};

/**
 * Which sentences carry the drift.
 *
 * Not a Delta per sentence. A sentence is far too short for one, and printing a
 * per-sentence Delta would be the exact error this tool exists to argue
 * against. This attributes the whole-text gap instead: for each marker, take
 * the signed gap between the draft's z-score and the profile's, keep only the
 * positive ones (the words the draft uses **more**), and give each sentence the
 * sum of those contributions over the marker words it contains.
 *
 * The sign matters. A word the draft underuses cannot be blamed on a sentence
 * that happens to contain it; the absence lives in the sentences that do not,
 * which is not a sentence-level fact at all. Taking the absolute value here
 * would list innocent sentences and read convincing while doing it.
 *
 * `reasons` are separate from `pull` on purpose: they are flags, not scores,
 * and mixing them into one number would invent a unit. The `substitution` flag
 * only catches single-word formal forms, so "prior to" is missed here while
 * still appearing in the report's substitution rows.
 */
export function sentencePulls(
  profile: VoiceProfile,
  draft: string,
  ref: Reference,
  limit = 5,
): SentencePull[] {
  const draftZ = zScores(relativeFrequencies(words(draft), ref.markers), ref);
  const over: Record<string, number> = {};
  for (const marker of ref.markers) {
    const gap = draftZ[marker] - profile.z[marker];
    if (gap > 0) over[marker] = gap / ref.markers.length;
  }

  const formal = new Set(PAIRS.flatMap((pair) => pair.formal).filter((form) => !form.includes(" ")));
  const longFloor = profile.rhythm.meanWords + 2 * profile.rhythm.sdWords;

  return sentences(draft)
    .map((sentence, index) => {
      let pull = 0;
      for (const word of sentence.words) pull += over[word] ?? 0;
      const reasons: PullReason[] = [];
      if (sentence.text.includes("\u2014")) reasons.push("em-dash");
      if (sentence.words.some((word) => formal.has(word))) reasons.push("substitution");
      if (profile.rhythm.sentences > 0 && sentence.words.length > longFloor) reasons.push("long");
      return { index, text: sentence.text, pull, reasons };
    })
    .filter((sentence) => sentence.pull > 0 || sentence.reasons.length > 0)
    .sort((a, b) => b.pull - a.pull || a.index - b.index)
    .slice(0, limit);
}

export function analyse(
  profile: VoiceProfile,
  draft: string,
  ref: Reference,
  spread: SelfSpread | null = null,
): DriftReport {
  const count = wordCount(draft);
  const base = {
    words: count,
    floor: MIN_DELTA_WORDS,
    documentFloor: MIN_REFERENCE_DOCUMENTS,
    reference: {
      documents: ref.documents,
      markers: ref.markers.length,
      totalWords: ref.totalWords,
    },
    emDashes: countEmDashes(draft),
    substitutions: substitutionsFrom(profile.pairs, draft),
  };

  if (count < MIN_DELTA_WORDS) {
    return {
      ...base,
      status: "too-short",
      delta: null,
      selfSpread: null,
      metrics: [],
      shape: [],
      pulls: [],
    };
  }

  const rhythm = rhythmOf(draft);
  const punctuation = punctuationOf(draft);
  const joins = joinsOf(draft);
  const last = profile.rhythm.buckets.length - 1;

  const metrics: MetricRow[] = [
    { key: "sentence-mean", profile: profile.rhythm.meanWords, draft: rhythm.meanWords },
    { key: "sentence-sd", profile: profile.rhythm.sdWords, draft: rhythm.sdWords },
    { key: "short-sentences", profile: profile.rhythm.buckets[0], draft: rhythm.buckets[0] },
    { key: "long-sentences", profile: profile.rhythm.buckets[last], draft: rhythm.buckets[last] },
    { key: "em-dash", profile: profile.punctuation.emDash, draft: punctuation.emDash },
    { key: "en-dash", profile: profile.punctuation.enDash, draft: punctuation.enDash },
    { key: "semicolon", profile: profile.punctuation.semicolon, draft: punctuation.semicolon },
    { key: "exclamation", profile: profile.punctuation.exclamation, draft: punctuation.exclamation },
    { key: "question", profile: profile.punctuation.question, draft: punctuation.question },
    { key: "parenthetical", profile: profile.punctuation.parenthetical, draft: punctuation.parenthetical },
    { key: "contraction", profile: profile.punctuation.contraction, draft: punctuation.contraction },
    { key: "join-and", profile: profile.joins.and, draft: joins.and },
    { key: "join-but", profile: profile.joins.but, draft: joins.but },
    { key: "join-so", profile: profile.joins.so, draft: joins.so },
  ];

  const shape: ShapeRow[] = BUCKET_KEYS.map((key, i) => ({
    key,
    profile: profile.rhythm.buckets[i] ?? 0,
    draft: rhythm.buckets[i] ?? 0,
  }));

  // The population, not the draft. Everything above this line is a rate over a
  // length and stands on its own; everything below it is a z-score, and a
  // z-score from four documents is a number about one of those four.
  if (ref.documents < MIN_REFERENCE_DOCUMENTS || ref.markers.length === 0) {
    return {
      ...base,
      status: "thin-reference",
      delta: null,
      selfSpread: null,
      metrics,
      shape,
      pulls: [],
    };
  }

  return {
    ...base,
    status: "ok",
    delta: deltaOf(profile, draft, ref),
    selfSpread: spread,
    metrics,
    shape,
    pulls: sentencePulls(profile, draft, ref),
  };
}
