import { box, circle, glowText, line, polygon, roundRect, text, type Pen } from "./draw/kit";
import type { Banner, Hud } from "./games/types";
import type { Rect, Stage } from "./layout";
import { countdownBeat, countdownLabel, isNewBest, type Run } from "./run";

/**
 * The shared game chrome: everything drawn on a game's screen that is not the
 * game. The HUD, the how-to-play card, the READY 3 2 1, the banners a module
 * raises, and the GAME OVER screen. Every game gets the same furniture in the
 * same type, which is most of what makes three different games read as one
 * machine's cabinets.
 *
 * Drawn in stage units (see `layout.ts`), in the arcade's two faces (VT323 for
 * anything shouted, the mono for small print), from the theme palette only.
 * Every animation is a pure function of a clock the run already keeps, so it
 * runs at the same speed however slowly the frames arrive.
 */

/** One row of keycaps on the card, and the engine keys that light it. */
export type KeySpec = {
  caps: readonly string[];
  /** One key per cap lights that cap alone; fewer keys light the whole row together. */
  keys: readonly string[];
  label: string;
  /** Draw four arrow caps as an inverted T. */
  cluster?: boolean;
  /** What the caps say on a touch screen, where there is no keyboard to point at. */
  touch?: readonly string[];
  /** The label beside the touch caps, when the keyboard's would repeat the cap ("DRAW  DRAW"). */
  touchLabel?: string;
};

export type ScreenWords = {
  pressSpace: string; tapToStart: string; orEnter: string; howToPlay: string; demo: string;
  score: string; best: string; gameOver: string; finalScore: string; newBest: string; reached: string;
  lives: Record<"hull" | "hand" | "core", string>;
};

export type CabinetFace = { title: string; genre: string; card: { lines: readonly string[]; keys: readonly KeySpec[] }; overLine: string };

/** Whether cap `index` of a row is lit by what the demo just pressed. */
export function capLit(spec: KeySpec, index: number, lit: ReadonlyMap<string, number>): boolean {
  const on = (key: string | undefined) => key !== undefined && (lit.get(key) ?? 0) > 0;
  return spec.keys.length === spec.caps.length ? on(spec.keys[index]) : spec.keys.some(on);
}

/** A score as an arcade prints it: six digits, zero-padded. */
export function scoreDigits(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(6, "0");
}

/** Thousands separators, the same on every platform. */
function grouped(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ── the HUD ─────────────────────────────────────────────────────────────── */

function lifeIcon(pen: Pen, icon: "hull" | "hand" | "core", x: number, y: number, r: number, on: boolean) {
  const { c, p } = pen;
  const colour = on ? p.bright : p.dim;
  const glow = on ? p.brightGlow : undefined;
  if (icon === "hull") polygon(c, x, y, r, 4, 0, colour, glow, on ? p.inkFill : undefined);
  else if (icon === "core") polygon(c, x, y, r, 6, Math.PI / 6, colour, glow, on ? p.inkFill : undefined);
  else {
    box(c, x - r * 0.72, y - r, r * 1.44, r * 2, on ? p.inkFill : null, colour, glow, Math.max(1.5, r / 5));
  }
}

/** A segmented meter, the arcade way: ten cells, lit as it fills, with a notch where it is ready to spend. */
export function meter(pen: Pen, x: number, y: number, w: number, h: number, value: number, ready?: number, cells = 10) {
  const { c, p } = pen;
  const gap = Math.max(2, w / 80), cw = (w - gap * (cells - 1)) / cells;
  const charged = ready === undefined || value >= ready - 1e-9;
  for (let i = 0; i < cells; i++) {
    const cx = x + i * (cw + gap);
    const full = value >= (i + 1) / cells - 1e-9;
    const part = !full && value > i / cells;
    const colour = full ? (charged ? p.bright : p.ink) : part ? p.inkSoft : null;
    box(c, cx, y, cw, h, colour, full ? null : p.dim, full && charged ? p.brightGlow : undefined, 1);
  }
  if (ready !== undefined) {
    const mx = x + ready * w;
    line(c, { x: mx, y: y - h * 0.35 }, { x: mx, y: y + h * 1.35 }, p.accent, Math.max(2, h / 7));
  }
}

export function drawHud(pen: Pen, stage: Stage, hud: Hud, score: number, best: number, words: ScreenWords) {
  const { c, p } = pen;
  const band = stage.hud;
  box(c, band.x, band.y, band.w, band.h, p.veil, null);
  line(c, { x: band.x + 12, y: band.y + band.h }, { x: band.x + band.w - 12, y: band.y + band.h }, p.dim, stage.big ? 2 : 1);
  if (!stage.big) {
    text(pen, words.score, 16, 14, 12, p.accent);
    glowText(pen, scoreDigits(score), 16, 40, 30, p.bright, p.brightGlow, "left");
    text(pen, words.best, 150, 14, 12, p.accent);
    text(pen, scoreDigits(Math.max(best, score)), 150, 40, 30, p.ink, "left", true);
    if (hud.stage) {
      text(pen, hud.stage.label, 450, 14, 12, p.accent, "center");
      glowText(pen, String(hud.stage.value).padStart(2, "0"), 450, 40, 30, p.bright, p.brightGlow);
    }
    if (hud.lives) {
      text(pen, words.lives[hud.lives.icon], 596, 14, 12, p.accent);
      for (let i = 0; i < hud.lives.max; i++) lifeIcon(pen, hud.lives.icon, 604 + i * 24, 30, 8, i < hud.lives.current);
    }
    if (hud.meter) {
      text(pen, hud.meter.label, 720, 14, 12, p.accent);
      meter(pen, 720, 22, 164, 14, hud.meter.value, hud.meter.ready);
    }
    return;
  }
  text(pen, words.score, 28, 34, 22, p.accent);
  glowText(pen, scoreDigits(score), 26, 90, 62, p.bright, p.brightGlow, "left");
  text(pen, words.best, 874, 34, 22, p.accent, "right");
  text(pen, scoreDigits(Math.max(best, score)), 876, 90, 62, p.ink, "right", true);
  if (hud.stage) {
    text(pen, hud.stage.label, 450, 34, 22, p.accent, "center");
    glowText(pen, String(hud.stage.value).padStart(2, "0"), 450, 90, 62, p.bright, p.brightGlow);
  }
  if (hud.lives) {
    text(pen, words.lives[hud.lives.icon], 28, 132, 22, p.accent);
    const lx = 28 + (c.measureText(words.lives[hud.lives.icon]).width || 80) + 26;
    for (let i = 0; i < hud.lives.max; i++) lifeIcon(pen, hud.lives.icon, lx + i * 40, 124, 13, i < hud.lives.current);
  }
  if (hud.meter) {
    text(pen, hud.meter.label, 596, 132, 22, p.accent, "right");
    meter(pen, 612, 110, 264, 26, hud.meter.value, hud.meter.ready);
  }
}

/* ── banners ─────────────────────────────────────────────────────────────── */

export function drawBanner(pen: Pen, stage: Stage, play: Rect, b: Banner) {
  const { c, p } = pen;
  const k = stage.big ? 1.7 : 1;
  const big = b.size === "big";
  const reveal = Math.min(1, b.age / 0.14);
  const fade = Math.max(0, Math.min(1, (b.life - b.age) / 0.3));
  const cy = big ? play.y + play.h * 0.46 : play.y + play.h * 0.2;
  const h = (big ? 118 : 70) * k * reveal;
  c.globalAlpha = fade;
  box(c, play.x, cy - h / 2, play.w, h, p.scrim, null);
  line(c, { x: play.x, y: cy - h / 2 }, { x: play.x + play.w, y: cy - h / 2 }, p.accent, 1.5 * k);
  line(c, { x: play.x, y: cy + h / 2 }, { x: play.x + play.w, y: cy + h / 2 }, p.accent, 1.5 * k);
  if (reveal >= 1) {
    glowText(pen, b.text, play.x + play.w / 2, cy + (big ? 16 : 10) * k - (b.sub ? 10 * k : 0), (big ? 76 : 42) * k, p.bright, p.brightGlow);
    if (b.sub) text(pen, b.sub, play.x + play.w / 2, cy + (big ? 42 : 30) * k, (big ? 16 : 13) * k, p.accent, "center");
  }
  c.globalAlpha = 1;
}

/* ── the countdown ───────────────────────────────────────────────────────── */

export function drawCountdown(pen: Pen, stage: Stage, play: Rect, run: Run) {
  const label = countdownLabel(run);
  if (!label) return;
  const { c, p } = pen;
  const k = stage.big ? 1.6 : 1;
  const beat = countdownBeat(run);
  box(c, play.x, play.y, play.w, play.h, p.veil, null);
  const punch = 1 + 0.4 * (1 - beat) ** 3;
  const size = (label === "READY" ? 118 : 210) * k * punch;
  c.globalAlpha = beat < 0.82 ? 1 : Math.max(0, 1 - (beat - 0.82) / 0.18);
  glowText(pen, label, play.x + play.w / 2, play.y + play.h / 2 + size * 0.32, size, label === "READY" ? p.accent : p.bright, label === "READY" ? p.accentGlow : p.brightGlow);
  c.globalAlpha = 1;
}

/* ── the how-to-play card ────────────────────────────────────────────────── */

type CapBox = { label: string; x: number; y: number; w: number; h: number; lit: boolean };

function capWidth(pen: Pen, label: string, size: number, h: number) {
  pen.c.font = `bold ${size}px ${pen.theme.mono}`;
  return Math.max(h, (pen.c.measureText(label).width || label.length * size * 0.6) + size * 1.4);
}

function drawCap(pen: Pen, cap: CapBox, size: number) {
  const { c, p } = pen;
  const y = cap.y + (cap.lit ? 2 : 0);
  if (cap.lit) {
    c.globalCompositeOperation = "lighter";
    roundRect(c, cap.x - 4, y - 4, cap.w + 8, cap.h + 8, 9);
    c.fillStyle = p.brightGlow;
    c.fill();
    c.globalCompositeOperation = "source-over";
  }
  roundRect(c, cap.x, y, cap.w, cap.h, 6);
  c.fillStyle = cap.lit ? p.inkFill : p.panel;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = cap.lit ? p.bright : p.dim;
  c.stroke();
  // The keycap's lower lip: a key has a front face.
  line(c, { x: cap.x + 6, y: y + cap.h - 5 }, { x: cap.x + cap.w - 6, y: y + cap.h - 5 }, cap.lit ? p.bright : p.line, 1);
  c.font = `bold ${size}px ${pen.theme.mono}`;
  c.fillStyle = cap.lit ? p.bright : p.ink;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(cap.label, cap.x + cap.w / 2, y + cap.h / 2 - 2);
  c.textBaseline = "alphabetic";
}

/** Lay out and draw one row of caps from (x, y); returns the row's height. */
function capRow(pen: Pen, spec: KeySpec, x: number, y: number, touch: boolean, lit: ReadonlyMap<string, number>, size: number, h: number, labelSize: number): number {
  const { p } = pen;
  const labels = touch && spec.touch ? spec.touch : spec.caps;
  const touchRow = touch && spec.touch !== undefined;
  const label = touchRow && spec.touchLabel ? spec.touchLabel : spec.label;
  const caps: CapBox[] = [];
  let right = x;
  if (spec.cluster && !touchRow && labels.length === 4) {
    // ↑ over ← ↓ →, the way the keys sit on a keyboard.
    const w = h, gap = h * 0.14;
    caps.push({ label: labels[0], x: x + w + gap, y, w, h, lit: capLit(spec, 0, lit) });
    for (let i = 1; i < 4; i++) caps.push({ label: labels[i], x: x + (i - 1) * (w + gap), y: y + h + gap, w, h, lit: capLit(spec, i, lit) });
    right = x + 3 * w + 2 * gap;
    caps.forEach((cap) => drawCap(pen, cap, size));
    text(pen, label, right + h * 0.6, y + h + gap + h * 0.72, labelSize, p.bright, "left", true);
    return 2 * h + gap;
  }
  labels.forEach((label, i) => {
    const w = capWidth(pen, label, size, h);
    caps.push({ label, x: right, y, w, h, lit: touchRow ? spec.keys.some((k) => (lit.get(k) ?? 0) > 0) : capLit(spec, i, lit) });
    right += w + h * 0.18;
  });
  caps.forEach((cap) => drawCap(pen, cap, size));
  text(pen, label, right + h * 0.42, y + h * 0.72, labelSize, p.bright, "left", true);
  return h;
}

function drawDemo(pen: Pen, frame: Rect, words: ScreenWords, drawDemoWorld: (scale: number) => void, big = false) {
  const { c, p } = pen;
  box(c, frame.x, frame.y, frame.w, frame.h, p.bg, null);
  c.save();
  c.beginPath();
  c.rect(frame.x, frame.y, frame.w, frame.h);
  c.clip();
  c.translate(frame.x, frame.y);
  drawDemoWorld(frame.w / 900);
  c.restore();
  box(c, frame.x, frame.y, frame.w, frame.h, null, p.dim);
  const k = big ? 2 : 1;
  box(c, frame.x + 8 * k, frame.y + 8 * k, 58 * k, 20 * k, p.scrim, null);
  text(pen, words.demo, frame.x + 37 * k, frame.y + 23 * k, 12 * k, p.accent, "center");
}

/**
 * The card: the cabinet's name, two or three lines on how it plays, the real
 * keys drawn as keycaps that light the moment the demo presses them, and PRESS
 * SPACE. `drawDemoWorld(scale)` paints the demo at `scale` into the current
 * transform's origin, and the card decides where that is.
 */
export function drawCard(pen: Pen, stage: Stage, run: Run, face: CabinetFace, words: ScreenWords, touch: boolean, drawDemoWorld: (scale: number) => void) {
  const { c, p } = pen;
  const lit = run.demo.lit;
  const blinkOn = (run.clock * 1.25) % 1 < 0.7;
  const start = touch ? words.tapToStart : words.pressSpace;
  if (!stage.big) {
    text(pen, words.howToPlay, 40, 52, 13, p.accent);
    glowText(pen, face.title, 38, 118, 78, p.bright, p.brightGlow, "left");
    text(pen, face.genre, 42, 144, 13, p.ink);
    face.card.lines.forEach((l, i) => text(pen, l, 42, 190 + i * 28, 17, p.ink));
    let y = 190 + face.card.lines.length * 28 + 18;
    for (const spec of face.card.keys) y += capRow(pen, spec, 42, y, touch, lit, 15, 40, 30) + 18;
    drawDemo(pen, { x: 500, y: 70, w: 360, h: 224 }, words, drawDemoWorld);
    if (run.best > 0) {
      text(pen, words.best, 680, 330, 12, p.accent, "center");
      text(pen, grouped(run.best), 680, 364, 36, p.ink, "center", true);
    }
    if (blinkOn) glowText(pen, start, 680, 464, 58, p.bright, p.brightGlow);
    if (!touch) text(pen, words.orEnter, 680, 492, 13, p.dim, "center");
    return;
  }
  // Tall: the same card stood up, in phone-sized type.
  text(pen, words.howToPlay, 40, 70, 24, p.accent);
  glowText(pen, face.title, 36, 170, 112, p.bright, p.brightGlow, "left");
  text(pen, face.genre, 42, 208, 22, p.ink);
  const linesH = face.card.lines.length * 42;
  const keysH = face.card.keys.length * 88;
  const room = stage.h - 250 - linesH - keysH - 150;
  let y = 250;
  if (room >= 320) {
    const w = 820, h = Math.min(room - 30, w * (560 / 900));
    drawDemo(pen, { x: 40, y, w, h: Math.round(h) }, words, drawDemoWorld, true);
    y += Math.round(h) + 50;
  } else {
    // No room for a screen within the screen: the demo plays behind the card instead.
    c.save();
    c.globalAlpha = 0.35;
    c.translate(stage.world.x, stage.world.y);
    drawDemoWorld(stage.world.s);
    c.restore();
    box(c, 24, y - 24, stage.w - 48, linesH + keysH + 40, p.scrim, null);
    y += 16;
  }
  face.card.lines.forEach((l, i) => text(pen, l, 42, y + i * 42, 30, p.ink));
  y += linesH + 16;
  for (const spec of face.card.keys) y += capRow(pen, spec, 42, y, touch, lit, 26, 64, 46) + 24;
  if (blinkOn) glowText(pen, start, stage.w / 2, stage.h - 50, 84, p.bright, p.brightGlow);
}

/* ── game over ───────────────────────────────────────────────────────────── */

export function drawGameOver(pen: Pen, stage: Stage, run: Run, face: CabinetFace, hud: Hud, words: ScreenWords) {
  const { c, p } = pen;
  const k = stage.big ? 1.5 : 1;
  const t = run.clock;
  const cx = stage.w / 2, cy = stage.h / 2;
  box(c, 0, 0, stage.w, stage.h, p.scrim, null);
  const reveal = Math.min(1, t / 0.25);
  c.save();
  c.translate(cx, cy - 92 * k);
  c.scale(1, Math.max(0.02, reveal));
  glowText(pen, words.gameOver, 0, 0, 118 * k, p.bright, p.brightGlow);
  c.restore();
  text(pen, face.overLine, cx, cy - 48 * k, 38 * k, p.accent, "center", true);
  const tally = Math.min(1, Math.max(0, (t - 0.3) / 0.9));
  const shown = Math.round(run.game.score * (1 - (1 - tally) ** 3));
  text(pen, words.finalScore, cx, cy + 4 * k, 13 * k, p.accent, "center");
  glowText(pen, grouped(shown), cx, cy + 86 * k, 96 * k, p.bright, p.brightGlow);
  if (hud.stage) text(pen, `${words.reached} ${hud.stage.label} ${String(hud.stage.value).padStart(2, "0")}`, cx, cy + 124 * k, 15 * k, p.ink, "center");
  if (isNewBest(run) && tally >= 1 && (t * 1.25) % 1 < 0.7) {
    glowText(pen, words.newBest, cx, cy + 176 * k, 46 * k, p.accent, p.accentGlow);
    circle(c, cx - 150 * k, cy + 162 * k, 5 * k, p.accent, true);
    circle(c, cx + 150 * k, cy + 162 * k, 5 * k, p.accent, true);
  }
}
