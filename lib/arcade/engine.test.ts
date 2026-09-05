import { describe, expect, it } from "vitest";
import { createGame, stepGame, pressGame, WORLD, type GameId } from "./engine";
import { evaluateHand } from "./poker-rules";

const ids: GameId[] = ["bounce", "pong", "snake", "under", "signal", "poker"];
describe("the collection", () => {
  for (const id of ids) {
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
  it("caps a delayed frame so a hidden tab cannot teleport the ball", () => {
    const a = createGame("pong", 1), b = createGame("pong", 1);
    stepGame(a, 100, new Set()); stepGame(b, 0.05, new Set());
    expect(a).toEqual(b);
  });
});
describe("Breakpoint", () => {
  it("launches only on action and catches a returning ball with magnet", () => {
    const s = createGame("bounce", 1);
    expect(s.ball.attached).toBe(true);
    stepGame(s, 0.02, new Set());
    expect(s.ball.attached).toBe(true);
    pressGame(s, "action"); expect(s.ball.attached).toBe(false);
    s.ball.x = s.player.x; s.ball.y = WORLD.h - 51; s.ball.vx = 0; s.ball.vy = 220;
    stepGame(s, 0.02, new Set(["action"]));
    expect(s.ball.attached).toBe(true);
    stepGame(s, 0.02, new Set());
    expect(s.ball.attached).toBe(false);
  });
  it("damages a brick, awards points, and bounces out", () => {
    const s = createGame("bounce", 2), brick = s.bricks[0];
    s.ball = { x: brick.x + 10, y: brick.y + 27, vx: 0, vy: -240, attached: false };
    stepGame(s, 0.02, new Set());
    expect(s.bricks[0].hp).toBeLessThan(brick.maxHp);
    expect(s.score).toBeGreaterThan(0); expect(s.ball.vy).toBeGreaterThan(0);
  });
  it("does not hit a reinforced brick again while moving away from it", () => {
    const s = createGame("bounce", 2), brick = s.bricks[0]; brick.hp = 2; brick.maxHp = 2;
    s.bricks = [brick];
    s.ball = { x: brick.x + 10, y: brick.y + 27, vx: 0, vy: -240, attached: false };
    stepGame(s, 0.02, new Set()); const score = s.score;
    stepGame(s, 0.02, new Set());
    expect(brick.hp).toBe(1); expect(s.score).toBe(score); expect(s.ball.vy).toBeGreaterThan(0);
  });
});
describe("Pong", () => {
  it("awards the correct side and finishes at seven", () => {
    const s = createGame("pong", 2, "local"); s.points = [6, 0];
    s.ball.x = WORLD.w + 20; s.ball.vx = 200;
    stepGame(s, 0.01, new Set());
    expect(s.points).toEqual([7, 0]); expect(s.over).toBe(true); expect(s.won).toBe(true);
  });
  it("keeps player two under human control in multiplayer", () => {
    const s = createGame("pong", 3, "local"); const y = s.rival.y;
    stepGame(s, 0.05, new Set(["p2up"])); expect(s.rival.y).toBeLessThan(y);
  });
});
describe("Ouroboros", () => {
  it("rejects reversing into its own neck", () => {
    const s = createGame("snake", 1); pressGame(s, "left");
    expect(s.direction).toEqual({ x: 1, y: 0 });
  });
  it("eating grows the snake and earns charge", () => {
    const s = createGame("snake", 2); s.food = { x: s.snake[0].x + 1, y: s.snake[0].y };
    const n = s.snake.length; stepGame(s, 0.05, new Set()); stepGame(s, 0.05, new Set()); stepGame(s, 0.05, new Set());
    expect(s.snake.length).toBe(n + 1); expect(s.score).toBeGreaterThan(0);
  });
  it("ends on a wall without phase and wraps while phase is active", () => {
    const s = createGame("snake", 2); s.snake[0] = { x: 29, y: 8 }; s.moveClock = 0.2;
    stepGame(s, 0.01, new Set()); expect(s.over).toBe(true);
    const p = createGame("snake", 2); p.snake[0] = { x: 29, y: 8 }; p.moveClock = 0.2;
    pressGame(p, "action"); stepGame(p, 0.01, new Set());
    expect(p.over).toBe(false); expect(p.snake[0].x).toBe(0);
  });
});
describe("Under the Terminal", () => {
  it("is seeded, connected and only enemies move after a turn", () => {
    const s = createGame("under", 20260905);
    const before = structuredClone(s.enemies); stepGame(s, 0.05, new Set()); expect(s.enemies).toEqual(before);
    const reachable = new Set<string>(), queue = [s.player];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = `${p.x},${p.y}`; if (reachable.has(key)) continue; reachable.add(key);
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const x = p.x + dx, y = p.y + dy;
        if (s.map[y]?.[x] === 0 && !reachable.has(`${x},${y}`)) queue.push({ x, y });
      }
    }
    expect(reachable.has(`${s.exit.x},${s.exit.y}`)).toBe(true);
    expect(reachable.has(`${s.food.x},${s.food.y}`)).toBe(true);
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
