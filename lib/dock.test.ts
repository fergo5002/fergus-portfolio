import { describe, expect, it } from "vitest";
import { dockPhaseFor } from "./dock";

describe("the terminal window's phase", () => {
  it("grows out of the handle when the shell opens", () => {
    expect(dockPhaseFor("closed", true, false)).toBe("opening");
  });

  it("shrinks back into the handle when the shell closes", () => {
    expect(dockPhaseFor("open", false, false)).toBe("closing");
    expect(dockPhaseFor("opening", false, false)).toBe("closing");
  });

  it("turns round mid-shrink when the shell opens again", () => {
    expect(dockPhaseFor("closing", true, false)).toBe("opening");
  });

  it("leaves a phase that already agrees with the shell alone", () => {
    expect(dockPhaseFor("open", true, false)).toBe("open");
    expect(dockPhaseFor("opening", true, false)).toBe("opening");
    expect(dockPhaseFor("closed", false, false)).toBe("closed");
    expect(dockPhaseFor("closing", false, false)).toBe("closing");
  });

  it("never animates for someone who asked for less motion", () => {
    expect(dockPhaseFor("closed", true, true)).toBe("open");
    expect(dockPhaseFor("open", false, true)).toBe("closed");
    expect(dockPhaseFor("closing", true, true)).toBe("open");
    expect(dockPhaseFor("opening", false, true)).toBe("closed");
  });
});
