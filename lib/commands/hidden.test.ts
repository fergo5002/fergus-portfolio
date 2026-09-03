import { describe, it, expect } from "vitest";
import { hidden } from "./hidden";

describe("the hidden module", () => {
  it("holds the arcade door, hidden, with no help and no completion", () => {
    const arcade = hidden.find((c) => c.name === "arcade");
    if (!arcade) throw new Error("no arcade");
    expect(arcade.hidden).toBe(true);
    expect(arcade.help).toBeUndefined();
    expect(arcade.argPool).toBeUndefined();
  });

  it("is closed until G0 supplies a runtime", () => {
    const arcade = hidden.find((c) => c.name === "arcade")!;
    expect(arcade.run([], {}, "arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
  });

  it("marks everything in it hidden, by construction", () => {
    for (const c of hidden) expect(c.hidden, c.name).toBe(true);
  });
});
