import { GAME_TITLES } from "@/content/arcade";
import { vectorProgram } from "./vector-program";
import type { ProgramSpec } from "./program";

/**
 * Every game the cabinet knows about.
 *
 * The hidden command still returns a ProgramSpec. The collection IDs open
 * ArcadeExperience; vectorProgram keeps a character-host compatibility bridge.
 * A new collection game also needs its engine, renderer and content entry.
 * Third-party ProgramSpecs can continue to use the legacy character host.
 *
 * The list is alphabetical by id for the same reason `lib/commands/index.ts`
 * is: four game branches will be open at once and two pull requests that touch
 * different lines merge without a conflict.
 *
 * `spec: null` is the whole "not built yet" mechanism. There is no status
 * field to forget to update, because the field would be derivable from the
 * spec and a derivable field is a field that goes stale.
 */

export type ArcadeGame = {
  id: string;
  title: string;
  spec: ProgramSpec | null;
  /** Whether a score from this game is offered to the initials board. */
  board: boolean;
};

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  { id: "panic", title: GAME_TITLES.panic, spec: vectorProgram("panic"), board: true },
  { id: "poker", title: GAME_TITLES.poker, spec: vectorProgram("poker"), board: true },
  { id: "signal", title: GAME_TITLES.signal, spec: vectorProgram("signal"), board: true },
];

export function isReady(game: ArcadeGame): boolean {
  return game.spec !== null;
}

export function findGame(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}

/** The games with a board, which is what `api/board` and `neofetch` iterate. */
export const BOARD_GAMES: readonly string[] = ARCADE_GAMES.filter((g) => g.board).map((g) => g.id);
