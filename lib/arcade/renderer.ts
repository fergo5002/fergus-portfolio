import type { GameState, Point } from "./engine";
import { WORLD } from "./engine";
import { HAND_NAMES, HAND_POINTS } from "./poker-rules";

const G = "#a2ffa2", DIM = "#32754b", A = "#ffc478", BG = "#06100c";
const suits = ["♠", "♥", "♣", "♦"];
function line(c: CanvasRenderingContext2D, a: Point, b: Point, colour = G, width = 2) {
  c.strokeStyle = colour; c.lineWidth = width; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, colour = G, fill = false) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.strokeStyle = colour; c.fillStyle = colour; if (fill) c.fill(); else c.stroke();
}
function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size = 14, colour = G, align: CanvasTextAlign = "left") {
  c.font = `${size >= 25 ? "bold " : ""}${size}px ui-monospace, SFMono-Regular, Consolas, monospace`; c.fillStyle = colour; c.textAlign = align; c.fillText(value, x, y);
}
function polygon(c: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, a: number, colour: string) {
  c.strokeStyle = colour; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i <= sides; i++) { const theta = a + i / sides * Math.PI * 2; const px = x + Math.cos(theta) * r, py = y + Math.sin(theta) * r; if (!i) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke();
}
function grid(c: CanvasRenderingContext2D) {
  c.strokeStyle = "#12251b"; c.lineWidth = 1;
  c.beginPath(); for (let x = 0; x < WORLD.w; x += 30) { c.moveTo(x, 32); c.lineTo(x, WORLD.h); }
  for (let y = 32; y < WORLD.h; y += 30) { c.moveTo(0, y); c.lineTo(WORLD.w, y); } c.stroke();
  line(c, { x: 12, y: 32 }, { x: 888, y: 32 }, DIM, 1);
}
export function renderGame(c: CanvasRenderingContext2D, s: GameState, width: number, height: number, compact = false) {
  c.save(); c.setTransform(width / WORLD.w, 0, 0, height / WORLD.h, 0, 0);
  c.fillStyle = BG; c.fillRect(0, 0, WORLD.w, WORLD.h); grid(c);
  c.lineWidth = 2; c.lineJoin = "round";
  text(c, `SCORE ${String(s.score).padStart(6, "0")}`, 18, 22, 14);
  text(c, s.id === "poker" ? `CIRCUIT ${String(s.level).padStart(2, "0")}` : s.id === "snake" ? `LENGTH ${s.snake.length}` : `SECTOR ${String(s.level).padStart(2, "0")}`, 450, 22, 14, A, "center");
  text(c, s.id === "pong" ? `FIRST TO 7` : s.id === "poker" ? `${s.hands} HANDS LEFT` : s.id === "snake" ? `PHASE ${Math.floor(s.charge)}%` : `HULL ${"◆".repeat(Math.max(0, s.lives))}`, 882, 22, 14, G, "right");
  if (s.id === "bounce" || s.id === "pong") {
    s.trail.forEach((p, i) => { c.globalAlpha = (1 - i / 20) * 0.3; circle(c, p.x, p.y, Math.max(1, 7 - i * 0.25), G, true); }); c.globalAlpha = 1;
    circle(c, s.ball.x, s.ball.y, 7, "#e4ffe4", true); circle(c, s.ball.x, s.ball.y, 11, DIM);
  }
  if (s.id === "bounce") {
    for (const brick of s.bricks) {
      if (!brick.hp) continue; c.fillStyle = brick.maxHp > 1 ? "#332716" : "#163a25"; c.fillRect(brick.x, brick.y, 62, 22);
      c.strokeStyle = brick.hp > 1 ? A : G; c.strokeRect(brick.x + 0.5, brick.y + 0.5, 62, 22);
      if (brick.hp > 1) line(c, { x: brick.x + 10, y: brick.y + 11 }, { x: brick.x + 52, y: brick.y + 11 }, A, 1);
    }
    c.fillStyle = G; c.fillRect(s.player.x - 59, s.player.y - 6, 118, 12);
    c.strokeStyle = DIM; c.strokeRect(s.player.x - 65, s.player.y - 12, 130, 24);
    if (s.ball.attached) { circle(c, s.player.x, s.player.y - 16, 24, DIM); text(c, "LAUNCH THE SIGNAL", 450, 347, 23, G, "center"); text(c, "SPACE / ACTION", 450, 376, 14, A, "center"); }
    if (s.combo >= 8) text(c, `×${Math.min(5, 1 + Math.floor(s.combo / 8))} CHAIN`, 450, 53, 14, A, "center");
  }
  if (s.id === "pong") {
    const y = 280 + Math.sin(s.time * 0.7) * 130;
    for (let i = 0; i < 5; i++) { c.globalAlpha = 0.25 + i * 0.08; c.beginPath(); c.ellipse(450, y, 20 + i * 15, 12 + i * 11, s.time * 0.4 + i * 0.5, 0, Math.PI * 2); c.strokeStyle = i % 2 ? DIM : A; c.stroke(); } c.globalAlpha = 1;
    circle(c, 450, y, 12, BG, true); circle(c, 450, y, 12, A);
    for (const [i, p] of [s.player, s.rival].entries()) {
      c.fillStyle = i ? A : G; c.fillRect(p.x - 5, p.y - 49, 10, 98);
      if (i === 0 ? s.phase > 0 : s.phase2 > 0) { c.strokeStyle = i ? A : G; c.strokeRect(p.x - 13, p.y - 57, 26, 114); }
    }
    text(c, String(s.points[0]).padStart(2, "0"), 330, 111, 64, G, "center"); text(c, String(s.points[1]).padStart(2, "0"), 570, 111, 64, A, "center");
    if (s.serve > 0) text(c, "GET READY", 450, 470, 20, G, "center");
    if (s.rally > 3) text(c, `${s.rally} HIT RALLY`, 450, 539, 13, A, "center");
  }
  if (s.id === "snake") {
    const cell = 29, ox = 15, oy = 49;
    c.strokeStyle = DIM; c.strokeRect(ox - 2, oy - 2, 874, 468);
    for (const [i, tail] of [s.snake, s.snake2].entries()) {
      const phase = i ? s.phase2 : s.phase;
      tail.forEach((p, j) => {
        c.globalAlpha = phase > 0 ? 0.5 : 0.45 + 0.55 * (1 - j / tail.length);
        c.fillStyle = i ? A : G; c.fillRect(ox + p.x * cell + 3, oy + p.y * cell + 3, cell - 6, cell - 6);
        if (!j) { c.strokeStyle = "#efffef"; c.strokeRect(ox + p.x * cell + 1, oy + p.y * cell + 1, cell - 2, cell - 2); }
      }); c.globalAlpha = 1;
      if (phase > 0) text(c, i ? "AMBER IS PHASING" : "GREEN IS PHASING", i ? 880 : 20, 542, 13, i ? A : G, i ? "right" : "left");
    }
    polygon(c, ox + s.food.x * cell + 14, oy + s.food.y * cell + 14, 11, 4, s.time, A);
    circle(c, ox + s.food.x * cell + 14, oy + s.food.y * cell + 14, 3, A, true);
    if (s.serve > 0) {
      c.fillStyle = "#06100cee"; c.fillRect(225, 235, 450, 90);
      text(c, `READY ${Math.ceil(s.serve)}`, 450, 273, 30, G, "center");
      text(c, "CHOOSE YOUR DIRECTION", 450, 303, 14, A, "center");
    }
  }
  if (s.id === "under") {
    const cell = 29, ox = 29, oy = 43;
    c.save();
    if (compact) {
      c.beginPath(); c.rect(0, 33, 900, 505); c.clip();
      const px = ox + s.player.x * cell + cell / 2, py = oy + s.player.y * cell + cell / 2;
      c.translate(-Math.min(900, Math.max(0, px * 2 - 450)), -Math.min(550, Math.max(33, py * 2 - 280))); c.scale(2, 2);
    }
    for (let y = 0; y < s.map.length; y++) for (let x = 0; x < s.map[y].length; x++) {
      if (!s.seen[y][x]) { c.fillStyle = "#020604"; c.fillRect(ox + x * cell, oy + y * cell, cell, cell); continue; }
      const dist = Math.hypot(x - s.player.x, y - s.player.y); c.globalAlpha = dist > 5 ? 0.3 : 1;
      if (s.map[y][x]) { c.fillStyle = "#143221"; c.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2); c.strokeStyle = DIM; c.strokeRect(ox + x * cell + 4, oy + y * cell + 4, cell - 8, cell - 8); }
      else { c.fillStyle = "#0a1910"; c.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
    } c.globalAlpha = 1;
    const at = (p: Point) => ({ x: ox + p.x * cell + cell / 2, y: oy + p.y * cell + cell / 2 });
    const exit = at(s.exit);
    if (s.seen[s.exit.y][s.exit.x]) { c.strokeStyle = s.hasKey ? A : DIM; c.strokeRect(exit.x - 11, exit.y - 11, 22, 22); text(c, "»", exit.x, exit.y + 7, 22, s.hasKey ? A : G, "center"); }
    if (!s.hasKey && s.seen[s.food.y][s.food.x]) { const p = at(s.food); circle(c, p.x - 4, p.y - 2, 5, A); line(c, { x: p.x, y: p.y }, { x: p.x + 9, y: p.y + 7 }, A); }
    for (const h of s.hearts) if (s.seen[h.y][h.x]) { const p = at(h); text(c, "+", p.x, p.y + 8, 25, G, "center"); }
    for (const e of s.enemies) if (Math.hypot(e.x - s.player.x, e.y - s.player.y) <= 5) { const p = at(e); polygon(c, p.x, p.y, 10, e.kind === 1 ? 4 : 3, -Math.PI / 2, A); if (e.hp > 1) circle(c, p.x, p.y, 3, A, true); }
    const p = at(s.player); circle(c, p.x, p.y, 10, G); text(c, "@", p.x, p.y + 6, 18, "#e9ffe9", "center");
    if (s.phase > 0) circle(c, p.x, p.y, (0.5 - s.phase) * 180, G);
    c.restore();
    text(c, `${s.hasKey ? "KEY SECURED" : "FIND KEY"}  /  TURN ${s.turn}`, 880, 548, 12, A, "right");
  }
  if (s.id === "signal") {
    for (const e of s.enemies) { polygon(c, e.x, e.y, e.kind === 2 ? 16 : 12, 3 + e.kind, s.time * (e.kind === 1 ? -1 : 1), A); if (e.hp > 1) circle(c, e.x, e.y, 4, A); }
    for (const b of s.bullets) line(c, b, { x: b.x - b.vx * 0.018, y: b.y - b.vy * 0.018 }, G, 3);
    c.globalAlpha = s.invincible > 0 ? 0.5 + Math.sin(s.time * 30) * 0.3 : 1;
    polygon(c, s.player.x, s.player.y, 15, 4, Math.PI / 4, G); circle(c, s.player.x, s.player.y, 4, G, true); c.globalAlpha = 1;
    circle(c, s.player.x, s.player.y, 23, DIM);
    if (s.phase > 0) { circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 340, G); circle(c, s.player.x, s.player.y, (0.55 - s.phase) * 250, A); }
    text(c, `${Math.floor(s.time)}s  /  CHAIN ${s.combo}`, 450, 547, 14, G, "center");
  }
  if (s.id === "poker") {
    const progress = Math.min(1, s.bank / s.target);
    text(c, `${s.bank} / ${s.target}`, 450, 96, 37, G, "center");
    text(c, "CIRCUIT TARGET", 450, 59, 12, A, "center");
    c.fillStyle = "#173c27"; c.fillRect(185, 118, 530, 5); c.fillStyle = G; c.fillRect(185, 118, 530 * progress, 5);
    s.cards.forEach((card, i) => {
      const x = 118 + i * 137, y = s.held[i] ? 172 : 184, rank = card % 13 + 2, suit = Math.floor(card / 13), colour = suit % 2 ? A : G;
      c.fillStyle = s.held[i] ? "#173924" : "#0b1b12"; c.fillRect(x, y, 116, 167); c.strokeStyle = s.held[i] ? G : DIM; c.strokeRect(x, y, 116, 167);
      const r = rank < 11 ? String(rank) : ["J", "Q", "K", "A"][rank - 11];
      text(c, r, x + 13, y + 32, 25, colour); text(c, suits[suit], x + 58, y + 101, 48, colour, "center");
      text(c, s.held[i] ? "HELD" : `[${i + 1}]`, x + 58, y + 149, 14, s.held[i] ? G : "#7fb28b", "center");
    });
    text(c, s.handName, 450, 399, 25, G, "center"); text(c, `BANK ${s.handPoints} POINTS  /  ${s.redraws} REDRAWS`, 450, 427, 14, A, "center");
    HAND_NAMES.forEach((name, i) => { const x = i < 5 ? 32 : 488, y = 468 + (i < 5 ? i : i - 5) * 17; text(c, `${name.padEnd(19)} ${String(HAND_POINTS[i]).padStart(4)}`, x, y, 11, "#84b88e"); });
  }
  for (const p of s.particles) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = p.amber ? A : G; c.fillRect(p.x, p.y, 3, 3); } c.globalAlpha = 1;
  if (s.messageTime > 0 && s.id !== "under") {
    c.fillStyle = "#06100ce8"; c.fillRect(170, 277, 560, 42); text(c, s.message, 450, 304, 16, A, "center");
  }
  // A dim frame, never a full-screen white flash.
  if (s.flash > 0) { c.strokeStyle = A; c.lineWidth = 3; c.globalAlpha = s.flash; c.strokeRect(3, 35, 894, 522); c.globalAlpha = 1; }
  c.restore();
}
