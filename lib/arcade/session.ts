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

export type ArcadeSession = { seen: boolean; boards: BoardSnapshot | null };

export const INITIALS_KEY = "fergusos:arcade.initials";

let session: ArcadeSession = { seen: false, boards: null };

export function arcadeSession(): ArcadeSession {
  return session;
}

export function markArcadeSeen(): void {
  if (session.seen) return;
  session = { ...session, seen: true };
}

export function setArcadeBoards(boards: BoardSnapshot): void {
  session = { ...session, boards };
}

/** Tests only. Module state that cannot be reset makes every test order-dependent. */
export function resetArcadeSession(): void {
  session = { seen: false, boards: null };
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
