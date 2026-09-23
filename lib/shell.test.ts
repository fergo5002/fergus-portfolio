import { describe, it, expect } from "vitest";
import { INITIAL_SHELL, createShellStore, isShellHotkey, shellReduce } from "./shell";
import type { ShellState } from "./shell";

const closed: ShellState = { open: false, arcade: "closed" };
const open: ShellState = { open: true, arcade: "closed" };

describe("the single shell on every route", () => {
  it("starts closed and opens without a route exception", () => {
    expect(INITIAL_SHELL).toEqual(closed);
    expect(shellReduce(closed, { type: "open" })).toEqual(open);
    expect(shellReduce(closed, { type: "toggle" })).toEqual(open);
  });
  it("closes and toggles without retaining an arcade owner", () => {
    expect(shellReduce(open, { type: "close" })).toEqual(closed);
    expect(shellReduce(open, { type: "toggle" })).toEqual(closed);
    expect(shellReduce({ open: true, arcade: "ready" }, { type: "close" })).toEqual(closed);
  });
  it("tracks entrance and room separately, then returns to its prompt", () => {
    const entering = shellReduce(open, { type: "arcade", phase: "entering" });
    expect(entering).toEqual({ open: true, arcade: "entering" });
    const ready = shellReduce(entering, { type: "arcade", phase: "ready" });
    expect(ready).toEqual({ open: true, arcade: "ready" });
    expect(shellReduce(ready, { type: "arcade", phase: "closed" })).toEqual(open);
  });
  it("does not let a stale arcade callback resurrect a closed drawer", () => {
    expect(shellReduce(closed, { type: "arcade", phase: "ready" })).toBe(closed);
    expect(shellReduce(closed, { type: "arcade", phase: "entering" })).toBe(closed);
  });
  it("returns the same object when nothing changes", () => {
    expect(shellReduce(closed, { type: "close" })).toBe(closed);
    expect(shellReduce(open, { type: "open" })).toBe(open);
    expect(shellReduce(open, { type: "arcade", phase: "closed" })).toBe(open);
  });
});
describe("isShellHotkey", () => {
  const none = { ctrlKey: false, metaKey: false, altKey: false };
  it("is the bare backtick with focus outside a field", () => {
    expect(isShellHotkey("`", none, null)).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "BODY" })).toBe(true);
    expect(isShellHotkey("`", none, { tagName: "a" })).toBe(true);
  });
  it("ignores another key and a modified backtick", () => {
    expect(isShellHotkey("~", none, null)).toBe(false);
    expect(isShellHotkey("Escape", none, null)).toBe(false);
    for (const key of ["ctrlKey", "metaKey", "altKey"]) {
      expect(isShellHotkey("`", { ...none, [key]: true }, null)).toBe(false);
    }
  });
  it("leaves a backtick alone when the person is typing", () => {
    for (const tagName of ["INPUT", "input", "TEXTAREA", "SELECT"]) {
      expect(isShellHotkey("`", none, { tagName }), tagName).toBe(false);
    }
    expect(isShellHotkey("`", none, { tagName: "DIV", isContentEditable: true })).toBe(false);
  });
});
it("wires the reducer to a store starting at INITIAL_SHELL", () => {
  const store = createShellStore();
  expect(store.get()).toBe(INITIAL_SHELL);
  store.dispatch({ type: "open" });
  expect(store.get()).toEqual(open);
});
