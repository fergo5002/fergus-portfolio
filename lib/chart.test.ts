import { describe, it, expect } from "vitest";
import { parseChart, niceTicks, seriesExtent, describeChart, type ChartSpec } from "./chart";

const minimal = {
  kind: "bar",
  title: "Frames under budget",
  categories: ["a", "b"],
  series: [{ label: "ms", values: [1, 2] }],
};

function spec(patch: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...minimal, ...patch });
}

describe("parseChart", () => {
  it("accepts a minimal well-formed spec", () => {
    const out = parseChart(spec());
    expect(out).not.toBeNull();
    expect(out?.kind).toBe("bar");
    expect(out?.series[0].values).toEqual([1, 2]);
  });

  it("accepts a line chart", () => {
    expect(parseChart(spec({ kind: "line" }))?.kind).toBe("line");
  });

  // Every rejection below returns null rather than throwing, because the caller
  // is a markdown parser rendering a page. A malformed chart should degrade to
  // the code block the author typed, not take the route down.
  it("returns null rather than throwing on malformed JSON", () => {
    expect(parseChart("{not json")).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseChart(spec({ kind: "pie" }))).toBeNull();
  });

  it("rejects a missing or empty title", () => {
    expect(parseChart(spec({ title: "" }))).toBeNull();
    expect(parseChart(JSON.stringify({ ...minimal, title: undefined }))).toBeNull();
  });

  it("rejects an empty category list", () => {
    expect(parseChart(spec({ categories: [] }))).toBeNull();
  });

  it("rejects a series whose length does not match the categories", () => {
    // The single most likely authoring mistake, and the one that silently draws
    // a wrong chart rather than an obviously broken one.
    expect(parseChart(spec({ series: [{ label: "ms", values: [1, 2, 3] }] }))).toBeNull();
  });

  it("rejects non-finite values", () => {
    expect(parseChart(spec({ series: [{ label: "ms", values: [1, null] }] }))).toBeNull();
    expect(parseChart(spec({ series: [{ label: "ms", values: [1, "2"] }] }))).toBeNull();
  });

  it("rejects zero series", () => {
    expect(parseChart(spec({ series: [] }))).toBeNull();
  });

  /**
   * Four is the ceiling because this site is a monochrome phosphor CRT. Identity
   * has to come from luminance steps inside one hue, and a fifth step is not
   * separable from its neighbours. A categorical palette is not available here,
   * so the cap is the honest fix rather than inventing hues the theme cannot show.
   */
  it("rejects more than four series", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `s${i}`, values: [1, 2] }));
    expect(parseChart(spec({ series: five }))).toBeNull();
    const four = five.slice(0, 4);
    expect(parseChart(spec({ series: four }))).not.toBeNull();
  });

  it("requires every series to carry a label, because a legend cannot be colour alone", () => {
    expect(parseChart(spec({ series: [{ label: "", values: [1, 2] }] }))).toBeNull();
  });

  it("keeps the optional fields when present and omits them when absent", () => {
    const out = parseChart(
      spec({ unit: "ms", caption: "Measured on 2 Sep 2026.", baseline: 16.7, baselineLabel: "60fps" }),
    );
    expect(out?.unit).toBe("ms");
    expect(out?.caption).toBe("Measured on 2 Sep 2026.");
    expect(out?.baseline).toBe(16.7);
    expect(out?.baselineLabel).toBe("60fps");
    expect(parseChart(spec())?.unit).toBeUndefined();
  });

  it("ignores a non-finite baseline instead of rejecting the whole chart", () => {
    // A bad reference line is a cosmetic problem, not a reason to lose the data.
    const out = parseChart(spec({ baseline: "soon" }));
    expect(out).not.toBeNull();
    expect(out?.baseline).toBeUndefined();
  });
});

describe("seriesExtent", () => {
  it("spans every series", () => {
    const s = parseChart(
      JSON.stringify({
        ...minimal,
        series: [
          { label: "a", values: [1, 9] },
          { label: "b", values: [-4, 3] },
        ],
      }),
    ) as ChartSpec;
    expect(seriesExtent(s)).toEqual({ min: -4, max: 9 });
  });

  it("includes the baseline so a reference line is never drawn off the plot", () => {
    const s = parseChart(spec({ baseline: 50 })) as ChartSpec;
    expect(seriesExtent(s).max).toBe(50);
  });

  it("anchors a bar chart at zero, because a truncated bar axis lies about ratio", () => {
    // Bars encode magnitude by length. A non-zero baseline makes a 2% difference
    // look like a doubling. Lines encode change and may be truncated.
    const bar = parseChart(spec({ kind: "bar", series: [{ label: "a", values: [100, 104] }] })) as ChartSpec;
    expect(seriesExtent(bar).min).toBe(0);

    const line = parseChart(spec({ kind: "line", series: [{ label: "a", values: [100, 104] }] })) as ChartSpec;
    expect(seriesExtent(line).min).toBeGreaterThan(0);
  });
});

describe("niceTicks", () => {
  it("returns round numbers covering the range", () => {
    const ticks = niceTicks(0, 97);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it("produces between three and seven ticks for ordinary ranges", () => {
    for (const max of [1, 7, 12, 97, 480, 5300, 19_000_000]) {
      const ticks = niceTicks(0, max);
      expect(ticks.length, `max=${max}`).toBeGreaterThanOrEqual(3);
      expect(ticks.length, `max=${max}`).toBeLessThanOrEqual(7);
    }
  });

  it("survives a flat series without dividing by zero", () => {
    const ticks = niceTicks(5, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it("handles a negative range", () => {
    const ticks = niceTicks(-30, 10);
    expect(ticks[0]).toBeLessThanOrEqual(-30);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
  });
});

describe("describeChart", () => {
  const make = (patch: Record<string, unknown>) =>
    parseChart(JSON.stringify({ ...minimal, ...patch })) as ChartSpec;

  it("pairs each category with its value rather than listing them apart", () => {
    // The first version read out every label, then every number, as two
    // separate comma-separated runs. A listener had to hold three labels in
    // their head and re-pair them by position.
    const text = describeChart(make({ categories: ["a", "b"], series: [{ label: "n", values: [1, 2] }] }));
    expect(text).toContain("a: 1");
    expect(text).toContain("b: 2");
  });

  /**
   * The bug this exists to stop, found in shipped output. The real categories
   * on one article are "Broken, random ids", "Broken, chosen ids" and "Fixed,
   * chosen ids". Joining those with ", " produced nine comma-separated tokens
   * with nothing marking where one category ended, which a screen reader reads
   * as one flat run.
   */
  it("separates entries with a character the labels cannot contain", () => {
    const text = describeChart(
      make({
        categories: ["Broken, random ids", "Broken, chosen ids", "Fixed, chosen ids"],
        series: [{ label: "deadlocks", values: [0, 6, 0] }],
      }),
    );
    expect(text).toContain("Broken, random ids: 0;");
    expect(text).toContain("Broken, chosen ids: 6;");
    // The pairs are separable even though every label carries a comma.
    expect(text.split(";").length).toBeGreaterThanOrEqual(3);
  });

  it("names the series only when there is more than one", () => {
    const one = describeChart(make({ categories: ["a", "b"], series: [{ label: "ms", values: [1, 2] }] }));
    expect(one).not.toContain("ms 1");

    const two = describeChart(
      make({
        categories: ["a", "b"],
        series: [
          { label: "read", values: [1, 2] },
          { label: "write", values: [3, 4] },
        ],
      }),
    );
    expect(two).toContain("read 1");
    expect(two).toContain("write 3");
  });

  it("carries the unit and the baseline", () => {
    const text = describeChart(make({ unit: "ms", baseline: 16.6, baselineLabel: "frame budget" }));
    expect(text).toContain("ms");
    expect(text).toContain("frame budget");
  });

  it("stops reading out every row once there are too many to follow", () => {
    // Forty pairs read aloud is not an accessible alternative, it is a denial
    // of service. Past the cap it points at the table instead.
    const many = Array.from({ length: 40 }, (_, i) => `row ${i}`);
    const spec = make({ categories: many, series: [{ label: "n", values: many.map((_, i) => i) }] });
    const text = describeChart(spec);
    expect(text).toContain("40");
    expect(text).not.toContain("row 39");
    expect(text.length).toBeLessThan(240);
  });
});
