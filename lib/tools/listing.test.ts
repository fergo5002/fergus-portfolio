import { describe, it, expect } from "vitest";
import { toolListing } from "./listing";
import { tools, toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";

/**
 * The one decision the index page makes, tested as a value: a `soon` tool is
 * listed and not linked. The page cannot be mounted here (node environment,
 * no DOM), so the decision lives in a pure function and the page only maps
 * over its output. `app/tools/page.test.ts` checks the page really does that.
 */

const live: ToolEntry = {
  slug: "alpha",
  name: "Alpha",
  blurb: "Does alpha, in the browser, for anyone who asks.",
  privacy: "browser",
  cantSee: ["Anything it was not shown."],
  status: "live",
  order: 10,
};

const soon: ToolEntry = { ...live, slug: "beta", name: "Beta", privacy: "server", status: "soon", order: 20 };

describe("toolListing", () => {
  it("links a live tool to its route", () => {
    const [row] = toolListing([live]);
    expect(row.href).toBe("/tools/alpha");
    expect(row.soon).toBe(false);
  });

  it("lists a soon tool with no link at all", () => {
    const [row] = toolListing([soon]);
    expect(row.href).toBeNull();
    expect(row.soon).toBe(true);
    expect(row.name).toBe("Beta");
  });

  it("prints the privacy line that matches where the tool runs", () => {
    const [a, b] = toolListing([live, soon]);
    expect(a.privacyLine).toBe(toolShellCopy.privacy.browser);
    expect(b.privacyLine).toBe(toolShellCopy.privacy.server);
  });

  it("keeps the order it was given", () => {
    expect(toolListing([soon, live]).map((r) => r.slug)).toEqual(["beta", "alpha"]);
  });

  it("gives every real live tool a link and every real soon tool none", () => {
    for (const row of toolListing(tools)) {
      expect(row.href === null, row.slug).toBe(row.soon);
    }
  });
});
