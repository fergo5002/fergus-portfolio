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
    expect(src).toMatch(/toolListing\(tools\)/);
  });

  it("no longer hard-codes a tool", () => {
    expect(src).not.toContain('"/tools/headline-check"');
    expect(src).not.toMatch(/const tools = \[/);
  });

  it("links only when the row has an href", () => {
    expect(src).toMatch(/row\.href \?/);
  });

  it("builds the JSON-LD list from live tools only", () => {
    expect(src).toMatch(/liveTools\.map\(/);
  });
});
