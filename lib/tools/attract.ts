/**
 * The live previews on the `/tools` cards, as pure scenes.
 *
 * A scene is a fixed list of SVG primitives whose attributes are a function of
 * elapsed seconds and nothing else. `components/tools/ToolPreview.tsx` renders
 * the scene at t = 0 on the server, so the first paint (and every
 * reduced-motion visit) shows a real picture of the tool, and then rewrites the
 * same elements' attributes from `SystemProvider`'s one frame clock while the
 * card is on screen. The list never changes shape over time; the test pins it.
 *
 * Each scene is the tool's own idea drawn in the machine's line style, not a
 * screenshot and not measured data: Atlas's graph with a signal walking its
 * links, Pocket Redact's page being masked and then reviewed, Group Lore's
 * week of chat with the hour sweeping across it, Relief's contour ground on
 * the move, Resonance's four pendulums over a running step row.
 *
 * Colours are never named here. Every primitive carries a `bench-attract__*`
 * class and `components/tools/workbench.css` paints it from the theme tokens.
 */

export const VIEW = { w: 400, h: 180 } as const;

export type Primitive =
  | { kind: "path"; cls: string; d: string; opacity?: number }
  | { kind: "line"; cls: string; x1: number; y1: number; x2: number; y2: number; opacity?: number }
  | { kind: "circle"; cls: string; cx: number; cy: number; r: number; opacity?: number }
  | { kind: "rect"; cls: string; x: number; y: number; width: number; height: number; opacity?: number };

export const ATTRACT_SLUGS = ["atlas", "pocket-redact", "group-lore", "relief", "resonance"] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const frac = (n: number) => n - Math.floor(n);

const GRID: Primitive = {
  kind: "path",
  cls: "bench-attract__grid",
  d: "M0 36H400M0 72H400M0 108H400M0 144H400M50 0V180M100 0V180M150 0V180M200 0V180M250 0V180M300 0V180M350 0V180",
};

/* ── Atlas: a graph with a signal walking its links ───────────────────── */

const NODES: [number, number, number][] = [
  [200, 90, 11],
  [110, 48, 7],
  [300, 52, 8],
  [312, 132, 6],
  [96, 136, 8],
  [46, 84, 5],
  [356, 92, 5],
  [210, 158, 5],
  [160, 22, 4],
];
const LINKS: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 6], [4, 5], [3, 6], [0, 7], [1, 8], [3, 7]];
const ROUTE: [number, number][] = [[0, 2], [2, 6], [6, 3], [3, 0], [0, 4], [4, 5], [5, 1], [1, 0]];

function atlas(t: number): Primitive[] {
  const at = NODES.map(([x, y, r], i) => ({
    x: clamp(x + 7 * Math.sin(t * 0.5 + i * 1.7), r, VIEW.w - r),
    y: clamp(y + 5 * Math.cos(t * 0.4 + i * 2.3), r, VIEW.h - r),
    r,
  }));
  const u = (t * 0.45) % ROUTE.length;
  const [a, b] = ROUTE[Math.floor(u)];
  const f = u - Math.floor(u);
  const onLink = ([p, q]: [number, number]) => (p === a && q === b) || (p === b && q === a);
  return [
    GRID,
    ...LINKS.map(([p, q]): Primitive => ({
      kind: "line",
      cls: "bench-attract__line",
      x1: r2(at[p].x),
      y1: r2(at[p].y),
      x2: r2(at[q].x),
      y2: r2(at[q].y),
      opacity: onLink([p, q]) ? 1 : 0.5,
    })),
    ...at.map((n, i): Primitive => ({
      kind: "circle",
      cls: i === 0 ? "bench-attract__hub" : "bench-attract__node",
      cx: r2(n.x),
      cy: r2(n.y),
      r: n.r,
    })),
    {
      kind: "circle",
      cls: "bench-attract__signal",
      cx: r2(at[a].x + (at[b].x - at[a].x) * f),
      cy: r2(at[a].y + (at[b].y - at[a].y) * f),
      r: 3.5,
    },
  ];
}

/* ── Pocket Redact: a page masked line by line, then reviewed ─────────── */

const LINE_WIDTHS = [112, 96, 104, 80, 116, 92, 100, 70];
const MASKS = [
  { line: 1, x0: 0, w: 70 },
  { line: 3, x0: 22, w: 58 },
  { line: 5, x0: 0, w: 92 },
];

function redact(t: number): Primitive[] {
  const phase = frac(t / 7);
  const fade = phase > 0.93 ? (1 - phase) / 0.07 : 1;
  const scanning = phase >= 0.58 && phase <= 0.9;
  return [
    GRID,
    { kind: "rect", cls: "bench-attract__page", x: 128, y: 14, width: 144, height: 152 },
    ...LINE_WIDTHS.map((w, i): Primitive => ({ kind: "rect", cls: "bench-attract__text", x: 142, y: 48 + i * 14, width: w, height: 4 })),
    ...MASKS.map((m, k): Primitive => ({
      kind: "rect",
      cls: "bench-attract__mask",
      x: 142 + m.x0,
      y: 45 + m.line * 14,
      width: r2(m.w * clamp((phase - 0.08 - k * 0.14) / 0.12, 0, 1)),
      height: 10,
      opacity: r2(fade),
    })),
    {
      kind: "line",
      cls: "bench-attract__scan",
      x1: 128,
      y1: r2(14 + clamp((phase - 0.58) / 0.32, 0, 1) * 152),
      x2: 272,
      y2: r2(14 + clamp((phase - 0.58) / 0.32, 0, 1) * 152),
      opacity: scanning ? 0.9 : 0,
    },
  ];
}

/* ── Group Lore: a week of chat, the hour sweeping across it ──────────── */

const COLS = 18;
const ROWS = 7;
const CELL = 16;
const GAP = 3;
const X0 = r2((VIEW.w - (COLS * (CELL + GAP) - GAP)) / 2);
const Y0 = 24;

/** A fixed, plausible week: more in the evenings, more at the weekend. */
function busy(row: number, col: number): number {
  const noise = frac(Math.sin(row * 12.9898 + col * 78.233) * 43758.5453);
  const evening = Math.max(0, Math.sin(((col - 4) / COLS) * Math.PI));
  const weekend = row >= 5 ? 0.18 : 0;
  return clamp(0.08 + 0.45 * noise * evening + 0.25 * evening + weekend * noise, 0.06, 0.8);
}

function lore(t: number): Primitive[] {
  const sweep = ((t * 2.2) % (COLS + 6)) - 3;
  const cells: Primitive[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const boost = 0.55 * Math.exp(-((col - sweep) ** 2) / 1.8);
      cells.push({
        kind: "rect",
        cls: "bench-attract__cell",
        x: r2(X0 + col * (CELL + GAP)),
        y: Y0 + row * (CELL + GAP),
        width: CELL,
        height: CELL,
        opacity: r2(clamp(busy(row, col) + boost, 0.06, 1)),
      });
    }
  }
  const x = clamp(X0 + sweep * (CELL + GAP) + CELL / 2, 0, VIEW.w);
  const inside = sweep > -0.5 && sweep < COLS - 0.5;
  return [
    GRID,
    ...cells,
    { kind: "line", cls: "bench-attract__scan", x1: r2(x), y1: Y0 - 8, x2: r2(x), y2: Y0 + ROWS * (CELL + GAP) + 5, opacity: inside ? 0.85 : 0 },
  ];
}

/* ── Relief: contour ground on the move ───────────────────────────────── */

function contour(i: number, t: number): string {
  const base = 30 + i * 20;
  const amp = 12 + 4 * Math.sin(i * 1.3);
  const points: string[] = [];
  for (let x = 0; x <= VIEW.w; x += 20) {
    const y = base + amp * Math.sin(x * 0.018 + i * 0.9 + t * 0.35) + 7 * Math.sin(x * 0.041 - t * 0.2 + i);
    points.push(`${x} ${r2(clamp(y, 4, VIEW.h - 4))}`);
  }
  return `M${points.join("L")}`;
}

function relief(t: number): Primitive[] {
  const cx = 200 + 150 * Math.sin(t * 0.23);
  const cy = 90 + 55 * Math.sin(t * 0.31 + 1);
  return [
    GRID,
    ...Array.from({ length: 7 }, (_, i): Primitive => ({
      kind: "path",
      cls: i % 2 ? "bench-attract__contour" : "bench-attract__contour-strong",
      d: contour(i, t),
    })),
    { kind: "line", cls: "bench-attract__signal-line", x1: r2(cx - 9), y1: r2(cy), x2: r2(cx + 9), y2: r2(cy) },
    { kind: "line", cls: "bench-attract__signal-line", x1: r2(cx), y1: r2(cy - 9), x2: r2(cx), y2: r2(cy + 9) },
    { kind: "circle", cls: "bench-attract__signal", cx: r2(cx), cy: r2(cy), r: 3 },
  ];
}

/* ── Resonance: four pendulums over a running step row ────────────────── */

const PIVOTS = [80, 160, 240, 320];
const OMEGA = [2.1, 2.6, 1.8, 3.1];
const PATTERN = new Set([0, 3, 4, 7, 8, 10, 12, 15]);

function resonance(t: number): Primitive[] {
  const bobs = PIVOTS.map((px, i) => {
    const length = 70 + i * 10;
    const angle = 0.42 * Math.sin(t * OMEGA[i] + i * 0.7);
    return { px, x: px + length * Math.sin(angle), y: 18 + length * Math.cos(angle) };
  });
  const current = Math.floor(t * 4) % 16;
  return [
    GRID,
    ...bobs.map((b): Primitive => ({ kind: "line", cls: "bench-attract__line", x1: b.px, y1: 18, x2: r2(b.x), y2: r2(b.y) })),
    ...bobs.map((b, i): Primitive => ({ kind: "circle", cls: i % 2 ? "bench-attract__hub" : "bench-attract__node", cx: r2(b.x), cy: r2(b.y), r: 9 })),
    ...Array.from({ length: 16 }, (_, i): Primitive => ({
      kind: "rect",
      cls: "bench-attract__step",
      x: r2(40 + i * 20.5),
      y: 146,
      width: 14,
      height: 14,
      opacity: i === current ? 1 : PATTERN.has(i) ? 0.55 : 0.18,
    })),
  ];
}

const SCENES: Record<string, (t: number) => Primitive[]> = {
  atlas,
  "pocket-redact": redact,
  "group-lore": lore,
  relief,
  resonance,
};

/** The scene for a tool at `t` seconds. An unknown slug gets the quiet grid. */
export function scene(slug: string, t: number): Primitive[] {
  const draw = SCENES[slug];
  return draw ? draw(Math.max(0, t)) : [GRID];
}
