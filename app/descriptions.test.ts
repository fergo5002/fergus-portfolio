import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The meta description of each section page, held to the window a search
 * result shows. On 2026-11-28 `/writing` was 27 characters, `/mcp` was 202,
 * `/experience` left out the current role, and `/projects` called a dungeon
 * crawler "a game engine's lighting system".
 */
const PAGES = ["experience", "projects", "writing", "tools", "mcp"];

function description(page: string): string {
  const src = readFileSync(join(process.cwd(), "app", page, "page.tsx"), "utf8");
  const match = src.match(/const DESCRIPTION =\s*\n?\s*"([^"]+)";/);
  if (!match) throw new Error(`app/${page}/page.tsx has no literal DESCRIPTION`);
  return match[1];
}

describe("section page descriptions", () => {
  it.each(PAGES)("/%s fits a search result and names him", (page) => {
    const text = description(page);
    expect(text.length, text).toBeGreaterThanOrEqual(110);
    expect(text.length, text).toBeLessThanOrEqual(160);
    expect(text).toContain("Fergus O'Reilly");
    expect(text).not.toMatch(/[—–]/);
  });

  it("says what he is doing now on /experience", () => {
    expect(description("experience")).toMatch(/stealth/i);
  });
});
