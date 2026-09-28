import { describe, expect, it } from "vitest";
import { steerKeys } from "./steer";

describe("steerKeys: a held finger steers towards itself", () => {
  it("heads for the finger on both axes", () => {
    expect([...steerKeys({ x: 100, y: 100 }, { x: 300, y: 20 })].sort()).toEqual(["right", "up"]);
    expect([...steerKeys({ x: 300, y: 100 }, { x: 100, y: 400 })].sort()).toEqual(["down", "left"]);
  });
  it("stops once the ship is on the finger, instead of sailing past it", () => {
    // Keys used to be set only when a pointer event arrived, so a finger held
    // still sent the ship past it into the wall, where the beam goes dark
    // under move-to-fire (code review, 2026-09-27).
    expect(steerKeys({ x: 200, y: 200 }, { x: 205, y: 190 }).size).toBe(0);
    expect([...steerKeys({ x: 230, y: 200 }, { x: 200, y: 200 })]).toEqual(["left"]);
  });
});
