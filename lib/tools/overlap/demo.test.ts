import { describe, expect, it } from "vitest";
import { entriesFrom, readConnections } from "./csv";
import { DEMO_SEED, DEMO_SHARED, demoCsv, demoLists, runDemo } from "./demo";

describe("the two lists", () => {
  it("is the same two lists every time", () => {
    expect(JSON.stringify(demoLists())).toBe(JSON.stringify(demoLists()));
    expect(DEMO_SEED).toBe(20260903);
  });

  it("is two lists of a plausible size with a stated overlap", () => {
    const { a, b } = demoLists();
    expect(a.length).toBeGreaterThan(300);
    expect(b.length).toBeGreaterThan(300);
    const shared =
      new Set(a.map((e) => e.slug)).size +
      new Set(b.map((e) => e.slug)).size -
      new Set([...a, ...b].map((e) => e.slug)).size;
    expect(shared).toBe(DEMO_SHARED);
    expect(DEMO_SHARED).toBe(37);
  });

  it("spells one shared person differently in each file, on purpose", () => {
    const { a, b } = demoLists();
    const slug = "sine-ni-dhomhnaill-4f2a";
    expect(a.find((e) => e.slug === slug)?.label).toBe("Síne Ní Dhomhnaill");
    expect(b.find((e) => e.slug === slug)?.label).toBe("Sine Ni Dhomhnaill");
  });

  it("has no duplicate slugs inside either list", () => {
    const { a, b } = demoLists();
    for (const list of [a, b]) expect(new Set(list.map((e) => e.slug)).size).toBe(list.length);
  });
});

describe("the files it can be saved as", () => {
  it("round trips through the reader this tool ships", () => {
    const { a } = demoLists();
    const file = readConnections(demoCsv(a, "Aoife"));
    expect(file.urlColumn).toBe(2);
    const { entries, counts } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(counts.used).toBe(a.length);
    expect(entries.map((e) => e.slug)).toEqual(a.map((e) => e.slug));
    expect(entries[0].label).toBe(a[0].label);
  });

  it("carries the preamble a real export has, so the reader is exercised", () => {
    const text = demoCsv(demoLists().a, "Aoife");
    expect(text.split("\r\n")[0]).toBe("Notes:");
    expect(text.split("\r\n")[3]).toContain("First Name,Last Name,URL");
  });

  it("carries a row with no profile link, because a real export does", () => {
    const text = demoCsv(demoLists().a, "Aoife");
    const file = readConnections(text);
    expect(entriesFrom(file, file.urlColumn, file.nameColumns).counts.empty).toBeGreaterThan(0);
  });
});

describe("runDemo", () => {
  it("runs the real exchange and finds the stated overlap", async () => {
    const { a, b } = await runDemo();
    expect(a.shared).toHaveLength(DEMO_SHARED);
    expect(b.shared).toHaveLength(DEMO_SHARED);
    expect(a.mode).toBe("exact");
    expect(a.safety).toBe(b.safety);
  });

  it("gives each side the spelling from its own file", async () => {
    const { a, b } = await runDemo();
    expect(a.shared.some((e) => e.label === "Síne Ní Dhomhnaill")).toBe(true);
    expect(b.shared.some((e) => e.label === "Sine Ni Dhomhnaill")).toBe(true);
    expect(a.shared.some((e) => e.label === "Sine Ni Dhomhnaill")).toBe(false);
  });
});
