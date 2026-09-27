import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redactCopy } from "@/content/studio/redact";
import { pocketRedact } from "@/content/tools/pocket-redact";

/**
 * Pocket Redact's page, as source. Vitest runs in a node environment here, so
 * nothing can be mounted; this reads what the component returns and what the
 * route renders, comments stripped and line endings normalised.
 *
 * The redesign (2026-09-27) made the document the stage: the example invoice
 * is open, large and already masked in the server HTML, the tools float on
 * the desk's edge, find lights its candidates on the page, and the clean copy
 * is burned, reopened and checked before it can be downloaded. Each promise
 * below is a line this file fails on.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const DIR = join(process.cwd(), "components", "studio", "redact");
const parts = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => read("components", "studio", "redact", f));
const tool = read("components", "studio", "PocketRedact.tsx");
const all = [tool, ...parts].join("\n");
const page = read("app", "tools", "pocket-redact", "page.tsx");
const css = read("app", "tools", "pocket-redact", "tool.css");
const jsx = tool.slice(tool.indexOf("return (", tool.indexOf("export default function PocketRedact")));

describe("the document is the stage", () => {
  it("found the JSX it means to check", () => {
    expect(jsx.length).toBeGreaterThan(2000);
    expect(parts.length).toBeGreaterThan(0);
  });

  it("renders the tool on the server, so the example is in the HTML before any script", () => {
    // Through the shared Studio host it was a "Loading your workbench" line for
    // 1.6s on a desktop and 4 to 6.6s on a throttled phone, measured.
    expect(page).toMatch(/<PocketRedact\s*\/>/);
    expect(page).not.toContain('<Studio slug="pocket-redact"');
    // The public checks still find the studio host and the no-script sentence.
    expect(page).toContain("data-studio-host");
    expect(page).toContain('className="tool-studio"');
    expect(page).toMatch(/<noscript>\{studioShellCopy\.noScript\}<\/noscript>/);
  });

  it("opens on the example, with a mask already on it", () => {
    expect(tool).toMatch(/useState<RedactPage\[\]>\(\(\) => \[examplePage\(\)\]\)/);
    expect(tool).toMatch(/present: \[\[exampleMask\(SHEET\)\]\]/);
  });

  it("shows the example as an image of the one layout, so its invented details are never the page's words", () => {
    expect(tool).toMatch(/url: EXAMPLE_SRC/);
    expect(tool).toMatch(/example: true/);
    // The page image is one <img> for every page, the example included.
    expect(jsx).toMatch(/<img\s+className="redact__page"\s+src=\{page\.url\}/);
    expect(all).not.toMatch(/<text\b/);
  });

  it("burns the example from the same layout on a canvas, never by drawing its SVG", () => {
    const pdf = read("lib", "studio", "pdf.ts");
    expect(pdf).toMatch(/if \(page\.example\) drawExample\(ctx, exampleSheet\(\), EXAMPLE_FACE\);/);
  });

  it("puts the paper first, before every control, figure and sentence", () => {
    const paper = jsx.indexOf('className="redact__paper"');
    expect(paper).toBeGreaterThan(0);
    for (const tag of ["<p", "<output", "<Segmented", "<Slider", "<DropSlot", "<ExportBar", "<Palette", "<Lens", "<FindLine", "<button", "<input", "<label", "<span"]) {
      const at = jsx.indexOf(tag);
      if (at >= 0) expect(at, tag).toBeGreaterThan(paper);
    }
  });

  it("renders no control before it can answer", () => {
    expect(tool).toMatch(/const \[ready, setReady\] = useState\(false\)/);
    expect(tool).toMatch(/useEffect\(\(\) => setReady\(true\), \[\]\)/);
    for (const control of ["<Palette", "<Lens", "<FindLine", "<DropSlot", "<ExportBar"]) expect(jsx, control).toContain(control);
    // Cut out every `{ready && ...}` block, and the busy line (only a handler
    // can make the tool busy, so it never renders before hydration). What is
    // left is what the server renders: the paper, and no control at all.
    let rest = jsx;
    for (const opener of ["{ready &&", "{busy ?"]) {
      for (let at = rest.indexOf(opener); at >= 0; at = rest.indexOf(opener)) {
        let depth = 0,
          end = at;
        for (; end < rest.length; end++) {
          if (rest[end] === "{") depth++;
          else if (rest[end] === "}" && --depth === 0) break;
        }
        rest = rest.slice(0, at) + rest.slice(end + 1);
      }
    }
    expect(rest).toContain('className="redact__paper"');
    expect(rest).not.toMatch(/<(button|input|label|select|textarea|Palette|Lens|FindLine|DropSlot|ExportBar|Segmented)\b/);
  });
});

describe("no eyebrow and no stock control", () => {
  it("has no heading, legend or fieldset on the stage, so there is nothing for an eyebrow to sit on", () => {
    expect(all).not.toMatch(/<h[1-6][\s>]/);
    expect(all).not.toMatch(/<fieldset|<legend/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
  });

  it("gives every button, input and label a designed class", () => {
    const tags = [...all.matchAll(/<(button|input|label)\b[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(8);
    for (const tag of tags) expect(tag, tag).toMatch(/className=/);
    expect(all).not.toMatch(/<select\b|type="range"|type="date"/);
    // The old studio furniture is gone from this tool.
    expect(all).not.toMatch(/\bPress\b|\bNumberField\b|<Button\b|<Field\b/);
  });

  it("draws its checkbox: appearance removed, box and tick in the phosphor tokens", () => {
    expect(all).toContain('type="checkbox"');
    expect(css).toMatch(/\.redact__inspected input\[type="checkbox"\]\s*\{[^}]*appearance:\s*none/);
  });

  it("keeps every colour a token, except the paper's own white and the mask's black", () => {
    const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(hex.filter((h) => !["#000", "#fff", "#000000", "#ffffff"].includes(h))).toEqual([]);
    expect(css).not.toMatch(/color:\s*var\(--green-(dim|faint)\)/);
  });
});

describe("the tools float on the desk", () => {
  const palette = parts.find((p) => p.includes("export function Palette"))!;

  it("has a palette with the five tools, each named, each declaring its key", () => {
    expect(palette).toBeDefined();
    // A group, not a toolbar: here the arrow keys move the selected mask.
    expect(palette).toMatch(/className="redact__palette" role="group" aria-label=\{c\.tools\}/);
    for (const name of ["c.draw", "c.select", "c.undo", "c.redo", "c.delete"]) expect(palette, name).toContain(`aria-label={${name}}`);
    expect([...palette.matchAll(/aria-keyshortcuts=/g)].length).toBeGreaterThanOrEqual(5);
    expect(palette).toContain("PALETTE_KEYS");
  });

  it("answers the keyboard through the tested map, and never while someone types in a field", () => {
    expect(tool).toContain("redactKey(");
    expect(tool).toMatch(/if \(isField\(event\.target\)\) return;/);
  });

  it("zooms with buttons named for what they do", () => {
    const lens = parts.find((p) => p.includes("export function Lens"))!;
    for (const name of ["c.zoomOut", "c.zoomIn", "c.fit"]) expect(lens, name).toContain(`aria-label={${name}}`);
    expect(lens).toContain("nextZoom(");
  });
});

describe("find lights its candidates on the page", () => {
  it("draws pending candidates as dashed boxes and covers one on a tap", () => {
    expect(tool).toContain("pendingCandidates(");
    expect(tool).toContain("candidateAt(");
    expect(tool).toContain('className="redact__candidate"');
    expect(css).toMatch(/\.redact__candidate\s*\{[^}]*stroke-dasharray/);
  });

  it("says what candidates are, on the line itself", () => {
    const find = parts.find((p) => p.includes("export function FindLine"))!;
    expect(find).toContain("c.caveat");
    expect(find).toContain("c.noText");
    expect(redactCopy.caveat).toMatch(/not a complete privacy scan/);
  });
});

describe("the burn and the proof", () => {
  it("reopens the built bytes and checks them, never the pages it drew", () => {
    const build = tool.slice(tool.indexOf("async function build("));
    expect(build).toMatch(/const bytes = await rasterPdf\(/);
    expect(build).toMatch(/await readPdf\(bytes\.slice\(\)/);
    expect(build).toMatch(/verifyPage\(\{\s*pixels: await readPixels\(reopened\[i\]\)/);
    expect(build).toMatch(/textAfter: reopened\[i\]\.text\.length/);
  });

  it("offers the download only through the gate, and the file is the checked bytes", () => {
    expect(tool).toMatch(/disabled: !canDownload\(proof\.verdicts, reviewed\)/);
    expect(tool).toMatch(/download\("redacted-document\.pdf", proof\.file\)/);
  });

  it("shows the reopened page, not the editor's, once the proof is up", () => {
    expect(tool).toMatch(/src=\{shown\.url\}/);
    expect(tool).toContain('className="redact__proof"');
  });

  it("sweeps the scan off the one frame clock by timestamp, only on screen, never under reduced motion", () => {
    expect(all).not.toContain("requestAnimationFrame");
    expect(all).not.toContain("setInterval");
    expect(tool).toContain("onFrame(");
    expect(tool).toContain("scanProgress(start, time, SCAN_MS)");
    expect(tool).toContain("scanReveal(");
    expect(tool).toContain("new IntersectionObserver(");
    expect(tool).toMatch(/if \(reducedMotion \|\| document\.visibilityState !== "visible"\)/);
  });

  it("holds the proof back exactly as long as the flare the stylesheet plays", () => {
    const js = Number(tool.match(/const FLARE_MS = (\d+);/)?.[1]);
    const css_ = Number(css.match(/animation: redact-burn (\d+)ms/)?.[1]);
    expect(js).toBeGreaterThan(0);
    expect(css_).toBe(js);
    expect(css).toMatch(/animation-delay: var\(--delay, 0ms\)/);
    expect(tool).toMatch(/"--delay": `\$\{delay\[i\] \?\? 0\}ms`/);
    expect(tool).toMatch(/const hold = reducedMotion \? 0 : flare - \(performance\.now\(\) - started\);/);
  });

  it("brings the page into view when the burn starts, so the proof happens where the visitor looks", () => {
    expect(tool).toMatch(/if \(desk && desk\.getBoundingClientRect\(\)\.top < 0\) scrollTo\(desk\);/);
  });

  it("keeps every animation and transition behind no-preference", () => {
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, " ");
    expect(outside).not.toMatch(/\banimation\s*:/);
    expect(outside).not.toMatch(/\btransition\s*:/);
    expect(css).toMatch(/@keyframes redact-burn/);
  });
});

describe("far less text", () => {
  it("keeps every word from content, and the tool's own copy short", () => {
    const words = Object.entries(redactCopy)
      .filter(([k]) => !["sample", "sampleTitle"].includes(k))
      .flatMap(([, v]) => (typeof v === "string" ? [v] : typeof v === "object" ? Object.values(v).filter((x) => typeof x === "string") : []))
      .join(" ");
    // The panel-and-paragraph version carried 1,421 characters of its own
    // (measured off `git show add5fc4:content/studio/redact.ts`). About half.
    expect(words.length).toBeLessThan(760);
  });

  it("leaves the limits and the method to the one disclosure", () => {
    expect(JSON.stringify(redactCopy)).not.toMatch(/megapixels/);
    expect(pocketRedact.cantSee.join(" ")).toMatch(/12 megapixels per page/);
    expect(pocketRedact.method?.join(" ")).toMatch(/reopens/);
  });
});
