import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The promises the whole tool makes, checked across every file at once rather
 * than one module at a time, because the thing that breaks a promise like this
 * is always the file nobody thought to look at.
 *
 * Source greps, so what they prove is that the code does not contain the call.
 * They cannot prove a browser makes no request; Task 13 watches the network
 * panel on the live site for that.
 */
function sources(dir: string[]): { name: string; src: string }[] {
  const base = join(process.cwd(), ...dir);
  return readdirSync(base)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."))
    .map((name) => ({
      name: join(...dir, name),
      src: readFileSync(join(base, name), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\/\*[\s\S]*?\*\//g, " "),
    }));
}

const files = [...sources(["lib", "tools", "relief"]), ...sources(["app", "tools", "relief"])];

describe("relief stores nothing, anywhere", () => {
  it("found the files it means to check", () => {
    // A grep suite over an empty list passes and means nothing. Ten modules in
    // lib and two files in app at the end of Task 10.
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(files.map((f) => f.name.replace(/\\/g, "/"))).toContain(
      "app/tools/relief/ReliefTool.tsx",
    );
  });

  // Only names no English sentence contains, because line comments are not
  // stripped here: stripping them would eat the `//` in an https URL and the
  // origin check below depends on those surviving.
  it.each(["localStorage", "sessionStorage", "indexedDB", "document.cookie"])(
    "never touches %s",
    (api) => {
      for (const file of files) expect(file.src, file.name).not.toContain(api);
    },
  );
});

describe("relief has one way out and it is the commit search", () => {
  it.each(["XMLHttpRequest", "sendBeacon", "WebSocket(", "EventSource", "importScripts"])(
    "never uses %s",
    (api) => {
      for (const file of files) expect(file.src, file.name).not.toContain(api);
    },
  );

  /**
   * Stronger than "fetch only in github.ts", and true where that is not: no
   * file in this tool calls `fetch` at all. `github.ts` takes a `fetchImpl`,
   * which is what lets its own tests drive it with a recording stub, and the
   * component hands it the window's own bound copy in exactly one place. So
   * there is one line in the whole tool that can reach a network, and it is
   * named here.
   */
  it("calls fetch nowhere: the only one is the window's, handed over once", () => {
    for (const file of files) {
      expect([...file.src.matchAll(/\bfetch\(/g)].length, file.name).toBe(0);
    }
    const component = files.find((f) => f.name.endsWith("ReliefTool.tsx"));
    expect([...(component?.src.matchAll(/window\.fetch\.bind\(window\)/g) ?? [])]).toHaveLength(1);
    const github = files.find((f) => f.name.endsWith("github.ts"));
    expect(github?.src).toContain("await fetchImpl(url, {");
  });

  it("has an absolute URL in github.ts and nowhere else", () => {
    // The SVG namespace is not an origin anybody can be sent to: it is a
    // required attribute value in the plotter file and no browser fetches it.
    const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"];
    for (const file of files) {
      const urls = (file.src.match(/https?:\/\/[^\s"'`)]+/g) ?? []).filter(
        (u) => !NAMESPACES.includes(u),
      );
      if (file.name.endsWith("github.ts")) expect(urls).toContain("https://api.github.com");
      else expect(urls, file.name).toEqual([]);
    }
  });
});
