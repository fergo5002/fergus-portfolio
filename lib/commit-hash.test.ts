import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortHash } from "./commit-hash";
import { experience } from "@/content/experience";

describe("shortHash", () => {
  it("is seven lower-case hex characters, like a short git hash", () => {
    expect(shortHash("tigh-sauna")).toMatch(/^[0-9a-f]{7}$/);
  });

  it("is stable for the same entry, so a reload never changes it", () => {
    expect(shortHash("presterly")).toBe(shortHash("presterly"));
  });

  it("differs between every entry on the experience page", () => {
    const hashes = experience.map((e) => shortHash(e.id));
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("the experience log's costume", () => {
  const source = readFileSync(join(process.cwd(), "components", "ExperienceItem.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  it("draws the commit marker, hash and HEAD in CSS rather than writing them as text", () => {
    // The old marker was a text node, "● commit", in front of every entry's words.
    expect(source).not.toMatch(/>\s*●?\s*commit\s*</);
    expect(source).toMatch(/--hash/);
    expect(css).toMatch(/\.exp__commit::before\s*\{[^}]*content:[^}]*var\(--hash/);
    expect(css).toMatch(/\.exp__commit\[data-head\]::after\s*\{[^}]*HEAD/);
  });
});
