import { createAttract, type Attract } from "./attract";
import { createGame, pressGame, stepGame, type GameId, type GameState } from "./engine";

/**
 * The cabinet around a game, which every game shares.
 *
 *   card ─first Space─▶ countdown ─READY 3 2 1─▶ play ─game ends─▶ over
 *
 * The **card** is attract mode with the instructions on it: the cabinet plays
 * itself behind a how-to-play panel whose keycaps light as the demo presses
 * them, and nothing about the real run has started. The first Space (or
 * Enter, or a tap) starts the **countdown**, which holds the fresh game still
 * for four beats. **Play** steps the game and routes keys to it. **Over**
 * holds the GAME OVER screen for a moment before the room shows the result
 * panel, so the end of a run is something you see rather than something that
 * happens to the page.
 *
 * Pure and stepped by the host's fixed tick like the games themselves: no
 * timers, so a busy main thread slows it down evenly instead of skipping a
 * beat, and a hidden tab cannot run the countdown out behind anybody's back.
 */

export type RunPhase = "card" | "countdown" | "play" | "over";

export type Run = {
  id: GameId;
  phase: RunPhase;
  /** Seconds spent in the current phase. */
  clock: number;
  game: GameState;
  /** The card's live demo. A separate game with its own dice, never the real run. */
  demo: Attract;
  /** The score to beat, shown in the HUD: the session's best or the board's top row. */
  best: number;
  paused: boolean;
};

export const COUNTDOWN = ["READY", "3", "2", "1"] as const;
/** Seconds a countdown step holds. */
export const BEAT = 0.7;
/** Seconds the GAME OVER screen holds before the result panel is due. */
export const OVER_HOLD = 1.6;

export function createRun(id: GameId, seed: number, options: { best?: number; skipCard?: boolean } = {}): Run {
  return {
    id,
    phase: options.skipCard ? "countdown" : "card",
    clock: 0,
    game: createGame(id, seed),
    demo: createAttract(id, (seed ^ 0x5bd1e995) >>> 0),
    best: Math.max(0, options.best ?? 0),
    paused: false,
  };
}

/** Card to countdown. True only the once it happens. */
export function startRun(run: Run): boolean {
  if (run.phase !== "card") return false;
  run.phase = "countdown";
  run.clock = 0;
  return true;
}

/** Pause or resume. Only a countdown or a game in play can be paused; the answer says whether it was. */
export function pauseRun(run: Run, paused: boolean): boolean {
  if (run.phase !== "countdown" && run.phase !== "play") {
    run.paused = false;
    return false;
  }
  run.paused = paused;
  return true;
}

export function stepRun(run: Run, dt: number, keys: ReadonlySet<string>): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  switch (run.phase) {
    case "card":
      run.clock += dt;
      run.demo.step(dt);
      return;
    case "countdown":
      if (run.paused) return;
      run.clock += dt;
      if (run.clock >= BEAT * COUNTDOWN.length) {
        run.phase = "play";
        run.clock = 0;
      }
      return;
    case "play":
      if (run.paused) return;
      run.clock += dt;
      stepGame(run.game, dt, keys);
      if (run.game.over) {
        run.phase = "over";
        run.clock = 0;
        run.paused = false;
      }
      return;
    case "over":
      run.clock += dt;
      return;
  }
}

/**
 * A key, or a tap mapped to one. On the card, Space (`action`) and Enter
 * (`bank`) start the run and go no further, so the start key is never also a
 * move. In play, it goes to the game. Anything else is swallowed.
 */
export function pressRun(run: Run, key: string): "start" | "game" | null {
  if (run.phase === "card") return (key === "action" || key === "bank") && startRun(run) ? "start" : null;
  if (run.phase !== "play" || run.paused) return null;
  pressGame(run.game, key);
  return "game";
}

export function countdownLabel(run: Run): string | null {
  if (run.phase !== "countdown") return null;
  return COUNTDOWN[Math.min(COUNTDOWN.length - 1, Math.floor(run.clock / BEAT))];
}

/** How far into its beat the countdown is, 0 to 1, for the numbers' punch. */
export function countdownBeat(run: Run): number {
  return run.phase === "countdown" ? (run.clock % BEAT) / BEAT : 0;
}

export function resultDue(run: Run): boolean {
  return run.phase === "over" && run.clock >= OVER_HOLD;
}

export function isNewBest(run: Run): boolean {
  return run.game.score > 0 && run.game.score > run.best;
}
