import { arcadeCopy } from "@/content/arcade";
import { checkInitials, INITIALS_LENGTH, normaliseInitials } from "./board";
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

/**
 * A server sentence longer than this is not printed. It goes to the scrollback,
 * which wraps, so this is not a grid constraint: it is a cap on how much text a
 * server we do not control can put on the page.
 */
const MAX_SERVER_REASON = 60;

/** Above this a score is not a score. It also keeps groupDigits away from exponent notation. */
const MAX_SCORE = 1e12;

/** Long enough for a slow connection, short enough that nobody stares at 'posting...'. */
const FETCH_TIMEOUT_MS = 6000;

function readRow(value: unknown): BoardRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as { initials?: unknown; score?: unknown };
  if (typeof row.initials !== "string" || row.initials.length !== INITIALS_LENGTH) return null;
  // The characters, not just the count. "A\nB" is three code units and would
  // grow the <pre> by a row, which shifts the whole grid and pushes the last
  // line under the clip. An emoji is two units, so three units can be one and
  // a half glyphs wide. Reusing normaliseInitials keeps one definition of what
  // a character is allowed to be.
  if (normaliseInitials(row.initials) !== row.initials) return null;
  if (typeof row.score !== "number" || !Number.isFinite(row.score)) return null;
  if (row.score < 0 || row.score > MAX_SCORE) return null;
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
    const response = await fetchImpl("/api/board", {
      headers: { accept: "application/json" },
      // A hung request is the one failure "everything becomes one sentence"
      // does not otherwise cover, and on a phone it is the likely one.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
