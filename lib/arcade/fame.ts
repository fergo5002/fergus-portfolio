import type { BoardRow, BoardSnapshot } from "./board";
import type { GameId } from "./engine";

/**
 * The Hall of Fame on the arcade's front, decided here and drawn by
 * `components/arcade/HallOfFame.tsx`.
 *
 * One table, a column a cabinet, top ten each. Not one ranking across the
 * cabinets: a poker bank, a wave survived and a name typed are different
 * numbers, and ranking them against each other would be a claim the scores
 * cannot support. An empty slot stays empty (the table draws dashes), because
 * a row nobody earned is a lie on a board that says it is held honestly.
 */

export const FAME_SIZE = 10;

export type FameColumn = { game: GameId; rows: (BoardRow | null)[] };
export type Fame =
  | { kind: "checking" }
  | { kind: "offline" }
  | { kind: "table"; columns: FameColumn[]; empty: boolean };

export function fameTable(snapshot: BoardSnapshot | null, games: readonly GameId[], size = FAME_SIZE): Fame {
  if (!snapshot) return { kind: "checking" };
  if (!snapshot.available) return { kind: "offline" };
  const columns = games.map((game): FameColumn => {
    const held = [...(snapshot.boards.find((b) => b.game === game)?.rows ?? [])].sort((a, b) => b.score - a.score).slice(0, size);
    return { game, rows: [...held, ...Array<null>(size - held.length).fill(null)] };
  });
  return { kind: "table", columns, empty: columns.every((c) => c.rows.every((r) => r === null)) };
}
