import { describe, expect, it } from "vitest";
import { candidates } from "./commands";

describe("what Tab could become", () => {
  it("lists every command a prefix could still be, when there is more than one", () => {
    expect(candidates("c")).toEqual(expect.arrayContaining(["cat", "cd", "clear", "contact", "crt"]));
  });

  it("says nothing when the answer is unambiguous or empty", () => {
    expect(candidates("neof")).toEqual([]);
    expect(candidates("")).toEqual([]);
    expect(candidates("zzz")).toEqual([]);
  });

  it("lists arguments too", () => {
    expect(candidates("theme ")).toEqual(["green", "amber", "ice"]);
    expect(candidates("open g")).toEqual([]);
  });

  it("never lists a hidden command, so the arcade stays a secret", () => {
    expect(candidates("a")).not.toContain("arcade");
  });
});
