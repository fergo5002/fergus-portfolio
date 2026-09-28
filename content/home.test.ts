import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homeCopy } from "./home";
import { profile } from "./profile";

/** The homepage hero and the company cards under it (Fergus, 2026-09-28). */

describe("the hero line", () => {
  it("is the line Fergus chose", () => {
    expect(profile.tagline).toBe("I build things, and then I scale them");
  });
});

describe("every company card shows the company's own mark", () => {
  for (const [name, work] of Object.entries(homeCopy.previews)) {
    it(`${name} has a built image and alt text`, () => {
      expect(work.image).toMatch(/^\/img\/[a-z0-9-]+\.png$/);
      expect(existsSync(join(process.cwd(), "public", work.image))).toBe(true);
      expect(work.alt.length).toBeGreaterThan(0);
    });
  }

  it("Hatch105 is its cracked-egg wordmark, not lettering drawn in the site's font", () => {
    expect(homeCopy.previews.hatch.image).toBe("/img/hatch105.png");
    expect(homeCopy.previews.hatch.alt).toMatch(/egg/i);
    const preview = readFileSync(join(process.cwd(), "components", "WorkPreview.tsx"), "utf8");
    expect(preview).not.toMatch(/work-preview__hatch/);
  });

  it("is built from a vendored source, so the card survives Hatch105 redesigning its site", () => {
    expect(existsSync(join(process.cwd(), "assets", "sources", "hatch105-cracked-logo.webp"))).toBe(true);
    const builder = readFileSync(join(process.cwd(), "scripts", "build-images.mjs"), "utf8");
    expect(builder).toMatch(/hatch105-cracked-logo\.webp/);
    expect(builder).toMatch(/"hatch105\.png"/);
  });
});
