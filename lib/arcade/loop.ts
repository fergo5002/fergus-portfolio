/**
 * The arcade's clock.
 *
 * The site has exactly one `requestAnimationFrame` loop and it lives in
 * `components/system/SystemProvider.tsx` (AGENTS.md, "One frame clock"). The
 * arcade never starts a second one: it subscribes with `onFrame` and turns the
 * frame deltas it is handed into a whole number of fixed ticks. That is what
 * makes a game a pure function of state and input, drivable in node with no
 * browser, and the same speed on a 60Hz laptop and a 120Hz phone.
 *
 * Thirty a second, and the reason is the grid. A character cell is the smallest
 * thing that can change, so a tick that cannot move anything into a new cell is
 * work nobody can see. At 48 columns one cell a tick crosses the screen in 1.6
 * seconds, which is a Pong ball; slower things count ticks. Worst case a key
 * waits one tick and one frame, about 50ms. Sixty would double the cost for no
 * visible change.
 *
 * Two things the provider already guarantees, which this leans on: it clamps
 * its delta to 64ms, and it does not call subscribers at all while
 * `document.hidden`. So a backgrounded tab pauses the game, banks nothing, and
 * produces no catch-up burst on return. `MAX_TICKS_PER_FRAME` is belt and
 * braces for a caller that is not the provider, and every test is one.
 */

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

/**
 * The most ticks one frame may run. Beyond this the backlog is dropped rather
 * than played: a stall is not time the player lived through, and running it
 * teleports everything on screen.
 */
export const MAX_TICKS_PER_FRAME = 4;

export type LoopState = {
  /** Unspent milliseconds, carried between frames so speed does not drift. */
  acc: number;
  /** Every tick since the loop started. Games seed effects off it. */
  ticks: number;
};

export function createLoopState(): LoopState {
  return { acc: 0, ticks: 0 };
}

/**
 * Advance by one frame. Calls `tick` once per whole timestep, always with
 * `TICK_MS` and never with the frame delta, and returns how many times it did.
 */
export function advance(state: LoopState, dtMs: number, tick: (ms: number) => void): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  state.acc += dtMs;
  let steps = 0;
  while (state.acc >= TICK_MS) {
    if (steps >= MAX_TICKS_PER_FRAME) {
      state.acc = 0;
      break;
    }
    state.acc -= TICK_MS;
    state.ticks++;
    steps++;
    tick(TICK_MS);
  }
  return steps;
}
