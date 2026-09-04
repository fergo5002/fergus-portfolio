import { describe, expect, it } from "vitest";
import {
  BITS_PER_ENTRY,
  BLOOM_THRESHOLD,
  HASH_COUNT,
  TARGET_RATE,
  bitsFor,
  buildFilter,
  decodeFilter,
  encodeFilter,
  expectedWrongNames,
  falsePositiveRate,
  testFilter,
} from "./bloom";

/** Deterministic 16-hex-character hashes, so the filter can be measured. */
const hashes = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) =>
    (((BigInt(i + offset) * 0x9e3779b97f4a7c15n) % (1n << 64n)) as bigint).toString(16).padStart(16, "0"),
  );

describe("the constants, and the arithmetic they come from", () => {
  it("keeps the design's threshold", () => {
    expect(BLOOM_THRESHOLD).toBe(10_000);
  });

  it("derives 29 bits an entry from a target of one in a million", () => {
    expect(TARGET_RATE).toBe(1e-6);
    expect(BITS_PER_ENTRY).toBe(29);
    expect(Math.ceil(-Math.log(TARGET_RATE) / Math.LN2 ** 2)).toBe(29);
  });

  it("derives twenty probes from those bits", () => {
    expect(HASH_COUNT).toBe(20);
    expect(Math.round(BITS_PER_ENTRY * Math.LN2)).toBe(20);
  });

  it("actually achieves the rate it was sized for", () => {
    const rate = falsePositiveRate(29_000, 20, 1000);
    expect(rate).toBeCloseTo((1 - Math.exp(-20 / 29)) ** 20, 15);
    // The figure the module's docblock prints, pinned to the digits it prints
    // rather than to a tolerance somebody guessed at.
    expect(rate.toPrecision(3)).toBe("8.89e-7");
    expect(rate).toBeLessThan(TARGET_RATE);
  });

  it("sizes a filter from the count and never below a floor", () => {
    expect(bitsFor(10_000)).toBe(290_000);
    expect(bitsFor(1)).toBe(512);
    expect(bitsFor(0)).toBe(512);
    expect(bitsFor(30_000) % 8).toBe(0);
  });
});

describe("buildFilter and testFilter", () => {
  it("holds everything it was given", () => {
    const f = buildFilter(hashes(2_000));
    for (const h of hashes(2_000)) expect(testFilter(f, h)).toBe(true);
  });

  it("rejects almost everything it was not given", () => {
    const f = buildFilter(hashes(2_000));
    const wrong = hashes(2_000, 1_000_000).filter((h) => testFilter(f, h));
    // 2,000 checks at 8.9e-7 expects 0.0018 hits. One would be a 1-in-560 event
    // and worth investigating; two means the probes are not independent.
    expect(wrong).toHaveLength(0);
  });

  it("spreads twenty probes rather than piling them on one bit", () => {
    const f = buildFilter([hashes(1)[0]]);
    const set = [...f.bits].reduce((n, byte) => n + byte.toString(2).replace(/0/g, "").length, 0);
    expect(set).toBe(20);
  });

  it("survives a hash whose lower half lands on a multiple of the bit count", () => {
    // A step of zero would collapse twenty probes onto one bit. It cannot
    // happen: h2 is forced odd and the bit count is always even, so the step is
    // always odd. The two facts that invariant rests on are pinned below.
    const bits = bitsFor(1); // 512
    const h = "ffffffff" + (0).toString(16).padStart(8, "0");
    const f = buildFilter([h]);
    expect(f.bits.length).toBe(bits / 8);
    const set = [...f.bits].reduce((n, byte) => n + byte.toString(2).replace(/0/g, "").length, 0);
    expect(set).toBeGreaterThan(1);
    expect(testFilter(f, h)).toBe(true);
  });

  /**
   * The invariant that replaced a guard which could not fire. `|| 1` on the
   * step was removed after taking it out left every test green, which is what
   * a decorative guard looks like. These two facts are what make it needless,
   * so they are the ones worth holding.
   */
  it("keeps a filter an even number of bits wide, which is half of why no step is zero", () => {
    for (const n of [0, 1, 7, 999, 10_000, 30_000]) expect(bitsFor(n) % 8).toBe(0);
  });

  it("keeps the odd bit set on the step, which is the other half", () => {
    // The lower 32 bits are forced odd before the modulus, so an even bit count
    // can never divide them exactly. Checked on the value that overflowed int32.
    const h2 = ((Number.parseInt("fe94f82a", 16) >>> 0) | 1) >>> 0;
    expect(h2).toBeGreaterThan(2 ** 31);
    expect(h2 % 2).toBe(1);
    expect(h2 % bitsFor(2_000)).toBeGreaterThan(0);
  });

  it("finds a hash whose lower half overflows a signed 32-bit integer", () => {
    // This is the case the missing `>>> 0` broke: half of all hashes.
    const h = "0000000f" + "fe94f82a";
    const f = buildFilter([h, "0000000a" + "0000000b"]);
    expect(testFilter(f, h)).toBe(true);
  });

  it("is empty when nothing goes in", () => {
    const f = buildFilter([]);
    expect(f.inserted).toBe(0);
    expect([...f.bits].every((b) => b === 0)).toBe(true);
    expect(testFilter(f, hashes(1)[0])).toBe(false);
  });
});

describe("the wire encoding", () => {
  it("round trips", () => {
    const f = buildFilter(hashes(500));
    const back = decodeFilter(encodeFilter(f), f.bits.length * 8, f.k, f.inserted);
    expect([...back.bits]).toEqual([...f.bits]);
    for (const h of hashes(500)) expect(testFilter(back, h)).toBe(true);
  });

  it("refuses a payload of the wrong length rather than reading past it", () => {
    const f = buildFilter(hashes(10));
    expect(() => decodeFilter(encodeFilter(f), 64, f.k, f.inserted)).toThrow(/bits/);
  });
});

describe("what the page prints", () => {
  it("turns a filter and a check count into an expected number of wrong names", () => {
    const f = buildFilter(hashes(10_000));
    const expected = expectedWrongNames(f, 10_000);
    expect(expected).toBeGreaterThan(0.005);
    expect(expected).toBeLessThan(0.02);
  });

  it("expects nothing wrong from an empty filter", () => {
    expect(expectedWrongNames(buildFilter([]), 5_000)).toBe(0);
  });
});
