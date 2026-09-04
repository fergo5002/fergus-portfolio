import { describe, it, expect } from "vitest";
import { OWNED_PREFIX, isOwnedKey } from "@/lib/forget";
import { buildReference } from "./reference";
import { profileOf } from "./profile";
import { DRIFT_PROFILE_KEY, parseProfile, removeSavedProfile, serialiseProfile } from "./storage";

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

describe("explicit deletion", () => {
  it("reports success only after the browser actually removes the owned key", () => {
    const removed: string[] = [];
    expect(removeSavedProfile({ removeItem: (key) => removed.push(key) })).toBe(true);
    expect(removed).toEqual([DRIFT_PROFILE_KEY]);
  });

  it("reports failure when storage refuses deletion", () => {
    expect(
      removeSavedProfile({
        removeItem() {
          throw new DOMException("blocked", "SecurityError");
        },
      }),
    ).toBe(false);
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
    ["a missing marker frequency", { ...JSON.parse(saved), profile: { ...profile, freq: {} } }],
    ["a missing marker z-score", { ...JSON.parse(saved), profile: { ...profile, z: {} } }],
    ["a z-score that does not match the saved frequency and reference", {
      ...JSON.parse(saved),
      profile: {
        ...profile,
        z: Object.fromEntries(ref.markers.map((marker) => [marker, profile.z[marker] + 1])),
      },
    }],
    ["profile counts that do not match the saved reference", {
      ...JSON.parse(saved),
      profile: { ...profile, pieces: profile.pieces + 1 },
    }],
    ["a missing rhythm", { ...JSON.parse(saved), profile: { ...profile, rhythm: undefined } }],
    ["buckets that are not numbers", { ...JSON.parse(saved), profile: { ...profile, rhythm: { ...profile.rhythm, buckets: ["a"] } } }],
    ["the wrong number of rhythm buckets", { ...JSON.parse(saved), profile: { ...profile, rhythm: { ...profile.rhythm, buckets: [1] } } }],
    ["a malformed pair count", { ...JSON.parse(saved), profile: { ...profile, pairs: { utilise: { formal: 1 } } } }],
    ["an incomplete fixed pair table", { ...JSON.parse(saved), profile: { ...profile, pairs: {} } }],
    ["no reference at all", { ...JSON.parse(saved), reference: undefined }],
    ["a reference with no marker list", { ...JSON.parse(saved), reference: { ...ref, markers: "the and" } }],
    ["a reference missing a marker's sd", { ...JSON.parse(saved), reference: { ...ref, sd: {} } }],
    ["a reference with a zero sd, which is a division by zero downstream", {
      ...JSON.parse(saved),
      reference: { ...ref, sd: Object.fromEntries(ref.markers.map((m) => [m, 0])) },
    }],
    ["a reference with duplicate markers", {
      ...JSON.parse(saved),
      reference: { ...ref, markers: [ref.markers[0], ref.markers[0]] },
    }],
    ["an impossible self-spread ordering", {
      ...JSON.parse(saved),
      spread: { pieces: 2, min: 0.3, median: 0.2, max: 0.1 },
    }],
    ["a marker containing prose", (() => {
      const decoded = JSON.parse(saved);
      const marker = "not one word";
      return {
        ...decoded,
        reference: { ...ref, markers: [marker], mean: { [marker]: 0.1 }, sd: { [marker]: 0.1 } },
        profile: { ...profile, freq: { [marker]: 0.1 }, z: { [marker]: 0 } },
      };
    })()],
    ["an extra reference mean", {
      ...JSON.parse(saved),
      reference: { ...ref, mean: { ...ref.mean, invented: 0.1 } },
    }],
    ["an extra reference deviation", {
      ...JSON.parse(saved),
      reference: { ...ref, sd: { ...ref.sd, invented: 0.1 } },
    }],
    ["an impossible reference deviation", {
      ...JSON.parse(saved),
      reference: { ...ref, sd: Object.fromEntries(ref.markers.map((marker) => [marker, 0.6])) },
    }],
    ["an extra profile frequency", {
      ...JSON.parse(saved),
      profile: { ...profile, freq: { ...profile.freq, invented: 0.1 } },
    }],
    ["an extra profile z-score", {
      ...JSON.parse(saved),
      profile: { ...profile, z: { ...profile.z, invented: 0.1 } },
    }],
    ["a negative sentence count", {
      ...JSON.parse(saved),
      profile: { ...profile, rhythm: { ...profile.rhythm, sentences: -1 } },
    }],
    ["rhythm buckets outside shares", {
      ...JSON.parse(saved),
      profile: { ...profile, rhythm: { ...profile.rhythm, buckets: [2, -1, 0, 0, 0] } },
    }],
    ["rhythm buckets that do not sum to one", {
      ...JSON.parse(saved),
      profile: { ...profile, rhythm: { ...profile.rhythm, buckets: [0.1, 0.1, 0.1, 0.1, 0.1] } },
    }],
    ["a negative punctuation rate", {
      ...JSON.parse(saved),
      profile: { ...profile, punctuation: { ...profile.punctuation, emDash: -1 } },
    }],
    ["a join share above one", {
      ...JSON.parse(saved),
      profile: { ...profile, joins: { ...profile.joins, and: 2, any: 2 } },
    }],
    ["an inconsistent combined join share", {
      ...JSON.parse(saved),
      profile: { ...profile, joins: { and: 0.1, but: 0.2, so: 0.3, any: 0.1 } },
    }],
    ["a self-spread claiming more pieces than the reference", {
      ...JSON.parse(saved),
      spread: { pieces: ref.documents + 1, min: 0.1, median: 0.2, max: 0.3 },
    }],
    ["an extra fixed pair", {
      ...JSON.parse(saved),
      profile: { ...profile, pairs: { ...profile.pairs, invented: { formal: 0, plain: 0 } } },
    }],
    ["a pair count larger than the profile", {
      ...JSON.parse(saved),
      profile: {
        ...profile,
        pairs: { ...profile.pairs, utilise: { formal: profile.words + 1, plain: 0 } },
      },
    }],
    ["an invalid timestamp", { ...JSON.parse(saved), savedAt: "whenever" }],
    ["a parseable timestamp that is not the exported ISO shape", {
      ...JSON.parse(saved),
      savedAt: "2026-09-03",
    }],
    ["an extra envelope field", { ...JSON.parse(saved), prose: "not allowed" }],
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
