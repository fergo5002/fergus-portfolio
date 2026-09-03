import { describe, it, expect } from "vitest";
import { INITIAL_SHELL, createShellStore, isShellHotkey, shellReduce } from "./shell";
import type { ShellState } from "./shell";

const closed: ShellState = { open: false, inline: false };
const open: ShellState = { open: true, inline: false };
const home: ShellState = { open: false, inline: true };

describe("shellReduce", () => {
  it("starts closed and off the inline host", () => {
    expect(INITIAL_SHELL).toEqual(closed);
  });

  it("opens, closes and toggles", () => {
    expect(shellReduce(closed, { type: "open" })).toEqual(open);
    expect(shellReduce(open, { type: "close" })).toEqual(closed);
    expect(shellReduce(closed, { type: "toggle" })).toEqual(open);
    expect(shellReduce(open, { type: "toggle" })).toEqual(closed);
  });

  it("returns the same object when nothing changes, so the store stays quiet", () => {
    expect(shellReduce(closed, { type: "close" })).toBe(closed);
    expect(shellReduce(open, { type: "open" })).toBe(open);
    expect(shellReduce(closed, { type: "route", inline: false })).toBe(closed);
  });

  it("never opens on the inline host: the home page has its own terminal", () => {
    expect(shellReduce(home, { type: "open" })).toBe(home);
    expect(shellReduce(home, { type: "toggle" })).toBe(home);
  });

  it("closes when the route becomes the inline host, and remembers which host it is on", () => {
    expect(shellReduce(open, { type: "route", inline: true })).toEqual(home);
    expect(shellReduce(home, { type: "route", inline: false })).toEqual(closed);
  });

  it("stays open across a navigation between two ordinary routes", () => {
    // A terminal panel in an editor does not close because a file opened.
    expect(shellReduce(open, { type: "route", inline: false })).toBe(open);
  });
});

describe("isShellHotkey", () => {
  const none = { ctrlKey: false, metaKey: false, altKey: false };

  it("is the bare backtick with focus on nothing in particular", () => {
    expect(isShellHotkey("`", none, null)).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "BODY" })).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "a" })).toBe(true);
  });

  it("is not any other key, and not a modified backtick", () => {
    expect(isShellHotkey("~", none, null)).toBe(false);
    expect(isShellHotkey("Escape", none, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, ctrlKey: true }, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, metaKey: true }, null)).toBe(false);
    expect(isShellHotkey("`", { ...none, altKey: true }, null)).toBe(false);
  });

  it("leaves a backtick alone when the person is typing somewhere", () => {
    for (const tagName of ["INPUT", "input", "TEXTAREA", "SELECT"]) {
      expect(isShellHotkey("`", none, { tagName }), tagName).toBe(false);
    }
    expect(isShellHotkey("`", none, { tagName: "DIV", isContentEditable: true })).toBe(false);
  });
});

describe("createShellStore", () => {
  it("wires the reducer to a store that starts at INITIAL_SHELL", () => {
    const store = createShellStore();
    expect(store.get()).toBe(INITIAL_SHELL);
    store.dispatch({ type: "open" });
    expect(store.get().open).toBe(true);
  });
});
