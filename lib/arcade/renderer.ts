import type { GameState, Point } from "./engine";
import { WORLD } from "./engine";
import { HAND_NAMES, HAND_POINTS } from "./poker-rules";
import { withAlpha, type ArcadeTheme } from "./theme";

/**
 * Draws a game the way a vector tube would show it.
 *
 * Three things distinguish this from a plain canvas renderer, and each is a
 * consequence of the site's premise (an electron beam painting phosphor):
 *
 *  - **Persistence.** The world is drawn into a ghost layer that is faded, not
 *    cleared, every frame, so anything that moves leaves a decaying trail.
 *    The HUD is drawn sharp on the main canvas over the composite.
 *  - **Glow.** Bright strokes are laid twice with additive compositing: a wide
 *    translucent pass under a thin bright one. Never `shadowBlur`, which costs
 *    a full-canvas blur per shape.
 *  - **The theme.** Every colour comes from `paletteFor(theme)`, which is
 *    derived from the site's tokens. There is no colour literal in this file
 *    and `renderer.test.ts` proves it, so the games follow the amber and ice
 *    phosphors like everything else on the machine.
 */

export type RenderOptions = {
  /** A narrow screen: the HUD's type goes up so it stays readable. */
  compact?: boolean;
  /** A second context, the same pixel size, that keeps the phosphor's memory. */
  ghost?: CanvasRenderingContext2D | null;
  /** Draw the score strip and captions. Off for the small attract screens. */
  hud?: boolean;
};

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
    floor: withAlpha(t.ink, 0.05),
    wall: withAlpha(t.ink, 0.14),
  };
}
export type Palette = ReturnType<typeof paletteFor>;

const palettes = new WeakMap<ArcadeTheme, Palette>();
function palette(theme: ArcadeTheme): Palette {
  let p = palettes.get(theme);
  if (!p) {
    p = paletteFor(theme);
    palettes.set(theme, p);
  }
  return p;
}

type Ctx = CanvasRenderingContext2D;
const suits = ["♠", "♥", "♣", "♦"];

/* ── primitives ─────────────────────────────────────────────────────────── */

function line(c: Ctx, a: Point, b: Point, colour: string, width = 2, glow?: string) {
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

function circle(c: Ctx, x: number, y: number, r: number, colour: string, fill = false, glow?: string) {
  if (glow) {
    c.globalCompositeOperation = "lighter";
    c.beginPath();
    c.arc(x, y, r + (fill ? 6 : 4), 0, Math.PI * 2);
    c.fillStyle = glow;
    c.fill();
    c.globalCompositeOperation = "source-over";
  }
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = 2;
  if (fill) c.fill();
  else c.stroke();
}

function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null, glow?: string) {
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
    c.lineWidth = 2;
    c.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}

function polygon(c: Ctx, x: number, y: number, r: number, sides: number, a: number, colour: string, glow?: string, fill?: string) {
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

function text(c: Ctx, p: Palette, theme: ArcadeTheme, value: string, x: number, y: number, size = 14, colour: string = p.ink, align: CanvasTextAlign = "left", display = false) {
  c.font = `${display ? "" : size >= 25 ? "bold " : ""}${size}px ${display ? theme.display : theme.mono}`;
  c.fillStyle = colour;
  c.textAlign = align;
  c.textBaseline = "alphabetic";
  c.fillText(value, x, y);
}

function grid(c: Ctx, p: Palette) {
  c.strokeStyle = p.grid;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x < WORLD.w; x += 30) {
    c.moveTo(x, 32);
    c.lineTo(x, WORLD.h);
  }
  for (let y = 32; y < WORLD.h; y += 30) {
    c.moveTo(0, y);
    c.lineTo(WORLD.w, y);
  }
  c.stroke();
}

/* ── the world, one game at a time ──────────────────────────────────────── */

function drawDeadSignal(c: Ctx, s: GameState, p: Palette, theme: ArcadeTheme, hud: boolean) {
  for (const e of s.enemies) {
    polygon(c, e.x, e.y, e.kind === 2 ? 16 : 12, 3 + e.kind, s.time * (e.kind === 1 ? -1 : 1), p.accent, p.accentGlow);
    if (e.hp > 1) circle(c, e.x, e.y, 4, p.accent);
  }
  for (const b of s.bullets) line(c, b, { x: b.x - b.vx * 0.018, y: b.y - b.vy * 0.018 }, p.bright, 3, p.brightGlow);
  c.globalAlpha = s.invincible > 0 ? 0.5 + Math.sin(s.time * 30) * 0.3 : 1;
  polygon(c, s.player.x, s.player.y, 15, 4, Math.PI / 4, p.bright, p.brightGlow);
  circle(c, s.player.x, s.player.y, 4, p.bright, true);
  c.globalAlpha = 1;
  circle(c, s.player.x, s.player.y, 23, p.dim);
  if (s.phase > 0) {
    circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 340, p.bright, false, p.brightGlow);
    circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 250, p.accent, false, p.accentGlow);
  }
  if (hud) text(c, p, theme, `${Math.floor(s.time)}s  /  CHAIN ${s.combo}`, 450, 547, 14, p.ink, "center");
}

function drawCircuitPoker(c: Ctx, s: GameState, p: Palette, theme: ArcadeTheme, hud: boolean) {
  const progress = Math.min(1, s.bank / s.target);
  if (hud) {
    text(c, p, theme, "CIRCUIT TARGET", 450, 59, 12, p.accent, "center");
    text(c, p, theme, `${s.bank} / ${s.target}`, 450, 100, 46, p.bright, "center", true);
  }
  box(c, 185, 118, 530, 5, p.inkSoft, null);
  box(c, 185, 118, 530 * progress, 5, p.bright, null, p.brightGlow);
  s.cards.forEach((card, i) => {
    const x = 118 + i * 137, y = s.held[i] ? 172 : 184;
    const rank = (card % 13) + 2, suit = Math.floor(card / 13), colour = suit % 2 ? p.accent : p.ink;
    box(c, x, y, 116, 167, s.held[i] ? p.inkFill : p.panel, s.held[i] ? p.bright : p.dim, s.held[i] ? p.inkGlow : undefined);
    const r = rank < 11 ? String(rank) : ["J", "Q", "K", "A"][rank - 11];
    text(c, p, theme, r, x + 13, y + 32, 25, colour);
    text(c, p, theme, suits[suit], x + 58, y + 101, 48, colour, "center");
    text(c, p, theme, s.held[i] ? "HELD" : `[${i + 1}]`, x + 58, y + 149, 14, s.held[i] ? p.bright : p.dim, "center");
  });
  if (hud) {
    text(c, p, theme, s.handName, 450, 404, 34, p.bright, "center", true);
    text(c, p, theme, `BANK ${s.handPoints} POINTS  /  ${s.redraws} REDRAWS`, 450, 427, 14, p.accent, "center");
    HAND_NAMES.forEach((name, i) => {
      const x = i < 5 ? 32 : 488, y = 468 + (i < 5 ? i : i - 5) * 17;
      text(c, p, theme, `${name.padEnd(19)} ${String(HAND_POINTS[i]).padStart(4)}`, x, y, 11, p.dim);
    });
  }
}

function drawWorld(c: Ctx, s: GameState, p: Palette, theme: ArcadeTheme, hud: boolean) {
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.lineCap = "round";
  if (s.id === "signal") drawDeadSignal(c, s, p, theme, hud);
  if (s.id === "poker") drawCircuitPoker(c, s, p, theme, hud);
  c.globalCompositeOperation = "lighter";
  for (const q of s.particles) {
    c.globalAlpha = Math.min(1, q.life * 2);
    c.fillStyle = q.amber ? p.accentBright : p.bright;
    c.fillRect(q.x, q.y, 3, 3);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

function drawHud(c: Ctx, s: GameState, p: Palette, theme: ArcadeTheme, compact: boolean) {
  // On a phone the canvas is a third of its desktop width, so the strip's type goes up to stay readable.
  const size = compact ? 21 : 14, y = compact ? 24 : 22;
  line(c, { x: 12, y: 32 }, { x: 888, y: 32 }, p.dim, 1);
  text(c, p, theme, `SCORE ${String(s.score).padStart(6, "0")}`, 18, y, size, p.ink);
  const middle = s.id === "poker" ? `CIRCUIT ${String(s.level).padStart(2, "0")}` : `SECTOR ${String(s.level).padStart(2, "0")}`;
  text(c, p, theme, middle, 450, y, size, p.accent, "center");
  const right = s.id === "poker" ? `${s.hands} HANDS LEFT` : `HULL ${"◆".repeat(Math.max(0, s.lives))}`;
  text(c, p, theme, right, 882, y, size, p.ink, "right");
  if (s.messageTime > 0) {
    box(c, 170, 277, 560, 42, p.scrim, null);
    text(c, p, theme, s.message, 450, 304, 16, p.accent, "center");
  }
  if (s.flash > 0) {
    c.globalAlpha = s.flash;
    box(c, 3, 35, 894, 522, null, p.accent);
    c.globalAlpha = 1;
  }
}

/** The finished screen, so an attract loop and a paused result both read as the tube's own. */
function drawOver(c: Ctx, s: GameState, p: Palette, theme: ArcadeTheme) {
  box(c, 0, 0, WORLD.w, WORLD.h, p.scrim, null);
  const won = s.won;
  text(c, p, theme, won ? "CIRCUIT COMPLETE" : "SIGNAL LOST", 450, 268, 64, won ? p.bright : p.accent, "center", true);
  text(c, p, theme, `${s.score.toLocaleString("en-IE")} PTS`, 450, 318, 30, p.ink, "center", true);
}

/**
 * Draw one frame. `width` and `height` are the canvas's pixel size; the world
 * is 900 by 560 and scales to fit. With a ghost context the world is drawn
 * there over its own faded past and composited onto the main canvas; without
 * one it is drawn straight onto a cleared main canvas.
 */
export function renderGame(c: Ctx, s: GameState, width: number, height: number, theme: ArcadeTheme, options: RenderOptions = {}) {
  const p = palette(theme);
  const hud = options.hud !== false;
  const ghost = options.ghost ?? null;
  const sx = width / WORLD.w, sy = height / WORLD.h;

  if (ghost) {
    ghost.save();
    ghost.setTransform(sx, 0, 0, sy, 0, 0);
    ghost.globalCompositeOperation = "source-over";
    ghost.globalAlpha = 1;
    ghost.fillStyle = p.fade;
    ghost.fillRect(0, 0, WORLD.w, WORLD.h);
    drawWorld(ghost, s, p, theme, hud);
    ghost.restore();
  }

  c.save();
  c.setTransform(sx, 0, 0, sy, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, WORLD.w, WORLD.h);
  if (ghost) {
    // The ghost's own fill becomes opaque after a few frames, so the grid goes
    // over it rather than under it. At seven percent it reads the same either way.
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(ghost.canvas, 0, 0, width, height);
    c.setTransform(sx, 0, 0, sy, 0, 0);
    grid(c, p);
  } else {
    grid(c, p);
    drawWorld(c, s, p, theme, hud);
  }
  if (hud) drawHud(c, s, p, theme, options.compact === true);
  if (s.over) drawOver(c, s, p, theme);
  c.restore();
}
