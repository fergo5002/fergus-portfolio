import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { atlasExample } from "@/content/studio/atlas";
import { atlasCopy } from "@/content/studio/atlas-copy";
import { buildGraph } from "@/lib/studio/graph";
import { inspect, mapSummary } from "@/lib/studio/atlas-view";
import { DEFAULT_KINDS, SHAPE_QUERY, layoutGraph } from "@/lib/studio/atlas-scene";
import { WORLD_PAD, boundsOf, viewBoxFor } from "@/lib/studio/atlas-camera";

/**
 * Atlas, rendered. Vitest runs in a node environment, so nothing here is
 * mounted and no effect runs, but React's server renderer turns the
 * components into the HTML of their first render, which is exactly the
 * question for "what does a visitor meet first". The repository's tsconfig
 * keeps JSX for Next to compile, so vitest's transform emits classic
 * `React.createElement` calls and needs React as a global.
 *
 * What rendering cannot see (the motion, the frame clock, the hand) is read
 * off the source at the bottom, in the shape of the repo's other coupling
 * checks.
 */
(globalThis as { React?: typeof React }).React = React;

const source = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const graph = buildGraph(atlasExample);
let html = "";
let poster = "";

beforeAll(async () => {
  const { default: Atlas } = await import("./Atlas");
  const { default: AtlasPoster } = await import("./AtlasPoster");
  html = renderToStaticMarkup(React.createElement(Atlas));
  poster = renderToStaticMarkup(React.createElement(AtlasPoster));
});

/**
 * The markup from the start tag carrying `from` up to the start tag carrying
 * `to` (or the closing tag `to`), searched after it. Whole tags only, so the
 * text of the slice is only what a person would read.
 */
function between(from: string, to: string, markup = html): string {
  const hit = markup.indexOf(from);
  expect(hit, from).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf("<", hit);
  const end = markup.indexOf(to, hit + from.length);
  expect(end, to).toBeGreaterThan(hit);
  return markup.slice(start, to.startsWith("</") ? end + to.length : markup.lastIndexOf("<", end));
}
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("what a visitor meets first", () => {
  it("rendered the whole instrument", () => {
    expect(html.length).toBeGreaterThan(3000);
    for (const part of ['class="atlas-stage"', 'class="atlas-graph"', 'class="atlas-strip"', 'class="atlas-deck"', 'class="atlas-keep"', 'class="atlas-list"'])
      expect(html, part).toContain(part);
  });

  it("puts the map first: the canvas comes before every word, field and button", () => {
    const canvas = html.indexOf('<canvas class="atlas-canvas"');
    expect(canvas).toBeGreaterThan(0);
    for (const tag of ["<p", "<h1", "<h2", "<h3", "<h4", "<label", "<input", "<button", "<select", "<details", "<output", "<span"]) {
      const at = html.indexOf(tag);
      if (at >= 0) expect(at, tag).toBeGreaterThan(canvas);
    }
  });

  it("opens on the example, already mapped, and says it is the example", () => {
    const s = mapSummary(atlasExample, graph);
    const reading = between('class="atlas-reading"', "</p>");
    expect(reading).toContain(`data-files="${s.files}"`);
    expect(text(reading)).toBe(atlasCopy.exampleSummary(s));
    expect(text(reading)).toMatch(/^Example notebook · 34 files · 32 read · \d+ connections$/);
  });

  it("has no heading, legend, fieldset or eyebrow on the stage, so nothing restates what the map shows", () => {
    expect(html).not.toMatch(/<h[1-6][\s>]/);
    expect(html).not.toMatch(/<fieldset|<legend/);
    expect(html).not.toMatch(/eyebrow/i);
    expect(text(html)).not.toMatch(/\b[A-Z]{3,}(?: [A-Z]{2,})* \/ [A-Z]/);
  });

  it("keeps the limits in the page's disclosure, with one short hint at the drop slot", () => {
    expect(atlasCopy.hint.length).toBeLessThanOrEqual(40);
    expect(text(between('class="atlas-deck"', 'class="atlas-keep"'))).toContain(atlasCopy.hint);
    for (const long of ["Scanned PDFs", "tree entries", "Archives are expanded", "Upload a ZIP"]) expect(html).not.toContain(long);
  });
});

describe("no stock control anywhere on it", () => {
  it("draws every button and field itself", () => {
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(5);
    for (const tag of [...buttons, ...inputs]) expect(tag, tag).toMatch(/class="/);
    expect(html).not.toMatch(/type="(search|range|date|number)"/);
    expect(html).not.toMatch(/\scontrols(=|\s|>)/);
    for (const tag of inputs.filter((t) => t.includes('type="file"'))) expect(tag).toContain('class="inst-picker__input"');
    for (const tag of html.match(/<select\b[^>]*>/g) ?? []) expect(tag).toContain('class="inst-select__input"');
  });
});

describe("the stage", () => {
  it("has the search as a command line inside the map, over the canvas", () => {
    const graphBox = between('class="atlas-graph"', 'class="atlas-strip"');
    const find = graphBox.match(/<input\b[^>]*class="atlas-find__input"[^>]*>/)?.[0] ?? "";
    expect(find).toContain(`aria-label="${atlasCopy.find}"`);
    expect(find).toContain('type="text"');
    expect(find).toMatch(/enterkeyhint="search"/i);
    expect(graphBox.indexOf("atlas-find")).toBeGreaterThan(graphBox.indexOf("<canvas"));
  });

  it("has one row of kit controls on its edge: the type, three switches and focus", () => {
    const strip = between('class="atlas-strip"', 'class="atlas-deck"');
    expect(strip).toContain('class="inst-select__input"');
    const switches = [...strip.matchAll(/role="switch"[^>]*aria-checked="(true|false)"/g)].map((m) => m[1]);
    expect(switches).toEqual(["true", "true", "true"]);
    for (const name of [atlasCopy.folders, atlasCopy.references, atlasCopy.terms]) expect(text(strip)).toContain(name);
    // Focus needs a chosen node; until then it is there and says so by being off.
    expect(strip).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled=""[^>]*>Focus neighbours<\/button>/);
  });

  it("zooms and fits with drawn buttons that carry their names", () => {
    const zoom = between('class="atlas-zoom"', 'class="atlas-strip"');
    for (const name of [atlasCopy.zoomIn, atlasCopy.zoomOut, atlasCopy.fit]) expect(zoom).toContain(`aria-label="${name}"`);
    expect(text(zoom)).toBe("");
  });

  it("opens with nothing inspected: the inspector slides in only when a node is chosen", () => {
    expect(html).not.toContain("atlas-inspector");
  });
});

describe("under the stage", () => {
  it("takes files, a folder and a repository in one row, and offers the example back only once it has gone", () => {
    const deck = between('class="atlas-deck"', 'class="atlas-keep"');
    expect(deck).toContain('for="atlas-files"');
    expect(deck).toMatch(/webkitdirectory|id="atlas-folder"/);
    expect(deck).toMatch(new RegExp(`<input[^>]*aria-label="${atlasCopy.repo}"`));
    expect(text(deck)).toContain(atlasCopy.fetch);
    expect(text(deck)).not.toContain(atlasCopy.example);
  });

  it("saves and opens a map with the honesty beside the action", () => {
    const keep = between('class="atlas-keep"', 'class="atlas-list"');
    for (const label of [atlasCopy.save, atlasCopy.image, atlasCopy.open]) expect(text(keep)).toContain(label);
    expect(text(keep)).toContain(atlasCopy.keepNote);
    expect(atlasCopy.keepNote).toMatch(/text/);
  });

  it("keeps the accessible file list, as a closed disclosure that lists every node", () => {
    const list = html.slice(html.indexOf('class="atlas-list"'));
    expect(html).toMatch(/<details class="atlas-list"(?![^>]*\sopen)/);
    expect((list.match(/class="atlas-list__item"/g) ?? []).length).toBe(graph.nodes.length);
    expect(list).toContain("data-lenis-prevent");
  });
});

describe("the inspector", () => {
  let panel = "";
  beforeAll(async () => {
    const { default: AtlasInspector } = await import("./AtlasInspector");
    const media = buildGraph([
      { path: "clips/waves.wav", text: "", size: 3400, kind: "audio", status: "metadata" },
      { path: "clips/notes.md", text: "[[waves.wav]]", size: 13, kind: "md", status: "read" },
    ]);
    panel = renderToStaticMarkup(
      React.createElement(AtlasInspector, {
        view: inspect(media, "clips/waves.wav")!,
        media: { url: "blob:atlas-test", kind: "audio" },
        pinned: false,
        onClose: () => {},
        onPin: () => {},
        onSelect: () => {},
        onMediaError: () => {},
      }),
    );
  });

  it("names the file in its own heading and says how it was read", () => {
    expect(panel).toMatch(/<h2[^>]*>waves\.wav<\/h2>/);
    expect(text(panel)).toContain(atlasCopy.metadata);
    expect(text(panel)).toContain("clips/waves.wav");
  });

  it("plays media with drawn controls, never the browser's", () => {
    expect(panel).toContain("<audio");
    expect(panel).not.toMatch(/\scontrols(=|\s|>)/);
    expect(panel).toMatch(/<button[^>]*class="atlas-media__play"[^>]*>/);
  });

  it("lists why each neighbour is connected, as buttons that go there", () => {
    expect(panel).toMatch(/<button[^>]*class="atlas-related"/);
    expect(text(panel)).toContain("Reference: waves.wav");
    expect(panel).toMatch(new RegExp(`<button[^>]*class="atlas-inspector__close"[^>]*aria-label="${atlasCopy.close}"`));
    expect(text(panel)).toContain(atlasCopy.pin);
  });

  it("scrolls on its own under the page's smooth scroll, and is a labelled region", () => {
    expect(panel).toMatch(/<aside[^>]*class="atlas-inspector"[^>]*data-lenis-prevent=""/);
    expect(panel).toContain(`aria-label="${atlasCopy.inspector}"`);
  });
});

describe("the picture the server draws before the script arrives", () => {
  it("is the example's own layout in both shapes, each framed as the canvas will frame it", () => {
    for (const shape of ["wide", "tall"] as const) {
      const svg = poster.match(new RegExp(`<svg class="atlas-poster atlas-poster--${shape}"[\\s\\S]*?</svg>`))?.[0] ?? "";
      const bounds = boundsOf([...layoutGraph(graph, DEFAULT_KINDS, shape).values()])!;
      expect(svg, shape).toContain(`viewBox="${viewBoxFor(bounds, WORLD_PAD)}"`);
      expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
      expect((svg.match(/<circle\b/g) ?? []).length).toBe(graph.nodes.length);
      expect((svg.match(/<line\b/g) ?? []).length).toBe(graph.links.length);
    }
  });

  it("shows the shape the canvas will choose, by the same query", () => {
    const css = source("app", "tools", "atlas", "tool.css");
    const canvas = source("components", "studio", "GraphCanvas.tsx");
    expect(css).toMatch(/\.atlas-poster--tall \{ display: none; \}/);
    expect(css).toMatch(new RegExp(`@media ${SHAPE_QUERY.replace(/[()]/g, "\\$&")} \\{[^@]*\\.atlas-poster--wide \\{ display: none; \\}`));
    expect(canvas).toContain("window.matchMedia(SHAPE_QUERY).matches");
  });

  it("has no words in it for a crawler to read in front of the page's own", () => {
    expect(poster).not.toContain("<text");
    expect(text(poster)).toBe("");
    expect(poster).toMatch(/<svg[^>]*role="img"[^>]*aria-label="[^"]+"/);
  });

  it("holds the stage's shape, so nothing moves when the live map replaces it", () => {
    for (const part of ['class="atlas-stage"', 'class="atlas-graph"', 'class="atlas-strip"']) expect(poster).toContain(part);
    expect(poster).not.toMatch(/<(button|input|select)\b/);
  });

  it("is not a studio, so nothing waiting for the instrument mistakes the picture for it", () => {
    // The browser checks open a studio by waiting for ".studio"; the picture
    // answering to it let one count the canvas before hydration (0, not 1).
    expect(poster).not.toMatch(/class="[^"]*\bstudio\b/);
    expect(html).toMatch(/^<div class="studio atlas"/);
  });
});

describe("the parts rendering cannot see", () => {
  const canvas = source("components", "studio", "GraphCanvas.tsx");
  const atlas = source("components", "studio", "Atlas.tsx");
  const studio = source("components", "studio", "AtlasStudio.tsx");
  const css = source("app", "tools", "atlas", "tool.css");
  const bench = source("components", "tools", "workbench.css");

  it("moves only on the one frame clock, only while on screen, never under reduced motion", () => {
    expect(canvas).not.toContain("requestAnimationFrame");
    expect(canvas).not.toContain("setInterval");
    expect(canvas).toMatch(/if \(reducedMotion \|\| !el\) return;[\s\S]*new IntersectionObserver\([\s\S]*stop = onFrame\(/);
    expect(canvas.match(/onFrame\(/g)).toHaveLength(1);
  });

  it("times motion off the frame's own timestamp, and halves the phosphor on a coarse pointer", () => {
    expect(canvas).toContain("onFrame((time) => frameRef.current(time))");
    expect(canvas).toContain("keep(halfLife(coarse.current), elapsed)");
    expect(canvas).toContain("time - lastFrame.current");
    expect(canvas).not.toMatch(/\bdt\b/);
  });

  it("draws no streak when the camera eases on its own (bringing a node clear of the inspector)", () => {
    const easing = canvas.slice(canvas.indexOf("const e = ease.current;"), canvas.indexOf("if (dirty.current) paint();"));
    expect(easing).toContain("if (hop.current) hop.current.last = null;");
    expect(easing).toContain("for (const p of pings.current) p.last = null;");
  });

  it("paints the first frame whether or not the observer has seen it", () => {
    // The bug this replaces: a canvas below the fold drew nothing until
    // scrolled to, so every full-page photograph of the phone was blank.
    expect(canvas).toMatch(/function requestPaint\(\) \{\s*if \(live\.current\) dirty\.current = true;\s*else paint\(\);/);
  });

  it("reads colours from the tokens and the face from the canvas, and names no colour", () => {
    expect(canvas).toContain("atlasPalette(");
    expect(canvas).toContain("style.fontFamily");
    expect(canvas).not.toContain("document.documentElement");
    for (const file of [canvas, atlas, css]) expect(file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("lets a scroll pass the map: the wheel zooms only once focused or pinched, a finger on empty map scrolls", () => {
    expect(canvas).toContain("if (!(e.ctrlKey || engagedRef.current)) return;");
    expect(canvas).toContain('data-lenis-prevent-wheel={engaged ? "" : undefined}');
    expect(css).toMatch(/\.atlas-canvas\s*\{[^}]*touch-action:\s*pan-y/);
    expect(canvas).toMatch(/if \(e\.touches\.length > 1\) \{\s*e\.preventDefault\(\);/);
  });

  it("does the arithmetic in the tested modules", () => {
    for (const call of ["findNodes(", "litSet(", "readingFor(", "mapSummary(", "inspect("]) expect(atlas, call).toContain(call);
    for (const call of ["fitCamera(", "zoomAt(", "hitNode(", "sceneOf(", "simulate(", "pretick(", "nextStop("]) expect(canvas, call).toContain(call);
  });

  it("stands the server's picture in until the instrument has hydrated, like every studio host", () => {
    expect(studio.startsWith('"use client"') || studio.trimStart().startsWith('"use client"')).toBe(true);
    expect(studio).toContain("data-studio-host");
    expect(studio).toContain("<noscript>");
    expect(studio).toMatch(/ready \?[\s\S]*<Suspense fallback=\{poster\}>/);
  });

  it("bleeds the map to the window's edges by exactly the stage's own padding", () => {
    const pad = bench.match(/\.bench-stage \{[^}]*padding: calc\(var\(--bar\) \+ (clamp\([^)]*\))\)/)?.[1];
    expect(pad).toBeTruthy();
    expect(css).toContain(`--atlas-bleed: ${pad};`);
  });

  it("keeps its inputs at 16px, draws no small capitals and moves only for those who have not asked for less", () => {
    expect(css).toMatch(/\.atlas-find__input[^{]*\{[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.atlas-repo__input[^{]*\{[^}]*font-size:\s*16px/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/color:\s*var\(--green-(dim|faint)\)/);
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/\b(animation|transition):/);
  });
});
