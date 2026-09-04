import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { overlap } from "@/content/tools/overlap";

/** A source-coupling check: the page renders through the shell and owns its CSS. */
const source = readFileSync(join(process.cwd(), "app", "tools", "overlap", "page.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("/tools/overlap", () => {
  it("renders through ToolPage rather than laying itself out", () => {
    expect(source).toContain('from "@/components/tools/ToolPage"');
    expect(source).toMatch(/<ToolPage[\s\S]*tool=\{overlap\}/);
  });

  it("imports its own stylesheet and not the shell's", () => {
    expect(source).toContain('import "./tool.css"');
    expect(source).not.toContain("globals.css");
  });

  it("is a server component, so the words are in the HTML before any script", () => {
    expect(source).not.toContain('"use client"');
  });

  it("is registered as live", () => {
    expect(overlap.status).toBe("live");
  });
});
