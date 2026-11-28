import { describe, it, expect } from "vitest";
import { ageOn, profile } from "./profile";
import { experience, roleLine } from "./experience";

describe("the age in the bio", () => {
  it("turns over on the birthday, not before", () => {
    expect(ageOn(new Date("2026-12-04T23:00:00Z"))).toBe(20);
    expect(ageOn(new Date("2026-12-05T12:00:00Z"))).toBe(21);
    expect(ageOn(new Date("2027-12-05T12:00:00Z"))).toBe(22);
  });

  it("is the age the bio states", () => {
    expect(profile.bio[0]).toContain(`I am ${ageOn(new Date())} years old`);
  });
});

describe("the search description", () => {
  it("fits a search result and carries what tells him apart", () => {
    const text = profile.search.description;
    expect(text.length).toBeGreaterThanOrEqual(110);
    expect(text.length).toBeLessThanOrEqual(160);
    for (const term of ["Dublin", "Trinity", "Hatch105"]) expect(text).toContain(term);
    expect(text).not.toMatch(/years old/);
  });
});

describe("roleLine", () => {
  it("never names an unnamed company as an employer", () => {
    expect(experience[0].unnamed).toBe(true);
    expect(roleLine(experience[0])).toBe(experience[0].role);
    expect(roleLine(experience[0])).not.toMatch(/Stealth$/);
  });

  it("joins role and organisation for a named one", () => {
    const named = experience.find((e) => !e.unnamed)!;
    expect(roleLine(named)).toBe(`${named.role} at ${named.org}`);
    expect(roleLine(named, " · ")).toBe(`${named.role} · ${named.org}`);
  });
});
