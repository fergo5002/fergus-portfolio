import { formatUptime, memoryAddress } from "./system";

/**
 * The status strip's instrument readouts, as values.
 *
 * Fergus asked for them back on 2026-09-26 (PR #25 had cleared the strip down
 * to the controls). They are costume, so `StatusBar` draws them with CSS
 * `content` rather than as text: nothing here ever reaches the server HTML or
 * a text extractor. This module only decides what each readout says.
 */
export type ReadoutInput = {
  uptimeMs: number;
  scrollProgress: number;
  fps: number;
  pointerX: number;
  pointerY: number;
  scrollVelocity: number;
  tapAt: number;
  degaussAt: number;
  /** How many collisions landed this frame. */
  impacts: number;
  /** performance.now() of the last key pressed anywhere on the page. */
  keyAt: number;
};

export type Readouts = {
  up: string;
  mem: string;
  fps: string;
  pos: string;
  clock: string;
  /** The activity lamp: lit while the machine is doing something. */
  busy: boolean;
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function formatClock(d: Date, seconds = true): string {
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${hm}:${pad(d.getSeconds())}` : hm;
}

/** The pointer in thousandths of the screen, the way the old strip read it. */
export function formatPointer(x: number, y: number): string {
  const milli = (v: number) => pad(Math.round(Math.min(0.999, Math.max(0, v)) * 1000), 3);
  return `${milli(x)},${milli(y)}`;
}

/** How long the lamp stays lit after a key, a tap or a degauss, in ms. */
const LAMP_AFTER_KEY_MS = 120;
const LAMP_AFTER_TAP_MS = 160;
const LAMP_AFTER_DEGAUSS_MS = 400;

export function readouts(f: ReadoutInput, now: Date, perfNow: number, reduced: boolean): Readouts {
  if (reduced) {
    // Static, honest values rather than a frozen live readout. The clock still
    // tells the time, to the minute, because a clock is information.
    return { up: "--:--:--", mem: "0x00400000", fps: "--", pos: "---,---", clock: formatClock(now, false), busy: false };
  }
  const busy =
    Math.abs(f.scrollVelocity) > 0.05 ||
    f.impacts > 0 ||
    perfNow - f.keyAt < LAMP_AFTER_KEY_MS ||
    perfNow - f.tapAt < LAMP_AFTER_TAP_MS ||
    perfNow - f.degaussAt < LAMP_AFTER_DEGAUSS_MS;
  return {
    up: formatUptime(f.uptimeMs),
    mem: memoryAddress(f.scrollProgress),
    fps: pad(Math.round(f.fps)),
    pos: formatPointer(f.pointerX, f.pointerY),
    clock: formatClock(now),
    busy,
  };
}

/** A value quoted for use as CSS `content`, with anything that would end the string escaped. */
export function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
