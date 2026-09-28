import type { Point } from "../games/types";
import { withAlpha, type ArcadeTheme } from "../theme";

/**
 * The pen every arcade drawer holds: the palette and the primitives.
 *
 * Every colour comes from `paletteFor(theme)`, which is derived from the
 * site's tokens, so the games follow the amber and ice phosphors like
 * everything else on the machine. No file under `lib/arcade/draw/` holds a
 * colour literal and `renderer.test.ts` walks them all to prove it.
 *
 * Glow is two strokes with additive compositing, a wide translucent one under
 * a thin bright one. Never `shadowBlur`, which costs a full-canvas blur a
 * shape.
 */

export function paletteFor(t: ArcadeTheme) {
  return {
    ink: t.ink,
    bright: t.bright,
    dim: t.dim,
    line: t.line,
    accent: t.accent,
    accentBright: t.accentBright,
    bg: t.bg,
    panel: t.panel,
    inkGlow: withAlpha(t.ink, 0.28),
    accentGlow: withAlpha(t.accent, 0.28),
    brightGlow: withAlpha(t.bright, 0.35),
    inkSoft: withAlpha(t.ink, 0.12),
    accentSoft: withAlpha(t.accent, 0.12),
    inkFill: withAlpha(t.ink, 0.18),
    accentFill: withAlpha(t.accent, 0.18),
    grid: withAlpha(t.ink, 0.07),
    fade: withAlpha(t.bg, 0.42),
    scrim: withAlpha(t.bg, 0.86),
    veil: withAlpha(t.bg, 0.62),
    floor: withAlpha(t.ink, 0.05),
    wall: withAlpha(t.ink, 0.14),
  };
}
export type Palette = ReturnType<typeof paletteFor>;

const palettes = new WeakMap<ArcadeTheme, Palette>();
export function palette(theme: ArcadeTheme): Palette {
  let p = palettes.get(theme);
  if (!p) {
    p = paletteFor(theme);
    palettes.set(theme, p);
  }
  return p;
}

export type Ctx = CanvasRenderingContext2D;

/** What a drawer is handed: the context, the palette and the theme's two typefaces. */
export type Pen = { c: Ctx; p: Palette; theme: ArcadeTheme };

export const SUITS = ["♠", "♥", "♣", "♦"] as const;

export function line(c: Ctx, a: Point, b: Point, colour: string, width = 2, glow?: string) {
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  if (glow) {
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = glow;
    c.lineWidth = width * 4;
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

export function circle(c: Ctx, x: number, y: number, r: number, colour: string, fill = false, glow?: string) {
  if (glow) {
    c.globalCompositeOperation = "lighter";
    c.beginPath();
    c.arc(x, y, r + (fill ? 6 : 4), 0, Math.PI * 2);
    c.fillStyle = glow;
    c.fill();
    c.globalCompositeOperation = "source-over";
  }
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = 2;
  if (fill) c.fill();
  else c.stroke();
}

export function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null, glow?: string, lineWidth = 2) {
  if (glow) {
    c.globalCompositeOperation = "lighter";
    c.fillStyle = glow;
    c.fillRect(x - 4, y - 4, w + 8, h + 8);
    c.globalCompositeOperation = "source-over";
  }
  if (fill) {
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lineWidth;
    c.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}

export function polygon(c: Ctx, x: number, y: number, r: number, sides: number, a: number, colour: string, glow?: string, fill?: string) {
  c.beginPath();
  for (let i = 0; i <= sides; i++) {
    const theta = a + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(theta) * r, py = y + Math.sin(theta) * r;
    if (!i) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (glow) {
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = glow;
    c.lineWidth = 7;
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  c.strokeStyle = colour;
  c.lineWidth = 2;
  c.stroke();
}

/**
 * Text in the arcade's two typefaces. `display` is VT323, the site's screen
 * face, for anything a cabinet shouts; the mono is JetBrains Mono for small
 * print. Never a third face.
 */
export function text(pen: Pen, value: string, x: number, y: number, size = 14, colour: string = pen.p.ink, align: CanvasTextAlign = "left", display = false) {
  const { c, theme } = pen;
  c.font = `${display ? "" : size >= 25 ? "bold " : ""}${size}px ${display ? theme.display : theme.mono}`;
  c.fillStyle = colour;
  c.textAlign = align;
  c.textBaseline = "alphabetic";
  c.fillText(value, x, y);
}

/** Text with the phosphor bloom behind it, for the few words that should glow. */
export function glowText(pen: Pen, value: string, x: number, y: number, size: number, colour: string, glow: string, align: CanvasTextAlign = "center") {
  const { c } = pen;
  c.globalCompositeOperation = "lighter";
  text(pen, value, x - 1, y, size, glow, align, true);
  text(pen, value, x + 1, y, size, glow, align, true);
  c.globalCompositeOperation = "source-over";
  text(pen, value, x, y, size, colour, align, true);
}

/** A rounded rectangle path, for keycaps and cards. */
export function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + q, y);
  c.lineTo(x + w - q, y);
  c.quadraticCurveTo(x + w, y, x + w, y + q);
  c.lineTo(x + w, y + h - q);
  c.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  c.lineTo(x + q, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - q);
  c.lineTo(x, y + q);
  c.quadraticCurveTo(x, y, x + q, y);
  c.closePath();
}

export function grid(c: Ctx, p: Palette, w: number, h: number, top = 32, step = 30) {
  c.strokeStyle = p.grid;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x < w; x += step) {
    c.moveTo(x, top);
    c.lineTo(x, h);
  }
  for (let y = top; y < h; y += step) {
    c.moveTo(0, y);
    c.lineTo(w, y);
  }
  c.stroke();
}
