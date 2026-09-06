import { it, expect } from "vitest";
import { survivingHypotheses, dailyCase, calibration } from "./detective";
import { cases } from "@/content/lab/cases";
it("combines evidence rather than requiring one magic test", () => {
  const c = {
    ...cases[0],
    answer: 1,
    tests: [
      { id: "a", cost: 1, label: "A", outcomes: ["yes", "yes", "no"] },
      { id: "b", cost: 1, label: "B", outcomes: ["no", "yes", "yes"] },
    ],
  };
  expect(survivingHypotheses(c, ["a"])).toEqual([0, 1]);
  expect(survivingHypotheses(c, ["a", "b"])).toEqual([1]);
});
it("uses the same daily case for a calendar date and penalises confident errors", () => {
  expect(dailyCase("2026-09-06", 12)).toBe(dailyCase("2026-09-06", 12));
  expect(calibration(false, 99)).toBeLessThan(calibration(false, 50));
  expect(calibration(true, 100)).toBe(100);
});
