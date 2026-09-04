import { arcadeCopy } from "@/content/arcade";
import { checkInitials, INITIALS_LENGTH } from "./board";
import type { Board, BoardRow, BoardSnapshot } from "./board";

/**
 * The browser's half of the board, and the file that makes "there is no Redis"
 * a sentence rather than a crash.
 *
 * **Everything that is not a well-formed available snapshot is unavailable.** A
 * 404 because `app/api/board` is not deployed yet, a 500 because the store
 * threw, a 200 carrying `available: false` because `getRedis` threw
 * `StoreUnavailableError`, an HTML error page from a proxy, a network failure
 * on a train: one answer, one sentence, and the games still play. That is the
 * whole contract, and it is why G0 can ship before F4.
 *
 * Nothing here trusts the shape of what came back. The board is drawn into a
 * fixed grid, so a row with seven-character initials or a NaN score is not a
 * cosmetic problem, it is a broken screen.
 */

export type SubmitResult = { ok: true; board: Board } | { ok: false; reason: string };

const UNAVAILABLE: BoardSnapshot = { available: false, boards: [], note: arcadeCopy.board.unavailable[0] };

/** Longer than this cannot be drawn on the narrowest grid, so it is not shown. */
const MAX_SERVER_REASON = 60;

function readRow(value: unknown): BoardRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as { initials?: unknown; score?: unknown };
  if (typeof row.initials !== "string" || row.initials.length !== INITIALS_LENGTH) return null;
  if (typeof row.score !== "number" || !Number.isFinite(row.score)) return null;
  return { initials: row.initials, score: row.score };
}

function readBoard(value: unknown): Board | null {
  if (typeof value !== "object" || value === null) return null;
  const board = value as { game?: unknown; rows?: unknown };
  if (typeof board.game !== "string") return null;
  if (!Array.isArray(board.rows)) return null;
  return { game: board.game, rows: board.rows.map(readRow).filter((r): r is BoardRow => r !== null) };
}

export function readSnapshot(value: unknown): BoardSnapshot {
  if (typeof value !== "object" || value === null) return UNAVAILABLE;
  const body = value as { available?: unknown; boards?: unknown };
  if (body.available !== true) return UNAVAILABLE;
  if (!Array.isArray(body.boards)) return UNAVAILABLE;
  const boards = body.boards.map(readBoard).filter((b): b is Board => b !== null);
  return { available: true, boards };
}

export async function fetchBoards(fetchImpl: typeof fetch = fetch): Promise<BoardSnapshot> {
  try {
    const response = await fetchImpl("/api/board", { headers: { accept: "application/json" } });
    if (!response.ok) return UNAVAILABLE;
    return readSnapshot(await response.json());
  } catch {
    return UNAVAILABLE;
  }
}

export async function submitScore(
  entry: { game: string; initials: string; score: number },
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  // Checked here so the visitor is told before anything is sent. Checked again
  // in the route, because a client-side check is a courtesy, never a control.
  const check = checkInitials(entry.initials);
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    const response = await fetchImpl("/api/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        game: entry.game,
        initials: check.initials,
        score: Math.max(0, Math.floor(entry.score)),
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, reason: serverReason(body) };
    const board = readBoard((body as { board?: unknown } | null)?.board);
    if (!board) return { ok: false, reason: arcadeCopy.initials.refused };
    return { ok: true, board };
  } catch {
    return { ok: false, reason: arcadeCopy.initials.refused };
  }
}

function serverReason(body: unknown): string {
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason !== "string") return arcadeCopy.initials.refused;
  if (reason.length === 0 || reason.length > MAX_SERVER_REASON) return arcadeCopy.initials.refused;
  return reason;
}
