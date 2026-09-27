import { checkInitials } from "./board";
import type { BoardSnapshot } from "./board";

/**
 * What the arcade remembers, and it is deliberately almost nothing.
 *
 * Two facts at module level, which die with the tab and touch no storage at
 * all: whether the door has been opened in this session, and the last board
 * snapshot the client fetched. `neofetch` prints the boards only once `seen`
 * is true, so `top` stays the single hint at the door and a reload puts the
 * machine back to one hint.
 *
 * One thing is saved, and only when the visitor asks: the initials they posted
 * a score under, so the entry screen is pre-filled next time. It is under
 * `OWNED_PREFIX`, so `forget` wipes it with no change to `lib/forget.ts`, and
 * that is exactly the constitution's rule: the site may keep what the visitor
 * explicitly saved and nothing used to recognise them.
 */

export type PostedRun = { game: string; initials: string; score: number };

export type ArcadeSession = {
  /** The door has been found: the Terminal marks this as the program starts. */
  seen: boolean;
  /** The room has finished its power-cycle once in this page lifetime; later entries get the short form. */
  entered: boolean;
  boards: BoardSnapshot | null;
  lastPosted: PostedRun | null;
};

export const INITIALS_KEY = "fergusos:arcade.initials";

let session: ArcadeSession = { seen: false, entered: false, boards: null, lastPosted: null };

export function arcadeSession(): ArcadeSession {
  return session;
}

export function markArcadeSeen(): void {
  if (session.seen) return;
  session = { ...session, seen: true };
}

export function markArcadeEntered(): void {
  if (session.entered) return;
  session = { ...session, entered: true };
}

export function setArcadeBoards(boards: BoardSnapshot): void {
  session = { ...session, boards };
}

/** The row to light in the table. Module state: it dies with the tab and touches no storage. */
export function rememberPosted(run: PostedRun): void {
  session = { ...session, lastPosted: { ...run } };
}

/**
 * The best score this tab has seen for each cabinet, for the HUD's BEST.
 * Module state: it dies with the tab and touches no storage. Kept beside
 * `session` rather than in it, so the shape `neofetch` is handed stays put.
 */
let bests = new Map<string, number>();

export function sessionBest(game: string): number {
  return bests.get(game) ?? 0;
}

export function rememberBest(game: string, score: number): void {
  if (!Number.isSafeInteger(score) || score <= sessionBest(game)) return;
  bests.set(game, score);
}

/** The score a run is asked to beat: this tab's best, or the board's top row if that is higher. */
export function bestFor(game: string, boards: BoardSnapshot | null): number {
  const top = boards?.available ? boards.boards.find((b) => b.game === game)?.rows[0]?.score ?? 0 : 0;
  return Math.max(sessionBest(game), Number.isFinite(top) ? top : 0);
}

/** Tests only. Module state that cannot be reset makes every test order-dependent. */
export function resetArcadeSession(): void {
  session = { seen: false, entered: false, boards: null, lastPosted: null };
  bests = new Map();
}

export function loadInitials(storage: Pick<Storage, "getItem">): string | null {
  try {
    const raw = storage.getItem(INITIALS_KEY);
    if (raw === null) return null;
    const check = checkInitials(raw);
    return check.ok ? check.initials : null;
  } catch {
    return null;
  }
}

export function saveInitials(storage: Pick<Storage, "setItem">, initials: string): void {
  const check = checkInitials(initials);
  if (!check.ok) return;
  try {
    storage.setItem(INITIALS_KEY, check.initials);
  } catch {
    /* private mode or quota: not saving it costs nothing */
  }
}
