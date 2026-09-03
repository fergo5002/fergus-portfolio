import { describe, it, expect } from "vitest";
import { formatWho, localPresence } from "./presence";

describe("localPresence", () => {
  it("counts one: the visitor", async () => {
    await expect(localPresence.count()).resolves.toBe(1);
  });
});

describe("formatWho", () => {
  it("is 'just you' for one, for nothing, and for nonsense", () => {
    expect(formatWho(1)).toEqual(["just you"]);
    expect(formatWho(0)).toEqual(["just you"]);
    expect(formatWho(-4)).toEqual(["just you"]);
    expect(formatWho(Number.NaN)).toEqual(["just you"]);
  });

  it("names the count once there is company", () => {
    const [line] = formatWho(3);
    expect(line).toContain("3");
    expect(line).not.toContain("just you");
  });
});
