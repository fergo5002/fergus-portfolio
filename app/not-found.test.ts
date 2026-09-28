import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { notFoundCopy } from "@/content/not-found";

/**
 * The 404 page. Source-coupling checks; vitest runs in node and renders nothing.
 * The browser check (scripts/not-found-check.mjs) proves the status and the page.
 */
const path = join(process.cwd(), "app", "not-found.tsx");

describe("the 404 page", () => {
  it("exists, instead of the framework's unstyled default", () => {
    expect(existsSync(path)).toBe(true);
  });

  const source = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("has a real heading and takes its words from content", () => {
    expect(source).toMatch(/<h1[\s\S]*?\{copy\.title\}[\s\S]*?<\/h1>/);
    expect(notFoundCopy.title.length).toBeGreaterThan(0);
  });

  it("offers a way home and the main rooms, as real links", () => {
    const hrefs = notFoundCopy.links.map((l) => l.href);
    expect(hrefs[0]).toBe("/");
    expect(hrefs).toEqual(expect.arrayContaining(["/writing", "/projects"]));
    expect(source).toMatch(/<Link\b/);
  });

  it("draws its test card with shapes only, never words, so a text extractor reads only the message", () => {
    const card = source.match(/<div className="nosignal__card"[\s\S]*?(?=<MissingPath)/)?.[0] ?? "";
    expect(card.length).toBeGreaterThan(0);
    expect(card).not.toMatch(/<text\b|\{copy\./);
  });
});
