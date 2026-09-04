import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  HASH_HEX_CHARS,
  SALT_BYTES,
  decodeSalt,
  encodeSalt,
  hashAll,
  hashSlug,
  newSalt,
  toHex,
} from "./hash";

/**
 * Two independent references, on purpose.
 *
 * `node:crypto`'s `createHash` is a different implementation from WebCrypto's
 * `subtle.digest`, so asserting they agree pins the concatenation order and the
 * truncation without anybody inventing a digest. The empty-input vector is the
 * published SHA-256 of nothing, which pins the algorithm itself.
 */
const reference = (salt: Uint8Array, slug: string) =>
  createHash("sha256")
    .update(Buffer.concat([Buffer.from(salt), Buffer.from(slug, "utf8")]))
    .digest("hex")
    .slice(0, 16);

describe("the salt", () => {
  it("is 32 bytes", () => {
    expect(SALT_BYTES).toBe(32);
    expect(newSalt()).toHaveLength(32);
  });

  it("is drawn from the platform's random source", () => {
    const fill = vi.fn((bytes: Uint8Array) => bytes.fill(7));
    expect([...newSalt(fill)]).toEqual(Array(32).fill(7));
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it("survives a round trip through the wire encoding", () => {
    const salt = newSalt();
    expect([...decodeSalt(encodeSalt(salt))]).toEqual([...salt]);
  });

  it("refuses a salt of the wrong length rather than hashing with it", () => {
    expect(() => decodeSalt(encodeSalt(new Uint8Array(16)))).toThrow(/32 bytes/);
    expect(() => decodeSalt("not base64 at all !!")).toThrow();
  });
});

describe("hashSlug", () => {
  it("is 16 lowercase hex characters, which is 8 bytes, which is 64 bits", async () => {
    expect(HASH_HEX_CHARS).toBe(16);
    const h = await hashSlug(newSalt(), "fergus-oreilly");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("matches SHA-256 of salt then slug, checked against node:crypto", async () => {
    const salt = new Uint8Array(32).map((_, i) => (i * 7) % 251);
    for (const slug of ["fergus-oreilly", "seán-ó-broin", "john-smith-1a2b3c4", ""]) {
      expect(await hashSlug(salt, slug)).toBe(reference(salt, slug));
    }
  });

  it("hashes the salt before the slug, not after", async () => {
    const salt = new Uint8Array(32).fill(1);
    const wrongWayRound = createHash("sha256")
      .update(Buffer.concat([Buffer.from("abc", "utf8"), Buffer.from(salt)]))
      .digest("hex")
      .slice(0, 16);
    expect(await hashSlug(salt, "abc")).not.toBe(wrongWayRound);
  });

  it("agrees with the published SHA-256 of the empty input", async () => {
    // e3b0c442 98fc1c14 9afbf4c8 996fb924 27ae41e4 649b934c a495991b 7852b855
    expect(await hashSlug(new Uint8Array(0), "")).toBe("e3b0c44298fc1c14");
  });

  it("gives a different answer under a different salt", async () => {
    const a = await hashSlug(new Uint8Array(32).fill(1), "fergus-oreilly");
    const b = await hashSlug(new Uint8Array(32).fill(2), "fergus-oreilly");
    expect(a).not.toBe(b);
  });

  it("treats the slug as UTF-8 rather than as code units", async () => {
    const salt = newSalt();
    // Four bytes in UTF-8, one astral code point. A code-unit encoding would
    // hash something different and the two sides would still agree, which is
    // why this is checked against node:crypto rather than against itself.
    expect(await hashSlug(salt, "a\u{1f600}b")).toBe(reference(salt, "a\u{1f600}b"));
  });
});

describe("hashAll", () => {
  const salt = new Uint8Array(32).fill(3);

  it("sorts ascending and deduplicates", async () => {
    const out = await hashAll(salt, ["b", "a", "c", "a"]);
    expect(out).toHaveLength(3);
    expect([...out].sort()).toEqual(out);
    expect(new Set(out).size).toBe(3);
  });

  it("agrees with hashSlug one at a time", async () => {
    const slugs = ["one", "two", "three"];
    const one = await Promise.all(slugs.map((s) => hashSlug(salt, s)));
    expect(await hashAll(salt, slugs)).toEqual([...one].sort());
  });

  it("reports progress in batches so a big file can say something", async () => {
    const onProgress = vi.fn();
    const slugs = Array.from({ length: 250 }, (_, i) => `p${i}`);
    await hashAll(salt, slugs, { onProgress, batch: 100 });
    expect(onProgress.mock.calls.map(([done]) => done)).toEqual([100, 200, 250]);
  });

  it("takes an injected subtle, which is how the exchange stays testable", async () => {
    const subtle = { digest: vi.fn(globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)) };
    await hashAll(salt, ["a", "b"], { subtle });
    expect(subtle.digest).toHaveBeenCalledTimes(2);
  });
});

describe("toHex", () => {
  it("pads a byte under 16 rather than dropping its nibble", () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });
});
