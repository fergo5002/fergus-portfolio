import { describe, expect, it } from "vitest";
import { attractPlan, capOf, createAttract, createAttractMemory, LIT_PRESS, seededRng } from "./attract";
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
  it("survives ten seconds of Dead Signal and builds a kill chain within twenty", () => {
    const alive = run("signal", 10);
    expect(alive.attract.restarts).toBe(0);
    const killed = run("signal", 20, (a) => a.state.id === "signal" && a.state.combo > 0);
    expect(killed.reached).toBe(true);
  });

  it("banks a Circuit Poker hand within eight seconds", () => {
    const banked = run("poker", 8, (a) => a.state.score > 0);
    expect(banked.reached).toBe(true);
  });

  it("types a Kernel Panic process to death within twenty seconds", () => {
    const killed = run("panic", 20, (a) => a.state.score > 0);
    expect(killed.reached).toBe(true);
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
    const attract = createAttract("signal", 3);
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

});

describe("attractPlan", () => {
  it("holds a direction for the game that steers and presses for the game that deals", () => {
    const rng = seededRng(1), memory = createAttractMemory();
    const signal = attractPlan(createGame("signal", 1), rng, memory);
    expect([...signal.hold].every((k) => ["up", "down", "left", "right", "action"].includes(k))).toBe(true);
    const poker = createGame("poker", 1);
    poker.time = 5;
    const plan = attractPlan(poker, rng, createAttractMemory());
    expect(plan.press.length).toBeGreaterThan(0);
    expect(plan.hold.size).toBe(0);
  });

  it("only ever emits keys the engine understands", () => {
    const allowed = /^(up|down|left|right|action|bank|[1-5]|char:[a-z0-9]|erase)$/;
    for (const id of GAME_IDS) {
      const rng = seededRng(2), memory = createAttractMemory();
      const s = createGame(id, 2);
      for (let i = 0; i < 300; i++) {
        s.time += TICK;
        const plan = attractPlan(s, rng, memory);
        for (const k of [...plan.hold, ...plan.press]) expect(k, `${id} emitted ${k}`).toMatch(allowed);
      }
    }
  });
});

describe("the keycaps the how-to-play card lights", () => {
  it("lights the cap under each key the demo presses, and lets it go out", () => {
    const attract = createAttract("poker", 11);
    let lit = false;
    for (let i = 0; i < 60 * 4 && !lit; i++) {
      attract.step(TICK);
      lit = ["1", "2", "3", "4", "5", "action", "bank"].some((k) => (attract.lit.get(k) ?? 0) > 0);
    }
    expect(lit).toBe(true);
    // The poker demo acts about once a second, so nothing relights it in the next few tenths.
    for (let i = 0; i < Math.ceil(60 * LIT_PRESS) + 2; i++) attract.step(TICK);
    expect(attract.lit.size).toBe(0);
  });

  it("lights the held direction while Dead Signal steers", () => {
    const attract = createAttract("signal", 3);
    for (let i = 0; i < 30; i++) attract.step(TICK);
    expect([...attract.lit.keys()].some((k) => ["up", "down", "left", "right"].includes(k))).toBe(true);
  });

  it("folds every typed letter onto the one TYPE cap", () => {
    expect(capOf("char:k")).toBe("type");
    expect(capOf("erase")).toBe("erase");
    const attract = createAttract("panic", 5);
    let typed = false;
    for (let i = 0; i < 60 * 10 && !typed; i++) { attract.step(TICK); typed = (attract.lit.get("type") ?? 0) > 0; }
    expect(typed).toBe(true);
    expect([...attract.lit.keys()].every((k) => !k.startsWith("char:"))).toBe(true);
  });
});
