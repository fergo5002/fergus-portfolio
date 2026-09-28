import { fromFraction, settle, toFraction, type Bounds, type Scale } from "./value";

/**
 * The knob's keyboard map, as data.
 *
 * The knob is a native range input underneath, which already answers the
 * arrows, Page Up/Down, Home and End. This map reproduces those and adds Shift
 * for ten steps, which the native control lacks; the component calls it from
 * `onKeyDown` and only prevents the default for a key it recognises, so Tab,
 * Enter and everything else behave as the browser intends.
 */
export type KeyIntent = { kind: "step"; steps: number } | { kind: "min" } | { kind: "max" };

const UP = new Set(["ArrowUp", "ArrowRight"]);
const DOWN = new Set(["ArrowDown", "ArrowLeft"]);

export function knobKey(key: string, shift: boolean): KeyIntent | null {
  if (UP.has(key)) return { kind: "step", steps: shift ? 10 : 1 };
  if (DOWN.has(key)) return { kind: "step", steps: shift ? -10 : -1 };
  if (key === "PageUp") return { kind: "step", steps: 10 };
  if (key === "PageDown") return { kind: "step", steps: -10 };
  if (key === "Home") return { kind: "min" };
  if (key === "End") return { kind: "max" };
  return null;
}

/**
 * The value after a key. A logarithmic control moves a hundredth of its
 * travel per step, so the keyboard walks the same curve the pointer does.
 */
export function applyKey(value: number, intent: KeyIntent, bounds: Bounds & { scale?: Scale }): number {
  const { min, max, scale = "linear" } = bounds;
  if (intent.kind === "min") return settle(min, bounds);
  if (intent.kind === "max") return settle(max, bounds);
  if (scale === "log") {
    const moved = toFraction(value, min, max, "log") + intent.steps / 100;
    return settle(fromFraction(moved, min, max, "log"), bounds);
  }
  return settle(value + intent.steps * bounds.step, bounds);
}
