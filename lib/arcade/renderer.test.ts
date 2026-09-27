import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cabinets, screenCopy } from "@/content/arcade-collection";
import { createGame, GAME_IDS, pressGame, stepGame } from "./engine";
import { stageFor, type StageKind } from "./layout";
import { paletteFor, renderGame, renderRun, type RunView } from "./renderer";
import { BEAT, COUNTDOWN, createRun, pressRun, stepRun, type Run } from "./run";
import { GREEN_PHOSPHOR } from "./theme";

/**
 * There is no canvas in node, so the renderer is driven through a recording
 * context: every method is a no-op that remembers it was called, every
 * property set is kept. That is enough to prove two things that matter and
 * that a screenshot cannot: the renderer never paints a colour that did not
 * come from the theme, and it draws every game and the ghost layer without
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
    const s = createGame("signal", 5);
    const main = recordingContext(), ghost = recordingContext();
    renderGame(main.ctx, s, 900, 560, GREEN_PHOSPHOR, { ghost: ghost.ctx });
    expect(ghost.rec.calls).toContain("fillRect");
    expect(main.rec.calls).toContain("drawImage");
  });

  it("holds no colour literal of its own, in the renderer, the chrome or any drawer", () => {
    const dir = join(process.cwd(), "lib", "arcade");
    const files = ["renderer.ts", "chrome.ts", ...readdirSync(join(dir, "draw")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join("draw", f))];
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, file).not.toMatch(/rgba?\(/);
    }
  });
});

/**
 * The room's renderer, through every phase of a run on both stages. What this
 * proves: nothing is painted outside the palette, the chrome draws words at
 * every phase, and the world goes through the ghost layer once play starts.
 * What it cannot prove is how any of it looks; the screenshots do that.
 */
describe("a run on its stage", () => {
  const view = (id: (typeof GAME_IDS)[number], kind: StageKind, ghost: CanvasRenderingContext2D | null, touch = false): RunView => {
    const face = cabinets.find((c) => c.id === id)!;
    return { stage: stageFor(id, kind), ghost, touch, face, words: screenCopy };
  };
  const phases = (id: (typeof GAME_IDS)[number]): [string, Run][] => {
    const card = createRun(id, 9);
    for (let i = 0; i < 90; i++) stepRun(card, 1 / 60, new Set());
    const countdown = createRun(id, 9, { skipCard: true });
    stepRun(countdown, BEAT * 1.5, new Set());
    const play = createRun(id, 9, { skipCard: true });
    for (let i = 0; i < Math.round(BEAT * COUNTDOWN.length * 60) + 30; i++) stepRun(play, 1 / 60, new Set(["right"]));
    pressRun(play, "action");
    const over = createRun(id, 9, { skipCard: true, best: 10 });
    for (let i = 0; i < Math.round(BEAT * COUNTDOWN.length * 60) + 2; i++) stepRun(over, 1 / 60, new Set());
    over.game.score = 1240; over.game.over = true;
    for (let i = 0; i < 120; i++) stepRun(over, 1 / 60, new Set());
    return [["card", card], ["countdown", countdown], ["play", play], ["over", over]];
  };

  for (const id of GAME_IDS) {
    for (const kind of ["wide", "tall"] as const) {
      it(`${id}, ${kind}: every phase paints only the palette and writes its words`, () => {
        for (const [phase, run] of phases(id)) {
          expect(run.phase, phase).toBe(phase);
          const stage = stageFor(id, kind);
          const main = recordingContext(), ghost = recordingContext();
          renderRun(main.ctx, run, stage.w / 2, stage.h / 2, GREEN_PHOSPHOR, view(id, kind, ghost.ctx, kind === "tall"));
          const painted = new Set([...main.rec.colours, ...ghost.rec.colours]);
          for (const colour of painted) expect(allowed.has(colour), `${id}/${kind}/${phase} painted ${colour}`).toBe(true);
          expect(main.rec.calls, `${id}/${kind}/${phase}`).toContain("fillText");
          if (phase === "card") expect(ghost.rec.calls, "the card needs no persistence").not.toContain("fillRect");
          else expect(main.rec.calls, `${id}/${kind}/${phase} composites the ghost`).toContain("drawImage");
        }
      });
    }
  }

  it("draws the words the card and the finished screen need", () => {
    const texts: string[] = [];
    const { ctx } = recordingContext();
    const spy = new Proxy(ctx, { get: (t, prop) => (prop === "fillText" ? (value: string) => texts.push(value) : Reflect.get(t, prop)) });
    const card = createRun("poker", 3);
    renderRun(spy, card, 900, 560, GREEN_PHOSPHOR, view("poker", "wide", null));
    expect(texts).toContain("CIRCUIT POKER");
    expect(texts).not.toContain("HOW TO PLAY");
    expect(texts).toContain("SPACE");
    expect(texts).toContain("ENTER");
    texts.length = 0;
    renderRun(spy, card, 900, 1240, GREEN_PHOSPHOR, view("poker", "tall", null, true));
    expect(texts).toContain("TAP A CARD");
    texts.length = 0;
    const over = createRun("signal", 4, { skipCard: true });
    over.phase = "over"; over.clock = 2.5; over.game.score = 4200; // 2.5s: tallied, and NEW BEST is in the on half of its blink.
    renderRun(spy, over, 900, 560, GREEN_PHOSPHOR, view("signal", "wide", null));
    expect(texts).toContain(screenCopy.gameOver);
    expect(texts).toContain("SIGNAL LOST");
    expect(texts).toContain("4,200");
    expect(texts).toContain(screenCopy.newBest);
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
