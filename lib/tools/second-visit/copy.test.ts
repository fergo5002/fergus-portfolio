import { describe, expect, it } from "vitest";
import { TIGH_CREDIT, secondVisit, secondVisitCopy } from "@/content/tools/second-visit";
import { tools, toolBySlug } from "@/content/tools";

function everyLine(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(secondVisitCopy);
  walk(secondVisit.blurb);
  walk(secondVisit.cantSee);
  if (TIGH_CREDIT) walk(TIGH_CREDIT.line);
  return out;
}

describe("the words this tool is allowed to use", () => {
  const banned: [string, RegExp][] = [
    ["validated", /\bvalidat(e|ed|ion)\b/i],
    ["proven accurate", /\bproven accurate\b/i],
    ["predicts", /\bpredict(s|ion|ive)?\b/i],
    ["forecast", /\bforecast(s|ing)?\b/i],
    ["machine learning", /\bmachine learning\b/i],
    ["AI", /\bA\.?I\.?\b/],
    ["artificial intelligence", /\bartificial intelligence\b/i],
    ["guarantee", /\bguarantee(s|d)?\b/i],
  ];

  for (const [label, pattern] of banned) {
    it(`never says "${label}"`, () => {
      const offenders = everyLine().filter((line) => pattern.test(line));
      expect(offenders, `"${label}" in:\n${offenders.join("\n")}`).toEqual([]);
    });
  }

  const required = [
    "Your file never leaves this tab.",
    "The model has never been scored against what customers went on to do.",
    "The distance bands were drawn for a rural Irish sauna.",
    "One winter is no evidence at all about your summer.",
  ];

  for (const sentence of required) {
    it(`says: ${sentence}`, () => {
      expect(everyLine().join("\n")).toContain(sentence);
    });
  }

  it("tells the visitor that forget has nothing to wipe here", () => {
    expect(everyLine().join("\n")).toContain("nothing to wipe here");
  });
});

describe("the credit", () => {
  it("is one value, so removing it is one line", () => {
    expect(TIGH_CREDIT === null || typeof TIGH_CREDIT === "object").toBe(true);
    if (TIGH_CREDIT) {
      expect(TIGH_CREDIT.href).toMatch(/^https:\/\//);
      expect(TIGH_CREDIT.name.length).toBeGreaterThan(0);
      expect(TIGH_CREDIT.line.length).toBeGreaterThan(0);
    }
  });

  it("is the only place the credited business is named", () => {
    const named = everyLine().filter((line) => /tigh/i.test(line));
    const expected = TIGH_CREDIT ? [TIGH_CREDIT.line] : [];
    expect(named).toEqual(expected);
  });

  it("does not claim the model was checked against anything but the SQL", () => {
    if (!TIGH_CREDIT) return;
    expect(TIGH_CREDIT.line).toContain("row for row");
    expect(TIGH_CREDIT.line).not.toMatch(/\bcorrect\b/i);
  });
});

describe("the registry entry", () => {
  it("is registered, live, browser-only and at order 50", () => {
    expect(toolBySlug("second-visit")).toBe(secondVisit);
    expect(secondVisit.status).toBe("live");
    expect(secondVisit.privacy).toBe("browser");
    expect(secondVisit.order).toBe(50);
    expect(tools.map((t) => t.order)).toEqual([...tools.map((t) => t.order)].sort((a, b) => a - b));
  });

  it("names six things it cannot see, and the design's three among them", () => {
    expect(secondVisit.cantSee).toHaveLength(6);
    const all = secondVisit.cantSee.join("\n");
    expect(all).toContain("Why anyone left");
    expect(all).toContain("no town");
    expect(all).toContain("fewer than twelve months");
  });
});
