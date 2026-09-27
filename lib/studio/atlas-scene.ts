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

export type AtlasPalette = { [K in keyof typeof PALETTE_TOKENS]: string };

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

/** The forces, stopped: the caller decides when it ticks. */
export function simulate(nodes: SimNode[], links: SimLink[], nodeCount: number): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode>(nodes)
    .stop()
    .force("charge", forceManyBody<SimNode>().strength(-70).distanceMax(650))
    .force("link", forceLink<SimNode, SimLink>(links).distance(linkDistance(nodeCount)).strength(0.16))
    .force("centre", forceCenter(0, 0).strength(0.04))
    .force("x", forceX<SimNode>(0).strength(0.02))
    .force("y", forceY<SimNode>(0).strength(0.02))
    .force("collision", forceCollide<SimNode>((n) => (n.kind === "folder" ? 22 : 12)))
    .alphaDecay(ALPHA_DECAY)
    .velocityDecay(0.35);
}

/** The settled layout, as the server draws it and the browser first paints it. */
export function layoutGraph(graph: AtlasGraph, kinds: readonly string[]): Map<string, { x: number; y: number }> {
  const { nodes, links } = sceneOf(graph, kinds);
  simulate(nodes, links, nodes.length).tick(SETTLE_TICKS);
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
