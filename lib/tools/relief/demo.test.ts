import { describe, it, expect } from "vitest";
import { HOURS, WEEKS } from "./types";
import { DEMO_SEED, demoEvents } from "./demo";
import { MIN_EVENTS, MIN_OCCUPIED_CELLS, buildHeightmap, checkDensity } from "./heightmap";

describe("demoEvents", () => {
  it("is deterministic, so the page draws the same ground every load", () => {
    expect(demoEvents()).toEqual(demoEvents());
    expect(demoEvents(DEMO_SEED)).toEqual(demoEvents());
  });

  it("gives a different seed different ground", () => {
    expect(demoEvents(1)).not.toEqual(demoEvents(2));
  });

  it("stays inside the grid", () => {
    for (const e of demoEvents()) {
      expect(e.week).toBeGreaterThanOrEqual(0);
      expect(e.week).toBeLessThan(WEEKS);
      expect(e.hour).toBeGreaterThanOrEqual(0);
      expect(e.hour).toBeLessThan(HOURS);
      expect(Number.isInteger(e.week)).toBe(true);
      expect(Number.isInteger(e.hour)).toBe(true);
    }
  });

  /**
   * The demo exists to prove the pipeline draws something. If it were sparse
   * enough for the guard to refuse it, the page would open on a refusal.
   */
  it("clears the tool's own density guard with room to spare", () => {
    const events = demoEvents();
    expect(events.length).toBeGreaterThan(MIN_EVENTS * 2);
    expect(checkDensity(events)).toEqual({ ok: true });
    expect(buildHeightmap(events).occupied).toBeGreaterThan(MIN_OCCUPIED_CELLS * 4);
  });

  it("is not so dense that the whole sheet is one plateau", () => {
    const h = buildHeightmap(demoEvents());
    expect(h.hi - h.lo).toBeGreaterThan(0.2);
  });

  /**
   * The shape is the argument, exactly as it is in `terrain.ts`. A developer's
   * year has to have a working day in it and a dead 04:00, or the plate is
   * decoration.
   */
  it("puts the working day above the small hours", () => {
    const h = buildHeightmap(demoEvents());
    const mean = (r: number) => h.counts[r].reduce((a, b) => a + b, 0) / WEEKS;
    expect(mean(10)).toBeGreaterThan(mean(4));
    expect(mean(15)).toBeGreaterThan(mean(4));
  });
});
