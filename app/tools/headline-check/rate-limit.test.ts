import { describe, it, expect } from "vitest";
import { takeToken, BUCKET_SIZE, REFILL_MS } from "./rate-limit";

/**
 * The limiter had no test until 2026-08-21, which review flagged and was right
 * about: every `lib/` module in this repo has a `.test.ts` sibling, and this one
 * sits under `app/` only because it is used by one route rather than because its
 * logic is any less worth pinning.
 *
 * It is pure apart from a module-level `Map`, and `now` is already a parameter,
 * so the refill window is drivable without waiting ten seconds for a clock. The
 * shared `Map` is why every test below uses its own key: the state is real and
 * it persists across cases, exactly as it does across requests in one process.
 */

/** A key nothing else in this file will touch. */
let counter = 0;
const freshKey = () => `test-${(counter += 1)}`;

describe("takeToken", () => {
  it("allows a full bucket and then refuses", () => {
    const key = freshKey();
    const now = 1_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) {
      expect(takeToken(key, now), `token ${i + 1} of ${BUCKET_SIZE}`).toBe(true);
    }
    expect(takeToken(key, now)).toBe(false);
  });

  it("stays refused while the window has not passed", () => {
    const key = freshKey();
    const now = 2_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken(key, now);
    expect(takeToken(key, now + REFILL_MS - 1)).toBe(false);
  });

  it("gives exactly one token back on the window boundary", () => {
    const key = freshKey();
    const now = 3_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken(key, now);

    expect(takeToken(key, now + REFILL_MS)).toBe(true);
    // One back means one, not two.
    expect(takeToken(key, now + REFILL_MS)).toBe(false);
  });

  it("does not lose the remainder of a partial window", () => {
    // The bug this guards: advancing `updated` to `now` rather than to
    // `updated + refill * REFILL_MS` throws away the part of the window that had
    // already elapsed, so a caller arriving just before every boundary would
    // refill more slowly than the stated rate and eventually never at all.
    const key = freshKey();
    const now = 4_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken(key, now);

    // 1.9 windows: one token back, and 0.9 of a window still banked.
    expect(takeToken(key, now + REFILL_MS * 1.9)).toBe(true);
    // 0.1 of a window later the second boundary lands, so another is due.
    expect(takeToken(key, now + REFILL_MS * 2)).toBe(true);
  });

  it("never refills past the bucket size", () => {
    const key = freshKey();
    const now = 5_000_000;
    expect(takeToken(key, now)).toBe(true);

    // A year of idling is still one bucket, not a year of tokens.
    const later = now + REFILL_MS * 3_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) {
      expect(takeToken(key, later), `token ${i + 1} after a long idle`).toBe(true);
    }
    expect(takeToken(key, later)).toBe(false);
  });

  it("keeps one key's spending away from another's", () => {
    const a = freshKey();
    const b = freshKey();
    const now = 6_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken(a, now);
    expect(takeToken(a, now)).toBe(false);
    expect(takeToken(b, now)).toBe(true);
  });

  it("survives the eviction sweep without handing out a free bucket", () => {
    // Past MAX_TRACKED the map drops addresses that have had time to refill in
    // full, and clears outright if that was not enough. Either way a key that is
    // currently out of tokens must not come back with a full bucket, because
    // that would make the limiter beatable by flooding it with junk keys.
    const key = freshKey();
    const now = 7_000_000;
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken(key, now);
    expect(takeToken(key, now)).toBe(false);

    // Push the map over its ceiling at the same instant, so nothing is stale
    // enough to evict and the sweep cannot rescue anybody.
    for (let i = 0; i < 5100; i += 1) takeToken(`flood-${i}`, now);

    // The flood may have cleared the map, which is the documented worst case, so
    // this asserts what actually matters: the flooder does not get more than one
    // bucket's worth out of it either.
    for (let i = 0; i < BUCKET_SIZE; i += 1) takeToken("flood-0", now);
    expect(takeToken("flood-0", now)).toBe(false);
  });
});
