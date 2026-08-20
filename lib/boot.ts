/**
 * Everything that decides how long the cold-start sequence lasts, plus the
 * inline script that guards it and the two calls that hand ownership of the
 * reveal back and forth.
 *
 * **Why this file exists.** Two files have to agree about the boot animation and
 * they did not. `app/layout.tsx` ships a pre-paint script that hides the page
 * during boot and reveals it again if the boot code never arrives;
 * `components/BootSequence.tsx` is the boot code. The reveal was set to 4000 ms
 * on the stated assumption that four seconds was "longer than the boot
 * animation". The floor is 6418 ms. So on every first visit the site was
 * unhidden 2.4 seconds early and the landing page appeared underneath a BIOS
 * screen that was still typing. Measured on production before the fix:
 * `booting` went false at 5333 ms with the overlay still mounted.
 *
 * **The fix is not a bigger number.** The sequence is a chain of roughly 430
 * `setTimeout` ticks, and a browser schedules those however it likes: a hidden
 * tab clamps each one to about a second, which turns a six second animation into
 * a six minute one (measured, not guessed: 955 ms for a requested 11 ms). No
 * fixed delay can win that race, so the failsafe does not enter it. It answers
 * one question only, "did the boot code ever arrive", and `BOOT_FLOOR_MS` is
 * deliberately irrelevant to it.
 *
 * **Ownership of the reveal.** Exactly one thing is responsible for removing
 * `booting` at any moment, and it is always the most specific thing available:
 *
 *  - nothing mounted yet ....... the inline failsafe, `BOOT_FAILSAFE_MS`
 *  - BootSequence mounted ...... BootSequence, via `finish()`
 *  - ...and then stalled ....... its own watchdog, `BOOT_WATCHDOG_MS`
 *  - ...and then unmounted ..... the failsafe again, re-armed at `BOOT_REARM_MS`
 *
 * That last row is the one that is easy to miss. Disarming a safety net means
 * inheriting every case it was quietly covering, and an unmount mid-boot (a
 * render error in a sibling, an `error.tsx` boundary, Fast Refresh) would
 * otherwise leave `booting` set with no timer anywhere to clear it, which is a
 * blank page with no recovery short of a reload.
 */

export const HEAD_LINES = [
  "FergusOS BIOS v5.0   (c) 2026 Patrick Fergus O'Reilly",
  "CPU: Trinity CS/Business @ 1.1 GHz · 3rd year, 2 cores",
  "VIDEO: 15.625 kHz phosphor tube · aperture grille · 8 MB",
] as const;

export const DEVICE_LINES = [
  "detecting  /dev/ambition .............. OK",
  "mounting   /usr/presterly ............. OK",
  "loading    personality.dll ............ OK",
  "calibrating magnetic deflection ....... OK",
  "arming     gravity well ............... OK",
  "checking   caffeine reserves .......... LOW",
] as const;

export const SESSION_KEY = "fergusos_booted";
export const SETTINGS_KEY = "fergusos_settings";
export const BOOTING_CLASS = "booting";
export const MEMORY_K = 65536;

/** How long the tube sits dark, striking its line, before any text appears. */
export const STRIKE_MS = 420;
/** Milliseconds per character for each of the two typewriters. */
export const HEAD_SPEED_MS = 11;
export const DEVICE_SPEED_MS = 8;
/** The rAF-driven memory count, the rAF-driven loading bar, and the pause after it. */
export const MEMORY_MS = 900;
export const BAR_MS = 780;
export const HANDOFF_MS = 420;

/**
 * How long a `Typewriter` takes to finish, at its floor.
 *
 * It schedules one tick per character, one more at each line boundary, and one
 * final tick that fires `onDone`. The FIRST of those is scheduled with
 * `startDelay`, not with `speed` (see `components/Typewriter.tsx`), so only the
 * remaining ticks are spaced by `speed`. Missing that is an off-by-one-tick, and
 * an earlier version of this function had it.
 */
export function typewriterMs(
  lines: readonly string[],
  speed: number,
  startDelay = 0,
): number {
  const ticks = lines.reduce((n, line) => n + line.length, 0) + lines.length + 1;
  return startDelay + (ticks - 1) * speed;
}

/**
 * The shortest the sequence can possibly run. A floor, not an estimate: every
 * term is a timer or a rAF-driven ramp that the browser may run late and can
 * never run early.
 *
 * Documentation, and the input to nothing. It is recorded because getting it
 * wrong by 2.4 seconds is what caused the bug at the top of this file, not
 * because any delay here is derived from it.
 */
export const BOOT_FLOOR_MS =
  STRIKE_MS +
  typewriterMs(HEAD_LINES, HEAD_SPEED_MS) +
  MEMORY_MS +
  typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS) +
  BAR_MS +
  HANDOFF_MS;

/**
 * How long the inline script waits for `BootSequence` before revealing the page
 * itself.
 *
 * Deliberately short, and deliberately NOT compared against `BOOT_FLOOR_MS`.
 * `booting` hides the whole page, and this is the only thing that lifts it when
 * the JavaScript chunk never turns up: a blocked subresource, a stripped in-app
 * webview, a renderer that fetches selectively. Every second added here is a
 * second of blank page for somebody in that position, including a crawler. It
 * cannot truncate the animation because `BootSequence` disarms it on mount.
 */
export const BOOT_FAILSAFE_MS = 4000;

/**
 * How long the failsafe waits after `BootSequence` has unmounted without
 * finishing. Shorter than the first wait: by this point the page has already
 * been hidden for a while, and whatever was going to render has had its chance.
 */
export const BOOT_REARM_MS = 1000;

/**
 * How long `BootSequence` gives itself before finishing regardless. Covers the
 * case neither of the above can: mounted, took ownership, then stalled part-way
 * through. Finishes through `finish()` so the tube still powers on properly
 * rather than the overlay simply vanishing.
 */
export const BOOT_WATCHDOG_MS = 20_000;

/**
 * Where the inline script parks its timer handle so `BootSequence` can cancel
 * it. A property on `window` rather than a module value because the two run in
 * different worlds: one is a raw string in `<head>`, the other is a React chunk.
 */
export const BOOT_FAILSAFE_HANDLE = "__fergusosBootFailsafe";

/**
 * The pre-paint script, as a string, for `app/layout.tsx` to inline.
 *
 * Built here rather than written into the JSX so it can be executed by a test.
 * It used to be a string literal in the layout, which is exactly why a two and a
 * half second error in it shipped: there was nothing that could fail.
 *
 * It runs before first paint and does four things:
 *
 *  1. Flags `.js` on `<html>`. Scroll reveals hide their content behind this
 *     class only, so a visitor without JavaScript is never left staring at a
 *     permanently clipped block.
 *  2. Restores the saved phosphor theme before paint, so a returning visitor on
 *     amber never sees a flash of green.
 *  3. On the landing page only, if this session has not booted and the user
 *     allows motion, marks `<html>` as `.booting` so CSS hides the chrome until
 *     the boot overlay takes over. Path-gated because `BootSequence` only mounts
 *     on "/", and any other route would be stuck hidden.
 *  4. Arms the failsafe described above.
 *
 * The constants are spliced in with `JSON.stringify` rather than quoted by hand.
 * None of them can currently break out of a string literal, but a future key
 * containing an apostrophe would silently produce broken markup, and correctness
 * by construction costs nothing here.
 */
export function bootInlineScript(): string {
  const settingsKey = JSON.stringify(SETTINGS_KEY);
  const sessionKey = JSON.stringify(SESSION_KEY);
  const bootingClass = JSON.stringify(BOOTING_CLASS);
  return (
    "(function(){var d=document.documentElement;d.classList.add('js');" +
    `try{var s=JSON.parse(localStorage.getItem(${settingsKey})||'{}');` +
    "if(s.theme)d.dataset.theme=s.theme;" +
    "if(s.crtEnabled===false)d.classList.add('crt-off');" +
    "if(typeof s.scanlines==='number')d.style.setProperty('--scanline-intensity',String(s.scanlines));" +
    "}catch(e){}" +
    "try{if(location.pathname!=='/')return;" +
    `var b=sessionStorage.getItem(${sessionKey});` +
    "var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
    `if(!b&&!r){d.classList.add(${bootingClass});` +
    `window[${JSON.stringify(BOOT_FAILSAFE_HANDLE)}]=setTimeout(function(){` +
    `d.classList.remove(${bootingClass});` +
    `window[${JSON.stringify(BOOT_FAILSAFE_HANDLE)}]=0;` +
    `},${BOOT_FAILSAFE_MS});` +
    "}}catch(e){}})();"
  );
}

/**
 * Disarms the inline failsafe, because `BootSequence` is now responsible for the
 * reveal. Its whole purpose is to cover the boot code not running, and the boot
 * code is running, so the timer has no job left. This is what stops a fixed
 * delay from ever cutting the animation short.
 *
 * Pair every call with `armBootFailsafe()` on the way back out. Taking ownership
 * without returning it is how a page ends up hidden with no timer anywhere.
 */
export function disarmBootFailsafe(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, number | undefined>;
  const handle = w[BOOT_FAILSAFE_HANDLE];
  if (handle) clearTimeout(handle);
  w[BOOT_FAILSAFE_HANDLE] = 0;
}

/**
 * Hands ownership of the reveal back to the failsafe, for when `BootSequence`
 * goes away before it finished: a render error in a sibling component, an
 * `error.tsx` boundary taking over, Fast Refresh in development.
 *
 * A no-op when the page is not hidden, so returning ownership after a normal
 * finish cannot resurrect a timer that would do nothing.
 */
export function armBootFailsafe(delayMs: number = BOOT_REARM_MS): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root.classList.contains(BOOTING_CLASS)) return;

  const w = window as unknown as Record<string, number | undefined>;
  const existing = w[BOOT_FAILSAFE_HANDLE];
  if (existing) clearTimeout(existing);
  w[BOOT_FAILSAFE_HANDLE] = window.setTimeout(() => {
    root.classList.remove(BOOTING_CLASS);
    w[BOOT_FAILSAFE_HANDLE] = 0;
  }, delayMs);
}
