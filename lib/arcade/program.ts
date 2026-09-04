import type { ArcadeKey } from "./input";
import type { ArcadeSound } from "./sound";

/**
 * What a program (a game, in practice) is allowed to see of the terminal, and
 * what the terminal is allowed to ask of it.
 *
 * Frozen by the toolshed design (section 8): every game plan is written against
 * these names. Add to them if a game needs more; never rename.
 *
 * G0 built the runtime and added, without renaming anything:
 *
 *  - `ProgramResult`, and `exit(result?)`. Widening a method with an optional
 *    parameter is compatible in both directions: `host.exit()` still compiles,
 *    and a host implementing `exit: () => {}` is still assignable, because a
 *    function taking fewer parameters is assignable to one taking more.
 *  - `flash`, so a game can knock the tube. The runtime turns grid coordinates
 *    into a `pushImpact` on the system frame, which is the seam the shader and
 *    the synth already read in the same frame. It is capped at one call a tick
 *    so a game cannot fill `MAX_FRAME_IMPACTS` and starve the physics stage.
 *  - `run`, so the cabinet can hand the screen to the game it launches.
 *  - `key`'s first parameter narrowed from `string` to `ArcadeKey`. Compatible
 *    for the same reason turned round: parameter positions are contravariant,
 *    so an implementation typed `(key: string, ...)` still satisfies it. What
 *    it buys is an exhaustive switch in every game.
 *
 * `lib/arcade/program.test.ts` is the compile-time proof of both claims.
 *
 * A host may update `cols` and `rows` when its measured container changes. A
 * program reads them when drawing; it must not treat the initial values as a
 * lifetime constant. A host also stops delivering ticks to an instance as
 * soon as that instance exits or starts another program, even if one rendered
 * frame contained several fixed timesteps.
 */

export type ProgramResult = {
  /** Offered to the board when the game has one. Omit and the prompt returns. */
  score?: number;
  /** A short line for the scrollback, in place of the default. */
  label?: string;
};

export type ProgramHost = {
  cols: number;
  rows: number;
  draw(lines: string[]): void;
  sound?(name: ArcadeSound): void;
  flash?(col: number, row: number, energy: number): void;
  run?(spec: ProgramSpec): void;
  exit(result?: ProgramResult): void;
};

export type ProgramInstance = {
  tick(dtMs: number): void;
  key(key: ArcadeKey, down: boolean): void;
  swipe?(dir: "up" | "down" | "left" | "right"): void;
  /** The measured character world changed. Keep live state inside it and redraw. */
  resize?(cols: number, rows: number): void;
  dispose(): void;
};

export type ProgramSpec = {
  id: string;
  title: string;
  start(host: ProgramHost): ProgramInstance;
};
