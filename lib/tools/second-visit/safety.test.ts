import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The promises on the page, checked against the files rather than against the
 * copy.
 *
 * **This is a source grep and not a render.** Vitest runs in a `node`
 * environment here, so nothing below mounts a component; it reads the files and
 * asserts on their text, the same way `lib/boot.test.ts` greps `BootSequence`.
 * It cannot prove what a browser does. What it can do is fail the moment
 * somebody adds a `fetch` to a tool whose page says nothing leaves the tab.
 *
 * Line endings are normalised first: git hands this checkout CRLF and CI LF for
 * the same file, and a pattern with a bare newline in it would be red on one
 * machine and green on the other.
 */

const ROOT = process.cwd();

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

const files = [...sources("lib/tools/second-visit"), ...sources("app/tools/second-visit")];

/** Comments stripped, so a docblock explaining a rule cannot break it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("nothing leaves the tab", () => {
  const banned: [string, RegExp][] = [
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["sendBeacon", /sendBeacon/],
    ["WebSocket", /new WebSocket/],
    ["EventSource", /new EventSource/],
  ];

  for (const [name, pattern] of banned) {
    it(`never calls ${name}`, () => {
      const offenders = files.filter((file) => pattern.test(code(file)));
      expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
    });
  }

  it("was actually reading files", () => {
    // A grep over an empty list passes. This is the control.
    expect(files.length).toBeGreaterThan(12);
    expect(files.some((f) => f.endsWith("analyse.ts"))).toBe(true);
  });
});

describe("nothing is written to the visitor's machine", () => {
  const banned: [string, RegExp][] = [
    ["localStorage", /localStorage/],
    ["sessionStorage", /sessionStorage/],
    ["indexedDB", /indexedDB/],
    ["document.cookie", /document\.cookie/],
    ["caches", /\bcaches\./],
  ];

  for (const [name, pattern] of banned) {
    it(`never touches ${name}`, () => {
      const offenders = files.filter((file) => pattern.test(code(file)));
      expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
    });
  }

  it("and the page says so, so the claim and the code are checked together", async () => {
    const { secondVisitCopy } = await import("@/content/tools/second-visit");
    expect(JSON.stringify(secondVisitCopy)).toContain("nothing to wipe here");
  });
});

