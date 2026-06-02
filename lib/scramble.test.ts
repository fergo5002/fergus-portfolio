import { describe, it, expect } from "vitest";
import { scrambleFrame } from "@/lib/scramble";

describe("scrambleFrame", () => {
  it("reveals the first N target chars and randomises the rest", () => {
    const out = scrambleFrame("HELLO", 2, "#");
    expect(out.startsWith("HE")).toBe(true);
    expect(out).toHaveLength(5);
  });
  it("returns the full target when revealed >= length", () => {
    expect(scrambleFrame("HELLO", 5, "#")).toBe("HELLO");
    expect(scrambleFrame("HELLO", 99, "#")).toBe("HELLO");
  });
  it("keeps spaces in place", () => {
    const out = scrambleFrame("A B", 0, "#");
    expect(out[1]).toBe(" ");
  });
});
