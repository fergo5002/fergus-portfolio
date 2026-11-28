import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check, and honest about being one: vitest runs in a
 * `node` environment here, so nothing mounts the page. `lib/tools/listing.test.ts`
 * proves the decision; this proves the page defers to it and no longer carries
 * a list of its own.
 */
const src = readFileSync(join(process.cwd(), "app", "tools", "page.tsx"), "utf8");

describe("/tools reads the registry", () => {
  it("renders rows from toolListing", () => {
    expect(src).toMatch(/toolListing\(featuredTools\)/);
  });

  it("no longer hard-codes a tool", () => {
    expect(src).not.toContain('"/tools/headline-check"');
    expect(src).not.toMatch(/const tools = \[/);
  });

  it("links only when the row has an href", () => {
    expect(src).toMatch(/row\.href \?/);
  });


  // 2026-11-28: five live tools were in the sitemap with no link from any page.
  it("links the tools that are not on the shelf, in a second list", () => {
    expect(src).toMatch(/toolListing\(moreTools\)/);
    expect(src).toMatch(/className="bench-more"/);
  });

  it("describes every live tool in the JSON-LD list, not only the shelf", () => {
    expect(src).toMatch(/\[\.\.\.featuredTools, \.\.\.moreTools\]\.map\(/);
  });
});
