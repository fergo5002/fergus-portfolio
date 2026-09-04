import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { blankGrid, centre, put, toLines, write } from "./grid";
import type { ArcadeKey } from "./input";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "./program";

/**
 * The worked example, and the runtime's own test rig.
 *
 * It does one thing: a character crosses the grid and turns at the walls. The
 * arrows and a swipe steer it, fire reverses it, every wall knocks the tube,
 * and `start` cashes the bounces in at the board. It is not a game and it is
 * not pretending to be one.
 *
 * It is kept rather than deleted once the runtime is proven. Every runtime test
 * drives this object, so what the tests prove and what a visitor plays cannot
 * drift apart; it gives the post-deploy check something real to run before G1
 * exists; and it is the smallest complete example a game plan can read, which
 * is the whole shape: a reducer, a view, a spec.
 */

/** One cell every third tick, which is ten cells a second at 30Hz. */
export const BOUNCE_STEP_TICKS = 3;
export const BOUNCE_GLYPH = "O";

export type BounceState = {
  x: number;
  y: number;
  dx: -1 | 1;
  dy: -1 | 1;
  bounces: number;
  ticks: number;
};

export function initialBounceState(cols: number, rows: number): BounceState {
  return { x: Math.floor(cols / 2), y: Math.floor(rows / 2), dx: 1, dy: 1, bounces: 0, ticks: 0 };
}

/**
 * One tick. Mutates in place, the way `advance` does, and returns whether this
 * tick hit a wall so the host can flash and click on the same frame.
 */
export function stepBounce(state: BounceState, cols: number, rows: number): "none" | "wall" {
  state.ticks++;
  if (state.ticks % BOUNCE_STEP_TICKS !== 0) return "none";
  let hit = false;
  if (state.x + state.dx < 0 || state.x + state.dx >= cols) {
    state.dx = state.dx === 1 ? -1 : 1;
    hit = true;
  }
  if (state.y + state.dy < 0 || state.y + state.dy >= rows) {
    state.dy = state.dy === 1 ? -1 : 1;
    hit = true;
  }
  state.x += state.dx;
  state.y += state.dy;
  if (hit) state.bounces++;
  return hit ? "wall" : "none";
}

/** Keep a live ball visible when the measured character world becomes smaller. */
export function resizeBounce(state: BounceState, cols: number, rows: number): BounceState {
  state.x = Math.max(0, Math.min(state.x, cols - 1));
  state.y = Math.max(0, Math.min(state.y, rows - 1));
  return state;
}

export function steerBounce(state: BounceState, key: ArcadeKey): BounceState {
  switch (key) {
    case "up":
      state.dy = -1;
      break;
    case "down":
      state.dy = 1;
      break;
    case "left":
      state.dx = -1;
      break;
    case "right":
      state.dx = 1;
      break;
    case "fire":
      state.dx = state.dx === 1 ? -1 : 1;
      state.dy = state.dy === 1 ? -1 : 1;
      break;
    default:
      break;
  }
  return state;
}

export function bounceView(state: BounceState, cols: number, rows: number): string[] {
  const grid = blankGrid(cols, rows);
  write(grid, 0, 0, `${arcadeCopy.bounce.score} ${state.bounces}`);
  put(grid, state.x, state.y, BOUNCE_GLYPH);
  centre(grid, rows - 1, arcadeCopy.bounce.footer);
  return toLines(grid);
}

export const bounce: ProgramSpec = {
  id: "bounce",
  title: GAME_TITLES.bounce,
  start(host: ProgramHost): ProgramInstance {
    const state = initialBounceState(host.cols, host.rows);
    const render = () => host.draw(bounceView(state, host.cols, host.rows));
    render();
    return {
      tick() {
        if (stepBounce(state, host.cols, host.rows) === "wall") {
          host.sound?.("wall");
          host.flash?.(state.x, state.y, 0.3);
        }
        render();
      },
      key(key, down) {
        if (!down) return;
        if (key === "start") {
          host.exit({ score: state.bounces });
          return;
        }
        steerBounce(state, key);
        render();
      },
      swipe(dir) {
        steerBounce(state, dir);
        render();
      },
      resize(cols, rows) {
        resizeBounce(state, cols, rows);
        render();
      },
      dispose() {
        /* nothing to release: no timers, no listeners, no buffers */
      },
    };
  },
};
