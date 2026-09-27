import type { SignalState } from "../games/signal";
import { circle, line, polygon, text, type Pen } from "./kit";

/** Dead Signal's world: the swarm, the beam, the last live pixel and its pulse. */
export function drawSignal(pen: Pen, s: SignalState, hud: boolean) {
  const { c, p } = pen;
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
  if (hud && s.combo > 0) text(pen, `CHAIN ${s.combo}`, 450, 547, 14, p.ink, "center");
}
