import { describe, expect, it } from "vitest";
import {
  INITIAL_RELIEF_SOURCE,
  abortForSourceChange,
  markDrawnSource,
  selectReliefSource,
} from "./source";

describe("Relief source state", () => {
  it("keeps the last drawn provenance when somebody only opens another input", () => {
    const selected = selectReliefSource(INITIAL_RELIEF_SOURCE, "github");
    expect(selected).toEqual({ selected: "github", drawn: "demo" });

    expect(markDrawnSource(selected, "github")).toEqual({
      selected: "github",
      drawn: "github",
    });
  });

  it("aborts a live request before leaving its source, but not on a no-op selection", () => {
    const active = new AbortController();
    expect(abortForSourceChange(active, "github", "csv")).toBe(true);
    expect(active.signal.aborted).toBe(true);

    const same = new AbortController();
    expect(abortForSourceChange(same, "github", "github")).toBe(false);
    expect(same.signal.aborted).toBe(false);
  });
});
