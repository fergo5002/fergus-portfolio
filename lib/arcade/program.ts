/**
 * What a program (a game, in practice) is allowed to see of the terminal, and
 * what the terminal is allowed to ask of it.
 *
 * Types only. The runtime that hosts a program, ticks it, draws its grid and
 * routes keys and swipes to it is sub-project G0. Until then a `program` result
 * from a command makes the Terminal print the title and hand the prompt back.
 *
 * Frozen by the toolshed design (section 8): every game plan is written against
 * these names. Add to them if a game needs more; never rename.
 */

export type ProgramHost = {
  cols: number;
  rows: number;
  draw(lines: string[]): void;
  sound?(name: string): void;
  exit(): void;
};

export type ProgramInstance = {
  tick(dtMs: number): void;
  key(key: string, down: boolean): void;
  swipe?(dir: "up" | "down" | "left" | "right"): void;
  dispose(): void;
};

export type ProgramSpec = {
  id: string;
  title: string;
  start(host: ProgramHost): ProgramInstance;
};
