import { evaluateHand } from "./poker-rules";

/** Deterministic arcade simulation. No DOM, timers, persistence or network. */
export const WORLD = { w: 900, h: 560 } as const;
export const GAME_IDS = ["signal", "poker"] as const;
export type GameId = typeof GAME_IDS[number];
export type Point = { x: number; y: number };
export type Particle = Point & { vx: number; vy: number; life: number; amber: boolean };
export type Enemy = Point & { hp: number; kind: number; cooldown: number };
export type GameState = {
  id: GameId; seed: number; time: number; score: number; over: boolean; won: boolean;
  level: number; lives: number; combo: number; charge: number; flash: number; event: number; sound: "hit" | "score" | "hurt" | "start";
  player: Point; particles: Particle[]; phase: number;
  enemies: Enemy[];
  bullets: (Point & { vx: number; vy: number; life: number })[]; spawnClock: number; shotClock: number; invincible: number;
  cards: number[]; deck: number[]; discarded: number[]; held: boolean[]; redraws: number; hands: number; target: number;
  bank: number; handName: string; handPoints: number; message: string; messageTime: number;
  /** Where the last sound event happened, in world pixels, so the tube can be lit there. */
  eventAt: Point;
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function random(s: GameState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
function emit(s: GameState, at: Point, amber = false, count = 16) {
  for (let i = 0; i < count && s.particles.length < 180; i++) {
    const a = random(s) * Math.PI * 2, v = 30 + random(s) * 170;
    s.particles.push({ ...at, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + random(s) * 0.5, amber });
  }
}
function sound(s: GameState, name: GameState["sound"], at?: Point) { s.event++; s.sound = name; if (at) s.eventAt = { x: at.x, y: at.y }; }
function message(s: GameState, text: string, seconds = 2) { s.message = text; s.messageTime = seconds; }
function hurt(s: GameState, at?: Point) { s.lives--; s.combo = 0; s.flash = 0.35; sound(s, "hurt", at); if (s.lives <= 0) s.over = true; }
function deal(s: GameState) {
  s.deck = Array.from({ length: 52 }, (_, i) => i); s.discarded = [];
  for (let i = 51; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]]; }
  s.cards = s.deck.splice(0, 5); s.held = [false, false, false, false, false]; s.redraws = 2;
  const hand = evaluateHand(s.cards); s.handName = hand.name; s.handPoints = hand.points;
}
export function createGame(id: GameId, seed: number): GameState {
  const s: GameState = {
    id, seed: seed >>> 0, time: 0, score: 0, over: false, won: false,
    level: 1, lives: 3, combo: 0, charge: 100, flash: 0, event: 0, sound: "start",
    player: { x: 450, y: 280 }, particles: [], phase: 0,
    enemies: [], bullets: [], spawnClock: 0, shotClock: 0, invincible: 0,
    cards: [], deck: [], discarded: [], held: [], redraws: 2, hands: 3, target: 180, bank: 0, handName: "", handPoints: 0, message: "", messageTime: 0,
    eventAt: { x: 450, y: 280 },
  };
  if (id === "poker") deal(s);
  return s;
}

function survival(s: GameState, dt: number, keys: ReadonlySet<string>) {
  let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0), dy = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
  const norm = Math.hypot(dx, dy) || 1; dx /= norm; dy /= norm;
  s.player.x = clamp(s.player.x + dx * 235 * dt, 22, 878); s.player.y = clamp(s.player.y + dy * 235 * dt, 49, 530);
  s.level = 1 + Math.floor(s.time / 20); s.spawnClock -= dt; s.shotClock -= dt;
  if (s.spawnClock <= 0 && s.enemies.length < 60) {
    const side = Math.floor(random(s) * 4), t = random(s);
    s.enemies.push({ x: side === 0 ? -15 : side === 1 ? 915 : t * 900, y: side === 2 ? 20 : side === 3 ? 580 : 40 + t * 500, hp: s.level > 3 ? 2 : 1, kind: Math.floor(random(s) * 3), cooldown: 0 });
    s.spawnClock = Math.max(0.19, 0.95 - s.level * 0.11);
  }
  if (s.shotClock <= 0 && s.enemies.length) {
    const target = s.enemies.reduce((a, b) => distance(a, s.player) < distance(b, s.player) ? a : b);
    const d = distance(target, s.player) || 1, a = Math.atan2(target.y - s.player.y, target.x - s.player.x);
    s.bullets.push({ ...s.player, vx: (target.x - s.player.x) / d * 580, vy: (target.y - s.player.y) / d * 580, life: 1.6 });
    if (s.level >= 4) for (const da of [-0.17, 0.17]) s.bullets.push({ ...s.player, vx: Math.cos(a + da) * 580, vy: Math.sin(a + da) * 580, life: 1.6 });
    s.shotClock = Math.max(0.12, 0.32 - s.level * 0.02);
  }
  for (const e of s.enemies) {
    const d = distance(e, s.player) || 1, speed = 55 + s.level * 7 + e.kind * 15;
    e.x += (s.player.x - e.x) / d * speed * dt; e.y += (s.player.y - e.y) / d * speed * dt;
    if (d < 22 && s.invincible <= 0) { hurt(s, s.player); s.invincible = 1.7; emit(s, s.player, true, 30); e.hp = 0; }
  }
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const hit = s.enemies.find(e => e.hp > 0 && distance(e, b) < 18);
    if (hit) { hit.hp--; b.life = 0; if (hit.hp <= 0) { s.score += 25 * Math.min(4, 1 + Math.floor(s.combo / 15)); s.combo++; s.charge = Math.min(100, s.charge + 2); emit(s, hit, true, 10); sound(s, "score", hit); } }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0); s.bullets = s.bullets.filter(b => b.life > 0);
  s.charge = Math.min(100, s.charge + dt * 4);
}
export function pressGame(s: GameState, key: string) {
  if (s.over) return;
  if (s.id === "signal" && key === "action" && s.charge >= 65) {
    s.charge -= 65; s.phase = 0.55; s.invincible = Math.max(0.8, s.invincible);
    s.enemies = s.enemies.filter(e => { if (distance(e, s.player) > 185) return true; s.score += 25; emit(s, e, true, 8); return false; }); sound(s, "start", s.player);
  }
  if (s.id === "poker") {
    if (/^[1-5]$/.test(key)) { const i = Number(key) - 1; s.held[i] = !s.held[i]; sound(s, "hit", { x: 176 + i * 137, y: 267 }); }
    if (key === "action" && s.redraws > 0) {
      s.cards = s.cards.map((c, i) => { if (s.held[i]) return c; s.discarded.push(c); return s.deck.shift()!; });
      s.redraws--; const hand = evaluateHand(s.cards); s.handName = hand.name; s.handPoints = hand.points; sound(s, "start", { x: 450, y: 267 });
    }
    if (key === "bank") {
      s.score += s.handPoints; s.bank += s.handPoints; s.hands--; sound(s, "score", { x: 450, y: 399 });
      if (s.bank >= s.target) { s.level++; s.score += 100 * (s.level - 1); s.target = Math.round(180 * 1.62 ** (s.level - 1)); s.bank = 0; s.hands = 3; message(s, "CIRCUIT COMPLETE // NEXT TARGET"); }
      else if (s.hands === 0) { s.over = true; return; }
      deal(s);
    }
  }
}
export function stepGame(s: GameState, delta: number, keys: ReadonlySet<string>) {
  if (s.over || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(0.05, delta); s.time += dt;
  s.phase = Math.max(0, s.phase - dt);
  s.flash = Math.max(0, s.flash - dt); s.invincible = Math.max(0, s.invincible - dt); s.messageTime = Math.max(0, s.messageTime - dt);
  for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
  s.particles = s.particles.filter(p => p.life > 0);
  if (s.id === "signal") survival(s, dt, keys);
}
