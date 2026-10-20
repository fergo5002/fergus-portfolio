import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wide screens (2026-10-19). The page grows to four fifths of the screen up to
 * a 2700px cap, and each route opens into more panes past 1560px. These guard
 * the stylesheet side of that; `scripts/wide-check.mjs` measures the result in
 * a browser at five real monitor sizes.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const globals = read("app", "globals.css");

/** Every stylesheet that carries a wide-screens block, and where it starts. */
const SHEETS: [string, string][] = [
  ["app/globals.css", "Wide screens (2026-10-19)"],
  ["app/home.css", "----- wide screens"],
  ["app/writing/writing.css", "----- wide screens"],
  ["app/mcp/mcp.css", "----- wide screens"],
  ["app/not-found.css", "Wide screens: the test card"],
  ["components/tools/workbench.css", "── wide screens"],
  ["components/meeting.css", "----- wide screens"],
];

function wideBlock(file: string, marker: string): string {
  const css = read(...file.split("/"));
  const at = css.indexOf(marker);
  expect(at, `${file} has its wide-screens block`).toBeGreaterThan(-1);
  // From the opening of the comment that carries the marker, so the comment
  // goes with the rest of them.
  return css.slice(css.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The top-level statements of a stylesheet fragment: at-rule preludes and selectors. */
function topLevel(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      if (depth === 0) out.push(css.slice(start, i).trim());
      depth++;
    } else if (css[i] === "}") {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  return out.filter(Boolean);
}

describe("the page width", () => {
  it("declares the measure, the fill and the cap at :root, outside every query", () => {
    const root = globals.slice(globals.indexOf(":root {"), globals.indexOf("}", globals.indexOf(":root {")));
    expect(root).toMatch(/--maxw: 1040px;/);
    expect(root).toMatch(/--maxw-fill: 80vw;/);
    expect(root).toMatch(/--maxw-cap: 2700px;/);
  });

  it("grows the page between the laptop measure and the cap", () => {
    expect(globals).toMatch(/\.screen \{\s*max-width: clamp\(var\(--maxw\), var\(--maxw-fill\), var\(--maxw-cap\)\);/);
  });

  it("is measured by the wide check against the same numbers", () => {
    const check = read("scripts", "wide-check.mjs");
    expect(check).toMatch(/const FILL = 0\.8;/);
    expect(check).toMatch(/const CAP = 2700;/);
  });
});

describe("wide-screen layouts never reach a laptop or a phone", () => {
  it.each(SHEETS)("%s keeps every wide rule inside a min-width query of 1560px or more", (file, marker) => {
    for (const statement of topLevel(wideBlock(file, marker))) {
      const media = statement.match(/^@media \(min-width: (\d+)px\)$/);
      const container = /^@container \(min-width: \d+px\)$/.test(statement);
      expect(media || container, `${file}: "${statement}" applies outside a wide query`).toBeTruthy();
      if (media) expect(Number(media[1]), `${file}: ${statement}`).toBeGreaterThanOrEqual(1560);
    }
  });

  it.each(SHEETS)("%s introduces no custom property inside a wide query", (file, marker) => {
    // A property declared only inside a query voids every var() that reads it
    // outside one (coding-mistakes, 17 September 2026). Wide blocks change
    // values; they never introduce one.
    expect(wideBlock(file, marker)).not.toMatch(/(^|[;{\s])--[a-z][a-z0-9-]*\s*:/);
  });

  it("only contains a meeting card where its container query can fire", () => {
    const meeting = read("components", "meeting.css");
    const before = meeting.slice(0, meeting.indexOf("----- wide screens"));
    expect(before).not.toMatch(/container-type/);
  });
});

describe("the hooks the layouts hang on", () => {
  it("names the home grid and its tiles", () => {
    const home = read("app", "page.tsx");
    expect(home).toMatch(/className="stack home"/);
    expect(home).toMatch(/className="home__about"/);
    expect(home).toMatch(/className="home__talk"/);
  });

  it("gives the article body one box, so the contents can stand beside it", () => {
    const post = read("app", "writing", "[slug]", "page.tsx");
    expect(post).toMatch(/className="stack post"/);
    expect(post).toMatch(/className="post__body"/);
  });

  it("keeps the body's parts on the stack's rhythm on every screen", () => {
    // `inherit`, so the phone's tighter stack gap reaches the parts too.
    expect(globals).toMatch(/\.post__body \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*gap: inherit;/);
  });

  it("tells the tools index how many tools share the one wide row", () => {
    expect(read("app", "tools", "page.tsx")).toMatch(/"--bench-count": rows\.length/);
    expect(read("components", "tools", "workbench.css")).toMatch(/repeat\(var\(--bench-count, 5\), minmax\(0, 1fr\)\)/);
  });
});

describe("the home terminal in its tile", () => {
  it("contains the scrollback, so output scrolls instead of growing the row", () => {
    const home = read("app", "home.css");
    expect(home).toMatch(/\.home > \.term \.term__scroll \{[^}]*contain: size;/);
    // Never less scrollback than the laptop terminal, whose cap is 230px.
    expect(home).toMatch(/\.home > \.term \.term__scroll \{[^}]*min-height: 230px;/);
    expect(globals).toMatch(/\.term__scroll \{\s*max-height: 230px;/);
  });
});

describe("the wide check's tiers follow the stylesheets", () => {
  it("measures every tier from a breakpoint a stylesheet actually uses", () => {
    const check = read("scripts", "wide-check.mjs");
    const start = check.indexOf("const TILES = [");
    const tiles = check.slice(start, check.indexOf("];", start));
    const used = new Set(
      SHEETS.flatMap(([file]) => [...read(...file.split("/")).matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => Number(m[1]))),
    );
    const froms = [...tiles.matchAll(/from: (\d+)/g)].map((m) => Number(m[1]));
    expect(froms.length).toBeGreaterThan(10);
    for (const from of froms) expect(used.has(from), `wide-check tier from ${from}px has no stylesheet breakpoint`).toBe(true);
  });
});

describe("the images the wide grid draws", () => {
  it("asks for a third of the wide page on project cards, and the laptop size everywhere else", () => {
    expect(read("components", "ProjectCard.tsx")).toMatch(
      /sizes="\(max-width: 768px\) 100vw, \(min-width: 1560px\) calc\(\(min\(80vw, 2700px\) - 96px\) \/ 3\), 460px"/,
    );
    // The portrait is 240px wide at every size; it keeps the small hint.
    expect(read("components", "ImageFrame.tsx")).toMatch(/sizes = "\(max-width: 768px\) 100vw, 460px"/);
  });
});
