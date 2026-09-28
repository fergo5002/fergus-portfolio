import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No eyebrows in the tools, ever.
 *
 * An eyebrow is the small upper-case label stacked above a heading ("ATLAS /
 * CONNECTED KNOWLEDGE", "01 / WHEN YOU SHOW UP"). Fergus bans them on every
 * site he owns, and until the instrument redesign (2026-09-27) every studio
 * opened with one inside a second hero, under the page's own heading. The
 * arcade has had the same ban since its overhaul (`components/arcade/arcade.test.ts`);
 * this is the tools' copy of it, across every file a tool is made of.
 *
 * Source greps, comments stripped. `scripts/mutation-check.mjs` puts an
 * eyebrow back into a studio and expects this file to go red.
 */
const ROOTS = [
  ["components", "studio"],
  ["components", "tools"],
  ["components", "instrument"],
  ["content", "studio"],
  ["content", "tools"],
  ["app", "tools"],
];
const EXTRA = [["content", "tool-workbench.ts"]];

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
}

const files: string[] = [];
for (const parts of ROOTS) walk(join(process.cwd(), ...parts), files);
for (const parts of EXTRA) files.push(join(process.cwd(), ...parts));

const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const rel = (path: string) => path.slice(process.cwd().length + 1).replace(/\\/g, "/");

describe("no eyebrow anywhere in the tools", () => {
  it("found the files it means to check", () => {
    // A grep over an empty list passes and means nothing.
    expect(files.length).toBeGreaterThan(60);
    expect(files.map(rel)).toContain("components/studio/Atlas.tsx");
    expect(files.map(rel)).toContain("components/tools/ToolPage.tsx");
  });

  it("never names one: no eyebrow class, prop or key", () => {
    const offenders = files.filter((f) => /eyebrow/i.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("has no second hero: StudioIntro is gone", () => {
    const offenders = files.filter((f) => /\bStudioIntro\b|studio-intro/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("writes no upper-case slash label, the shape every eyebrow here took", () => {
    // "ATLAS / CONNECTED KNOWLEDGE", "EXPORT / PIXEL REVIEW", "CASE FILE 001 / OPEN".
    const label = /["'`][A-Z0-9][A-Z0-9 ]{2,} \/ [A-Z0-9][A-Z0-9 ]*["'`]/;
    const offenders = files
      .filter((f) => /\.tsx?$/.test(f))
      .flatMap((f) => (code(f).match(new RegExp(label, "g")) ?? []).map((m) => `${rel(f)}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("styles no small spaced capitals in the studio sheets, the other half of an eyebrow", () => {
    for (const f of files.filter((p) => p.endsWith(".css") && /components[\\/]studio/.test(p))) {
      expect(code(f), rel(f)).not.toMatch(/text-transform:\s*uppercase/);
    }
  });
});
