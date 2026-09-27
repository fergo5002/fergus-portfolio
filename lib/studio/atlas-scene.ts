import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { AtlasGraph, AtlasNode } from "./graph";
import type { LinkKind } from "./atlas-view";

/**
 * The scene Atlas draws: the force layout, the phosphor's persistence, the
 * beam that walks the links, and the palette, which is the theme's tokens or
 * a refusal. Pure, so the server can lay out the example exactly as the
 * browser will and the tests can pin every number the canvas moves by.
 */

// ── the palette ─────────────────────────────────────────────────────────

/** Each colour the stage paints, and the token it comes from. No colour is named anywhere else. */
export const PALETTE_TOKENS = {
  ink: "--green",
  bright: "--green-bright",
  accent: "--amber",
  accentBright: "--amber-bright",
  ground: "--bg",
  line: "--green-line",
} as const;

export type AtlasPalette = { -readonly [K in keyof typeof PALETTE_TOKENS]: string };

export class AtlasPaletteError extends Error {
  constructor(token: string) {
    super(`atlas: the theme token ${token} is missing, so there is nothing to paint the map with`);
    this.name = "AtlasPaletteError";
  }
}

export function atlasPalette(read: (token: string) => string): AtlasPalette {
  const out = {} as AtlasPalette;
  for (const [role, token] of Object.entries(PALETTE_TOKENS) as [keyof AtlasPalette, string][]) {
    const value = read(token).trim();
    if (!value) throw new AtlasPaletteError(token);
    out[role] = value;
  }
  return out;
}

// ── persistence ─────────────────────────────────────────────────────────

/** How long the ghost of a moving thing takes to fall to half its brightness. */
export const HALF_LIFE_MS = 150;

/** Halved on a coarse pointer: the phone pays for every full-canvas fade. */
export const halfLife = (coarse: boolean) => (coarse ? HALF_LIFE_MS / 2 : HALF_LIFE_MS);

/**
 * The fraction of the ghost that survives `elapsedMs`. Off the frame's own
 * timestamps, never the clock's clamped `dt`: headless Chromium draws 250 to
 * 450ms frames, and a decay counted per frame would crawl there.
 */
export function keep(halfLifeMs: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return 0.5 ** (elapsedMs / halfLifeMs);
}

// ── the layout ──────────────────────────────────────────────────────────

/** Every kind of link on show, which is how a map opens. */
export const DEFAULT_KINDS: readonly LinkKind[] = ["folder", "reference", "terms"];

/**
 * The stage is wide on a laptop and tall on a phone, and a map laid out square
 * fills neither. The server draws both shapes and CSS shows the one this
 * query picks; the canvas asks the same query, so both agree on which.
 */
export const SHAPE_QUERY = "(max-width: 640px)";
export type Shape = "wide" | "tall";
/** How hard each axis pulls to the middle, per shape: the weaker axis is the one the map spreads along. */
const PULL: Record<Shape, { x: number; y: number }> = { wide: { x: 0.022, y: 0.1 }, tall: { x: 0.1, y: 0.022 } };

export type SimNode = AtlasNode & SimulationNodeDatum;
export type SimLink = { source: SimNode; target: SimNode; kind: LinkKind; evidence: string };
type Kept = { x?: number; y?: number; fx?: number | null; fy?: number | null };

/** Enough ticks for alpha to fall under d3's own floor, so the layout is at rest. */
export const SETTLE_TICKS = 210;
const ALPHA_DECAY = 0.035;

/** A small map spreads out; a large one tightens so it still fits on a screen. */
export function linkDistance(nodeCount: number): number {
  const d = 110 - 12 * Math.log2(Math.max(1, nodeCount) / 40);
  return Math.round(Math.min(110, Math.max(36, d)));
}

/**
 * How many ticks run before the first paint. A small map is laid out
 * completely, so it arrives at rest (and matches the picture the server drew);
 * a large one does a little and settles on screen, unless motion is reduced,
 * when it gets as close to rest as a main thread can afford.
 */
export function pretick(nodeCount: number, reduced: boolean): number {
  if (nodeCount <= 240) return SETTLE_TICKS;
  if (reduced) return 180;
  return nodeCount <= 500 ? 80 : 40;
}

/** The nodes and links on show: `kinds` picks the links, `only` (focus) picks the nodes. */
export function sceneOf(
  graph: AtlasGraph,
  kinds: readonly string[],
  only: Set<string> | null = null,
  previous: Map<string, Kept> = new Map(),
): { nodes: SimNode[]; links: SimLink[] } {
  const nodes: SimNode[] = graph.nodes
    .filter((n) => !only || only.has(n.id))
    .map((n) => {
      const was = previous.get(n.id);
      return was ? { ...n, x: was.x, y: was.y, fx: was.fx, fy: was.fy } : { ...n };
    });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: SimLink[] = [];
  for (const l of graph.links) {
    const source = byId.get(l.source),
      target = byId.get(l.target);
    if (source && target && kinds.includes(l.kind)) links.push({ source, target, kind: l.kind, evidence: l.evidence });
  }
  return { nodes, links };
}

/**
 * The forces, stopped: the caller decides when it ticks.
 *
 * A folder holds its files close, so a map reads as its folders first. Every
 * other link pulls in inverse proportion to how connected its busier end is
 * (d3's own default, scaled): a note that twenty others point to would
 * otherwise drag every folder into one knot around it. A weak pull to the
 * middle keeps an island (a folder of one photograph) from drifting off and
 * shrinking everything else to fit it on screen.
 */
export function simulate(nodes: SimNode[], links: SimLink[], nodeCount: number, shape: Shape = "wide"): Simulation<SimNode, SimLink> {
  const count = new Map<string, number>();
  for (const l of links) {
    count.set(l.source.id, (count.get(l.source.id) ?? 0) + 1);
    count.set(l.target.id, (count.get(l.target.id) ?? 0) + 1);
  }
  const busier = (l: SimLink) => Math.max(1, Math.min(count.get(l.source.id) ?? 1, count.get(l.target.id) ?? 1));
  const reach = linkDistance(nodeCount);
  return forceSimulation<SimNode>(nodes)
    .stop()
    .force("charge", forceManyBody<SimNode>().strength(-80).distanceMax(600))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .distance((l) => (l.kind === "folder" ? reach * 0.5 : reach))
        .strength((l) => (l.kind === "folder" ? 0.7 : (l.kind === "terms" ? 0.25 : 0.4) / busier(l))),
    )
    .force("centre", forceCenter(0, 0).strength(0.04))
    .force("x", forceX<SimNode>(0).strength((n) => PULL[shape].x * (n.degree <= 1 ? 3 : 1)))
    .force("y", forceY<SimNode>(0).strength((n) => PULL[shape].y * (n.degree <= 1 ? 3 : 1)))
    .force("collision", forceCollide<SimNode>((n) => (n.kind === "folder" ? 22 : 12)))
    .alphaDecay(ALPHA_DECAY)
    .velocityDecay(0.35);
}

/** The settled layout, as the server draws it and the browser first paints it. */
export function layoutGraph(
  graph: AtlasGraph,
  kinds: readonly string[],
  shape: Shape = "wide",
): Map<string, { x: number; y: number }> {
  const { nodes, links } = sceneOf(graph, kinds);
  simulate(nodes, links, nodes.length, shape).tick(SETTLE_TICKS);
  return new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}

// ── the beam ────────────────────────────────────────────────────────────

type Edge = { source: string; target: string; kind: LinkKind };

/**
 * Who is next to whom, for the beam. It walks the references and shared
 * words on show; folders only when nothing else is, because a beam that
 * spends its time going in and out of folders says nothing about the files.
 */
export function adjacency(links: readonly Edge[], kinds: readonly string[]): Map<string, string[]> {
  const shown = links.filter((l) => kinds.includes(l.kind));
  const content = shown.filter((l) => l.kind !== "folder");
  const walk = content.length ? content : shown;
  const adj = new Map<string, string[]>();
  for (const l of walk) {
    adj.set(l.source, [...(adj.get(l.source) ?? []), l.target]);
    adj.set(l.target, [...(adj.get(l.target) ?? []), l.source]);
  }
  return adj;
}

/** The next node: anywhere new if there is one, back the way it came if not, nowhere from an island. */
export function nextStop(adj: Map<string, string[]>, at: string, from: string | null, random: () => number): string | null {
  const options = adj.get(at) ?? [];
  if (!options.length) return null;
  const onward = options.filter((o) => o !== from);
  const pool = onward.length ? onward : options;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** A small seeded generator (mulberry32), so the walk is the same walk on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How long the beam takes over a link this many screen pixels long. */
export function pulseDuration(lengthPx: number): number {
  return Math.min(1400, Math.max(260, 180 + Math.max(0, lengthPx) * 2.2));
}
