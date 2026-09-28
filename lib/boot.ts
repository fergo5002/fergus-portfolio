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
 * inheriting every case it was quietly covering, and an unmount mid-boot would
 * otherwise leave `booting` set with no timer anywhere to clear it, which is a
 * blank page with no recovery short of a reload. It is reached by a plain click:
 * `BootSequence` lives in `app/page.tsx`, so navigating off the landing page
 * while the BIOS is typing unmounts it. A render error in any of the components
 * it wraps does the same, as does an `error.tsx` boundary or Fast Refresh.
 */

import { SYSTEM_VERSION } from "@/content/machine";
import { typedCount, typingDuration } from "@/lib/arcade/bios";

export const HEAD_LINES = [
  `FergusOS BIOS v${SYSTEM_VERSION}   (c) 2026 Patrick Fergus O'Reilly`,
  "CPU: Trinity CS/Business @ 1.1 GHz · 3rd year, 2 cores",
  "VIDEO: 15.625 kHz phosphor tube · aperture grille · 8 MB",
] as const;

export const DEVICE_LINES = [
  "detecting  /dev/ambition .............. OK",
  "mounting   /usr/tighsauna ............. OK",
  "loading    personality.dll ............ OK",
  "calibrating magnetic deflection ....... OK",
  "arming     gravity well ............... OK",
  "checking   caffeine reserves .......... LOW",
] as const;

export const SESSION_KEY = "fergusos_booted";
export const SETTINGS_KEY = "fergusos_settings";
export const BOOTING_CLASS = "booting";
export const MEMORY_K = 65536;

/**
 * How long the black cover takes to lift once the line has struck. A tube's
 * line does not fade in, it arrives; this only takes the edge off a first frame
 * that would otherwise pop.
 */
export const STRIKE_FADE_MS = 90;

/** The readings of the visitor's own machine a POST can print. `lib/post.ts` formats them. */
export type PostField = "cpu" | "memory" | "display" | "locale";

/**
 * Everything that decides how long a boot takes and what it types, as one
 * value, because there are two of them.
 *
 * The full sequence is several seconds of BIOS, and on a phone that is a black
 * screen for longer than most people give a link. Fergus chose a shorter boot
 * for phones over skipping it (2026-09-06): the same story with fewer lines,
 * the skip button still there. The lines are drawn from the same script rather
 * than written fresh, so the phone tells a shorter version of the same boot,
 * not a different one. It ran at about two seconds until 2026-09-13, when
 * Fergus called it and it went to about three and a half; see `PHONE_BOOT`.
 *
 * Since 2026-09-27 every field is a duration on one clock, read by
 * `bootTimeline`, rather than the delay of a timer. In order:
 *
 *   off ........ the tube is genuinely off (`strikeMs`, the one phase a timer runs)
 *   head ....... the BIOS header types
 *   memory ..... the memory test counts up (none on a phone)
 *   post ....... the visitor's own machine is read out, one line at a time
 *   devices .... Fergus's device lines, ending on the caffeine punchline
 *   punchline .. a beat to read it
 *   switch ..... the picture drops out, the way a monitor's does when the
 *                mode changes
 *   trace ...... the beam traces the site's mark in one stroke
 *   ready ...... the mark holds
 *   collapse ... it folds to a line, and the page opens out of that line
 */
export type BootProfile = {
  readonly headLines: readonly string[];
  readonly deviceLines: readonly string[];
  readonly postFields: readonly PostField[];
  readonly strikeMs: number;
  readonly headSpeedMs: number;
  /** A pause at the end of each header line, so the eye can land on it. */
  readonly headHoldMs: number;
  readonly memoryMs: number;
  readonly postMs: number;
  readonly deviceSpeedMs: number;
  readonly deviceHoldMs: number;
  readonly punchlineMs: number;
  readonly switchMs: number;
  readonly traceMs: number;
  readonly readyMs: number;
  readonly collapseMs: number;
};

/**
 * About 7.3 seconds, up from 6.4. The second came from the POST reading the
 * visitor's machine and the beam drawing the mark; the loading bar and the
 * handoff pause it replaces gave some of it back. Typing is a touch quicker
 * than the old 11 and 8 milliseconds a character; at 60 frames a second that
 * is still only two or three characters a frame, so a line visibly types.
 */
export const FULL_BOOT: BootProfile = {
  headLines: HEAD_LINES,
  deviceLines: DEVICE_LINES,
  postFields: ["cpu", "memory", "display", "locale"],
  strikeMs: 320,
  headSpeedMs: 10,
  headHoldMs: 40,
  memoryMs: 600,
  postMs: 900,
  deviceSpeedMs: 7,
  deviceHoldMs: 30,
  punchlineMs: 300,
  switchMs: 150,
  traceMs: 820,
  readyMs: 360,
  collapseMs: 150,
};

/**
 * Lengthened from about 2.1 seconds to about 3.6 on 2026-09-13. Fergus looked
 * at the two second version on a phone and said it looked bad, which it did,
 * and the reason was not only that it was short. At 6 and 7 milliseconds a
 * character the typewriters were not typing: a line simply appeared, whole, and
 * a BIOS that appears rather than types reads as a flash of unstyled text
 * rather than a machine starting up. So the speeds are now 14 and 9, which is
 * slower than the desktop boot on purpose, and a third device line was added
 * back so the list has a middle rather than a first and last.
 *
 * Reworked on 2026-09-27 inside the same length, about 3.8 seconds, which is
 * the window Fergus approved on 2026-09-13 and `lib/boot.test.ts` holds. The
 * memory test went, to pay for two readings of the visitor's phone and the
 * beam drawing the mark, which are the parts worth the time. The mount line is
 * `/usr/tighsauna` now, so a phone is told what Fergus is building too. Typing
 * stays at the slower speeds, 12 and 8, for the reason above.
 *
 * The floor still sits under `BOOT_FAILSAFE_MS`, which is coincidence and not
 * a constraint: `BootSequence` disarms that timer on mount, so the sequence is
 * not racing it. See the note on `BOOT_FAILSAFE_MS` for why it must not grow to
 * accommodate this.
 */
export const PHONE_BOOT: BootProfile = {
  headLines: [HEAD_LINES[0]],
  deviceLines: [DEVICE_LINES[1], DEVICE_LINES[2], DEVICE_LINES[5]],
  postFields: ["display", "locale"],
  strikeMs: 280,
  headSpeedMs: 12,
  headHoldMs: 40,
  memoryMs: 0,
  postMs: 440,
  deviceSpeedMs: 8,
  deviceHoldMs: 25,
  punchlineMs: 220,
  switchMs: 130,
  traceMs: 600,
  readyMs: 200,
  collapseMs: 140,
};

/** Every phase of a boot, in the order they play. `done` is the open-ended last one. */
export const BOOT_PHASES = [
  "off",
  "head",
  "memory",
  "post",
  "devices",
  "punchline",
  "switch",
  "trace",
  "ready",
  "collapse",
  "done",
] as const;
export type BootPhase = (typeof BOOT_PHASES)[number];
export type PhaseSpan = { readonly phase: BootPhase; readonly start: number; readonly end: number };

const spanCache = new WeakMap<BootProfile, readonly PhaseSpan[]>();

/**
 * When each phase starts and ends, in milliseconds from the moment the overlay
 * mounted. A phase of zero length (the phone's memory test) starts and ends at
 * the same instant and is never current.
 */
export function bootPhases(profile: BootProfile): readonly PhaseSpan[] {
  const cached = spanCache.get(profile);
  if (cached) return cached;
  const lengths: Record<Exclude<BootPhase, "done">, number> = {
    off: profile.strikeMs,
    head: typingDuration(profile.headLines, profile.headSpeedMs, profile.headHoldMs),
    memory: profile.memoryMs,
    post: profile.postMs,
    devices: typingDuration(profile.deviceLines, profile.deviceSpeedMs, profile.deviceHoldMs),
    punchline: profile.punchlineMs,
    switch: profile.switchMs,
    trace: profile.traceMs,
    ready: profile.readyMs,
    collapse: profile.collapseMs,
  };
  let at = 0;
  const spans: PhaseSpan[] = [];
  for (const phase of BOOT_PHASES) {
    if (phase === "done") {
      spans.push({ phase, start: at, end: Infinity });
      break;
    }
    spans.push({ phase, start: at, end: at + lengths[phase] });
    at += lengths[phase];
  }
  spanCache.set(profile, spans);
  return spans;
}

/**
 * The floor of one profile: the moment `bootTimeline` reports `done`. Every term
 * is a duration the sequence can only reach late, never early: the strike is a
 * timer that can fire late, and the rest is read off a clock that starts when
 * it does.
 */
export function bootFloorMs(profile: BootProfile): number {
  const spans = bootPhases(profile);
  return spans[spans.length - 1].start;
}

/** What the screen should show at one instant of a boot. */
export type BootSnapshot = {
  readonly phase: BootPhase;
  /** Index of `phase` in `BOOT_PHASES`. Never decreases. */
  readonly step: number;
  /** Characters of the header typed so far, for `typedText`. */
  readonly headChars: number;
  /** The memory test's count, in K. */
  readonly memoryK: number;
  /** Milliseconds into the POST block, clamped to its length. */
  readonly postMs: number;
  readonly deviceChars: number;
  /** 0..1 along the beam's trace of the mark. */
  readonly trace: number;
  /** 0..1 through the mark folding to a line. */
  readonly collapse: number;
  /** 0..1 opacity of the black cover: the tube off, or the mode switch. Not monotonic. */
  readonly cover: number;
  readonly done: boolean;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The whole sequence as a pure function of elapsed time.
 *
 * `BootSequence` calls this once a frame from the one frame clock and writes the
 * result through refs, so the words on screen are a function of the clock and
 * nothing else. A frame that arrives late catches up rather than falling
 * behind, a tab that comes back from the background lands where it should, and
 * the sequence ends at `bootFloorMs(profile)` on every machine that is drawing
 * frames at all. Every field except `cover` only ever moves forward.
 */
export function bootTimeline(profile: BootProfile, elapsedMs: number): BootSnapshot {
  const spans = bootPhases(profile);
  const e = Number.isNaN(elapsedMs) ? 0 : Math.max(0, elapsedMs);
  let step = 0;
  while (step < spans.length - 1 && e >= spans[step].end) step++;

  const at = (phase: BootPhase) => spans[BOOT_PHASES.indexOf(phase)];
  const ratio = (phase: BootPhase) => {
    const s = at(phase);
    return s.end > s.start ? clamp01((e - s.start) / (s.end - s.start)) : e >= s.end ? 1 : 0;
  };

  const phase = spans[step].phase;
  let cover = 0;
  if (phase === "off" || phase === "switch") cover = 1;
  else if (e < profile.strikeMs + STRIKE_FADE_MS) cover = 1 - (e - profile.strikeMs) / STRIKE_FADE_MS;

  return {
    phase,
    step,
    headChars: typedCount(profile.headLines, e - at("head").start, profile.headSpeedMs, profile.headHoldMs),
    memoryK: profile.memoryMs > 0 ? Math.floor(MEMORY_K * ratio("memory")) : 0,
    postMs: Math.min(profile.postMs, Math.max(0, e - at("post").start)),
    deviceChars: typedCount(profile.deviceLines, e - at("devices").start, profile.deviceSpeedMs, profile.deviceHoldMs),
    trace: ratio("trace"),
    collapse: ratio("collapse"),
    cover: clamp01(cover),
    done: phase === "done",
  };
}

/**
 * Which boot a machine gets. A coarse pointer is a phone or a tablet whatever
 * its width; a narrow window with a mouse is a phone-sized page and gets the
 * phone's patience too. Pure over its argument so it can be tested; the
 * component reads `matchMedia` and `innerWidth` and hands them in.
 */
export function pickBootProfile(env: { coarse: boolean; width: number }): BootProfile {
  return env.coarse || env.width < 768 ? PHONE_BOOT : FULL_BOOT;
}

/**
 * The shortest the sequence can possibly run. A floor, not an estimate: the
 * strike is a timer the browser may run late, and everything after it is read
 * off a clock that starts at the strike, so nothing can land early.
 *
 * No delay in this file is derived from it. It is recorded because getting it
 * wrong by 2.4 seconds is what caused the bug at the top of this file, and it is
 * asserted against `BOOT_WATCHDOG_MS` in the tests, since the watchdog is the
 * one remaining timer that can cut a live sequence short.
 */
export const BOOT_FLOOR_MS = bootFloorMs(FULL_BOOT);

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
 *
 * Since the sequence is read off the frame clock, "stalled" now means no frames
 * at all: a tab that stays hidden, a main thread that never yields. A slow
 * machine still finishes at the floor, only in fewer frames. So this can stay
 * well clear of both floors, which `lib/boot.test.ts` holds at twice over.
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
 *  1. Flags `.js` on `<html>` for progressive effects. Raster pre-hiding uses
 *     the later `.navigated` flag instead, so a hard load stays readable while
 *     the JavaScript is on its way.
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
 * goes away before it finished: a navigation off the landing page mid-boot, a
 * render error in one of the components it wraps, an `error.tsx` boundary taking
 * over, Fast Refresh in development.
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
