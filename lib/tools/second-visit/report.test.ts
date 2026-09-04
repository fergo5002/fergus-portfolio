import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { parseCsv } from "./csv";
import { DEMO_VENUE_TOWN, demoCsv } from "./demo";
import { guessRoles, toBookings } from "./mapping";
import { escapeHtml, reportHtml, stepPath } from "./report";

const analysis = (() => {
  const sheet = parseCsv(demoCsv());
  const out = toBookings(sheet, guessRoles(sheet));
  return analyse({ bookings: out.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
})();

describe("the escaper", () => {
  it("takes out all five characters that matter", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("does the ampersand first, or it double-escapes everything else", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone, accents included", () => {
    expect(escapeHtml("Seán O'Broin, Longford")).toBe("Seán O&#39;Broin, Longford");
  });
});

describe("the report", () => {
  const html = reportHtml(analysis);

  it("is a whole document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta charset="utf-8">');
  });

  /**
   * The whole point. A report full of somebody's customers that fetches
   * anything is a beacon, and one that needs a stylesheet is a blank page in
   * five years.
   */
  it("asks the network for nothing at all", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(/i);
    // The one exception, and it is a link somebody clicks rather than something
    // the document loads.
    const urls = html.match(/https?:\/\/[^"' <]+/g) ?? [];
    expect(urls.every((u) => u.startsWith("https://tighsauna.com"))).toBe(true);
  });

  it("carries its own styling inline", () => {
    expect(html).toContain("<style>");
  });

  it("prints both figures, so the comparison survives the save", () => {
    expect(html).toContain("Estimated share of first-time customers who return");
    expect(html).toContain("The figure a dashboard would show you");
  });

  it("prints the settings it was run with, so a saved report can be argued with", () => {
    expect(html).toContain(analysis.asOfIso);
    expect(html).toContain("Settings used");
    expect(html).toContain("15");  // the local band boundary
  });

  it("prints what it cannot see", () => {
    expect(html).toContain("What this cannot see");
    expect(html).toContain("Why anyone left");
  });

  it("escapes an identifier that is trying to be markup", () => {
    const hostile = {
      ...analysis,
      rows: [{ ...analysis.rows[0], id: '<script>alert(1)</script>' }],
    };
    const out = reportHtml(hostile);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("names the credited business exactly twice: the sentence and the link", () => {
    // Once inside TIGH_CREDIT.line and once as the link's text. The href is
    // lowercase and does not count. If this becomes three, the credit has been
    // repeated somewhere and removing it is no longer a one-line change.
    expect(html.split("Tigh Sauna")).toHaveLength(3);
  });
});

describe("the curve, drawn as a path", () => {
  it("is a step, because a survival curve does not slope between events", () => {
    const path = stepPath([{ day: 0, returned: 0 }, { day: 10, returned: 0.5 }], 100, 50);
    // Move, across, up, across: an L then a V, never a diagonal.
    expect(path).toMatch(/^M/);
    expect(path).toContain("H");
    expect(path).toContain("V");
    expect(path).not.toContain("C");
  });

  it("draws nothing rather than a NaN when there are no points", () => {
    expect(stepPath([], 100, 50)).toBe("");
  });
});
