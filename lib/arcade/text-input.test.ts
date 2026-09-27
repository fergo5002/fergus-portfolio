import { describe, expect, it } from "vitest";
import { diffInput, pressesFor } from "./text-input";

/**
 * A typing game reads a real text input's value, never its keydowns, because
 * a phone keyboard does not send keys: Android reports most characters as
 * keydown "Unidentified" (keyCode 229), and a composing keyboard such as
 * GBoard replaces a whole word at once. So the room compares the value before
 * and after each input event and turns the difference into presses.
 */
describe("diffInput", () => {
  it("reads one typed letter as one insertion", () => {
    expect(diffInput("cr", "cro")).toEqual({ erase: 0, insert: "o" });
  });

  it("reads a backspace as one erase", () => {
    expect(diffInput("cro", "cr")).toEqual({ erase: 1, insert: "" });
  });

  it("reads a composing keyboard's whole-word correction as erases then the new ending", () => {
    // GBoard swaps "kernal" for "kernel" in one input event.
    expect(diffInput("kernal", "kernel")).toEqual({ erase: 2, insert: "el" });
  });

  it("reads a word inserted at once, as autocomplete does", () => {
    expect(diffInput("", "sshd")).toEqual({ erase: 0, insert: "sshd" });
  });

  it("reads a cleared field as erasing everything", () => {
    expect(diffInput("init", "")).toEqual({ erase: 4, insert: "" });
  });

  it("reads no change as nothing", () => {
    expect(diffInput("bash", "bash")).toEqual({ erase: 0, insert: "" });
  });
});

describe("pressesFor", () => {
  it("turns a difference into erase and char: presses, in that order", () => {
    expect(pressesFor({ erase: 2, insert: "el" })).toEqual(["erase", "erase", "char:e", "char:l"]);
  });

  it("lowercases what it forwards and splits by character, not by UTF-16 unit", () => {
    expect(pressesFor({ erase: 0, insert: "Ab" })).toEqual(["char:a", "char:b"]);
    expect(pressesFor({ erase: 0, insert: "a😀" })).toEqual(["char:a", "char:😀"]);
  });

  it("caps how much one event can send, so a pasted essay is not a thousand presses", () => {
    expect(pressesFor({ erase: 500, insert: "x".repeat(500) }).length).toBeLessThanOrEqual(64);
  });
});
