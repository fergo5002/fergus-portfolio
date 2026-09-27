import { describe, expect, it } from "vitest";
import { createGame, eventsSince, GAME_IDS, lastEvent, MODULES, pressGame, stepGame, WORLD } from "./engine";
import { evaluateHand } from "./poker-rules";

/**
 * The engine is now a registry and a dispatcher: each cabinet is its own
 * module in `lib/arcade/games/`, and the rules for each live beside it. What
 * is left here is the collection as a whole and the poker evaluator, which
 * more than one file relies on.
 */
describe("the collection", () => {
  it("is the three cabinets Fergus kept, and nothing retired", () => {
    // Breakpoint, Phosphor Pong, Ouroboros and Under the Terminal were retired
    // on 2026-09-27, and arcade multiplayer with them.
    expect([...GAME_IDS]).toEqual(["signal", "poker", "panic"]);
    expect(Object.keys(MODULES).sort()).toEqual([...GAME_IDS].sort());
  });

  it("draws every world in the same space", () => {
    expect(WORLD).toEqual({ w: 900, h: 560 });
  });

  for (const id of GAME_IDS) {
    it(`${id} starts, advances deterministically and stays finite`, () => {
      const a = createGame(id, 12345), b = createGame(id, 12345);
      for (let i = 0; i < 900; i++) {
        if (i % 90 === 0) { pressGame(a, "action"); pressGame(b, "action"); }
        stepGame(a, 1 / 60, new Set(["left"])); stepGame(b, 1 / 60, new Set(["left"]));
      }
      expect(a).toEqual(b);
      expect(Number.isFinite(a.score)).toBe(true);
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(a)).not.toMatch(/NaN|Infinity/);
    });
  }

  it("ignores a step that is not a real amount of time", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = createGame("signal", 1), before = structuredClone(s);
      stepGame(s, bad, new Set(["right"]));
      expect(s).toEqual(before);
    }
  });

  it("reads events by sequence, so a frame that ran several steps misses none", () => {
    const s = createGame("poker", 1);
    const seen = s.eventSeq;
    pressGame(s, "1"); pressGame(s, "2"); pressGame(s, "action");
    expect(eventsSince(s, seen).map((e) => e.sound)).toEqual(["hit", "hit", "start"]);
    expect(lastEvent(s)?.sound).toBe("start");
    expect(lastEvent(createGame("signal", 1))).toBeNull();
  });
});

describe("the poker evaluator", () => {
  it("recognises every scoring category from fixed, independently chosen hands", () => {
    const hands = [[0, 3, 19, 35, 51], [0, 13, 4, 20, 37], [0, 13, 1, 14, 8], [0, 13, 26, 4, 18], [0, 14, 28, 42, 4], [0, 3, 5, 8, 11], [0, 13, 26, 1, 14], [0, 13, 26, 39, 1], [0, 1, 2, 3, 4]];
    expect(hands.map(h => evaluateHand(h).rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("ranks wheel straights below six-high and recognises straight flushes", () => {
    expect(evaluateHand([12, 0, 1, 2, 3]).rank).toBe(8);
    expect(evaluateHand([0, 1, 2, 3, 4]).value).toBeGreaterThan(evaluateHand([12, 0, 1, 2, 3]).value);
    expect(evaluateHand([0, 13, 26, 39, 4]).rank).toBe(7);
    expect(evaluateHand([0, 13, 26, 1, 14]).rank).toBe(6);
  });
});
