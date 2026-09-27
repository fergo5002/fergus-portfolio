import { describe, expect, it } from "vitest";
import { PALETTE_KEYS, ZOOM, nextZoom, redactKey } from "./redact-keys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

/**
 * The palette's keyboard map, as data. The editor calls it from one keydown
 * handler and prevents the default only for a key it recognises, so the page
 * keeps every key this does not claim (Tab, Space, the browser's own
 * Ctrl shortcuts, arrows when nothing is selected).
 */
describe("the palette's keyboard map", () => {
  it("undoes and redoes with Ctrl or Cmd, the way every editor does", () => {
    expect(redactKey(key("z", { ctrlKey: true }), false)).toEqual({ kind: "undo" });
    expect(redactKey(key("Z", { metaKey: true }), false)).toEqual({ kind: "undo" });
    expect(redactKey(key("Z", { ctrlKey: true, shiftKey: true }), false)).toEqual({ kind: "redo" });
    expect(redactKey(key("y", { ctrlKey: true }), false)).toEqual({ kind: "redo" });
  });

  it("leaves every other Ctrl and Cmd shortcut to the browser", () => {
    for (const k of ["f", "+", "-", "0", "r", "s", "p", "a", "c", "v"]) {
      expect(redactKey(key(k, { ctrlKey: true }), true), `Ctrl ${k}`).toBeNull();
      expect(redactKey(key(k, { metaKey: true }), true), `Cmd ${k}`).toBeNull();
    }
  });

  it("switches tools with one letter", () => {
    expect(redactKey(key("r"), false)).toEqual({ kind: "mode", mode: "draw" });
    expect(redactKey(key("R"), false)).toEqual({ kind: "mode", mode: "draw" });
    expect(redactKey(key("v"), false)).toEqual({ kind: "mode", mode: "select" });
    expect(redactKey(key("n"), false)).toEqual({ kind: "new" });
  });

  it("zooms with plus and minus and fits with zero", () => {
    expect(redactKey(key("+"), false)).toEqual({ kind: "zoom", step: 1 });
    expect(redactKey(key("="), false)).toEqual({ kind: "zoom", step: 1 });
    expect(redactKey(key("-"), false)).toEqual({ kind: "zoom", step: -1 });
    expect(redactKey(key("0"), false)).toEqual({ kind: "fit" });
  });

  it("moves, resizes and deletes only a selected mask", () => {
    expect(redactKey(key("ArrowRight"), true)).toEqual({ kind: "move", dx: 1, dy: 0 });
    expect(redactKey(key("ArrowUp", { shiftKey: true }), true)).toEqual({ kind: "move", dx: 0, dy: -10 });
    expect(redactKey(key("ArrowDown", { altKey: true }), true)).toEqual({ kind: "resize", dw: 0, dh: 1 });
    expect(redactKey(key("ArrowLeft", { altKey: true, shiftKey: true }), true)).toEqual({ kind: "resize", dw: -10, dh: 0 });
    expect(redactKey(key("Delete"), true)).toEqual({ kind: "delete" });
    expect(redactKey(key("Backspace"), true)).toEqual({ kind: "delete" });
    // Nothing selected: the arrows scroll and Delete does nothing here.
    expect(redactKey(key("ArrowRight"), false)).toBeNull();
    expect(redactKey(key("Delete"), false)).toBeNull();
  });

  it("claims nothing else", () => {
    for (const k of ["Tab", " ", "Enter", "Escape", "a", "x", "F5", "PageDown"]) expect(redactKey(key(k), true), k).toBeNull();
  });

  it("lists a hint for every palette button that has a key, and the hint is the key it answers to", () => {
    expect(Object.keys(PALETTE_KEYS).sort()).toEqual(["delete", "draw", "fit", "redo", "select", "undo"]);
    expect(redactKey(key(PALETTE_KEYS.draw.key), false)).toEqual({ kind: "mode", mode: "draw" });
    expect(redactKey(key(PALETTE_KEYS.select.key), false)).toEqual({ kind: "mode", mode: "select" });
    expect(redactKey(key(PALETTE_KEYS.fit.key), false)).toEqual({ kind: "fit" });
    expect(PALETTE_KEYS.undo.aria).toBe("Control+Z Meta+Z");
    expect(PALETTE_KEYS.redo.aria).toBe("Control+Shift+Z Meta+Shift+Z Control+Y");
  });
});

describe("zoom", () => {
  it("steps within its bounds", () => {
    expect(nextZoom(100, 1)).toBe(100 + ZOOM.step);
    expect(nextZoom(ZOOM.max, 1)).toBe(ZOOM.max);
    expect(nextZoom(ZOOM.min, -1)).toBe(ZOOM.min);
    // Off the grid, a step lands on the nearest grid value in that direction.
    expect(nextZoom(103, -1)).toBe(100);
    expect(nextZoom(103, 1)).toBe(110);
    expect(ZOOM.fit).toBe(100);
  });
});
