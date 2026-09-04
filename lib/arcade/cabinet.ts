import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import type { BoardSnapshot } from "./board";
import { formatBoard } from "./board";
import { ARCADE_GAMES, isReady } from "./games";
import type { ArcadeGame } from "./games";
import { blankGrid, centre, toLines, write } from "./grid";
import type { ArcadeKey } from "./input";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "./program";
import { arcadeSession } from "./session";

/**
 * What `cd arcade` opens: the game list, drawn in the grid, with the selected
 * game's board under it.
 *
 * It is a program like any other, which is what lets it use the runtime's own
 * loop, keys, swipes and Escape rather than a second set of everything. It
 * hands the screen to a game through `host.run`, and a game that has not been
 * built yet says so in place rather than launching nothing.
 *
 * Only the selected game's board is drawn. Five boards do not fit in sixteen
 * rows, and a cursor that changes what is under it is a better answer than a
 * list nobody can read.
 */

export type CabinetState = {
  index: number;
  /** A one-line answer to the last key, shown in place of the footer. */
  note: string | null;
};

export function initialCabinetState(): CabinetState {
  return { index: 0, note: null };
}

export function cabinetReduce(
  state: CabinetState,
  key: ArcadeKey,
  games: readonly ArcadeGame[],
): { state: CabinetState; launch: ArcadeGame | null } {
  if (games.length === 0) return { state, launch: null };
  const pick = (index: number): { state: CabinetState; launch: ArcadeGame | null } => {
    const game = games[index];
    if (!game) return { state, launch: null };
    if (!isReady(game)) return { state: { index, note: arcadeCopy.cabinet.notReady }, launch: null };
    return { state: { index, note: null }, launch: game };
  };

  switch (key) {
    case "up":
      return { state: { index: (state.index - 1 + games.length) % games.length, note: null }, launch: null };
    case "down":
      return { state: { index: (state.index + 1) % games.length, note: null }, launch: null };
    case "start":
    case "fire":
      return pick(state.index);
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      return Number(key) - 1 < games.length ? pick(Number(key) - 1) : { state, launch: null };
    default:
      return { state, launch: null };
  }
}

export function cabinetView(
  state: CabinetState,
  games: readonly ArcadeGame[],
  boards: BoardSnapshot | null,
  cols: number,
  rows: number,
): string[] {
  const grid = blankGrid(cols, rows);
  centre(grid, 0, arcadeCopy.cabinet.title);

  games.forEach((game, i) => {
    const cursor = i === state.index ? ">" : " ";
    const label = isReady(game) ? game.title : `(${game.title})`;
    write(grid, 1, 2 + i, `${cursor} ${i + 1} ${label}`);
  });

  const boardTop = 3 + games.length;
  const selected = games[state.index];
  const board = boards?.available ? boards.boards.find((b) => b.game === selected?.id) : undefined;
  const panel = board
    ? formatBoard(board, cols - 2, GAME_TITLES[board.game] ?? board.game)
    : [...arcadeCopy.board.unavailable];
  const room = rows - 1 - boardTop;
  write(grid, 1, boardTop - 1, arcadeCopy.cabinet.boardsHeading);
  panel.slice(0, Math.max(0, room)).forEach((line, i) => write(grid, 1, boardTop + i, line));

  centre(grid, rows - 1, state.note ?? arcadeCopy.cabinet.footer);
  return toLines(grid);
}

/**
 * The cabinet reads the board snapshot off the session rather than being handed
 * one. That is what lets it need no member outside `ProgramInstance`, so the
 * frozen type stays frozen and there is no cast anywhere in the arcade.
 * `ArcadeScreen` fetches once, calls `setArcadeBoards`, and the next tick's
 * redraw picks it up.
 */
export function createCabinet(): ProgramSpec {
  return {
    id: "arcade",
    title: arcadeCopy.cabinet.title,
    start(host: ProgramHost): ProgramInstance {
      let state = initialCabinetState();
      const render = () =>
        host.draw(cabinetView(state, ARCADE_GAMES, arcadeSession().boards, host.cols, host.rows));
      render();
      return {
        tick() {
          /* Nothing moves here, but the runtime ticks it anyway so the cabinet
             and a game are the same kind of thing to the host. The redraw is
             what lets a board arriving mid-session appear without a poke. */
          render();
        },
        key(key, down) {
          if (!down) return;
          const out = cabinetReduce(state, key, ARCADE_GAMES);
          state = out.state;
          host.sound?.("blip");
          if (out.launch?.spec && host.run) {
            host.run(out.launch.spec);
            return;
          }
          render();
        },
        swipe(dir) {
          if (dir !== "up" && dir !== "down") return;
          state = cabinetReduce(state, dir, ARCADE_GAMES).state;
          render();
        },
        resize() {
          render();
        },
        dispose() {
          /* no timers, no listeners */
        },
      };
    },
  };
}
