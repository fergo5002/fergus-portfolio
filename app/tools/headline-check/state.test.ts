import { describe, expect, it } from "vitest";
import { HEADLINE_BUDGETS, headlineCopy } from "./state";

/**
 * The numbers the action spends, pinned so a change to them is a change
 * somebody meant. The third test ties them to the Redis meter: 500,000
 * commands a month is the allotment, the design's table already plans 206k of
 * it across the other tools, and this tool at its own ceiling must leave that
 * total under the 60% rule.
 */
describe("HEADLINE_BUDGETS", () => {
  it("is per address, per site and for everyone, in windows the sentence can name", () => {
    expect(HEADLINE_BUDGETS.ip).toEqual({ limit: 20, windowSec: 3600 });
    expect(HEADLINE_BUDGETS.target).toEqual({ limit: 60, windowSec: 3600 });
    expect(HEADLINE_BUDGETS.global).toEqual({ limit: 300, windowSec: 86_400 });
  });

  it("trips the per-address budget before the per-site one, so a live check from one address is deterministic", () => {
    expect(HEADLINE_BUDGETS.ip.limit).toBeLessThan(HEADLINE_BUDGETS.target.limit);
  });

  it("stays under 12% of the monthly Redis meter at the global ceiling", () => {
    // Three budgets a check, two commands each when allowed, every day of the
    // longest month. 206k planned elsewhere plus this must stay under 300k.
    const commandsPerCheck = 3 * 2;
    const worstMonth = HEADLINE_BUDGETS.global.limit * commandsPerCheck * 31;
    expect(worstMonth).toBeLessThan(500_000 * 0.12);
  });
});

describe("headlineCopy", () => {
  it("has a sentence for the store being down, and none for a limit, which the budget now writes", () => {
    expect(headlineCopy.storeDown.endsWith(".")).toBe(true);
    expect(headlineCopy.storeDown.length).toBeGreaterThan(20);
    expect("limited" in headlineCopy).toBe(false);
  });
});
