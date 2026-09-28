import { describe, expect, it } from "vitest";
import { GAME_IDS, WORLD } from "./engine";
import { clientToStage, stageFor, stageKind, TALL_BREAK, toStage, toWorld } from "./layout";

/**
 * Where the world sits on the canvas. On a wide screen the stage is the world
 * with the HUD over its top edge; on a phone the stage stands up, the HUD gets
 * a band of its own in bigger type, and Circuit Poker, whose world is a card
 * table rather than a space, lays its table out for the height it is given.
 * The simulation never changes: only the projection does, which is why a
 * resize can never change a run.
 */
describe("the stage", () => {
  it("stands up below the break and lies down above it", () => {
    expect(stageKind(390)).toBe("tall");
    expect(stageKind(TALL_BREAK - 1)).toBe("tall");
    expect(stageKind(TALL_BREAK)).toBe("wide");
    expect(stageKind(1180)).toBe("wide");
    expect(stageKind(0)).toBe("wide");
  });

  for (const id of GAME_IDS) {
    it(`${id}: the wide stage is the world, with the HUD across its top edge`, () => {
      const s = stageFor(id, "wide");
      expect([s.w, s.h]).toEqual([WORLD.w, WORLD.h]);
      expect(s.world).toEqual({ x: 0, y: 0, s: 1 });
      expect(s.hud.y).toBe(0);
      expect(s.big).toBe(false);
    });

    it(`${id}: the tall stage is taller than the wide one, with the HUD in a band above the world`, () => {
      const s = stageFor(id, "tall");
      expect(s.h).toBeGreaterThan(stageFor(id, "wide").h);
      expect(s.big).toBe(true);
      expect(s.hud.h).toBeGreaterThan(stageFor(id, "wide").hud.h);
      if (id !== "poker") {
        expect(s.world.y).toBeGreaterThanOrEqual(s.hud.y + s.hud.h);
        expect(s.world.y + WORLD.h * s.world.s).toBeLessThanOrEqual(s.h);
      }
    });
  }

  it("maps a world point onto the stage and back", () => {
    const s = stageFor("signal", "tall");
    const p = { x: 123, y: 456 };
    expect(toWorld(s, toStage(s, p))).toEqual(p);
    expect(toStage(s, { x: 0, y: 0 })).toEqual({ x: s.world.x, y: s.world.y });
  });

  it("maps a pointer on the canvas into stage units, whatever size the canvas is drawn", () => {
    const s = stageFor("poker", "tall");
    const rect = { left: 16, top: 100, width: 358, height: 358 * (s.h / s.w) };
    expect(clientToStage(s, rect, 16, 100)).toEqual({ x: 0, y: 0 });
    const mid = clientToStage(s, rect, 16 + 179, 100 + rect.height / 2);
    expect(mid.x).toBeCloseTo(s.w / 2);
    expect(mid.y).toBeCloseTo(s.h / 2);
  });
});
