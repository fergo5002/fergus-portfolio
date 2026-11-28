import { describe, it, expect } from "vitest";
import { pageDescriptions } from "@/content/pages";

/**
 * The meta description of each section page, held to the window a search
 * result shows. On 2026-11-28 `/writing` was 27 characters, `/mcp` was 202,
 * `/experience` left out the current role, and `/projects` called a dungeon
 * crawler "a game engine's lighting system".
 */
const PAGES = ["experience", "projects", "writing", "tools", "mcp"] as const;

const description = (page: (typeof PAGES)[number]) => pageDescriptions[page];

describe("section page descriptions", () => {
  it.each(PAGES)("/%s fits a search result and names him", (page) => {
    const text = description(page);
    expect(text.length, text).toBeGreaterThanOrEqual(110);
    expect(text.length, text).toBeLessThanOrEqual(160);
    expect(text).toContain("Fergus O'Reilly");
    expect(text).not.toMatch(/[—–]/);
  });

  it("never counts the tools: a number in a description goes stale silently", () => {
    expect(description("tools")).not.toMatch(/\b(ten|\d+)\b/i);
  });

  it("says what he is doing now on /experience", () => {
    expect(description("experience")).toMatch(/stealth/i);
  });
});
