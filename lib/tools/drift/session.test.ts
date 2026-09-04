import { describe, expect, it } from "vitest";
import {
  afterBuild,
  afterDelete,
  afterDemo,
  afterRestore,
  afterSave,
  canMeasure,
  demoSession,
  type DriftSession,
} from "./session";

const visitor: DriftSession = {
  source: "visitor",
  savedAt: "2026-09-04T12:00:00.000Z",
  samples: "Private sample text",
  draft: "Private draft text",
};

describe("the Drift session", () => {
  it("cannot measure a visitor draft while the active reference is the worked example", () => {
    expect(canMeasure(demoSession("The worked example"))).toBe(false);
    expect(canMeasure(visitor)).toBe(true);
  });

  it("keeps an older saved record visible and deletable when a new profile is built", () => {
    expect(afterBuild(visitor)).toEqual({ ...visitor, source: "visitor" });
  });

  it("restores a saved profile without losing text already typed during hydration", () => {
    const typing = { ...demoSession("Demo"), samples: "typing", draft: "draft" };
    expect(afterRestore(typing, "2026-09-04T13:00:00.000Z")).toEqual({
      source: "visitor",
      savedAt: "2026-09-04T13:00:00.000Z",
      samples: "typing",
      draft: "draft",
    });
  });

  it("clears both visitor text fields and returns to the demo only after deletion succeeds", () => {
    expect(afterDelete(visitor, true, "The worked example")).toEqual(
      demoSession("The worked example"),
    );
  });

  it("retains the whole session when deletion fails", () => {
    expect(afterDelete(visitor, false, "The worked example")).toBe(visitor);
  });

  it("marks a visitor profile saved without changing either text field", () => {
    const unsaved = { ...visitor, savedAt: null };
    expect(afterSave(unsaved, "2026-09-04T14:00:00.000Z")).toEqual({
      ...unsaved,
      savedAt: "2026-09-04T14:00:00.000Z",
    });
  });

  it("shows the demo without hiding an older saved profile from deletion", () => {
    expect(afterDemo(visitor, "The worked example")).toEqual({
      ...visitor,
      source: "demo",
      draft: "The worked example",
    });
  });
});
