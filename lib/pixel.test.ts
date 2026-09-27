import { describe, expect, it } from "vitest";
import { checkSprite, pixelRuns, type PixelSprite } from "./pixel";
import { meetingSprites } from "@/components/pixel/meeting-sprites";

describe("pixelRuns", () => {
  it("merges a horizontal run of one tone into a single rect", () => {
    expect(pixelRuns(["##+."])).toEqual([
      { x: 0, y: 0, w: 2, tone: "ink" },
      { x: 2, y: 0, w: 1, tone: "mid" },
    ]);
  });

  it("never merges across rows or across a gap", () => {
    expect(pixelRuns(["#.#", "##."])).toEqual([
      { x: 0, y: 0, w: 1, tone: "ink" },
      { x: 2, y: 0, w: 1, tone: "ink" },
      { x: 0, y: 1, w: 2, tone: "ink" },
    ]);
  });

  it("reads every tone in the legend", () => {
    expect(pixelRuns(["#*+="]).map((r) => r.tone)).toEqual(["ink", "bright", "mid", "faint"]);
  });
});

describe("checkSprite", () => {
  const good: PixelSprite = { base: ["#.", ".#"], frames: [["..", ".."], ["+.", ".."]] };

  it("accepts a rectangular sprite whose frames match the base", () => {
    expect(() => checkSprite("good", good)).not.toThrow();
  });

  it("refuses a ragged row, naming the sprite and the row", () => {
    expect(() => checkSprite("ragged", { base: ["##", "#"], frames: [] })).toThrow(/ragged.*row 1/);
  });

  it("refuses a character outside the legend", () => {
    expect(() => checkSprite("odd", { base: ["#x"], frames: [] })).toThrow(/odd.*"x"/);
  });

  it("refuses a frame that is not the size of the base", () => {
    expect(() => checkSprite("frame", { base: ["##", "##"], frames: [["##"]] })).toThrow(/frame.*frame 0/);
  });
});

describe("the contact sprites", () => {
  it("are valid two-frame sprites, so the boil always has a frame to rest on", () => {
    for (const [name, sprite] of Object.entries(meetingSprites)) {
      expect(() => checkSprite(name, sprite)).not.toThrow();
      expect(sprite.frames).toHaveLength(2);
    }
  });

  it("stay coarse: a sprite is pixel art, not an etching at a finer grid", () => {
    for (const sprite of Object.values(meetingSprites)) {
      expect(sprite.base[0].length).toBeLessThanOrEqual(32);
      expect(sprite.base.length).toBeLessThanOrEqual(24);
    }
  });
});
