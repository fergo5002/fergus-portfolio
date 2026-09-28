import { describe, expect, it } from "vitest";
import { cabinets } from "@/content/arcade-collection";
import { GAME_IDS } from "@/lib/arcade/engine";

/**
 * The gallery draws exactly what this file lists, so the list and the engine
 * must agree: a cabinet with no engine behind it is a poster, and an engine
 * with no cabinet is a game nobody can reach.
 */
describe("the cabinets", () => {
  it("are exactly the games the engine runs, in the engine's order", () => {
    expect(cabinets.map((c) => c.id)).toEqual([...GAME_IDS]);
  });

  it("shout their own names and speak in the terminal's lower case", () => {
    for (const c of cabinets) {
      expect(c.title, c.id).toBe(c.title.toUpperCase());
      expect(c.genre, c.id).toBe(c.genre.toUpperCase());
      for (const prose of [c.subtitle, c.description, c.objective, c.controls]) {
        expect(prose, c.id).toBe(prose.toLowerCase());
        expect(prose, c.id).not.toMatch(/!/);
      }
    }
  });
});
