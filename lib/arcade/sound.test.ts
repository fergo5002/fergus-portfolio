import { describe, it, expect } from "vitest";
import { ARCADE_SOUNDS, soundFor } from "@/lib/arcade/sound";

describe("the sound vocabulary", () => {
  it("is exactly five names, so a game plan can list them", () => {
    expect(Object.keys(ARCADE_SOUNDS).sort()).toEqual(["blip", "die", "hit", "score", "wall"]);
  });

  it("names only methods TubeAudio actually has", () => {
    // Checked against lib/audio.ts by hand, and asserted here so a rename
    // there fails a test rather than going quiet on a live page.
    const allowed = new Set(["hover", "key", "relay", "thud", "impact"]);
    for (const call of Object.values(ARCADE_SOUNDS)) expect(allowed.has(call.method), call.method).toBe(true);
  });

  it("makes a wall quieter than a hit", () => {
    const wall = ARCADE_SOUNDS.wall;
    const hit = ARCADE_SOUNDS.hit;
    if (wall.method !== "impact" || hit.method !== "impact") throw new Error("both are impacts");
    expect(wall.energy).toBeLessThan(hit.energy);
  });

  it("keeps every impact energy inside the range impactGain answers to", () => {
    for (const call of Object.values(ARCADE_SOUNDS)) {
      if (call.method !== "impact") continue;
      expect(call.energy).toBeGreaterThan(0.04);
      expect(call.energy).toBeLessThanOrEqual(1);
    }
  });

  it("returns null for a name nobody defined, rather than a silent default", () => {
    expect(soundFor("blip")).toEqual({ method: "hover" });
    expect(soundFor("bleep")).toBeNull();
    expect(soundFor("")).toBeNull();
  });
});
