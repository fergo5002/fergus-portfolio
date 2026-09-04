import { describe, it, expect } from "vitest";
import {
  arcadeKey, deliverGesture, gestureOf, holdKey, releaseAllKeys, releaseKey, shouldCapture,
} from "@/lib/arcade/input";

const NO_MODS = { ctrlKey: false, metaKey: false, altKey: false };

describe("arcadeKey", () => {
  it("maps the arrows", () => {
    expect(arcadeKey("ArrowUp", NO_MODS)).toBe("up");
    expect(arcadeKey("ArrowDown", NO_MODS)).toBe("down");
    expect(arcadeKey("ArrowLeft", NO_MODS)).toBe("left");
    expect(arcadeKey("ArrowRight", NO_MODS)).toBe("right");
  });

  it("maps WASD in either case", () => {
    expect(arcadeKey("w", NO_MODS)).toBe("up");
    expect(arcadeKey("W", NO_MODS)).toBe("up");
    expect(arcadeKey("D", NO_MODS)).toBe("right");
  });

  it("maps the space bar to fire and enter to start", () => {
    expect(arcadeKey(" ", NO_MODS)).toBe("fire");
    expect(arcadeKey("Enter", NO_MODS)).toBe("start");
  });

  it("maps the first five digits to themselves, for picking a game", () => {
    expect(arcadeKey("3", NO_MODS)).toBe("3");
    expect(arcadeKey("6", NO_MODS)).toBeNull();
  });

  it("never claims Escape, because the runtime handles it before asking", () => {
    expect(arcadeKey("Escape", NO_MODS)).toBeNull();
  });

  it("lets every modifier chord through to the browser", () => {
    // Cmd+R, Ctrl+L, Alt+ArrowLeft. Swallowing these is how a game traps
    // somebody in a tab.
    expect(arcadeKey("r", { ...NO_MODS, metaKey: true })).toBeNull();
    expect(arcadeKey("ArrowLeft", { ...NO_MODS, altKey: true })).toBeNull();
    expect(arcadeKey(" ", { ...NO_MODS, ctrlKey: true })).toBeNull();
  });

  it("ignores keys nobody mapped", () => {
    expect(arcadeKey("q", NO_MODS)).toBeNull();
    expect(arcadeKey("F5", NO_MODS)).toBeNull();
    expect(arcadeKey("Tab", NO_MODS)).toBeNull();
  });
});

describe("shouldCapture", () => {
  it("captures exactly the keys with a meaning, so the page cannot scroll under the player", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]) {
      expect(shouldCapture(k, NO_MODS), k).toBe(true);
    }
  });

  it("captures nothing else, so Tab still moves focus and F5 still reloads", () => {
    for (const k of ["Tab", "F5", "Escape", "q", "/"]) {
      expect(shouldCapture(k, NO_MODS), k).toBe(false);
    }
  });
});

describe("held physical keys", () => {
  it("pairs a release with the logical key chosen on keydown", () => {
    const held = new Map();
    expect(holdKey(held, "KeyA", "left")).toBe("left");
    // Release does not need to remap `a`, so a modifier pressed in between
    // cannot strand the logical direction in its down state.
    expect(releaseKey(held, "KeyA")).toBe("left");
    expect(held.size).toBe(0);
  });

  it("does not send a second down for repeat or duplicate keydown", () => {
    const held = new Map();
    expect(holdKey(held, "ArrowUp", "up")).toBe("up");
    expect(holdKey(held, "ArrowUp", "up")).toBeNull();
  });

  it("releases every held direction on focus or visibility loss", () => {
    const held = new Map();
    holdKey(held, "ArrowUp", "up");
    holdKey(held, "Space", "fire");
    expect(releaseAllKeys(held)).toEqual(["up", "fire"]);
    expect(held.size).toBe(0);
  });
});

describe("gestureOf", () => {
  it("reads a short still touch as a tap", () => {
    expect(gestureOf(2, -3, 120)).toEqual({ kind: "tap" });
  });

  it("reads a long drag on one axis as a swipe, with y growing downward", () => {
    expect(gestureOf(60, 5, 200)).toEqual({ kind: "swipe", dir: "right" });
    expect(gestureOf(-60, 5, 200)).toEqual({ kind: "swipe", dir: "left" });
    expect(gestureOf(4, 60, 200)).toEqual({ kind: "swipe", dir: "down" });
    expect(gestureOf(4, -60, 200)).toEqual({ kind: "swipe", dir: "up" });
  });

  it("refuses a diagonal rather than guessing which way it leaned", () => {
    expect(gestureOf(40, 38, 200)).toBeNull();
  });

  it("refuses a slow drag, which is a scroll attempt and not a swipe", () => {
    expect(gestureOf(60, 0, 1500)).toBeNull();
  });

  it("refuses a movement too small to be either", () => {
    expect(gestureOf(15, 0, 400)).toBeNull();
  });
});

describe("deliverGesture", () => {
  it("sends a swipe to a program that wants swipes", () => {
    expect(deliverGesture({ kind: "swipe", dir: "up" }, true)).toEqual({ swipe: "up", press: null });
  });

  it("turns a swipe into a key press for a program that does not, and never both", () => {
    expect(deliverGesture({ kind: "swipe", dir: "up" }, false)).toEqual({ swipe: null, press: "up" });
  });

  it("makes a tap the fire button, which is how a phone plays without a keyboard", () => {
    expect(deliverGesture({ kind: "tap" }, true)).toEqual({ swipe: null, press: "fire" });
  });

  it("delivers nothing for nothing", () => {
    expect(deliverGesture(null, true)).toEqual({ swipe: null, press: null });
  });
});
