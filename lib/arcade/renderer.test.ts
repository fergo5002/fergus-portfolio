import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGame, GAME_IDS, pressGame, stepGame } from "./engine";
import { paletteFor, renderGame } from "./renderer";
import { GREEN_PHOSPHOR } from "./theme";

/**
 * There is no canvas in node, so the renderer is driven through a recording
 * context: every method is a no-op that remembers it was called, every
 * property set is kept. That is enough to prove two things that matter and
 * that a screenshot cannot: the renderer never paints a colour that did not
 * come from the theme, and it draws all six games and the ghost layer without
 * throwing. What it cannot prove is what any of it looks like.
 */

type Recording = { colours: Set<string>; calls: string[] };

function recordingContext(): { ctx: CanvasRenderingContext2D; rec: Recording } {
  const rec: Recording = { colours: new Set(), calls: [] };
  const target: Record<string, unknown> = { canvas: { width: 900, height: 560 } };
  const ctx = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      if (prop === "measureText") return () => ({ width: 10 });
      return (...args: unknown[]) => {
        rec.calls.push(prop);
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop: () => {} };
        return undefined;
      };
    },
    set(t, prop: string, value) {
      if ((prop === "fillStyle" || prop === "strokeStyle") && typeof value === "string") rec.colours.add(value);
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}

const palette = paletteFor(GREEN_PHOSPHOR);
const allowed = new Set(Object.values(palette));

describe("the renderer paints only the theme", () => {
  for (const id of GAME_IDS) {
    it(`${id}: every fill and stroke comes from the palette`, () => {
      const s = createGame(id, 5);
      pressGame(s, "action");
      for (let i = 0; i < 120; i++) stepGame(s, 1 / 60, new Set(["right"]));
      const main = recordingContext(), ghost = recordingContext();
      renderGame(main.ctx, s, 900, 560, GREEN_PHOSPHOR, { ghost: ghost.ctx });
      renderGame(main.ctx, s, 450, 280, GREEN_PHOSPHOR, { compact: true });
      const painted = new Set([...main.rec.colours, ...ghost.rec.colours]);
      for (const colour of painted) expect(allowed.has(colour), `${id} painted ${colour}`).toBe(true);
      expect(main.rec.calls).toContain("fillText");
    });
  }

  it("draws the world into the ghost layer and composites it, so motion leaves phosphor trails", () => {
    const s = createGame("bounce", 5);
    const main = recordingContext(), ghost = recordingContext();
    renderGame(main.ctx, s, 900, 560, GREEN_PHOSPHOR, { ghost: ghost.ctx });
    expect(ghost.rec.calls).toContain("fillRect");
    expect(main.rec.calls).toContain("drawImage");
  });

  it("holds no colour literal of its own", () => {
    const src = readFileSync(join(process.cwd(), "lib", "arcade", "renderer.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/rgba?\(/);
  });
});

describe("paletteFor", () => {
  it("derives every translucent colour from the theme it was given", () => {
    const p = paletteFor({ ...GREEN_PHOSPHOR, ink: "#010203", accent: "#0a0b0c" });
    expect(p.ink).toBe("#010203");
    expect(p.inkGlow).toBe("rgba(1, 2, 3, 0.28)");
    expect(p.accentGlow).toBe("rgba(10, 11, 12, 0.28)");
    expect(Object.values(p).every((v) => typeof v === "string" && v.length > 0)).toBe(true);
  });
});
