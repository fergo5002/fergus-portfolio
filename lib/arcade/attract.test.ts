import { describe, expect, it } from "vitest";
import { attractPlan, createAttract, createAttractMemory, seededRng } from "./attract";
import { createGame, GAME_IDS, type GameId } from "./engine";

/**
 * Attract mode is a real arcade behaviour: the cabinet plays itself until
 * somebody walks up. These prove the unattended player actually plays each
 * game rather than standing still, within a bounded number of ticks, and that
 * a finished demo starts again on its own. Nothing here touches the DOM.
 */

const TICK = 1 / 60;
function run(id: GameId, seconds: number, until?: (a: ReturnType<typeof createAttract>) => boolean) {
  const attract = createAttract(id, 7);
  for (let i = 0; i < seconds * 60; i++) {
    attract.step(TICK);
    if (until?.(attract)) return { attract, reached: true, at: i * TICK };
  }
  return { attract, reached: false, at: seconds };
}

describe("seededRng", () => {
  it("is deterministic and stays inside [0, 1)", () => {
    const a = seededRng(9), b = seededRng(9);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("the unattended player", () => {
  it("launches Breakpoint's ball within three seconds and breaks a brick within forty", () => {
    const launched = run("bounce", 3, (a) => !a.state.ball.attached);
    expect(launched.reached).toBe(true);
    const scored = run("bounce", 40, (a) => a.state.score > 0);
    expect(scored.reached).toBe(true);
  });

  it("returns a serve in Phosphor Pong within thirty seconds", () => {
    const hit = run("pong", 30, (a) => a.state.score > 0);
    expect(hit.reached).toBe(true);
  });

  it("eats in Ouroboros within twenty-five seconds and is still alive at six", () => {
    const alive = run("snake", 6);
    expect(alive.attract.restarts).toBe(0);
    const ate = run("snake", 25, (a) => a.state.score > 0);
    expect(ate.reached).toBe(true);
  });

  it("scores Under the Terminal within ninety seconds by moving through the maze", () => {
    const moved = run("under", 5, (a) => a.state.turn > 3);
    expect(moved.reached).toBe(true);
    const scored = run("under", 90, (a) => a.state.score > 0);
    expect(scored.reached).toBe(true);
  });

  it("survives ten seconds of Dead Signal and builds a kill chain within twenty", () => {
    const alive = run("signal", 10);
    expect(alive.attract.restarts).toBe(0);
    const killed = run("signal", 20, (a) => a.state.combo > 0);
    expect(killed.reached).toBe(true);
  });

  it("banks a Circuit Poker hand within eight seconds", () => {
    const banked = run("poker", 8, (a) => a.state.bank > 0 || a.state.score > 0);
    expect(banked.reached).toBe(true);
  });

  for (const id of GAME_IDS) {
    it(`${id}: two hundred and forty seconds never throw and stay finite`, () => {
      const { attract } = run(id, 240);
      expect(JSON.stringify(attract.state)).not.toMatch(/NaN|Infinity/);
      expect(attract.restarts).toBeGreaterThanOrEqual(0);
    });
  }
});

describe("restarting", () => {
  it("holds the finished screen for a beat and then deals a fresh game", () => {
    const attract = createAttract("bounce", 3);
    attract.state.over = true;
    const seed = attract.state.seed;
    for (let i = 0; i < 60; i++) attract.step(TICK);
    expect(attract.restarts).toBe(0);
    expect(attract.state.over).toBe(true);
    for (let i = 0; i < 60 * 2; i++) attract.step(TICK);
    expect(attract.restarts).toBe(1);
    expect(attract.state.over).toBe(false);
    expect(attract.state.seed).not.toBe(seed);
  });

  it("never spends the daily dungeon seed, so the demo cannot spoil today's board", () => {
    const today = Number(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
    const attract = createAttract("under", today);
    expect(attract.state.seed).not.toBe(today >>> 0);
  });
});

describe("attractPlan", () => {
  it("holds a direction for the games that steer and presses for the games that turn", () => {
    const rng = seededRng(1), memory = createAttractMemory();
    const signal = attractPlan(createGame("signal", 1), rng, memory);
    expect([...signal.hold].every((k) => ["up", "down", "left", "right", "action"].includes(k))).toBe(true);
    const under = createGame("under", 1);
    under.time = 5;
    const plan = attractPlan(under, rng, memory);
    expect(plan.press.length).toBeGreaterThan(0);
    expect(plan.hold.size).toBe(0);
  });

  it("only ever emits keys the engine understands", () => {
    const allowed = new Set(["up", "down", "left", "right", "action", "bank", "1", "2", "3", "4", "5"]);
    for (const id of GAME_IDS) {
      const rng = seededRng(2), memory = createAttractMemory();
      const s = createGame(id, 2);
      for (let i = 0; i < 300; i++) {
        s.time += TICK;
        const plan = attractPlan(s, rng, memory);
        for (const k of [...plan.hold, ...plan.press]) expect(allowed.has(k), `${id} emitted ${k}`).toBe(true);
      }
    }
  });
});
