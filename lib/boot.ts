/**
 * Everything that decides how long the cold-start sequence lasts, in one place,
 * plus the inline script that guards it.
 *
 * **Why this file exists.** Two files have to agree about the length of the boot
 * animation, and they did not. `app/layout.tsx` ships a pre-paint script that
 * hides the page during boot and reveals it again if the boot code never
 * arrives; `components/BootSequence.tsx` is the boot code. The reveal was set to
 * 4000 ms on the stated assumption that four seconds was "longer than the boot
 * animation". The floor is 6437 ms. So on every first visit the site was
 * unhidden 2.4 seconds early and the landing page appeared underneath a BIOS
 * screen that was still typing. Measured on production before the fix:
 * `booting` went false at 5333 ms with the overlay still mounted and still on
 * its opening lines.
 *
 * **The lesson is not that 4000 was the wrong number.** It is that there is no
 * right number. The sequence is a chain of roughly 430 `setTimeout` ticks, and a
 * browser schedules those however it likes: a hidden tab clamps each one to
 * about a second, which turns a six second animation into a six minute one
 * (measured, not guessed: 955 ms for a requested 11 ms). A single fixed timer
 * cannot win that race, whatever it is set to.
 *
 * So the failsafe no longer races the animation. `BootSequence` disarms it the
 * moment it mounts, which means it only ever fires when the boot code genuinely
 * never ran. `BOOT_FLOOR_MS` is still computed and still asserted against
 * `BOOT_FAILSAFE_MS` in `lib/boot.test.ts` as a second line of defence: if the
 * disarming is ever removed, the ceiling alone should still not truncate a
 * nominal run.
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
 * final tick that fires `onDone`. Every tick is spaced by `speed`. Getting this
 * model wrong is how the original estimate went astray, so it is derived from
 * the component's actual loop rather than eyeballed.
 */
export function typewriterMs(lines: readonly string[], speed: number): number {
  const ticks = lines.reduce((n, line) => n + line.length, 0) + lines.length + 1;
  return ticks * speed;
}

/**
 * The shortest the sequence can possibly run. A floor, not an estimate: every
 * term is a timer that the browser may fire late and can never fire early.
 */
export const BOOT_FLOOR_MS =
  STRIKE_MS +
  typewriterMs(HEAD_LINES, HEAD_SPEED_MS) +
  MEMORY_MS +
  typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS) +
  BAR_MS +
  HANDOFF_MS;

/**
 * How long the inline script waits for the boot code before revealing the page
 * itself. Only reached when `BootSequence` never mounted, because mounting
 * disarms it. Kept above `BOOT_FLOOR_MS` so that even if the disarming is lost
 * this cannot truncate a nominal run.
 */
export const BOOT_FAILSAFE_MS = 10_000;

/**
 * How long `BootSequence` gives itself before finishing regardless. Covers the
 * case the inline failsafe cannot: the component mounted, disarmed the failsafe,
 * and then stalled part-way through. Finishes through `finish()` so the tube
 * still powers on properly rather than the overlay simply vanishing.
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
 * It is built here rather than written into the JSX so it can be executed in a
 * test. It used to be a string literal in the layout, which is exactly why a
 * two and a half second error in it shipped: there was nothing that could fail.
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
 *  4. Arms the failsafe described at the top of this file.
 */
export function bootInlineScript(): string {
  return (
    "(function(){var d=document.documentElement;d.classList.add('js');" +
    `try{var s=JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'{}');` +
    "if(s.theme)d.dataset.theme=s.theme;" +
    "if(s.crtEnabled===false)d.classList.add('crt-off');" +
    "if(typeof s.scanlines==='number')d.style.setProperty('--scanline-intensity',String(s.scanlines));" +
    "}catch(e){}" +
    "try{if(location.pathname!=='/')return;" +
    `var b=sessionStorage.getItem('${SESSION_KEY}');` +
    "var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
    "if(!b&&!r){d.classList.add('booting');" +
    `window.${BOOT_FAILSAFE_HANDLE}=setTimeout(function(){` +
    "d.classList.remove('booting');" +
    `window.${BOOT_FAILSAFE_HANDLE}=0;` +
    `},${BOOT_FAILSAFE_MS});` +
    "}}catch(e){}})();"
  );
}

/**
 * Disarms the inline failsafe. Called by `BootSequence` on mount: the failsafe's
 * whole purpose is to cover the boot code not running, and the boot code is now
 * running, so the timer has no job left. This is what stops a fixed timer from
 * ever cutting the animation short.
 *
 * Safe to call when no timer was armed (reduced motion, a repeat visit, any
 * route but "/"), which is why it is unconditional at the call site.
 */
export function disarmBootFailsafe(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, number | undefined>;
  const handle = w[BOOT_FAILSAFE_HANDLE];
  if (handle) clearTimeout(handle);
  w[BOOT_FAILSAFE_HANDLE] = 0;
}
