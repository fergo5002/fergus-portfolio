import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projects } from "./projects";

/** The Remand card shows Remand's own R, not a drawn diagram (Fergus, 2026-10-27). */

describe("the Remand card", () => {
  const remand = projects.find((p) => p.slug === "remand");

  it("is the Remand R mark", () => {
    expect(remand?.image).toBe("/img/remand.png");
    expect(remand?.imageAlt).toMatch(/\bR\b/);
    expect(remand?.imageAlt).not.toMatch(/illustration|threads/i);
  });

  it("is built from a vendored source, so the card survives Remand's site changing", () => {
    expect(existsSync(join(process.cwd(), "assets", "sources", "remand-r.svg"))).toBe(true);
    const builder = readFileSync(join(process.cwd(), "scripts", "build-images.mjs"), "utf8");
    expect(builder).toMatch(/remand-r\.svg/);
    expect(builder).toMatch(/"remand\.png"/);
  });
});
