import { gameHud, WORLD, type GameId, type GameState, type StateOf } from "./engine";
import { box, grid, line, palette, paletteFor, text, type Palette, type Pen } from "./draw/kit";
import { drawPanic } from "./draw/panic";
import { drawPoker } from "./draw/poker";
import { drawSignal } from "./draw/signal";
import type { ArcadeTheme } from "./theme";

/**
 * Draws a game the way a vector tube would show it.
 *
 * Three things distinguish this from a plain canvas renderer, and each is a
 * consequence of the site's premise (an electron beam painting phosphor):
 *
 *  - **Persistence.** The world is drawn into a ghost layer that is faded, not
 *    cleared, every frame, so anything that moves leaves a decaying trail.
 *    The HUD is drawn sharp on the main canvas over the composite.
 *  - **Glow.** Bright strokes are laid twice with additive compositing: a wide
 *    translucent pass under a thin bright one. Never `shadowBlur`, which costs
 *    a full-canvas blur per shape.
 *  - **The theme.** Every colour comes from `paletteFor(theme)`, which is
 *    derived from the site's tokens. There is no colour literal in this file
 *    or under `draw/`, and `renderer.test.ts` proves it, so the games follow
 *    the amber and ice phosphors like everything else on the machine.
 *
 * Each cabinet's world is drawn by its own drawer in `lib/arcade/draw/`,
 * registered in `DRAWERS` beside its simulation module's id.
 */

export { paletteFor };
export type { Palette };

export type RenderOptions = {
  /** A narrow screen: the HUD's type goes up so it stays readable. */
  compact?: boolean;
  /** A second context, the same pixel size, that keeps the phosphor's memory. */
  ghost?: CanvasRenderingContext2D | null;
  /** Draw the score strip and captions. Off for the small attract screens. */
  hud?: boolean;
};

type Drawer<Id extends GameId> = (pen: Pen, s: StateOf<Id>, hud: boolean) => void;
export const DRAWERS: { readonly [K in GameId]: Drawer<K> } = { signal: drawSignal, poker: drawPoker, panic: drawPanic };

function drawWorld(pen: Pen, s: GameState, hud: boolean) {
  const { c, p } = pen;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.lineCap = "round";
  (DRAWERS[s.id] as Drawer<GameId>)(pen, s as never, hud);
  c.globalCompositeOperation = "lighter";
  for (const q of s.particles) {
    c.globalAlpha = Math.min(1, q.life * 2);
    c.fillStyle = q.amber ? p.accentBright : p.bright;
    c.fillRect(q.x, q.y, 3, 3);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

function drawHud(pen: Pen, s: GameState, compact: boolean) {
  const { c, p } = pen;
  // On a phone the canvas is a third of its desktop width, so the strip's type goes up to stay readable.
  const size = compact ? 21 : 14, y = compact ? 24 : 22;
  const hud = gameHud(s);
  line(c, { x: 12, y: 32 }, { x: 888, y: 32 }, p.dim, 1);
  text(pen, `SCORE ${String(s.score).padStart(6, "0")}`, 18, y, size, p.ink);
  if (hud.stage) text(pen, `${hud.stage.label} ${String(hud.stage.value).padStart(2, "0")}`, 450, y, size, p.accent, "center");
  if (hud.lives) text(pen, "◆".repeat(Math.max(0, hud.lives.current)), 882, y, size, p.ink, "right");
  if (s.banner) {
    box(c, 170, 277, 560, 42, p.scrim, null);
    text(pen, s.banner.sub ? `${s.banner.text} // ${s.banner.sub}` : s.banner.text, 450, 304, 16, p.accent, "center");
  }
  if (s.flash > 0) {
    c.globalAlpha = s.flash;
    box(c, 3, 35, 894, 522, null, p.accent);
    c.globalAlpha = 1;
  }
}

/** The finished screen, so an attract loop and a paused result both read as the tube's own. */
function drawOver(pen: Pen, s: GameState) {
  const { c, p } = pen;
  box(c, 0, 0, WORLD.w, WORLD.h, p.scrim, null);
  text(pen, s.won ? "CIRCUIT COMPLETE" : "SIGNAL LOST", 450, 268, 64, s.won ? p.bright : p.accent, "center", true);
  text(pen, `${s.score.toLocaleString("en-IE")} PTS`, 450, 318, 30, p.ink, "center", true);
}

/**
 * Draw one frame. `width` and `height` are the canvas's pixel size; the world
 * is 900 by 560 and scales to fit. With a ghost context the world is drawn
 * there over its own faded past and composited onto the main canvas; without
 * one it is drawn straight onto a cleared main canvas.
 */
export function renderGame(c: CanvasRenderingContext2D, s: GameState, width: number, height: number, theme: ArcadeTheme, options: RenderOptions = {}) {
  const p = palette(theme);
  const hud = options.hud !== false;
  const ghost = options.ghost ?? null;
  const sx = width / WORLD.w, sy = height / WORLD.h;

  if (ghost) {
    ghost.save();
    ghost.setTransform(sx, 0, 0, sy, 0, 0);
    ghost.globalCompositeOperation = "source-over";
    ghost.globalAlpha = 1;
    ghost.fillStyle = p.fade;
    ghost.fillRect(0, 0, WORLD.w, WORLD.h);
    drawWorld({ c: ghost, p, theme }, s, hud);
    ghost.restore();
  }

  const pen: Pen = { c, p, theme };
  c.save();
  c.setTransform(sx, 0, 0, sy, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, WORLD.w, WORLD.h);
  if (ghost) {
    // The ghost's own fill becomes opaque after a few frames, so the grid goes
    // over it rather than under it. At seven percent it reads the same either way.
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(ghost.canvas, 0, 0, width, height);
    c.setTransform(sx, 0, 0, sy, 0, 0);
    grid(c, p, WORLD.w, WORLD.h);
  } else {
    grid(c, p, WORLD.w, WORLD.h);
    drawWorld(pen, s, hud);
  }
  if (hud) drawHud(pen, s, options.compact === true);
  if (s.over) drawOver(pen, s);
  c.restore();
}
