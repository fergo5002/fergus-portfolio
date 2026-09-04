import { describe, it, expect } from "vitest";
import { advance, createLoopState, MAX_TICKS_PER_FRAME, TICK_HZ, TICK_MS } from "@/lib/arcade/loop";

/** Count calls and the ms each was handed. */
function counter() {
  const calls: number[] = [];
  return { calls, tick: (ms: number) => calls.push(ms) };
}

describe("the tick rate", () => {
  it("is thirty a second", () => {
    expect(TICK_HZ).toBe(30);
    expect(TICK_MS).toBeCloseTo(33.3333, 3);
  });
});

describe("advance", () => {
  it("does not tick until a whole timestep has passed", () => {
    const s = createLoopState();
    const c = counter();
    expect(advance(s, 16, c.tick)).toBe(0);
    expect(c.calls).toEqual([]);
  });

  it("ticks once when two 16ms frames have added up", () => {
    const s = createLoopState();
    const c = counter();
    advance(s, 16.667, c.tick);
    expect(advance(s, 16.667, c.tick)).toBe(1);
    expect(c.calls).toEqual([TICK_MS]);
  });

  it("hands every tick the fixed timestep, never the frame delta", () => {
    const s = createLoopState();
    const c = counter();
    advance(s, 100, c.tick);
    expect(new Set(c.calls)).toEqual(new Set([TICK_MS]));
  });

  it("keeps the remainder, so speed does not drift over a second", () => {
    // A 60fps second is 60 frames of 16.667ms, which is 30 ticks exactly.
    // Dropping the remainder each frame would give 30 ticks in 66 frames.
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 60; i++) advance(s, 16.6667, c.tick);
    expect(c.calls.length).toBe(30);
  });

  it("carries the remainder across frames rather than dropping it each time", () => {
    // Seven 20ms frames are 140ms, which is four whole ticks and a fifth of a
    // fifth left over. Zeroing the accumulator after a tick instead of
    // subtracting one timestep gives three, and a game would then run a
    // quarter slower than it should on that frame pattern. The 60fps case
    // above cannot see this, because 16.67 divides into 33.33 exactly twice.
    //
    // Seven and not five, though five frames is the neater 100ms. 100ms is
    // exactly three timesteps, and at an exact boundary the answer is decided
    // by the last bit of 1000/30 rather than by the code: measured, five
    // frames give two ticks whether the accumulator is drained or subtracted
    // from, so the assertion would have been red for a reason that has nothing
    // to do with the guard it is aimed at.
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 7; i++) advance(s, 20, c.tick);
    expect(c.calls.length).toBe(4);
  });

  it("runs the same number of ticks at 120fps as at 60fps", () => {
    // An odd number of frames, for the same reason: a whole second of 60fps is
    // exactly thirty ticks, and comparing two accumulations across an exact
    // boundary measures float rounding rather than the loop. 101 frames is
    // 1683ms, which is fifty ticks and a half.
    const f60 = 1000 / 60;
    const f120 = 1000 / 120;
    const a = createLoopState();
    const b = createLoopState();
    const ca = counter();
    const cb = counter();
    for (let i = 0; i < 101; i++) advance(a, f60, ca.tick);
    for (let i = 0; i < 202; i++) advance(b, f120, cb.tick);
    expect(ca.calls.length).toBe(50);
    expect(cb.calls.length).toBe(ca.calls.length);
  });

  it("refuses to run a banked backlog after a stall", () => {
    const s = createLoopState();
    const c = counter();
    // Ten seconds of stall. Running 300 ticks would teleport a ball across the
    // screen nine times; the player did not live through that time.
    expect(advance(s, 10_000, c.tick)).toBe(MAX_TICKS_PER_FRAME);
    expect(s.acc).toBe(0);
  });

  it("ignores a delta that is zero, negative or not a number", () => {
    const s = createLoopState();
    const c = counter();
    expect(advance(s, 0, c.tick)).toBe(0);
    expect(advance(s, -50, c.tick)).toBe(0);
    expect(advance(s, Number.NaN, c.tick)).toBe(0);
    expect(s.acc).toBe(0);
    expect(c.calls).toEqual([]);
  });

  it("counts every tick it has ever run", () => {
    const s = createLoopState();
    const c = counter();
    for (let i = 0; i < 10; i++) advance(s, 33.334, c.tick);
    expect(s.ticks).toBe(10);
  });
});
