import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools, toolBySlug } from "@/content/tools";

/**
 * A source-coupling check on the route. Atlas itself is rendered in
 * `components/studio/Atlas.test.ts`; this pins how the page hands it to the
 * shell. Line endings are normalised first (a Windows checkout with autocrlf).
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

const page = read("app", "tools", "atlas", "page.tsx");

describe("the Atlas page", () => {
  it("hands the shell's stage the map and nothing else: no notes, no second lede beside it", () => {
    expect(page).toMatch(/<ToolPage tool=\{tool\}>\s*<AtlasStudio poster=\{<AtlasPoster \/>\} \/>\s*<\/ToolPage>/);
  });

  it("draws the example on the server, so the first paint is the map rather than a loading line", () => {
    expect(page).toContain('import AtlasPoster from "@/components/studio/AtlasPoster"');
    expect(page).toContain('import AtlasStudio from "@/components/studio/AtlasStudio"');
    expect(page).not.toContain("<Studio ");
  });

  it("takes its metadata off the registry entry and imports its own stylesheet", () => {
    expect(page).toContain("description: tool.blurb");
    expect(page).toContain("canonical(PATH)");
    expect(page).toContain('import "./tool.css"');
  });

  it("is live, so the sitemap and llms.txt carry it", () => {
    expect(liveTools.map((t) => t.slug)).toContain("atlas");
  });
});

describe("the Atlas registry entry", () => {
  const tool = toolBySlug("atlas")!;
  const disclosure = [...(tool.method ?? []), ...tool.cantSee].join(" ");

  it("moves the limits into the one disclosure", () => {
    for (const limit of ["1,000 files", "80 MB", "100 text files", "8 MB", "OCR"]) expect(disclosure, limit).toContain(limit);
  });

  it("keeps the privacy line honest about GitHub and about what a saved map carries", () => {
    const line = tool.privacyLine ?? "";
    expect(line).toMatch(/GitHub/);
    expect(line).toMatch(/saved map/i);
    expect(line).toMatch(/text/);
    expect(line).not.toContain("Nothing leaves this tab");
  });

  it("says a shared word is not a shared meaning", () => {
    expect(disclosure).toMatch(/not proof/i);
  });
});
