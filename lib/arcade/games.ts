import { GAME_TITLES } from "@/content/arcade";
import { bounce } from "./bounce";
import type { ProgramSpec } from "./program";

/**
 * Every game the cabinet knows about.
 *
 * **This is the file a game plan edits, and it edits two lines: an import and
 * an entry.** G1 adds `import { pong } from "./pong";` and swaps `spec: null`
 * for `spec: pong` on the `pong` row. Nothing else in the runtime, the
 * terminal, the stylesheet or the route changes when a game arrives.
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
  { id: "bounce", title: GAME_TITLES.bounce, spec: bounce, board: true },
  { id: "poker", title: GAME_TITLES.poker, spec: null, board: true },
  { id: "pong", title: GAME_TITLES.pong, spec: null, board: true },
  { id: "snake", title: GAME_TITLES.snake, spec: null, board: true },
  { id: "under", title: GAME_TITLES.under, spec: null, board: true },
];

export function isReady(game: ArcadeGame): boolean {
  return game.spec !== null;
}

export function findGame(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}

/** The games with a board, which is what `api/board` and `neofetch` iterate. */
export const BOARD_GAMES: readonly string[] = ARCADE_GAMES.filter((g) => g.board).map((g) => g.id);
