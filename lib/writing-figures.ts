/**
 * A small drawn figure for each article on the writing index (Fergus,
 * 2026-09-26: "a little summary under each one, or an image").
 *
 * Each figure draws the piece's actual argument, not a decoration: the lease
 * capped at the deadline, two customers with two rhythms, ten weeks under a
 * target that was never reached. Shapes only, never text, because text inside
 * an SVG is text in the document and would compete with the prose for anything
 * extracting it. They are data rather than JSX so the tests can check that
 * every published piece has one and that each stays inside its frame.
 *
 * Tones: `ink` is the line, `dim` the scaffolding, `faint` a wash, and
 * `accent` the one idea the eye should land on first (amber on the site).
 * `draw` parts trace themselves on hover; `delay` staggers them, in ms.
 */

export type FigureTone = "ink" | "dim" | "faint" | "accent";
type Common = { tone?: FigureTone; draw?: boolean; dashed?: boolean; delay?: number; fill?: boolean; group?: string };
export type FigurePart =
  | ({ kind: "path"; d: string } & Common)
  | ({ kind: "circle"; cx: number; cy: number; r: number } & Common)
  | ({ kind: "rect"; x: number; y: number; w: number; h: number } & Common);

export const FIGURE_VIEWBOX = { w: 160, h: 100 } as const;

const arrow = (x1: number, y1: number, x2: number, y2: number): string => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (da: number) => `${(x2 - 6 * Math.cos(a + da)).toFixed(1)} ${(y2 - 6 * Math.sin(a + da)).toFixed(1)}`;
  return `M${x1} ${y1} L${x2} ${y2} M${head(0.5)} L${x2} ${y2} L${head(-0.5)}`;
};

export const articleFigures: Record<string, FigurePart[]> = {
  // A countdown makes the promise; short renewals keep it, never past the deadline.
  "the-timer-is-not-the-reservation": [
    { kind: "circle", cx: 28, cy: 30, r: 14, tone: "dim" },
    { kind: "path", d: "M28 16 A14 14 0 1 1 14 30", tone: "ink", draw: true },
    { kind: "path", d: "M12 72 H148", tone: "dim" },
    ...[12, 36, 60, 84].map((x, i): FigurePart => ({ kind: "rect", x, y: 66, w: 22, h: 12, tone: "ink", fill: true, delay: 120 + i * 140 })),
    { kind: "rect", x: 108, y: 66, w: 12, h: 12, tone: "ink", fill: true, delay: 680 },
    { kind: "path", d: "M120 48 V88", tone: "accent", dashed: true },
    { kind: "circle", cx: 136, cy: 72, r: 3, tone: "dim" },
  ],

  // Two rhythms. A fixed thirty-day line judges both wrongly; each customer's
  // own gap puts the alarm in the right place for them.
  "when-is-a-customer-actually-gone": [
    { kind: "path", d: "M12 32 H148", tone: "dim" },
    ...[16, 25, 34, 43, 52, 61].map((cx, i): FigurePart => ({ kind: "circle", cx, cy: 32, r: 3, tone: "ink", fill: true, delay: i * 70 })),
    { kind: "path", d: "M88 22 V42", tone: "accent", group: "alarm", draw: true, delay: 500 },
    { kind: "path", d: "M12 70 H148", tone: "dim" },
    ...[16, 44, 72].map((cx, i): FigurePart => ({ kind: "circle", cx, cy: 70, r: 3, tone: "ink", fill: true, delay: 200 + i * 120 })),
    { kind: "path", d: "M142 60 V80", tone: "accent", group: "alarm", draw: true, delay: 700 },
    { kind: "path", d: "M108 14 V90", tone: "dim", dashed: true },
  ],

  // Ten weeks of deadlines, each a step up, under a target never reached.
  "what-an-accelerator-is-for": [
    { kind: "path", d: "M12 22 H148", tone: "accent", dashed: true },
    { kind: "path", d: "M12 84 H40 V70 H67 V62 H94 V50 H121 V45 H148", tone: "ink", draw: true },
    { kind: "path", d: "M148 45 V26", tone: "dim", dashed: true },
    ...Array.from({ length: 10 }, (_, i): FigurePart => ({ kind: "rect", x: 12 + i * 13.6, y: 90, w: 10, h: 4, tone: i === 9 ? "ink" : "dim", fill: true, delay: i * 50 })),
  ],

  // One app, many shops, and every line into it keyed by the shop it serves.
  "multi-tenant-shopify-apps": [
    ...[22, 50, 78].flatMap((y, i): FigurePart[] => [
      { kind: "path", d: `M66 50 L25 ${y}`, tone: "dim", draw: true, delay: i * 90 },
      { kind: "path", d: `M94 50 L135 ${y}`, tone: "dim", draw: true, delay: 60 + i * 90 },
      { kind: "circle", cx: 18, cy: y, r: 7, tone: "ink" },
      { kind: "circle", cx: 142, cy: y, r: 7, tone: "ink" },
      { kind: "rect", x: 44, y: 50 + (y - 50) * 0.47 - 2, w: 4, h: 4, tone: "accent", group: "key", fill: true, delay: 300 + i * 90 },
      { kind: "rect", x: 112, y: 50 + (y - 50) * 0.47 - 2, w: 4, h: 4, tone: "accent", group: "key", fill: true, delay: 340 + i * 90 },
    ]),
    { kind: "rect", x: 66, y: 38, w: 28, h: 24, tone: "ink", fill: true },
  ],

  // Fast growth, then the end: three founders pulling three ways.
  "why-presterly-wound-down": [
    { kind: "path", d: "M12 86 H148", tone: "dim" },
    { kind: "path", d: "M12 84 C40 82 58 62 76 42 S94 24 100 22", tone: "ink", draw: true },
    { kind: "circle", cx: 100, cy: 22, r: 3.5, tone: "accent", fill: true, delay: 700 },
    { kind: "path", d: arrow(104, 22, 132, 12), tone: "dim", draw: true, delay: 850 },
    { kind: "path", d: arrow(104, 24, 134, 34), tone: "dim", draw: true, delay: 900 },
    { kind: "path", d: arrow(102, 26, 118, 52), tone: "dim", draw: true, delay: 950 },
  ],

  // A beam painting phosphor: a bright spot, the decaying trail behind it,
  // and the ghost of what the tube has shown for too long.
  "a-crt-that-behaves-like-a-crt": [
    ...[20, 32, 44, 56, 68, 80].map((y): FigurePart => ({ kind: "path", d: `M12 ${y} H148`, tone: "faint" })),
    { kind: "rect", x: 22, y: 62, w: 44, h: 12, tone: "faint", fill: true },
    ...[0, 1, 2, 3, 4, 5].map((i): FigurePart => ({ kind: "path", d: `M${40 + i * 12} 44 H${50 + i * 12}`, tone: i < 2 ? "dim" : "ink", group: "beam" })),
    { kind: "circle", cx: 116, cy: 44, r: 3.5, tone: "accent", fill: true, group: "beam" },
  ],
};

/** Every coordinate a figure touches. Absolute path commands only, which is all these use. */
export function figureBounds(parts: FigurePart[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of parts) {
    if (p.kind === "circle") {
      xs.push(p.cx - p.r, p.cx + p.r);
      ys.push(p.cy - p.r, p.cy + p.r);
    } else if (p.kind === "rect") {
      xs.push(p.x, p.x + p.w);
      ys.push(p.y, p.y + p.h);
    } else {
      let x = 0;
      let y = 0;
      for (const [, cmd, args] of p.d.matchAll(/([MLHVCSQTA])([^MLHVCSQTA]*)/g)) {
        const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        if (cmd === "H") n.forEach((v) => { x = v; xs.push(x); ys.push(y); });
        else if (cmd === "V") n.forEach((v) => { y = v; xs.push(x); ys.push(y); });
        else if (cmd === "A") {
          for (let i = 0; i + 6 < n.length; i += 7) { x = n[i + 5]; y = n[i + 6]; xs.push(x); ys.push(y); }
        } else {
          for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; xs.push(x); ys.push(y); }
        }
      }
    }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
