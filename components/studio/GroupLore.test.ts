import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loreCopy } from "@/content/studio/lore-copy";
import { groupLore } from "@/content/tools/group-lore";
import { WEEK_TRANSPOSE_QUERY } from "@/lib/studio/lore";

/**
 * Group Lore's page, as source. Vitest runs in a node environment here, so
 * nothing can be mounted; this reads what the component returns, the route
 * and the stylesheet, comments stripped and line endings normalised, so a
 * docblock that mentions a call can never stand in for the call.
 *
 * The rebuild (2026-09-28) made the week the stage: the example chat is
 * drawn on the server, the heatmap comes first, a timeline under it chooses
 * the stretch of time everything follows, and the messages open from a cell
 * or a phrase. On a phone the old grid scrolled every lit cell out of sight
 * (measured on WebKit at 390: none of 35 lit cells on screen); the browser
 * half of that promise is `scripts/studio-boundaries/group-lore.mjs`.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const DIR = join(process.cwd(), "components", "studio", "lore");
const partNames = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
const parts = Object.fromEntries(partNames.map((f) => [f, read("components", "studio", "lore", f)]));
const tool = read("components", "studio", "GroupLore.tsx");
const all = [tool, ...Object.values(parts)].join("\n");
const page = read("app", "tools", "group-lore", "page.tsx");
const css = read("app", "tools", "group-lore", "tool.css");
const jsx = tool.slice(tool.indexOf("return (", tool.indexOf("export default function GroupLore")));
const week = parts["Week.tsx"] ?? "";

describe("the week is the stage", () => {
  it("found the JSX it means to check", () => {
    expect(jsx.length).toBeGreaterThan(1500);
    expect(partNames).toEqual(expect.arrayContaining(["Week.tsx", "Timeline.tsx", "Voices.tsx", "Phrases.tsx", "Explorer.tsx"]));
  });

  it("renders on the server, so the example week is in the HTML before any script", () => {
    // Through the shared Studio host the first paint was "Loading your workbench…".
    expect(page).toMatch(/<GroupLore\s*\/>/);
    expect(page).not.toContain('<Studio slug="group-lore"');
    expect(page).toContain("data-studio-host");
    expect(page).toContain('className="tool-studio"');
    expect(page).toMatch(/<noscript>\{studioShellCopy\.noScript\}<\/noscript>/);
  });

  it("opens on the example chat, read by the real parser in a lazy initialiser", () => {
    expect(tool).toMatch(/useState(<\w+>)?\(\(\) => readChat\(exampleChat\(\)\)\)/);
  });

  it("puts the week before every sentence and control on the stage", () => {
    const at = jsx.indexOf("<Week");
    expect(at).toBeGreaterThan(0);
    for (const tag of ["<p", "<output", "<button", "<input", "<textarea", "<Segmented", "<DropSlot", "<Timeline", "<DateRange", "<ExportBar", "<Toggle", "<Voices", "<Phrases", "<Explorer"]) {
      const found = jsx.indexOf(tag);
      if (found >= 0) expect(found, tag).toBeGreaterThan(at);
    }
  });

  it("has no heading, legend or fieldset anywhere in the tool", () => {
    expect(all).not.toMatch(/<h[1-6][\s>]/);
    expect(all).not.toMatch(/<fieldset|<legend/);
  });

  it("leaves no stock control: kit controls, designed buttons and styled fields only", () => {
    expect(all).not.toMatch(/type="range"|<select\b/);
    expect(all).not.toMatch(/from "@\/components\/lab\/shared"/);
    for (const tag of all.match(/<(button|input|textarea)\b[^>]*>/g) ?? []) expect(tag, tag).toMatch(/className=/);
  });

  it("reads one line over the week, from the cell under the pointer or the peak", () => {
    expect(jsx).toMatch(/<output[^>]*className="lore__reading"/);
    expect(tool).toContain("c.reading(");
    expect(tool).toContain("peakCell(");
  });
});

describe("the week itself", () => {
  it("is one focusable surface, not 168 buttons, walked by the arrow keys", () => {
    expect(week).not.toMatch(/<button\b/);
    expect(week).toMatch(/tabIndex=\{0\}/);
    expect(week).toContain("moveCell(");
    expect(week).toContain(`matchMedia(WEEK_TRANSPOSE_QUERY)`);
    expect(week).toMatch(/aria-describedby=\{/);
  });

  it("reads the hour a finger taps, and opens it only on a second tap", () => {
    // One tap used to read and open at once, and a phone scrolled to the
    // messages before the reading could be seen. The browser half is the
    // phone pass in scripts/studio-boundaries/group-lore.mjs.
    expect(week).toMatch(/again: !!cell && same\(aim, cell\.day, cell\.hour\)/);
    expect(week).toMatch(/if \(cell && \(!touch \|\| again\)\) onPick\(cell\);/);
    expect(jsx).toMatch(/<Week[\s\S]*?aim=\{aim\}/);
  });

  it("lights each cell from the heat scale, never from a raw share of the peak", () => {
    expect(week).toContain("heatLevel(");
    expect(week).toMatch(/"--heat"/);
  });

  it("turns on its side on a phone instead of scrolling the hours away", () => {
    const block = css.slice(css.indexOf(`@media ${WEEK_TRANSPOSE_QUERY}`));
    expect(css).toContain(`@media ${WEEK_TRANSPOSE_QUERY}`);
    expect(block).toMatch(/\.lore__cells\s*\{[^}]*grid-auto-flow:\s*column/);
    expect(block).toMatch(/\.lore__cells\s*\{[^}]*grid-template-columns:\s*repeat\(7,/);
    // The old phone grid: 44px cells in a 1186px row inside a sideways scroller.
    expect(css).not.toMatch(/min-width:\s*1186px/);
    expect(css).not.toMatch(/repeat\(24,\s*44px\)/);
    expect(css).not.toMatch(/\.lore__week[^{]*\{[^}]*overflow-x:\s*auto/);
  });

  it("draws the heat in the theme's own phosphor", () => {
    expect(css).toMatch(/\.lore__cell\s*\{[^}]*var\(--heat\)[^}]*var\(--green\)|\.lore__cell\s*\{[^}]*var\(--green\)[^}]*var\(--heat\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("the stretch of time and the voice everything follows", () => {
  it("draws the week, the voices and the phrases from the chosen stretch, deferred so the thumbs stay light", () => {
    expect(tool).toMatch(/useDeferredValue\(range\)/);
    expect(tool).toMatch(/loreView\(messages, \{ range: stretch, person: focus \}\)/);
    expect(jsx).toMatch(/<Week[\s\S]*?heat=\{view\.stats\.heat\}/);
    expect(jsx).toMatch(/<Voices[\s\S]*?voices=\{view\.voices\}/);
    expect(jsx).toMatch(/<Phrases[\s\S]*?phrases=\{view\.stats\.phrases\}/);
  });

  it("names voices from the whole export, so a label never changes hands", () => {
    expect(tool).toMatch(/pseudonymsOf\(messages\)/);
  });

  it("chooses the stretch with the kit's two-handle range, over a timeline lit by the same stretch", () => {
    const timeline = parts["Timeline.tsx"] ?? "";
    expect(timeline).toMatch(/<DateRange\b/);
    expect(timeline).toContain("timelineBars(");
    expect(timeline).not.toMatch(/density=/);
  });

  it("takes both downloads from what the week shows, and nothing else", () => {
    expect(tool).toContain("anonymousSummary(view.focus)");
    expect(tool).toContain("portraitSvg(view.focus, c.portraitWords)");
  });
});

describe("intake, the messages and the boundaries", () => {
  it("keeps the messages closed until a cell, a phrase or the search opens them", () => {
    expect(tool).toMatch(/const \[open, setOpen\] = useState\(false\)/);
    expect(jsx).toMatch(/\{open && \(?\s*<Explorer/);
  });

  it("asks the date order only when the file could be read either way", () => {
    expect(jsx).toMatch(/\{!certain && \(?\s*<Segmented[\s\S]*?label=\{c\.dateOrder\}/);
  });

  it("takes a drop anywhere on the stage, and keeps the import, paste and example in one row", () => {
    expect(jsx).toMatch(/<div[^>]*\{\.\.\.intake\.stageProps\}/);
    const deck = jsx.slice(jsx.indexOf('className="lore__deck"'));
    expect(deck).toMatch(/<DropSlot/);
    expect(deck).toContain("c.paste");
    expect(deck).toContain("studioCopy.example");
  });

  it("reads files off the main thread, drops a stale answer and can be cancelled", () => {
    expect(tool).toContain('new URL("../../lib/studio/lore.worker.ts", import.meta.url)');
    expect(tool).toMatch(/if \(token !== generation\.current\) return;/);
    expect(tool).toMatch(/worker\.current\?\.terminate\(\)/);
    expect(jsx).toContain("studioCopy.cancel");
  });

  it("keeps every privacy and honesty boundary on the stage, in a line each", () => {
    expect(all).toContain("c.counts");
    expect(parts["Explorer.tsx"]).toContain("{words.privacy}");
    expect(jsx).toMatch(/<Explorer[\s\S]*?words=\{\{ \.\.\.c,/);
    expect(jsx).toMatch(/note=\{c\.keepNote\}/);
    expect(jsx).toContain("c.exampleCaption");
    expect(loreCopy.counts).toMatch(/not relationships/);
    expect(loreCopy.privacy).toMatch(/labels only/);
    expect(loreCopy.keepNote).toMatch(/no names/);
    expect(loreCopy.keepNote).toMatch(/no message text/);
    // Nothing is saved: the shell's line under the stage says so.
    expect(groupLore.privacyLine).toMatch(/Nothing is saved/);
  });

  it("moves the formats, limits and definitions into the shell's one disclosure", () => {
    const method = (groupLore.method ?? []).join(" ");
    expect(method).toMatch(/Telegram/);
    expect(method).toMatch(/10 MB/);
    expect(method).toMatch(/30 minutes/);
    expect(method).toMatch(/timezone/);
    expect(all).not.toMatch(/importNote|rhythmNote/);
  });
});

describe("motion", () => {
  it("is CSS, costs nothing at rest and never runs under reduced motion", () => {
    expect(all).not.toMatch(/requestAnimationFrame|setInterval/);
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/\btransition\s*:|\banimation\s*:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
});
