/**
 * Every input a program will ever see, and the rule for which keys the arcade
 * takes off the page.
 *
 * `ArcadeKey` is the whole vocabulary. Mapping the arrows, WASD, the space bar
 * and a swipe onto one small set here is most of what makes a game plan cheap:
 * no game re-implements it, and no game has to decide what a phone does.
 *
 * Two rules are load-bearing rather than tidy:
 *
 *  - **A modifier chord is never claimed.** Cmd+R, Ctrl+L, Alt+Left. Swallowing
 *    one of those traps somebody in a tab, and a game is not worth that.
 *  - **Only a key with a meaning is captured.** `shouldCapture` is what
 *    `ArcadeScreen` calls before `preventDefault`, so the arrows and the space
 *    bar stop scrolling the page under the player, and Tab still moves focus
 *    out of the game (WCAG 2.1.2, the same rule that shaped the terminal's
 *    Tab handling).
 *
 * Escape is deliberately absent from the map. The runtime handles it before it
 * asks this module anything, because Escape always exits and a program must
 * never be able to hold on to it.
 */

export type ArcadeKey =
  | "up" | "down" | "left" | "right"
  | "fire" | "start" | "pause"
  | "1" | "2" | "3" | "4" | "5";

export type KeyMods = { ctrlKey: boolean; metaKey: boolean; altKey: boolean };

const KEY_MAP: Record<string, ArcadeKey> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  " ": "fire",
  Enter: "start",
  p: "pause",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

export function arcadeKey(key: string, mods: KeyMods): ArcadeKey | null {
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return null;
  const lookup = key.length === 1 ? key.toLowerCase() : key;
  return KEY_MAP[lookup] ?? null;
}

/** Whether this keydown should have its default action prevented. */
export function shouldCapture(key: string, mods: KeyMods): boolean {
  return arcadeKey(key, mods) !== null;
}

/* ── touch ───────────────────────────────────────────────────────────────── */

export const SWIPE_MIN_PX = 24;
export const SWIPE_MAX_MS = 600;
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 300;
/** How much longer the moving axis must be before a drag counts as one direction. */
export const SWIPE_DOMINANCE = 1.5;

export type Gesture =
  | { kind: "swipe"; dir: "up" | "down" | "left" | "right" }
  | { kind: "tap" };

/** `dy` is in screen coordinates, so a positive `dy` is a downward swipe. */
export function gestureOf(dx: number, dy: number, dtMs: number): Gesture | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= TAP_MAX_PX && ay <= TAP_MAX_PX && dtMs <= TAP_MAX_MS) return { kind: "tap" };
  if (dtMs > SWIPE_MAX_MS) return null;
  if (ax >= SWIPE_MIN_PX && ax >= ay * SWIPE_DOMINANCE) {
    return { kind: "swipe", dir: dx > 0 ? "right" : "left" };
  }
  if (ay >= SWIPE_MIN_PX && ay >= ax * SWIPE_DOMINANCE) {
    return { kind: "swipe", dir: dy > 0 ? "down" : "up" };
  }
  return null;
}

export type Delivery = { swipe: "up" | "down" | "left" | "right" | null; press: ArcadeKey | null };

/**
 * How a gesture reaches a program. A program that implements `swipe` gets the
 * swipe; one that does not gets the matching key press instead. Never both: a
 * game that implemented both would turn one flick into two moves.
 */
export function deliverGesture(gesture: Gesture | null, hasSwipe: boolean): Delivery {
  if (!gesture) return { swipe: null, press: null };
  if (gesture.kind === "tap") return { swipe: null, press: "fire" };
  if (hasSwipe) return { swipe: gesture.dir, press: null };
  return { swipe: null, press: gesture.dir };
}
