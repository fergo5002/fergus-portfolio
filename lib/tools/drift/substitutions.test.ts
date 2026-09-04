import { describe, it, expect } from "vitest";
import { PAIRS, countForms, countPairs, substitutionsFrom } from "./substitutions";
import { words } from "./text";

describe("the table itself", () => {
  it("has unique ids and at least one form on each side", () => {
    const ids = PAIRS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pair of PAIRS) {
      expect(pair.formal.length, pair.id).toBeGreaterThan(0);
      expect(pair.plain.length, pair.id).toBeGreaterThan(0);
    }
  });

  it("holds every form lowercased, because the tokeniser lowercases", () => {
    for (const pair of PAIRS) {
      for (const form of [...pair.formal, ...pair.plain]) expect(form, form).toBe(form.toLowerCase());
    }
  });

  it("names the id after its first formal form, so a report row is traceable", () => {
    for (const pair of PAIRS) expect(pair.id).toBe(pair.formal[0].replace(/ /g, "-"));
  });

  it("carries the pairs the house style actually cares about", () => {
    const ids = PAIRS.map((p) => p.id);
    for (const id of ["utilise", "leverage", "commence", "regarding", "delve", "seamless", "robust"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("countForms", () => {
  it("counts whole tokens, never a substring", () => {
    expect(countForms(words("we use it and reuse it and the user used it"), ["use", "used"])).toBe(2);
  });

  it("counts a multi-word form as one hit", () => {
    expect(countForms(words("prior to the meeting, and prior to lunch"), ["prior to"])).toBe(2);
    expect(countForms(words("a prior commitment"), ["prior to"])).toBe(0);
  });

  it("returns zero for an empty token list", () => {
    expect(countForms([], ["use"])).toBe(0);
  });
});

describe("countPairs", () => {
  it("counts both sides of every pair in one pass", () => {
    const counts = countPairs("We utilise the thing. We also use the other thing and use it again.");
    expect(counts.utilise).toEqual({ formal: 1, plain: 2 });
  });

  it("has an entry for every pair, so a profile shape is fixed", () => {
    const counts = countPairs("");
    expect(Object.keys(counts).sort()).toEqual(PAIRS.map((p) => p.id).sort());
    for (const value of Object.values(counts)) expect(value).toEqual({ formal: 0, plain: 0 });
  });
});

describe("substitutionsFrom", () => {
  const corpus = "We use the tool. We use it again and we use it daily. It helps and it helps a lot.";

  it("names a formal word the writer has never used, when they use the plain one", () => {
    const rows = substitutionsFrom(countPairs(corpus), "We utilise the tool to utilise the data.");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "utilise", formal: "utilise", plain: "use", draftCount: 2 });
    expect(rows[0].profilePlain).toBe(3);
  });

  it("says nothing when the writer does use the formal word themselves", () => {
    const own = countPairs(`${corpus} I utilise it when the mood takes me.`);
    expect(substitutionsFrom(own, "We utilise the tool.")).toEqual([]);
  });

  it("says nothing when there is no evidence of the plain word either", () => {
    // No "use" anywhere in the corpus, so there is nothing to claim they write
    // instead. Silence beats a guess.
    expect(substitutionsFrom(countPairs("Nothing relevant here at all."), "We utilise it.")).toEqual([]);
  });

  it("says nothing when the draft does not use the formal word", () => {
    expect(substitutionsFrom(countPairs(corpus), "We use the tool.")).toEqual([]);
  });

  it("sorts by how often the draft leans on it", () => {
    const counts = countPairs("We use it and we help with it and we start it. Use, help, start.");
    const rows = substitutionsFrom(counts, "We utilise and leverage and leverage and leverage it.");
    expect(rows.map((r) => r.id)).toEqual(["leverage", "utilise"]);
  });
});
