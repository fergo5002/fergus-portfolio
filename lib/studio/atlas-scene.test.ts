import { describe, expect, it } from "vitest";
import { atlasExample } from "@/content/studio/atlas";
import { buildGraph, type AtlasFile } from "./graph";
import {
  AtlasPaletteError,
  HALF_LIFE_MS,
  PALETTE_TOKENS,
  SETTLE_TICKS,
  SHAPE_QUERY,
  adjacency,
  atlasPalette,
  halfLife,
  keep,
  layoutGraph,
  linkDistance,
  nextStop,
  pretick,
  pulseDuration,
  sceneOf,
  seeded,
  simulate,
} from "./atlas-scene";

const ALL = ["folder", "reference", "terms"];
const example = buildGraph(atlasExample);
const file = (path: string, text = ""): AtlasFile => ({ path, text, size: text.length, kind: "md", status: "read" });

describe("the palette: the theme's tokens, or a refusal", () => {
  const tokens: Record<string, string> = {
    "--green": " #33ff66",
    "--green-bright": "#6effa3",
    "--amber": "#ffb000",
    "--amber-bright": "#ffc94d",
    "--bg": "#0a0e0a",
    "--green-line": "rgba(51, 255, 102, 0.22)",
  };

  it("reads every colour it paints from a token, trimmed", () => {
    const palette = atlasPalette((name) => tokens[name] ?? "");
    expect(palette.ink).toBe("#33ff66");
    expect(Object.keys(palette).sort()).toEqual(Object.keys(PALETTE_TOKENS).sort());
    for (const [role, token] of Object.entries(PALETTE_TOKENS)) {
      expect(palette[role as keyof typeof palette]).toBe(tokens[token].trim());
    }
  });

  it("names the missing token rather than painting black on black", () => {
    const read = (name: string) => (name === "--amber" ? "  " : (tokens[name] ?? ""));
    expect(() => atlasPalette(read)).toThrow(AtlasPaletteError);
    expect(() => atlasPalette(read)).toThrow(/--amber/);
  });
});

describe("phosphor persistence", () => {
  it("halves on a coarse pointer", () => {
    expect(halfLife(false)).toBe(HALF_LIFE_MS);
    expect(halfLife(true)).toBe(HALF_LIFE_MS / 2);
  });

  it("decays by elapsed time, not by frame count", () => {
    expect(keep(150, 0)).toBe(1);
    expect(keep(150, 150)).toBeCloseTo(0.5, 9);
    expect(keep(150, 300)).toBeCloseTo(0.25, 9);
    // One 450ms frame from a starved tab decays as much as twenty-seven 16.7ms frames.
    expect(keep(150, 450)).toBeCloseTo(keep(150, 16.667) ** 27, 3);
    expect(keep(150, -20)).toBe(1);
  });
});

describe("the layout", () => {
  it("spaces a small map wider than a large one, within bounds", () => {
    expect(linkDistance(20)).toBeGreaterThan(linkDistance(900));
    expect(linkDistance(1)).toBeLessThanOrEqual(110);
    expect(linkDistance(100_000)).toBeGreaterThanOrEqual(36);
  });

  it("settles a small map fully before its first paint, with or without motion", () => {
    expect(pretick(example.nodes.length, false)).toBe(SETTLE_TICKS);
    expect(pretick(example.nodes.length, true)).toBe(SETTLE_TICKS);
    // A big map lays out the rest live, unless motion is reduced.
    expect(pretick(1000, false)).toBeLessThan(pretick(1000, true));
  });

  it("lays a map out wide for a wide stage and tall for a phone's", () => {
    const spread = (shape: "wide" | "tall") => {
      const at = [...layoutGraph(example, ALL, shape).values()];
      const w = Math.max(...at.map((p) => p.x)) - Math.min(...at.map((p) => p.x));
      const h = Math.max(...at.map((p) => p.y)) - Math.min(...at.map((p) => p.y));
      return w / h;
    };
    expect(spread("wide")).toBeGreaterThan(1.25);
    expect(spread("tall")).toBeLessThan(1 / 1.15);
    expect(SHAPE_QUERY).toBe("(max-width: 640px)");
  });

  it("is the same picture every time, which is what lets the server draw it first", () => {
    const one = layoutGraph(example, ALL);
    const two = layoutGraph(example, ALL);
    expect(one.size).toBe(example.nodes.length);
    for (const [id, p] of one) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), id).toBe(true);
      expect(two.get(id)).toEqual(p);
    }
  });

  it("has come to rest after the settling ticks", () => {
    const { nodes, links } = sceneOf(example, ALL);
    const sim = simulate(nodes, links, nodes.length);
    sim.tick(SETTLE_TICKS);
    expect(sim.alpha()).toBeLessThan(sim.alphaMin());
  });

  it("keeps only the links on show and, in focus, only the nodes asked for", () => {
    const g = buildGraph([file("n/a.md", "[[b]]"), file("n/b.md"), file("m/c.md")]);
    expect(sceneOf(g, ["reference"]).links.map((l) => l.kind)).toEqual(["reference"]);
    const focused = sceneOf(g, ALL, new Set(["n/a.md", "n/b.md"]));
    expect(focused.nodes.map((n) => n.id).sort()).toEqual(["n/a.md", "n/b.md"]);
    expect(focused.links.every((l) => l.kind === "reference")).toBe(true);
  });

  it("keeps a node where it was when the scene is rebuilt, pinned or not", () => {
    const g = buildGraph([file("n/a.md", "[[b]]"), file("n/b.md")]);
    const previous = new Map([["n/a.md", { x: 5, y: 6, fx: 5, fy: 6 }]]);
    const a = sceneOf(g, ALL, null, previous).nodes.find((n) => n.id === "n/a.md")!;
    expect([a.x, a.y, a.fx, a.fy]).toEqual([5, 6, 5, 6]);
  });
});

describe("the beam walking the links", () => {
  const links = [
    { source: "a", target: "b", kind: "reference" as const },
    { source: "b", target: "c", kind: "terms" as const },
    { source: "c", target: "d", kind: "folder" as const },
  ];

  it("walks the connections on show and leaves folders out while there are any", () => {
    const adj = adjacency(links, ALL);
    expect(adj.get("b")?.sort()).toEqual(["a", "c"]);
    expect(adj.has("d")).toBe(false);
    expect(adjacency(links, ["folder"]).get("c")).toEqual(["d"]);
    expect(adjacency(links, []).size).toBe(0);
  });

  it("goes somewhere new when it can, back when it must, and nowhere from an island", () => {
    const adj = adjacency(links, ALL);
    const random = seeded(7);
    for (let i = 0; i < 20; i++) expect(nextStop(adj, "b", "a", random)).toBe("c");
    expect(nextStop(adj, "a", "b", random)).toBe("b");
    expect(nextStop(adj, "z", null, random)).toBeNull();
  });

  it("is repeatable from its seed", () => {
    const a = seeded(42),
      b = seeded(42);
    const one = Array.from({ length: 5 }, () => a()),
      two = Array.from({ length: 5 }, () => b());
    expect(one).toEqual(two);
    expect(one.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it("takes longer over a longer link, within bounds", () => {
    expect(pulseDuration(400)).toBeGreaterThan(pulseDuration(100));
    expect(pulseDuration(0)).toBeGreaterThan(0);
    expect(pulseDuration(1e6)).toBe(pulseDuration(1e7));
  });
});
