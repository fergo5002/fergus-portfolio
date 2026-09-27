import { drawBanner, drawCard, drawCountdown, drawGameOver, drawHud, type CabinetFace, type ScreenWords } from "./chrome";
import { gameHud, WORLD, type GameId, type GameState, type Point, type StateOf } from "./engine";
import { box, grid, palette, paletteFor, text, type Palette, type Pen } from "./draw/kit";
import { drawPanic } from "./draw/panic";
import { drawPoker, pokerPoint } from "./draw/poker";
import { drawSignal } from "./draw/signal";
import { stageFor, toStage, type Rect, type Stage, type StageKind } from "./layout";
import type { Run } from "./run";
import type { ArcadeTheme } from "./theme";

/**
 * Draws a game the way a vector tube would show it.
 *
 * Three things distinguish this from a plain canvas renderer, and each is a
 * consequence of the site's premise (an electron beam painting phosphor):
 *
 *  - **Persistence.** The world is drawn into a ghost layer that is faded, not
 *    cleared, every frame, so anything that moves leaves a decaying trail.
 *    The HUD and the chrome are drawn sharp on the main canvas over it.
 *  - **Glow.** Bright strokes are laid twice with additive compositing: a wide
 *    translucent pass under a thin bright one. Never `shadowBlur`, which costs
 *    a full-canvas blur per shape.
 *  - **The theme.** Every colour comes from `paletteFor(theme)`, which is
 *    derived from the site's tokens. There is no colour literal in this file,
 *    in `chrome.ts` or under `draw/`, and `renderer.test.ts` proves it, so the
 *    games follow the amber and ice phosphors like everything else on the
 *    machine.
 *
 * Two entry points. `renderGame` draws a bare world, for the gallery's attract
 * screens. `renderRun` draws a run in the room: the world on its stage, the
 * HUD, and whichever part of the shared chrome the run's phase calls for.
 * Each cabinet's world is drawn by its own drawer in `lib/arcade/draw/`,
 * registered in `DRAWERS` under its module's id.
 */

export { paletteFor };
export type { Palette };

export type RenderOptions = {
  /** Kept for callers of the bare renderer; a narrow attract screen needs nothing different. */
  compact?: boolean;
  /** A second context, the same pixel size, that keeps the phosphor's memory. */
  ghost?: CanvasRenderingContext2D | null;
  /** Draw the drawer's own captions. Off for the small attract screens. */
  hud?: boolean;
};

type Drawer<Id extends GameId> = (pen: Pen, s: StateOf<Id>, hud: boolean, layout: StageKind) => void;
export const DRAWERS: { readonly [K in GameId]: Drawer<K> } = { signal: drawSignal, poker: drawPoker, panic: drawPanic };

function drawWorld(pen: Pen, s: GameState, hud: boolean, layout: StageKind) {
  const { c, p } = pen;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.lineCap = "round";
  (DRAWERS[s.id] as Drawer<GameId>)(pen, s as never, hud, layout);
  c.globalCompositeOperation = "lighter";
  for (const q of s.particles) {
    c.globalAlpha = Math.min(1, q.life * 2);
    c.fillStyle = q.amber ? p.accentBright : p.bright;
    c.fillRect(q.x, q.y, 3, 3);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

/** Where the world is played on a stage: the 900 by 560 world, or all of a poker table below the HUD. */
export function playRect(id: GameId, stage: Stage): Rect {
  if (id === "poker" && stage.kind === "tall") return { x: 0, y: stage.hud.h, w: stage.w, h: stage.h - stage.hud.h };
  return { x: stage.world.x, y: stage.world.y, w: WORLD.w * stage.world.s, h: WORLD.h * stage.world.s };
}

/** Where a world point is on the stage, so an event lights the tube where it was drawn. */
export function eventPoint(id: GameId, at: Point, stage: Stage): Point {
  if (id === "poker") return pokerPoint(at, stage.kind);
  return toStage(stage, at);
}

/**
 * Draw a bare world, for an attract screen. `width` and `height` are the
 * canvas's pixel size; the world is 900 by 560 and scales to fit. With a
 * ghost context the world is drawn there over its own faded past and
 * composited onto the main canvas; without one it is drawn straight onto a
 * cleared main canvas.
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
    drawWorld({ c: ghost, p, theme }, s, hud, "wide");
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
    drawWorld(pen, s, hud, "wide");
  }
  if (s.over) {
    box(c, 0, 0, WORLD.w, WORLD.h, p.scrim, null);
    text(pen, `${s.score} PTS`, 450, 300, 40, p.ink, "center", true);
  }
  c.restore();
}

export type RunView = {
  stage: Stage;
  ghost: CanvasRenderingContext2D | null;
  /** A touch screen: the card says TAP TO START and shows the on-screen controls' names. */
  touch: boolean;
  face: CabinetFace;
  words: ScreenWords;
};

/** Draw a run in the room, on its stage, with the chrome its phase calls for. */
export function renderRun(c: CanvasRenderingContext2D, run: Run, width: number, height: number, theme: ArcadeTheme, view: RunView) {
  const p = palette(theme);
  const { stage, ghost } = view;
  const sx = width / stage.w, sy = height / stage.h;
  const pen: Pen = { c, p, theme };
  const play = playRect(run.id, stage);
  const card = run.phase === "card";

  if (ghost && !card) {
    ghost.save();
    ghost.setTransform(sx, 0, 0, sy, 0, 0);
    ghost.globalCompositeOperation = "source-over";
    ghost.globalAlpha = 1;
    ghost.fillStyle = p.fade;
    ghost.fillRect(0, 0, stage.w, stage.h);
    ghost.translate(stage.world.x, stage.world.y);
    ghost.scale(stage.world.s, stage.world.s);
    drawWorld({ c: ghost, p, theme }, run.game, true, stage.kind);
    ghost.restore();
  }

  c.save();
  c.setTransform(sx, 0, 0, sy, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, stage.w, stage.h);

  if (card) {
    grid(c, p, stage.w, stage.h, 0);
    const demoStage = stageFor(run.id, "wide");
    drawCard(pen, stage, run, view.face, view.words, view.touch, (scale) => {
      c.save();
      c.scale(scale, scale);
      grid(c, p, demoStage.w, demoStage.h, 0);
      drawWorld(pen, run.demo.state, false, "wide");
      c.restore();
    });
    c.restore();
    return;
  }

  if (ghost) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(ghost.canvas, 0, 0, width, height);
    c.setTransform(sx, 0, 0, sy, 0, 0);
  } else {
    c.save();
    c.translate(stage.world.x, stage.world.y);
    c.scale(stage.world.s, stage.world.s);
    drawWorld(pen, run.game, true, stage.kind);
    c.restore();
  }
  grid(c, p, stage.w, play.y + play.h, play.y);

  // Under the HUD, so a countdown's veil or a banner never dims the score.
  if (run.phase === "play" && run.game.banner) drawBanner(pen, stage, play, run.game.banner);
  if (run.phase === "countdown") drawCountdown(pen, stage, play, run);
  const hud = gameHud(run.game);
  drawHud(pen, stage, hud, run.game.score, run.best, view.words);
  if (run.game.flash > 0) {
    c.globalAlpha = Math.min(1, run.game.flash * 2.4);
    box(c, play.x + 3, play.y + 3, play.w - 6, play.h - 6, null, p.accent, undefined, stage.big ? 5 : 3);
    c.globalAlpha = 1;
  }
  if (run.phase === "over") drawGameOver(pen, stage, run, view.face, hud, view.words);
  c.restore();
}
