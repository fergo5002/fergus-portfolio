import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_SPACE,
  displayCode,
  isCode,
  newCode,
  normaliseTypedCode,
} from "./code";

describe("the alphabet", () => {
  it("is the eleven characters the plan argues for", () => {
    expect(CODE_ALPHABET).toBe("234679FKMRW");
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_SPACE).toBe(11 ** 6);
  });

  it("holds no character that looks like another", () => {
    for (const pair of ["0O", "1I", "1L", "5S", "8B", "2Z", "6G", "OQ"]) {
      const inSet = [...pair].filter((c) => CODE_ALPHABET.includes(c));
      expect(inSet.length, `${pair} has ${inSet.length} members in the alphabet`).toBeLessThan(2);
    }
  });

  it("holds no two characters that rhyme when read aloud", () => {
    // One member at most from each vowel cluster, except "eh" which keeps F and
    // M on purpose: a fricative coda against a nasal one survives a bad line.
    const clusters: Record<string, string> = {
      ee: "BCDEGPTVZ3",
      ay: "AHJK8",
      eye: "IY59",
      oo: "QUW2",
    };
    for (const [name, members] of Object.entries(clusters)) {
      const kept = [...members].filter((c) => CODE_ALPHABET.includes(c));
      expect(kept.length, `${name} keeps ${kept.join("")}`).toBeLessThanOrEqual(name === "oo" ? 2 : 1);
    }
    expect([..."FLMNSX"].filter((c) => CODE_ALPHABET.includes(c)).join("")).toBe("FM");
  });

  it("holds no duplicates and no lower case", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
    expect(CODE_ALPHABET).toBe(CODE_ALPHABET.toUpperCase());
  });
});

describe("newCode", () => {
  it("is six characters from the alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  /**
   * 256 is 23 times 11 with 3 left over, so `byte % 11` favours 2, 3 and 4.
   * The generator rejects any byte at or above 253 and asks for another. The
   * stub below hands out the three rejected values first, so a generator that
   * did not reject them would spell them.
   */
  it("rejects the bytes that would bias it", () => {
    const source = [253, 254, 255, 0, 1, 2, 3, 4, 5, 6];
    let at = 0;
    const fill = (bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = source[at++ % source.length];
    };
    expect(newCode(fill)).toBe("234679");
  });

  it("asks for more bytes rather than giving up when a whole draw is rejected", () => {
    let draws = 0;
    const fill = (bytes: Uint8Array) => {
      draws += 1;
      bytes.fill(draws === 1 ? 255 : 10);
    };
    expect(newCode(fill)).toHaveLength(6);
    expect(draws).toBeGreaterThan(1);
  });
});

describe("normaliseTypedCode", () => {
  it("takes the code as printed", () => {
    expect(normaliseTypedCode("K4M-9F2")).toBe("K4M9F2");
  });

  it("takes it lower case, spaced, or with the hyphen left out", () => {
    expect(normaliseTypedCode("k4m 9f2")).toBe("K4M9F2");
    expect(normaliseTypedCode("  K4M9F2  ")).toBe("K4M9F2");
    expect(normaliseTypedCode("k4m9f2")).toBe("K4M9F2");
  });

  it("maps the two characters that were dropped for looking like something", () => {
    expect(normaliseTypedCode("Z4M9F2")).toBe("24M9F2");
    expect(normaliseTypedCode("K4M9FG")).toBe("K4M9F6");
  });

  it("refuses a character that could be anything rather than guessing", () => {
    expect(normaliseTypedCode("O4M9F2")).toBeNull();
    expect(normaliseTypedCode("14M9F2")).toBeNull();
    expect(normaliseTypedCode("B4M9F2")).toBeNull();
  });

  it("refuses the wrong length", () => {
    expect(normaliseTypedCode("K4M9F")).toBeNull();
    expect(normaliseTypedCode("K4M9F22")).toBeNull();
    expect(normaliseTypedCode("")).toBeNull();
  });
});

describe("displayCode and isCode", () => {
  it("groups a code in threes for reading aloud", () => {
    expect(displayCode("K4M9F2")).toBe("K4M-9F2");
  });

  it("accepts only a normalised code", () => {
    expect(isCode("K4M9F2")).toBe(true);
    expect(isCode("k4m9f2")).toBe(false);
    expect(isCode("K4M-9F2")).toBe(false);
    expect(isCode(42 as unknown as string)).toBe(false);
  });
});
