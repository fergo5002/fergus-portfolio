import { OWNED_PREFIX } from "@/lib/forget";
import type { SelfSpread } from "./delta";
import { PROFILE_VERSION, type VoiceProfile } from "./profile";
import { MARKER_COUNT, type Reference } from "./reference";
import { BUCKET_EDGES } from "./signals";
import { PAIRS } from "./substitutions";

/**
 * Saving a profile, and the promise that goes with it.
 *
 * The key is built from `OWNED_PREFIX`, never retyped, because `forget` finds
 * what it wipes by that prefix and a hand-typed literal that drifted by one
 * character would leave a key on somebody's machine that the site claims to
 * have removed. `lib/forget.test.ts` already asserts this exact key is owned.
 *
 * The reference table is saved with the profile and is not optional. A profile
 * is a set of z-scores, and a z-score is a distance from a mean in units of a
 * standard deviation: without the table that supplied both it is a column of
 * numbers with no units, and the next draft would be scored against whatever
 * table happened to be to hand. That is the same mistake as measuring a
 * stranger's draft against my articles, one layer down and harder to see.
 *
 * What this record holds, stated so the page can say the same thing: the
 * visitor's hundred commonest words with numbers beside each, the mean and
 * standard deviation of those same words across their pieces, their rhythm and
 * punctuation rates, and forty-four counters over the fixed substitution table.
 * Their own words, then, but single ones, in frequency order, never in the
 * order they were written. No sentence, and nothing to rebuild one from.
 * `storage.test.ts` walks the serialised object and holds that.
 *
 * Nothing here writes. The component writes, once, in the handler behind the
 * save button, because the constitution now says the site keeps only what the
 * visitor explicitly saved.
 *
 * `parseProfile` takes `unknown` so the browser (which has a string) and the
 * MCP tool (which has an object) validate through the same function, and it
 * returns null rather than a partly-built object: half a profile produces
 * numbers that look fine and mean nothing.
 */

export const DRIFT_PROFILE_KEY = `${OWNED_PREFIX}drift-profile`;

type RemovableStorage = Pick<Storage, "removeItem">;

/** Remove the saved profile without pretending a blocked browser complied. */
export function removeSavedProfile(storage: RemovableStorage): boolean {
  try {
    storage.removeItem(DRIFT_PROFILE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const SAVED_VERSION = 1;

export type SavedProfile = {
  version: typeof SAVED_VERSION;
  /** ISO timestamp, the only free-form string in the whole record. */
  savedAt: string;
  /** The population the profile's z-scores were computed against. Not optional. */
  reference: Reference;
  profile: VoiceProfile;
  spread: SelfSpread | null;
};

export function serialiseProfile(
  reference: Reference,
  profile: VoiceProfile,
  spread: SelfSpread | null,
  savedAt: string,
): string {
  const record: SavedProfile = { version: SAVED_VERSION, savedAt, reference, profile, spread };
  return JSON.stringify(record);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every(isFiniteNumber);
}

function hasNumbers(value: unknown, keys: string[]): boolean {
  return isObject(value) && keys.every((key) => isFiniteNumber(value[key]));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isShare(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

function isReference(value: unknown): value is Reference {
  if (!isObject(value)) return false;
  if (!hasExactKeys(value, ["markers", "mean", "sd", "documents", "totalWords"])) return false;
  if (!hasNumbers(value, ["documents", "totalWords"])) return false;
  const documents = value.documents as number;
  const totalWords = value.totalWords as number;
  if (!Number.isInteger(documents) || documents < 0) return false;
  if (!Number.isInteger(totalWords) || totalWords < 0) return false;
  if (!Array.isArray(value.markers)) return false;
  if (!value.markers.every((m) => typeof m === "string" && /^\p{L}+(?:'\p{L}+)*$/u.test(m))) return false;
  if (value.markers.length > MARKER_COUNT) return false;
  if (new Set(value.markers).size !== value.markers.length) return false;
  if (!isNumberRecord(value.mean) || !isNumberRecord(value.sd)) return false;
  const mean = value.mean as Record<string, number>;
  const sd = value.sd as Record<string, number>;
  const markers = value.markers as string[];
  if (!hasExactKeys(mean, markers) || !hasExactKeys(sd, markers)) return false;
  // Every marker needs both statistics, and a standard deviation of zero is a
  // division by zero in every z-score downstream. `buildReference` drops those,
  // so a table carrying one did not come out of it and is not to be trusted.
  return markers.every((marker) =>
    isFiniteNumber(mean[marker]) && mean[marker] >= 0 && mean[marker] <= 1 &&
    isFiniteNumber(sd[marker]) && sd[marker] > 0 && sd[marker] <= 0.5,
  );
}

function isProfile(value: unknown, reference: Reference): value is VoiceProfile {
  if (!isObject(value)) return false;
  if (!hasExactKeys(value, ["version", "pieces", "words", "freq", "z", "rhythm", "punctuation", "joins", "pairs"])) return false;
  if (value.version !== PROFILE_VERSION) return false;
  if (!hasNumbers(value, ["pieces", "words"])) return false;
  const pieces = value.pieces as number;
  const wordTotal = value.words as number;
  if (!Number.isInteger(pieces) || pieces < 0 || pieces !== reference.documents) return false;
  if (!Number.isInteger(wordTotal) || wordTotal < 0 || wordTotal !== reference.totalWords) return false;
  if (!isNumberRecord(value.freq) || !isNumberRecord(value.z)) return false;
  if (!hasExactKeys(value.freq, reference.markers) || !hasExactKeys(value.z, reference.markers)) return false;
  for (const marker of reference.markers) {
    const frequency = value.freq[marker];
    const score = value.z[marker];
    if (!isFiniteNumber(frequency) || frequency < 0 || frequency > 1 || !isFiniteNumber(score)) return false;
    const expected = (frequency - reference.mean[marker]) / reference.sd[marker];
    const tolerance = 1e-10 * Math.max(1, Math.abs(expected));
    if (Math.abs(score - expected) > tolerance) return false;
  }
  const rhythm = value.rhythm;
  if (!hasNumbers(rhythm, ["sentences", "meanWords", "sdWords"])) return false;
  if (!isObject(rhythm) || !Array.isArray(rhythm.buckets) || !rhythm.buckets.every(isFiniteNumber)) {
    return false;
  }
  if (!hasExactKeys(rhythm, ["sentences", "meanWords", "sdWords", "buckets"])) return false;
  if (rhythm.buckets.length !== BUCKET_EDGES.length + 1) return false;
  const sentences = rhythm.sentences as number;
  const meanWords = rhythm.meanWords as number;
  const sdWords = rhythm.sdWords as number;
  if (!Number.isInteger(sentences) || sentences < 0 || meanWords < 0 || sdWords < 0) return false;
  if ((sentences === 0) !== (meanWords === 0)) return false;
  if (sentences === 0 && sdWords !== 0) return false;
  if (sentences > wordTotal || (sentences > 0 && !nearlyEqual(meanWords, wordTotal / sentences))) {
    return false;
  }
  if (!rhythm.buckets.every(isShare)) return false;
  const bucketTotal = rhythm.buckets.reduce((total, bucket) => total + bucket, 0);
  if (!nearlyEqual(bucketTotal, sentences === 0 ? 0 : 1)) return false;
  const punctuation = ["emDash", "enDash", "semicolon", "exclamation", "question", "parenthetical", "contraction"];
  if (!hasNumbers(value.punctuation, punctuation)) return false;
  if (!isObject(value.punctuation) || !hasExactKeys(value.punctuation, punctuation)) return false;
  if (!Object.values(value.punctuation).every((rate) => isFiniteNumber(rate) && rate >= 0)) return false;
  const joinKeys = ["and", "but", "so", "any"] as const;
  if (!hasNumbers(value.joins, [...joinKeys]) || !isObject(value.joins)) return false;
  if (!hasExactKeys(value.joins, joinKeys) || !Object.values(value.joins).every(isShare)) return false;
  const joins = value.joins as Record<(typeof joinKeys)[number], number>;
  if (!nearlyEqual(joins.any, joins.and + joins.but + joins.so)) return false;
  if (!isObject(value.pairs)) return false;
  const pairs = value.pairs;
  if (!hasExactKeys(pairs, PAIRS.map((pair) => pair.id))) return false;
  return PAIRS.every((pair) => {
    const counts = pairs[pair.id];
    if (!isObject(counts) || !hasNumbers(counts, ["formal", "plain"])) return false;
    if (!hasExactKeys(counts, ["formal", "plain"])) return false;
    const formal = counts.formal as number;
    const plain = counts.plain as number;
    return Number.isInteger(formal) && formal >= 0 && formal <= wordTotal &&
      Number.isInteger(plain) && plain >= 0 && plain <= wordTotal;
  });
}

function isSpread(value: unknown, reference?: Reference): value is SelfSpread {
  if (!isObject(value) || !hasNumbers(value, ["pieces", "min", "median", "max"])) return false;
  if (!hasExactKeys(value, ["pieces", "min", "median", "max"])) return false;
  const pieces = value.pieces as number;
  const min = value.min as number;
  const median = value.median as number;
  const max = value.max as number;
  return Number.isInteger(pieces) && pieces >= 2 &&
    (reference === undefined || pieces <= reference.documents) &&
    min >= 0 && min <= median && median <= max;
}

export function parseProfile(value: unknown): SavedProfile | null {
  let decoded: unknown = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isObject(decoded)) return null;
  if (!hasExactKeys(decoded, ["version", "savedAt", "reference", "profile", "spread"])) return null;
  if (decoded.version !== SAVED_VERSION) return null;
  if (typeof decoded.savedAt !== "string") return null;
  const savedAt = new Date(decoded.savedAt);
  if (Number.isNaN(savedAt.valueOf()) || savedAt.toISOString() !== decoded.savedAt) return null;
  if (!isReference(decoded.reference)) return null;
  if (!isProfile(decoded.profile, decoded.reference)) return null;
  if (decoded.spread !== null && !isSpread(decoded.spread, decoded.reference)) {
    return null;
  }
  return {
    version: SAVED_VERSION,
    savedAt: decoded.savedAt,
    reference: decoded.reference,
    profile: decoded.profile,
    spread: isSpread(decoded.spread, decoded.reference) ? decoded.spread : null,
  };
}
