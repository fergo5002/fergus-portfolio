import { screenCopy } from "@/content/arcade-collection";
import { INTRODUCED, KINDS, multiplier, PULSE_COST, PULSE_RANGE, type Enemy, type EnemyKind, type SignalState } from "../games/signal";
import type { Point } from "../games/types";
import type { StageKind } from "../layout";
import { circle, glowText, line, polygon, text, type Pen } from "./kit";

/**
 * Dead Signal's world: the swarm, the beam, the last live pixel and its pulse.
 *
 * The player is the phosphor's own colour and everything that can hurt it is
 * the accent, so the one question a glance has to answer (what is dangerous)
 * is answered by colour before shape. Each kind then has a silhouette of its
 * own: a drifter is a triangle, a shooter a square with a barrel, a charger
 * an arrowhead, a splitter a hexagon with its seam, a shard a small triangle,
 * a tank a double octagon ringed with its hits.
 *
 * Whatever an enemy is about to do is drawn before it does it. A shooter's
 * wind-up is a ring closing on it and a faint line to where it is aiming; a
 * charger's is the line it will dash along, blinking, and a shake. A hit
 * flashes the enemy solid. Multi-hit enemies carry pips for what they have
 * left.
 *
 * The beam's ring around the player is lit while the player moves and dark
 * when it stands still, and a player standing still is told to move. On the
 * wave a kind arrives, each of that kind carries a caption saying what it
 * does. All colour comes from the palette.
 */

type Sizes = { caption: number; pop: number; hint: number; chain: number };
const SIZES: Record<StageKind, Sizes> = {
  wide: { caption: 11, pop: 20, hint: 16, chain: 14 },
  // A phone draws the 900-wide world about 360 pixels across: everything a thumb has to read goes up.
  tall: { caption: 20, pop: 34, hint: 30, chain: 26 },
};

/** Seconds standing still before the player is told to move. */
export const HINT_AFTER = 0.8;

/** The kinds a wave captions: the one it introduced. */
export function captionedKind(s: SignalState): EnemyKind | null {
  const k = INTRODUCED.find((i) => i.wave === s.level && i.wave > 1);
  return k ? k.kind : null;
}

/** What a caption under an enemy says, or nothing. */
export function captionOf(kind: EnemyKind): string {
  return kind in screenCopy.signalTags ? screenCopy.signalTags[kind as keyof typeof screenCopy.signalTags] : "";
}

function pips(pen: Pen, e: Enemy, r: number) {
  const { c, p } = pen;
  const max = KINDS[e.kind].hp;
  if (max <= 1) return;
  if (e.kind === "tank") {
    for (let i = 0; i < max; i++) {
      const a = -Math.PI / 2 + (i / max) * Math.PI * 2;
      circle(c, e.x + Math.cos(a) * (r + 8), e.y + Math.sin(a) * (r + 8), 2.5, i < e.hp ? p.accentBright : p.dim, i < e.hp);
    }
    return;
  }
  for (let i = 0; i < max; i++) circle(c, e.x - (max - 1) * 4.5 + i * 9, e.y + r + 9, 2.5, i < e.hp ? p.accentBright : p.dim, i < e.hp);
}

function chevron(pen: Pen, x: number, y: number, r: number, a: number, colour: string, glow?: string, fill?: string) {
  const { c } = pen;
  const pt = (ang: number, rr: number) => ({ x: x + Math.cos(a + ang) * rr, y: y + Math.sin(a + ang) * rr });
  const tip = pt(0, r), left = pt(2.5, r), notch = pt(Math.PI, r * 0.35), right = pt(-2.5, r);
  c.beginPath();
  c.moveTo(tip.x, tip.y);
  c.lineTo(left.x, left.y);
  c.lineTo(notch.x, notch.y);
  c.lineTo(right.x, right.y);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
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

/** A dashed line from `a` along the unit vector `u` for `length`, blinking by `on`. */
function dashes(pen: Pen, a: Point, u: Point, length: number, colour: string, offset: number) {
  const { c } = pen;
  for (let d = offset % 22; d < length; d += 22) {
    const from = { x: a.x + u.x * d, y: a.y + u.y * d }, to = { x: a.x + u.x * Math.min(length, d + 12), y: a.y + u.y * Math.min(length, d + 12) };
    line(c, from, to, colour, 2);
  }
}

function drawEnemy(pen: Pen, s: SignalState, e: Enemy) {
  const { c, p } = pen;
  const r = KINDS[e.kind].radius;
  const hit = e.hit > 0;
  const stunned = e.stun > 0;
  const colour = hit ? p.bright : stunned ? p.dim : p.accent;
  const glow = hit ? p.brightGlow : stunned ? undefined : p.accentGlow;
  const fill = hit ? p.accentFill : undefined;
  const toPlayer = Math.atan2(s.player.y - e.y, s.player.x - e.x);
  switch (e.kind) {
    case "drifter":
      polygon(c, e.x, e.y, r, 3, s.time * 1.6 + e.id, colour, glow, fill);
      break;
    case "shard":
      polygon(c, e.x, e.y, r, 3, -s.time * 6 + e.id, hit ? p.bright : p.accentBright, glow, fill);
      break;
    case "shooter": {
      polygon(c, e.x, e.y, r, 4, toPlayer + Math.PI / 4, colour, glow, fill);
      line(c, e, { x: e.x + Math.cos(toPlayer) * (r + 9), y: e.y + Math.sin(toPlayer) * (r + 9) }, colour, 3);
      if (e.mode === "windup" && !stunned) {
        // A ring closing on it as the shot comes, and a faint line to where it is aiming.
        const k = Math.max(0, Math.min(1, e.cooldown / 0.6));
        circle(c, e.x, e.y, r + 4 + k * 18, p.accentBright, false, p.accentGlow);
        c.globalAlpha = 0.5;
        line(c, e, s.player, p.accentSoft, 1);
        c.globalAlpha = 1;
      }
      break;
    }
    case "charger": {
      const shake = e.mode === "windup" ? Math.sin(s.time * 70) * 2.5 : 0;
      const heading = e.mode === "chase" ? toPlayer : Math.atan2(e.vy, e.vx);
      if (e.mode === "windup" && !stunned) {
        // The line it will dash along, blinking, so the player can step off it.
        const on = (s.time * 8) % 1 < 0.6;
        dashes(pen, e, { x: e.vx, y: e.vy }, 280, on ? p.accentBright : p.accent, -s.time * 90);
      }
      if (e.mode === "dash") line(c, e, { x: e.x - e.vx * 46, y: e.y - e.vy * 46 }, p.accentBright, 4, p.accentGlow);
      chevron(pen, e.x + shake, e.y, r + 2, heading, e.mode === "recover" ? p.dim : colour, e.mode === "recover" ? undefined : glow, fill);
      break;
    }
    case "splitter": {
      const a = s.time * 0.8 + e.id;
      polygon(c, e.x, e.y, r, 6, a, colour, glow, fill);
      line(c, { x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r }, { x: e.x - Math.cos(a) * r, y: e.y - Math.sin(a) * r }, colour, 1.5);
      break;
    }
    case "tank":
      polygon(c, e.x, e.y, r, 8, s.time * 0.3, colour, glow, fill ?? p.accentSoft);
      polygon(c, e.x, e.y, r - 7, 8, s.time * 0.3, colour);
      break;
  }
  pips(pen, e, r);
}

/** Dead Signal's world. `hud` off (an attract screen) keeps the play and drops the small print. */
export function drawSignal(pen: Pen, s: SignalState, hud: boolean, layout: StageKind = "wide") {
  const { c, p } = pen;
  const sz = SIZES[layout];

  // The pulse's reach, when it is charged and would catch several things: the cue to press it.
  if (hud && s.charge >= PULSE_COST && s.phase <= 0) {
    const inside = s.enemies.filter((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < PULSE_RANGE).length;
    if (inside >= 3) {
      c.globalAlpha = 0.5 + 0.3 * Math.sin(s.time * 8);
      circle(c, s.player.x, s.player.y, PULSE_RANGE, p.inkSoft, false);
      c.globalAlpha = 1;
    }
  }

  for (const e of s.enemies) drawEnemy(pen, s, e);

  for (const shot of s.shots) {
    const v = Math.hypot(shot.vx, shot.vy) || 1;
    line(c, shot, { x: shot.x - (shot.vx / v) * 14, y: shot.y - (shot.vy / v) * 14 }, p.accent, 2);
    circle(c, shot.x, shot.y, 5, p.accentBright, true, p.accentGlow);
  }

  for (const b of s.bullets) line(c, b, { x: b.x - b.vx * 0.018, y: b.y - b.vy * 0.018 }, p.bright, 3, p.brightGlow);

  // The last live pixel: blinking while it has grace after a hit.
  c.globalAlpha = s.invincible > 0 ? 0.5 + Math.sin(s.time * 30) * 0.3 : 1;
  polygon(c, s.player.x, s.player.y, 15, 4, Math.PI / 4, p.bright, p.brightGlow);
  circle(c, s.player.x, s.player.y, 4, p.bright, true);
  c.globalAlpha = 1;
  // The beam's ring: lit while moving, dark while still.
  circle(c, s.player.x, s.player.y, 23, s.moving ? p.ink : p.dim, false, s.moving ? p.inkGlow : undefined);

  if (s.phase > 0) {
    circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 340, p.bright, false, p.brightGlow);
    circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 250, p.accent, false, p.accentGlow);
  }

  if (hud) {
    const intro = captionedKind(s);
    if (intro) {
      const words = captionOf(intro);
      // Over the enemy, clear of a tank's ring of pips.
      const lift = KINDS[intro].radius + (intro === "tank" ? 18 : 10);
      for (const e of s.enemies) if (e.kind === intro && e.stun <= 0) text(pen, words, e.x, e.y - lift, sz.caption, p.accentBright, "center");
    }
    for (const pop of s.pops) {
      c.globalAlpha = Math.min(1, pop.life * 2.5);
      glowText(pen, `+${pop.value}`, pop.x, pop.y, sz.pop, p.bright, p.brightGlow);
      c.globalAlpha = 1;
    }
    if (s.still >= HINT_AFTER || s.blocked) {
      // Always legible, never blinked off: it breathes instead.
      const below = s.player.y + 44 + sz.hint * 0.7 < 556;
      c.globalAlpha = 0.75 + 0.25 * Math.sin(s.time * 7);
      glowText(pen, screenCopy.signalHint, s.player.x, below ? s.player.y + 44 + sz.hint * 0.7 : s.player.y - 40, sz.hint, p.bright, p.brightGlow);
      c.globalAlpha = 1;
    }
    if (s.combo > 0) {
      const mult = multiplier(s);
      text(pen, `${screenCopy.signalChain} ${s.combo}${mult > 1 ? `  x${mult}` : ""}`, 450, 552, sz.chain, mult > 1 ? p.bright : p.ink, "center");
    }
  }
}
