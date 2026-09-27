import { banner, baseState, clamp, distance, emit, rand, sound, type BaseState, type GameModule, type Point } from "./types";

/**
 * DEAD SIGNAL: arena survival. The beam aims itself at the nearest threat; the
 * player keeps the last live pixel alive and spends a charged pulse when the
 * swarm closes in.
 *
 * Moved out of the monolithic engine on 2026-09-27 with every rule and every
 * number as it was, down to the order the dice are rolled in. It is known to
 * be too forgiving (an idle player survives ten minutes); rebalancing it is a
 * separate piece of work, and this file is where it will happen.
 */

export type Enemy = Point & { hp: number; kind: number; cooldown: number };
export type Bullet = Point & { vx: number; vy: number; life: number };

export type SignalState = BaseState & {
  id: "signal";
  /** The wave: one more every twenty seconds. */
  level: number;
  lives: number;
  combo: number;
  /** Pulse charge, 0 to 100. A pulse costs 65. */
  charge: number;
  /** Seconds left on the pulse's expanding ring, for the renderer. */
  phase: number;
  player: Point;
  enemies: Enemy[];
  bullets: Bullet[];
  spawnClock: number;
  shotClock: number;
  invincible: number;
};

export const SIGNAL_HULL = 3;
export const PULSE_COST = 65;
const PULSE_RANGE = 185;

const wave = (n: number) => `WAVE ${String(n).padStart(2, "0")}`;

function hurt(s: SignalState, at: Point) {
  s.lives--; s.combo = 0; s.flash = 0.35; sound(s, "hurt", at);
  if (s.lives <= 0) s.over = true;
}

export const signal: GameModule<SignalState> = {
  id: "signal",
  input: "keys",

  create(seed) {
    const s: SignalState = {
      ...baseState("signal", seed),
      level: 1, lives: SIGNAL_HULL, combo: 0, charge: 100, phase: 0,
      player: { x: 450, y: 280 }, enemies: [], bullets: [], spawnClock: 0, shotClock: 0, invincible: 0,
    };
    banner(s, wave(1), "STAY ALIVE");
    return s;
  },

  step(s, dt, keys) {
    s.phase = Math.max(0, s.phase - dt);
    s.invincible = Math.max(0, s.invincible - dt);
    let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0), dy = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
    const norm = Math.hypot(dx, dy) || 1; dx /= norm; dy /= norm;
    s.player.x = clamp(s.player.x + dx * 235 * dt, 22, 878); s.player.y = clamp(s.player.y + dy * 235 * dt, 49, 530);
    const level = 1 + Math.floor(s.time / 20);
    if (level !== s.level) { s.level = level; banner(s, wave(level), "THE NOISE THICKENS"); }
    s.spawnClock -= dt; s.shotClock -= dt;
    if (s.spawnClock <= 0 && s.enemies.length < 60) {
      const side = Math.floor(rand(s) * 4), t = rand(s);
      s.enemies.push({ x: side === 0 ? -15 : side === 1 ? 915 : t * 900, y: side === 2 ? 20 : side === 3 ? 580 : 40 + t * 500, hp: s.level > 3 ? 2 : 1, kind: Math.floor(rand(s) * 3), cooldown: 0 });
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
  },

  press(s, key) {
    if (key !== "action" || s.charge < PULSE_COST) return;
    s.charge -= PULSE_COST; s.phase = 0.55; s.invincible = Math.max(0.8, s.invincible);
    s.enemies = s.enemies.filter(e => { if (distance(e, s.player) > PULSE_RANGE) return true; s.score += 25; emit(s, e, true, 8); return false; });
    sound(s, "start", s.player);
  },

  hud(s) {
    return {
      lives: { current: Math.max(0, s.lives), max: SIGNAL_HULL, icon: "hull" },
      stage: { label: "WAVE", value: s.level },
      meter: { label: "PULSE", value: s.charge / 100, ready: PULSE_COST / 100 },
    };
  },

  /** Flee the swarm, drift home to the centre, wobble a little, and pulse when crowded. */
  demo(s, m) {
    const hold = new Set<string>(), press: string[] = [];
    let fx = (450 - s.player.x) * 0.6, fy = (280 - s.player.y) * 0.6;
    for (const e of s.enemies) {
      const dx = s.player.x - e.x, dy = s.player.y - e.y;
      const d2 = Math.max(400, dx * dx + dy * dy);
      fx += (dx / d2) * 90000;
      fy += (dy / d2) * 90000;
    }
    fx += Math.sin(s.time * 3.1) * 40;
    fy += Math.cos(s.time * 2.3) * 40;
    if (fx > 25) hold.add("right");
    else if (fx < -25) hold.add("left");
    if (fy > 25) hold.add("down");
    else if (fy < -25) hold.add("up");
    const close = s.enemies.filter((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < 150).length;
    if (close >= 4 && s.charge >= PULSE_COST && s.time - m.lastAct > 1) {
      press.push("action");
      m.lastAct = s.time;
    }
    return { hold, press };
  },
};
