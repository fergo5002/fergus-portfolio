import { describe, expect, it } from "vitest";
import { createGame, gameHud, pressGame, stepGame } from "../engine";

/**
 * Dead Signal moved into its own module on 2026-09-27 with its rules exactly
 * as they were: the next agent rebalances it, this one only gave it the shared
 * chrome. So these pin the rules as they stand, including the ones that make
 * it too easy, and the wave banner the chrome now draws.
 */
describe("Dead Signal", () => {
  it("a pulse spends charge and clears only the enemies within its range", () => {
    const s = createGame("signal", 1);
    s.enemies = [{ x: 460, y: 280, hp: 2, kind: 1, cooldown: 0 }, { x: 800, y: 280, hp: 2, kind: 1, cooldown: 0 }];
    pressGame(s, "action");
    expect(s.enemies).toHaveLength(1); expect(s.enemies[0].x).toBe(800); expect(s.charge).toBe(35); expect(s.score).toBe(25);
    pressGame(s, "action"); expect(s.charge).toBe(35);
  });

  it("lights a pulse on the player and a kill where the enemy died, in world pixels", () => {
    const s = createGame("signal", 1);
    s.enemies = [{ x: 470, y: 290, hp: 1, kind: 0, cooldown: 0 }];
    pressGame(s, "action");
    expect(s.events.at(-1)).toMatchObject({ sound: "start", at: { x: 450, y: 280 } });
    const t = createGame("signal", 2);
    t.enemies = [{ x: 700, y: 400, hp: 1, kind: 0, cooldown: 0 }];
    t.bullets = [{ x: 700, y: 400, vx: 0, vy: 0, life: 1 }];
    t.shotClock = 10;
    stepGame(t, 1 / 60, new Set());
    const kill = t.events.at(-1)!;
    expect(kill.sound).toBe("score");
    expect(kill.at.x).toBeGreaterThan(650); expect(kill.at.y).toBeGreaterThan(350);
  });

  it("loses a hull point on contact, flashes, and ends at zero", () => {
    const s = createGame("signal", 3);
    s.lives = 1;
    s.enemies = [{ x: s.player.x + 5, y: s.player.y, hp: 1, kind: 0, cooldown: 0 }];
    stepGame(s, 1 / 60, new Set());
    expect(s.lives).toBe(0);
    expect(s.over).toBe(true);
    expect(s.events.at(-1)?.sound).toBe("hurt");
  });

  it("announces each new wave with a banner", () => {
    const s = createGame("signal", 4);
    expect(s.banner?.text).toBe("WAVE 01");
    s.enemies = []; s.spawnClock = 99; s.time = 19.99;
    stepGame(s, 1 / 60, new Set());
    expect(s.level).toBe(2);
    expect(s.banner?.text).toBe("WAVE 02");
  });

  it("shows hull as icons, the wave as the stage and the pulse charge as the meter", () => {
    const s = createGame("signal", 5);
    s.charge = 50;
    expect(gameHud(s)).toEqual({
      lives: { current: 3, max: 3, icon: "hull" },
      stage: { label: "WAVE", value: 1 },
      meter: { label: "PULSE", value: 0.5, ready: 0.65 },
    });
  });
});
