import { describe, expect, it } from "vitest";
import { createGame, stepGame, pressGame, GAME_IDS } from "./engine";
import { evaluateHand } from "./poker-rules";

describe("the collection", () => {
  it("is the cabinets Fergus kept, and nothing retired", () => {
    // Breakpoint, Phosphor Pong, Ouroboros and Under the Terminal were retired
    // on 2026-09-27, and arcade multiplayer with them.
    expect([...GAME_IDS]).toEqual(["signal", "poker"]);
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
  it("does not advance a finished run", () => {
    const state = createGame("signal", 3); state.over = true;
    const before = structuredClone(state);
    stepGame(state, 1 / 60, new Set(["right"])); pressGame(state, "action");
    expect(state).toEqual(before);
  });
  it("caps a delayed frame so a hidden tab cannot teleport the player", () => {
    const a = createGame("signal", 1), b = createGame("signal", 1);
    stepGame(a, 100, new Set(["right"])); stepGame(b, 0.05, new Set(["right"]));
    expect(a).toEqual(b);
  });
});
describe("Circuit Poker", () => {
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
  it("keeps held cards, deals without duplicates, and spends a redraw", () => {
    const s = createGame("poker", 1); const first = s.cards[0];
    pressGame(s, "1"); pressGame(s, "action");
    expect(s.cards[0]).toBe(first); expect(new Set([...s.cards, ...s.deck, ...s.discarded]).size).toBe(52);
    expect(s.redraws).toBe(1);
  });
});
describe("Dead Signal", () => {
  it("a pulse spends charge and clears only the enemies within its range", () => {
    const s = createGame("signal", 1);
    s.enemies = [{ x: 460, y: 280, hp: 2, kind: 1, cooldown: 0 }, { x: 800, y: 280, hp: 2, kind: 1, cooldown: 0 }];
    pressGame(s, "action");
    expect(s.enemies).toHaveLength(1); expect(s.enemies[0].x).toBe(800); expect(s.charge).toBe(35); expect(s.score).toBe(25);
    pressGame(s, "action"); expect(s.charge).toBe(35);
  });
});
describe("where the last event happened", () => {
  it("puts a Dead Signal pulse on the player and a kill where the enemy died, in world pixels", () => {
    const s = createGame("signal", 1);
    s.enemies = [{ x: 470, y: 290, hp: 1, kind: 0, cooldown: 0 }];
    pressGame(s, "action");
    expect(s.eventAt).toEqual({ x: 450, y: 280 });
    const t = createGame("signal", 2);
    t.enemies = [{ x: 700, y: 400, hp: 1, kind: 0, cooldown: 0 }];
    t.bullets = [{ x: 700, y: 400, vx: 0, vy: 0, life: 1 }];
    t.shotClock = 10;
    stepGame(t, 1 / 60, new Set());
    expect(t.eventAt.x).toBeGreaterThan(650); expect(t.eventAt.y).toBeGreaterThan(350);
  });
  it("puts a held Circuit Poker card under the card that was held", () => {
    const s = createGame("poker", 1);
    pressGame(s, "3");
    expect(s.eventAt.x).toBeGreaterThan(400); expect(s.eventAt.x).toBeLessThan(500);
  });
});
