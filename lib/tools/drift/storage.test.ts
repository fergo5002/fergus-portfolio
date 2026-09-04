import { describe, it, expect } from "vitest";
import { OWNED_PREFIX, isOwnedKey } from "@/lib/forget";
import { buildReference } from "./reference";
import { profileOf } from "./profile";
import { DRIFT_PROFILE_KEY, parseProfile, serialiseProfile } from "./storage";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const pieces = [doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)];
const ref = buildReference(pieces);
const profile = profileOf(pieces, ref);
const spread = { pieces: 2, min: 0.1, median: 0.2, max: 0.3 };
const saved = serialiseProfile(ref, profile, spread, "2026-09-03T12:00:00.000Z");

describe("the key", () => {
  it("is the one forget already knows about", () => {
    expect(DRIFT_PROFILE_KEY).toBe(`${OWNED_PREFIX}drift-profile`);
    expect(isOwnedKey(DRIFT_PROFILE_KEY)).toBe(true);
  });
});

describe("round trip", () => {
  it("parses back to the same numbers from the string", () => {
    const back = parseProfile(saved);
    expect(back?.profile.freq).toEqual(profile.freq);
    expect(back?.profile.z).toEqual(profile.z);
    expect(back?.spread).toEqual(spread);
    expect(back?.savedAt).toBe("2026-09-03T12:00:00.000Z");
  });

  it("carries the reference the z-scores were computed against", () => {
    // Without this the saved z-scores have no units and the next draft would be
    // scored against whatever table happened to be to hand.
    const back = parseProfile(saved);
    expect(back?.reference.markers).toEqual(ref.markers);
    expect(back?.reference.mean).toEqual(ref.mean);
    expect(back?.reference.sd).toEqual(ref.sd);
    expect(back?.reference.documents).toBe(6);
  });

  it("parses an already-decoded object, which is how the MCP tool is handed one", () => {
    expect(parseProfile(JSON.parse(saved))?.profile.words).toBe(profile.words);
  });

  it("accepts a profile with no spread", () => {
    expect(parseProfile(serialiseProfile(ref, profile, null, "2026-09-03T12:00:00.000Z"))?.spread).toBeNull();
  });
});

describe("refusals", () => {
  const cases: [string, unknown][] = [
    ["not JSON at all", "{{{"],
    ["not an object", 42],
    ["null", null],
    ["a wrong envelope version", { ...JSON.parse(saved), version: 2 }],
    ["a wrong profile version", { ...JSON.parse(saved), profile: { ...profile, version: 9 } }],
    ["a missing savedAt", { ...JSON.parse(saved), savedAt: undefined }],
    ["a non-numeric frequency", { ...JSON.parse(saved), profile: { ...profile, freq: { and: "lots" } } }],
    ["a NaN z-score", { ...JSON.parse(saved), profile: { ...profile, z: { and: Number.NaN } } }],
    ["a missing rhythm", { ...JSON.parse(saved), profile: { ...profile, rhythm: undefined } }],
    ["buckets that are not numbers", { ...JSON.parse(saved), profile: { ...profile, rhythm: { ...profile.rhythm, buckets: ["a"] } } }],
    ["a malformed pair count", { ...JSON.parse(saved), profile: { ...profile, pairs: { utilise: { formal: 1 } } } }],
    ["no reference at all", { ...JSON.parse(saved), reference: undefined }],
    ["a reference with no marker list", { ...JSON.parse(saved), reference: { ...ref, markers: "the and" } }],
    ["a reference missing a marker's sd", { ...JSON.parse(saved), reference: { ...ref, sd: {} } }],
    ["a reference with a zero sd, which is a division by zero downstream", {
      ...JSON.parse(saved),
      reference: { ...ref, sd: Object.fromEntries(ref.markers.map((m) => [m, 0])) },
    }],
  ];

  it.each(cases)("returns null for %s", (_name, value) => {
    expect(parseProfile(value)).toBeNull();
  });
});

describe("what a saved profile contains", () => {
  /**
   * The page promises a saved profile is single words with numbers beside them
   * and never prose. This walks the serialised object and asserts that every
   * string VALUE in it is either the timestamp or a marker word, and that every
   * marker is one word. Object keys are marker words and the fixed pair ids for
   * the same reason. So the record is a frequency list in frequency order: no
   * sentence in it, and no order to rebuild one from.
   */
  function stringPaths(value: unknown, path = ""): string[] {
    if (typeof value === "string") return [path];
    if (Array.isArray(value)) return value.flatMap((v, i) => stringPaths(v, `${path}[${i}]`));
    if (value !== null && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => stringPaths(v, path ? `${path}.${k}` : k));
    }
    return [];
  }

  it("stores no sentence, only single words with numbers beside them", () => {
    const own = [`My private notes about a thing nobody should read. ${doc(2)}`, doc(3), doc(4), doc(5), doc(6)];
    const ownRef = buildReference(own);
    const json = JSON.parse(serialiseProfile(ownRef, profileOf(own, ownRef), null, "2026-09-03T12:00:00.000Z"));
    const paths = stringPaths(json);
    expect(paths).toContain("savedAt");
    for (const path of paths) {
      if (path === "savedAt") continue;
      expect(path, path).toMatch(/^reference\.markers\[\d+\]$/);
    }
    // One word each. A marker with a space in it would mean the tokeniser had
    // let a phrase through, and a phrase is the start of a sentence.
    for (const marker of json.reference.markers) expect(marker, marker).toMatch(/^[\p{L}']+$/u);
    // The private sentence's distinctive words are in one document out of five,
    // so the share filter dropped them before anything was saved.
    expect(json.reference.markers).not.toContain("private");
    expect(json.reference.markers).not.toContain("nobody");
  });

  it("is small enough to sit in local storage without thinking about it", () => {
    expect(saved.length).toBeLessThan(200_000);
  });
});
