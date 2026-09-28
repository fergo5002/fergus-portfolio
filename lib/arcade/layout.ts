import { WORLD, type GameId, type Point } from "./engine";

/**
 * Where a game sits on its canvas.
 *
 * The canvas is drawn in stage units. On a wide screen the stage is the
 * 900 by 560 world itself, with the HUD across the world's top edge, where
 * every game has always kept clear. On a phone the canvas is about 360 pixels
 * across, a world pixel is 0.4 of a screen pixel, and HUD type small enough
 * to fit the world's top edge is unreadable, so the stage stands up: the HUD
 * gets a band of its own in type twice the size, and the world sits under it.
 *
 * Circuit Poker is the exception that proves why this is a table and not a
 * formula. Its world is a card table, not a space anything moves through, so
 * on a phone it lays the table out again for the height (big cards, a
 * paytable you can read) instead of shrinking the wide one; its drawer owns
 * that layout, and `world` is the identity for it.
 *
 * Only the projection changes between the two. The simulation never sees any
 * of this, which is why a resize, or a phone turned on its side, cannot change
 * a run.
 */

export type StageKind = "wide" | "tall";
export type Rect = { x: number; y: number; w: number; h: number };
export type Stage = {
  kind: StageKind;
  /** The stage's size, in the units everything on the canvas is drawn in. */
  w: number;
  h: number;
  /** Where the HUD is drawn. */
  hud: Rect;
  /** World to stage: `stage = world * s + (x, y)`. */
  world: { x: number; y: number; s: number };
  /** Phone-sized type for the HUD and the chrome. */
  big: boolean;
};

/** Below this many CSS pixels of frame, the stage stands up. */
export const TALL_BREAK = 600;

export function stageKind(frameWidth: number): StageKind {
  return frameWidth > 0 && frameWidth < TALL_BREAK ? "tall" : "wide";
}

const WIDE: Stage = { kind: "wide", w: WORLD.w, h: WORLD.h, hud: { x: 0, y: 0, w: WORLD.w, h: 44 }, world: { x: 0, y: 0, s: 1 }, big: false };
const TALL_HUD = 150;
const TALL: Stage = { kind: "tall", w: WORLD.w, h: TALL_HUD + WORLD.h + 10, hud: { x: 0, y: 0, w: WORLD.w, h: TALL_HUD }, world: { x: 0, y: TALL_HUD + 4, s: 1 }, big: true };
const POKER_TALL: Stage = { kind: "tall", w: WORLD.w, h: 1240, hud: { x: 0, y: 0, w: WORLD.w, h: TALL_HUD }, world: { x: 0, y: 0, s: 1 }, big: true };

export function stageFor(id: GameId, kind: StageKind): Stage {
  if (kind === "wide") return WIDE;
  return id === "poker" ? POKER_TALL : TALL;
}

export function toStage(stage: Stage, p: Point): Point {
  return { x: stage.world.x + p.x * stage.world.s, y: stage.world.y + p.y * stage.world.s };
}

export function toWorld(stage: Stage, p: Point): Point {
  return { x: (p.x - stage.world.x) / stage.world.s, y: (p.y - stage.world.y) / stage.world.s };
}

/** A pointer's client position, through the canvas's rect, into stage units. */
export function clientToStage(stage: Stage, rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): Point {
  return {
    x: rect.width > 0 ? ((clientX - rect.left) / rect.width) * stage.w : 0,
    y: rect.height > 0 ? ((clientY - rect.top) / rect.height) * stage.h : 0,
  };
}
